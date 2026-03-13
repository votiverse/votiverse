/**
 * @votiverse/prediction — Public API
 *
 * Prediction lifecycle management, outcome recording, accuracy
 * evaluation, and track records.
 */

// Types
export type {
  Timeframe,
  AbsoluteChangePattern,
  PercentageChangePattern,
  ThresholdPattern,
  BinaryPattern,
  RangePattern,
  ComparativePattern,
  PredictionPattern,
  PredictionClaim,
  Prediction,
  OutcomeSource,
  OutcomeRecord,
  EvaluationStatus,
  EvaluationConfidence,
  TrajectorySignal,
  PredictionEvaluation,
  TrackRecord,
  CommitPredictionParams,
  RecordOutcomeParams,
} from "./types.js";

// Commitment
export { computeCommitmentHash, verifyCommitment } from "./commitment.js";

// Evaluation
export { evaluate } from "./evaluation.js";

// Service
export { PredictionService } from "./prediction-service.js";
