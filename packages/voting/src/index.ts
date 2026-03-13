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
