/**
 * User profile routes — /me endpoints.
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { TopicCacheService } from "../../services/topic-cache.js";
import type { NotificationService } from "../../services/notification-service.js";
import { getUser } from "../middleware/auth.js";
import { ValidationError } from "../middleware/error-handler.js";

export function meRoutes(
  userService: UserService,
  membershipService: MembershipService,
  assemblyCacheService: AssemblyCacheService,
  topicCacheService: TopicCacheService,
  notificationService: NotificationService,
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
   * POST /internal/tracked-polls — seed-only: track an existing VCP poll
   * with all notification flags pre-set (already notified).
   */
  app.post("/internal/tracked-polls", async (c) => {
    const body = await c.req.json<{
      id: string;
      assemblyId: string;
      title: string;
      schedule: string;
      closesAt: string;
    }>();
    await notificationService.trackPoll({
      id: body.id,
      assemblyId: body.assemblyId,
      title: body.title,
      schedule: body.schedule,
      closesAt: body.closesAt,
    });
    // Mark all notification flags as already sent
    await notificationService.markAllNotified("poll", body.id);
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

  /** GET /me — current user profile with memberships. */
  app.get("/me", async (c) => {
    const { id } = getUser(c);
    const user = await userService.getByIdOrThrow(id);
    const memberships = await membershipService.getUserMemberships(id);

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      memberships,
    });
  });

  /** POST /me/assemblies/:assemblyId/join — join an assembly. */
  app.post("/me/assemblies/:assemblyId/join", async (c) => {
    const { id, name } = getUser(c);
    const assemblyId = c.req.param("assemblyId");

    const membership = await membershipService.joinAssembly(id, assemblyId, name);
    return c.json(membership, 201);
  });

  /** GET /me/notifications — get notification preferences. */
  app.get("/me/notifications", async (c) => {
    const { id } = getUser(c);
    const preferences = await notificationService.getPreferences(id);
    return c.json({ preferences });
  });

  /** PUT /me/notifications — set a notification preference. */
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

  return app;
}
