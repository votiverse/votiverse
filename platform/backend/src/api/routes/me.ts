/**
 * User profile routes — /me endpoints.
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { MembershipService } from "../../services/membership-service.js";
import { getUser } from "../middleware/auth.js";

export function meRoutes(userService: UserService, membershipService: MembershipService) {
  const app = new Hono();

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

  return app;
}
