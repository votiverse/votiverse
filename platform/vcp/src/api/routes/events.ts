/**
 * Voting event routes.
 */

import { Hono } from "hono";
import type { ParticipantId, TopicId, IssueId } from "@votiverse/core";
import { timestamp } from "@votiverse/core";
import type { VotiverseEngine } from "@votiverse/engine";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { computeTimeline } from "../../engine/event-phases.js";
import { requireScope, requireParticipant, getParticipantId } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

interface CreateEventBody {
  title: string;
  description: string;
  issues: Array<{
    title: string;
    description: string;
    topicId?: string | null;
    choices?: string[];
  }>;
  eligibleParticipantIds: string[];
  /** Full explicit timeline (backward compat). */
  timeline?: {
    deliberationStart: string | number;
    votingStart: string | number;
    votingEnd: string | number;
  };
  /** Start date — system computes the full timeline from assembly config. */
  startDate?: string | number;
}

function toTimestamp(value: string | number): ReturnType<typeof timestamp> {
  if (typeof value === "number") return timestamp(value);
  return timestamp(new Date(value).getTime());
}

// ---------------------------------------------------------------------------
// Shared response builder — ensures list and detail endpoints return the
// same shape for event objects, preventing field divergence.
// ---------------------------------------------------------------------------

interface VotingEventLike {
  id: string;
  title: string;
  description: string;
  issueIds: readonly string[];
  eligibleParticipantIds: readonly string[];
  timeline: { deliberationStart: number; votingStart: number; votingEnd: number };
  createdAt: number;
}

function buildIssueResponse(engine: VotiverseEngine, issueId: string) {
  const issue = engine.events.getIssue(issueId as IssueId);
  if (!issue) return { id: issueId, title: "", description: "", topicId: null };
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    topicId: issue.topicId,
    ...(issue.choices ? { choices: issue.choices } : {}),
    cancelled: engine.events.isIssueCancelled(issueId as IssueId),
  };
}

function buildEventResponse(engine: VotiverseEngine, e: VotingEventLike) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    issueIds: e.issueIds,
    issues: e.issueIds.map((id) => buildIssueResponse(engine, id)),
    eligibleParticipantIds: e.eligibleParticipantIds,
    timeline: {
      deliberationStart: new Date(e.timeline.deliberationStart).toISOString(),
      votingStart: new Date(e.timeline.votingStart).toISOString(),
      votingEnd: new Date(e.timeline.votingEnd).toISOString(),
    },
    createdAt: new Date(e.createdAt).toISOString(),
  };
}

export function eventRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/events — create voting event. */
  app.post("/assemblies/:id/events", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<CreateEventBody>();

    if (!body.title || !body.issues || (!body.timeline && !body.startDate)) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "title, issues, and either timeline or startDate are required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);
    const info = await manager.getAssemblyInfo(assemblyId);

    // Compute timeline: either from explicit values or from startDate + assembly config
    let eventTimeline: { deliberationStart: ReturnType<typeof timestamp>; votingStart: ReturnType<typeof timestamp>; votingEnd: ReturnType<typeof timestamp> };
    if (body.startDate && info) {
      const start = typeof body.startDate === "number" ? body.startDate : new Date(body.startDate).getTime();
      const computed = computeTimeline(start, info.config.timeline);
      eventTimeline = {
        deliberationStart: timestamp(computed.deliberationStart),
        votingStart: timestamp(computed.votingStart),
        votingEnd: timestamp(computed.votingEnd),
      };
    } else if (body.timeline) {
      eventTimeline = {
        deliberationStart: toTimestamp(body.timeline.deliberationStart),
        votingStart: toTimestamp(body.timeline.votingStart),
        votingEnd: toTimestamp(body.timeline.votingEnd),
      };
    } else {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Either timeline or startDate is required" } },
        400,
      );
    }

    const votingEvent = await engine.events.create({
      title: body.title,
      description: body.description ?? "",
      issues: body.issues.map((i) => ({
        title: i.title,
        description: i.description ?? "",
        topicId: (i.topicId ?? null) as TopicId | null,
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: body.eligibleParticipantIds as ParticipantId[],
      timeline: eventTimeline,
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

    return c.json(buildEventResponse(engine, votingEvent), 201);
  });

  /** GET /assemblies/:id/events/:eid — get event detail. */
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

    // Look up creator
    const db = manager.getDatabase();
    const creatorRow = await db.queryOne<{ participant_id: string }>(
      `SELECT participant_id FROM voting_event_creators WHERE assembly_id = ? AND event_id = ?`,
      [assemblyId, eid],
    );

    return c.json({
      ...buildEventResponse(engine, votingEvent),
      createdBy: creatorRow?.participant_id ?? undefined,
    });
  });

  /** GET /assemblies/:id/events — list events (paginated). */
  app.get("/assemblies/:id/events", async (c) => {
    const assemblyId = c.req.param("id");
    const { engine } = await manager.getEngine(assemblyId);
    const allEvents = engine.events.list().map((e) => buildEventResponse(engine, e));
    const { data, pagination } = paginate(allEvents, parsePagination(c));
    return c.json({ events: data, pagination });
  });

  /** POST /assemblies/:id/events/:eid/issues/:iid/cancel — cancel an issue. */
  app.post(
    "/assemblies/:id/events/:eid/issues/:iid/cancel",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const eid = c.req.param("eid");
      const iid = c.req.param("iid");
      const participantId = getParticipantId(c);

      if (!participantId) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Participant identity is required" } },
          400,
        );
      }

      const body = await c.req.json<{ reason: string }>();
      if (!body.reason) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "reason is required" } },
          400,
        );
      }

      const { engine } = await manager.getEngine(assemblyId);

      // Verify the event exists and the issue belongs to it
      const votingEvent = engine.events.get(eid as import("@votiverse/core").VotingEventId);
      if (!votingEvent) {
        return c.json(
          { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
          404,
        );
      }

      if (!votingEvent.issueIds.includes(iid as IssueId)) {
        return c.json(
          { error: { code: "NOT_FOUND", message: `Issue "${iid}" not found in event "${eid}"` } },
          404,
        );
      }

      await engine.events.cancelIssue(
        iid as IssueId,
        participantId as ParticipantId,
        body.reason,
      );

      return c.json({ ok: true, issueId: iid, cancelled: true });
    },
  );

  return app;
}
