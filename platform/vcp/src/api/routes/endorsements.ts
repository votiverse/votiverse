/**
 * Entity endorsement routes — lightweight votes on candidacies and proposals.
 * One endorsement per participant per target, with upsert semantics.
 */

import { Hono } from "hono";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, getParticipantId } from "../middleware/auth.js";

export interface EndorsementCounts {
  endorse: number;
  dispute: number;
}

export function endorsementRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /**
   * PUT /assemblies/:id/endorsements — upsert an endorsement.
   * Body: { targetType: "candidacy"|"proposal", targetId: string, value: "endorse"|"dispute" }
   */
  app.put(
    "/assemblies/:id/endorsements",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const participantId = getParticipantId(c)!;
      const body = await c.req.json<{
        targetType: string;
        targetId: string;
        value: string;
      }>();

      if (!body.targetType || !body.targetId || !body.value) {
        return c.json({ error: { code: "VALIDATION", message: "targetType, targetId, and value are required" } }, 400);
      }
      if (body.targetType !== "candidacy" && body.targetType !== "proposal") {
        return c.json({ error: { code: "VALIDATION", message: "targetType must be 'candidacy' or 'proposal'" } }, 400);
      }
      if (body.value !== "endorse" && body.value !== "dispute") {
        return c.json({ error: { code: "VALIDATION", message: "value must be 'endorse' or 'dispute'" } }, 400);
      }

      const db = manager.getDatabase();
      const now = Date.now();

      // Upsert: INSERT OR REPLACE (SQLite) / ON CONFLICT DO UPDATE (works for both via our dialect)
      if (db.dialect === "postgres") {
        await db.run(
          `INSERT INTO entity_endorsements (assembly_id, participant_id, target_type, target_id, value, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (assembly_id, participant_id, target_type, target_id)
           DO UPDATE SET value = $5, updated_at = $6`,
          [assemblyId, participantId, body.targetType, body.targetId, body.value, now],
        );
      } else {
        await db.run(
          `INSERT INTO entity_endorsements (assembly_id, participant_id, target_type, target_id, value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (assembly_id, participant_id, target_type, target_id)
           DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [assemblyId, participantId, body.targetType, body.targetId, body.value, now, now],
        );
      }

      return c.json({ targetType: body.targetType, targetId: body.targetId, value: body.value });
    },
  );

  /**
   * DELETE /assemblies/:id/endorsements — retract an endorsement.
   * Body: { targetType: "candidacy"|"proposal", targetId: string }
   */
  app.delete(
    "/assemblies/:id/endorsements",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const participantId = getParticipantId(c)!;
      const body = await c.req.json<{ targetType: string; targetId: string }>();

      const db = manager.getDatabase();
      await db.run(
        `DELETE FROM entity_endorsements WHERE assembly_id = ? AND participant_id = ? AND target_type = ? AND target_id = ?`,
        [assemblyId, participantId, body.targetType, body.targetId],
      );

      return c.json({ ok: true });
    },
  );

  /**
   * GET /assemblies/:id/endorsements — get endorsements for targets.
   * Query: targetType=candidacy&targetIds=id1,id2,id3
   * Returns aggregate counts + caller's endorsement per target.
   */
  app.get("/assemblies/:id/endorsements", async (c) => {
    const assemblyId = c.req.param("id");
    const participantId = getParticipantId(c);
    const targetType = c.req.query("targetType");
    const targetIdsRaw = c.req.query("targetIds");

    if (!targetType || !targetIdsRaw) {
      return c.json({ error: { code: "VALIDATION", message: "targetType and targetIds are required" } }, 400);
    }

    const targetIds = targetIdsRaw.split(",").filter(Boolean);
    if (targetIds.length === 0) {
      return c.json({ endorsements: {} });
    }

    const db = manager.getDatabase();
    const placeholders = targetIds.map(() => "?").join(",");

    // Aggregate counts per target
    const countRows = await db.query<{ target_id: string; value: string; cnt: number }>(
      `SELECT target_id, value, COUNT(*) as cnt
       FROM entity_endorsements
       WHERE assembly_id = ? AND target_type = ? AND target_id IN (${placeholders})
       GROUP BY target_id, value`,
      [assemblyId, targetType, ...targetIds],
    );

    // Caller's own endorsements
    let myRows: Array<{ target_id: string; value: string }> = [];
    if (participantId) {
      myRows = await db.query<{ target_id: string; value: string }>(
        `SELECT target_id, value FROM entity_endorsements
         WHERE assembly_id = ? AND participant_id = ? AND target_type = ? AND target_id IN (${placeholders})`,
        [assemblyId, participantId, targetType, ...targetIds],
      );
    }
    const myMap = new Map(myRows.map((r) => [r.target_id, r.value]));

    // Build response: { [targetId]: { endorse: N, dispute: N, my: "endorse"|"dispute"|null } }
    const endorsements: Record<string, { endorse: number; dispute: number; my: string | null }> = {};
    for (const id of targetIds) {
      endorsements[id] = { endorse: 0, dispute: 0, my: myMap.get(id) ?? null };
    }
    for (const row of countRows) {
      const entry = endorsements[row.target_id];
      if (entry) {
        if (row.value === "endorse") entry.endorse = Number(row.cnt);
        else if (row.value === "dispute") entry.dispute = Number(row.cnt);
      }
    }

    return c.json({ endorsements });
  });

  return app;
}
