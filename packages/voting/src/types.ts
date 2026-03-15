/**
 * @votiverse/voting — Type definitions
 *
 * Types for vote casting, ballot methods, quorum checking, and tally results.
 */

import type { ParticipantId, IssueId, VoteChoice } from "@votiverse/core";

// ---------------------------------------------------------------------------
// Vote record
// ---------------------------------------------------------------------------

/** A recorded vote from a participant on an issue. */
export interface VoteRecord {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  readonly choice: VoteChoice;
}

// ---------------------------------------------------------------------------
// Ballot method interface
// ---------------------------------------------------------------------------

/** A weighted vote — the choice paired with its effective weight. */
export interface WeightedVote {
  readonly choice: VoteChoice;
  readonly weight: number;
}

/** The result produced by a ballot method's tally function. */
export interface TallyResult {
  readonly issueId: IssueId;
  /** The winning choice, or null if no clear winner / quorum not met. */
  readonly winner: string | null;
  /** Vote counts per choice (weighted). */
  readonly counts: ReadonlyMap<string, number>;
  /** Total weighted votes counted. */
  readonly totalVotes: number;
  /** Whether the quorum was met. */
  readonly quorumMet: boolean;
  /** The quorum threshold that was applied. */
  readonly quorumThreshold: number;
  /** Number of eligible participants. */
  readonly eligibleCount: number;
  /** Number of participants who voted or delegated to a voter. */
  readonly participatingCount: number;
}

/**
 * Interface for a ballot method.
 * Each method implements this with its own tally logic.
 */
export interface BallotMethod {
  /** Human-readable name of this ballot method. */
  readonly name: string;

  /**
   * Compute the tally for a set of weighted votes.
   *
   * @param votes - The weighted votes to tally.
   * @param issueId - The issue being tallied.
   * @param eligibleCount - Total number of eligible participants.
   * @param quorum - Minimum participation percentage (0-1).
   * @returns The tally result.
   */
  tally(
    votes: readonly WeightedVote[],
    issueId: IssueId,
    eligibleCount: number,
    quorum: number,
  ): TallyResult;
}

// ---------------------------------------------------------------------------
// Participation records
// ---------------------------------------------------------------------------

/** How a participant participated in an issue's vote. */
export type ParticipationStatus = "direct" | "delegated" | "absent";

/**
 * A materialized record of how a participant participated in a vote.
 * Computed from the delegation graph and direct votes at tally time.
 */
export interface ParticipationRecord {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  /** Whether the participant voted directly, via delegation, or did not participate. */
  readonly status: ParticipationStatus;
  /** The effective choice applied to this participant (their own or their delegate's). Null if absent. */
  readonly effectiveChoice: VoteChoice | null;
  /** The immediate delegate (first hop). Null if direct or absent. */
  readonly delegateId: ParticipantId | null;
  /** The participant who actually cast the vote. Null if absent. */
  readonly terminalVoterId: ParticipantId | null;
  /** The full delegation path from this participant to the terminal voter. Empty if direct or absent. */
  readonly chain: readonly ParticipantId[];
}

// ---------------------------------------------------------------------------
// Cast vote params
// ---------------------------------------------------------------------------

export interface CastVoteParams {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  readonly choice: VoteChoice;
  /**
   * Declared choices for this issue, if any. When provided, the cast
   * vote's choice is validated against this list. "abstain" is always
   * accepted regardless of declared choices.
   */
  readonly issueChoices?: readonly string[];
}
