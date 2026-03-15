/**
 * Voting routes — vote casting and tally.
 */

import { Hono } from "hono";
import type { ParticipantId, IssueId, VotingEventId, VoteChoice } from "@votiverse/core";
import { ValidationError } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function votingRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/votes — cast vote. */
  app.post("/assemblies/:id/votes", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<{
      participantId: string;
      issueId: string;
      choice: string | string[];
    }>();

    if (!body.participantId || !body.issueId || body.choice === undefined) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId, issueId, and choice are required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    try {
      await engine.voting.cast(
        body.participantId as ParticipantId,
        body.issueId as IssueId,
        body.choice as VoteChoice,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: err.message } },
          400,
        );
      }
      throw err;
    }

    return c.json({ status: "ok", participantId: body.participantId, issueId: body.issueId });
  });

  /** GET /assemblies/:id/events/:eid/tally — get tally results. */
  app.get("/assemblies/:id/events/:eid/tally", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as VotingEventId);
    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    // Compute tallies for all issues in the event
    const tallies = [];
    for (const issueId of votingEvent.issueIds) {
      const tally = await engine.voting.tally(issueId);
      tallies.push({
        issueId: tally.issueId,
        winner: tally.winner,
        counts: Object.fromEntries(tally.counts),
        totalVotes: tally.totalVotes,
        quorumMet: tally.quorumMet,
        quorumThreshold: tally.quorumThreshold,
        eligibleCount: tally.eligibleCount,
        participatingCount: tally.participatingCount,
      });
    }

    return c.json({ eventId: eid, tallies });
  });

  /** GET /assemblies/:id/events/:eid/weights — get weight distribution. */
  app.get("/assemblies/:id/events/:eid/weights", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as VotingEventId);
    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    const weightDists = [];
    for (const issueId of votingEvent.issueIds) {
      const weights = await engine.delegation.weights(issueId);
      weightDists.push({
        issueId: weights.issueId,
        weights: Object.fromEntries(weights.weights),
        totalWeight: weights.totalWeight,
      });
    }

    return c.json({ eventId: eid, weights: weightDists });
  });

  return app;
}
