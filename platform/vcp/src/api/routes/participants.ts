/**
 * Participant management routes.
 */

import { Hono } from "hono";
import type { ParticipantId, ParticipantStatus } from "@votiverse/core";
import { createEvent, generateEventId, now } from "@votiverse/core";
import type { ParticipantStatusChangedEvent, DelegationRevokedEvent } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireScope } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

const VALID_STATUSES = new Set<string>(["active", "inactive", "sunset"]);

export function participantRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/participants — add participant. */
  app.post("/assemblies/:id/participants", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<{ name: string }>();

    if (!body.name) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        400,
      );
    }

    // Ensure assembly exists
    const info = await manager.getAssemblyInfo(assemblyId);
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
  app.get("/assemblies/:id/participants", async (c) => {
    const assemblyId = c.req.param("id");
    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }
    const all = await manager.listParticipants(assemblyId);
    const { data, pagination } = paginate(all, parsePagination(c));
    return c.json({ participants: data, pagination });
  });

  /** DELETE /assemblies/:id/participants/:pid — remove participant. */
  app.delete("/assemblies/:id/participants/:pid", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    try {
      await manager.removeParticipant(assemblyId, pid);
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

  /**
   * PATCH /assemblies/:id/participants/:pid/status — change participant status.
   *
   * Requires the 'operational' auth scope. When status is 'sunset',
   * orchestrates revocation of all the participant's delegations.
   */
  app.patch("/assemblies/:id/participants/:pid/status", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    // Require operational scope
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const body = await c.req.json<{ status: string; reason: string }>();
    if (!body.status || !body.reason) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "status and reason are required" } },
        400,
      );
    }

    if (!VALID_STATUSES.has(body.status)) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: `status must be one of: ${[...VALID_STATUSES].join(", ")}` } },
        400,
      );
    }

    const participant = await manager.getParticipant(assemblyId, pid);
    if (!participant) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Participant "${pid}" not found in assembly` } },
        404,
      );
    }

    const previousStatus = participant.status as ParticipantStatus;
    const newStatus = body.status as ParticipantStatus;

    if (previousStatus === newStatus) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: `Participant is already ${newStatus}` } },
        400,
      );
    }

    const { engine, store } = await manager.getEngine(assemblyId);

    // Emit ParticipantStatusChanged event
    const statusEvent = createEvent<ParticipantStatusChangedEvent>(
      "ParticipantStatusChanged",
      {
        participantId: pid as ParticipantId,
        previousStatus,
        newStatus,
        reason: body.reason,
      },
      generateEventId(),
      now(),
    );
    await store.append(statusEvent);

    // Update DB
    await manager.updateParticipantStatus(assemblyId, pid, newStatus);

    // Sunset cascade: revoke all delegations from AND to this participant
    let revokedCount = 0;
    if (newStatus === "sunset") {
      const allDelegations = await engine.delegation.listActive();
      const affected = allDelegations.filter(
        (d) => d.sourceId === pid || d.targetId === pid,
      );

      for (const delegation of affected) {
        const revokeEvent = createEvent<DelegationRevokedEvent>(
          "DelegationRevoked",
          {
            delegationId: delegation.id,
            sourceId: delegation.sourceId,
            topicScope: delegation.topicScope,
            revokedBy: { kind: "sunset", participantId: pid as ParticipantId },
          },
          generateEventId(),
          now(),
        );
        await store.append(revokeEvent);
        revokedCount++;
      }

      // Evict cached engine since state changed significantly
      manager.evictEngine(assemblyId);
    }

    return c.json({
      participantId: pid,
      previousStatus,
      newStatus,
      reason: body.reason,
      delegationsRevoked: revokedCount,
    });
  });

  return app;
}
