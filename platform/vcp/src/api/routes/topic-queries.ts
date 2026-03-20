/**
 * Topic query routes — issues and delegations filtered by topic.
 *
 * These endpoints power the topic navigation UI: browsing issues and
 * delegations scoped to a specific topic (or a root topic and all its children).
 */

import { Hono } from "hono";
import type { IssueId, ParticipantId } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { getParticipantId } from "../middleware/auth.js";
import { DEFAULT_DELEGATION_VISIBILITY } from "./shared.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function topicQueryRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/topics/:topicId/issues — issues for a topic (includes children if root). */
  app.get("/assemblies/:id/topics/:topicId/issues", async (c) => {
    const assemblyId = c.req.param("id");
    const topicId = c.req.param("topicId");

    const topics = await manager.listTopics(assemblyId);
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Topic "${topicId}" not found` } },
        404,
      );
    }

    // Build relevant topic IDs: if root, include self + all children; if child, just self
    const relevantIds = new Set<string>([topicId]);
    if (topic.parentId === null) {
      for (const t of topics) {
        if (t.parentId === topicId) {
          relevantIds.add(t.id);
        }
      }
    }

    const { engine } = await manager.getEngine(assemblyId);
    const allEvents = engine.events.list();
    const allIssues = engine.events.listIssues();
    const now = manager.timeProvider.now();

    // Collect issues whose topicId is in the relevant set
    const issueItems: Array<{
      issue: {
        id: string;
        title: string;
        description: string;
        topicId: string | null;
        choices?: string[];
        cancelled: boolean;
      };
      event: {
        id: string;
        title: string;
        timeline: {
          deliberationStart: string;
          votingStart: string;
          votingEnd: string;
        };
      };
    }> = [];

    for (const issue of allIssues) {
      if (!issue.topicId || !relevantIds.has(issue.topicId)) continue;

      const votingEvent = allEvents.find((e) => e.issueIds.includes(issue.id as IssueId));
      if (!votingEvent) continue;

      issueItems.push({
        issue: {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          topicId: issue.topicId,
          ...(issue.choices ? { choices: issue.choices } : {}),
          cancelled: engine.events.isIssueCancelled(issue.id as IssueId),
        },
        event: {
          id: votingEvent.id,
          title: votingEvent.title,
          timeline: {
            deliberationStart: new Date(votingEvent.timeline.deliberationStart).toISOString(),
            votingStart: new Date(votingEvent.timeline.votingStart).toISOString(),
            votingEnd: new Date(votingEvent.timeline.votingEnd).toISOString(),
          },
        },
      });
    }

    // Sort: active issues first (voting window currently open), then by votingStart desc
    issueItems.sort((a, b) => {
      const aVotingEnd = new Date(a.event.timeline.votingEnd).getTime();
      const bVotingEnd = new Date(b.event.timeline.votingEnd).getTime();
      const aVotingStart = new Date(a.event.timeline.votingStart).getTime();
      const bVotingStart = new Date(b.event.timeline.votingStart).getTime();
      const aActive = aVotingStart <= now && now < aVotingEnd;
      const bActive = bVotingStart <= now && now < bVotingEnd;

      if (aActive !== bActive) return aActive ? -1 : 1;
      if (aActive) return bVotingStart - aVotingStart; // active: most recent first
      return bVotingEnd - aVotingEnd; // closed: most recently ended first
    });

    const { data, pagination } = paginate(issueItems, parsePagination(c));
    return c.json({ issues: data, pagination });
  });

  /** GET /assemblies/:id/topics/:topicId/delegations — delegations for a topic, aggregated by delegate. */
  app.get("/assemblies/:id/topics/:topicId/delegations", async (c) => {
    const assemblyId = c.req.param("id");
    const topicId = c.req.param("topicId");

    const topics = await manager.listTopics(assemblyId);
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Topic "${topicId}" not found` } },
        404,
      );
    }

    // Build relevant topic IDs
    const relevantIds = new Set<string>([topicId]);
    if (topic.parentId === null) {
      for (const t of topics) {
        if (t.parentId === topicId) {
          relevantIds.add(t.id);
        }
      }
    }

    const info = await manager.getAssemblyInfo(assemblyId);
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${assemblyId}" not found` } },
        404,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    let allDelegations = await engine.delegation.listActive();

    // Apply delegation visibility rules
    const visibility = info.config.delegation.visibility ?? DEFAULT_DELEGATION_VISIBILITY;
    if (visibility.mode === "private") {
      const callerId = getParticipantId(c);
      if (!callerId) {
        return c.json({ delegations: [], pagination: { limit: 50, offset: 0, total: 0 } });
      }
      allDelegations = allDelegations.filter(
        (d) => d.sourceId === callerId || d.targetId === callerId,
      );
    }

    // Filter: delegation's topicScope includes any relevant topic ID,
    // or global delegations (empty topicScope) match all topics
    const matchingDelegations = allDelegations.filter((d) => {
      if (d.topicScope.length === 0) return true; // global delegation matches all topics
      return d.topicScope.some((ts) => relevantIds.has(ts));
    });

    // Get participant names
    const participants = await manager.listParticipants(assemblyId);
    const nameMap = new Map(participants.map((p) => [p.id, p.name]));

    // Aggregate by delegate (targetId)
    const delegateMap = new Map<string, { delegators: Array<{ id: string; name: string }> }>();
    for (const d of matchingDelegations) {
      const existing = delegateMap.get(d.targetId);
      const delegator = { id: d.sourceId, name: nameMap.get(d.sourceId) ?? d.sourceId };
      if (existing) {
        // Avoid duplicate delegators (same source may have multiple scoped delegations)
        if (!existing.delegators.some((dl) => dl.id === d.sourceId)) {
          existing.delegators.push(delegator);
        }
      } else {
        delegateMap.set(d.targetId, { delegators: [delegator] });
      }
    }

    // Build response sorted by weight (most delegators first)
    const delegationItems = [...delegateMap.entries()]
      .map(([targetId, { delegators }]) => ({
        delegate: { id: targetId, name: nameMap.get(targetId) ?? targetId },
        delegators,
        totalWeight: delegators.length + 1, // delegators + self
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight);

    const { data, pagination } = paginate(delegationItems, parsePagination(c));
    return c.json({ delegations: data, pagination });
  });

  return app;
}
