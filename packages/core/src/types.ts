/**
 * @votiverse/core — Base entity types
 *
 * Branded ID types provide compile-time safety: a ParticipantId cannot be
 * accidentally passed where an IssueId is expected, even though both are
 * strings at runtime.
 */

// ---------------------------------------------------------------------------
// Branded ID types
// ---------------------------------------------------------------------------

/** Unique identifier for a participant. */
export type ParticipantId = string & { readonly __brand: "ParticipantId" };

/** Unique identifier for a topic in the hierarchical taxonomy. */
export type TopicId = string & { readonly __brand: "TopicId" };

/** Unique identifier for an issue to be voted on. */
export type IssueId = string & { readonly __brand: "IssueId" };

/** Unique identifier for a voting event (a collection of issues). */
export type VotingEventId = string & { readonly __brand: "VotingEventId" };

/** Unique identifier for an event in the event store. */
export type EventId = string & { readonly __brand: "EventId" };

/** Unique identifier for a delegation. */
export type DelegationId = string & { readonly __brand: "DelegationId" };

/** Unique identifier for a prediction. */
export type PredictionId = string & { readonly __brand: "PredictionId" };

/** Unique identifier for a poll. */
export type PollId = string & { readonly __brand: "PollId" };

/** Unique identifier for a proposal. */
export type ProposalId = string & { readonly __brand: "ProposalId" };

/** Unique identifier for an integrity commitment. */
export type CommitmentId = string & { readonly __brand: "CommitmentId" };

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

/** Milliseconds since Unix epoch. Branded for type safety. */
export type Timestamp = number & { readonly __brand: "Timestamp" };

// ---------------------------------------------------------------------------
// Base entity types
// ---------------------------------------------------------------------------

/**
 * A participant in the governance system.
 * The identity package extends this with authentication details.
 */
export interface Participant {
  readonly id: ParticipantId;
  readonly name: string;
  readonly registeredAt: Timestamp;
}

/**
 * A topic in the hierarchical topic taxonomy.
 * Topics form a tree: a topic may have a parent, and subtopics inherit
 * from their parent's scope.
 */
export interface Topic {
  readonly id: TopicId;
  readonly name: string;
  readonly parentId: TopicId | null;
}

/**
 * An issue to be decided by vote. Each issue belongs to one or more topics
 * and is part of a voting event.
 */
export interface Issue {
  readonly id: IssueId;
  readonly title: string;
  readonly description: string;
  readonly topicIds: readonly TopicId[];
  readonly votingEventId: VotingEventId;
}

/**
 * Timeline for a voting event. Defines the deliberation and voting windows.
 */
export interface EventTimeline {
  readonly deliberationStart: Timestamp;
  readonly votingStart: Timestamp;
  readonly votingEnd: Timestamp;
}

/**
 * A voting event — the operational unit of governance. Contains one or more
 * issues, a set of eligible participants, and a defined timeline.
 */
export interface VotingEvent {
  readonly id: VotingEventId;
  readonly title: string;
  readonly description: string;
  readonly issueIds: readonly IssueId[];
  readonly eligibleParticipantIds: readonly ParticipantId[];
  readonly timeline: EventTimeline;
  readonly createdAt: Timestamp;
}

/**
 * The choice a participant makes when voting on an issue.
 * For simple majority: "for" | "against" | "abstain".
 * For ranked choice: an ordered list of option IDs.
 * The string form covers most ballot methods; ranked uses the array form.
 */
export type VoteChoice = string | readonly string[];
