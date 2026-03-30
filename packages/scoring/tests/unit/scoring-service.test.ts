import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryEventStore,
  TestClock,
  timestamp,
} from "@votiverse/core";
import type { ParticipantId, EntryId, ScoringEventId, Timestamp } from "@votiverse/core";
import { ScoringService } from "../../src/index.js";
import type {
  Rubric,
  CreateScoringEventParams,
  ScoringEvent,
} from "../../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRubric(): Rubric {
  return {
    categories: [
      {
        id: "quality",
        name: "Quality",
        weight: 1,
        dimensions: [
          { id: "clarity", name: "Clarity", scale: { min: 1, max: 5 }, weight: 1 },
          { id: "depth", name: "Depth", scale: { min: 1, max: 5 }, weight: 1 },
        ],
      },
    ],
    evaluatorAggregation: "mean",
    dimensionAggregation: "weighted-sum",
  };
}

function makeParams(overrides?: Partial<CreateScoringEventParams>): CreateScoringEventParams {
  return {
    title: "Hackathon Judging",
    description: "Judge the projects",
    entries: [
      { title: "Project Alpha" },
      { title: "Project Beta" },
    ],
    rubric: makeRubric(),
    panelMemberIds: null,
    timeline: { opensAt: timestamp(1000), closesAt: timestamp(100000) },
    settings: { allowRevision: false, secretScores: false, normalizeScores: false },
    ...overrides,
  };
}

