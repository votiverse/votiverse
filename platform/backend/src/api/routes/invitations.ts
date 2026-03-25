/**
 * Invitation and admission routes — invite links, direct invitations,
 * join requests, and assembly settings.
 *
 * Public (no auth):
 *   GET  /invite/:token — group preview for invite link
 *
 * Authenticated:
 *   POST /invite/:token/accept — accept an invite link (or create join request)
 *   GET  /me/invitations — list pending direct invitations for current user
 *   POST /me/invitations/:invId/accept — accept direct invitation
 *   POST /me/invitations/:invId/decline — decline direct invitation
 *   GET  /me/join-requests — list user's pending join requests
 *
 * Admin (assembly-scoped):
 *   GET    /assemblies/:id/settings — read assembly settings (admissionMode)
 *   PUT    /assemblies/:id/settings — update assembly settings
 *   POST   /assemblies/:id/invitations — create invite
 *   GET    /assemblies/:id/invitations — list invitations
 *   DELETE /assemblies/:id/invitations/:invId — revoke invitation
 *   POST   /assemblies/:id/invitations/preview — preview bulk CSV import
 *   POST   /assemblies/:id/invitations/bulk — create bulk invitations
 *   GET    /assemblies/:id/join-requests — list pending join requests
 *   POST   /assemblies/:id/join-requests/:reqId/approve — approve join request
 *   POST   /assemblies/:id/join-requests/:reqId/reject — reject join request
 */

import { Hono } from "hono";
import type { InvitationService } from "../../services/invitation-service.js";
import type { JoinRequestService } from "../../services/join-request-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { AdmissionMode, VoteCreation } from "../../services/assembly-cache.js";
import type { VCPClient } from "../../services/vcp-client.js";
import type { UserService } from "../../services/user-service.js";
import type { InvitationNotifier } from "../../services/invitation-notifier.js";
import type { NotificationHubService } from "../../services/notification-hub.js";
import { getUser } from "../middleware/auth.js";
import { parseCsvInvites } from "../../lib/csv-parser.js";
import { AssemblySettingsBody, BulkInviteBody, parseBody } from "../../lib/validation.js";
import { isAdminOf as isAdminOfShared } from "../../lib/admin-check.js";
import { NotFoundError, ForbiddenError, GoneError, ValidationError } from "../middleware/error-handler.js";

