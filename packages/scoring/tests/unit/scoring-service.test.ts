import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryEventStore,
  TestClock,
  timestamp,
} from "@votiverse/core";
import type { ParticipantId, EntryId, ScoringEventId } from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import { getPreset, deriveConfig } from "@votiverse/config";
import { ScoringService } from "../../src/index.js";
import type {
  Rubric,
  CreateScoringEventParams,
  ScoringEvent,
} from "../../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCORING_CONFIG = deriveConfig(getPreset("REPRESENTATIVE"), {});

function makeConfig(scoring = true): GovernanceConfig {
  return deriveConfig(getPreset("REPRESENTATIVE"), {
    features: { scoring },
  });
}

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
    service = new ScoringService(store, SCORING_CONFIG, clock);
  });

  describe("create", () => {
    it("creates a scoring event with generated entry IDs", async () => {
      clock.set(timestamp(500));
      const event = await service.create(makeParams());

      expect(event.title).toBe("Hackathon Judging");
      expect(event.entries).toHaveLength(2);
      expect(event.entries[0]!.id).toBeTruthy();
      expect(event.entries[0]!.title).toBe("Project Alpha");
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

    it("rejects when scoring is disabled", async () => {
      const disabledService = new ScoringService(store, makeConfig(false), clock);
      await expect(disabledService.create(makeParams())).rejects.toThrow(
        "Scoring is not enabled",
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
        scores: [
          { dimensionId: "clarity", score: 4 },
          { dimensionId: "depth", score: 3 },
        ],
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
        scores: [
          { dimensionId: "clarity", score: 4 },
          { dimensionId: "depth", score: 3 },
        ],
      };

      await service.submitScorecard(params);
      await expect(service.submitScorecard(params)).rejects.toThrow("already submitted");
    });

    it("rejects scorecard before scoring opens", async () => {
      clock.set(timestamp(500)); // before opensAt
      const entryId = scoringEvent.entries[0]!.id;

      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId,
          scores: [
            { dimensionId: "clarity", score: 4 },
            { dimensionId: "depth", score: 3 },
          ],
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
          scores: [
            { dimensionId: "clarity", score: 4 },
            { dimensionId: "depth", score: 3 },
          ],
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
          scores: [
            { dimensionId: "clarity", score: 4 },
            { dimensionId: "depth", score: 3 },
          ],
        }),
      ).rejects.toThrow("not a panel member");
    });

    it("rejects scorecard for nonexistent entry", async () => {
      await expect(
        service.submitScorecard({
          scoringEventId: scoringEvent.id,
          evaluatorId: "eval-1" as ParticipantId,
          entryId: "nonexistent" as EntryId,
          scores: [
            { dimensionId: "clarity", score: 4 },
            { dimensionId: "depth", score: 3 },
          ],
        }),
      ).rejects.toThrow("not found");
    });
  });

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

  describe("close", () => {
    it("closes a scoring event", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));

      await service.close(event.id);

      const status = service.getStatus(service.getScoringEvent(event.id)!);
      expect(status).toBe("closed");
    });

    it("rejects closing already closed event", async () => {
      const event = await service.create(makeParams());
      await service.close(event.id);

      await expect(service.close(event.id)).rejects.toThrow("already closed");
    });
  });

  describe("getStatus", () => {
    it("returns scheduled when before opensAt", async () => {
      clock.set(timestamp(500));
      const event = await service.create(makeParams());

      expect(service.getStatus(event)).toBe("scheduled");
    });

    it("returns open when within window", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));

      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("open");
    });

    it("returns closed when after closesAt", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(200000));

      expect(service.getStatus(service.getScoringEvent(event.id)!)).toBe("closed");
    });
  });

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

  describe("rehydration", () => {
    it("restores state from event store", async () => {
      const event = await service.create(makeParams());
      clock.set(timestamp(5000));

      const entryId = event.entries[0]!.id;
      await service.submitScorecard({
        scoringEventId: event.id,
        evaluatorId: "j1" as ParticipantId,
        entryId,
        scores: [
          { dimensionId: "clarity", score: 4 },
          { dimensionId: "depth", score: 3 },
        ],
      });

      // Create a new service with the same store
      const newService = new ScoringService(store, SCORING_CONFIG, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id);
      expect(restored).toBeDefined();
      expect(restored!.title).toBe("Hackathon Judging");

      const scorecard = newService.getScorecard(event.id, "j1" as ParticipantId, entryId);
      expect(scorecard).toBeDefined();
      expect(scorecard!.scores[0]!.score).toBe(4);
    });

    it("restores closed state", async () => {
      const event = await service.create(makeParams());
      await service.close(event.id);

      const newService = new ScoringService(store, SCORING_CONFIG, clock);
      await newService.rehydrate();

      const restored = newService.getScoringEvent(event.id)!;
      expect(newService.getStatus(restored)).toBe("closed");
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

      const newService = new ScoringService(store, SCORING_CONFIG, clock);
      await newService.rehydrate();

      const scorecard = newService.getScorecard(event.id, "j1" as ParticipantId, entryId);
      expect(scorecard!.scores[0]!.score).toBe(5);
    });
  });
});
