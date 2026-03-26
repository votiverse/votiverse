/**
 * Awareness routes — with delegation visibility filtering.
 */

import { Hono } from "hono";
import type { ParticipantId } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { getParticipantId } from "../middleware/auth.js";
import { getDelegationVisibility } from "./shared.js";
import { getActiveVotes } from "@votiverse/voting";

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

    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { secret: isSecretBallot } = info.config.ballot;

    // Try materialized data first
    const cached = await manager.getConcentration(assemblyId, issueId);
    if (cached) {
      return c.json({
        ...cached,
        maxWeightHolder: !isSecretBallot ? cached.maxWeightHolder : null,
      });
    }

    // Compute live
    const { engine } = await manager.getEngine(assemblyId);
    const metrics = await engine.delegation.concentration(issueId as IssueId);

    return c.json({
      issueId: metrics.issueId,
      giniCoefficient: metrics.giniCoefficient,
      maxWeight: metrics.maxWeight,
      maxWeightHolder: !isSecretBallot ? metrics.maxWeightHolder : null,
      chainLengthDistribution: Object.fromEntries(metrics.chainLengthDistribution),
      delegatingCount: metrics.delegatingCount,
      directVoterCount: metrics.directVoterCount,
    });
  });

  /** GET /assemblies/:id/awareness/history/:pid — voting history. */
  app.get("/assemblies/:id/awareness/history/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");
    const callerId = getParticipantId(c);

    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { secret: isSecretBallot } = info.config.ballot;
    const isOwnHistory = callerId === pid;

    // Under secret ballot, only the participant can view their own history
    // (participation patterns — which issues, when — are individual-level information)
    if (isSecretBallot && !isOwnHistory) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Voting history is restricted to the participant under secret ballot" } },
        403,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const store = engine.getEventStore();

    // Build issueId → title map from VotingEventCreated events
    const issueTitles = new Map<string, string>();
    const eventCreatedEvents = await store.query({ types: ["VotingEventCreated"] });
    for (const evt of eventCreatedEvents) {
      const p = evt.payload as { issues?: Array<{ id: string; title: string }> };
      if (p.issues) {
        for (const issue of p.issues) {
          issueTitles.set(issue.id, issue.title);
        }
      }
    }

    // Query active votes using shared utility (single source of truth)
    const votes = await getActiveVotes(store, { participantId: pid as ParticipantId });

    const history = votes.map((v) => {
      const includeChoice = !isSecretBallot || isOwnHistory;
      const choice = typeof v.choice === "string" ? v.choice : (v.choice as string[]).join(",");
      return {
        issueId: v.issueId,
        issueTitle: issueTitles.get(v.issueId) ?? null,
        ...(includeChoice ? { choice } : {}),
        votedAt: new Date(v.timestamp).toISOString(),
      };
    });

    return c.json({ participantId: pid, history });
  });

  /** GET /assemblies/:id/awareness/profile/:pid — delegate profile with visibility filtering. */
  app.get("/assemblies/:id/awareness/profile/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");

    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const callerId = getParticipantId(c);
    const visibility = getDelegationVisibility(info.config);

    // Build profile from delegations
    const allDelegations = await engine.delegation.listActive();
    const delegatorsToMe = allDelegations.filter((d) => d.targetId === pid);
    const myDelegations = allDelegations.filter((d) => d.sourceId === pid);

    // Get participant info
    const participant = await engine.identity.getParticipant(pid as ParticipantId);

    // Visibility filtering for delegator IDs
    const isProfileSubject = callerId === pid;
    let delegatorsIds: string[] | undefined;

    if (visibility.mode === "private" && !isProfileSubject) {
      // Not the profile subject in private mode: count only, no IDs
      delegatorsIds = undefined;
    } else {
      // Public mode or profile subject: show direct delegators
      // (incomingVisibility is always "direct" in the new config model)
      delegatorsIds = delegatorsToMe.map((d) => d.sourceId);
    }

    // Resolve delegator names
    let delegators: Array<{ id: string; name: string | null }> | undefined;
    if (delegatorsIds !== undefined) {
      delegators = await Promise.all(
        delegatorsIds.map(async (id) => {
          const p = await engine.identity.getParticipant(id as ParticipantId);
          return { id, name: p?.name ?? null };
        }),
      );
    }

    // Resolve delegation target names
    const myDelegationsWithNames = await Promise.all(
      myDelegations.map(async (d) => {
        const target = await engine.identity.getParticipant(d.targetId as ParticipantId);
        return {
          targetId: d.targetId,
          targetName: target?.name ?? null,
          topicScope: d.topicScope,
        };
      }),
    );

    return c.json({
      participantId: pid,
      name: participant?.name ?? null,
      delegatorsCount: delegatorsToMe.length,
      ...(delegators !== undefined ? { delegators } : {}),
      // Keep delegatorsIds for backward compat
      ...(delegatorsIds !== undefined ? { delegatorsIds } : {}),
      myDelegations: myDelegationsWithNames,
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
