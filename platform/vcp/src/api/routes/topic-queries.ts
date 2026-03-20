/**
 * Topic query routes — issues and delegations filtered by topic.
 *
 * These endpoints power the topic navigation UI: browsing issues and
 * delegations scoped to a specific topic (or a root topic and all its children).
 */

import { Hono } from "hono";
import type { TopicId, ParticipantId } from "@votiverse/core";
import type { Delegation } from "@votiverse/delegation";
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

  /**
   * GET /assemblies/:id/topics/:topicId/delegations — potential weight distribution for a topic.
   *
   * Computes who would carry how much weight if a vote opened on this topic.
   * Uses scope resolution: for each participant, finds the best matching delegation
   * (child topic > parent topic > global), then walks transitive chains to compute
   * final weight at each terminal delegate.
   *
   * No individual delegator names are exposed — just delegate name + weight.
   */
  app.get("/assemblies/:id/topics/:topicId/delegations", async (c) => {
    const assemblyId = c.req.param("id");
    const topicId = c.req.param("topicId") as TopicId;

    const topics = await manager.listTopics(assemblyId);
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Topic "${topicId}" not found` } },
        404,
      );
    }

    // Build the set of topic IDs relevant to this topic (self + children if root)
    const relevantIds = new Set<string>([topicId]);
    if (topic.parentId === null) {
      for (const t of topics) {
        if (t.parentId === topicId) relevantIds.add(t.id);
      }
    }
    // Also include ancestor topics (a delegation to the parent covers children)
    const ancestorIds = new Set<string>();
    let cur: string | null = topic.parentId;
    while (cur !== null) {
      ancestorIds.add(cur);
      const parent = topics.find((t) => t.id === cur);
      cur = parent?.parentId ?? null;
    }

    const { engine } = await manager.getEngine(assemblyId);
    const allDelegations = (await engine.delegation.listActive())
      .filter((d) => d.issueScope === null); // Exclude issue-scoped delegations

    // For each participant, resolve their best delegation for this topic.
    // Precedence: direct topic match > parent/ancestor match > global.
    const bySource = new Map<string, Delegation[]>();
    for (const d of allDelegations) {
      const arr = bySource.get(d.sourceId) ?? [];
      arr.push(d);
      bySource.set(d.sourceId, arr);
    }

    // resolved: sourceId → targetId (each participant's effective delegate for this topic)
    const resolved = new Map<string, string>();
    for (const [sourceId, delegations] of bySource) {
      let best: Delegation | undefined;
      let bestSpecificity = -1;

      for (const d of delegations) {
        let specificity = -1;
        if (d.topicScope.length === 0) {
          specificity = 0; // global
        } else if (d.topicScope.some((ts) => relevantIds.has(ts))) {
          specificity = 2; // direct match on this topic or its children
        } else if (d.topicScope.some((ts) => ancestorIds.has(ts))) {
          specificity = 1; // parent/ancestor match
        }
        if (specificity < 0) continue;
        if (specificity > bestSpecificity || (specificity === bestSpecificity && best && d.createdAt > best.createdAt)) {
          best = d;
          bestSpecificity = specificity;
        }
      }
      if (best) resolved.set(sourceId, best.targetId);
    }

    // Count direct incoming delegations per delegate.
    // Weight = 1 (self) + number of people who resolve to this delegate.
    // This represents "how many votes they'd carry if they voted directly"
    // (the override rule would break any outgoing chain).
    const participants = await manager.listParticipants(assemblyId);
    const incomingCount = new Map<string, number>();

    for (const [_sourceId, targetId] of resolved) {
      incomingCount.set(targetId, (incomingCount.get(targetId) ?? 0) + 1);
    }

    // Build response: only include participants who receive at least one delegation
    const nameMap = new Map(participants.map((p) => [p.id, p.name]));
    const delegationItems: Array<{ delegate: { id: string; name: string }; weight: number }> = [];

    for (const [pid, count] of incomingCount) {
      delegationItems.push({
        delegate: { id: pid, name: nameMap.get(pid) ?? pid },
        weight: count + 1, // incoming delegations + self
      });
    }

    delegationItems.sort((a, b) => b.weight - a.weight);

    const { data, pagination } = paginate(delegationItems, parsePagination(c));
    return c.json({ delegations: data, pagination });
  });

  return app;
}