function allScores() {
  return [
    { dimensionId: "clarity", score: 4 },
    { dimensionId: "depth", score: 3 },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScoringService", () => {
  let store: InstanceType<typeof InMemoryEventStore>;
  let clock: TestClock;
  let service: ScoringService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    clock = new TestClock(timestamp(500));
    service = new ScoringService(store, clock);
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates a scoring event with generated entry IDs", async () => {
      const event = await service.create(makeParams());

      expect(event.title).toBe("Hackathon Judging");
      expect(event.entries).toHaveLength(2);
      expect(event.entries[0]!.id).toBeTruthy();
      expect(event.entries[0]!.title).toBe("Project Alpha");
    });

    it("sets initial commanded status to draft", async () => {
      const event = await service.create(makeParams());
      expect(event.status).toBe("draft");
      expect(event.startAsDraft).toBe(false);
    });

    it("sets startAsDraft when requested", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      expect(event.startAsDraft).toBe(true);
      expect(event.status).toBe("draft");
    });

    it("rejects empty title", async () => {
      await expect(service.create(makeParams({ title: " " }))).rejects.toThrow("Title is required");
    });

    it("rejects empty entries", async () => {
      await expect(service.create(makeParams({ entries: [] }))).rejects.toThrow(
        "At least one entry is required",
      );
    });

    it("rejects invalid rubric (no categories)", async () => {
      const rubric: Rubric = {
        categories: [],
        evaluatorAggregation: "mean",
        dimensionAggregation: "weighted-sum",
      };
      await expect(service.create(makeParams({ rubric }))).rejects.toThrow(
        "At least one category",
      );
    });

    it("rejects opensAt >= closesAt", async () => {
      await expect(
        service.create(
          makeParams({ timeline: { opensAt: timestamp(100000), closesAt: timestamp(1000) } }),
        ),
      ).rejects.toThrow("opensAt must be before closesAt");
    });
  });

  // =========================================================================
  // getStatus — effective status derivation
  // =========================================================================

  describe("getStatus", () => {
    it("returns draft when before opensAt (startAsDraft=false)", async () => {
      clock.set(timestamp(500));
      const event = await service.create(makeParams());
      expect(service.getStatus(event)).toBe("draft");
    });

    it("returns open when within window (startAsDraft=false)", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("open");
    });

    it("returns closed when after closesAt (startAsDraft=false)", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(200000));
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });

    it("returns draft regardless of time when startAsDraft=true", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));

      clock.set(timestamp(500));
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("draft");

      clock.set(timestamp(5000)); // past opensAt
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("draft");

      clock.set(timestamp(200000)); // past closesAt
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("draft");
    });

    it("returns closed when commanded status is closed regardless of time", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(500)); // before opensAt
      await service.close(event.id);

      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });

    it("returns closed when commanded open but past closesAt (auto-close)", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(5000));
      await service.open(event.id);

      clock.set(timestamp(200000)); // past closesAt
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });
  });

  // =========================================================================
  // open
  // =========================================================================

  describe("open", () => {
    it("transitions draft → open and sets opensAt to now", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));

      const opened = await service.open(event.id);
      expect(opened.status).toBe("open");
      expect(opened.timeline.opensAt).toBe(timestamp(3000));
      expect(service.getStatus(opened)).toBe("open");
    });

    it("sets opensAt to now even when opensAt was in the past", async () => {
      const event = await service.create(makeParams({
        startAsDraft: true,
        timeline: { opensAt: timestamp(100), closesAt: timestamp(100000) },
      }));
      clock.set(timestamp(5000));

      const opened = await service.open(event.id);
      expect(opened.timeline.opensAt).toBe(timestamp(5000));
    });

    it("rejects when already open (auto-opened)", async () => {
      const event = await service.create(makeParams()); // startAsDraft=false
      clock.set(timestamp(5000)); // past opensAt → effective status is open

      await expect(service.open(event.id)).rejects.toThrow("already open");
    });

    it("rejects when already closed", async () => {
      const event = await service.create(makeParams());
      await service.close(event.id);

      await expect(service.open(event.id)).rejects.toThrow("closed");
    });
  });

  // =========================================================================
  // extendDeadline
  // =========================================================================

  describe("extendDeadline", () => {
    it("extends the deadline and records originalClosesAt", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));
      await service.open(event.id);

      const extended = await service.extendDeadline(event.id, timestamp(200000));
      expect(extended.timeline.closesAt).toBe(timestamp(200000));
      expect(extended.originalClosesAt).toBe(timestamp(100000));
    });

    it("preserves originalClosesAt on second extension", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));
      await service.open(event.id);

      await service.extendDeadline(event.id, timestamp(200000));
      const extended2 = await service.extendDeadline(event.id, timestamp(300000));
      expect(extended2.timeline.closesAt).toBe(timestamp(300000));
      expect(extended2.originalClosesAt).toBe(timestamp(100000)); // still the original
    });

    it("rejects when event is in draft", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));

      await expect(service.extendDeadline(event.id, timestamp(200000))).rejects.toThrow(
        "draft",
      );
    });

    it("rejects when event is closed", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));
      await service.close(event.id);

      await expect(service.extendDeadline(event.id, timestamp(200000))).rejects.toThrow(
        "closed",
      );
    });

    it("rejects when newClosesAt is not after current closesAt", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));
      await service.open(event.id);

      await expect(service.extendDeadline(event.id, timestamp(50000))).rejects.toThrow(
        "after the current deadline",
      );
    });

    it("works with auto-opened events", async () => {
      const event = await service.create(makeParams()); // startAsDraft=false
      clock.set(timestamp(5000)); // past opensAt → auto-open

      const extended = await service.extendDeadline(event.id, timestamp(200000));
      expect(extended.timeline.closesAt).toBe(timestamp(200000));
    });
  });

  // =========================================================================
  // updateDraft
  // =========================================================================

  describe("updateDraft", () => {
    it("updates title and description", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(500));

      const updated = await service.updateDraft(event.id, {
        title: "Updated Title",
        description: "Updated Desc",
      });
      expect(updated.title).toBe("Updated Title");
      expect(updated.description).toBe("Updated Desc");
      // Entries unchanged
      expect(updated.entries).toEqual(event.entries);
    });

    it("replaces entries with new IDs", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      const oldEntryIds = event.entries.map((e) => e.id);

      const updated = await service.updateDraft(event.id, {
        entries: [
          { title: "New Entry A" },
          { title: "New Entry B" },
          { title: "New Entry C" },
        ],
      });
      expect(updated.entries).toHaveLength(3);
      expect(updated.entries[0]!.title).toBe("New Entry A");
      // New IDs — not the old ones
      const newEntryIds = updated.entries.map((e) => e.id);
      expect(newEntryIds).not.toEqual(expect.arrayContaining(oldEntryIds));
    });

    it("updates rubric", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));

      const newRubric: Rubric = {
        categories: [
          {
            id: "fit",
            name: "Fit",
            weight: 1,
            dimensions: [
              { id: "alignment", name: "Alignment", scale: { min: 1, max: 10 }, weight: 1 },
            ],
          },
        ],
        evaluatorAggregation: "median",
        dimensionAggregation: "weighted-sum",
      };

      const updated = await service.updateDraft(event.id, { rubric: newRubric });
      expect(updated.rubric.categories[0]!.id).toBe("fit");
      expect(updated.rubric.evaluatorAggregation).toBe("median");
    });

    it("updates timeline", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));

      const updated = await service.updateDraft(event.id, {
        timeline: { opensAt: timestamp(2000), closesAt: timestamp(200000) },
      });
      expect(updated.timeline.opensAt).toBe(timestamp(2000));
      expect(updated.timeline.closesAt).toBe(timestamp(200000));
    });

    it("rejects when event is open", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));
      await service.open(event.id);

      await expect(
        service.updateDraft(event.id, { title: "New Title" }),
      ).rejects.toThrow("open");
    });

    it("rejects when event is closed", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      await service.close(event.id);

      await expect(
        service.updateDraft(event.id, { title: "New Title" }),
      ).rejects.toThrow("closed");
    });

    it("rejects when auto-opened (startAsDraft=false, past opensAt)", async () => {
      const event = await service.create(makeParams()); // startAsDraft=false
      clock.set(timestamp(5000)); // past opensAt

      await expect(
        service.updateDraft(event.id, { title: "New Title" }),
      ).rejects.toThrow("open");
    });

    it("validates the merged state", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));

      await expect(
        service.updateDraft(event.id, { title: " " }),
      ).rejects.toThrow("Title is required");

      await expect(
        service.updateDraft(event.id, { entries: [] }),
      ).rejects.toThrow("At least one entry");

      await expect(
        service.updateDraft(event.id, {
          timeline: { opensAt: timestamp(100000), closesAt: timestamp(1000) },
        }),
      ).rejects.toThrow("opensAt must be before closesAt");
    });

    it("works during editability window (startAsDraft=false, before opensAt)", async () => {
      clock.set(timestamp(500));
      const event = await service.create(makeParams()); // startAsDraft=false, opensAt=1000
      // clock < opensAt → effective status is "draft" → editable

      const updated = await service.updateDraft(event.id, { title: "Edited" });
      expect(updated.title).toBe("Edited");
    });
  });

  // =========================================================================
  // close
  // =========================================================================

  describe("close", () => {
    it("closes an open event", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));

      await service.close(event.id);

      const status = service.getStatus(service.getScoringEvent(event.id)!);
      expect(status).toBe("closed");
    });

    it("closes a draft event (discard)", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(500));

      await service.close(event.id);

      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });

    it("rejects closing already closed event", async () => {
      const event = await service.create(makeParams());
      await service.close(event.id);

      await expect(service.close(event.id)).rejects.toThrow("already closed");
    });

    it("rejects closing auto-closed event", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(200000)); // past closesAt

      await expect(service.close(event.id)).rejects.toThrow("already closed");
    });
  });

  // =========================================================================
  // submitScorecard
  // =========================================================================

  describe("submitScorecard", () => {
    let scoringEvent: ScoringEvent;

    beforeEach(async () => {
      scoringEvent = await service.create(makeParams());
      // Advance clock into the open window
      clock.set(timestamp(5000));
    });

    it("submits a scorecard successfully", async () => {
      const entryId = scoringEvent.entries[0]!.id;
      const scorecard = await service.submitScorecard({
        scoringEventId: scoringEvent.id,
        evaluatorId: "eval-1" as ParticipantId,
        entryId,
        scores: allScores(),
      });

      expect(scorecard.evaluatorId).toBe("eval-1");
      expect(scorecard.scores).toHaveLength(2);
    });

    it("rejects duplicate scorecard for same (evaluator, entry)", async () => {
      const entryId = scoringEvent.entries[0]!.id;
      const params = {
        scoringEventId: scoringEvent.id,
        evaluatorId: "eval-1" as ParticipantId,
        entryId,
        scores: allScores(),
      };

      await service.submitScorecard(params);
      await expect(service.submitScorecard(params)).rejects.toThrow("already submitted");
    });

    it("rejects scorecard in draft state", async () => {
      clock.set(timestamp(500)); // before opensAt → draft
      const entryId = scoringEvent.entries[0]!.id;

      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId,
          scores: allScores(),
        }),
      ).rejects.toThrow("not started");
    });

    it("rejects scorecard in draft state (startAsDraft=true)", async () => {
      const draftEvent = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(5000)); // past opensAt, but startAsDraft keeps it draft

      await expect(
        service.submitScorecard({
          scoringEventId: draftEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId: draftEvent.entries[0]!.id,
          scores: allScores(),
        }),
      ).rejects.toThrow("not started");
    });

    it("rejects scorecard after scoring closes", async () => {
      clock.set(timestamp(200000)); // after closesAt
      const entryId = scoringEvent.entries[0]!.id;

      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId,
          scores: allScores(),
        }),
      ).rejects.toThrow("closed");
    });

    it("rejects scorecard with missing dimensions", async () => {
      const entryId = scoringEvent.entries[0]!.id;

      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId,
          scores: [{ dimensionId: "clarity", score: 4 }], // missing depth
        }),
      ).rejects.toThrow("Expected 2 dimension scores");
    });

    it("rejects score outside scale bounds", async () => {
      const entryId = scoringEvent.entries[0]!.id;

      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId,
          scores: [
            { dimensionId: "clarity", score: 6 }, // max is 5
            { dimensionId: "depth", score: 3 },
          ],
        }),
      ).rejects.toThrow("outside range");
    });

    it("rejects non-panel member when panel is restricted", async () => {
      const panelEvent = await service.create(
        makeParams({ panelMemberIds: ["judge-1" as ParticipantId] }),
      );
      clock.set(timestamp(5000));

      await expect(
        service.submitScorecard({
          scoringEventId: panelEvent.id,
          evaluatorId: "outsider" as ParticipantId,
          entryId: panelEvent.entries[0]!.id,
          scores: allScores(),
        }),
      ).rejects.toThrow("not a panel member");
    });

    it("rejects scorecard for nonexistent entry", async () => {
      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId: "nonexistent" as EntryId,
          scores: allScores(),
        }),
      ).rejects.toThrow("not found");
    });
  });

  // =========================================================================
  // reviseScorecard
  // =========================================================================

  describe("reviseScorecard", () => {
    let scoringEvent: ScoringEvent;

    beforeEach(async () => {
      scoringEvent = await service.create(
        makeParams({ settings: { allowRevision: true, secretScores: false, normalizeScores: false } }),
      );
      clock.set(timestamp(5000));
    });

    it("revises a previously submitted scorecard", async () => {
      const entryId = scoringEvent.entries[0]!.id;

      const original = await service.submitScorecard({
        scoringEventId: scoringEvent.id,
        evaluatorId: "eval-1" as ParticipantId,
        entryId,
        scores: [
          { dimensionId: "clarity", score: 3 },
          { dimensionId: "depth", score: 3 },
        ],
      });

      const revised = await service.reviseScorecard({
        scorecardId: original.id,
        scoringEventId: scoringEvent.id,
        evaluatorId: "eval-1" as ParticipantId,
        entryId,
        scores: [
          { dimensionId: "clarity", score: 5 },
          { dimensionId: "depth", score: 5 },
        ],
      });

      expect(revised.scores[0]!.score).toBe(5);
      expect(revised.id).toBe(original.id);
    });

    it("rejects revision when allowRevision is false", async () => {
      const noRevisionEvent = await service.create(
        makeParams({ settings: { allowRevision: false, secretScores: false, normalizeScores: false } }),
      );
      clock.set(timestamp(5000));
      const entryId = noRevisionEvent.entries[0]!.id;

      const original = await service.submitScorecard({
        scoringEventId: noRevisionEvent.id,
        evaluatorId: "eval-1" as ParticipantId,
        entryId,
        scores: [
          { dimensionId: "clarity", score: 3 },
          { dimensionId: "depth", score: 3 },
        ],
      });

      await expect(
        service.reviseScorecard({
          scorecardId: original.id,
          scoringEventId: noRevisionEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId,
          scores: [
            { dimensionId: "clarity", score: 5 },
            { dimensionId: "depth", score: 5 },
          ],
        }),
      ).rejects.toThrow("not allowed");
    });

    it("rejects revision for nonexistent scorecard", async () => {
      await expect(
        service.reviseScorecard({
          scorecardId: "nonexistent" as any,
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId: scoringEvent.entries[0]!.id,
          scores: [
            { dimensionId: "clarity", score: 5 },
            { dimensionId: "depth", score: 5 },
          ],
        }),
      ).rejects.toThrow("not found");
    });
  });

  // =========================================================================
  // computeResults
  // =========================================================================

  describe("computeResults", () => {
    it("computes ranking from scorecards", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));

      const e1 = event.entries[0]!.id;
      const e2 = event.entries[1]!.id;

      await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId: e1,
        scores: [
          { dimensionId: "clarity", score: 5 },
          { dimensionId: "depth", score: 5 },
        ],
      });
      await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId: e2,
        scores: [
          { dimensionId: "clarity", score: 2 },
          { dimensionId: "depth", score: 2 },
        ],
      });

      const result = service.computeResults(event.id, 3);

      expect(result.entries[0]!.entryId).toBe(e1);
      expect(result.entries[0]!.rank).toBe(1);
      expect(result.entries[1]!.entryId).toBe(e2);
      expect(result.entries[1]!.rank).toBe(2);
      expect(result.participatingCount).toBe(1);
      expect(result.eligibleCount).toBe(3);
    });
  });

  // =========================================================================
  // Full lifecycle
  // =========================================================================

  describe("full lifecycle", () => {
    it("draft → open → extend → close", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("draft");

      clock.set(timestamp(3000));
      await service.open(event.id);
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("open");

      // Submit a scorecard while open
      await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId: event.entries[0]!.id,
        scores: allScores(),
      });

      // Extend deadline
      await service.extendDeadline(event.id, timestamp(200000));
      const extended = service.getScoringEvent(event.id)!;
      expect(extended.timeline.closesAt).toBe(timestamp(200000));
      expect(extended.originalClosesAt).toBe(timestamp(100000));

      // Close early
      await service.close(event.id);
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });

    it("draft → updateDraft → open → submit → auto-close", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));

      // Edit while in draft
      await service.updateDraft(event.id, {
        title: "Updated Hackathon",
        entries: [{ title: "Solo Entry" }],
      });

      const updated = service.getScoringEvent(event.id)!;
      expect(updated.title).toBe("Updated Hackathon");
      expect(updated.entries).toHaveLength(1);

      // Open
      clock.set(timestamp(3000));
      await service.open(event.id);

      // Submit
      await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId: updated.entries[0]!.id,
        scores: allScores(),
      });

      // Auto-close at closesAt
      clock.set(timestamp(200000));
      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });

    it("draft → close (discard without opening)", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      await service.close(event.id);

      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });
  });

  // =========================================================================
  // Rehydration
  // =========================================================================

  describe("rehydration", () => {
    it("restores state from event store", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));

      const entryId = event.entries[0]!.id;
      await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId,
        scores: allScores(),
      });

      // Create a new service with the same store
      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id);
      expect(restored).toBeDefined();
      expect(restored!.title).toBe("Hackathon Judging");
      expect(restored!.status).toBe("draft");
      expect(restored!.startAsDraft).toBe(false);

      const scorecard = newService.getScorecard(event.id, "j1" as ParticipantId, entryId);
      expect(scorecard).toBeDefined();
      expect(scorecard!.scores[0]!.score).toBe(4);
    });

    it("restores closed state", async () => {
      const event = await service.create(makeParams());
      await service.close(event.id);

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(restored.status).toBe("closed");
      expect(newService.getStatus(restored)).toBe("closed");
    });

    it("restores opened state with updated opensAt", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));
      await service.open(event.id);

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(restored.status).toBe("open");
      expect(restored.timeline.opensAt).toBe(timestamp(3000));
    });

    it("restores extended deadline with originalClosesAt", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      clock.set(timestamp(3000));
      await service.open(event.id);
      await service.extendDeadline(event.id, timestamp(200000));

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(restored.timeline.closesAt).toBe(timestamp(200000));
      expect(restored.originalClosesAt).toBe(timestamp(100000));
    });

    it("restores draft updates", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      await service.updateDraft(event.id, {
        title: "Updated Title",
        entries: [{ title: "New Entry" }],
      });

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(restored.title).toBe("Updated Title");
      expect(restored.entries).toHaveLength(1);
      expect(restored.entries[0]!.title).toBe("New Entry");
      // Lifecycle fields preserved
      expect(restored.startAsDraft).toBe(true);
      expect(restored.status).toBe("draft");
    });

    it("restores revised scorecards with latest scores", async () => {
      const event = await service.create(
        makeParams({ settings: { allowRevision: true, secretScores: false, normalizeScores: false } }),
      );
      clock.set(timestamp(5000));

      const entryId = event.entries[0]!.id;

      const original = await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId,
        scores: [
          { dimensionId: "clarity", score: 2 },
          { dimensionId: "depth", score: 2 },
        ],
      });
      await service.reviseScorecard({
        scorecardId: original.id,
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId,
        scores: [
          { dimensionId: "clarity", score: 5 },
          { dimensionId: "depth", score: 5 },
        ],
      });

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const scorecard = newService.getScorecard(event.id, "j1" as ParticipantId, entryId);
      expect(scorecard!.scores[0]!.score).toBe(5);
    });

    it("restores full lifecycle: create → updateDraft → open → extend → close", async () => {
      const event = await service.create(makeParams({ startAsDraft: true }));
      await service.updateDraft(event.id, { title: "Edited" });
      clock.set(timestamp(3000));
      await service.open(event.id);
      await service.extendDeadline(event.id, timestamp(200000));
      await service.close(event.id);

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(restored.title).toBe("Edited");
      expect(restored.status).toBe("closed");
      expect(restored.timeline.opensAt).toBe(timestamp(3000));
      expect(restored.timeline.closesAt).toBe(timestamp(200000));
      expect(restored.originalClosesAt).toBe(timestamp(100000));
    });

    it("backward compat: events without startAsDraft rehydrate with false", async () => {
      // Simulate v1 event (no startAsDraft in payload)
      const event = await service.create(makeParams());

      const newService = new ScoringService(store, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(restored.startAsDraft).toBe(false);
      // With startAsDraft=false, time-based derivation works
      clock.set(timestamp(5000));
      expect(newService.getStatus(restored)).toBe("open");
    });
  });
});
