/**
 * Content integration tests — tests the ContentService's local storage
 * operations and the VCP-first orchestration pattern.
 *
 * These tests exercise the full draft → submit → content storage flow
 * against a real in-memory database. The VCP call is tested separately
 * in VCP integration tests; here we test the backend's content lifecycle.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteAdapter } from "../src/adapters/database/sqlite.js";
import { runMigrations } from "../src/adapters/database/migrator.js";
import { ContentService, computeContentHash } from "../src/services/content-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

describe("Content integration — full draft-to-content lifecycle", () => {
  let db: SQLiteAdapter;
  let service: ContentService;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await runMigrations(db, MIGRATIONS_DIR);
    service = new ContentService(db);
  });

  afterEach(() => { void db.close(); });

  it("creates draft, edits, stores content after VCP acceptance, and deletes draft", async () => {
    // Step 1: Create draft
    const draft = await service.createDraft({
      assemblyId: "asm-1",
      issueId: "issue-1",
      choiceKey: "for",
      authorId: "user-alice",
      title: "Fund the Park",
      markdown: "# Initial Draft",
    });
    expect(draft.markdown).toBe("# Initial Draft");

    // Step 2: Edit draft (backend-only, no VCP)
    await service.updateDraft("asm-1", draft.id, {
      markdown: "# Final Version\n\nDetailed argument here.",
      title: "Fund the Park — Revised",
    });
    const updated = await service.getDraft("asm-1", draft.id);
    expect(updated!.title).toBe("Fund the Park — Revised");

    // Step 3: Simulate VCP acceptance — store content keyed by VCP-generated ID
    const vcpProposalId = "vcp-prop-001"; // normally returned by VCP
    const contentHash = computeContentHash(updated!.markdown, []);

    await service.storeProposalContent({
      proposalId: vcpProposalId,
      assemblyId: "asm-1",
      versionNumber: 1,
      markdown: updated!.markdown,
      assets: [],
      contentHash,
      createdAt: Date.now(),
    });

    // Step 4: Delete draft
    await service.deleteDraft("asm-1", draft.id);
    expect(await service.getDraft("asm-1", draft.id)).toBeUndefined();

    // Step 5: Verify content is stored independently of draft
    const content = await service.getProposalContent("asm-1", vcpProposalId);
    expect(content).toBeDefined();
    expect((content as Record<string, unknown>)["markdown"]).toBe("# Final Version\n\nDetailed argument here.");
    expect((content as Record<string, unknown>)["content_hash"]).toBe(contentHash);
  });

  it("stores multiple proposal versions with distinct hashes", async () => {
    const proposalId = "prop-1";

    await service.storeProposalContent({
      proposalId, assemblyId: "asm-1", versionNumber: 1,
      markdown: "# v1", assets: [], contentHash: computeContentHash("# v1"),
      createdAt: Date.now(),
    });
    await service.storeProposalContent({
      proposalId, assemblyId: "asm-1", versionNumber: 2,
      markdown: "# v2 — updated budget", assets: ["asset-hash-1"],
      contentHash: computeContentHash("# v2 — updated budget", ["asset-hash-1"]),
      changeSummary: "Updated budget section",
      createdAt: Date.now(),
    });

    const versions = await service.listProposalVersions("asm-1", proposalId);
    expect(versions).toHaveLength(2);
    expect((versions[0] as Record<string, unknown>)["version_number"]).toBe(1);
    expect((versions[1] as Record<string, unknown>)["version_number"]).toBe(2);
    expect((versions[1] as Record<string, unknown>)["change_summary"]).toBe("Updated budget section");

    // Hashes differ
    expect((versions[0] as Record<string, unknown>)["content_hash"])
      .not.toBe((versions[1] as Record<string, unknown>)["content_hash"]);
  });

  it("content hash is deterministic and order-independent for assets", () => {
    const h1 = computeContentHash("# Proposal", ["asset-a", "asset-b"]);
    const h2 = computeContentHash("# Proposal", ["asset-b", "asset-a"]);
    expect(h1).toBe(h2);

    const h3 = computeContentHash("# Different", ["asset-a", "asset-b"]);
    expect(h1).not.toBe(h3);
  });

  it("stores candidacy content with version history", async () => {
    await service.storeCandidacyContent({
      candidacyId: "cand-1", assemblyId: "asm-1", versionNumber: 1,
      markdown: "# Profile v1", assets: [], contentHash: "hash-1",
      createdAt: Date.now(),
    });
    await service.storeCandidacyContent({
      candidacyId: "cand-1", assemblyId: "asm-1", versionNumber: 2,
      markdown: "# Profile v2 — added positions", assets: [],
      contentHash: "hash-2", changeSummary: "Added positions section",
      createdAt: Date.now(),
    });

    // Latest version
    const latest = await service.getCandidacyContent("asm-1", "cand-1");
    expect((latest as Record<string, unknown>)["version_number"]).toBe(2);

    // Specific version
    const v1 = await service.getCandidacyContent("asm-1", "cand-1", 1);
    expect((v1 as Record<string, unknown>)["markdown"]).toBe("# Profile v1");
  });

  it("stores note content as single immutable record", async () => {
    const hash = computeContentHash("Cost estimate is wrong.");
    await service.storeNoteContent({
      noteId: "note-1", assemblyId: "asm-1",
      markdown: "Cost estimate is wrong.",
      assets: [], contentHash: hash, createdAt: Date.now(),
    });

    const content = await service.getNoteContent("asm-1", "note-1");
    expect(content).toBeDefined();
    expect((content as Record<string, unknown>)["content_hash"]).toBe(hash);
  });

  it("stores and retrieves assets with integrity hashes", async () => {
    const imageData = Buffer.from("PNG fake image data here");
    const asset = await service.storeAsset({
      assemblyId: "asm-1",
      filename: "park-photo.png",
      mimeType: "image/png",
      data: imageData,
      uploadedBy: "user-1",
    });

    expect(asset.hash).toMatch(/^[a-f0-9]{64}$/);

    const retrieved = await service.getAsset(asset.id);
    expect(retrieved!.data.toString()).toBe("PNG fake image data here");
    expect(retrieved!.hash).toBe(asset.hash);

    // Hash is deterministic
    const asset2 = await service.storeAsset({
      assemblyId: "asm-1",
      filename: "same-content.png",
      mimeType: "image/png",
      data: imageData,
      uploadedBy: "user-1",
    });
    expect(asset2.hash).toBe(asset.hash);
  });
});
