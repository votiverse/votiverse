/**
 * @votiverse/core — Common utilities
 *
 * ID generation, timestamp handling, and schema validation helpers.
 */

import { v7 as uuidv7 } from "uuid";
import type {
  AssetId,
  CandidacyId,
  CommitmentId,
  DelegationId,
  EventId,
  IssueId,
  NoteId,
  OutcomeId,
  ParticipantId,
  SurveyId,
  PredictionId,
  ProposalId,
  QuestionId,
  TimeProvider,
  Timestamp,
  TopicId,
  VotingEventId,
} from "./types.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Generates a new unique EventId. */
export function generateEventId(): EventId {
  return uuidv7() as EventId;
}

/** Generates a new unique ParticipantId. */
export function generateParticipantId(): ParticipantId {
  return uuidv7() as ParticipantId;
}

/** Generates a new unique TopicId. */
export function generateTopicId(): TopicId {
  return uuidv7() as TopicId;
}

/** Generates a new unique IssueId. */
export function generateIssueId(): IssueId {
  return uuidv7() as IssueId;
}

/** Generates a new unique VotingEventId. */
export function generateVotingEventId(): VotingEventId {
  return uuidv7() as VotingEventId;
}

/** Generates a new unique DelegationId. */
export function generateDelegationId(): DelegationId {
  return uuidv7() as DelegationId;
}

/** Generates a new unique PredictionId. */
export function generatePredictionId(): PredictionId {
  return uuidv7() as PredictionId;
}

/** Generates a new unique SurveyId. */
export function generateSurveyId(): SurveyId {
  return uuidv7() as SurveyId;
}

/** Generates a new unique ProposalId. */
export function generateProposalId(): ProposalId {
  return uuidv7() as ProposalId;
}

/** Generates a new unique CommitmentId. */
export function generateCommitmentId(): CommitmentId {
  return uuidv7() as CommitmentId;
}

/** Generates a new unique OutcomeId. */
export function generateOutcomeId(): OutcomeId {
  return uuidv7() as OutcomeId;
}

/** Generates a new unique QuestionId. */
export function generateQuestionId(): QuestionId {
  return uuidv7() as QuestionId;
}

/** Generates a new unique CandidacyId. */
export function generateCandidacyId(): CandidacyId {
  return uuidv7() as CandidacyId;
}

/** Generates a new unique NoteId. */
export function generateNoteId(): NoteId {
  return uuidv7() as NoteId;
}

/** Generates a new unique AssetId. */
export function generateAssetId(): AssetId {
  return uuidv7() as AssetId;
}

// ---------------------------------------------------------------------------
// Timestamp utilities
// ---------------------------------------------------------------------------

/** Returns the current time as a Timestamp. */
export function now(): Timestamp {
  return Date.now() as Timestamp;
}

/** Default TimeProvider using the system clock. */
export const systemTime: TimeProvider = {
  now: () => Date.now() as Timestamp,
};

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
