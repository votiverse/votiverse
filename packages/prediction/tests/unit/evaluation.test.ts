import { describe, it, expect } from "vitest";
import { evaluate } from "../../src/evaluation.js";
import type {
  Prediction,
  OutcomeRecord,
  PredictionClaim,
} from "../../src/types.js";
import type {
  PredictionId,
  ProposalId,
  ParticipantId,
  OutcomeId,
  Timestamp,
} from "@votiverse/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pid = (s: string) => s as PredictionId;
const oid = (s: string) => s as OutcomeId;
const ts = (n: number) => n as Timestamp;

function makePrediction(
  claim: PredictionClaim,
  overrides?: Partial<Prediction>,
): Prediction {
  return {
    id: pid("pred-1"),
    proposalId: "prop-1" as ProposalId,
    participantId: "p-1" as ParticipantId,
    claim,
    commitmentHash: "hash",
    committedAt: ts(1000),
    ...overrides,
  };
}

function makeOutcome(
  predictionId: string,
  measuredValue: number | boolean | null,
  recordedAt: number,
  overrides?: Partial<OutcomeRecord>,
): OutcomeRecord {
  return {
    id: oid(`outcome-${recordedAt}`),
    predictionId: pid(predictionId),
    recordedAt: ts(recordedAt),
    source: { type: "official", provider: "test" },
    measuredValue,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Absolute change
// ---------------------------------------------------------------------------

describe("Absolute change evaluation", () => {
  const claim: PredictionClaim = {
    variable: "participation",
    baselineValue: 500,
    timeframe: { start: ts(1000), deadline: ts(50000) },
    pattern: { type: "absolute-change", expected: 200 },
  };

  it("returns accuracy 1.0 when prediction is exactly met", () => {
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", 700, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBeCloseTo(1.0);
    expect(result.status).toBe("met");
  });

  it("returns accuracy 0.9 when 90% of expected change achieved", () => {
    const prediction = makePrediction(claim);
    // Expected +200, actual +180 → error = 20/200 = 0.1 → accuracy = 0.9
    const outcomes = [makeOutcome("pred-1", 680, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBeCloseTo(0.9);
    expect(result.status).toBe("met");
  });

  it("returns accuracy 0.0 when change is in opposite direction", () => {
    const prediction = makePrediction(claim);
    // Expected +200, actual -200 → error = 400/200 = 2.0 → clamped to 0
    const outcomes = [makeOutcome("pred-1", 300, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(0);
    expect(result.status).toBe("not-met");
  });

  it("returns partially-met for moderate accuracy", () => {
    const prediction = makePrediction(claim);
    // Expected +200, actual +100 → error = 100/200 = 0.5 → accuracy = 0.5
    const outcomes = [makeOutcome("pred-1", 600, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBeCloseTo(0.5);
    expect(result.status).toBe("partially-met");
  });
});

// ---------------------------------------------------------------------------
// Percentage change
// ---------------------------------------------------------------------------

describe("Percentage change evaluation", () => {
  it("returns 1.0 when percentage change exactly met", () => {
    const claim: PredictionClaim = {
      variable: "costs",
      baselineValue: 1000,
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "percentage-change", expected: -15 },
    };
    const prediction = makePrediction(claim);
    // -15% of 1000 = -150 → new value = 850
    const outcomes = [makeOutcome("pred-1", 850, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBeCloseTo(1.0);
    expect(result.status).toBe("met");
  });
});

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

describe("Threshold evaluation", () => {
  it("returns 1.0 when threshold is met (above)", () => {
    const claim: PredictionClaim = {
      variable: "renewable energy",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "threshold", target: 80, direction: "above" },
    };
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", 85, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(1.0);
    expect(result.status).toBe("met");
  });

  it("returns partial accuracy when close to threshold", () => {
    const claim: PredictionClaim = {
      variable: "renewable energy",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "threshold", target: 80, direction: "above" },
    };
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", 60, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBeCloseTo(0.75); // 60/80
  });

  it("returns 1.0 when threshold is met (below)", () => {
    const claim: PredictionClaim = {
      variable: "error rate",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "threshold", target: 5, direction: "below" },
    };
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", 3, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Binary
// ---------------------------------------------------------------------------

describe("Binary evaluation", () => {
  it("returns 1.0 when binary outcome matches", () => {
    const claim: PredictionClaim = {
      variable: "facility operational",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "binary", expectedOutcome: true },
    };
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", true, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(1.0);
    expect(result.status).toBe("met");
  });

  it("returns 0.0 when binary outcome does not match", () => {
    const claim: PredictionClaim = {
      variable: "facility operational",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "binary", expectedOutcome: true },
    };
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", false, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(0);
    expect(result.status).toBe("not-met");
  });
});

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

describe("Range evaluation", () => {
  const claim: PredictionClaim = {
    variable: "membership",
    timeframe: { start: ts(1000), deadline: ts(50000) },
    pattern: { type: "range", min: 500, max: 700 },
  };

  it("returns 1.0 when value is within range", () => {
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", 600, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(1.0);
    expect(result.status).toBe("met");
  });

  it("returns 1.0 at range boundaries", () => {
    const prediction = makePrediction(claim);
    expect(
      evaluate(prediction, [makeOutcome("pred-1", 500, 60000)]).accuracy,
    ).toBe(1.0);
    expect(
      evaluate(prediction, [makeOutcome("pred-1", 700, 60000)]).accuracy,
    ).toBe(1.0);
  });

  it("decays accuracy outside range based on distance", () => {
    const prediction = makePrediction(claim);
    // 450 is 50 below min (500). Range is 200. accuracy = 1 - 50/200 = 0.75
    const outcomes = [makeOutcome("pred-1", 450, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBeCloseTo(0.75);
  });
});

// ---------------------------------------------------------------------------
// Comparative
// ---------------------------------------------------------------------------

describe("Comparative evaluation", () => {
  it("returns 1.0 when direction is correct", () => {
    const claim: PredictionClaim = {
      variable: "wait times option A",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "comparative", compareTo: "option B", direction: "less" },
    };
    const prediction = makePrediction(claim);
    const outcomes = [
      makeOutcome("pred-1", 10, 60000, { comparisonValue: 20 }),
    ];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(1.0);
  });

  it("returns 0.0 when direction is wrong", () => {
    const claim: PredictionClaim = {
      variable: "wait times option A",
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "comparative", compareTo: "option B", direction: "less" },
    };
    const prediction = makePrediction(claim);
    const outcomes = [
      makeOutcome("pred-1", 30, 60000, { comparisonValue: 20 }),
    ];
    const result = evaluate(prediction, outcomes);
    expect(result.accuracy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pending and insufficient
// ---------------------------------------------------------------------------

describe("Status classification", () => {
  it("returns pending when deadline has not passed", () => {
    const claim: PredictionClaim = {
      variable: "X",
      timeframe: {
        start: ts(Date.now() - 1000),
        deadline: ts(Date.now() + 1000000),
      },
      pattern: { type: "binary", expectedOutcome: true },
    };
    const prediction = makePrediction(claim);
    const result = evaluate(prediction, []);
    expect(result.status).toBe("pending");
  });

  it("returns insufficient when deadline passed but no outcomes", () => {
    const claim: PredictionClaim = {
      variable: "X",
      timeframe: { start: ts(1000), deadline: ts(2000) },
      pattern: { type: "binary", expectedOutcome: true },
    };
    const prediction = makePrediction(claim);
    const result = evaluate(prediction, []);
    expect(result.status).toBe("insufficient");
  });
});

// ---------------------------------------------------------------------------
// Trajectory
// ---------------------------------------------------------------------------

describe("Trajectory computation", () => {
  it("detects improving trajectory", () => {
    const claim: PredictionClaim = {
      variable: "X",
      baselineValue: 100,
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "absolute-change", expected: 100 },
    };
    const prediction = makePrediction(claim);
    // Accuracy gradually improving: values getting closer to 200 (baseline+expected)
    // Accuracies: 0.5, 0.6, 0.7, 0.8, 0.9, 1.0
    const outcomes = [
      makeOutcome("pred-1", 150, 60001),
      makeOutcome("pred-1", 160, 60002),
      makeOutcome("pred-1", 170, 60003),
      makeOutcome("pred-1", 180, 60004),
      makeOutcome("pred-1", 190, 60005),
      makeOutcome("pred-1", 200, 60006),
    ];
    const result = evaluate(prediction, outcomes);
    expect(result.trajectory).toBe("improving");
  });

  it("detects worsening trajectory", () => {
    const claim: PredictionClaim = {
      variable: "X",
      baselineValue: 100,
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "absolute-change", expected: 100 },
    };
    const prediction = makePrediction(claim);
    // Accuracy worsening: values moving away from 200
    // Accuracies: 1.0, 0.9, 0.8, 0.7, 0.6, 0.5
    const outcomes = [
      makeOutcome("pred-1", 200, 60001),
      makeOutcome("pred-1", 190, 60002),
      makeOutcome("pred-1", 180, 60003),
      makeOutcome("pred-1", 170, 60004),
      makeOutcome("pred-1", 160, 60005),
      makeOutcome("pred-1", 150, 60006),
    ];
    const result = evaluate(prediction, outcomes);
    expect(result.trajectory).toBe("worsening");
  });

  it("uses most recent outcome for accuracy", () => {
    const claim: PredictionClaim = {
      variable: "X",
      baselineValue: 100,
      timeframe: { start: ts(1000), deadline: ts(50000) },
      pattern: { type: "absolute-change", expected: 100 },
    };
    const prediction = makePrediction(claim);
    // First outcome perfect, latest far off — accuracy uses latest
    const outcomes = [
      makeOutcome("pred-1", 200, 60001), // accuracy 1.0
      makeOutcome("pred-1", 100, 60002), // accuracy 0.0 (no change from baseline)
    ];
    const result = evaluate(prediction, outcomes);
    // Most recent (60002) gives accuracy 0.0
    expect(result.accuracy).toBeCloseTo(0);
    expect(result.status).toBe("not-met");
  });
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe("Confidence levels", () => {
  const claim: PredictionClaim = {
    variable: "X",
    baselineValue: 100,
    timeframe: { start: ts(1000), deadline: ts(50000) },
    pattern: { type: "absolute-change", expected: 100 },
  };

  it("low confidence with 1 outcome", () => {
    const prediction = makePrediction(claim);
    const outcomes = [makeOutcome("pred-1", 200, 60000)];
    const result = evaluate(prediction, outcomes);
    expect(result.confidence).toBe("low");
  });

  it("medium confidence with 2 outcomes", () => {
    const prediction = makePrediction(claim);
    const outcomes = [
      makeOutcome("pred-1", 200, 60000),
      makeOutcome("pred-1", 195, 60001),
    ];
    const result = evaluate(prediction, outcomes);
    expect(result.confidence).toBe("medium");
  });

  it("high confidence with 3+ outcomes", () => {
    const prediction = makePrediction(claim);
    const outcomes = [
      makeOutcome("pred-1", 200, 60000),
      makeOutcome("pred-1", 195, 60001),
      makeOutcome("pred-1", 198, 60002),
    ];
    const result = evaluate(prediction, outcomes);
    expect(result.confidence).toBe("high");
  });
});
