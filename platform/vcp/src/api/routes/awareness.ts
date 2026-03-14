/**
 * Awareness routes.
 */

import { Hono } from "hono";
import type { IssueId, ParticipantId } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function awarenessRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/awareness/concentration — concentration metrics. */
  app.get("/assemblies/:id/awareness/concentration", async (c) => {
    const assemblyId = c.req.param("id");
    const issueId = c.req.query("issueId");

    if (!issueId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "issueId query parameter is required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const metrics = await engine.delegation.concentration(issueId as IssueId);

    return c.json({
      issueId: metrics.issueId,
      giniCoefficient: metrics.giniCoefficient,
      maxWeight: metrics.maxWeight,
      maxWeightHolder: metrics.maxWeightHolder,
      chainLengthDistribution: Object.fromEntries(metrics.chainLengthDistribution),
      delegatingCount: metrics.delegatingCount,
      directVoterCount: metrics.directVoterCount,
    });
  });

  /** GET /assemblies/:id/awareness/history/:pid — voting history. */
  app.get("/assemblies/:id/awareness/history/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const { engine } = await manager.getEngine(assemblyId);
    const store = engine.getEventStore();

    // Query vote events for this participant
    const voteEvents = await store.query({ types: ["VoteCast"] });
    const history = voteEvents
      .filter((e) => {
        const payload = e.payload as { participantId: string };
        return payload.participantId === pid;
      })
      .map((e) => {
        const payload = e.payload as { participantId: string; issueId: string; choice: string };
        return {
          issueId: payload.issueId,
          choice: payload.choice,
          votedAt: new Date(e.timestamp).toISOString(),
        };
      });

    return c.json({ participantId: pid, history });
  });

  /** GET /assemblies/:id/awareness/profile/:pid — delegate profile. */
  app.get("/assemblies/:id/awareness/profile/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const { engine } = await manager.getEngine(assemblyId);

    // Build profile from delegations where this participant is a target
    const allDelegations = await engine.delegation.listActive();
    const delegatorsToMe = allDelegations.filter((d) => d.targetId === pid);
    const myDelegations = allDelegations.filter((d) => d.sourceId === pid);

    // Get participant info
    const participant = await engine.identity.getParticipant(pid as ParticipantId);

    return c.json({
      participantId: pid,
      name: participant?.name ?? null,
      delegatorsCount: delegatorsToMe.length,
      delegatorsIds: delegatorsToMe.map((d) => d.sourceId),
      myDelegations: myDelegations.map((d) => ({
        targetId: d.targetId,
        topicScope: d.topicScope,
      })),
    });
  });

  // Stub endpoints — return 501
  app.get("/assemblies/:id/awareness/context/:eid", (c) => {
    return c.json(
      { error: { code: "NOT_IMPLEMENTED", message: "Historical context is not yet implemented" } },
      501,
    );
  });

  app.get("/assemblies/:id/awareness/prompts/:pid", (c) => {
    return c.json(
      { error: { code: "NOT_IMPLEMENTED", message: "Engagement prompts are not yet implemented" } },
      501,
    );
  });

  return app;
}
