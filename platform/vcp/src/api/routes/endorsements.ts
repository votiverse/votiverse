/**
 * Stance routes — lightweight votes on entities (candidacies, proposals,
 * community notes, predictions).
 *
 * One stance per participant per entity, with upsert semantics.
 * Uses the unified `stances` table (replaces entity_endorsements).
 */

import { Hono } from "hono";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, getParticipantId } from "../middleware/auth.js";

const VALID_ENTITY_TYPES = new Set(["candidacy", "proposal", "community_note", "prediction"]);
const VALID_VALUES = new Set(["endorse", "dispute", "helpful", "not_helpful"]);

export interface EndorsementCounts {
  endorse: number;
  dispute: number;
}

export function endorsementRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /**
   * PUT /assemblies/:id/endorsements — upsert a stance.
   * Body: { targetType: string, targetId: string, value: string }
   *
   * Accepts both legacy field names (targetType/targetId) and new names
   * (entityType/entityId) for backward compatibility.
   */
  app.put(
    "/assemblies/:id/endorsements",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const participantId = getParticipantId(c)!;
      const body = await c.req.json<{
        targetType?: string;
        targetId?: string;
        entityType?: string;
        entityId?: string;
        value: string;
      }>();

      const entityType = body.entityType ?? body.targetType;
      const entityId = body.entityId ?? body.targetId;

      if (!entityType || !entityId || !body.value) {
        return c.json({ error: { code: "VALIDATION", message: "entityType (or targetType), entityId (or targetId), and value are required" } }, 400);
      }
      if (!VALID_ENTITY_TYPES.has(entityType)) {
        return c.json({ error: { code: "VALIDATION", message: `entityType must be one of: ${[...VALID_ENTITY_TYPES].join(", ")}` } }, 400);
      }
      if (!VALID_VALUES.has(body.value)) {
        return c.json({ error: { code: "VALIDATION", message: `value must be one of: ${[...VALID_VALUES].join(", ")}` } }, 400);
      }

      const db = manager.getDatabase();
      const now = Date.now();

      if (db.dialect === "postgres") {
        await db.run(
          `INSERT INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (assembly_id, entity_type, entity_id, participant_id)
           DO UPDATE SET value = $5, updated_at = $6`,
          [assemblyId, entityType, entityId, participantId, body.value, now],
        );
      } else {
        await db.run(
          `INSERT INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (assembly_id, entity_type, entity_id, participant_id)
           DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [assemblyId, entityType, entityId, participantId, body.value, now, now],
        );
      }

      return c.json({ entityType, entityId, value: body.value });
    },
  );

  /**
   * DELETE /assemblies/:id/endorsements — retract a stance.
   * Body: { targetType/entityType: string, targetId/entityId: string }
   */
  app.delete(
    "/assemblies/:id/endorsements",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const participantId = getParticipantId(c)!;
      const body = await c.req.json<{
        targetType?: string;
        targetId?: string;
        entityType?: string;
        entityId?: string;
      }>();

      const entityType = body.entityType ?? body.targetType;
      const entityId = body.entityId ?? body.targetId;

      const db = manager.getDatabase();
      await db.run(
        `DELETE FROM stances WHERE assembly_id = ? AND entity_type = ? AND entity_id = ? AND participant_id = ?`,
        [assemblyId, entityType, entityId, participantId],
      );

      return c.json({ ok: true });
    },
  );

  /**
   * GET /assemblies/:id/endorsements — get stances for entities.
   * Query: targetType=candidacy&targetIds=id1,id2,id3
   *   (also accepts entityType/entityIds)
   * Returns aggregate counts + caller's stance per entity.
   */
  app.get("/assemblies/:id/endorsements", async (c) => {
    const assemblyId = c.req.param("id");
    const participantId = getParticipantId(c);
    const entityType = c.req.query("entityType") ?? c.req.query("targetType");
    const entityIdsRaw = c.req.query("entityIds") ?? c.req.query("targetIds");

    if (!entityType || !entityIdsRaw) {
      return c.json({ error: { code: "VALIDATION", message: "entityType (or targetType) and entityIds (or targetIds) are required" } }, 400);
    }

    const entityIds = entityIdsRaw.split(",").filter(Boolean);
    if (entityIds.length === 0) {
      return c.json({ endorsements: {} });
    }

    const db = manager.getDatabase();
    const placeholders = entityIds.map(() => "?").join(",");

    // Aggregate counts per entity
    const countRows = await db.query<{ entity_id: string; value: string; cnt: number }>(
      `SELECT entity_id, value, COUNT(*) as cnt
       FROM stances
       WHERE assembly_id = ? AND entity_type = ? AND entity_id IN (${placeholders})
       GROUP BY entity_id, value`,
      [assemblyId, entityType, ...entityIds],
    );

    // Caller's own stances
    let myRows: Array<{ entity_id: string; value: string }> = [];
    if (participantId) {
      myRows = await db.query<{ entity_id: string; value: string }>(
        `SELECT entity_id, value FROM stances
         WHERE assembly_id = ? AND participant_id = ? AND entity_type = ? AND entity_id IN (${placeholders})`,
        [assemblyId, participantId, entityType, ...entityIds],
      );
    }
    const myMap = new Map(myRows.map((r) => [r.entity_id, r.value]));

    // Build response: { [entityId]: { endorse: N, dispute: N, my: "endorse"|"dispute"|null } }
    const endorsements: Record<string, { endorse: number; dispute: number; my: string | null }> = {};
    for (const id of entityIds) {
      endorsements[id] = { endorse: 0, dispute: 0, my: myMap.get(id) ?? null };
    }
    for (const row of countRows) {
      const entry = endorsements[row.entity_id];
      if (entry) {
        if (row.value === "endorse") entry.endorse = Number(row.cnt);
        else if (row.value === "dispute") entry.dispute = Number(row.cnt);
      }
    }

    return c.json({ endorsements });
  });

  return app;
}
