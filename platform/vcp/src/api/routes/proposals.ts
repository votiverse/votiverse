/**
 * Proposal routes — governance metadata only.
 * Rich content (markdown, assets) lives in the client backend.
 */

import { Hono } from "hono";
import type { ParticipantId, IssueId, ProposalId, ContentHash } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, requireScope } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function proposalRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/proposals — register a proposal (metadata + contentHash). */
  app.post(
    "/assemblies/:id/proposals",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const body = await c.req.json<{
        issueId: string;
        choiceKey?: string;
        title: string;
        contentHash: string;
      }>();
      const authorId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      const proposal = await engine.proposals.submit({
        issueId: body.issueId as IssueId,
        choiceKey: body.choiceKey,
        authorId: authorId as ParticipantId,
        title: body.title,
        contentHash: body.contentHash as ContentHash,
      });

      // Persist to VCP database
      const db = manager.getDatabase();
      await db.run(
        `INSERT INTO proposals (id, assembly_id, issue_id, choice_key, author_id, title, current_version, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [proposal.id, assemblyId, proposal.issueId, proposal.choiceKey ?? null, proposal.authorId, proposal.title, proposal.currentVersion, proposal.status, proposal.submittedAt],
      );
      await db.run(
        `INSERT INTO proposal_versions (assembly_id, proposal_id, version_number, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [assemblyId, proposal.id, 1, body.contentHash, proposal.submittedAt],
      );

      return c.json({
        id: proposal.id,
        issueId: proposal.issueId,
        choiceKey: proposal.choiceKey,
        authorId: proposal.authorId,
        title: proposal.title,
        currentVersion: proposal.currentVersion,
        status: proposal.status,
        submittedAt: proposal.submittedAt,
      }, 201);
    },
  );

  /** GET /assemblies/:id/proposals — list proposal metadata. */
  app.get("/assemblies/:id/proposals", async (c) => {
    const assemblyId = c.req.param("id");
    const issueId = c.req.query("issueId");
    const status = c.req.query("status");

    const db = manager.getDatabase();
    let sql = `SELECT * FROM proposals WHERE assembly_id = ?`;
    const params: unknown[] = [assemblyId];

    if (issueId) {
      sql += ` AND issue_id = ?`;
      params.push(issueId);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY submitted_at DESC`;

    const rows = await db.query<Record<string, unknown>>(sql, params);
    const proposals = rows.map(mapProposalRow);
    const { data, pagination } = paginate(proposals, parsePagination(c));
    return c.json({ proposals: data, pagination });
  });

  /** GET /assemblies/:id/proposals/:pid — get proposal metadata. */
  app.get("/assemblies/:id/proposals/:pid", async (c) => {
    const assemblyId = c.req.param("id");
    const proposalId = c.req.param("pid");

    const db = manager.getDatabase();
    const row = await db.queryOne<Record<string, unknown>>(
      `SELECT * FROM proposals WHERE assembly_id = ? AND id = ?`,
      [assemblyId, proposalId],
    );
    if (!row) {
      return c.json({ error: { code: "NOT_FOUND", message: "Proposal not found" } }, 404);
    }

    // Include version records
    const versions = await db.query<Record<string, unknown>>(
      `SELECT version_number, content_hash, created_at FROM proposal_versions
       WHERE assembly_id = ? AND proposal_id = ? ORDER BY version_number`,
      [assemblyId, proposalId],
    );

    return c.json({ ...mapProposalRow(row), versions });
  });

  /** POST /assemblies/:id/proposals/:pid/version — register new version. */
  app.post(
    "/assemblies/:id/proposals/:pid/version",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const proposalId = c.req.param("pid");
      const body = await c.req.json<{ contentHash: string }>();

      const { engine } = await manager.getEngine(assemblyId);
      const updated = await engine.proposals.createVersion({
        proposalId: proposalId as ProposalId,
        contentHash: body.contentHash as ContentHash,
      });

      // Update VCP database
      const db = manager.getDatabase();
      await db.run(
        `UPDATE proposals SET current_version = ? WHERE assembly_id = ? AND id = ?`,
        [updated.currentVersion, assemblyId, proposalId],
      );
      const latestVersion = updated.versions[updated.versions.length - 1]!;
      await db.run(
        `INSERT INTO proposal_versions (assembly_id, proposal_id, version_number, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [assemblyId, proposalId, latestVersion.versionNumber, body.contentHash, latestVersion.createdAt],
      );

      return c.json({ currentVersion: updated.currentVersion, status: updated.status }, 200);
    },
  );

  /** POST /assemblies/:id/proposals/:pid/withdraw — withdraw proposal. */
  app.post(
    "/assemblies/:id/proposals/:pid/withdraw",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const proposalId = c.req.param("pid");
      const authorId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      await engine.proposals.withdraw(proposalId as ProposalId, authorId);

      // Update VCP database
      const db = manager.getDatabase();
      await db.run(
        `UPDATE proposals SET status = 'withdrawn', withdrawn_at = ? WHERE assembly_id = ? AND id = ?`,
        [Date.now(), assemblyId, proposalId],
      );

      return c.json({ status: "withdrawn" });
    },
  );

  return app;
}

function mapProposalRow(row: Record<string, unknown>) {
  return {
    id: row["id"],
    issueId: row["issue_id"],
    choiceKey: row["choice_key"] ?? undefined,
    authorId: row["author_id"],
    title: row["title"],
    currentVersion: row["current_version"],
    status: row["status"],
    submittedAt: row["submitted_at"],
    lockedAt: row["locked_at"] ?? undefined,
    withdrawnAt: row["withdrawn_at"] ?? undefined,
  };
}
