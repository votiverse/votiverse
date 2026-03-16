/**
 * Voting routes — vote casting and tally.
 */

import { Hono } from "hono";
import type { ParticipantId, IssueId, VotingEventId, VoteChoice } from "@votiverse/core";
import { ValidationError } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { getParticipantId } from "../middleware/auth.js";

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

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as VotingEventId);
    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    const { resultsVisibility } = info.config.ballot;
    const now = Date.now();
    const votingEnded = votingEvent.timeline.votingEnd <= now;
    const isSealed = resultsVisibility === "sealed" && !votingEnded;

    // Compute tallies for all issues in the event
    const tallies = [];
    for (const issueId of votingEvent.issueIds) {
      const tally = await engine.voting.tally(issueId);

      if (isSealed) {
        // Return participation metadata only — no choice distribution
        tallies.push({
          issueId: tally.issueId,
          sealed: true,
          winner: null,
          counts: {},
          totalVotes: 0,
          quorumMet: tally.quorumMet,
          quorumThreshold: tally.quorumThreshold,
          eligibleCount: tally.eligibleCount,
          participatingCount: tally.participatingCount,
        });
      } else {
        tallies.push({
          issueId: tally.issueId,
          sealed: false,
          winner: tally.winner,
          counts: Object.fromEntries(tally.counts),
          totalVotes: tally.totalVotes,
          quorumMet: tally.quorumMet,
          quorumThreshold: tally.quorumThreshold,
          eligibleCount: tally.eligibleCount,
          participatingCount: tally.participatingCount,
        });
      }
    }

    // Materialize participation records for closed events (lazy, idempotent)
    if (votingEnded) {
      for (const issueId of votingEvent.issueIds) {
        await manager.materializeParticipation(assemblyId, issueId);
      }
    }

    return c.json({ eventId: eid, tallies });
  });

  /** GET /assemblies/:id/events/:eid/participation — participation records. */
  app.get("/assemblies/:id/events/:eid/participation", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");
    const rawPid = c.req.query("participantId");
    const participantId = rawPid ? manager.resolveId(assemblyId, rawPid) : undefined;
    const callerId = getParticipantId(c);

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as VotingEventId);
    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    const { secrecy, delegateVoteVisibility } = info.config.ballot;
    const delegationVisibility = info.config.delegation.visibility ?? { mode: "public" as const };

    // Access control: in private delegation mode, you can only query your own participation
    if (delegationVisibility.mode === "private" && participantId && participantId !== callerId) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Cannot view another participant's participation in private visibility mode" } },
        403,
      );
    }

    // Materialize if not yet done (idempotent)
    for (const issueId of votingEvent.issueIds) {
      await manager.materializeParticipation(assemblyId, issueId);
    }

    // Collect raw records
    const rawRecords = [];
    for (const issueId of votingEvent.issueIds) {
      const records = manager.getParticipation(assemblyId, issueId, participantId);
      rawRecords.push(...records);
    }

    // Apply secrecy filtering to effectiveChoice
    const participation = rawRecords.map((record) => {
      const isOwnRecord = callerId === record.participantId;
      let filteredChoice: unknown = record.effectiveChoice;

      if (secrecy !== "public") {
        // Secret or anonymous-auditable: restrict who sees choices
        if (isOwnRecord && record.status === "direct") {
          // You always know your own direct vote
          filteredChoice = record.effectiveChoice;
        } else if (isOwnRecord && record.status === "delegated") {
          // You delegated — can you see how your delegate voted?
          if (delegateVoteVisibility === "private") {
            filteredChoice = null;
          }
          // "public" or "delegators-only": you ARE the delegator, so you can see
        } else {
          // Not your record — never reveal choices under secret/anonymous-auditable
          filteredChoice = null;
        }
      }

      // In private delegation mode, strip structural info from other people's records
      if (delegationVisibility.mode === "private" && !isOwnRecord) {
        return {
          participantId: record.participantId,
          issueId: record.issueId,
          status: record.status,
          effectiveChoice: null,
          delegateId: null,
          terminalVoterId: null,
          chain: [],
        };
      }

      return {
        ...record,
        effectiveChoice: filteredChoice,
      };
    });

    return c.json({ eventId: eid, participation });
  });

  /** GET /assemblies/:id/events/:eid/weights — get weight distribution. */
  app.get("/assemblies/:id/events/:eid/weights", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as VotingEventId);
    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    const { secrecy, resultsVisibility } = info.config.ballot;

    // Per-participant weights reveal who voted — forbidden under secret ballot
    if (secrecy !== "public") {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Per-participant weight breakdown is not available under secret ballot" } },
        403,
      );
    }

    // Sealed results: weights not available until voting ends
    const now = Date.now();
    if (
      resultsVisibility === "sealed" &&
      votingEvent.timeline.votingEnd > now
    ) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Vote weight breakdown is not available until voting ends (sealed results)" } },
        403,
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
