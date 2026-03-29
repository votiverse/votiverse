import { describe, it, expect } from "vitest";
import { timestamp } from "@votiverse/core";
import type { EntryId, ParticipantId, ScorecardId, ScoringEventId } from "@votiverse/core";
import {
  aggregateEvaluators,
  aggregateDimensions,
  computeCategoryScore,
  computeRanking,
  normalizeEvaluatorScores,
} from "../../src/index.js";
import type { Scorecard, ScoringEvent, Rubric } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRubric(overrides?: Partial<Rubric>): Rubric {
  return {
    categories: [
      {
        id: "technical",
        name: "Technical",
        weight: 1,
        dimensions: [
          { id: "code", name: "Code Quality", scale: { min: 1, max: 5 }, weight: 1 },
          { id: "design", name: "Design", scale: { min: 1, max: 5 }, weight: 1 },
        ],
      },
    ],
    evaluatorAggregation: "mean",
    dimensionAggregation: "weighted-sum",
    ...overrides,
  };
}

function makeScorecard(
  evaluatorId: string,
  entryId: string,
  scores: { dimensionId: string; score: number }[],
): Scorecard {
  return {
    id: `sc-${evaluatorId}-${entryId}` as ScorecardId,
    scoringEventId: "se-1" as ScoringEventId,
    evaluatorId: evaluatorId as ParticipantId,
    entryId: entryId as EntryId,
    scores,
    submittedAt: timestamp(1000),
  };
}

