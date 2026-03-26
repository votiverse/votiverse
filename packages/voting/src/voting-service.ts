/**
 * @votiverse/voting — VotingService
 *
 * High-level service for vote casting and tallying.
 */

import type { EventStore, ParticipantId, IssueId, TopicId, VoteCastEvent, VoteRetractedEvent, VoteChoice } from "@votiverse/core";
import { createEvent, generateEventId, now, ValidationError, GovernanceRuleViolation } from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import {
  buildActiveDelegations,
  getDirectVoters,
  buildDelegationGraph,
  computeWeights,
  resolveChain,
} from "@votiverse/delegation";
import type { CastVoteParams, TallyResult, VoteRecord, WeightedVote, ParticipationRecord } from "./types.js";
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
   *
   * When the issue has declared choices, the vote is validated:
   * - Single-select (simple-majority, supermajority): choice must be one of the declared options or "abstain".
   * - Ranked-choice: every ranked item must be a declared option.
   * - Approval: every approved item must be a declared option.
   */
  async cast(params: CastVoteParams): Promise<void> {
    if (params.issueChoices) {
      this.validateChoice(params.choice, params.issueChoices);
    }

    // Enforce allowVoteChange — reject re-votes when disabled
    if (!this.config.ballot.allowVoteChange) {
      const existing = await this.eventStore.query({ types: ["VoteCast"] });
      const hasVoted = existing.some(
        (e) => (e as VoteCastEvent).payload.participantId === params.participantId &&
               (e as VoteCastEvent).payload.issueId === params.issueId,
      );
      if (hasVoted) {
        throw new GovernanceRuleViolation(
          "Vote changes are not allowed in this assembly",
          "VOTE_CHANGE_DISABLED",
        );
      }
    }

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
   * Retract a previously cast vote. Records a VoteRetracted event.
   *
   * After retraction, the participant is no longer a direct voter — their
   * delegation chain (if any) becomes active again. Requires allowVoteChange.
   */
  async retract(participantId: ParticipantId, issueId: IssueId): Promise<void> {
    if (!this.config.ballot.allowVoteChange) {
      throw new GovernanceRuleViolation(
        "Vote changes are not allowed in this assembly",
        "VOTE_CHANGE_DISABLED",
      );
    }

    const event = createEvent<VoteRetractedEvent>(
      "VoteRetracted",
      { participantId, issueId },
      generateEventId(),
      now(),
    );

    await this.eventStore.append(event);
  }

  /**
   * Validates that a vote choice is compatible with the issue's declared choices.
   * "abstain" is always accepted.
   */
  private validateChoice(choice: VoteChoice, declaredChoices: readonly string[]): void {
    const allowed = new Set(declaredChoices);

    if (typeof choice === "string") {
      if (choice === "abstain") return;
      if (!allowed.has(choice)) {
        throw new ValidationError(
          "choice",
          `Invalid choice "${choice}". Must be one of: ${declaredChoices.join(", ")}`,
        );
      }
    } else {
      // Array form: ranked-choice or approval — every item must be a declared choice
      for (const item of choice) {
        if (!allowed.has(item)) {
          throw new ValidationError(
            "choice",
            `Invalid choice "${item}" in ranking/approval list. Must be one of: ${declaredChoices.join(", ")}`,
          );
        }
      }
    }
  }

  /**
   * Get all active direct votes for an issue.
   * Excludes votes that were subsequently retracted.
   */
  async getVotes(issueId: IssueId): Promise<readonly VoteRecord[]> {
    const events = await this.eventStore.query({ types: ["VoteCast", "VoteRetracted"] });
    // Use a map to keep only the latest vote per participant; remove on retraction
    const latestVotes = new Map<ParticipantId, VoteRecord>();

    for (const event of events) {
      if (event.type === "VoteCast") {
        const e = event as VoteCastEvent;
        if (e.payload.issueId === issueId) {
          latestVotes.set(e.payload.participantId, {
            participantId: e.payload.participantId,
            issueId: e.payload.issueId,
            choice: e.payload.choice,
          });
        }
      } else if (event.type === "VoteRetracted") {
        const e = event as VoteRetractedEvent;
        if (e.payload.issueId === issueId) {
          latestVotes.delete(e.payload.participantId);
        }
      }
    }

    return [...latestVotes.values()];
  }

  /**
   * Compute the tally for an issue using the configured ballot method.
   *
   * @param issueId - The issue to tally.
   * @param topicId - The topic of the issue (for delegation scope resolution), or null if unscoped.
   * @param eligibleParticipantIds - All eligible participants.
   * @param topicAncestors - Topic hierarchy for scope resolution.
   */
  async tally(
    issueId: IssueId,
    topicId: TopicId | null,
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
      topicId,
      delegations,
      topicAncestors ?? new Map(),
    );
    const weightDist = computeWeights(graph, directVoters, eligibleParticipantIds);

    // Build weighted votes: each direct voter's choice * their effective weight
    const weightedVotes: WeightedVote[] = [];
    for (const vote of votes) {
      const weight = weightDist.weights.get(vote.participantId) ?? 0;
      if (weight > 0) {
        weightedVotes.push({ choice: vote.choice, weight });
      }
    }

    // Get ballot method from config
    const method = createBallotMethod(this.config.ballot.method);

    return method.tally(
      weightedVotes,
      issueId,
      eligibleParticipantIds.size,
      this.config.ballot.quorum,
    );
  }

  /**
   * Compute participation records for all eligible participants on an issue.
   *
   * For each participant, determines whether they voted directly, participated
   * via delegation, or were absent. Includes the effective choice, delegate
   * chain, and terminal voter.
   *
   * @param issueId - The issue to compute participation for.
   * @param topicId - The topic of the issue (for delegation scope resolution), or null if unscoped.
   * @param eligibleParticipantIds - All eligible participants.
   * @param topicAncestors - Topic hierarchy for scope resolution.
   */
  async participation(
    issueId: IssueId,
    topicId: TopicId | null,
    eligibleParticipantIds: ReadonlySet<ParticipantId>,
    topicAncestors?: ReadonlyMap<TopicId, readonly TopicId[]>,
  ): Promise<readonly ParticipationRecord[]> {
    // Get direct votes and build a choice lookup
    const votes = await this.getVotes(issueId);
    const choiceByParticipant = new Map<ParticipantId, VoteChoice>();
    for (const vote of votes) {
      choiceByParticipant.set(vote.participantId, vote.choice);
    }

    const directVoters = await getDirectVoters(this.eventStore, issueId);

    // Build delegation graph (same as tally)
    const delegations = await buildActiveDelegations(this.eventStore);
    const graph = buildDelegationGraph(
      issueId,
      topicId,
      delegations,
      topicAncestors ?? new Map(),
    );

    // Resolve each participant's participation
    const records: ParticipationRecord[] = [];

    for (const pid of eligibleParticipantIds) {
      const resolved = resolveChain(pid, graph, directVoters);

      if (resolved.votedDirectly) {
        records.push({
          participantId: pid,
          issueId,
          status: "direct",
          effectiveChoice: choiceByParticipant.get(pid) ?? null,
          delegateId: null,
          terminalVoterId: pid,
          chain: [],
        });
      } else if (resolved.terminalVoter !== null) {
        // Delegated — chain includes [self, ..., terminalVoter]
        // delegateId is the first hop (chain[1]), chain stored without self
        const chainWithoutSelf = resolved.chain.slice(1);
        records.push({
          participantId: pid,
          issueId,
          status: "delegated",
          effectiveChoice: choiceByParticipant.get(resolved.terminalVoter) ?? null,
          delegateId: chainWithoutSelf[0] ?? null,
          terminalVoterId: resolved.terminalVoter,
          chain: chainWithoutSelf,
        });
      } else {
        // Absent — no vote, no delegation reaching a voter
        records.push({
          participantId: pid,
          issueId,
          status: "absent",
          effectiveChoice: null,
          delegateId: null,
          terminalVoterId: null,
          chain: [],
        });
      }
    }

    return records;
  }
}
