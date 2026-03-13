/**
 * @votiverse/prediction — Accuracy evaluation
 *
 * Compares recorded outcomes to prediction claims using pattern-specific
 * evaluation logic. Produces a continuous accuracy score (0-1) rather
 * than binary met/not-met.
 */

import type { Timestamp } from "@votiverse/core";
import { now } from "@votiverse/core";
import type {
  Prediction,
  OutcomeRecord,
  PredictionEvaluation,
  EvaluationStatus,
  EvaluationConfidence,
  TrajectorySignal,
} from "./types.js";

// ---------------------------------------------------------------------------
// Main evaluation function
// ---------------------------------------------------------------------------

/**
 * Evaluates a prediction against its recorded outcomes.
 *
 * Uses the most recent outcome within or after the prediction's timeframe
 * for accuracy computation. All outcomes are used for trajectory analysis.
 *
 * TODO: Outcome source credibility weighting. Currently all sources are
 * treated equally. An official government statistic and a single
 * community-submitted data point carry the same weight in evaluation.
 * The data model supports different source types (official, poll-derived,
 * community, automated) so that credibility weighting can be added later.
 * See whitepaper Section 13.4–13.5 on AI ensemble verification and oracle
 * trustworthiness for the design direction. When implemented, the
 * evaluation should weight outcomes by source credibility, potentially
 * using a configurable credibility hierarchy or a trust score per source.
 */
export function evaluate(
  prediction: Prediction,
  outcomes: readonly OutcomeRecord[],
): PredictionEvaluation {
  const currentTime = now();
  const { timeframe } = prediction.claim;
  const predictionId = prediction.id;

  // Check if timeframe has elapsed
  if (currentTime < timeframe.deadline) {
    // Prediction period hasn't ended yet
    if (outcomes.length === 0) {
      return makePending(predictionId, currentTime);
    }
    // We have early outcomes — compute trajectory but mark as pending
    const trajectory = computeTrajectory(prediction, outcomes);
    return {
      predictionId,
      status: "pending",
      accuracy: 0,
      confidence: "low",
      evaluatedAt: currentTime,
      outcomeCount: outcomes.length,
      trajectory,
    };
  }

  // Timeframe has elapsed
  if (outcomes.length === 0) {
    return {
      predictionId,
      status: "insufficient",
      accuracy: 0,
      confidence: "low",
      evaluatedAt: currentTime,
      outcomeCount: 0,
      trajectory: "insufficient",
    };
  }

  // Use the most recent outcome for accuracy computation
  const sorted = [...outcomes].sort((a, b) => b.recordedAt - a.recordedAt);
  const latest = sorted[0]!;
  const accuracy = computeAccuracy(prediction, latest);
  const trajectory = computeTrajectory(prediction, outcomes);
  const confidence = computeConfidence(outcomes);
  const status = classifyStatus(accuracy);

  return {
    predictionId,
    status,
    accuracy,
    confidence,
    evaluatedAt: currentTime,
    outcomeCount: outcomes.length,
    trajectory,
  };
}

// ---------------------------------------------------------------------------
// Pattern-specific accuracy computation
// ---------------------------------------------------------------------------

/**
 * Computes accuracy for a prediction against a single outcome.
 * Returns a value between 0.0 and 1.0.
 */
function computeAccuracy(prediction: Prediction, outcome: OutcomeRecord): number {
  const { pattern } = prediction.claim;

  switch (pattern.type) {
    case "absolute-change":
      return evaluateAbsoluteChange(
        pattern.expected,
        prediction.claim.baselineValue,
        outcome.measuredValue,
      );

    case "percentage-change":
      return evaluatePercentageChange(
        pattern.expected,
        prediction.claim.baselineValue,
        outcome.measuredValue,
      );

    case "threshold":
      return evaluateThreshold(pattern.target, pattern.direction, outcome.measuredValue);

    case "binary":
      return evaluateBinary(pattern.expectedOutcome, outcome.measuredValue);

    case "range":
      return evaluateRange(pattern.min, pattern.max, outcome.measuredValue);

    case "comparative":
      return evaluateComparative(pattern.direction, outcome.measuredValue, outcome.comparisonValue);
  }
}

