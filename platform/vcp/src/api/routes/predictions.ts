/**
 * Prediction routes.
 */

import { Hono } from "hono";
import type { ParticipantId } from "@votiverse/core";
import type { PredictionId, CommitPredictionParams, RecordOutcomeParams } from "@votiverse/prediction";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, requireScope } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function predictionRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/predictions — list predictions for a participant. */
  app.get("/assemblies/:id/predictions", async (c) => {
    const assemblyId = c.req.param("id");
    const rawParticipantId = c.req.query("participantId");

    if (!rawParticipantId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId query parameter is required" } },
        400,
      );
    }

    const participantId = rawParticipantId;
    const { engine } = await manager.getEngine(assemblyId);
    const predictions = await engine.prediction.getByParticipant(participantId as ParticipantId);

    const mapped = predictions.map((p) => ({
      id: p.id,
      proposalId: p.proposalId,
      participantId: p.participantId,
      claim: p.claim,
      commitmentHash: p.commitmentHash,
      committedAt: new Date(p.committedAt).toISOString(),
    }));
    const { data, pagination } = paginate(mapped, parsePagination(c));
    return c.json({ predictions: data, pagination });
  });

  /** POST /assemblies/:id/predictions — commit prediction. Sovereignty enforced. */
  app.post(
    "/assemblies/:id/predictions",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const body = await c.req.json<CommitPredictionParams>();
      const authenticatedPid = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      const prediction = await engine.prediction.commit({
        ...body,
        participantId: authenticatedPid as ParticipantId,
      });

      return c.json({
        id: prediction.id,
        proposalId: prediction.proposalId,
        participantId: prediction.participantId,
        claim: prediction.claim,
        commitmentHash: prediction.commitmentHash,
        status: prediction.status,
        committedAt: new Date(prediction.committedAt).toISOString(),
      }, 201);
    },
  );

  /** POST /assemblies/:id/outcomes — record outcome. Requires operational scope. */
  app.post("/assemblies/:id/outcomes", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<RecordOutcomeParams>();

    const { engine } = await manager.getEngine(assemblyId);
    await engine.prediction.recordOutcome(body);

    return c.json({ status: "ok" });
  });

  /** GET /assemblies/:id/predictions/:pid/eval — evaluate prediction. */
  app.get("/assemblies/:id/predictions/:pid/eval", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const { engine } = await manager.getEngine(assemblyId);
    const evaluation = await engine.prediction.evaluate(pid as PredictionId);

    return c.json(evaluation);
  });

  /** GET /assemblies/:id/track-record/:pid — participant track record. */
  app.get("/assemblies/:id/track-record/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const { engine } = await manager.getEngine(assemblyId);
    const trackRecord = await engine.prediction.trackRecord(pid as ParticipantId);

    return c.json(trackRecord);
  });

  return app;
}
