/**
 * Voting routes — vote casting and tally.
 */

import { Hono } from "hono";
import type { ParticipantId, IssueId, VotingEventId, VoteChoice } from "@votiverse/core";
import { ValidationError } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, getParticipantId } from "../middleware/auth.js";
import { getDelegationVisibility } from "./shared.js";

export function votingRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/votes — cast vote. Sovereignty enforced via requireParticipant. */
  app.post(
    "/assemblies/:id/votes",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const body = await c.req.json<{
        issueId: string;
        choice: string | string[];
      }>();

      if (!body.issueId || body.choice === undefined) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "issueId and choice are required" } },
          400,
        );
      }

      const participantId = c.get("participantId") as string;
      const { engine } = await manager.getEngine(assemblyId);
      try {
        await engine.voting.cast(
          participantId as ParticipantId,
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

      return c.json({ status: "ok", participantId, issueId: body.issueId });
    },
  );

  /** GET /assemblies/:id/events/:eid/tally — get tally results. */
  app.get("/assemblies/:id/events/:eid/tally", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const info = await manager.getAssemblyInfo(assemblyId);
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

    const now = manager.timeProvider.now();
    const votingEnded = votingEvent.timeline.votingEnd <= now;
    const isSealed = !info.config.ballot.liveResults && !votingEnded;

    // For closed events, try materialized data first; compute live for open events
    const tallies = [];
    for (const issueId of votingEvent.issueIds) {
      if (isSealed) {
        // Sealed: compute live to get participation count, but hide choices
        const tally = await engine.voting.tally(issueId);
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
      } else if (votingEnded) {
        // Closed: use materialized data if available
        const cached = await manager.getTally(assemblyId, issueId);
        if (cached) {
          tallies.push({ ...cached, sealed: false });
        } else {
          const tally = await engine.voting.tally(issueId);
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
      } else {
        // Open: always compute live
        const tally = await engine.voting.tally(issueId);
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

    // Materialize all data for closed events (lazy, idempotent)
    if (votingEnded) {
      await manager.materializeClosedEvent(assemblyId, eid);
    }

    return c.json({ eventId: eid, tallies });
  });

  /** GET /assemblies/:id/events/:eid/participation — participation records. */
  app.get("/assemblies/:id/events/:eid/participation", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");
    const rawPid = c.req.query("participantId");
    const participantId = rawPid ?? undefined;
    const callerId = getParticipantId(c);

    const info = await manager.getAssemblyInfo(assemblyId);
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

    const { secret: isSecretBallot } = info.config.ballot;
    const delegationVisibility = getDelegationVisibility(info.config);

    // Access control: in private delegation mode, you can only query your own participation
    // Exception: vote transparency — delegators can query their transparent delegate's records
    if (delegationVisibility.mode === "private" && participantId && participantId !== callerId) {
      let allowed = false;
      if (callerId) {
        try {
          const callerDelegations = await engine.delegation.listActive(callerId as ParticipantId);
          const delegatesToTarget = callerDelegations.some((d) => d.targetId === participantId);
          if (delegatesToTarget) {
            const candidacy = await engine.candidacies.getByParticipant(participantId as ParticipantId);
            if (candidacy?.status === "active" && candidacy.voteTransparencyOptIn) {
              allowed = true;
            }
          }
        } catch {
          // Lookup failure — fall through to deny
        }
      }
      if (!allowed) {
        return c.json(
          { error: { code: "FORBIDDEN", message: "Cannot view another participant's participation in private visibility mode" } },
          403,
        );
      }
    }

    // Materialize if not yet done (idempotent)
    for (const issueId of votingEvent.issueIds) {
      await manager.materializeParticipation(assemblyId, issueId);
    }

    // Collect raw records
    const rawRecords = [];
    for (const issueId of votingEvent.issueIds) {
      const records = await manager.getParticipation(assemblyId, issueId, participantId);
      rawRecords.push(...records);
    }

    // Build a set of participant IDs that the caller delegates to (for vote transparency)
    const callerDelegateIds = new Set<string>();
    if (callerId) {
      const allDelegations = await engine.delegation.listActive(callerId as ParticipantId);
      for (const d of allDelegations) {
        callerDelegateIds.add(d.targetId);
      }
    }

    // Cache: candidacy lookups (participant → voteTransparencyOptIn)
    const transparencyCache = new Map<string, boolean>();
    async function isTransparentCandidate(pid: string): Promise<boolean> {
      if (transparencyCache.has(pid)) return transparencyCache.get(pid)!;
      try {
        const candidacy = await engine.candidacies.getByParticipant(pid as ParticipantId);
        const transparent = candidacy?.status === "active" && candidacy.voteTransparencyOptIn === true;
        transparencyCache.set(pid, transparent);
        return transparent;
      } catch {
        transparencyCache.set(pid, false);
        return false;
      }
    }

    // Apply secrecy filtering to effectiveChoice
    const participation = [];
    for (const record of rawRecords) {
      const isOwnRecord = callerId === record.participantId;
      let filteredChoice: unknown = record.effectiveChoice;

      if (isSecretBallot) {
        // Secret ballot: restrict who sees choices
        if (isOwnRecord && record.status === "direct") {
          // You always know your own direct vote
          filteredChoice = record.effectiveChoice;
        } else if (isOwnRecord && record.status === "delegated") {
          // Delegates are always accountable to delegators — you can see how they voted
          filteredChoice = record.effectiveChoice;
        } else if (
          // Vote transparency: caller delegates to this participant,
          // and the participant is an opted-in candidate
          callerId && callerDelegateIds.has(record.participantId) &&
          await isTransparentCandidate(record.participantId)
        ) {
          // Candidate opted into transparency — reveal their vote to delegators.
          // If they voted directly, show the choice.
          // If they delegated or abstained, show that status (choice stays null).
          if (record.status === "direct") {
            filteredChoice = record.effectiveChoice;
          } else {
            // Didn't vote directly — reveal status but not choice
            // (they may have delegated further or abstained)
            filteredChoice = null;
          }
        } else {
          // Not your record, not your transparent delegate — hide choice
          filteredChoice = null;
        }
      }

      // In private delegation mode, strip structural info from other people's records
      // Exception: transparent delegates — their delegators can see their vote
      const isTransparentDelegate = callerId !== undefined &&
        callerDelegateIds.has(record.participantId) &&
        transparencyCache.get(record.participantId) === true;

      if (delegationVisibility.mode === "private" && !isOwnRecord && !isTransparentDelegate) {
        participation.push({
          participantId: record.participantId,
          issueId: record.issueId,
          status: record.status,
          effectiveChoice: null,
          delegateId: null,
          terminalVoterId: null,
          chain: [],
        });
        continue;
      }

      participation.push({
        ...record,
        effectiveChoice: filteredChoice,
      });
    }

    return c.json({ eventId: eid, participation });
  });

  /** GET /assemblies/:id/events/:eid/weights — get weight distribution. */
  app.get("/assemblies/:id/events/:eid/weights", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const info = await manager.getAssemblyInfo(assemblyId);
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

    const { secret: isSecretBallot, liveResults } = info.config.ballot;

    // Per-participant weights reveal who voted — forbidden under secret ballot
    if (isSecretBallot) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Per-participant weight breakdown is not available under secret ballot" } },
        403,
      );
    }

    // Sealed results: weights not available until voting ends
    const now = manager.timeProvider.now();
    if (
      !liveResults &&
      votingEvent.timeline.votingEnd > now
    ) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Vote weight breakdown is not available until voting ends (sealed results)" } },
        403,
      );
    }

    const votingEnded = votingEvent.timeline.votingEnd <= now;
    const weightDists = [];
    for (const issueId of votingEvent.issueIds) {
      // Use materialized weights for closed events
      if (votingEnded) {
        const cached = await manager.getWeights(assemblyId, issueId);
        if (cached) {
          weightDists.push(cached);
          continue;
        }
      }
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
