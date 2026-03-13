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
  PollId,
  ProposalId,
  CommitmentId,
  Timestamp,
  Participant,
  Topic,
  Issue,
  EventTimeline,
  VotingEvent,
  VoteChoice,
} from "./types.js";

// Events
export type {
  BaseEvent,
  EventType,
  ParticipantRegisteredPayload,
  TopicCreatedPayload,
  VotingEventCreatedPayload,
  VotingEventClosedPayload,
  DelegationCreatedPayload,
  DelegationRevokedPayload,
  VoteCastPayload,
  PredictionCommittedPayload,
  OutcomeRecordedPayload,
  PollCreatedPayload,
  PollResponseSubmittedPayload,
  IntegrityCommitmentPayload,
  ParticipantRegisteredEvent,
  TopicCreatedEvent,
  VotingEventCreatedEvent,
  VotingEventClosedEvent,
  DelegationCreatedEvent,
  DelegationRevokedEvent,
  VoteCastEvent,
  PredictionCommittedEvent,
  OutcomeRecordedEvent,
  PollCreatedEvent,
  PollResponseSubmittedEvent,
  IntegrityCommitmentEvent,
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
  generatePollId,
  generateProposalId,
  generateCommitmentId,
  now,
  timestampFromDate,
  dateFromTimestamp,
  timestamp,
} from "./utils.js";
