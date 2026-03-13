/**
 * @votiverse/engine — Public API
 *
 * Orchestration layer wiring all Votiverse packages together.
 */

export type {
  EngineOptions,
  CreateVotingEventParams,
  CreateIssueParams,
} from "./engine.js";

export { VotiverseEngine, createEngine } from "./engine.js";

// Re-export key types from sub-packages for consumer convenience
export type {
  GovernanceConfig,
  PresetName,
  ValidationResult,
} from "@votiverse/config";

export type {
  ParticipantId,
  TopicId,
  IssueId,
  VotingEventId,
  EventId,
  DelegationId,
  Participant,
  Topic,
  Issue,
  VotingEvent,
  EventTimeline,
  VoteChoice,
  EventStore,
  Timestamp,
} from "@votiverse/core";

export {
  InMemoryEventStore,
  timestamp,
} from "@votiverse/core";

export type {
  Delegation,
  DelegationChain,
  WeightDistribution,
  ConcentrationMetrics,
} from "@votiverse/delegation";

export type {
  TallyResult,
  VoteRecord,
} from "@votiverse/voting";

export type {
  IdentityProvider,
} from "@votiverse/identity";

export type {
  Prediction,
  PredictionClaim,
  PredictionEvaluation,
  TrackRecord,
  CommitPredictionParams,
  RecordOutcomeParams,
} from "@votiverse/prediction";

export type {
  Poll,
  PollResults,
  TrendData,
  CreatePollParams,
  SubmitResponseParams,
} from "@votiverse/polling";

export { getPreset } from "@votiverse/config";
