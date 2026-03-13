/**
 * @votiverse/core — Common utilities
 *
 * ID generation, timestamp handling, and schema validation helpers.
 */

import { randomUUID } from "node:crypto";
import type {
  CommitmentId,
  DelegationId,
  EventId,
  IssueId,
  OutcomeId,
  ParticipantId,
  PollId,
  PredictionId,
  ProposalId,
  QuestionId,
  Timestamp,
  TopicId,
  VotingEventId,
} from "./types.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Generates a new unique EventId. */
export function generateEventId(): EventId {
  return randomUUID() as EventId;
}

/** Generates a new unique ParticipantId. */
export function generateParticipantId(): ParticipantId {
  return randomUUID() as ParticipantId;
}

/** Generates a new unique TopicId. */
export function generateTopicId(): TopicId {
  return randomUUID() as TopicId;
}

/** Generates a new unique IssueId. */
export function generateIssueId(): IssueId {
  return randomUUID() as IssueId;
}

/** Generates a new unique VotingEventId. */
export function generateVotingEventId(): VotingEventId {
  return randomUUID() as VotingEventId;
}

/** Generates a new unique DelegationId. */
export function generateDelegationId(): DelegationId {
  return randomUUID() as DelegationId;
}

/** Generates a new unique PredictionId. */
export function generatePredictionId(): PredictionId {
  return randomUUID() as PredictionId;
}

/** Generates a new unique PollId. */
export function generatePollId(): PollId {
  return randomUUID() as PollId;
}

/** Generates a new unique ProposalId. */
export function generateProposalId(): ProposalId {
  return randomUUID() as ProposalId;
}

/** Generates a new unique CommitmentId. */
export function generateCommitmentId(): CommitmentId {
  return randomUUID() as CommitmentId;
}

/** Generates a new unique OutcomeId. */
export function generateOutcomeId(): OutcomeId {
  return randomUUID() as OutcomeId;
}

/** Generates a new unique QuestionId. */
export function generateQuestionId(): QuestionId {
  return randomUUID() as QuestionId;
}

// ---------------------------------------------------------------------------
// Timestamp utilities
// ---------------------------------------------------------------------------

/** Returns the current time as a Timestamp. */
export function now(): Timestamp {
  return Date.now() as Timestamp;
}

/** Creates a Timestamp from a Date object. */
export function timestampFromDate(date: Date): Timestamp {
  return date.getTime() as Timestamp;
}

/** Creates a Date object from a Timestamp. */
export function dateFromTimestamp(ts: Timestamp): Date {
  return new Date(ts);
}

/** Creates a Timestamp from epoch milliseconds. */
export function timestamp(ms: number): Timestamp {
  return ms as Timestamp;
}