export function invitationRoutes(
  invitationService: InvitationService,
  joinRequestService: JoinRequestService,
  membershipService: MembershipService,
  assemblyCacheService: AssemblyCacheService,
  vcpClient: VCPClient,
  userService: UserService,
  invitationNotifier: InvitationNotifier | null = null,
  notificationHub: NotificationHubService | null = null,
) {
  const app = new Hono();

  const isAdminOf = (userId: string, assemblyId: string) =>
    isAdminOfShared(userId, assemblyId, membershipService, vcpClient);

  // ── Public routes (no auth) ──────────────────────────────────────

  /** GET /invite/:token — group preview for an invite link. */
  app.get("/invite/:token", async (c) => {
    const token = c.req.param("token");
    const invitation = await invitationService.getByToken(token);

    if (!invitation || invitation.status !== "active") {
      throw new NotFoundError("Invitation not found or no longer active");
    }

    // Check expiration
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      throw new GoneError("This invitation has expired");
    }

    // Get assembly info for the preview
    const assembly = await assemblyCacheService.get(invitation.assemblyId);
    if (!assembly) {
      throw new NotFoundError("Group not found");
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
        admissionMode: assembly.admissionMode,
        owners,
        admins,
        memberCount,
      },
    });
  });

  /** POST /invite/:token/accept — accept an invite link (auth required). */
  app.post("/invite/:token/accept", async (c) => {
    const { id: userId, name } = getUser(c);
    const token = c.req.param("token");
    const invitation = await invitationService.getByToken(token);

    if (!invitation) {
      throw new NotFoundError("Invitation not found");
    }

    // Check admission mode
    const assembly = await assemblyCacheService.get(invitation.assemblyId);
    const admissionMode = assembly?.admissionMode ?? "approval";

    if (admissionMode === "approval") {
      // Create a join request instead of instant join
      const user = await userService.getByIdOrThrow(userId);
      const joinRequest = await joinRequestService.create(
        invitation.assemblyId, userId, name, user.handle,
      );

      // Notify assembly admins of the new join request
      if (notificationHub) {
        const asmName = assembly?.name ?? "a group";
        void notificationHub.notifyAssemblyAdmins({
          assemblyId: invitation.assemblyId,
          type: "join_request",
          urgency: "action",
          title: `${name} wants to join ${asmName}`,
          actionUrl: `/assembly/${invitation.assemblyId}/members`,
        });
      }

      return c.json(
        { status: "pending", assemblyId: invitation.assemblyId, joinRequestId: joinRequest.id },
        202,
      );
    }

    // Open mode (or invite-only with existing link) — instant join
    const result = await invitationService.accept(invitation, userId, name);
    return c.json({ status: "joined", assemblyId: result.assemblyId }, 201);
  });

  // ── Assembly settings ────────────────────────────────────────────

  /** GET /assemblies/:id/settings — read assembly settings. */
  app.get("/assemblies/:id/settings", async (c) => {
    const assemblyId = c.req.param("id");
    const assembly = await assemblyCacheService.get(assemblyId);
    if (!assembly) {
      throw new NotFoundError("Assembly not found");
    }
    return c.json({ admissionMode: assembly.admissionMode, websiteUrl: assembly.websiteUrl, voteCreation: assembly.voteCreation });
  });

  /** PUT /assemblies/:id/settings — update assembly settings (admin only). */
  app.put("/assemblies/:id/settings", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can change settings");
    }

    const body = parseBody(AssemblySettingsBody, await c.req.json());
    if (body.admissionMode !== undefined) {
      await assemblyCacheService.updateAdmissionMode(assemblyId, body.admissionMode as AdmissionMode);
    }
    if (body.websiteUrl !== undefined) {
      await assemblyCacheService.updateWebsiteUrl(assemblyId, body.websiteUrl || null);
    }
    if (body.voteCreation !== undefined) {
      await assemblyCacheService.updateVoteCreation(assemblyId, body.voteCreation as VoteCreation);
    }
    const updated = await assemblyCacheService.get(assemblyId);
    return c.json({ admissionMode: updated!.admissionMode, websiteUrl: updated!.websiteUrl, voteCreation: updated!.voteCreation });
  });

  // ── Admin routes (assembly-scoped) ───────────────────────────────

  /** POST /assemblies/:id/invitations — create an invitation. */
  app.post("/assemblies/:id/invitations", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can create invitations");
    }

    const body = await c.req.json<{
      type?: "link" | "direct";
      maxUses?: number;
      expiresAt?: string;
      inviteeHandle?: string;
    }>();

    const type = body.type ?? "link";

    // Block link invites in invite-only mode
    if (type === "link") {
      const assembly = await assemblyCacheService.get(assemblyId);
      if (assembly?.admissionMode === "invite-only") {
        throw new ForbiddenError("Link invitations are not available in invite-only mode. Use direct invitations.");
      }
    }

    if (type === "direct") {
      if (!body.inviteeHandle) {
        throw new ValidationError("inviteeHandle is required for direct invitations");
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
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");
    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can list invitations");
    }
    const invitations = await invitationService.listByAssembly(assemblyId);
    return c.json({ invitations });
  });

  /** DELETE /assemblies/:id/invitations/:invId — revoke an invitation (admin). */
  app.delete("/assemblies/:id/invitations/:invId", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");
    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can revoke invitations");
    }
    const invId = c.req.param("invId");
    await invitationService.revoke(invId);
    return c.json({ status: "revoked" });
  });

  /** POST /assemblies/:id/invitations/preview — preview a bulk CSV import (admin). */
  app.post("/assemblies/:id/invitations/preview", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can preview bulk invitations");
    }

    const body = await c.req.json<{ csv: string }>();
    if (!body.csv || typeof body.csv !== "string") {
      throw new ValidationError("csv field is required");
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

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can create bulk invitations");
    }

    const body = parseBody(BulkInviteBody, await c.req.json());

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

  // ── Join request management (admin) ──────────────────────────────

  /** GET /assemblies/:id/join-requests — list pending join requests (admin). */
  app.get("/assemblies/:id/join-requests", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can view join requests");
    }

    const requests = await joinRequestService.listByAssembly(assemblyId, "pending");
    return c.json({ joinRequests: requests });
  });

  /** POST /assemblies/:id/join-requests/:reqId/approve — approve a join request (admin). */
  app.post("/assemblies/:id/join-requests/:reqId/approve", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");
    const reqId = c.req.param("reqId");

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can approve join requests");
    }

    const request = await joinRequestService.approve(reqId, userId);

    // Create the membership
    await membershipService.joinAssembly(request.userId, assemblyId, request.userName);

    // Notify the requester that they've been approved
    if (notificationHub) {
      const assembly = await assemblyCacheService.get(assemblyId);
      void notificationHub.notify({
        userId: request.userId,
        assemblyId,
        type: "join_request_approved",
        urgency: "info",
        title: `You've been approved to join ${assembly?.name ?? "a group"}`,
        actionUrl: `/assembly/${assemblyId}`,
      });
    }

    return c.json({ status: "approved", assemblyId }, 201);
  });

  /** POST /assemblies/:id/join-requests/:reqId/reject — reject a join request (admin). */
  app.post("/assemblies/:id/join-requests/:reqId/reject", async (c) => {
    const { id: userId } = getUser(c);
    const assemblyId = c.req.param("id");
    const reqId = c.req.param("reqId");

    if (!(await isAdminOf(userId, assemblyId))) {
      throw new ForbiddenError("Only admins can reject join requests");
    }

    const request = await joinRequestService.getById(reqId);
    await joinRequestService.reject(reqId, userId);

    // Notify the requester that they've been rejected
    if (notificationHub && request) {
      const assembly = await assemblyCacheService.get(assemblyId);
      void notificationHub.notify({
        userId: request.userId,
        assemblyId,
        type: "join_request_rejected",
        urgency: "info",
        title: `Your request to join ${assembly?.name ?? "a group"} was not approved`,
      });
    }

    return c.json({ status: "rejected" });
  });

  // ── User routes (direct invitations + join requests) ─────────────

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

  /** GET /me/join-requests — list user's pending join requests. */
  app.get("/me/join-requests", async (c) => {
    const { id: userId } = getUser(c);
    const requests = await joinRequestService.listByUser(userId);

    // Enrich with assembly names
    const enriched = await Promise.all(requests.map(async (req) => {
      const assembly = await assemblyCacheService.get(req.assemblyId);
      return { ...req, assemblyName: assembly?.name ?? null };
    }));

    return c.json({ joinRequests: enriched });
  });

  /** POST /me/invitations/:invId/accept — accept a direct invitation. */
  app.post("/me/invitations/:invId/accept", async (c) => {
    const { id: userId, name } = getUser(c);
    const invId = c.req.param("invId");
    const invitation = await invitationService.getById(invId);

    if (!invitation) {
      throw new NotFoundError("Invitation not found");
    }

    // Direct invitations always bypass approval (admin explicitly invited this person)
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
