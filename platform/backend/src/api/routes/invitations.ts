/**
 * Invitation routes — invite links and direct invitations.
 *
 * Public (no auth):
 *   GET  /invite/:token — group preview for invite link
 *
 * Authenticated:
 *   POST /invite/:token/accept — accept an invite link
 *   GET  /me/invitations — list pending direct invitations for current user
 *   POST /me/invitations/:invId/accept — accept direct invitation
 *   POST /me/invitations/:invId/decline — decline direct invitation
 *
 * Admin (assembly-scoped):
 *   POST   /assemblies/:id/invitations — create invite
 *   GET    /assemblies/:id/invitations — list invitations
 *   DELETE /assemblies/:id/invitations/:invId — revoke invitation
 */

import { Hono } from "hono";
import type { InvitationService } from "../../services/invitation-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { VCPClient } from "../../services/vcp-client.js";
import type { UserService } from "../../services/user-service.js";
import type { InvitationNotifier } from "../../services/invitation-notifier.js";
import { getUser } from "../middleware/auth.js";
import { parseCsvInvites } from "../../lib/csv-parser.js";

export function invitationRoutes(
  invitationService: InvitationService,
  membershipService: MembershipService,
  assemblyCacheService: AssemblyCacheService,
  vcpClient: VCPClient,
  userService: UserService,
  invitationNotifier: InvitationNotifier | null = null,
) {
  const app = new Hono();

  // ── Public routes (no auth) ──────────────────────────────────────

  /** GET /invite/:token — group preview for an invite link. */
  app.get("/invite/:token", async (c) => {
    const token = c.req.param("token");
    const invitation = await invitationService.getByToken(token);

    if (!invitation || invitation.status !== "active") {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Invitation not found or no longer active" } },
        404,
      );
    }

    // Check expiration
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return c.json(
        { error: { code: "EXPIRED", message: "This invitation has expired" } },
        410,
      );
    }

    // Get assembly info for the preview
    const assembly = await assemblyCacheService.get(invitation.assemblyId);
    if (!assembly) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Group not found" } },
        404,
      );
    }

    // Get roles for leadership display
    let owners: Array<{ name: string | null; participantId: string }> = [];
    let admins: Array<{ name: string | null; participantId: string }> = [];
    try {
      const roles = await vcpClient.listRoles(invitation.assemblyId);
      const participantIds = roles.map((r) => r.participantId);
      const names = await membershipService.getParticipantNames(invitation.assemblyId, participantIds);

      owners = roles
        .filter((r) => r.role === "owner")
        .map((r) => ({ participantId: r.participantId, name: names.get(r.participantId) ?? null }));
      admins = roles
        .filter((r) => r.role === "admin" && !owners.some((o) => o.participantId === r.participantId))
        .map((r) => ({ participantId: r.participantId, name: names.get(r.participantId) ?? null }));
    } catch {
      // Roles unavailable — show preview without leadership
    }

    const memberCount = await membershipService.getAssemblyMemberCount(invitation.assemblyId);

    return c.json({
      invitation: {
        id: invitation.id,
        type: invitation.type,
        assemblyId: invitation.assemblyId,
      },
      group: {
        id: assembly.id,
        name: assembly.name,
        config: assembly.config,
        owners,
        admins,
        memberCount,
      },
    });
  });

  /** POST /invite/:token/accept — accept an invite link (auth required). */
  app.post("/invite/:token/accept", async (c) => {
    const { id, name } = getUser(c);
    const token = c.req.param("token");
    const invitation = await invitationService.getByToken(token);

    if (!invitation) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Invitation not found" } },
        404,
      );
    }

    const result = await invitationService.accept(invitation, id, name);
    return c.json({ status: "joined", assemblyId: result.assemblyId }, 201);
  });

  // ── Admin routes (assembly-scoped) ───────────────────────────────

  /** POST /assemblies/:id/invitations — create an invitation. */
  app.post("/assemblies/:id/invitations", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");

    // Check admin role via VCP
    const participantId = await membershipService.getParticipantIdOrThrow(userId, assemblyId);
    let isAdmin = false;
    try {
      const roles = await vcpClient.listRoles(assemblyId);
      isAdmin = roles.some((r) => r.participantId === participantId && (r.role === "admin" || r.role === "owner"));
    } catch {
      // VCP unavailable
    }
    if (!isAdmin) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Only admins can create invitations" } },
        403,
      );
    }

    const body = await c.req.json<{
      type?: "link" | "direct";
      maxUses?: number;
      expiresAt?: string;
      inviteeHandle?: string;
    }>();

    const type = body.type ?? "link";

    if (type === "direct") {
      if (!body.inviteeHandle) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "inviteeHandle is required for direct invitations" } },
          400,
        );
      }
      const invitation = await invitationService.createDirectInvite(assemblyId, userId, body.inviteeHandle);

      // Fire-and-forget email notification to the invitee
      if (invitationNotifier) {
        const { name: inviterName } = getUser(c);
        void invitationNotifier.sendInvitationEmail(body.inviteeHandle, assemblyId, inviterName);
      }

      return c.json(invitation, 201);
    }

    const invitation = await invitationService.createLinkInvite(assemblyId, userId, {
      maxUses: body.maxUses,
      expiresAt: body.expiresAt,
    });
    return c.json(invitation, 201);
  });

  /** GET /assemblies/:id/invitations — list invitations for assembly (admin). */
  app.get("/assemblies/:id/invitations", async (c) => {
    const assemblyId = c.req.param("id");
    const invitations = await invitationService.listByAssembly(assemblyId);
    return c.json({ invitations });
  });

  /** DELETE /assemblies/:id/invitations/:invId — revoke an invitation. */
  app.delete("/assemblies/:id/invitations/:invId", async (c) => {
    const invId = c.req.param("invId");
    await invitationService.revoke(invId);
    return c.json({ status: "revoked" });
  });

  /** POST /assemblies/:id/invitations/preview — preview a bulk CSV import (admin). */
  app.post("/assemblies/:id/invitations/preview", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");

    // Admin check
    const participantId = await membershipService.getParticipantIdOrThrow(userId, assemblyId);
    let isAdmin = false;
    try {
      const roles = await vcpClient.listRoles(assemblyId);
      isAdmin = roles.some((r) => r.participantId === participantId && (r.role === "admin" || r.role === "owner"));
    } catch { /* VCP unavailable */ }
    if (!isAdmin) {
      return c.json({ error: { code: "FORBIDDEN", message: "Only admins can preview bulk invitations" } }, 403);
    }

    const body = await c.req.json<{ csv: string }>();
    if (!body.csv || typeof body.csv !== "string") {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "csv field is required" } }, 400);
    }

    const { rows, errors } = parseCsvInvites(body.csv);

    // Look up each handle
    const valid: Array<{ handle: string; status: "found" | "not_found"; alreadyMember: boolean }> = [];
    for (const row of rows) {
      const handleUserId = await userService.getIdByHandle(row.handle);
      if (!handleUserId) {
        valid.push({ handle: row.handle, status: "not_found", alreadyMember: false });
        continue;
      }
      const pid = await membershipService.getParticipantId(handleUserId, assemblyId);
      valid.push({ handle: row.handle, status: "found", alreadyMember: !!pid });
    }

    const canInvite = valid.filter((v) => v.status === "found" && !v.alreadyMember).length;
    const alreadyMembers = valid.filter((v) => v.alreadyMember).length;
    const unknownHandles = valid.filter((v) => v.status === "not_found").length;

    return c.json({
      valid,
      errors,
      summary: {
        total: rows.length + errors.length,
        canInvite,
        alreadyMembers,
        unknownHandles,
        invalidRows: errors.length,
      },
    });
  });

  /** POST /assemblies/:id/invitations/bulk — create bulk direct invitations (admin). */
  app.post("/assemblies/:id/invitations/bulk", async (c) => {
    const { id: userId, name: inviterName } = getUser(c);
    const assemblyId = c.req.param("id");

    // Admin check
    const participantId = await membershipService.getParticipantIdOrThrow(userId, assemblyId);
    let isAdmin = false;
    try {
      const roles = await vcpClient.listRoles(assemblyId);
      isAdmin = roles.some((r) => r.participantId === participantId && (r.role === "admin" || r.role === "owner"));
    } catch { /* VCP unavailable */ }
    if (!isAdmin) {
      return c.json({ error: { code: "FORBIDDEN", message: "Only admins can create bulk invitations" } }, 403);
    }

    const body = await c.req.json<{ handles: string[] }>();
    if (!Array.isArray(body.handles) || body.handles.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "handles array is required" } }, 400);
    }

    const results: Array<{ handle: string; status: "created" | "skipped"; reason?: string }> = [];
    let created = 0;
    let skipped = 0;

    for (const handle of body.handles) {
      const normalized = handle.toLowerCase();

      // Check for existing active invitation to same handle
      const existing = await invitationService.listPendingForHandle(normalized);
      const hasPendingForAssembly = existing.some((inv) => inv.assemblyId === assemblyId);
      if (hasPendingForAssembly) {
        results.push({ handle: normalized, status: "skipped", reason: "Pending invitation already exists" });
        skipped++;
        continue;
      }

      await invitationService.createDirectInvite(assemblyId, userId, normalized);
      created++;
      results.push({ handle: normalized, status: "created" });

      // Fire-and-forget email notification
      if (invitationNotifier) {
        void invitationNotifier.sendInvitationEmail(normalized, assemblyId, inviterName);
      }
    }

    return c.json({ created, skipped, results }, 201);
  });

  // ── User routes (direct invitations) ─────────────────────────────

  /** GET /me/invitations — list pending direct invitations for current user. */
  app.get("/me/invitations", async (c) => {
    const { id: userId } = getUser(c);
    const user = await userService.getByIdOrThrow(userId);
    if (!user.handle) {
      return c.json({ invitations: [] });
    }

    const invitations = await invitationService.listPendingForHandle(user.handle);

    // Enrich with assembly names
    const enriched = await Promise.all(invitations.map(async (inv) => {
      const assembly = await assemblyCacheService.get(inv.assemblyId);
      return {
        ...inv,
        assemblyName: assembly?.name ?? null,
      };
    }));

    return c.json({ invitations: enriched });
  });

  /** POST /me/invitations/:invId/accept — accept a direct invitation. */
  app.post("/me/invitations/:invId/accept", async (c) => {
    const { id: userId, name } = getUser(c);
    const invId = c.req.param("invId");
    const invitation = await invitationService.getById(invId);

    if (!invitation) {
      return c.json({ error: { code: "NOT_FOUND", message: "Invitation not found" } }, 404);
    }

    const result = await invitationService.accept(invitation, userId, name);
    return c.json({ status: "joined", assemblyId: result.assemblyId }, 201);
  });

  /** POST /me/invitations/:invId/decline — decline a direct invitation. */
  app.post("/me/invitations/:invId/decline", async (c) => {
    const invId = c.req.param("invId");
    await invitationService.revoke(invId);
    return c.json({ status: "declined" });
  });

  return app;
}
