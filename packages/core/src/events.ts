/**
 * @votiverse/core — Event definitions
 *
 * All state changes in the engine are recorded as immutable events.
 * Every event extends BaseEvent. Event types are string literal unions,
 * not enums.
 */

import type {
  CommitmentId,
  DelegationId,
  EventId,
  IssueId,
  ParticipantId,
  PollId,
  PredictionId,
  ProposalId,
  Timestamp,
  TopicId,
  VoteChoice,
  VotingEventId,
  EventTimeline,
} from "./types.js";

// ---------------------------------------------------------------------------
// Base event
// ---------------------------------------------------------------------------

/**
 * Base event interface. All domain events extend this.
 * Events are immutable: all fields are readonly.
 */
export interface BaseEvent<TType extends EventType = EventType, TPayload = unknown> {
  readonly id: EventId;
  readonly type: TType;
  readonly timestamp: Timestamp;
  readonly payload: Readonly<TPayload>;
}

// ---------------------------------------------------------------------------
// Event type union
// ---------------------------------------------------------------------------

/** All recognized event types in the system. */
export type EventType =
  | "ParticipantRegistered"
  | "TopicCreated"
  | "VotingEventCreated"
  | "VotingEventClosed"
  | "DelegationCreated"
  | "DelegationRevoked"
  | "VoteCast"
  | "PredictionCommitted"
  | "OutcomeRecorded"
  | "PollCreated"
  | "PollResponseSubmitted"
  | "IntegrityCommitment";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface ParticipantRegisteredPayload {
  readonly participantId: ParticipantId;
  readonly name: string;
}

export interface TopicCreatedPayload {
  readonly topicId: TopicId;
  readonly name: string;
  readonly parentId: TopicId | null;
}

export interface VotingEventCreatedPayload {
  readonly votingEventId: VotingEventId;
  readonly title: string;
  readonly description: string;
  readonly issueIds: readonly IssueId[];
  readonly eligibleParticipantIds: readonly ParticipantId[];
  readonly timeline: EventTimeline;
}

export interface VotingEventClosedPayload {
  readonly votingEventId: VotingEventId;
}

export interface DelegationCreatedPayload {
  readonly delegationId: DelegationId;
  readonly sourceId: ParticipantId;
  readonly targetId: ParticipantId;
  readonly topicScope: readonly TopicId[];
}

export interface DelegationRevokedPayload {
  readonly delegationId: DelegationId;
  readonly sourceId: ParticipantId;
  readonly topicScope: readonly TopicId[];
}

export interface VoteCastPayload {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  readonly choice: VoteChoice;
}

export interface PredictionCommittedPayload {
  readonly predictionId: PredictionId;
  readonly proposalId: ProposalId;
  readonly participantId: ParticipantId;
  readonly predictionData: Readonly<Record<string, unknown>>;
  readonly commitmentHash: string;
}

export interface OutcomeRecordedPayload {
  readonly predictionId: PredictionId;
  readonly outcomeData: Readonly<Record<string, unknown>>;
  readonly source: string;
}

export interface PollCreatedPayload {
  readonly pollId: PollId;
  readonly questions: readonly string[];
  readonly schedule: Timestamp;
  readonly topicScope: readonly TopicId[];
}

export interface PollResponseSubmittedPayload {
  readonly pollId: PollId;
  readonly participantHash: string;
  readonly responses: readonly string[];
}

export interface IntegrityCommitmentPayload {
  readonly commitmentId: CommitmentId;
  readonly artifactType: string;
  readonly artifactHash: string;
  readonly blockReference: string | null;
}

// ---------------------------------------------------------------------------
// Concrete event types
// ---------------------------------------------------------------------------

export type ParticipantRegisteredEvent = BaseEvent<
  "ParticipantRegistered",
  ParticipantRegisteredPayload
>;

export type TopicCreatedEvent = BaseEvent<"TopicCreated", TopicCreatedPayload>;

export type VotingEventCreatedEvent = BaseEvent<"VotingEventCreated", VotingEventCreatedPayload>;

export type VotingEventClosedEvent = BaseEvent<"VotingEventClosed", VotingEventClosedPayload>;

export type DelegationCreatedEvent = BaseEvent<"DelegationCreated", DelegationCreatedPayload>;

export type DelegationRevokedEvent = BaseEvent<"DelegationRevoked", DelegationRevokedPayload>;

export type VoteCastEvent = BaseEvent<"VoteCast", VoteCastPayload>;

export type PredictionCommittedEvent = BaseEvent<"PredictionCommitted", PredictionCommittedPayload>;

export type OutcomeRecordedEvent = BaseEvent<"OutcomeRecorded", OutcomeRecordedPayload>;

export type PollCreatedEvent = BaseEvent<"PollCreated", PollCreatedPayload>;

export type PollResponseSubmittedEvent = BaseEvent<
  "PollResponseSubmitted",
  PollResponseSubmittedPayload
>;

export type IntegrityCommitmentEvent = BaseEvent<"IntegrityCommitment", IntegrityCommitmentPayload>;

/**
 * Union of all concrete domain event types.
 * Use this when you need to handle any event from the store.
 */
export type DomainEvent =
  | ParticipantRegisteredEvent
  | TopicCreatedEvent
  | VotingEventCreatedEvent
  | VotingEventClosedEvent
  | DelegationCreatedEvent
  | DelegationRevokedEvent
  | VoteCastEvent
  | PredictionCommittedEvent
  | OutcomeRecordedEvent
  | PollCreatedEvent
  | PollResponseSubmittedEvent
  | IntegrityCommitmentEvent;

// ---------------------------------------------------------------------------
// Event creation helper
// ---------------------------------------------------------------------------

/**
 * Creates a domain event with auto-generated id and timestamp.
 * The generic parameter ensures the payload matches the event type.
 */
export function createEvent<T extends DomainEvent>(
  type: T["type"],
  payload: T["payload"],
  id: EventId,
  timestamp: Timestamp,
): T {
  return {
    id,
    type,
    timestamp,
    payload,
  } as T;
}
