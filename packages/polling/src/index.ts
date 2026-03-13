/**
 * @votiverse/polling — Public API
 *
 * Participant polls: non-delegable sensing mechanism with
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
  PollQuestion,
  PollStatus,
  Poll,
  PollAnswer,
  PollResponse,
  QuestionResult,
  PollResults,
  TrendPoint,
  TrendDirection,
  TrendData,
  CreatePollParams,
  SubmitResponseParams,
} from "./types.js";

// Aggregation
export { aggregateResults, computeTrend } from "./aggregation.js";

// Service
export { PollingService } from "./polling-service.js";
