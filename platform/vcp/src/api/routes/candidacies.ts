/**
 * Candidacy routes — governance metadata only.
 * Rich content (profile markdown, assets) lives in the client backend.
 */

import { Hono } from "hono";
import type { ParticipantId, CandidacyId, TopicId, ContentHash } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function candidacyRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/candidacies — declare candidacy. */
  app.post(
    "/assemblies/:id/candidacies",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const body = await c.req.json<{
        topicScope: string[];
        voteTransparencyOptIn: boolean;
        contentHash: string;
      }>();
      const participantId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      const candidacy = await engine.candidacies.declare({
        participantId: participantId as ParticipantId,
        topicScope: body.topicScope as TopicId[],
        voteTransparencyOptIn: body.voteTransparencyOptIn,
        contentHash: body.contentHash as ContentHash,
      });

      // Persist to VCP database
      const db = manager.getDatabase();
      await db.run(
        `INSERT INTO candidacies (id, assembly_id, participant_id, topic_scope, vote_transparency_opt_in, current_version, status, declared_at, withdrawn_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (assembly_id, id) DO UPDATE SET topic_scope = EXCLUDED.topic_scope, vote_transparency_opt_in = EXCLUDED.vote_transparency_opt_in, current_version = EXCLUDED.current_version, status = EXCLUDED.status, withdrawn_at = EXCLUDED.withdrawn_at`,
        [candidacy.id, assemblyId, candidacy.participantId, JSON.stringify(candidacy.topicScope), candidacy.voteTransparencyOptIn ? 1 : 0, candidacy.currentVersion, candidacy.status, candidacy.declaredAt],
      );
      const latestVersion = candidacy.versions[candidacy.versions.length - 1]!;
      await db.run(
        `INSERT INTO candidacy_versions (assembly_id, candidacy_id, version_number, content_hash, topic_scope, vote_transparency_opt_in, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [assemblyId, candidacy.id, latestVersion.versionNumber, latestVersion.contentHash, JSON.stringify(candidacy.topicScope), candidacy.voteTransparencyOptIn ? 1 : 0, latestVersion.createdAt],
      );

      return c.json({
        id: candidacy.id,
        participantId: candidacy.participantId,
        topicScope: candidacy.topicScope,
        voteTransparencyOptIn: candidacy.voteTransparencyOptIn,
        currentVersion: candidacy.currentVersion,
        status: candidacy.status,
        declaredAt: candidacy.declaredAt,
      }, 201);
    },
  );

  /** GET /assemblies/:id/candidacies — list candidacy metadata. */
  app.get("/assemblies/:id/candidacies", async (c) => {
    const assemblyId = c.req.param("id");
    const status = c.req.query("status");

    const db = manager.getDatabase();
    let sql = `SELECT * FROM candidacies WHERE assembly_id = ?`;
    const params: unknown[] = [assemblyId];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY declared_at DESC`;

    const rows = await db.query<Record<string, unknown>>(sql, params);
    const candidacies = rows.map(mapCandidacyRow);
    const { data, pagination } = paginate(candidacies, parsePagination(c));
    return c.json({ candidacies: data, pagination });
  });

  /** GET /assemblies/:id/candidacies/:cid — get candidacy metadata. */
  app.get("/assemblies/:id/candidacies/:cid", async (c) => {
    const assemblyId = c.req.param("id");
    const candidacyId = c.req.param("cid");

    const db = manager.getDatabase();
    const row = await db.queryOne<Record<string, unknown>>(
      `SELECT * FROM candidacies WHERE assembly_id = ? AND id = ?`,
      [assemblyId, candidacyId],
    );
    if (!row) {
      return c.json({ error: { code: "NOT_FOUND", message: "Candidacy not found" } }, 404);
    }

    const versions = await db.query<Record<string, unknown>>(
      `SELECT version_number, content_hash, topic_scope, vote_transparency_opt_in, created_at
       FROM candidacy_versions WHERE assembly_id = ? AND candidacy_id = ? ORDER BY version_number`,
      [assemblyId, candidacyId],
    );

    return c.json({ ...mapCandidacyRow(row), versions });
  });

  /** POST /assemblies/:id/candidacies/:cid/version — register new version. */
  app.post(
    "/assemblies/:id/candidacies/:cid/version",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const candidacyId = c.req.param("cid");
      const body = await c.req.json<{
        contentHash: string;
        topicScope?: string[];
        voteTransparencyOptIn?: boolean;
      }>();

      const { engine } = await manager.getEngine(assemblyId);
      const updated = await engine.candidacies.createVersion({
        candidacyId: candidacyId as CandidacyId,
        contentHash: body.contentHash as ContentHash,
        topicScope: body.topicScope as TopicId[] | undefined,
        voteTransparencyOptIn: body.voteTransparencyOptIn,
      });

      // Update VCP database
      const db = manager.getDatabase();
      await db.run(
        `UPDATE candidacies SET current_version = ?, topic_scope = ?, vote_transparency_opt_in = ?, status = 'active', withdrawn_at = NULL
         WHERE assembly_id = ? AND id = ?`,
        [updated.currentVersion, JSON.stringify(updated.topicScope), updated.voteTransparencyOptIn ? 1 : 0, assemblyId, candidacyId],
      );
      const latestVersion = updated.versions[updated.versions.length - 1]!;
      await db.run(
        `INSERT INTO candidacy_versions (assembly_id, candidacy_id, version_number, content_hash, topic_scope, vote_transparency_opt_in, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [assemblyId, candidacyId, latestVersion.versionNumber, body.contentHash, body.topicScope ? JSON.stringify(body.topicScope) : null, body.voteTransparencyOptIn !== undefined ? (body.voteTransparencyOptIn ? 1 : 0) : null, latestVersion.createdAt],
      );

      return c.json({ currentVersion: updated.currentVersion, status: updated.status }, 200);
    },
  );

  /** POST /assemblies/:id/candidacies/:cid/withdraw — withdraw candidacy. */
  app.post(
    "/assemblies/:id/candidacies/:cid/withdraw",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const candidacyId = c.req.param("cid");
      const participantId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      await engine.candidacies.withdraw(candidacyId as CandidacyId, participantId as ParticipantId);

      const db = manager.getDatabase();
      await db.run(
        `UPDATE candidacies SET status = 'withdrawn', withdrawn_at = ? WHERE assembly_id = ? AND id = ?`,
        [Date.now(), assemblyId, candidacyId],
      );

      return c.json({ status: "withdrawn" });
    },
  );

  return app;
}

function mapCandidacyRow(row: Record<string, unknown>) {
  return {
    id: row["id"],
    participantId: row["participant_id"],
    topicScope: JSON.parse(row["topic_scope"] as string),
    voteTransparencyOptIn: row["vote_transparency_opt_in"] === 1,
    currentVersion: row["current_version"],
    status: row["status"],
    declaredAt: row["declared_at"],
    withdrawnAt: row["withdrawn_at"] ?? undefined,
  };
}
