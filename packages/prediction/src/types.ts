/**
 * @votiverse/prediction — Type definitions
 *
 * Data model for the prediction lifecycle:
 *   creation → commitment hash → outcome recording → accuracy evaluation
 *
 * Predictions are immutable once committed. Outcomes are append-only
 * (multiple data points over time). Evaluation is recomputed from
 * current outcomes.
 */

import type {
  ParticipantId,
  PredictionId,
  ProposalId,
  OutcomeId,
  SurveyId,
  Timestamp,
} from "@votiverse/core";

// ---------------------------------------------------------------------------
// Timeframe
// ---------------------------------------------------------------------------

/** When a prediction should be evaluable. */
export interface Timeframe {
  /** When the prediction period starts (usually proposal adoption). */
  readonly start: Timestamp;
  /** When the prediction becomes evaluable. */
  readonly deadline: Timestamp;
}

// ---------------------------------------------------------------------------
// Prediction patterns (discriminated union)
// ---------------------------------------------------------------------------

/** Absolute change: "X will change by N." */
export interface AbsoluteChangePattern {
  readonly type: "absolute-change";
  /** Expected change in the measured variable. Positive = increase. */
  readonly expected: number;
}

/** Percentage change: "X will change by N%." */
export interface PercentageChangePattern {
  readonly type: "percentage-change";
  /** Expected percentage change. Positive = increase. E.g., -15 means 15% decrease. */
  readonly expected: number;
}

/** Threshold: "X will reach T." */
export interface ThresholdPattern {
  readonly type: "threshold";
  /** Target value. */
  readonly target: number;
  /** Whether the measured value should be above or below the target. */
  readonly direction: "above" | "below";
}

/** Binary outcome: "X will / will not happen." */
export interface BinaryPattern {
  readonly type: "binary";
  /** Whether the outcome is expected to occur. */
  readonly expectedOutcome: boolean;
}

/** Range: "X will be between min and max." */
export interface RangePattern {
  readonly type: "range";
  readonly min: number;
  readonly max: number;
}

/** Comparative: "X will be greater/less than Y." */
export interface ComparativePattern {
  readonly type: "comparative";
  /** The variable being compared to. */
  readonly compareTo: string;
  /** Expected direction of comparison. */
  readonly direction: "greater" | "less";
}

/** All prediction patterns. Discriminated on `type`. */
export type PredictionPattern =
  | AbsoluteChangePattern
  | PercentageChangePattern
  | ThresholdPattern
  | BinaryPattern
  | RangePattern
  | ComparativePattern;

// ---------------------------------------------------------------------------
// Prediction claim
// ---------------------------------------------------------------------------

/**
 * A structured, falsifiable claim attached to a proposal.
 * This is the immutable content that gets hashed for commitment.
 */
export interface PredictionClaim {
  /** The measurable variable. E.g., "youth sports participation". */
  readonly variable: string;
  /** Current value at prediction time, if known. */
  readonly baselineValue?: number;
  /** When the prediction should be evaluable. */
  readonly timeframe: Timeframe;
  /** How the variable will be measured. */
  readonly methodology?: string;
  /** The specific claim structure. */
  readonly pattern: PredictionPattern;
}

// ---------------------------------------------------------------------------
// Prediction entity
// ---------------------------------------------------------------------------

/**
 * A committed prediction. Immutable once created.
 */
export interface Prediction {
  readonly id: PredictionId;
  readonly proposalId: ProposalId;
  /** Who made this prediction. */
  readonly participantId: ParticipantId;
  /** The structured claim. */
  readonly claim: PredictionClaim;
  /** SHA-256 of the canonicalized claim, for tamper detection. */
  readonly commitmentHash: string;
  readonly committedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Outcome recording
// ---------------------------------------------------------------------------

/** Source of an outcome measurement. */
export type OutcomeSource =
  | { readonly type: "official"; readonly provider: string }
  | { readonly type: "poll-derived"; readonly pollId: SurveyId }
  | { readonly type: "community"; readonly participantId: ParticipantId }
  | { readonly type: "automated"; readonly provider: string };

/**
 * A recorded outcome data point for a prediction.
 * Multiple outcomes can be recorded over time — each is a new event.
 */
export interface OutcomeRecord {
  readonly id: OutcomeId;
  readonly predictionId: PredictionId;
  readonly recordedAt: Timestamp;
  readonly source: OutcomeSource;
  /**
   * The measured value. Number for most patterns, boolean for binary.
   * null if the measurement could not be obtained.
   */
  readonly measuredValue: number | boolean | null;
  /** For comparative patterns: the measured value of the comparison variable. */
  readonly comparisonValue?: number;
  /** Free-form notes about the measurement context. */
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Overall status of a prediction evaluation. */
export type EvaluationStatus =
  | "pending"
  | "evaluable"
  | "insufficient"
  | "met"
  | "partially-met"
  | "not-met";

/** Confidence in the evaluation, based on data quality and quantity. */
export type EvaluationConfidence = "high" | "medium" | "low";

/** Direction the measured values are trending relative to the prediction. */
export type TrajectorySignal = "improving" | "stable" | "worsening" | "volatile" | "insufficient";

/**
 * Result of evaluating a prediction against its recorded outcomes.
 */
export interface PredictionEvaluation {
  readonly predictionId: PredictionId;
  readonly status: EvaluationStatus;
  /** Continuous accuracy score: 0.0 = completely wrong, 1.0 = perfectly met. */
  readonly accuracy: number;
  readonly confidence: EvaluationConfidence;
  readonly evaluatedAt: Timestamp;
  /** Number of outcome data points used. */
  readonly outcomeCount: number;
  /** Direction of movement across all outcome data points. */
  readonly trajectory: TrajectorySignal;
}

// ---------------------------------------------------------------------------
// Track record
// ---------------------------------------------------------------------------

/**
 * Aggregate prediction accuracy for a participant.
 */
export interface TrackRecord {
  readonly participantId: ParticipantId;
  readonly totalPredictions: number;
  readonly evaluatedPredictions: number;
  readonly averageAccuracy: number;
  readonly byStatus: Readonly<Partial<Record<EvaluationStatus, number>>>;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface CommitPredictionParams {
  readonly proposalId: ProposalId;
  readonly participantId: ParticipantId;
  readonly claim: PredictionClaim;
}

export interface RecordOutcomeParams {
  readonly predictionId: PredictionId;
  readonly source: OutcomeSource;
  readonly measuredValue: number | boolean | null;
  readonly comparisonValue?: number;
  readonly notes?: string;
}