function evaluateAbsoluteChange(
  expected: number,
  baseline: number | undefined,
  measured: number | boolean | null,
): number {
  if (measured === null || typeof measured === "boolean" || baseline === undefined) {
    return 0;
  }
  const actualChange = measured - baseline;
  if (expected === 0) return actualChange === 0 ? 1 : 0;
  const error = Math.abs(actualChange - expected) / Math.abs(expected);
  return Math.max(0, 1 - error);
}

function evaluatePercentageChange(
  expected: number,
  baseline: number | undefined,
  measured: number | boolean | null,
): number {
  if (
    measured === null ||
    typeof measured === "boolean" ||
    baseline === undefined ||
    baseline === 0
  ) {
    return 0;
  }
  const actualPercentChange = ((measured - baseline) / Math.abs(baseline)) * 100;
  if (expected === 0) return actualPercentChange === 0 ? 1 : 0;
  const error = Math.abs(actualPercentChange - expected) / Math.abs(expected);
  return Math.max(0, 1 - error);
}

function evaluateThreshold(
  target: number,
  direction: "above" | "below",
  measured: number | boolean | null,
): number {
  if (measured === null || typeof measured === "boolean") return 0;
  if (direction === "above") {
    if (measured >= target) return 1;
    if (target === 0) return 0;
    return Math.max(0, measured / target);
  } else {
    if (measured <= target) return 1;
    if (target === 0) return 0;
    return Math.max(0, target / measured);
  }
}

function evaluateBinary(expectedOutcome: boolean, measured: number | boolean | null): number {
  if (measured === null) return 0;
  const actualBool = typeof measured === "boolean" ? measured : measured !== 0;
  return actualBool === expectedOutcome ? 1 : 0;
}

function evaluateRange(min: number, max: number, measured: number | boolean | null): number {
  if (measured === null || typeof measured === "boolean") return 0;
  if (measured >= min && measured <= max) return 1;
  const range = max - min;
  if (range === 0) return measured === min ? 1 : 0;
  if (measured < min) {
    const distance = min - measured;
    return Math.max(0, 1 - distance / range);
  }
  const distance = measured - max;
  return Math.max(0, 1 - distance / range);
}

function evaluateComparative(
  direction: "greater" | "less",
  measured: number | boolean | null,
  comparisonValue: number | undefined,
): number {
  if (measured === null || typeof measured === "boolean" || comparisonValue === undefined) {
    return 0;
  }
  if (direction === "greater") {
    return measured > comparisonValue ? 1 : 0;
  }
  return measured < comparisonValue ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Trajectory computation
// ---------------------------------------------------------------------------

/**
 * Computes the trajectory of outcomes over time relative to the prediction.
 * Looks at whether measured values are moving toward or away from the target.
 */
function computeTrajectory(
  prediction: Prediction,
  outcomes: readonly OutcomeRecord[],
): TrajectorySignal {
  if (outcomes.length < 2) return "insufficient";

  const sorted = [...outcomes].sort((a, b) => a.recordedAt - b.recordedAt);
  const accuracies = sorted.map((o) => computeAccuracy(prediction, o));

  // Simple linear trend: compare average of first half to second half
  const midpoint = Math.floor(accuracies.length / 2);
  const firstHalf = accuracies.slice(0, midpoint);
  const secondHalf = accuracies.slice(midpoint);

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  const diff = avgSecond - avgFirst;

  // Check for volatility: standard deviation of accuracies
  const allAvg = accuracies.reduce((s, v) => s + v, 0) / accuracies.length;
  const variance = accuracies.reduce((s, v) => s + (v - allAvg) ** 2, 0) / accuracies.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev > 0.3) return "volatile";
  if (Math.abs(diff) < 0.05) return "stable";
  return diff > 0 ? "improving" : "worsening";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeConfidence(outcomes: readonly OutcomeRecord[]): EvaluationConfidence {
  // TODO: Factor in source credibility when credibility weighting is implemented.
  // For now, confidence is based solely on number of data points.
  if (outcomes.length >= 3) return "high";
  if (outcomes.length >= 2) return "medium";
  return "low";
}

function classifyStatus(accuracy: number): EvaluationStatus {
  if (accuracy >= 0.8) return "met";
  if (accuracy >= 0.5) return "partially-met";
  return "not-met";
}

function makePending(predictionId: Prediction["id"], evaluatedAt: Timestamp): PredictionEvaluation {
  return {
    predictionId,
    status: "pending",
    accuracy: 0,
    confidence: "low",
    evaluatedAt,
    outcomeCount: 0,
    trajectory: "insufficient",
  };
}
