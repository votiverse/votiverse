/**
 * User identity routes — cross-assembly identity resolution.
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function userRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /users — list all users. */
  app.get("/users", (c) => {
    const users = manager.listUsers();
    return c.json({ users });
  });

  /** POST /users — create a user and optionally link to participants. */
  app.post("/users", async (c) => {
    const body = await c.req.json<{ name: string; email?: string; links?: Array<{ assemblyId: string; participantId: string }> }>();
    if (!body.name) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "name is required" } }, 400);
    }

    const id = randomUUID();
    const user = manager.createUser(id, body.name, body.email);

    if (body.links) {
      for (const link of body.links) {
        manager.linkParticipantToUser(link.assemblyId, link.participantId, id);
      }
    }

    return c.json(user, 201);
  });

  /** GET /users/:userId — get a single user. */
  app.get("/users/:userId", (c) => {
    const user = manager.getUser(c.req.param("userId"));
    if (!user) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }
    return c.json(user);
  });

  /** GET /users/:userId/assemblies — list assemblies a user belongs to. */
  app.get("/users/:userId/assemblies", (c) => {
    const userId = c.req.param("userId");
    const user = manager.getUser(userId);
    if (!user) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }
    const memberships = manager.listUserAssemblies(userId);
    return c.json({ userId, memberships });
  });

  return app;
}
