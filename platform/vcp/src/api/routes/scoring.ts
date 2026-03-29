/**
 * Scoring routes — rubric-based multi-criteria scoring events.
 *
 * Lifecycle: draft → open → closed (see docs/design/scoring-v2-lifecycle.md)
 */

import { Hono } from "hono";
import type { ScoringEventId, ParticipantId, EntryId, ScorecardId, Timestamp } from "@votiverse/core";
import type { CreateScoringEventParams, UpdateDraftParams } from "@votiverse/scoring";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, getParticipantId } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";
import type { DatabaseAdapter } from "../../adapters/database/interface.js";

export function scoringRoutes(manager: AssemblyManager) {
  const app = new Hono();

  // -------------------------------------------------------------------------
  // Scoring events
  // -------------------------------------------------------------------------

  /** POST /assemblies/:id/scoring — create scoring event. */
  app.post(
    "/assemblies/:id/scoring",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!!;
      const body = await c.req.json<CreateScoringEventParams>();

      const { engine } = await manager.getEngine(assemblyId);
      const scoringEvent = await engine.scoring.create(body);

      // Materialize to scoring_events table
      const db = manager.getDatabase();
      await db.run(
        `INSERT INTO scoring_events (id, assembly_id, title, description, entries, rubric, panel_member_ids, opens_at, closes_at, settings, created_at, status, start_as_draft)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          scoringEvent.id,
          assemblyId,
          scoringEvent.title,
          scoringEvent.description,
          JSON.stringify(scoringEvent.entries),
          JSON.stringify(scoringEvent.rubric),
          scoringEvent.panelMemberIds ? JSON.stringify(scoringEvent.panelMemberIds) : null,
          new Date(scoringEvent.timeline.opensAt).toISOString(),
          new Date(scoringEvent.timeline.closesAt).toISOString(),
          JSON.stringify(scoringEvent.settings),
          new Date(scoringEvent.createdAt).toISOString(),
          scoringEvent.status,
          scoringEvent.startAsDraft ? 1 : 0,
        ],
      );

      return c.json(formatScoringEvent(scoringEvent), 201);
    },
  );

  /** GET /assemblies/:id/scoring — list scoring events. */
  app.get("/assemblies/:id/scoring", async (c) => {
    const assemblyId = c.req.param("id")!;
    const db = manager.getDatabase();

    const rows = await db.query<ScoringEventRow>(
      "SELECT * FROM scoring_events WHERE assembly_id = ? ORDER BY created_at DESC",
      [assemblyId],
    );

    const now = await getEngineNow(manager, assemblyId);
    const callerPid = c.req.header("X-Participant-Id") ?? null;
    const isAdmin = callerPid ? await isParticipantAdmin(db, assemblyId, callerPid) : false;

    // Filter: non-admins don't see draft events
    const filtered = rows.filter((row) => {
      const status = computeEffectiveStatus(row, now);
      return isAdmin || status !== "draft";
    });

    const items = filtered.map((row) => rowToScoringEventResponse(row, now));
    const { data, pagination } = paginate(items, parsePagination(c));

    return c.json({ scoringEvents: data, pagination });
  });

  /** GET /assemblies/:id/scoring/:eid — get scoring event detail. */
  app.get("/assemblies/:id/scoring/:eid", async (c) => {
    const assemblyId = c.req.param("id")!;
    const eid = c.req.param("eid")!;
    const db = manager.getDatabase();

    const row = await db.queryOne<ScoringEventRow>(
      "SELECT * FROM scoring_events WHERE id = ? AND assembly_id = ?",
      [eid, assemblyId],
    );

    if (!row) {
      return c.json({ error: { code: "NOT_FOUND", message: "Scoring event not found" } }, 404);
    }

    const now = await getEngineNow(manager, assemblyId);
    const status = computeEffectiveStatus(row, now);

    // Non-admins can't see draft events even by direct URL
    if (status === "draft") {
      const callerPid = c.req.header("X-Participant-Id") ?? null;
      const isAdmin = callerPid ? await isParticipantAdmin(db, assemblyId, callerPid) : false;
      if (!isAdmin) {
        return c.json({ error: { code: "NOT_FOUND", message: "Scoring event not found" } }, 404);
      }
    }

    return c.json(rowToScoringEventResponse(row, now));
  });

  // -------------------------------------------------------------------------
  // Lifecycle commands
  // -------------------------------------------------------------------------

  /** POST /assemblies/:id/scoring/:eid/open — open a draft event. */
  app.post(
    "/assemblies/:id/scoring/:eid/open",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!;
      const eid = c.req.param("eid")! as ScoringEventId;

      const { engine } = await manager.getEngine(assemblyId);
      const updated = await engine.scoring.open(eid);

      // Update materialized row
      const db = manager.getDatabase();
      await db.run(
        `UPDATE scoring_events SET status = ?, opens_at = ? WHERE id = ? AND assembly_id = ?`,
        ["open", new Date(updated.timeline.opensAt).toISOString(), eid, assemblyId],
      );

      return c.json({ status: "open" });
    },
  );

  /** POST /assemblies/:id/scoring/:eid/extend — extend deadline. */
  app.post(
    "/assemblies/:id/scoring/:eid/extend",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!;
      const eid = c.req.param("eid")! as ScoringEventId;
      const body = await c.req.json<{ closesAt: string }>();

      const newClosesAt = new Date(body.closesAt).getTime() as Timestamp;

      const { engine } = await manager.getEngine(assemblyId);
      const updated = await engine.scoring.extendDeadline(eid, newClosesAt);

      // Update materialized row
      const db = manager.getDatabase();
      await db.run(
        `UPDATE scoring_events SET closes_at = ?, original_closes_at = COALESCE(original_closes_at, ?) WHERE id = ? AND assembly_id = ?`,
        [
          new Date(updated.timeline.closesAt).toISOString(),
          updated.originalClosesAt ? new Date(updated.originalClosesAt).toISOString() : null,
          eid,
          assemblyId,
        ],
      );

      return c.json({
        closesAt: new Date(updated.timeline.closesAt).toISOString(),
        originalClosesAt: updated.originalClosesAt
          ? new Date(updated.originalClosesAt).toISOString()
          : null,
      });
    },
  );

  /** PUT /assemblies/:id/scoring/:eid — update a draft event. */
  app.put(
    "/assemblies/:id/scoring/:eid",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!;
      const eid = c.req.param("eid")! as ScoringEventId;
      const body = await c.req.json<UpdateDraftParams>();

      const { engine } = await manager.getEngine(assemblyId);
      const updated = await engine.scoring.updateDraft(eid, body);

      // Update materialized row
      const db = manager.getDatabase();
      await db.run(
        `UPDATE scoring_events SET title = ?, description = ?, entries = ?, rubric = ?, panel_member_ids = ?, opens_at = ?, closes_at = ?, settings = ? WHERE id = ? AND assembly_id = ?`,
        [
          updated.title,
          updated.description,
          JSON.stringify(updated.entries),
          JSON.stringify(updated.rubric),
          updated.panelMemberIds ? JSON.stringify(updated.panelMemberIds) : null,
          new Date(updated.timeline.opensAt).toISOString(),
          new Date(updated.timeline.closesAt).toISOString(),
          JSON.stringify(updated.settings),
          eid,
          assemblyId,
        ],
      );

      const now = await getEngineNow(manager, assemblyId);
      return c.json(rowToScoringEventResponseFromEngine(updated, now));
    },
  );

  /** POST /assemblies/:id/scoring/:eid/close — close scoring event. */
  app.post(
    "/assemblies/:id/scoring/:eid/close",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!;
      const eid = c.req.param("eid")! as ScoringEventId;

      const { engine } = await manager.getEngine(assemblyId);
      await engine.scoring.close(eid);

      // Update materialized status
      const db = manager.getDatabase();
      await db.run(
        `UPDATE scoring_events SET status = 'closed' WHERE id = ? AND assembly_id = ?`,
        [eid, assemblyId],
      );

      return c.json({ status: "closed" });
    },
  );

  // -------------------------------------------------------------------------
  // Scorecards
  // -------------------------------------------------------------------------

  /** POST /assemblies/:id/scoring/:eid/scorecards — submit scorecard. */
  app.post(
    "/assemblies/:id/scoring/:eid/scorecards",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!;
      const eid = c.req.param("eid")! as ScoringEventId;
      const participantId = getParticipantId(c) as ParticipantId;
      const body = await c.req.json<{ entryId: string; scores: { dimensionId: string; score: number }[] }>();

      const { engine } = await manager.getEngine(assemblyId);
      const scorecard = await engine.scoring.submitScorecard({
        scoringEventId: eid,
        evaluatorId: participantId,
        entryId: body.entryId as EntryId,
        scores: body.scores,
      });

      // Materialize to scorecards table (upsert)
      const db = manager.getDatabase();
      await db.run(
        `INSERT INTO scorecards (id, assembly_id, scoring_event_id, evaluator_id, entry_id, scores, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scoring_event_id, evaluator_id, entry_id) DO UPDATE SET
           scores = excluded.scores,
           submitted_at = excluded.submitted_at`,
        [
          scorecard.id,
          assemblyId,
          scorecard.scoringEventId,
          scorecard.evaluatorId,
          scorecard.entryId,
          JSON.stringify(scorecard.scores),
          new Date(scorecard.submittedAt).toISOString(),
        ],
      );

      return c.json({
        id: scorecard.id,
        scoringEventId: scorecard.scoringEventId,
        evaluatorId: scorecard.evaluatorId,
        entryId: scorecard.entryId,
        scores: scorecard.scores,
        submittedAt: scorecard.submittedAt,
      }, 201);
    },
  );

  /** PUT /assemblies/:id/scoring/:eid/scorecards/:sid — revise scorecard. */
  app.put(
    "/assemblies/:id/scoring/:eid/scorecards/:sid",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id")!;
      const eid = c.req.param("eid")! as ScoringEventId;
      const sid = c.req.param("sid")! as ScorecardId;
      const participantId = getParticipantId(c) as ParticipantId;
      const body = await c.req.json<{ entryId: string; scores: { dimensionId: string; score: number }[] }>();

      const { engine } = await manager.getEngine(assemblyId);
      const scorecard = await engine.scoring.reviseScorecard({
        scorecardId: sid,
        scoringEventId: eid,
        evaluatorId: participantId,
        entryId: body.entryId as EntryId,
        scores: body.scores,
      });

      // Upsert materialized scorecard
      const db = manager.getDatabase();
      await db.run(
        `INSERT INTO scorecards (id, assembly_id, scoring_event_id, evaluator_id, entry_id, scores, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scoring_event_id, evaluator_id, entry_id) DO UPDATE SET
           scores = excluded.scores,
           submitted_at = excluded.submitted_at`,
        [
          scorecard.id,
          assemblyId,
          scorecard.scoringEventId,
          scorecard.evaluatorId,
          scorecard.entryId,
          JSON.stringify(scorecard.scores),
          new Date(scorecard.submittedAt).toISOString(),
        ],
      );

      return c.json({
        id: scorecard.id,
        scoringEventId: scorecard.scoringEventId,
        evaluatorId: scorecard.evaluatorId,
        entryId: scorecard.entryId,
        scores: scorecard.scores,
        submittedAt: scorecard.submittedAt,
      });
    },
  );

  /** GET /assemblies/:id/scoring/:eid/scorecards — list scorecards. */
  app.get("/assemblies/:id/scoring/:eid/scorecards", async (c) => {
    const assemblyId = c.req.param("id")!;
    const eid = c.req.param("eid")!;
    const db = manager.getDatabase();

    // Check if secretScores is enabled — if so, only return after close
    const eventRow = await db.queryOne<ScoringEventRow>(
      "SELECT * FROM scoring_events WHERE id = ? AND assembly_id = ?",
      [eid, assemblyId],
    );

    if (!eventRow) {
      return c.json({ error: { code: "NOT_FOUND", message: "Scoring event not found" } }, 404);
    }

    const settings = parseJson<{ secretScores: boolean }>(eventRow.settings);
    const now = await getEngineNow(manager, assemblyId);
    const effectiveStatus = computeEffectiveStatus(eventRow, now);
    const isClosed = effectiveStatus === "closed";

    // When secretScores is enabled and the event is still open, only return
    // the requesting evaluator's own scorecards (so they can revise).
    const callerPid = c.req.header("X-Participant-Id") ?? null;

    if (settings.secretScores && !isClosed) {
      if (!callerPid) {
        return c.json({ error: { code: "SCORES_SECRET", message: "Scores are secret until the event closes" } }, 403);
      }
      const rows = await db.query<ScorecardRow>(
        "SELECT * FROM scorecards WHERE scoring_event_id = ? AND assembly_id = ? AND evaluator_id = ?",
        [eid, assemblyId, callerPid],
      );
      const scorecards = rows.map((row) => ({
        id: row.id,
        scoringEventId: row.scoring_event_id,
        evaluatorId: row.evaluator_id,
        entryId: row.entry_id,
        scores: parseJson(row.scores),
        submittedAt: row.submitted_at,
      }));
      return c.json({ scorecards });
    }

    const rows = await db.query<ScorecardRow>(
      "SELECT * FROM scorecards WHERE scoring_event_id = ? AND assembly_id = ?",
      [eid, assemblyId],
    );

    const scorecards = rows.map((row) => ({
      id: row.id,
      scoringEventId: row.scoring_event_id,
      evaluatorId: row.evaluator_id,
      entryId: row.entry_id,
      scores: parseJson(row.scores),
      submittedAt: row.submitted_at,
    }));

    return c.json({ scorecards });
  });

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  /** GET /assemblies/:id/scoring/:eid/results — get ranking results. */
  app.get("/assemblies/:id/scoring/:eid/results", async (c) => {
    const assemblyId = c.req.param("id")!;
    const eid = c.req.param("eid")! as ScoringEventId;
    const db = manager.getDatabase();

    // Check secretScores
    const eventRow = await db.queryOne<ScoringEventRow>(
      "SELECT * FROM scoring_events WHERE id = ? AND assembly_id = ?",
      [eid, assemblyId],
    );

    if (!eventRow) {
      return c.json({ error: { code: "NOT_FOUND", message: "Scoring event not found" } }, 404);
    }

    const settings = parseJson<{ secretScores: boolean }>(eventRow.settings);
    const now = await getEngineNow(manager, assemblyId);
    const effectiveStatus = computeEffectiveStatus(eventRow, now);

    if (settings.secretScores && effectiveStatus !== "closed") {
      return c.json({ error: { code: "SCORES_SECRET", message: "Results are secret until the event closes" } }, 403);
    }

    // Compute ranking from engine
    const { engine } = await manager.getEngine(assemblyId);
    const eligibleCount = await getActiveParticipantCount(db, assemblyId, eventRow);
    const result = engine.scoring.computeResults(eid, eligibleCount);

    // Materialize results
    await db.run(
      `INSERT INTO scoring_results (assembly_id, scoring_event_id, entries, eligible_count, participating_count, participation_rate, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(assembly_id, scoring_event_id) DO UPDATE SET
         entries = excluded.entries,
         eligible_count = excluded.eligible_count,
         participating_count = excluded.participating_count,
         participation_rate = excluded.participation_rate,
         computed_at = excluded.computed_at`,
      [
        assemblyId,
        eid,
        JSON.stringify(result.entries),
        result.eligibleCount,
        result.participatingCount,
        result.participationRate,
        new Date(result.computedAt).toISOString(),
      ],
    );

    return c.json(result);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ScoringEventRow {
  id: string;
  assembly_id: string;
  title: string;
  description: string;
  entries: string;
  rubric: string;
  panel_member_ids: string | null;
  opens_at: string;
  closes_at: string;
  settings: string;
  created_at: string;
  status: string;
  original_closes_at: string | null;
  start_as_draft: number | boolean;
}

interface ScorecardRow {
  id: string;
  assembly_id: string;
  scoring_event_id: string;
  evaluator_id: string;
  entry_id: string;
  scores: string;
  submitted_at: string;
}

function parseJson<T = unknown>(value: string | object): T {
  if (typeof value === "object") return value as T;
  return JSON.parse(value) as T;
}

/**
 * Compute effective status from materialized row data + current time.
 * Mirrors the engine's ScoringService.getStatus() derivation.
 */
function computeEffectiveStatus(
  row: ScoringEventRow,
  nowMs: number,
): "draft" | "open" | "closed" {
  const commandedStatus = row.status as "draft" | "open" | "closed";
  const startAsDraft = row.start_as_draft === 1 || row.start_as_draft === true;
  const opensAt = new Date(row.opens_at).getTime();
  const closesAt = new Date(row.closes_at).getTime();

  if (commandedStatus === "closed") return "closed";

  if (commandedStatus === "open") {
    return nowMs >= closesAt ? "closed" : "open";
  }

  // commandedStatus === "draft"
  if (startAsDraft) return "draft";

  if (nowMs >= closesAt) return "closed";
  if (nowMs >= opensAt) return "open";
  return "draft";
}

/** Get current time from the engine's TimeProvider (dev clock aware). */
async function getEngineNow(manager: AssemblyManager, assemblyId: string): Promise<number> {
  try {
    const { engine } = await manager.getEngine(assemblyId);
    return engine.getTimeProvider().now();
  } catch {
    // Fallback if engine not available
    return Date.now();
  }
}

function rowToScoringEventResponse(row: ScoringEventRow, nowMs: number) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    entries: parseJson(row.entries),
    rubric: parseJson(row.rubric),
    panelMemberIds: row.panel_member_ids ? parseJson(row.panel_member_ids) : null,
    timeline: {
      opensAt: row.opens_at,
      closesAt: row.closes_at,
    },
    settings: parseJson(row.settings),
    createdAt: row.created_at,
    status: computeEffectiveStatus(row, nowMs),
    startAsDraft: row.start_as_draft === 1 || row.start_as_draft === true,
    originalClosesAt: row.original_closes_at ?? null,
  };
}

/** Format a response from in-memory engine ScoringEvent (used after updateDraft). */
function rowToScoringEventResponseFromEngine(
  se: {
    id: string;
    title: string;
    description: string;
    entries: readonly { id: string; title: string; description?: string }[];
    rubric: unknown;
    panelMemberIds: readonly string[] | null;
    timeline: { opensAt: number; closesAt: number };
    settings: unknown;
    createdAt: number;
    status: string;
    startAsDraft: boolean;
    originalClosesAt?: number;
  },
  nowMs: number,
) {
  // Compute effective status from engine state
  const opensAt = se.timeline.opensAt;
  const closesAt = se.timeline.closesAt;
  let effectiveStatus: "draft" | "open" | "closed" = se.status as "draft" | "open" | "closed";
  if (effectiveStatus === "open" && nowMs >= closesAt) effectiveStatus = "closed";
  if (effectiveStatus === "draft" && !se.startAsDraft) {
    if (nowMs >= closesAt) effectiveStatus = "closed";
    else if (nowMs >= opensAt) effectiveStatus = "open";
  }

  return {
    id: se.id,
    title: se.title,
    description: se.description,
    entries: se.entries,
    rubric: se.rubric,
    panelMemberIds: se.panelMemberIds,
    timeline: {
      opensAt: new Date(se.timeline.opensAt).toISOString(),
      closesAt: new Date(se.timeline.closesAt).toISOString(),
    },
    settings: se.settings,
    createdAt: new Date(se.createdAt).toISOString(),
    status: effectiveStatus,
    startAsDraft: se.startAsDraft,
    originalClosesAt: se.originalClosesAt
      ? new Date(se.originalClosesAt).toISOString()
      : null,
  };
}

function formatScoringEvent(se: {
  id: string;
  title: string;
  description: string;
  entries: readonly { id: string; title: string; description?: string }[];
  rubric: unknown;
  panelMemberIds: readonly string[] | null;
  timeline: { opensAt: number; closesAt: number };
  settings: unknown;
  createdAt: number;
  status: string;
  startAsDraft: boolean;
  originalClosesAt?: number;
}) {
  return {
    id: se.id,
    title: se.title,
    description: se.description,
    entries: se.entries,
    rubric: se.rubric,
    panelMemberIds: se.panelMemberIds,
    timeline: {
      opensAt: new Date(se.timeline.opensAt).toISOString(),
      closesAt: new Date(se.timeline.closesAt).toISOString(),
    },
    settings: se.settings,
    createdAt: new Date(se.createdAt).toISOString(),
    status: se.status,
    startAsDraft: se.startAsDraft,
    originalClosesAt: se.originalClosesAt
      ? new Date(se.originalClosesAt).toISOString()
      : null,
  };
}

async function getActiveParticipantCount(
  db: DatabaseAdapter,
  assemblyId: string,
  eventRow: ScoringEventRow,
): Promise<number> {
  const panelMemberIds = eventRow.panel_member_ids ? parseJson<string[]>(eventRow.panel_member_ids) : null;
  if (panelMemberIds) {
    return panelMemberIds.length;
  }
  const result = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM participants WHERE assembly_id = ? AND status = 'active'",
    [assemblyId],
  );
  return result?.count ?? 0;
}

/** Check if a participant has an admin or owner role in the assembly. */
async function isParticipantAdmin(
  db: DatabaseAdapter,
  assemblyId: string,
  participantId: string,
): Promise<boolean> {
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM assembly_roles WHERE assembly_id = ? AND participant_id = ? AND role IN ('admin', 'owner')",
    [assemblyId, participantId],
  );
  return (row?.count ?? 0) > 0;
}
