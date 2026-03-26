/**
 * @votiverse/voting — Public API
 *
 * Vote casting, tallying, and ballot method implementations.
 */

// Types
export type {
  VoteRecord,
  WeightedVote,
  TallyResult,
  BallotMethod,
  CastVoteParams,
  ParticipationStatus,
  ParticipationRecord,
} from "./types.js";

// Ballot methods
export {
  SimpleMajority,
  Supermajority,
  RankedChoice,
  ApprovalVoting,
  createBallotMethod,
} from "./ballot-methods.js";

// Service
export { VotingService } from "./voting-service.js";

// Vote queries — re-exported from core (canonical implementation)
export { getActiveVotes, hasActiveVote, getActiveVoteChoice, getActiveVoteCounts, getDirectVoters } from "@votiverse/core";
export type { ActiveVote } from "@votiverse/core";
