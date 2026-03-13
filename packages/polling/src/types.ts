/**
 * @votiverse/polling — Type definitions
 *
 * Participant polls: non-delegable sensing mechanism.
 * Polls capture observations, not decisions. Responses are
 * non-transferable — every participant responds for themselves.
 */

import type { ParticipantId, PollId, QuestionId, TopicId, Timestamp } from "@votiverse/core";

// ---------------------------------------------------------------------------
// Question types (discriminated union)
// ---------------------------------------------------------------------------

export interface LikertQuestion {
  readonly type: "likert";
  readonly scale: 5 | 7;
  /** Labels for the scale endpoints, e.g. ["strongly disagree", "strongly agree"]. */
  readonly labels: readonly [string, string];
}

export interface NumericQuestion {
  readonly type: "numeric";
  readonly min: number;
  readonly max: number;
  readonly unit: string;
}

export interface DirectionQuestion {
  readonly type: "direction";
}

export interface YesNoQuestion {
  readonly type: "yes-no";
}

export interface MultipleChoiceQuestion {
  readonly type: "multiple-choice";
  readonly options: readonly string[];
}

export type QuestionType =
  | LikertQuestion
  | NumericQuestion
  | DirectionQuestion
  | YesNoQuestion
  | MultipleChoiceQuestion;

// ---------------------------------------------------------------------------
// Poll question
// ---------------------------------------------------------------------------

export interface PollQuestion {
  readonly id: QuestionId;
  readonly text: string;
  readonly questionType: QuestionType;
  /** Topic tags for trend matching. */
  readonly topicIds: readonly TopicId[];
  /** Free-form tags for grouping related questions across polls. */
  readonly tags: readonly string[];
}

// ---------------------------------------------------------------------------
// Poll entity
// ---------------------------------------------------------------------------

export type PollStatus = "scheduled" | "open" | "closed";

export interface Poll {
  readonly id: PollId;
  readonly title: string;
  readonly topicScope: readonly TopicId[];
  readonly questions: readonly PollQuestion[];
  /** When the poll opens for responses. */
  readonly schedule: Timestamp;
  /** When the poll closes. */
  readonly closesAt: Timestamp;
  readonly createdBy: ParticipantId;
  readonly status: PollStatus;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface PollAnswer {
  readonly questionId: QuestionId;
  /** Numeric for likert/numeric/direction, string for multiple-choice, boolean for yes-no. */
  readonly value: number | string | boolean;
}

export interface PollResponse {
  readonly pollId: PollId;
  /** Hashed participant ID for deduplication without attribution. */
  readonly participantHash: string;
  readonly answers: readonly PollAnswer[];
  readonly submittedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Aggregation results
// ---------------------------------------------------------------------------

export interface QuestionResult {
  readonly questionId: QuestionId;
  readonly responseCount: number;
  readonly mean?: number;
  readonly median?: number;
  readonly standardDeviation?: number;
  /** Value → count mapping for distribution analysis. */
  readonly distribution: ReadonlyMap<string, number>;
}

export interface PollResults {
  readonly pollId: PollId;
  readonly responseCount: number;
  readonly responseRate: number;
  readonly questionResults: readonly QuestionResult[];
}

// ---------------------------------------------------------------------------
// Trend computation
// ---------------------------------------------------------------------------

export interface TrendPoint {
  readonly timestamp: Timestamp;
  /** Normalized sentiment score, -1 to +1. */
  readonly score: number;
  readonly responseRate: number;
  readonly questionCount: number;
  /** Confidence based on response rate and question count. */
  readonly confidence: number;
}

export type TrendDirection = "improving" | "stable" | "worsening" | "insufficient";

export interface TrendData {
  readonly topicId: TopicId;
  readonly timeRange: { readonly start: Timestamp; readonly end: Timestamp };
  readonly points: readonly TrendPoint[];
  readonly direction: TrendDirection;
  /** Linear regression slope of the normalized scores. */
  readonly slope: number;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface CreatePollParams {
  readonly title: string;
  readonly topicScope: readonly TopicId[];
  readonly questions: readonly Omit<PollQuestion, "id">[];
  readonly schedule: Timestamp;
  readonly closesAt: Timestamp;
  readonly createdBy: ParticipantId;
}

export interface SubmitResponseParams {
  readonly pollId: PollId;
  readonly participantId: ParticipantId;
  readonly answers: readonly PollAnswer[];
}
