/**
 * Participant management routes.
 */

import { Hono } from "hono";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function participantRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/participants — add participant. */
  app.post("/assemblies/:id/participants", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<{ name: string }>();

    if (!body.name) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        400,
      );
    }

    // Ensure assembly exists
    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    try {
      const participant = await manager.addParticipant(assemblyId, body.name);
      return c.json(participant, 201);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return c.json(
          { error: { code: "CONFLICT", message: error.message } },
          409,
        );
      }
      throw error;
    }
  });

  /** GET /assemblies/:id/participants — list participants. */
  app.get("/assemblies/:id/participants", (c) => {
    const assemblyId = c.req.param("id");
    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }
    const participants = manager.listParticipants(assemblyId);
    return c.json({ participants });
  });

  /** DELETE /assemblies/:id/participants/:pid — remove participant. */
  app.delete("/assemblies/:id/participants/:pid", (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    try {
      manager.removeParticipant(assemblyId, pid);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json(
          { error: { code: "NOT_FOUND", message: error.message } },
          404,
        );
      }
      throw error;
    }
    return c.body(null, 204);
  });

  return app;
}
