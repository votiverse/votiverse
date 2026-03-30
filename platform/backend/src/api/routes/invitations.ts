/**
 * Invitation and admission routes — invite links, direct invitations,
 * join requests, and group settings.
 *
 * Routes are now group-centric: /groups/:id/... instead of /assemblies/:id/...
 * Admin checks use isAdminOfGroup (backend-owned group_members.role).
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
 * Admin (group-scoped):
 *   GET    /groups/:id/settings — read group settings (admissionMode)
 *   PUT    /groups/:id/settings — update group settings
 *   POST   /groups/:id/invitations — create invite
 *   GET    /groups/:id/invitations — list invitations
 *   DELETE /groups/:id/invitations/:invId — revoke invitation
 *   POST   /groups/:id/invitations/preview — preview bulk CSV import
 *   POST   /groups/:id/invitations/bulk — create bulk invitations
 *   GET    /groups/:id/join-requests — list pending join requests
 *   POST   /groups/:id/join-requests/:reqId/approve — approve join request
 *   POST   /groups/:id/join-requests/:reqId/reject — reject join request
 */

import { Hono } from "hono";
import type { InvitationService } from "../../services/invitation-service.js";
import type { JoinRequestService } from "../../services/join-request-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { GroupService } from "../../services/group-service.js";
import type { UserService } from "../../services/user-service.js";
import type { InvitationNotifier } from "../../services/invitation-notifier.js";
import type { NotificationHubService } from "../../services/notification-hub.js";
import { getUser } from "../middleware/auth.js";
import { parseCsvInvites } from "../../lib/csv-parser.js";
import { AssemblySettingsBody, BulkInviteBody, parseBody } from "../../lib/validation.js";
import { isAdminOfGroup } from "../../lib/admin-check.js";
import { NotFoundError, ForbiddenError, GoneError, ValidationError } from "../middleware/error-handler.js";

