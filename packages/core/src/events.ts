/**
 * @votiverse/core — Event definitions
 *
 * All state changes in the engine are recorded as immutable events.
 * Every event extends BaseEvent. Event types are string literal unions,
 * not enums.
 */

import type {
  CandidacyId,
  CommitmentId,
  ContentHash,
  DelegationId,
  EventId,
  IssueId,
  NoteId,
  ParticipantId,
  ParticipantStatus,
  SurveyId,
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
  | "ParticipantStatusChanged"
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
  | "IntegrityCommitment"
  | "ProposalSubmitted"
  | "ProposalVersionCreated"
  | "ProposalLocked"
  | "ProposalWithdrawn"
  | "CandidacyDeclared"
  | "CandidacyVersionCreated"
  | "CandidacyWithdrawn"
  | "CommunityNoteCreated"
  | "CommunityNoteEvaluated"
  | "CommunityNoteWithdrawn"
  | "ProposalEndorsed"
  | "RoleGranted"
  | "RoleRevoked"
  | "IssueCancelled";

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

/** Issue metadata stored within a VotingEventCreated event. */
export interface VotingEventIssuePayload {
  readonly id: IssueId;
  readonly title: string;
  readonly description: string;
  readonly topicId: TopicId | null;
  /**
   * @deprecated Retained for backward compatibility with pre-existing events.
   * New events use `topicId`. During rehydration, `topicIds[0]` is used as
   * fallback when `topicId` is not present.
   */
  readonly topicIds?: readonly TopicId[];
  readonly choices?: readonly string[];
}

export interface VotingEventCreatedPayload {
  readonly votingEventId: VotingEventId;
  readonly title: string;
  readonly description: string;
  /**
   * Full issue metadata. Present in events created after multi-option support.
   * When replaying older events, this may be absent — fall back to issueIds.
   */
  readonly issues?: readonly VotingEventIssuePayload[];
  /** Retained for backward compatibility with pre-existing events. */
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
  /** When set, this delegation applies only to a specific issue (highest precedence). */
  readonly issueScope: IssueId | null;
}

/** Tracks who or what initiated a delegation revocation. */
export type DelegationRevocationInitiator =
  | { readonly kind: "source" }
  | { readonly kind: "sunset"; readonly participantId: ParticipantId }
  | { readonly kind: "expiry" }
  | { readonly kind: "system"; readonly reason: string };

export interface DelegationRevokedPayload {
  readonly delegationId: DelegationId;
  readonly sourceId: ParticipantId;
  readonly topicScope: readonly TopicId[];
  readonly issueScope: IssueId | null;
  readonly revokedBy: DelegationRevocationInitiator;
}

export interface ParticipantStatusChangedPayload {
  readonly participantId: ParticipantId;
  readonly previousStatus: ParticipantStatus;
  readonly newStatus: ParticipantStatus;
  readonly reason: string;
}

export interface VoteCastPayload {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  readonly choice: VoteChoice;
}

export interface IssueCancelledPayload {
  readonly issueId: IssueId;
  readonly votingEventId: VotingEventId;
  readonly cancelledBy: ParticipantId;
  readonly reason: string;
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

export interface SurveyCreatedPayload {
  readonly pollId: SurveyId;
  readonly questions: readonly string[];
  readonly schedule: Timestamp;
  readonly topicScope: readonly TopicId[];
}

export interface SurveyResponseSubmittedPayload {
  readonly pollId: SurveyId;
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
// Content event payload types (proposals, candidacies, community notes)
// ---------------------------------------------------------------------------

/** Notable entity types that community notes can target. */
export type NoteTargetType = "proposal" | "candidacy" | "survey" | "community-note";

/** Community note evaluation signal. */
export type NoteEvaluation = "endorse" | "dispute";

export interface ProposalSubmittedPayload {
  /** Generated by engine. */
  readonly proposalId: ProposalId;
  readonly issueId: IssueId;
  readonly choiceKey?: string;
  readonly authorId: ParticipantId;
  readonly title: string;
  readonly contentHash: ContentHash;
}

export interface ProposalVersionCreatedPayload {
  readonly proposalId: ProposalId;
  readonly versionNumber: number;
  readonly contentHash: ContentHash;
}

export interface ProposalLockedPayload {
  readonly proposalId: ProposalId;
  readonly issueId: IssueId;
}

export interface ProposalWithdrawnPayload {
  readonly proposalId: ProposalId;
  readonly authorId: ParticipantId;
}

export interface CandidacyDeclaredPayload {
  /** Generated by engine. */
  readonly candidacyId: CandidacyId;
  readonly participantId: ParticipantId;
  readonly topicScope: readonly TopicId[];
  readonly voteTransparencyOptIn: boolean;
  readonly contentHash: ContentHash;
}

export interface CandidacyVersionCreatedPayload {
  readonly candidacyId: CandidacyId;
  readonly versionNumber: number;
  readonly contentHash: ContentHash;
  readonly topicScope?: readonly TopicId[];
  readonly voteTransparencyOptIn?: boolean;
}

export interface CandidacyWithdrawnPayload {
  readonly candidacyId: CandidacyId;
  readonly participantId: ParticipantId;
}

export interface CommunityNoteCreatedPayload {
  /** Generated by engine. */
  readonly noteId: NoteId;
  readonly authorId: ParticipantId;
  readonly contentHash: ContentHash;
  readonly targetType: NoteTargetType;
  readonly targetId: string;
  readonly targetVersionNumber?: number;
}

export interface CommunityNoteEvaluatedPayload {
  readonly noteId: NoteId;
  readonly participantId: ParticipantId;
  readonly evaluation: NoteEvaluation;
}

export interface CommunityNoteWithdrawnPayload {
  readonly noteId: NoteId;
  readonly authorId: ParticipantId;
}

/** Proposal endorsement signal — same domain as NoteEvaluation. */
export type ProposalEvaluation = "endorse" | "dispute";

export interface ProposalEndorsedPayload {
  readonly proposalId: ProposalId;
  readonly participantId: ParticipantId;
  readonly evaluation: ProposalEvaluation;
}

/** Assembly role type. */
export type AssemblyRole = "owner" | "admin";

export interface RoleGrantedPayload {
  readonly participantId: ParticipantId;
  readonly role: AssemblyRole;
  readonly grantedBy: ParticipantId;
}

export interface RoleRevokedPayload {
  readonly participantId: ParticipantId;
  readonly role: AssemblyRole;
  readonly revokedBy: ParticipantId;
}

// ---------------------------------------------------------------------------
// Concrete event types
// ---------------------------------------------------------------------------

export type ParticipantRegisteredEvent = BaseEvent<
  "ParticipantRegistered",
  ParticipantRegisteredPayload
>;

export type ParticipantStatusChangedEvent = BaseEvent<
  "ParticipantStatusChanged",
  ParticipantStatusChangedPayload
>;

export type TopicCreatedEvent = BaseEvent<"TopicCreated", TopicCreatedPayload>;

export type VotingEventCreatedEvent = BaseEvent<"VotingEventCreated", VotingEventCreatedPayload>;

export type VotingEventClosedEvent = BaseEvent<"VotingEventClosed", VotingEventClosedPayload>;

export type DelegationCreatedEvent = BaseEvent<"DelegationCreated", DelegationCreatedPayload>;

export type DelegationRevokedEvent = BaseEvent<"DelegationRevoked", DelegationRevokedPayload>;

export type VoteCastEvent = BaseEvent<"VoteCast", VoteCastPayload>;

export type IssueCancelledEvent = BaseEvent<"IssueCancelled", IssueCancelledPayload>;

export type PredictionCommittedEvent = BaseEvent<"PredictionCommitted", PredictionCommittedPayload>;

export type OutcomeRecordedEvent = BaseEvent<"OutcomeRecorded", OutcomeRecordedPayload>;

export type SurveyCreatedEvent = BaseEvent<"PollCreated", SurveyCreatedPayload>;

export type SurveyResponseSubmittedEvent = BaseEvent<
  "PollResponseSubmitted",
  SurveyResponseSubmittedPayload
>;

export type IntegrityCommitmentEvent = BaseEvent<"IntegrityCommitment", IntegrityCommitmentPayload>;

export type ProposalSubmittedEvent = BaseEvent<"ProposalSubmitted", ProposalSubmittedPayload>;
export type ProposalVersionCreatedEvent = BaseEvent<"ProposalVersionCreated", ProposalVersionCreatedPayload>;
export type ProposalLockedEvent = BaseEvent<"ProposalLocked", ProposalLockedPayload>;
export type ProposalWithdrawnEvent = BaseEvent<"ProposalWithdrawn", ProposalWithdrawnPayload>;

export type CandidacyDeclaredEvent = BaseEvent<"CandidacyDeclared", CandidacyDeclaredPayload>;
export type CandidacyVersionCreatedEvent = BaseEvent<"CandidacyVersionCreated", CandidacyVersionCreatedPayload>;
export type CandidacyWithdrawnEvent = BaseEvent<"CandidacyWithdrawn", CandidacyWithdrawnPayload>;

export type CommunityNoteCreatedEvent = BaseEvent<"CommunityNoteCreated", CommunityNoteCreatedPayload>;
export type CommunityNoteEvaluatedEvent = BaseEvent<"CommunityNoteEvaluated", CommunityNoteEvaluatedPayload>;
export type CommunityNoteWithdrawnEvent = BaseEvent<"CommunityNoteWithdrawn", CommunityNoteWithdrawnPayload>;

export type ProposalEndorsedEvent = BaseEvent<"ProposalEndorsed", ProposalEndorsedPayload>;

export type RoleGrantedEvent = BaseEvent<"RoleGranted", RoleGrantedPayload>;
export type RoleRevokedEvent = BaseEvent<"RoleRevoked", RoleRevokedPayload>;

/**
 * Union of all concrete domain event types.
 * Use this when you need to handle any event from the store.
 */
export type DomainEvent =
  | ParticipantRegisteredEvent
  | ParticipantStatusChangedEvent
  | TopicCreatedEvent
  | VotingEventCreatedEvent
  | VotingEventClosedEvent
  | DelegationCreatedEvent
  | DelegationRevokedEvent
  | VoteCastEvent
  | IssueCancelledEvent
  | PredictionCommittedEvent
  | OutcomeRecordedEvent
  | SurveyCreatedEvent
  | SurveyResponseSubmittedEvent
  | IntegrityCommitmentEvent
  | ProposalSubmittedEvent
  | ProposalVersionCreatedEvent
  | ProposalLockedEvent
  | ProposalWithdrawnEvent
  | CandidacyDeclaredEvent
  | CandidacyVersionCreatedEvent
  | CandidacyWithdrawnEvent
  | CommunityNoteCreatedEvent
  | CommunityNoteEvaluatedEvent
  | CommunityNoteWithdrawnEvent
  | ProposalEndorsedEvent
  | RoleGrantedEvent
  | RoleRevokedEvent;

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
