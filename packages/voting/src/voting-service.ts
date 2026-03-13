/**
 * @votiverse/voting — VotingService
 *
 * High-level service for vote casting and tallying.
 */

import type {
  EventStore,
  ParticipantId,
  IssueId,
  TopicId,
  VoteCastEvent,
} from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  now,
} from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import {
  buildActiveDelegations,
  getDirectVoters,
  buildDelegationGraph,
  computeWeights,
} from "@votiverse/delegation";
import type { CastVoteParams, TallyResult, VoteRecord, WeightedVote } from "./types.js";
import { createBallotMethod } from "./ballot-methods.js";

/**
 * Service for casting votes and computing tallies.
 */
export class VotingService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
  ) {}

  /**
   * Cast a vote on an issue. Records a VoteCast event.
   * If the participant has active delegations for this issue, the override
   * rule is applied automatically during tally computation.
   */
  async cast(params: CastVoteParams): Promise<void> {
    const event = createEvent<VoteCastEvent>(
      "VoteCast",
      {
        participantId: params.participantId,
        issueId: params.issueId,
        choice: params.choice,
      },
      generateEventId(),
      now(),
    );

    await this.eventStore.append(event);
  }

  /**
   * Get all direct votes for an issue.
   */
  async getVotes(issueId: IssueId): Promise<readonly VoteRecord[]> {
    const events = await this.eventStore.query({ types: ["VoteCast"] });
    // Use a map to keep only the latest vote per participant
    const latestVotes = new Map<ParticipantId, VoteRecord>();

    for (const event of events) {
      const e = event as VoteCastEvent;
      if (e.payload.issueId === issueId) {
        latestVotes.set(e.payload.participantId, {
          participantId: e.payload.participantId,
          issueId: e.payload.issueId,
          choice: e.payload.choice,
        });
      }
    }

    return [...latestVotes.values()];
  }

  /**
   * Compute the tally for an issue using the configured ballot method.
   *
   * @param issueId - The issue to tally.
   * @param issueTopics - The topics of the issue (for delegation scope resolution).
   * @param eligibleParticipantIds - All eligible participants.
   * @param topicAncestors - Topic hierarchy for scope resolution.
   */
  async tally(
    issueId: IssueId,
    issueTopics: readonly TopicId[],
    eligibleParticipantIds: ReadonlySet<ParticipantId>,
    topicAncestors?: ReadonlyMap<TopicId, readonly TopicId[]>,
  ): Promise<TallyResult> {
    // Get direct votes
    const votes = await this.getVotes(issueId);
    const directVoters = await getDirectVoters(this.eventStore, issueId);

    // Build delegation graph and compute weights
    const delegations = await buildActiveDelegations(this.eventStore);
    const graph = buildDelegationGraph(
      issueId,
      issueTopics,
      delegations,
      topicAncestors ?? new Map(),
    );
    const weightDist = computeWeights(
      graph,
      directVoters,
      eligibleParticipantIds,
    );

    // Build weighted votes: each direct voter's choice * their effective weight
    const weightedVotes: WeightedVote[] = [];
    for (const vote of votes) {
      const weight = weightDist.weights.get(vote.participantId) ?? 0;
      if (weight > 0) {
        weightedVotes.push({ choice: vote.choice, weight });
      }
    }

    // Get ballot method from config
    const method = createBallotMethod(
      this.config.ballot.votingMethod,
      this.config.ballot.supermajorityThreshold,
    );

    return method.tally(
      weightedVotes,
      issueId,
      eligibleParticipantIds.size,
      this.config.ballot.quorum,
    );
  }
}
