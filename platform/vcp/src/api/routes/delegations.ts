/**
 * Delegation routes — with sovereignty enforcement and visibility filtering.
 */

import { Hono } from "hono";
import type { ParticipantId, TopicId, IssueId } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, getParticipantId } from "../middleware/auth.js";
import { DEFAULT_DELEGATION_VISIBILITY } from "./shared.js";

export function delegationRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/delegations — create delegation. */
  app.post(
    "/assemblies/:id/delegations",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const body = await c.req.json<{
        sourceId?: string;
        targetId: string;
        topicScope?: string[];
      }>();

      if (!body.targetId) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "targetId is required" } },
          400,
        );
      }

      // Sovereignty: source is always the authenticated participant
      const authenticatedPid = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      const delegation = await engine.delegation.create({
        sourceId: authenticatedPid as ParticipantId,
        targetId: body.targetId as ParticipantId,
        topicScope: (body.topicScope ?? []) as TopicId[],
      });

      return c.json({
        id: delegation.id,
        sourceId: delegation.sourceId,
        targetId: delegation.targetId,
        topicScope: delegation.topicScope,
        createdAt: new Date(delegation.createdAt).toISOString(),
        active: delegation.active,
      }, 201);
    },
  );

  /** DELETE /assemblies/:id/delegations/:did — revoke delegation. */
  app.delete(
    "/assemblies/:id/delegations/:did",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const did = c.req.param("did");
      const authenticatedPid = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);

      // Find the delegation to check sovereignty
      const allDelegations = await engine.delegation.listActive();
      const delegation = allDelegations.find((d) => d.id === did);
      if (!delegation) {
        return c.json(
          { error: { code: "NOT_FOUND", message: `Delegation "${did}" not found` } },
          404,
        );
      }

      // Sovereignty: only the source can revoke their own delegation
      if (delegation.sourceId !== authenticatedPid) {
        return c.json(
          { error: { code: "FORBIDDEN", message: "Only the delegator can revoke their own delegation" } },
          403,
        );
      }

      await engine.delegation.revoke({
        sourceId: delegation.sourceId,
        topicScope: delegation.topicScope,
      });

      return c.body(null, 204);
    },
  );

  /** GET /assemblies/:id/delegations — list delegations with visibility filtering. */
  app.get("/assemblies/:id/delegations", async (c) => {
    const assemblyId = c.req.param("id");
    const rawSourceId = c.req.query("sourceId");
    const sourceId = rawSourceId ?? undefined;

    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    let delegations = await engine.delegation.listActive(
      sourceId ? (sourceId as ParticipantId) : undefined,
    );

    // Visibility filtering (default to public if not set for backward compat)
    const visibility = info.config.delegation.visibility ?? DEFAULT_DELEGATION_VISIBILITY;
    if (visibility.mode === "private") {
      const rawCallerId = getParticipantId(c);
      if (!rawCallerId) {
        return c.json({ delegations: [] });
      }
      const callerId = rawCallerId;
      // Show only delegations where caller is source or target
      delegations = delegations.filter(
        (d) => d.sourceId === callerId || d.targetId === callerId,
      );
    }

    return c.json({
      delegations: delegations.map((d) => ({
        id: d.id,
        sourceId: d.sourceId,
        targetId: d.targetId,
        topicScope: d.topicScope,
        createdAt: new Date(d.createdAt).toISOString(),
        active: d.active,
      })),
    });
  });

  /** GET /assemblies/:id/delegations/chain — resolve chain for participant. */
  app.get("/assemblies/:id/delegations/chain", async (c) => {
    const assemblyId = c.req.param("id");
    const rawParticipantId = c.req.query("participantId");
    const issueId = c.req.query("issueId");

    if (!rawParticipantId || !issueId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId and issueId query parameters are required" } },
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

    const participantId = rawParticipantId;

    // Visibility: in private mode, only resolve your own chain
    const chainVisibility = info.config.delegation.visibility ?? DEFAULT_DELEGATION_VISIBILITY;
    if (chainVisibility.mode === "private") {
      const rawCallerId = getParticipantId(c);
      const callerId = rawCallerId ?? undefined;
      if (callerId !== participantId) {
        return c.json(
          { error: { code: "FORBIDDEN", message: "Cannot resolve another participant's chain in private visibility mode" } },
          403,
        );
      }
    }

    const { engine } = await manager.getEngine(assemblyId);
    const chain = await engine.delegation.resolve(
      participantId as ParticipantId,
      issueId as IssueId,
    );

    return c.json({
      participantId: chain.participantId,
      issueId: chain.issueId,
      chain: chain.chain,
      terminalVoter: chain.terminalVoter,
      votedDirectly: chain.votedDirectly,
    });
  });

  /** GET /assemblies/:id/delegations/my-weight — delegate's weight for an issue. */
  app.get("/assemblies/:id/delegations/my-weight", async (c) => {
    const assemblyId = c.req.param("id");
    const issueId = c.req.query("issueId");
    const rawCallerId = getParticipantId(c);

    if (!rawCallerId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "X-Participant-Id header is required" } },
        400,
      );
    }

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

    const callerId = rawCallerId;
    const { engine } = await manager.getEngine(assemblyId);

    const weights = await engine.delegation.weights(issueId as IssueId);

    const directWeight = 1;
    const totalWeight = weights.weights.get(callerId as ParticipantId) ?? 0;
    const delegatedWeight = Math.max(0, totalWeight - directWeight);

    // Find delegators to this participant
    const allDelegations = await engine.delegation.listActive();
    const delegatorsToMe = allDelegations.filter((d) => d.targetId === callerId);

    // Filter delegators by incomingVisibility config
    const weightVisibility = info.config.delegation.visibility ?? DEFAULT_DELEGATION_VISIBILITY;
    let delegators: string[];
    if (weightVisibility.incomingVisibility === "direct") {
      delegators = delegatorsToMe.map((d) => d.sourceId);
    } else {
      // chain: include all upstream delegators (transitive)
      delegators = delegatorsToMe.map((d) => d.sourceId);
      // For chain visibility, also include indirect delegators
      const indirectDelegators = new Set<string>();
      const findUpstream = (targetId: string) => {
        const upstream = allDelegations.filter((d) => d.targetId === targetId && d.sourceId !== callerId);
        for (const d of upstream) {
          if (!indirectDelegators.has(d.sourceId)) {
            indirectDelegators.add(d.sourceId);
            findUpstream(d.sourceId);
          }
        }
      };
      for (const d of delegatorsToMe) {
        findUpstream(d.sourceId);
      }
      delegators = [...new Set([...delegators, ...indirectDelegators])];
    }

    return c.json({
      participantId: callerId,
      issueId,
      directWeight,
      delegatedWeight,
      totalWeight,
      delegatorsCount: delegatorsToMe.length,
      delegators,
    });
  });

  return app;
}
