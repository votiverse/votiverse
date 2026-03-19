/**
 * User profile routes — /me endpoints.
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { TopicCacheService } from "../../services/topic-cache.js";
import type { SurveyCacheService } from "../../services/survey-cache.js";
import type { NotificationService } from "../../services/notification-service.js";
import { getUser } from "../middleware/auth.js";
import { ValidationError } from "../middleware/error-handler.js";

import type { NotificationHubService } from "../../services/notification-hub.js";

export function meRoutes(
  userService: UserService,
  membershipService: MembershipService,
  assemblyCacheService: AssemblyCacheService,
  topicCacheService: TopicCacheService,
  surveyCacheService: SurveyCacheService,
  notificationService: NotificationService,
  notificationHub: NotificationHubService,
) {
  const app = new Hono();

  /**
   * POST /internal/memberships — create membership record directly (seed only).
   * Does NOT call VCP — assumes participant already exists.
   */
  app.post("/internal/memberships", async (c) => {
    const body = await c.req.json<{
      userId: string;
      assemblyId: string;
      participantId: string;
      assemblyName: string;
    }>();
    await membershipService.createMembership(
      body.userId,
      body.assemblyId,
      body.participantId,
      body.assemblyName,
    );
    return c.json({ status: "ok" }, 201);
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

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      handle: user.handle,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      memberships,
    });
  });

  /** PUT /me/profile — update profile fields. */
  app.put("/me/profile", async (c) => {
    const { id } = getUser(c);
    const body = await c.req.json<{ handle?: string; name?: string; bio?: string; avatarUrl?: string | null }>();
    const updated = await userService.updateProfile(id, body);
    return c.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      handle: updated.handle,
      avatarUrl: updated.avatarUrl,
      bio: updated.bio,
    });
  });

  /** GET /users/:handle — public profile lookup by handle. */
  app.get("/users/:handle", async (c) => {
    const handle = c.req.param("handle").toLowerCase();
    const profile = await userService.getByHandle(handle);
    if (!profile) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }
    return c.json(profile);
  });

  /** POST /me/assemblies/:assemblyId/join — join an assembly. */
  app.post("/me/assemblies/:assemblyId/join", async (c) => {
    const { id, name } = getUser(c);
    const assemblyId = c.req.param("assemblyId");

    const membership = await membershipService.joinAssembly(id, assemblyId, name);
    return c.json(membership, 201);
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
    const body = await c.req.json<{ key: string; value: string }>();

    if (!body.key || !body.value) {
      throw new ValidationError("Both 'key' and 'value' are required");
    }

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
    const body = await c.req.json<{ key: string; value: string }>();
    if (!body.key || !body.value) {
      throw new ValidationError("Both 'key' and 'value' are required");
    }
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
    const assemblyId = c.req.query("assemblyId") ?? undefined;
    const unreadOnly = c.req.query("unreadOnly") === "true";

    const result = await notificationHub.list(id, { assemblyId, unreadOnly, limit, offset });
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
    const assemblyId = c.req.query("assemblyId") ?? undefined;
    await notificationHub.markAllRead(id, assemblyId);
    return c.json({ status: "ok" });
  });

  return app;
}
