/**
 * Prediction routes.
 */

import { Hono } from "hono";
import type { ParticipantId } from "@votiverse/core";
import type { PredictionId, CommitPredictionParams, RecordOutcomeParams } from "@votiverse/prediction";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function predictionRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/predictions — list predictions for a participant. */
  app.get("/assemblies/:id/predictions", async (c) => {
    const assemblyId = c.req.param("id");
    const participantId = c.req.query("participantId");

    if (!participantId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId query parameter is required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const predictions = await engine.prediction.getPredictionsByParticipant(participantId as ParticipantId);

    return c.json({
      predictions: predictions.map((p) => ({
        id: p.id,
        proposalId: p.proposalId,
        participantId: p.participantId,
        claim: p.claim,
        commitmentHash: p.commitmentHash,
        committedAt: new Date(p.committedAt).toISOString(),
      })),
    });
  });

  /** POST /assemblies/:id/predictions — commit prediction. */
  app.post("/assemblies/:id/predictions", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<CommitPredictionParams>();

    const { engine } = await manager.getEngine(assemblyId);
    const prediction = await engine.prediction.commit(body);

    return c.json({
      id: prediction.id,
      proposalId: prediction.proposalId,
      participantId: prediction.participantId,
      claim: prediction.claim,
      commitmentHash: prediction.commitmentHash,
      status: prediction.status,
      committedAt: new Date(prediction.committedAt).toISOString(),
    }, 201);
  });

  /** POST /assemblies/:id/outcomes — record outcome. */
  app.post("/assemblies/:id/outcomes", async (c) => {
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
