/**
 * @votiverse/core — Public API
 *
 * Shared foundation for all Votiverse packages. Provides:
 * - Branded ID types and base entity types
 * - Event definitions and the BaseEvent interface
 * - EventStore interface and InMemoryEventStore implementation
 * - Result<T, E> type for error handling without exceptions
 * - Base error classes for domain-specific errors
 * - Utility functions for ID generation and timestamps
 */

// Types
export type {
  ParticipantId,
  TopicId,
  IssueId,
  VotingEventId,
  EventId,
  DelegationId,
  PredictionId,
  SurveyId,
  ProposalId,
  CommitmentId,
  OutcomeId,
  QuestionId,
  CandidacyId,
  NoteId,
  AssetId,
  ContentHash,
  ScoringEventId,
  EntryId,
  ScorecardId,
  Timestamp,
  ParticipantStatus,
  Participant,
  Topic,
  Issue,
  EventTimeline,
  VotingEvent,
  VoteChoice,
  TimeProvider,
} from "./types.js";

// Events
export type {
  BaseEvent,
  EventType,
  ParticipantRegisteredPayload,
  ParticipantStatusChangedPayload,
  DelegationRevocationInitiator,
  TopicCreatedPayload,
  VotingEventIssuePayload,
  VotingEventCreatedPayload,
  VotingEventClosedPayload,
  DelegationCreatedPayload,
  DelegationRevokedPayload,
  VoteCastPayload,
  VoteRetractedPayload,
  PredictionCommittedPayload,
  OutcomeRecordedPayload,
  SurveyCreatedPayload,
  SurveyResponseSubmittedPayload,
  IntegrityCommitmentPayload,
  NoteTargetType,
  NoteEvaluation,
  ProposalSubmittedPayload,
  ProposalVersionCreatedPayload,
  ProposalLockedPayload,
  ProposalWithdrawnPayload,
  CandidacyDeclaredPayload,
  CandidacyVersionCreatedPayload,
  CandidacyWithdrawnPayload,
  CommunityNoteCreatedPayload,
  CommunityNoteEvaluatedPayload,
  CommunityNoteWithdrawnPayload,
  ProposalEvaluation,
  ProposalEndorsedPayload,
  AssemblyRole,
  RoleGrantedPayload,
  RoleRevokedPayload,
  ParticipantRegisteredEvent,
  ParticipantStatusChangedEvent,
  TopicCreatedEvent,
  VotingEventCreatedEvent,
  VotingEventClosedEvent,
  DelegationCreatedEvent,
  DelegationRevokedEvent,
  VoteCastEvent,
  VoteRetractedEvent,
  IssueCancelledEvent,
  IssueCancelledPayload,
  PredictionCommittedEvent,
  OutcomeRecordedEvent,
  SurveyCreatedEvent,
  SurveyResponseSubmittedEvent,
  IntegrityCommitmentEvent,
  ProposalSubmittedEvent,
  ProposalVersionCreatedEvent,
  ProposalLockedEvent,
  ProposalWithdrawnEvent,
  CandidacyDeclaredEvent,
  CandidacyVersionCreatedEvent,
  CandidacyWithdrawnEvent,
  CommunityNoteCreatedEvent,
  CommunityNoteEvaluatedEvent,
  CommunityNoteWithdrawnEvent,
  ProposalEndorsedEvent,
  RoleGrantedEvent,
  RoleRevokedEvent,
  ScoringDimensionPayload,
  ScoringCategoryPayload,
  EvaluatorAggregation,
  DimensionAggregation,
  RubricPayload,
  ScoringEntryPayload,
  ScoringTimelinePayload,
  ScoringSettingsPayload,
  DimensionScorePayload,
  ScoringEventCreatedPayload,
  ScoringEventOpenedPayload,
  ScoringEventDeadlineExtendedPayload,
  ScoringEventDraftUpdatedPayload,
  ScorecardSubmittedPayload,
  ScorecardRevisedPayload,
  ScoringEventClosedPayload,
  ScoringEventCreatedEvent,
  ScoringEventOpenedEvent,
  ScoringEventDeadlineExtendedEvent,
  ScoringEventDraftUpdatedEvent,
  ScorecardSubmittedEvent,
  ScorecardRevisedEvent,
  ScoringEventClosedEvent,
  DomainEvent,
} from "./events.js";
export { createEvent } from "./events.js";

// Event Store
export type { EventQueryOptions, EventStore } from "./event-store.js";
export { InMemoryEventStore, DuplicateEventError } from "./event-store.js";

// Result
export type { Ok, Err, Result } from "./result.js";
export { ok, err, isOk, isErr, unwrap, unwrapErr } from "./result.js";

// Errors
export {
  VotiverseError,
  NotFoundError,
  ValidationError,
  InvalidStateError,
  GovernanceRuleViolation,
  AuthorizationError,
} from "./errors.js";

// Utilities
export {
  generateEventId,
  generateParticipantId,
  generateTopicId,
  generateIssueId,
  generateVotingEventId,
  generateDelegationId,
  generatePredictionId,
  generateSurveyId,
  generateProposalId,
  generateCommitmentId,
  generateOutcomeId,
  generateQuestionId,
  generateCandidacyId,
  generateNoteId,
  generateAssetId,
  generateScoringEventId,
  generateEntryId,
  generateScorecardId,
  now,
  timestampFromDate,
  dateFromTimestamp,
  timestamp,
  systemTime,
} from "./utils.js";

// Vote event queries — shared by voting, delegation, and awareness packages
export type { ActiveVote } from "./vote-event-queries.js";
export { getActiveVotes, hasActiveVote, getActiveVoteChoice, getActiveVoteCounts, getDirectVoters } from "./vote-event-queries.js";

// Test Clock
export { TestClock } from "./test-clock.js";