function makeScoringEvent(overrides?: Partial<ScoringEvent>): ScoringEvent {
  return {
    id: "se-1" as ScoringEventId,
    title: "Test",
    description: "",
    entries: [
      { id: "e1" as EntryId, title: "Entry 1" },
      { id: "e2" as EntryId, title: "Entry 2" },
    ],
    rubric: makeRubric(),
    panelMemberIds: null,
    timeline: { opensAt: timestamp(0), closesAt: timestamp(100000) },
    settings: { allowRevision: false, secretScores: false, normalizeScores: false },
    createdAt: timestamp(0),
    status: "draft",
    startAsDraft: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stage 1: Evaluator aggregation
// ---------------------------------------------------------------------------

describe("aggregateEvaluators", () => {
  it("computes arithmetic mean", () => {
    expect(aggregateEvaluators([3, 4, 5], "mean")).toBe(4);
  });

  it("computes median for odd count", () => {
    expect(aggregateEvaluators([1, 3, 5], "median")).toBe(3);
  });

  it("computes median for even count", () => {
    expect(aggregateEvaluators([1, 3, 5, 7], "median")).toBe(4);
  });

  it("computes trimmed-mean (drops highest and lowest)", () => {
    // [1, 3, 5, 7, 9] → drop 1 and 9 → mean(3,5,7) = 5
    expect(aggregateEvaluators([1, 3, 5, 7, 9], "trimmed-mean")).toBe(5);
  });

  it("trimmed-mean falls back to mean with fewer than 3 scores", () => {
    expect(aggregateEvaluators([2, 4], "trimmed-mean")).toBe(3);
  });

  it("returns 0 for empty scores", () => {
    expect(aggregateEvaluators([], "mean")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stage 2: Dimension aggregation
// ---------------------------------------------------------------------------

describe("aggregateDimensions", () => {
  it("computes weighted sum", () => {
    const items = [
      { score: 4, weight: 2 },
      { score: 2, weight: 1 },
    ];
    // (2*4 + 1*2) / (2+1) = 10/3 ≈ 3.333
    expect(aggregateDimensions(items, "weighted-sum")).toBeCloseTo(10 / 3);
  });

  it("computes geometric mean", () => {
    const items = [
      { score: 4, weight: 1 },
      { score: 9, weight: 1 },
    ];
    // (4^0.5 * 9^0.5) = 2 * 3 = 6
    expect(aggregateDimensions(items, "geometric-mean")).toBeCloseTo(6);
  });

  it("geometric mean with zero score returns 0", () => {
    const items = [
      { score: 0, weight: 1 },
      { score: 5, weight: 1 },
    ];
    expect(aggregateDimensions(items, "geometric-mean")).toBe(0);
  });
});

describe("computeCategoryScore", () => {
  it("computes weighted sum of dimensions", () => {
    const dims = [
      { score: 4, weight: 1 },
      { score: 2, weight: 1 },
    ];
    // (4+2)/2 = 3
    expect(computeCategoryScore(dims)).toBe(3);
  });

  it("respects dimension weights", () => {
    const dims = [
      { score: 5, weight: 3 },
      { score: 1, weight: 1 },
    ];
    // (15+1)/4 = 4
    expect(computeCategoryScore(dims)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

describe("computeRanking", () => {
  it("ranks entries by final score descending", () => {
    const event = makeScoringEvent();
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 5 },
        { dimensionId: "design", score: 5 },
      ]),
      makeScorecard("j1", "e2", [
        { dimensionId: "code", score: 3 },
        { dimensionId: "design", score: 3 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 1, timestamp(50000));

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.entryId).toBe("e1");
    expect(result.entries[0]!.rank).toBe(1);
    expect(result.entries[0]!.finalScore).toBe(5);
    expect(result.entries[1]!.entryId).toBe("e2");
    expect(result.entries[1]!.rank).toBe(2);
    expect(result.entries[1]!.finalScore).toBe(3);
  });

  it("assigns tied ranks correctly (competition ranking)", () => {
    const event = makeScoringEvent();
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 4 },
        { dimensionId: "design", score: 4 },
      ]),
      makeScorecard("j1", "e2", [
        { dimensionId: "code", score: 4 },
        { dimensionId: "design", score: 4 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 1, timestamp(50000));

    expect(result.entries[0]!.rank).toBe(1);
    expect(result.entries[1]!.rank).toBe(1); // tied
  });

  it("aggregates across multiple evaluators using mean", () => {
    const event = makeScoringEvent();
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 4 },
        { dimensionId: "design", score: 4 },
      ]),
      makeScorecard("j2", "e1", [
        { dimensionId: "code", score: 2 },
        { dimensionId: "design", score: 2 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 2, timestamp(50000));

    // Mean of [4,2] = 3 for both dimensions
    const e1 = result.entries.find((e) => e.entryId === "e1")!;
    expect(e1.finalScore).toBe(3);
    expect(e1.categories[0]!.dimensions[0]!.mean).toBe(3);
    expect(e1.categories[0]!.dimensions[0]!.evaluatorCount).toBe(2);
  });

  it("computes participation rate", () => {
    const event = makeScoringEvent();
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 4 },
        { dimensionId: "design", score: 4 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 5, timestamp(50000));

    expect(result.participatingCount).toBe(1);
    expect(result.eligibleCount).toBe(5);
    expect(result.participationRate).toBeCloseTo(0.2);
  });

  it("handles empty scorecards gracefully", () => {
    const event = makeScoringEvent();
    const result = computeRanking(event, [], 0, timestamp(50000));

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.finalScore).toBe(0);
    expect(result.participatingCount).toBe(0);
  });

  it("uses trimmed-mean when configured", () => {
    const rubric = makeRubric({ evaluatorAggregation: "trimmed-mean" });
    const event = makeScoringEvent({ rubric });
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 1 },
        { dimensionId: "design", score: 1 },
      ]),
      makeScorecard("j2", "e1", [
        { dimensionId: "code", score: 3 },
        { dimensionId: "design", score: 3 },
      ]),
      makeScorecard("j3", "e1", [
        { dimensionId: "code", score: 5 },
        { dimensionId: "design", score: 5 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 3, timestamp(50000));

    // Trimmed mean of [1,3,5] = drop 1 and 5, mean(3) = 3
    const e1 = result.entries.find((e) => e.entryId === "e1")!;
    expect(e1.finalScore).toBe(3);
  });

  it("uses geometric-mean dimension aggregation", () => {
    const rubric: Rubric = {
      categories: [
        {
          id: "cat1",
          name: "Cat 1",
          weight: 1,
          dimensions: [{ id: "d1", name: "D1", scale: { min: 1, max: 10 }, weight: 1 }],
        },
        {
          id: "cat2",
          name: "Cat 2",
          weight: 1,
          dimensions: [{ id: "d2", name: "D2", scale: { min: 1, max: 10 }, weight: 1 }],
        },
      ],
      evaluatorAggregation: "mean",
      dimensionAggregation: "geometric-mean",
    };
    const event = makeScoringEvent({
      rubric,
      entries: [{ id: "e1" as EntryId, title: "Entry 1" }],
    });
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "d1", score: 4 },
        { dimensionId: "d2", score: 9 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 1, timestamp(50000));

    // geometric mean of (4, 9) with equal weights = sqrt(4*9) = 6
    expect(result.entries[0]!.finalScore).toBeCloseTo(6);
  });

  it("respects category weights", () => {
    const rubric: Rubric = {
      categories: [
        {
          id: "important",
          name: "Important",
          weight: 3,
          dimensions: [{ id: "d1", name: "D1", scale: { min: 1, max: 5 }, weight: 1 }],
        },
        {
          id: "minor",
          name: "Minor",
          weight: 1,
          dimensions: [{ id: "d2", name: "D2", scale: { min: 1, max: 5 }, weight: 1 }],
        },
      ],
      evaluatorAggregation: "mean",
      dimensionAggregation: "weighted-sum",
    };
    const event = makeScoringEvent({
      rubric,
      entries: [{ id: "e1" as EntryId, title: "Entry 1" }],
    });
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "d1", score: 5 },
        { dimensionId: "d2", score: 1 },
      ]),
    ];

    const result = computeRanking(event, scorecards, 1, timestamp(50000));

    // weighted sum: (3*5 + 1*1) / (3+1) = 16/4 = 4
    expect(result.entries[0]!.finalScore).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizeEvaluatorScores", () => {
  it("falls back to raw scores with fewer than 3 entries", () => {
    const rubric = makeRubric();
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 5 },
        { dimensionId: "design", score: 5 },
      ]),
      makeScorecard("j1", "e2", [
        { dimensionId: "code", score: 3 },
        { dimensionId: "design", score: 3 },
      ]),
    ];

    const normalized = normalizeEvaluatorScores(scorecards, rubric);

    // Should return raw scores unchanged
    const e1Scores = normalized.get("j1::e1")!;
    expect(e1Scores[0]!.score).toBe(5);
  });

  it("normalizes scores with 3+ entries", () => {
    const rubric = makeRubric();
    const scorecards = [
      makeScorecard("j1", "e1", [
        { dimensionId: "code", score: 1 },
        { dimensionId: "design", score: 1 },
      ]),
      makeScorecard("j1", "e2", [
        { dimensionId: "code", score: 3 },
        { dimensionId: "design", score: 3 },
      ]),
      makeScorecard("j1", "e3", [
        { dimensionId: "code", score: 5 },
        { dimensionId: "design", score: 5 },
      ]),
    ];

    const normalized = normalizeEvaluatorScores(scorecards, rubric);

    // After z-score normalization, the relative ordering should be preserved
    const e1Score = normalized.get("j1::e1")![0]!.score;
    const e2Score = normalized.get("j1::e2")![0]!.score;
    const e3Score = normalized.get("j1::e3")![0]!.score;

    expect(e1Score).toBeLessThan(e2Score);
    expect(e2Score).toBeLessThan(e3Score);
    // Scores should be within scale range [1, 5]
    expect(e1Score).toBeGreaterThanOrEqual(1);
    expect(e3Score).toBeLessThanOrEqual(5);
  });
});
