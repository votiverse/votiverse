/**
 * Community note routes — governance metadata only.
 * Note content (markdown, assets) lives in the client backend.
 */

import { Hono } from "hono";
import type { ParticipantId, NoteId, ContentHash, NoteTargetType, NoteEvaluation } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function noteRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/notes — register a community note. */
  app.post(
    "/assemblies/:id/notes",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const body = await c.req.json<{
        contentHash: string;
        targetType: string;
        targetId: string;
        targetVersionNumber?: number;
      }>();
      const authorId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      const note = await engine.notes.create({
        authorId: authorId as ParticipantId,
        contentHash: body.contentHash as ContentHash,
        targetType: body.targetType as NoteTargetType,
        targetId: body.targetId,
        targetVersionNumber: body.targetVersionNumber,
      });

      // Persist to VCP database
      const db = manager.getDatabase();
      await db.run(
        `INSERT INTO community_notes (id, assembly_id, author_id, content_hash, target_type, target_id, target_version_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [note.id, assemblyId, note.authorId, note.contentHash, note.target.type, note.target.id, note.target.versionNumber ?? null, note.status, note.createdAt],
      );

      return c.json({
        id: note.id,
        authorId: note.authorId,
        contentHash: note.contentHash,
        target: note.target,
        endorsementCount: note.endorsementCount,
        disputeCount: note.disputeCount,
        status: note.status,
        createdAt: note.createdAt,
      }, 201);
    },
  );

  /** GET /assemblies/:id/notes — list note metadata. */
  app.get("/assemblies/:id/notes", async (c) => {
    const assemblyId = c.req.param("id");
    const targetType = c.req.query("targetType");
    const targetId = c.req.query("targetId");

    const db = manager.getDatabase();
    let sql = `SELECT * FROM community_notes WHERE assembly_id = ?`;
    const params: unknown[] = [assemblyId];

    if (targetType) {
      sql += ` AND target_type = ?`;
      params.push(targetType);
    }
    if (targetId) {
      sql += ` AND target_id = ?`;
      params.push(targetId);
    }
    sql += ` ORDER BY created_at DESC`;

    const rows = await db.query<Record<string, unknown>>(sql, params);
    const notes = rows.map(mapNoteRow);
    const { data, pagination } = paginate(notes, parsePagination(c));
    return c.json({ notes: data, pagination });
  });

  /** GET /assemblies/:id/notes/:nid — get note metadata + evaluation counts. */
  app.get("/assemblies/:id/notes/:nid", async (c) => {
    const assemblyId = c.req.param("id");
    const noteId = c.req.param("nid");

    const db = manager.getDatabase();
    const row = await db.queryOne<Record<string, unknown>>(
      `SELECT * FROM community_notes WHERE assembly_id = ? AND id = ?`,
      [assemblyId, noteId],
    );
    if (!row) {
      return c.json({ error: { code: "NOT_FOUND", message: "Note not found" } }, 404);
    }

    // Compute visibility
    const { engine } = await manager.getEngine(assemblyId);
    const noteMetadata = await engine.notes.get(noteId as NoteId);
    const visibility = noteMetadata ? engine.notes.computeVisibility(noteMetadata) : undefined;

    return c.json({ ...mapNoteRow(row), visibility });
  });

  /** POST /assemblies/:id/notes/:nid/evaluate — endorse or dispute. */
  app.post(
    "/assemblies/:id/notes/:nid/evaluate",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const noteId = c.req.param("nid");
      const body = await c.req.json<{ evaluation: string }>();
      const participantId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);

      // Get previous evaluation to update materialized counts
      const db = manager.getDatabase();
      const prev = await db.queryOne<{ evaluation: string }>(
        `SELECT evaluation FROM note_evaluations WHERE assembly_id = ? AND note_id = ? AND participant_id = ?`,
        [assemblyId, noteId, participantId],
      );

      await engine.notes.evaluate(
        noteId as NoteId,
        participantId as ParticipantId,
        body.evaluation as NoteEvaluation,
      );

      // Update materialized counts
      if (prev) {
        // Decrement old, increment new
        const oldCol = prev.evaluation === "endorse" ? "endorsement_count" : "dispute_count";
        const newCol = body.evaluation === "endorse" ? "endorsement_count" : "dispute_count";
        if (oldCol !== newCol) {
          await db.run(
            `UPDATE community_notes SET ${oldCol} = ${oldCol} - 1, ${newCol} = ${newCol} + 1 WHERE assembly_id = ? AND id = ?`,
            [assemblyId, noteId],
          );
        }
      } else {
        // First evaluation by this participant
        const col = body.evaluation === "endorse" ? "endorsement_count" : "dispute_count";
        await db.run(
          `UPDATE community_notes SET ${col} = ${col} + 1 WHERE assembly_id = ? AND id = ?`,
          [assemblyId, noteId],
        );
      }

      // Upsert evaluation record
      await db.run(
        `INSERT INTO note_evaluations (assembly_id, note_id, participant_id, evaluation, evaluated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (assembly_id, note_id, participant_id) DO UPDATE SET evaluation = EXCLUDED.evaluation, evaluated_at = EXCLUDED.evaluated_at`,
        [assemblyId, noteId, participantId, body.evaluation, Date.now()],
      );

      return c.json({ status: "ok" });
    },
  );

  /** POST /assemblies/:id/notes/:nid/withdraw — withdraw note (author only). */
  app.post(
    "/assemblies/:id/notes/:nid/withdraw",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const noteId = c.req.param("nid");
      const authorId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      await engine.notes.withdraw(noteId as NoteId, authorId as ParticipantId);

      const db = manager.getDatabase();
      await db.run(
        `UPDATE community_notes SET status = 'withdrawn', withdrawn_at = ? WHERE assembly_id = ? AND id = ?`,
        [Date.now(), assemblyId, noteId],
      );

      return c.json({ status: "withdrawn" });
    },
  );

  return app;
}

function mapNoteRow(row: Record<string, unknown>) {
  return {
    id: row["id"],
    authorId: row["author_id"],
    contentHash: row["content_hash"],
    target: {
      type: row["target_type"],
      id: row["target_id"],
      versionNumber: row["target_version_number"] ?? undefined,
    },
    endorsementCount: row["endorsement_count"],
    disputeCount: row["dispute_count"],
    status: row["status"],
    createdAt: row["created_at"],
    withdrawnAt: row["withdrawn_at"] ?? undefined,
  };
}
