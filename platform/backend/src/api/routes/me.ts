/**
 * User profile routes — /me endpoints.
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import type { NotificationService } from "../../services/notification-service.js";
import { getUser } from "../middleware/auth.js";
import { ValidationError } from "../middleware/error-handler.js";

export function meRoutes(
  userService: UserService,
  membershipService: MembershipService,
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
