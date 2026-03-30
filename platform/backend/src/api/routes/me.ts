/**
 * User profile routes — /me endpoints.
 *
 * Refactored to use group-centric model. Memberships now come from
 * group_members table via GroupService.
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { GroupService } from "../../services/group-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { TopicCacheService } from "../../services/topic-cache.js";
import type { SurveyCacheService } from "../../services/survey-cache.js";
import type { NotificationService } from "../../services/notification-service.js";
import { getUser } from "../middleware/auth.js";
import { ValidationError, NotFoundError, BadGatewayError } from "../middleware/error-handler.js";
import { v7 as uuidv7 } from "uuid";
import { UpdateProfileBody, UpdateMemberProfileBody, NotificationPrefBody, DeviceTokenBody, parseBody } from "../../lib/validation.js";

import type { NotificationHubService } from "../../services/notification-hub.js";
import type { DatabaseAdapter } from "../../adapters/database/interface.js";
import * as devClock from "../../lib/dev-clock.js";

export function meRoutes(
  userService: UserService,
  membershipService: MembershipService,
  groupService: GroupService,
  assemblyCacheService: AssemblyCacheService,
  topicCacheService: TopicCacheService,
  surveyCacheService: SurveyCacheService,
  notificationService: NotificationService,
  notificationHub: NotificationHubService,
  database: DatabaseAdapter,
) {
  const app = new Hono();

  /**
   * POST /dev/notifications/trigger — create test notifications for the current user.
   * Dev-only endpoint for testing the notification UI.
   */
  app.post("/dev/notifications/trigger", async (c) => {
    const { id: userId } = getUser(c);
    const body = await c.req.json<{
      groupId: string;
      type?: string;
      urgency?: string;
      title?: string;
      body?: string;
      actionUrl?: string;
    }>();

    await notificationHub.notify({
      userId,
      groupId: body.groupId,
      type: (body.type ?? "vote_created") as "vote_created",
      urgency: (body.urgency ?? "timely") as "action" | "timely" | "info",
      title: body.title ?? "Test notification",
      body: body.body,
      actionUrl: body.actionUrl,
      skipEmail: true,
    });

    return c.json({ status: "ok" });
  });

  /**
   * POST /dev/notifications/seed — create a set of sample notifications for the current user.
   * Populates the notification bell with realistic content for UI testing.
   */
  app.post("/dev/notifications/seed", async (c) => {
    const { id: userId } = getUser(c);
    const memberships = await membershipService.getUserMemberships(userId);
    if (memberships.length === 0) {
      throw new ValidationError("User has no group memberships");
    }

    const groupId = memberships[0]!.groupId;
    const samples: Array<{ type: string; urgency: string; title: string; actionUrl?: string }> = [
      { type: "voting_open", urgency: "action", title: "Voting is open: Q2 Budget Allocation", actionUrl: `/group/${groupId}/events` },
      { type: "deadline_approaching", urgency: "action", title: "Voting closes tomorrow: Infrastructure Priorities", actionUrl: `/group/${groupId}/events` },
      { type: "survey_created", urgency: "timely", title: "New survey: Community Satisfaction Index", actionUrl: `/group/${groupId}/surveys` },
      { type: "vote_created", urgency: "timely", title: "New vote: Annual Policy Review", actionUrl: `/group/${groupId}/events` },
      { type: "join_request", urgency: "action", title: "Elena Vasquez wants to join your group", actionUrl: `/group/${groupId}/members` },
      { type: "results_available", urgency: "info", title: "Results are in: Emergency Transit Funding", actionUrl: `/group/${groupId}/events` },
      { type: "member_joined", urgency: "info", title: "Marcus Chen joined the group", actionUrl: `/group/${groupId}/members` },
      { type: "join_request_approved", urgency: "info", title: "You've been approved to join Municipal Budget Committee" },
    ];

    for (const s of samples) {
      await notificationHub.notify({
        userId,
        groupId,
        type: s.type as "vote_created",
        urgency: s.urgency as "action" | "timely" | "info",
        title: s.title,
        actionUrl: s.actionUrl,
        skipEmail: true,
      });
    }

    return c.json({ status: "ok", count: samples.length });
  });

  // ── Dev clock (mirrors VCP dev clock for time-dependent backend operations) ──

  /** GET /dev/clock — read current backend dev clock state. */
  app.get("/dev/clock", async (c) => {
    return c.json({
      time: devClock.now(),
      iso: devClock.nowIso(),
      offset: devClock.getOffset(),
      systemTime: Date.now(),
    });
  });

  /** POST /dev/clock/advance — advance the backend clock by ms. */
  app.post("/dev/clock/advance", async (c) => {
    const body = await c.req.json<{ ms: number }>();
    if (!body.ms || typeof body.ms !== "number") {
      throw new ValidationError("ms is required");
    }
    devClock.advance(body.ms);
    return c.json({ time: devClock.now(), iso: devClock.nowIso(), advanced: body.ms });
  });

  /** POST /dev/clock/reset — reset backend clock to real time. */
  app.post("/dev/clock/reset", async (c) => {
    devClock.reset();
    return c.json({ time: devClock.now(), iso: devClock.nowIso(), offset: 0 });
  });

  /** POST /dev/clock/sync — sync backend clock offset from VCP. */
  app.post("/dev/clock/sync", async (c) => {
    try {
      const vcpRes = await fetch("http://localhost:3000/dev/clock");
      const vcpClock = await vcpRes.json() as { time: number; systemTime: number };
      const offset = vcpClock.time - vcpClock.systemTime;
      devClock.setOffset(offset);
      return c.json({ time: devClock.now(), iso: devClock.nowIso(), offset, synced: true });
    } catch {
      throw new BadGatewayError("Could not reach VCP dev clock");
    }
  });

  // ── Feedback ────────────────────────────────────────────────────

  /**
   * POST /feedback — submit user feedback.
   * Sanitizes input, stores with user ID and timestamp.
   */
  app.post("/feedback", async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{ message: string }>();
    const message = body.message?.trim();
    if (!message || message.length === 0) {
      throw new ValidationError("Message is required");
    }
    if (message.length > 10000) {
      throw new ValidationError("Message is too long (max 10,000 characters)");
    }
    const id = uuidv7();
    await database.run(
      "INSERT INTO feedback (id, user_id, message) VALUES (?, ?, ?)",
      [id, user.id, message],
    );
    return c.json({ id, status: "ok" }, 201);
  });

  // ── Internal seed-only routes ────────────────────────────────────
  // These endpoints are only available in development/test environments.
  // They allow direct data manipulation for seeding and are NOT
  // exposed in production.
  app.use("/internal/*", async (c, next) => {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    return next();
  });

  /**
   * POST /internal/memberships — create membership record directly (seed only).
   * Does NOT call VCP — assumes participant already exists.
   */
  app.post("/internal/memberships", async (c) => {
    const body = await c.req.json<{
      userId: string;
      groupId: string;
      participantId: string;
      groupName: string;
      role?: string;
    }>();
    await membershipService.createMembership(
      body.userId,
      body.groupId,
      body.participantId,
      body.groupName,
      (body.role as "owner" | "admin" | "member") ?? "member",
    );
    return c.json({ status: "ok" }, 201);
  });

  /**
   * POST /internal/groups — seed-only: create a group with VCP assembly link and capabilities.
   */
  app.post("/internal/groups", async (c) => {
    const body = await c.req.json<{
      name: string;
      handle: string;
      createdBy: string;
      vcpAssemblyId: string;
      admissionMode?: string;
      websiteUrl?: string | null;
      voteCreation?: string;
      capabilities?: string[];
    }>();
    const group = await groupService.create({
      name: body.name,
      handle: body.handle,
      createdBy: body.createdBy,
      admissionMode: (body.admissionMode as "open" | "approval" | "invite-only") ?? "approval",
      websiteUrl: body.websiteUrl ?? null,
      voteCreation: (body.voteCreation as "admin" | "members") ?? "admin",
    });
    await groupService.setVcpAssemblyId(group.id, body.vcpAssemblyId);
    for (const cap of body.capabilities ?? []) {
      await groupService.enableCapability(group.id, cap as "voting" | "scoring" | "surveys" | "community_notes");
    }
    return c.json({ id: group.id, status: "ok" }, 201);
  });

  /**
   * POST /internal/tracked-events — seed-only: track an existing VCP event
   * with all notification flags pre-set (already notified).
   */
  app.post("/internal/tracked-events", async (c) => {
    const body = await c.req.json<{
      id: string;
      assemblyId: string;
      title: string;
      votingStart: string;
      votingEnd: string;
    }>();
    await notificationService.trackEvent({
      id: body.id,
      assemblyId: body.assemblyId,
      title: body.title,
      votingStart: body.votingStart,
      votingEnd: body.votingEnd,
    });
    // Mark all notification flags as already sent
    await notificationService.markAllNotified("event", body.id);
    return c.json({ status: "ok" }, 201);
  });

  /**
   * POST /internal/tracked-surveys — seed-only: track an existing VCP survey
   * with all notification flags pre-set (already notified).
   */
  app.post("/internal/tracked-surveys", async (c) => {
    const body = await c.req.json<{
      id: string;
      assemblyId: string;
      title: string;
      schedule: string;
      closesAt: string;
    }>();
    await notificationService.trackSurvey({
      id: body.id,
      assemblyId: body.assemblyId,
      title: body.title,
      schedule: body.schedule,
      closesAt: body.closesAt,
    });
    // Mark all notification flags as already sent
    await notificationService.markAllNotified("survey", body.id);
    return c.json({ status: "ok" }, 201);
  });

  /**
   * POST /internal/assemblies-cache — seed-only: cache an assembly locally.
   */
  app.post("/internal/assemblies-cache", async (c) => {
    const body = await c.req.json<{
      id: string;
      organizationId?: string | null;
      name: string;
      config: unknown;
      status?: string;
      createdAt: string;
    }>();
    await assemblyCacheService.upsert({
      id: body.id,
      organizationId: body.organizationId ?? null,
      name: body.name,
      config: body.config,
      status: body.status ?? "active",
      createdAt: body.createdAt,
    });
    return c.json({ status: "ok" }, 201);
  });

  /**
   * POST /internal/topics-cache — seed-only: cache topics for an assembly.
   */
  app.post("/internal/topics-cache", async (c) => {
    const body = await c.req.json<{
      topics: Array<{
        id: string;
        assemblyId: string;
        name: string;
        parentId?: string | null;
        sortOrder?: number;
      }>;
    }>();
    await topicCacheService.upsertMany(
      body.topics.map((t) => ({
        id: t.id,
        assemblyId: t.assemblyId,
        name: t.name,
        parentId: t.parentId ?? null,
        sortOrder: t.sortOrder ?? 0,
      })),
    );
    return c.json({ status: "ok", count: body.topics.length }, 201);
  });

  /**
   * POST /internal/surveys-cache — seed-only: cache surveys for an assembly.
   */
  app.post("/internal/surveys-cache", async (c) => {
    const body = await c.req.json<{
      surveys: Array<{
        id: string;
        assemblyId: string;
        title: string;
        questions: unknown[];
        topicIds: string[];
        schedule: number;
        closesAt: number;
        createdBy: string;
      }>;
    }>();
    for (const s of body.surveys) {
      await surveyCacheService.upsert(s);
    }
    return c.json({ status: "ok", count: body.surveys.length }, 201);
  });

  /** GET /me — current user profile with memberships. */
  app.get("/me", async (c) => {
    const { id } = getUser(c);
    const user = await userService.getByIdOrThrow(id);
    const memberships = await membershipService.getUserMemberships(id);

    // Enrich memberships with capabilities
    const enrichedMemberships = await Promise.all(memberships.map(async (m) => {
      const capabilities = await groupService.getCapabilities(m.groupId);
      const enabledCaps = capabilities.filter((c) => c.enabled).map((c) => c.capability);
      return { ...m, capabilities: enabledCaps };
    }));

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      handle: user.handle,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      locale: user.locale,
      memberships: enrichedMemberships,
    });
  });

  /** PUT /me/profile — update profile fields. */
  app.put("/me/profile", async (c) => {
    const { id } = getUser(c);
    const body = parseBody(UpdateProfileBody, await c.req.json());
    const updated = await userService.updateProfile(id, body);
    return c.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      handle: updated.handle,
      avatarUrl: updated.avatarUrl,
      bio: updated.bio,
      locale: updated.locale,
    });
  });

  /** GET /users/:handle — public profile lookup by handle. */
  app.get("/users/:handle", async (c) => {
    const handle = c.req.param("handle").toLowerCase();
    const profile = await userService.getByHandle(handle);
    if (!profile) {
      throw new NotFoundError("User not found");
    }
    return c.json(profile);
  });

  /** POST /me/groups/:groupId/join — join a group. */
  app.post("/me/groups/:groupId/join", async (c) => {
    const { id, name } = getUser(c);
    const groupId = c.req.param("groupId");

    const membership = await membershipService.joinGroup(id, groupId, name);
    return c.json(membership, 201);
  });

  /** PUT /me/groups/:groupId/profile — update per-membership profile (title, avatar, banner). */
  app.put("/me/groups/:groupId/profile", async (c) => {
    const { id } = getUser(c);
    const groupId = c.req.param("groupId");
    const body = parseBody(UpdateMemberProfileBody, await c.req.json());

    await membershipService.updateMemberProfile(id, groupId, {
      title: body.title,
      avatarUrl: body.avatarUrl,
      bannerUrl: body.bannerUrl,
    });

    return c.json({ ok: true });
  });

  // ── Notification preferences (renamed from /me/notifications) ────

  /** GET /me/notification-preferences — get notification preferences. */
  app.get("/me/notification-preferences", async (c) => {
    const { id } = getUser(c);
    const preferences = await notificationService.getPreferences(id);
    return c.json({ preferences });
  });

  /** PUT /me/notification-preferences — set a notification preference. */
  app.put("/me/notification-preferences", async (c) => {
    const { id } = getUser(c);
    const body = parseBody(NotificationPrefBody, await c.req.json());

    try {
      await notificationService.setPreference(id, body.key, body.value);
    } catch (err) {
      throw new ValidationError((err as Error).message);
    }

    const preferences = await notificationService.getPreferences(id);
    return c.json({ preferences });
  });

  // Backward compat: keep old path working during transition
  app.get("/me/notifications", async (c) => {
    const { id } = getUser(c);
    const preferences = await notificationService.getPreferences(id);
    return c.json({ preferences });
  });
  app.put("/me/notifications", async (c) => {
    const { id } = getUser(c);
    const body = parseBody(NotificationPrefBody, await c.req.json());
    try {
      await notificationService.setPreference(id, body.key, body.value);
    } catch (err) {
      throw new ValidationError((err as Error).message);
    }
    const preferences = await notificationService.getPreferences(id);
    return c.json({ preferences });
  });

  // ── Notification feed (in-app hub) ─────────────────────────────

  /** GET /me/notifications/feed — list notifications (paginated, filterable). */
  app.get("/me/notifications/feed", async (c) => {
    const { id } = getUser(c);
    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const groupId = c.req.query("groupId") ?? undefined;
    const unreadOnly = c.req.query("unreadOnly") === "true";

    const result = await notificationHub.list(id, { groupId, unreadOnly, limit, offset });
    return c.json(result);
  });

  /** GET /me/notifications/unread-count — unread count for badge. */
  app.get("/me/notifications/unread-count", async (c) => {
    const { id } = getUser(c);
    const count = await notificationHub.getUnreadCount(id);
    return c.json({ unreadCount: count });
  });

  /** POST /me/notifications/:id/read — mark a notification as read. */
  app.post("/me/notifications/:id/read", async (c) => {
    const { id: userId } = getUser(c);
    const notificationId = c.req.param("id");
    await notificationHub.markRead(notificationId, userId);
    return c.json({ status: "ok" });
  });

  /** POST /me/notifications/read-all — mark all notifications as read. */
  app.post("/me/notifications/read-all", async (c) => {
    const { id } = getUser(c);
    const groupId = c.req.query("groupId") ?? undefined;
    await notificationHub.markAllRead(id, groupId);
    return c.json({ status: "ok" });
  });

  // ---- Push notification device tokens ----

  /** POST /me/devices — register a push notification device token. */
  app.post("/me/devices", async (c) => {
    const { id: userId } = getUser(c);
    const body = parseBody(DeviceTokenBody, await c.req.json());

    const id = uuidv7();
    await database.run(
      `INSERT INTO device_tokens (id, user_id, platform, token)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, platform, token) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [id, userId, body.platform, body.token],
    );

    return c.json({ deviceId: id });
  });

  /** GET /me/devices — list registered device tokens. */
  app.get("/me/devices", async (c) => {
    const { id: userId } = getUser(c);
    const devices = await database.query(
      `SELECT id, platform, substr(token, 1, 8) || '...' as token_preview, created_at, updated_at
       FROM device_tokens WHERE user_id = ? ORDER BY updated_at DESC`,
      [userId],
    );
    return c.json({ devices });
  });

  /** DELETE /me/devices/:id — unregister a device token. */
  app.delete("/me/devices/:id", async (c) => {
    const { id: userId } = getUser(c);
    const deviceId = c.req.param("id");
    await database.run(
      `DELETE FROM device_tokens WHERE id = ? AND user_id = ?`,
      [deviceId, userId],
    );
    return c.json({ status: "ok" });
  });

  return app;
}
