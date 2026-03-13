/**
 * @votiverse/awareness — Public API
 *
 * Governance awareness layer: read-only monitoring, alerting,
 * and contextual information delivery.
 */

// Types
export type {
  DetailLevel,
  ConcentrationAlert,
  ConcentrationReport,
  DelegateProfile,
  PromptReason,
  EngagementPrompt,
  VotingHistoryEntry,
  PredictionSummary,
  VotingHistory,
  HistoricalContext,
  RelatedDecision,
  TopicTrend,
} from "./types.js";

// Service
export type { IssueContext } from "./awareness-service.js";
export { AwarenessService } from "./awareness-service.js";
