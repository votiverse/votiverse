/**
 * Delegation routes.
 */

import { Hono } from "hono";
import type { ParticipantId, TopicId, IssueId } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function delegationRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/delegations — create delegation. */
  app.post("/assemblies/:id/delegations", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<{
      sourceId: string;
      targetId: string;
      topicScope?: string[];
    }>();

    if (!body.sourceId || !body.targetId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "sourceId and targetId are required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const delegation = await engine.delegation.create({
      sourceId: body.sourceId as ParticipantId,
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
  });

  /** DELETE /assemblies/:id/delegations/:did — revoke delegation. */
  app.delete("/assemblies/:id/delegations/:did", async (c) => {
    const assemblyId = c.req.param("id");
    const did = c.req.param("did");

    const { engine } = await manager.getEngine(assemblyId);

    // Find the delegation to get source and scope for revocation
    const allDelegations = await engine.delegation.listActive();
    const delegation = allDelegations.find((d) => d.id === did);
    if (!delegation) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Delegation "${did}" not found` } },
        404,
      );
    }

    await engine.delegation.revoke({
      sourceId: delegation.sourceId,
      topicScope: delegation.topicScope,
    });

    return c.body(null, 204);
  });

  /** GET /assemblies/:id/delegations — list delegations. */
  app.get("/assemblies/:id/delegations", async (c) => {
    const assemblyId = c.req.param("id");
    const sourceId = c.req.query("sourceId");

    const { engine } = await manager.getEngine(assemblyId);
    const delegations = await engine.delegation.listActive(
      sourceId ? (sourceId as ParticipantId) : undefined,
    );

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
    const participantId = c.req.query("participantId");
    const issueId = c.req.query("issueId");

    if (!participantId || !issueId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId and issueId query parameters are required" } },
        400,
      );
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

  return app;
}
