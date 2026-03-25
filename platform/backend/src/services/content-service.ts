/**
 * Content service — manages rich content (markdown, assets) for
 * proposals, candidacies, and community notes.
 *
 * The backend stores the actual content. The VCP stores governance
 * metadata and content hashes. This service orchestrates both.
 */

import { v7 as uuidv7 } from "uuid";
import { createHash } from "node:crypto";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { parseJsonColumn } from "../adapters/database/interface.js";

// ---------------------------------------------------------------------------
// Content hash (matches @votiverse/content Appendix C spec)
// ---------------------------------------------------------------------------

export function computeContentHash(markdown: string, assetHashes: string[] = []): string {
  const sorted = [...assetHashes].sort();
  const input = markdown + "\0" + sorted.join("\0");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Draft types
// ---------------------------------------------------------------------------

export interface ProposalDraft {
  id: string;
  assemblyId: string;
  issueId: string;
  choiceKey?: string;
  authorId: string;
  title: string;
  markdown: string;
  assets: string[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Content service
// ---------------------------------------------------------------------------

export class ContentService {
  constructor(
    private readonly db: DatabaseAdapter,
  ) {}

  // -----------------------------------------------------------------------
  // Proposal drafts
  // -----------------------------------------------------------------------

  async createDraft(params: {
    assemblyId: string;
    issueId: string;
    choiceKey?: string;
    authorId: string;
    title: string;
    markdown?: string;
  }): Promise<ProposalDraft> {
    const id = uuidv7();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO proposal_drafts (id, assembly_id, issue_id, choice_key, author_id, title, markdown, assets, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
      [id, params.assemblyId, params.issueId, params.choiceKey ?? null, params.authorId, params.title, params.markdown ?? "", now, now],
    );
    return {
      id, assemblyId: params.assemblyId, issueId: params.issueId,
      choiceKey: params.choiceKey, authorId: params.authorId,
      title: params.title, markdown: params.markdown ?? "", assets: [],
      createdAt: now, updatedAt: now,
    };
  }

  async getDraft(assemblyId: string, draftId: string): Promise<ProposalDraft | undefined> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT * FROM proposal_drafts WHERE id = ? AND assembly_id = ?`,
      [draftId, assemblyId],
    );
    return row ? mapDraftRow(row) : undefined;
  }

  async listDrafts(assemblyId: string, authorId: string): Promise<ProposalDraft[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM proposal_drafts WHERE assembly_id = ? AND author_id = ? ORDER BY updated_at DESC`,
      [assemblyId, authorId],
    );
    return rows.map(mapDraftRow);
  }

  async updateDraft(assemblyId: string, draftId: string, updates: {
    title?: string;
    markdown?: string;
    choiceKey?: string;
    assets?: string[];
  }): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.title !== undefined) { sets.push("title = ?"); params.push(updates.title); }
    if (updates.markdown !== undefined) { sets.push("markdown = ?"); params.push(updates.markdown); }
    if (updates.choiceKey !== undefined) { sets.push("choice_key = ?"); params.push(updates.choiceKey); }
    if (updates.assets !== undefined) { sets.push("assets = ?"); params.push(JSON.stringify(updates.assets)); }

    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(draftId, assemblyId);

    await this.db.run(
      `UPDATE proposal_drafts SET ${sets.join(", ")} WHERE id = ? AND assembly_id = ?`,
      params,
    );
  }

  async deleteDraft(assemblyId: string, draftId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM proposal_drafts WHERE id = ? AND assembly_id = ?`,
      [draftId, assemblyId],
    );
  }

  // -----------------------------------------------------------------------
  // Proposal content (immutable versions)
  // -----------------------------------------------------------------------

  async storeProposalContent(params: {
    proposalId: string;
    assemblyId: string;
    versionNumber: number;
    markdown: string;
    assets: string[];
    contentHash: string;
    changeSummary?: string;
    createdAt: number;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO proposal_content (proposal_id, assembly_id, version_number, markdown, assets, content_hash, change_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.proposalId, params.assemblyId, params.versionNumber, params.markdown, JSON.stringify(params.assets), params.contentHash, params.changeSummary ?? null, params.createdAt],
    );
  }

  async getProposalContent(assemblyId: string, proposalId: string, versionNumber?: number): Promise<Record<string, unknown> | undefined> {
    if (versionNumber !== undefined) {
      return this.db.queryOne(
        `SELECT * FROM proposal_content WHERE assembly_id = ? AND proposal_id = ? AND version_number = ?`,
        [assemblyId, proposalId, versionNumber],
      );
    }
    // Latest version
    return this.db.queryOne(
      `SELECT * FROM proposal_content WHERE assembly_id = ? AND proposal_id = ? ORDER BY version_number DESC LIMIT 1`,
      [assemblyId, proposalId],
    );
  }

  async listProposalVersions(assemblyId: string, proposalId: string): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT * FROM proposal_content WHERE assembly_id = ? AND proposal_id = ? ORDER BY version_number`,
      [assemblyId, proposalId],
    );
  }

  // -----------------------------------------------------------------------
  // Candidacy content (immutable versions)
  // -----------------------------------------------------------------------

  async storeCandidacyContent(params: {
    candidacyId: string;
    assemblyId: string;
    versionNumber: number;
    markdown: string;
    assets: string[];
    contentHash: string;
    changeSummary?: string;
    websiteUrl?: string | null;
    createdAt: number;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO candidacy_content (candidacy_id, assembly_id, version_number, markdown, assets, content_hash, change_summary, website_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.candidacyId, params.assemblyId, params.versionNumber, params.markdown, JSON.stringify(params.assets), params.contentHash, params.changeSummary ?? null, params.websiteUrl ?? null, params.createdAt],
    );
  }

  async getCandidacyContent(assemblyId: string, candidacyId: string, versionNumber?: number): Promise<Record<string, unknown> | undefined> {
    if (versionNumber !== undefined) {
      return this.db.queryOne(
        `SELECT * FROM candidacy_content WHERE assembly_id = ? AND candidacy_id = ? AND version_number = ?`,
        [assemblyId, candidacyId, versionNumber],
      );
    }
    return this.db.queryOne(
      `SELECT * FROM candidacy_content WHERE assembly_id = ? AND candidacy_id = ? ORDER BY version_number DESC LIMIT 1`,
      [assemblyId, candidacyId],
    );
  }

  // -----------------------------------------------------------------------
  // Note content (immutable, single version)
  // -----------------------------------------------------------------------

  async storeNoteContent(params: {
    noteId: string;
    assemblyId: string;
    markdown: string;
    assets: string[];
    contentHash: string;
    createdAt: number;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO note_content (note_id, assembly_id, markdown, assets, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [params.noteId, params.assemblyId, params.markdown, JSON.stringify(params.assets), params.contentHash, params.createdAt],
    );
  }

  async getNoteContent(assemblyId: string, noteId: string): Promise<Record<string, unknown> | undefined> {
    return this.db.queryOne(
      `SELECT * FROM note_content WHERE assembly_id = ? AND note_id = ?`,
      [assemblyId, noteId],
    );
  }

  // -----------------------------------------------------------------------
  // Booklet recommendations
  // -----------------------------------------------------------------------

  async storeRecommendation(params: {
    assemblyId: string;
    eventId: string;
    issueId: string;
    markdown: string;
  }): Promise<{ contentHash: string }> {
    const contentHash = computeContentHash(params.markdown);
    const now = Date.now();
    await this.db.run(
      `INSERT INTO booklet_recommendation_content (assembly_id, event_id, issue_id, markdown, content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(assembly_id, event_id, issue_id)
       DO UPDATE SET markdown = ?, content_hash = ?, updated_at = ?`,
      [params.assemblyId, params.eventId, params.issueId, params.markdown, contentHash, now, now, params.markdown, contentHash, now],
    );
    return { contentHash };
  }

  async getRecommendation(assemblyId: string, eventId: string, issueId: string): Promise<{
    markdown: string;
    contentHash: string;
    createdAt: number;
    updatedAt: number;
  } | undefined> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT * FROM booklet_recommendation_content WHERE assembly_id = ? AND event_id = ? AND issue_id = ?`,
      [assemblyId, eventId, issueId],
    );
    if (!row) return undefined;
    return {
      markdown: row["markdown"] as string,
      contentHash: row["content_hash"] as string,
      createdAt: row["created_at"] as number,
      updatedAt: row["updated_at"] as number,
    };
  }

  async deleteRecommendation(assemblyId: string, eventId: string, issueId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM booklet_recommendation_content WHERE assembly_id = ? AND event_id = ? AND issue_id = ?`,
      [assemblyId, eventId, issueId],
    );
  }

  // -----------------------------------------------------------------------
  // Assets
  // -----------------------------------------------------------------------

  async storeAsset(params: {
    assemblyId: string;
    filename: string;
    mimeType: string;
    data: Buffer;
    uploadedBy: string;
  }): Promise<{ id: string; hash: string; sizeBytes: number }> {
    const id = uuidv7();
    const hash = createHash("sha256").update(params.data).digest("hex");
    const sizeBytes = params.data.length;
    const now = Date.now();

    await this.db.run(
      `INSERT INTO assets (id, assembly_id, filename, mime_type, size_bytes, hash, uploaded_by, uploaded_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.assemblyId, params.filename, params.mimeType, sizeBytes, hash, params.uploadedBy, now, params.data],
    );

    return { id, hash, sizeBytes };
  }

  async getAsset(assetId: string): Promise<{ id: string; filename: string; mimeType: string; sizeBytes: number; hash: string; data: Buffer } | undefined> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT * FROM assets WHERE id = ?`,
      [assetId],
    );
    if (!row) return undefined;
    return {
      id: row["id"] as string,
      filename: row["filename"] as string,
      mimeType: row["mime_type"] as string,
      sizeBytes: row["size_bytes"] as number,
      hash: row["hash"] as string,
      data: row["data"] as Buffer,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapDraftRow(row: Record<string, unknown>): ProposalDraft {
  return {
    id: row["id"] as string,
    assemblyId: row["assembly_id"] as string,
    issueId: row["issue_id"] as string,
    choiceKey: (row["choice_key"] as string) ?? undefined,
    authorId: row["author_id"] as string,
    title: row["title"] as string,
    markdown: row["markdown"] as string,
    assets: parseJsonColumn<unknown[]>(row["assets"] ?? "[]"),
    createdAt: row["created_at"] as number,
    updatedAt: row["updated_at"] as number,
  };
}
