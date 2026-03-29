/**
 * @votiverse/scoring — Public API
 *
 * Rubric-based multi-criteria scoring with ranking.
 * Non-delegable — every evaluator scores for themselves.
 */

// Types
export type {
  RubricDimension,
  RubricCategory,
  Rubric,
  EvaluatorAggregation,
  DimensionAggregation,
  ScoringEntry,
  DimensionScore,
  Scorecard,
  ScoringTimeline,
  ScoringStatus,
  ScoringSettings,
  ScoringEvent,
  DimensionResult,
  CategoryResult,
  EntryResult,
  ScoringResult,
  CreateScoringEventParams,
  UpdateDraftParams,
  SubmitScorecardParams,
  ReviseScorecardParams,
} from "./types.js";

// Aggregation
export {
  aggregateEvaluators,
  aggregateDimensions,
  computeCategoryScore,
  computeRanking,
  normalizeEvaluatorScores,
} from "./aggregation.js";

// Service
export { ScoringService } from "./scoring-service.js";
