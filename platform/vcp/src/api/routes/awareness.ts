/**
 * Awareness routes — with delegation visibility filtering.
 */

import { Hono } from "hono";
import type { IssueId, ParticipantId } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { getParticipantId } from "../middleware/auth.js";
import { DEFAULT_DELEGATION_VISIBILITY } from "./shared.js";

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

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { secrecy } = info.config.ballot;

    // Try materialized data first
    const cached = manager.getConcentration(assemblyId, issueId);
    if (cached) {
      return c.json({
        ...cached,
        maxWeightHolder: secrecy === "public" ? cached.maxWeightHolder : null,
      });
    }

    // Compute live
    const { engine } = await manager.getEngine(assemblyId);
    const metrics = await engine.delegation.concentration(issueId as IssueId);

    return c.json({
      issueId: metrics.issueId,
      giniCoefficient: metrics.giniCoefficient,
      maxWeight: metrics.maxWeight,
      maxWeightHolder: secrecy === "public" ? metrics.maxWeightHolder : null,
      chainLengthDistribution: Object.fromEntries(metrics.chainLengthDistribution),
      delegatingCount: metrics.delegatingCount,
      directVoterCount: metrics.directVoterCount,
    });
  });

  /** GET /assemblies/:id/awareness/history/:pid — voting history. */
  app.get("/assemblies/:id/awareness/history/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = manager.resolveId(assemblyId, c.req.param("pid"));
    const callerId = getParticipantId(c);

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { secrecy } = info.config.ballot;
    const isOwnHistory = callerId === pid;

    // Under secret/anonymous-auditable ballot, only the participant can view their own history
    // (participation patterns — which issues, when — are individual-level information)
    if (secrecy !== "public" && !isOwnHistory) {
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

    // Query vote events for this participant
    const voteEvents = await store.query({ types: ["VoteCast"] });
    const history = voteEvents
      .filter((e) => {
        const payload = e.payload as { participantId: string };
        return payload.participantId === pid;
      })
      .map((e) => {
        const payload = e.payload as { participantId: string; issueId: string; choice: string };
        // Under secret/anonymous-auditable ballot, only the participant sees their own choices
        const includeChoice = secrecy === "public" || isOwnHistory;
        return {
          issueId: payload.issueId,
          issueTitle: issueTitles.get(payload.issueId) ?? null,
          ...(includeChoice ? { choice: payload.choice } : {}),
          votedAt: new Date(e.timestamp).toISOString(),
        };
      });

    return c.json({ participantId: pid, history });
  });

  /** GET /assemblies/:id/awareness/profile/:pid — delegate profile with visibility filtering. */
  app.get("/assemblies/:id/awareness/profile/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = manager.resolveId(assemblyId, c.req.param("pid"));

    const info = manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const callerId = getParticipantId(c);
    const visibility = info.config.delegation.visibility ?? DEFAULT_DELEGATION_VISIBILITY;

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
    } else if (isProfileSubject && visibility.incomingVisibility === "direct") {
      // Profile subject sees direct delegators only
      delegatorsIds = delegatorsToMe.map((d) => d.sourceId);
    } else if (isProfileSubject && visibility.incomingVisibility === "chain") {
      // Profile subject sees full upstream chain
      const allUpstream = new Set<string>();
      const findUpstream = (targetId: string) => {
        const upstream = allDelegations.filter((d) => d.targetId === targetId);
        for (const d of upstream) {
          if (!allUpstream.has(d.sourceId)) {
            allUpstream.add(d.sourceId);
            findUpstream(d.sourceId);
          }
        }
      };
      findUpstream(pid);
      delegatorsIds = [...allUpstream];
    } else {
      // Public mode, not the subject: show all
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