export function invitationRoutes(
  invitationService: InvitationService,
  joinRequestService: JoinRequestService,
  membershipService: MembershipService,
  groupService: GroupService,
  userService: UserService,
  invitationNotifier: InvitationNotifier | null = null,
  notificationHub: NotificationHubService | null = null,
) {
  const app = new Hono();

  const isAdmin = (userId: string, groupId: string) =>
    isAdminOfGroup(userId, groupId, groupService);

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

    // Get group info
    const group = await groupService.get(invitation.groupId);
    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Get members with roles for leadership display
    const members = await groupService.getMembers(invitation.groupId);
    const ownerMembers = members.filter((m) => m.role === "owner");
    const adminMembers = members.filter((m) => m.role === "admin");

    // Enrich with user names via participant IDs
    const allLeaderPids = [...ownerMembers, ...adminMembers]
      .filter((m) => m.participantId)
      .map((m) => m.participantId!);
    const nameMap = await groupService.getParticipantNames(invitation.groupId, allLeaderPids);

    const owners = ownerMembers.map((m) => ({
      participantId: m.participantId,
      name: m.participantId ? (nameMap.get(m.participantId) ?? null) : null,
    }));
    const admins = adminMembers.map((m) => ({
      participantId: m.participantId,
      name: m.participantId ? (nameMap.get(m.participantId) ?? null) : null,
    }));

    const memberCount = members.length;

    return c.json({
      invitation: {
        id: invitation.id,
        type: invitation.type,
        groupId: invitation.groupId,
      },
      group: {
        id: group.id,
        name: group.name,
        admissionMode: group.admissionMode,
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

    // Check admission mode from the group
    const group = await groupService.get(invitation.groupId);
    const admissionMode = group?.admissionMode ?? "approval";

    if (admissionMode === "approval") {
      // Create a join request instead of instant join
      const user = await userService.getByIdOrThrow(userId);
      const joinRequest = await joinRequestService.create(
        invitation.groupId, userId, name, user.handle,
      );

      // Notify group admins of the new join request
      if (notificationHub) {
        const groupName = group?.name ?? "a group";
        void notificationHub.notifyGroupAdmins({
          groupId: invitation.groupId,
          type: "join_request",
          urgency: "action",
          title: `${name} wants to join ${groupName}`,
          actionUrl: `/group/${invitation.groupId}/members`,
        });
      }

      return c.json(
        { status: "pending", groupId: invitation.groupId, joinRequestId: joinRequest.id },
        202,
      );
    }

    // Open mode (or invite-only with existing link) — instant join
    const result = await invitationService.accept(invitation, userId, name);
    return c.json({ status: "joined", groupId: result.groupId }, 201);
  });

  // ── Group settings ──────────────────────────────────────────────

  /** GET /groups/:id/settings — read group settings. */
  app.get("/groups/:id/settings", async (c) => {
    const groupId = c.req.param("id");
    const group = await groupService.get(groupId);
    if (!group) {
      throw new NotFoundError("Group not found");
    }
    return c.json({
      admissionMode: group.admissionMode,
      websiteUrl: group.websiteUrl,
      voteCreation: group.voteCreation,
    });
  });

  /** PUT /groups/:id/settings — update group settings (admin only). */
  app.put("/groups/:id/settings", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");

    if (!(await isAdmin(userId, groupId))) {
      throw new ForbiddenError("Only admins can change settings");
    }

    const body = parseBody(AssemblySettingsBody, await c.req.json());
    const updates: Record<string, unknown> = {};
    if (body.admissionMode !== undefined) updates.admissionMode = body.admissionMode;
    if (body.websiteUrl !== undefined) updates.websiteUrl = body.websiteUrl || null;
    if (body.voteCreation !== undefined) updates.voteCreation = body.voteCreation;

    await groupService.update(groupId, updates as Parameters<typeof groupService.update>[1]);
    const updated = await groupService.get(groupId);
    return c.json({
      admissionMode: updated!.admissionMode,
      websiteUrl: updated!.websiteUrl,
      voteCreation: updated!.voteCreation,
    });
  });

  // ── Admin routes (group-scoped) ─────────────────────────────────

  /** POST /groups/:id/invitations — create an invitation. */
  app.post("/groups/:id/invitations", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");

    if (!(await isAdmin(userId, groupId))) {
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
      const group = await groupService.get(groupId);
      if (group?.admissionMode === "invite-only") {
        throw new ForbiddenError("Link invitations are not available in invite-only mode. Use direct invitations.");
      }
    }

    if (type === "direct") {
      if (!body.inviteeHandle) {
        throw new ValidationError("inviteeHandle is required for direct invitations");
      }
      const invitation = await invitationService.createDirectInvite(groupId, userId, body.inviteeHandle);

      // Fire-and-forget email notification to the invitee
      if (invitationNotifier) {
        const { name: inviterName } = getUser(c);
        void invitationNotifier.sendInvitationEmail(body.inviteeHandle, groupId, inviterName);
      }

      return c.json(invitation, 201);
    }

    const invitation = await invitationService.createLinkInvite(groupId, userId, {
      maxUses: body.maxUses,
      expiresAt: body.expiresAt,
    });
    return c.json(invitation, 201);
  });

  /** GET /groups/:id/invitations — list invitations for group (admin). */
  app.get("/groups/:id/invitations", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");
    if (!(await isAdmin(userId, groupId))) {
      throw new ForbiddenError("Only admins can list invitations");
    }
    const invitations = await invitationService.listByGroup(groupId);
    return c.json({ invitations });
  });

  /** DELETE /groups/:id/invitations/:invId — revoke an invitation (admin). */
  app.delete("/groups/:id/invitations/:invId", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");
    if (!(await isAdmin(userId, groupId))) {
      throw new ForbiddenError("Only admins can revoke invitations");
    }
    const invId = c.req.param("invId");
    await invitationService.revoke(invId);
    return c.json({ status: "revoked" });
  });

  /** POST /groups/:id/invitations/preview — preview a bulk CSV import (admin). */
  app.post("/groups/:id/invitations/preview", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");

    if (!(await isAdmin(userId, groupId))) {
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
      const member = await groupService.getMember(groupId, handleUserId);
      valid.push({ handle: row.handle, status: "found", alreadyMember: !!member });
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

  /** POST /groups/:id/invitations/bulk — create bulk direct invitations (admin). */
  app.post("/groups/:id/invitations/bulk", async (c) => {
    const { id: userId, name: inviterName } = getUser(c);
    const groupId = c.req.param("id");

    if (!(await isAdmin(userId, groupId))) {
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
      const hasPendingForGroup = existing.some((inv) => inv.groupId === groupId);
      if (hasPendingForGroup) {
        results.push({ handle: normalized, status: "skipped", reason: "Pending invitation already exists" });
        skipped++;
        continue;
      }

      await invitationService.createDirectInvite(groupId, userId, normalized);
      created++;
      results.push({ handle: normalized, status: "created" });

      // Fire-and-forget email notification
      if (invitationNotifier) {
        void invitationNotifier.sendInvitationEmail(normalized, groupId, inviterName);
      }
    }

    return c.json({ created, skipped, results }, 201);
  });

  // ── Join request management (admin) ──────────────────────────────

  /** GET /groups/:id/join-requests — list pending join requests (admin). */
  app.get("/groups/:id/join-requests", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");

    if (!(await isAdmin(userId, groupId))) {
      throw new ForbiddenError("Only admins can view join requests");
    }

    const requests = await joinRequestService.listByGroup(groupId, "pending");
    return c.json({ joinRequests: requests });
  });

  /** POST /groups/:id/join-requests/:reqId/approve — approve a join request (admin). */
  app.post("/groups/:id/join-requests/:reqId/approve", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");
    const reqId = c.req.param("reqId");

    if (!(await isAdmin(userId, groupId))) {
      throw new ForbiddenError("Only admins can approve join requests");
    }

    const request = await joinRequestService.approve(reqId, userId);

    // Create the membership
    await membershipService.joinGroup(request.userId, groupId, request.userName);

    // Notify the requester that they've been approved
    if (notificationHub) {
      const group = await groupService.get(groupId);
      void notificationHub.notify({
        userId: request.userId,
        groupId,
        type: "join_request_approved",
        urgency: "info",
        title: `You've been approved to join ${group?.name ?? "a group"}`,
        actionUrl: `/group/${groupId}`,
      });
    }

    return c.json({ status: "approved", groupId }, 201);
  });

  /** POST /groups/:id/join-requests/:reqId/reject — reject a join request (admin). */
  app.post("/groups/:id/join-requests/:reqId/reject", async (c) => {
    const { id: userId } = getUser(c);
    const groupId = c.req.param("id");
    const reqId = c.req.param("reqId");

    if (!(await isAdmin(userId, groupId))) {
      throw new ForbiddenError("Only admins can reject join requests");
    }

    const request = await joinRequestService.getById(reqId);
    await joinRequestService.reject(reqId, userId);

    // Notify the requester that they've been rejected
    if (notificationHub && request) {
      const group = await groupService.get(groupId);
      void notificationHub.notify({
        userId: request.userId,
        groupId,
        type: "join_request_rejected",
        urgency: "info",
        title: `Your request to join ${group?.name ?? "a group"} was not approved`,
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

    // Enrich with group names
    const enriched = await Promise.all(invitations.map(async (inv) => {
      const group = await groupService.get(inv.groupId);
      return {
        ...inv,
        groupName: group?.name ?? null,
      };
    }));

    return c.json({ invitations: enriched });
  });

  /** GET /me/join-requests — list user's pending join requests. */
  app.get("/me/join-requests", async (c) => {
    const { id: userId } = getUser(c);
    const requests = await joinRequestService.listByUser(userId);

    // Enrich with group names
    const enriched = await Promise.all(requests.map(async (req) => {
      const group = await groupService.get(req.groupId);
      return { ...req, groupName: group?.name ?? null };
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
    return c.json({ status: "joined", groupId: result.groupId }, 201);
  });

  /** POST /me/invitations/:invId/decline — decline a direct invitation. */
  app.post("/me/invitations/:invId/decline", async (c) => {
    const invId = c.req.param("invId");
    await invitationService.revoke(invId);
    return c.json({ status: "declined" });
  });

  return app;
}
