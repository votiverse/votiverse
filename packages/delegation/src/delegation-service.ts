/**
 * @votiverse/delegation — DelegationService
 *
 * High-level service for delegation CRUD and graph queries.
 * Reads from and writes to the event store.
 */

import type {
  EventStore,
  ParticipantId,
  TopicId,
  IssueId,
  DelegationCreatedEvent,
  DelegationRevokedEvent,
} from "@votiverse/core";
import {
  createEvent,
  generateDelegationId,
  generateEventId,
  now,
  ValidationError,
} from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import type {
  Delegation,
  CreateDelegationParams,
  RevokeDelegationParams,
  DelegationGraph,
  WeightDistribution,
  DelegationChain,
  ConcentrationMetrics,
} from "./types.js";
import {
  buildActiveDelegations,
  getDirectVoters,
  buildDelegationGraph,
  computeWeights,
  resolveChain,
  computeConcentrationMetrics,
} from "./graph.js";

/**
 * Service for managing delegations and computing delegation graphs.
 */
export class DelegationService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
  ) {}

  /**
   * Creates a new delegation from source to target on the given topic scope.
   */
  async create(params: CreateDelegationParams): Promise<Delegation> {
    if (!this.config.delegation.enabled) {
      throw new ValidationError(
        "delegation",
        "Delegation is disabled in the current configuration",
      );
    }

    if (params.sourceId === params.targetId) {
      throw new ValidationError(
        "targetId",
        "Cannot delegate to yourself",
      );
    }

    // Check max delegates per participant
    if (this.config.delegation.maxDelegatesPerParticipant !== null) {
      const active = await buildActiveDelegations(this.eventStore);
      const existingDelegations = active.filter(
        (d) => d.sourceId === params.sourceId,
      );
      if (
        existingDelegations.length >=
        this.config.delegation.maxDelegatesPerParticipant
      ) {
        throw new ValidationError(
          "delegation",
          `Maximum ${this.config.delegation.maxDelegatesPerParticipant} delegation(s) per participant exceeded`,
        );
      }
    }

    const delegationId = generateDelegationId();
    const timestamp = now();

    const event = createEvent<DelegationCreatedEvent>(
      "DelegationCreated",
      {
        delegationId,
        sourceId: params.sourceId,
        targetId: params.targetId,
        topicScope: params.topicScope,
      },
      generateEventId(),
      timestamp,
    );

    await this.eventStore.append(event);

    return {
      id: delegationId,
      sourceId: params.sourceId,
      targetId: params.targetId,
      topicScope: params.topicScope,
      createdAt: timestamp,
      active: true,
    };
  }

  /**
   * Revokes a delegation from source on the given topic scope.
   * Finds the matching active delegation and records a revocation event.
   */
  async revoke(params: RevokeDelegationParams): Promise<void> {
    const active = await buildActiveDelegations(this.eventStore);
    const matching = active.find(
      (d) =>
        d.sourceId === params.sourceId &&
        topicScopeMatches(d.topicScope, params.topicScope),
    );

    if (!matching) {
      throw new ValidationError(
        "delegation",
        "No matching active delegation found to revoke",
      );
    }

    const event = createEvent<DelegationRevokedEvent>(
      "DelegationRevoked",
      {
        delegationId: matching.id,
        sourceId: params.sourceId,
        topicScope: params.topicScope,
      },
      generateEventId(),
      now(),
    );

    await this.eventStore.append(event);
  }

  /**
   * Lists all active delegations, optionally filtered by source participant.
   */
  async listActive(sourceId?: ParticipantId): Promise<readonly Delegation[]> {
    const all = await buildActiveDelegations(this.eventStore);
    if (sourceId !== undefined) {
      return all.filter((d) => d.sourceId === sourceId);
    }
    return all;
  }

  /**
   * Builds the delegation graph for an issue.
   */
  async buildGraph(
    issueId: IssueId,
    issueTopics: readonly TopicId[],
    topicAncestors?: ReadonlyMap<TopicId, readonly TopicId[]>,
  ): Promise<DelegationGraph> {
    const delegations = await buildActiveDelegations(this.eventStore);
    return buildDelegationGraph(
      issueId,
      issueTopics,
      delegations,
      topicAncestors ?? new Map(),
    );
  }

  /**
   * Computes the weight distribution for an issue.
   */
  async computeWeights(
    issueId: IssueId,
    issueTopics: readonly TopicId[],
    allParticipants: ReadonlySet<ParticipantId>,
    topicAncestors?: ReadonlyMap<TopicId, readonly TopicId[]>,
  ): Promise<WeightDistribution> {
    const graph = await this.buildGraph(
      issueId,
      issueTopics,
      topicAncestors,
    );
    const directVoters = await getDirectVoters(this.eventStore, issueId);
    return computeWeights(graph, directVoters, allParticipants);
  }

  /**
   * Resolves the delegation chain for a participant on an issue.
   */
  async resolveChain(
    participantId: ParticipantId,
    issueId: IssueId,
    issueTopics: readonly TopicId[],
    topicAncestors?: ReadonlyMap<TopicId, readonly TopicId[]>,
  ): Promise<DelegationChain> {
    const graph = await this.buildGraph(
      issueId,
      issueTopics,
      topicAncestors,
    );
    const directVoters = await getDirectVoters(this.eventStore, issueId);
    return resolveChain(participantId, graph, directVoters);
  }

  /**
   * Computes concentration metrics for an issue.
   */
  async computeConcentration(
    issueId: IssueId,
    issueTopics: readonly TopicId[],
    allParticipants: ReadonlySet<ParticipantId>,
    topicAncestors?: ReadonlyMap<TopicId, readonly TopicId[]>,
  ): Promise<ConcentrationMetrics> {
    const graph = await this.buildGraph(
      issueId,
      issueTopics,
      topicAncestors,
    );
    const directVoters = await getDirectVoters(this.eventStore, issueId);
    const weights = computeWeights(graph, directVoters, allParticipants);
    return computeConcentrationMetrics(weights, graph, directVoters);
  }
}

function topicScopeMatches(
  a: readonly TopicId[],
  b: readonly TopicId[],
): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((t) => setA.has(t));
}
