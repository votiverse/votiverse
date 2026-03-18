/**
 * Content service tests — draft management, content storage, assets.
 * These test the backend's local storage layer (no VCP required).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteAdapter } from "../src/adapters/database/sqlite.js";
import { ContentService, computeContentHash } from "../src/services/content-service.js";

describe("ContentService", () => {
  let db: SQLiteAdapter;
  let service: ContentService;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    service = new ContentService(db);
  });

  afterEach(() => { void db.close(); });

  describe("proposal drafts", () => {
    it("creates and retrieves a draft", async () => {
      const draft = await service.createDraft({
        assemblyId: "asm-1",
        issueId: "issue-1",
        choiceKey: "for",
        authorId: "user-1",
        title: "My Proposal",
        markdown: "# Draft\n\nContent here.",
      });

      expect(draft.id).toBeDefined();
      expect(draft.title).toBe("My Proposal");
      expect(draft.markdown).toBe("# Draft\n\nContent here.");

      const retrieved = await service.getDraft("asm-1", draft.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe("My Proposal");
    });

    it("lists drafts by author", async () => {
      await service.createDraft({ assemblyId: "asm-1", issueId: "i1", authorId: "alice", title: "A" });
      await service.createDraft({ assemblyId: "asm-1", issueId: "i1", authorId: "alice", title: "B" });
      await service.createDraft({ assemblyId: "asm-1", issueId: "i1", authorId: "bob", title: "C" });

      const aliceDrafts = await service.listDrafts("asm-1", "alice");
      expect(aliceDrafts).toHaveLength(2);

      const bobDrafts = await service.listDrafts("asm-1", "bob");
      expect(bobDrafts).toHaveLength(1);
    });

    it("updates a draft", async () => {
      const draft = await service.createDraft({
        assemblyId: "asm-1", issueId: "i1", authorId: "alice", title: "Original",
      });

      await service.updateDraft("asm-1", draft.id, {
        title: "Updated Title",
        markdown: "New content",
      });

      const updated = await service.getDraft("asm-1", draft.id);
      expect(updated!.title).toBe("Updated Title");
      expect(updated!.markdown).toBe("New content");
    });

    it("deletes a draft", async () => {
      const draft = await service.createDraft({
        assemblyId: "asm-1", issueId: "i1", authorId: "alice", title: "To Delete",
      });

      await service.deleteDraft("asm-1", draft.id);

      const retrieved = await service.getDraft("asm-1", draft.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("proposal content", () => {
    it("stores and retrieves versioned content", async () => {
      await service.storeProposalContent({
        proposalId: "prop-1",
        assemblyId: "asm-1",
        versionNumber: 1,
        markdown: "# Version 1",
        assets: [],
        contentHash: "hash-v1",
        createdAt: Date.now(),
      });
      await service.storeProposalContent({
        proposalId: "prop-1",
        assemblyId: "asm-1",
        versionNumber: 2,
        markdown: "# Version 2",
        assets: ["asset-1"],
        contentHash: "hash-v2",
        changeSummary: "Updated budget section",
        createdAt: Date.now(),
      });

      // Latest
      const latest = await service.getProposalContent("asm-1", "prop-1");
      expect(latest).toBeDefined();
      expect((latest as Record<string, unknown>)["version_number"]).toBe(2);

      // Specific version
      const v1 = await service.getProposalContent("asm-1", "prop-1", 1);
      expect(v1).toBeDefined();
      expect((v1 as Record<string, unknown>)["markdown"]).toBe("# Version 1");

      // All versions
      const versions = await service.listProposalVersions("asm-1", "prop-1");
      expect(versions).toHaveLength(2);
    });
  });

  describe("candidacy content", () => {
    it("stores and retrieves candidacy content", async () => {
      await service.storeCandidacyContent({
        candidacyId: "cand-1",
        assemblyId: "asm-1",
        versionNumber: 1,
        markdown: "# My Profile",
        assets: [],
        contentHash: "hash-1",
        createdAt: Date.now(),
      });

      const content = await service.getCandidacyContent("asm-1", "cand-1");
      expect(content).toBeDefined();
      expect((content as Record<string, unknown>)["markdown"]).toBe("# My Profile");
    });
  });

  describe("note content", () => {
    it("stores and retrieves note content", async () => {
      await service.storeNoteContent({
        noteId: "note-1",
        assemblyId: "asm-1",
        markdown: "This cost estimate is wrong.",
        assets: [],
        contentHash: "hash-1",
        createdAt: Date.now(),
      });

      const content = await service.getNoteContent("asm-1", "note-1");
      expect(content).toBeDefined();
      expect((content as Record<string, unknown>)["markdown"]).toBe("This cost estimate is wrong.");
    });
  });

  describe("assets", () => {
    it("stores and retrieves a binary asset", async () => {
      const data = Buffer.from("fake image data");
      const result = await service.storeAsset({
        assemblyId: "asm-1",
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        data,
        uploadedBy: "user-1",
      });

      expect(result.id).toBeDefined();
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.sizeBytes).toBe(data.length);

      const asset = await service.getAsset(result.id);
      expect(asset).toBeDefined();
      expect(asset!.filename).toBe("photo.jpg");
      expect(asset!.mimeType).toBe("image/jpeg");
      expect(asset!.data.toString()).toBe("fake image data");
    });

    it("returns undefined for non-existent asset", async () => {
      const asset = await service.getAsset("nope");
      expect(asset).toBeUndefined();
    });
  });

  describe("computeContentHash", () => {
    it("is deterministic", () => {
      const a = computeContentHash("hello", ["h1", "h2"]);
      const b = computeContentHash("hello", ["h2", "h1"]);
      expect(a).toBe(b); // order independent
    });

    it("differs for different markdown", () => {
      const a = computeContentHash("v1");
      const b = computeContentHash("v2");
      expect(a).not.toBe(b);
    });
  });
});
