/**
 * @votiverse/survey — Public API
 *
 * Participant surveys: non-delegable sensing mechanism with
 * aggregation and trend computation.
 */

// Types
export type {
  LikertQuestion,
  NumericQuestion,
  DirectionQuestion,
  YesNoQuestion,
  MultipleChoiceQuestion,
  QuestionType,
  SurveyQuestion,
  SurveyStatus,
  Survey,
  SurveyAnswer,
  SurveyResponse,
  QuestionResult,
  SurveyResults,
  TrendPoint,
  TrendDirection,
  TrendData,
  CreateSurveyParams,
  SubmitResponseParams,
} from "./types.js";

// Aggregation
export { aggregateResults, computeTrend } from "./aggregation.js";

// Service
export { SurveyService } from "./survey-service.js";
