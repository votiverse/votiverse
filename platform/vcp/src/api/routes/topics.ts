/**
 * Topic routes — CRUD for assembly topic taxonomies.
 */

import { Hono } from "hono";
import { v7 as uuidv7 } from "uuid";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireScope } from "../middleware/auth.js";

export function topicRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/topics — list all topics. */
  app.get("/assemblies/:id/topics", async (c) => {
    const assemblyId = c.req.param("id");
    const topics = await manager.listTopics(assemblyId);
    return c.json({ topics });
  });

  /** POST /assemblies/:id/topics — create a topic. */
  app.post("/assemblies/:id/topics", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<{
      name: string;
      parentId?: string | null;
      sortOrder?: number;
    }>();

    if (!body.name) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        400,
      );
    }

    const id = uuidv7();
    await manager.createTopic(assemblyId, {
      id,
      name: body.name,
      parentId: body.parentId ?? null,
      sortOrder: body.sortOrder ?? 0,
    });

    return c.json(
      { id, name: body.name, parentId: body.parentId ?? null, sortOrder: body.sortOrder ?? 0 },
      201,
    );
  });

  return app;
}
