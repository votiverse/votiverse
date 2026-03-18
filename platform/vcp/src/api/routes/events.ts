/**
 * Voting event routes.
 */

import { Hono } from "hono";
import type { ParticipantId, TopicId, IssueId } from "@votiverse/core";
import { timestamp } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireScope, requireParticipant } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

interface CreateEventBody {
  title: string;
  description: string;
  issues: Array<{
    title: string;
    description: string;
    topicIds: string[];
    choices?: string[];
  }>;
  eligibleParticipantIds: string[];
  timeline: {
    deliberationStart: string | number;
    votingStart: string | number;
    votingEnd: string | number;
  };
}

function toTimestamp(value: string | number): ReturnType<typeof timestamp> {
  if (typeof value === "number") return timestamp(value);
  return timestamp(new Date(value).getTime());
}

export function eventRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/events — create voting event. */
  app.post("/assemblies/:id/events", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<CreateEventBody>();

    if (!body.title || !body.issues || !body.timeline) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "title, issues, and timeline are required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);

    const votingEvent = await engine.events.create({
      title: body.title,
      description: body.description ?? "",
      issues: body.issues.map((i) => ({
        title: i.title,
        description: i.description ?? "",
        topicIds: (i.topicIds ?? []) as TopicId[],
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: body.eligibleParticipantIds as ParticipantId[],
      timeline: {
        deliberationStart: toTimestamp(body.timeline.deliberationStart),
        votingStart: toTimestamp(body.timeline.votingStart),
        votingEnd: toTimestamp(body.timeline.votingEnd),
      },
    });

    // Persist issue details
    const issues = votingEvent.issueIds.map((id) => engine.events.getIssue(id as IssueId)!);
    await manager.persistIssues(assemblyId, issues);

    // Record event creator (if participant identity is available)
    const creatorId = c.req.header("X-Participant-Id");
    if (creatorId) {
      const db = manager.getDatabase();
      await db.run(
        `INSERT OR IGNORE INTO voting_event_creators (assembly_id, event_id, participant_id) VALUES (?, ?, ?)`,
        [assemblyId, votingEvent.id, creatorId],
      );
    }

    return c.json({
      id: votingEvent.id,
      title: votingEvent.title,
      description: votingEvent.description,
      issueIds: votingEvent.issueIds,
      issues: issues.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        topicIds: i.topicIds,
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: votingEvent.eligibleParticipantIds,
      timeline: {
        deliberationStart: new Date(votingEvent.timeline.deliberationStart).toISOString(),
        votingStart: new Date(votingEvent.timeline.votingStart).toISOString(),
        votingEnd: new Date(votingEvent.timeline.votingEnd).toISOString(),
      },
      createdAt: new Date(votingEvent.createdAt).toISOString(),
    }, 201);
  });

  /** GET /assemblies/:id/events/:eid — get event status. */
  app.get("/assemblies/:id/events/:eid", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as import("@votiverse/core").VotingEventId);

    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    const issues = votingEvent.issueIds.map((id) => {
      const issue = engine.events.getIssue(id as IssueId);
      if (!issue) return { id };
      return {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        topicIds: issue.topicIds,
        ...(issue.choices ? { choices: issue.choices } : {}),
      };
    });

    // Look up creator
    const db = manager.getDatabase();
    const creatorRow = await db.queryOne<{ participant_id: string }>(
      `SELECT participant_id FROM voting_event_creators WHERE assembly_id = ? AND event_id = ?`,
      [assemblyId, eid],
    );

    return c.json({
      id: votingEvent.id,
      title: votingEvent.title,
      description: votingEvent.description,
      issues,
      eligibleParticipantIds: votingEvent.eligibleParticipantIds,
      timeline: {
        deliberationStart: new Date(votingEvent.timeline.deliberationStart).toISOString(),
        votingStart: new Date(votingEvent.timeline.votingStart).toISOString(),
        votingEnd: new Date(votingEvent.timeline.votingEnd).toISOString(),
      },
      createdBy: creatorRow?.participant_id ?? undefined,
      createdAt: new Date(votingEvent.createdAt).toISOString(),
    });
  });

  /** GET /assemblies/:id/events — list events (paginated). */
  app.get("/assemblies/:id/events", async (c) => {
    const assemblyId = c.req.param("id");
    const { engine } = await manager.getEngine(assemblyId);
    const allEvents = engine.events.list().map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      issueIds: e.issueIds,
      createdAt: new Date(e.createdAt).toISOString(),
    }));
    const { data, pagination } = paginate(allEvents, parsePagination(c));
    return c.json({ events: data, pagination });
  });

  return app;
}
