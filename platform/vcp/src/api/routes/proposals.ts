/**
 * Proposal routes — governance metadata only.
 * Rich content (markdown, assets) lives in the client backend.
 */

import { Hono } from "hono";
import type { ParticipantId, IssueId, ProposalId, ContentHash, ProposalEvaluation } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { getEventPhase } from "../../engine/event-phases.js";
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

      // Check if we're in the curation phase — no new proposals accepted
      const issue = engine.events.getIssue(body.issueId as IssueId);
      if (issue) {
        const ve = engine.events.get(issue.votingEventId);
        const info = await manager.getAssemblyInfo(assemblyId);
        if (ve && info) {
          const now = manager.timeProvider.now() as number;
          const phase = getEventPhase(now, {
            deliberationStart: ve.timeline.deliberationStart as number,
            votingStart: ve.timeline.votingStart as number,
            votingEnd: ve.timeline.votingEnd as number,
          }, info.config.timeline);
          if (phase === "curation") {
            return c.json(
              { error: { code: "CURATION_PHASE", message: "New proposals are not accepted during the curation phase", details: { phase: "curation" } } },
              409,
            );
          }
        }
      }

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
        `INSERT INTO proposals (id, assembly_id, issue_id, choice_key, author_id, title, current_version, endorsement_count, dispute_count, featured, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
        [proposal.id, assemblyId, proposal.issueId, proposal.choiceKey ?? null, proposal.authorId, proposal.title, proposal.currentVersion, false, proposal.status, proposal.submittedAt],
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
    if (status && status !== "locked") {
      // Filter by stored status (submitted or withdrawn)
      // 'locked' is computed, not stored — filtered after computation
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY submitted_at DESC`;

    const rows = await db.query<Record<string, unknown>>(sql, params);

    // Build lock-time map: proposals lock at curation start (or votingStart if no curation)
    const { engine } = await manager.getEngine(assemblyId);
    const info = await manager.getAssemblyInfo(assemblyId);
    const now = manager.timeProvider.now() as number;
    const DAY_MS = 86_400_000;
    const lockTimeMap = new Map<string, number>();
    for (const row of rows) {
      const iid = row["issue_id"] as string;
      if (!lockTimeMap.has(iid)) {
        const issue = engine.events.getIssue(iid as IssueId);
        if (issue) {
          const ve = engine.events.get(issue.votingEventId);
          if (ve && info) {
            // Lock at deliberation end (= curation start) if curation is configured
            const deliberationEnd = (ve.timeline.deliberationStart as number) + info.config.timeline.deliberationDays * DAY_MS;
            const lockTime = info.config.timeline.curationDays > 0 ? deliberationEnd : (ve.timeline.votingStart as number);
            lockTimeMap.set(iid, lockTime);
          }
        }
      }
    }

    let proposals = rows.map((r) => mapProposalRow(r, lockTimeMap, now));

    // Post-filter for 'locked' status (computed, not stored)
    if (status === "locked") {
      proposals = proposals.filter((p) => p.status === "locked");
    }

    const { data, pagination } = paginate(proposals, parsePagination(c));
    return c.json({ proposals: data, pagination });
  });

  /**
   * GET /assemblies/:id/proposals/booklet?issueId=...
   * Returns featured proposals per choiceKey, or auto-falls back to highest-scored.
   * MUST be registered before the /:pid catch-all route.
   */
  app.get("/assemblies/:id/proposals/booklet", async (c) => {
    const assemblyId = c.req.param("id");
    const issueIdQ = c.req.query("issueId");
    if (!issueIdQ) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "issueId query param required" } }, 400);
    }

    const db = manager.getDatabase();

    // Get all non-withdrawn proposals for this issue
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM proposals WHERE assembly_id = ? AND issue_id = ? AND status != 'withdrawn' ORDER BY (endorsement_count - dispute_count) DESC, submitted_at ASC`,
      [assemblyId, issueIdQ],
    );

    // Compute status (locked or submitted) from timeline
    const { engine } = await manager.getEngine(assemblyId);
    const now = manager.timeProvider.now() as number;
    const votingStartMap = new Map<string, number>();
    const iss = engine.events.getIssue(issueIdQ as IssueId);
    if (iss) {
      const ve = engine.events.get(iss.votingEventId);
      if (ve) votingStartMap.set(issueIdQ, ve.timeline.votingStart as number);
    }

    const bookletProposals = rows.map((r) => mapProposalRow(r, votingStartMap, now));

    // Group by choiceKey
    const byChoice = new Map<string, typeof bookletProposals>();
    for (const p of bookletProposals) {
      const key = (p.choiceKey as string) ?? "general";
      const list = byChoice.get(key) ?? [];
      list.push(p);
      byChoice.set(key, list);
    }

    // For each choiceKey: pick featured if any, else highest-scored
    const booklet: Record<string, unknown> = {};
    for (const [key, list] of byChoice) {
      const featured = list.find((p) => p.featured);
      booklet[key] = {
        featured: featured ?? list[0] ?? null,
        all: list,
      };
    }

    // Get recommendation if any
    const bookletEventId = iss?.votingEventId;
    let recommendation = null;
    if (bookletEventId) {
      const recRow = await db.queryOne<Record<string, unknown>>(
        `SELECT * FROM booklet_recommendations WHERE assembly_id = ? AND event_id = ? AND issue_id = ?`,
        [assemblyId, bookletEventId, issueIdQ],
      );
      if (recRow) {
        recommendation = {
          authorId: recRow["author_id"],
          contentHash: recRow["content_hash"],
          createdAt: recRow["created_at"],
          updatedAt: recRow["updated_at"],
        };
      }
    }

    return c.json({ issueId: issueIdQ, positions: booklet, recommendation });
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

    // Compute status from timeline
    const { engine } = await manager.getEngine(assemblyId);
    const now = manager.timeProvider.now() as number;
    const votingStartMap = new Map<string, number>();
    const iid = row["issue_id"] as string;
    const issue = engine.events.getIssue(iid as IssueId);
    if (issue) {
      const ve = engine.events.get(issue.votingEventId);
      if (ve) votingStartMap.set(iid, ve.timeline.votingStart as number);
    }

    // Include version records
    const versions = await db.query<Record<string, unknown>>(
      `SELECT version_number, content_hash, created_at FROM proposal_versions
       WHERE assembly_id = ? AND proposal_id = ? ORDER BY version_number`,
      [assemblyId, proposalId],
    );

    return c.json({ ...mapProposalRow(row, votingStartMap, now), versions });
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

  /** POST /assemblies/:id/proposals/:pid/evaluate — endorse or dispute. */
  app.post(
    "/assemblies/:id/proposals/:pid/evaluate",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const proposalId = c.req.param("pid");
      const body = await c.req.json<{ evaluation: string }>();
      const participantId = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);

      // Check if we're in the curation phase — endorsements frozen
      const db = manager.getDatabase();
      const proposalRow = await db.queryOne<{ issue_id: string }>(
        `SELECT issue_id FROM proposals WHERE assembly_id = ? AND id = ?`,
        [assemblyId, proposalId],
      );
      if (proposalRow) {
        const issue = engine.events.getIssue(proposalRow.issue_id as IssueId);
        if (issue) {
          const ve = engine.events.get(issue.votingEventId);
          const info = await manager.getAssemblyInfo(assemblyId);
          if (ve && info) {
            const now = manager.timeProvider.now() as number;
            const phase = getEventPhase(now, {
              deliberationStart: ve.timeline.deliberationStart as number,
              votingStart: ve.timeline.votingStart as number,
              votingEnd: ve.timeline.votingEnd as number,
            }, info.config.timeline);
            if (phase !== "deliberation") {
              return c.json(
                { error: { code: "ENDORSEMENTS_FROZEN", message: "Endorsements are only accepted during the deliberation phase", details: { phase, requiredPhase: "deliberation" } } },
                409,
              );
            }
          }
        }
      }

      // Check previous evaluation for materialized count update
      const prev = await db.queryOne<{ evaluation: string }>(
        `SELECT evaluation FROM proposal_endorsements WHERE assembly_id = ? AND proposal_id = ? AND participant_id = ?`,
        [assemblyId, proposalId, participantId],
      );

      await engine.proposals.evaluate(
        proposalId as ProposalId,
        participantId as ParticipantId,
        body.evaluation as ProposalEvaluation,
      );

      // Update materialized counts
      if (prev) {
        const oldCol = prev.evaluation === "endorse" ? "endorsement_count" : "dispute_count";
        const newCol = body.evaluation === "endorse" ? "endorsement_count" : "dispute_count";
        if (oldCol !== newCol) {
          await db.run(
            `UPDATE proposals SET ${oldCol} = ${oldCol} - 1, ${newCol} = ${newCol} + 1 WHERE assembly_id = ? AND id = ?`,
            [assemblyId, proposalId],
          );
        }
      } else {
        const col = body.evaluation === "endorse" ? "endorsement_count" : "dispute_count";
        await db.run(
          `UPDATE proposals SET ${col} = ${col} + 1 WHERE assembly_id = ? AND id = ?`,
          [assemblyId, proposalId],
        );
      }

      // Upsert endorsement record
      await db.run(
        `INSERT INTO proposal_endorsements (assembly_id, proposal_id, participant_id, evaluation, evaluated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (assembly_id, proposal_id, participant_id) DO UPDATE SET evaluation = EXCLUDED.evaluation, evaluated_at = EXCLUDED.evaluated_at`,
        [assemblyId, proposalId, participantId, body.evaluation, Date.now()],
      );

      return c.json({ status: "ok" });
    },
  );

  /** POST /assemblies/:id/proposals/:pid/feature — mark as featured (admin only). */
  app.post(
    "/assemblies/:id/proposals/:pid/feature",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const proposalId = c.req.param("pid");
      const participantId = c.get("participantId") as string;

      // Verify caller is an admin
      const isAdmin = await manager.isAdmin(assemblyId, participantId);
      if (!isAdmin) {
        return c.json({ error: { code: "FORBIDDEN", message: "Only admins can feature proposals", details: { requiredRole: "admin" } } }, 403);
      }

      const db = manager.getDatabase();

      // Check proposal exists and get its issue + choiceKey
      const proposal = await db.queryOne<{ issue_id: string; choice_key: string | null }>(
        `SELECT issue_id, choice_key FROM proposals WHERE assembly_id = ? AND id = ?`,
        [assemblyId, proposalId],
      );
      if (!proposal) {
        return c.json({ error: { code: "NOT_FOUND", message: "Proposal not found" } }, 404);
      }

      // Exclusive featuring: unfeature any other proposal for the same choiceKey + issue
      if (proposal.choice_key) {
        await db.run(
          `UPDATE proposals SET featured = ?
           WHERE assembly_id = ? AND issue_id = ? AND choice_key = ? AND id != ? AND featured = ?`,
          [false, assemblyId, proposal.issue_id, proposal.choice_key, proposalId, true],
        );
      }

      await db.run(
        `UPDATE proposals SET featured = ? WHERE assembly_id = ? AND id = ?`,
        [true, assemblyId, proposalId],
      );

      return c.json({ status: "featured" });
    },
  );

  /** POST /assemblies/:id/proposals/:pid/unfeature — remove featured flag (admin only). */
  app.post(
    "/assemblies/:id/proposals/:pid/unfeature",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const proposalId = c.req.param("pid");
      const participantId = c.get("participantId") as string;

      // Verify caller is an admin
      const isAdmin = await manager.isAdmin(assemblyId, participantId);
      if (!isAdmin) {
        return c.json({ error: { code: "FORBIDDEN", message: "Only admins can unfeature proposals", details: { requiredRole: "admin" } } }, 403);
      }

      const db = manager.getDatabase();
      const proposal = await db.queryOne<Record<string, unknown>>(
        `SELECT id FROM proposals WHERE assembly_id = ? AND id = ?`,
        [assemblyId, proposalId],
      );
      if (!proposal) {
        return c.json({ error: { code: "NOT_FOUND", message: "Proposal not found" } }, 404);
      }

      await db.run(
        `UPDATE proposals SET featured = ? WHERE assembly_id = ? AND id = ?`,
        [false, assemblyId, proposalId],
      );

      return c.json({ status: "unfeatured" });
    },
  );

  /** POST /assemblies/:id/events/:eid/issues/:iid/recommendation — set organizer recommendation. */
  app.post(
    "/assemblies/:id/events/:eid/issues/:iid/recommendation",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const eventId = c.req.param("eid");
      const issueId = c.req.param("iid");
      const participantId = c.get("participantId") as string;
      const body = await c.req.json<{ contentHash: string }>();

      // Verify caller is an admin
      const isAdmin = await manager.isAdmin(assemblyId, participantId);
      if (!isAdmin) {
        return c.json({ error: { code: "FORBIDDEN", message: "Only admins can set recommendations", details: { requiredRole: "admin" } } }, 403);
      }

      const db = manager.getDatabase();
      const now = Date.now();
      await db.run(
        `INSERT INTO booklet_recommendations (assembly_id, event_id, issue_id, author_id, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(assembly_id, event_id, issue_id)
         DO UPDATE SET content_hash = ?, author_id = ?, updated_at = ?`,
        [assemblyId, eventId, issueId, participantId, body.contentHash, now, now, body.contentHash, participantId, now],
      );

      return c.json({ status: "ok", contentHash: body.contentHash }, 201);
    },
  );

  /** GET /assemblies/:id/events/:eid/issues/:iid/recommendation — get recommendation. */
  app.get("/assemblies/:id/events/:eid/issues/:iid/recommendation", async (c) => {
    const assemblyId = c.req.param("id");
    const eventId = c.req.param("eid");
    const issueId = c.req.param("iid");

    const db = manager.getDatabase();
    const row = await db.queryOne<Record<string, unknown>>(
      `SELECT * FROM booklet_recommendations WHERE assembly_id = ? AND event_id = ? AND issue_id = ?`,
      [assemblyId, eventId, issueId],
    );

    if (!row) {
      return c.json({ recommendation: null });
    }

    return c.json({
      recommendation: {
        authorId: row["author_id"],
        contentHash: row["content_hash"],
        createdAt: row["created_at"],
        updatedAt: row["updated_at"],
      },
    });
  });

  /** DELETE /assemblies/:id/events/:eid/issues/:iid/recommendation — remove recommendation. */
  app.delete(
    "/assemblies/:id/events/:eid/issues/:iid/recommendation",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const eventId = c.req.param("eid");
      const issueId = c.req.param("iid");
      const participantId = c.get("participantId") as string;

      // Verify caller is an admin
      const isAdmin = await manager.isAdmin(assemblyId, participantId);
      if (!isAdmin) {
        return c.json({ error: { code: "FORBIDDEN", message: "Only admins can remove recommendations", details: { requiredRole: "admin" } } }, 403);
      }

      const db = manager.getDatabase();
      await db.run(
        `DELETE FROM booklet_recommendations WHERE assembly_id = ? AND event_id = ? AND issue_id = ?`,
        [assemblyId, eventId, issueId],
      );

      return c.json({ status: "deleted" });
    },
  );

  return app;
}

/**
 * Map a proposal DB row to the API response shape.
 * Status is computed: 'withdrawn' if explicitly withdrawn, 'locked' if
 * votingStart has passed for the linked issue, 'submitted' otherwise.
 */
/**
 * Map a proposal DB row to the API response shape.
 * Status is computed: 'withdrawn' if explicitly withdrawn, 'locked' if
 * curation or voting has started for the linked issue, 'submitted' otherwise.
 *
 * @param lockTimeMap - maps issueId to the timestamp when proposals lock
 *   (curation start if curationDays > 0, otherwise votingStart)
 */
function mapProposalRow(row: Record<string, unknown>, lockTimeMap?: Map<string, number>, now?: number) {
  const dbStatus = row["status"] as string;
  let status = dbStatus;

  // Compute locked status from timeline (unless already withdrawn)
  if (dbStatus !== "withdrawn" && lockTimeMap && now !== undefined) {
    const issueId = row["issue_id"] as string;
    const lockTime = lockTimeMap.get(issueId);
    if (lockTime !== undefined && now >= lockTime) {
      status = "locked";
    }
  }

  return {
    id: row["id"],
    issueId: row["issue_id"],
    choiceKey: row["choice_key"] ?? undefined,
    authorId: row["author_id"],
    title: row["title"],
    currentVersion: row["current_version"],
    endorsementCount: row["endorsement_count"] ?? 0,
    disputeCount: row["dispute_count"] ?? 0,
    featured: !!row["featured"],
    status,
    submittedAt: row["submitted_at"],
    withdrawnAt: row["withdrawn_at"] ?? undefined,
  };
}
