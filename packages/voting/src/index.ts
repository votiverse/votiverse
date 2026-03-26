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

// Vote queries — single source of truth for active vote computation
export { getActiveVotes, hasActiveVote, getActiveVoteChoice, getActiveVoteCounts } from "./vote-queries.js";
export type { ActiveVote } from "./vote-queries.js";
