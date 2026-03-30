import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, TestClock } from "@votiverse/core";
import type { ContentHash, NoteId, ParticipantId } from "@votiverse/core";
import { NoteService, computeNoteVisibility } from "../../src/notes.js";

function pid(s: string): ParticipantId { return s as ParticipantId; }
function hash(s: string): ContentHash { return s as ContentHash; }

describe("NoteService", () => {
  let store: InstanceType<typeof InMemoryEventStore>;
  let clock: InstanceType<typeof TestClock>;
  let service: NoteService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    clock = new TestClock();
    service = new NoteService(store, clock);
  });

  describe("create", () => {
    it("creates a note in 'proposed' status with zero evaluations", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("note-hash"),
        targetType: "proposal",
        targetId: "prop-1",
        targetVersionNumber: 2,
      });

      expect(note.status).toBe("proposed");
      expect(note.endorsementCount).toBe(0);
      expect(note.disputeCount).toBe(0);
      expect(note.target.type).toBe("proposal");
      expect(note.target.id).toBe("prop-1");
      expect(note.target.versionNumber).toBe(2);
    });



    it("supports all target types", async () => {
      for (const targetType of ["proposal", "candidacy", "survey", "community-note"] as const) {
        const note = await service.create({
          authorId: pid("alice"),
          contentHash: hash(`h-${targetType}`),
          targetType,
          targetId: `target-${targetType}`,
        });
        expect(note.target.type).toBe(targetType);
      }
    });
  });

  describe("evaluate", () => {
    it("records endorsements and disputes", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });

      await service.evaluate(note.id, pid("bob"), "endorse");
      await service.evaluate(note.id, pid("carol"), "dispute");
      await service.evaluate(note.id, pid("dave"), "endorse");

      const retrieved = await service.getById(note.id);
      expect(retrieved!.endorsementCount).toBe(2);
      expect(retrieved!.disputeCount).toBe(1);
    });

    it("allows changing evaluation (latest wins)", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });

      await service.evaluate(note.id, pid("bob"), "endorse");
      await service.evaluate(note.id, pid("bob"), "dispute"); // change mind

      const retrieved = await service.getById(note.id);
      expect(retrieved!.endorsementCount).toBe(0);
      expect(retrieved!.disputeCount).toBe(1);
    });

    it("rejects self-evaluation", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });

      await expect(
        service.evaluate(note.id, pid("alice"), "endorse"),
      ).rejects.toThrow("own note");
    });

    it("rejects evaluating a withdrawn note", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });
      await service.withdraw(note.id, pid("alice"));

      await expect(
        service.evaluate(note.id, pid("bob"), "endorse"),
      ).rejects.toThrow("withdrawn");
    });

    it("rejects evaluating a non-existent note", async () => {
      await expect(
        service.evaluate("nope" as NoteId, pid("bob"), "endorse"),
      ).rejects.toThrow("not found");
    });
  });

  describe("withdraw", () => {
    it("sets status to withdrawn", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });

      await service.withdraw(note.id, pid("alice"));

      const retrieved = await service.getById(note.id);
      expect(retrieved!.status).toBe("withdrawn");
      expect(retrieved!.withdrawnAt).toBeDefined();
    });

    it("rejects withdrawing an already withdrawn note", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });
      await service.withdraw(note.id, pid("alice"));

      await expect(service.withdraw(note.id, pid("alice"))).rejects.toThrow("already withdrawn");
    });
  });

  describe("listByTarget", () => {
    it("returns only notes for the specified target", async () => {
      await service.create({ authorId: pid("alice"), contentHash: hash("h1"), targetType: "proposal", targetId: "p1" });
      await service.create({ authorId: pid("bob"), contentHash: hash("h2"), targetType: "proposal", targetId: "p1" });
      await service.create({ authorId: pid("carol"), contentHash: hash("h3"), targetType: "proposal", targetId: "p2" });
      await service.create({ authorId: pid("dave"), contentHash: hash("h4"), targetType: "candidacy", targetId: "c1" });

      const notes = await service.listByTarget("proposal", "p1");
      expect(notes).toHaveLength(2);
    });
  });

  describe("computeVisibility", () => {
    it("marks note as not visible when below minimum evaluations", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });
      await service.evaluate(note.id, pid("bob"), "endorse");

      const retrieved = await service.getById(note.id);
      const vis = service.computeVisibility(retrieved!);

      expect(vis.belowMinEvaluations).toBe(true);
      expect(vis.visible).toBe(false);
      expect(vis.totalEvaluations).toBe(1);
    });

    it("marks note as visible when above threshold and minimum", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });
      // 3 endorsements, 0 disputes → ratio 1.0, total 3 (meets min of 3)
      await service.evaluate(note.id, pid("bob"), "endorse");
      await service.evaluate(note.id, pid("carol"), "endorse");
      await service.evaluate(note.id, pid("dave"), "endorse");

      const retrieved = await service.getById(note.id);
      const vis = service.computeVisibility(retrieved!);

      expect(vis.belowMinEvaluations).toBe(false);
      expect(vis.visible).toBe(true);
      expect(vis.ratio).toBe(1.0);
    });

    it("marks note as not visible when below threshold ratio", async () => {
      const note = await service.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });
      // 1 endorse, 2 dispute → ratio 0.33, meets min but just at 0.3 threshold
      await service.evaluate(note.id, pid("bob"), "endorse");
      await service.evaluate(note.id, pid("carol"), "dispute");
      await service.evaluate(note.id, pid("dave"), "dispute");
      await service.evaluate(note.id, pid("eve"), "dispute");

      const retrieved = await service.getById(note.id);
      const vis = service.computeVisibility(retrieved!);

      // 1/4 = 0.25, below 0.3 threshold
      expect(vis.visible).toBe(false);
      expect(vis.ratio).toBe(0.25);
    });
  });
});

describe("computeNoteVisibility (pure function)", () => {
  it("returns visible=false for zero evaluations", () => {
    const vis = computeNoteVisibility(0, 0, 0.3, 3);
    expect(vis.visible).toBe(false);
    expect(vis.belowMinEvaluations).toBe(true);
    expect(vis.ratio).toBe(0);
  });

  it("returns visible=true with threshold=0 and minEvaluations=0", () => {
    const vis = computeNoteVisibility(1, 0, 0, 0);
    expect(vis.visible).toBe(true);
  });

  it("handles edge case: all endorsements exactly at threshold", () => {
    // 1 endorse, 2 disputes → ratio = 1/3 ≈ 0.333, threshold = 0.3
    const vis = computeNoteVisibility(1, 2, 0.3, 0);
    expect(vis.visible).toBe(true);
    expect(vis.ratio).toBeCloseTo(0.333, 2);
  });

  it("handles edge case: exactly at minimum evaluations", () => {
    const vis = computeNoteVisibility(3, 0, 0.3, 3);
    expect(vis.belowMinEvaluations).toBe(false);
    expect(vis.visible).toBe(true);
  });
});
