/**
 * @votiverse/delegation — Type definitions
 *
 * Types for delegation graph management, resolution, and weight computation.
 */

import type {
  ParticipantId,
  TopicId,
  IssueId,
  DelegationId,
  Timestamp,
} from "@votiverse/core";

// ---------------------------------------------------------------------------
// Delegation entity
// ---------------------------------------------------------------------------

/**
 * A delegation: participant A assigns their voting power on some topic scope
 * to participant B. From the formal model (Appendix C):
 *   d = (source, target, scope)
 */
export interface Delegation {
  readonly id: DelegationId;
  readonly sourceId: ParticipantId;
  readonly targetId: ParticipantId;
  readonly topicScope: readonly TopicId[];
  readonly createdAt: Timestamp;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// Graph types
// ---------------------------------------------------------------------------

/**
 * An edge in the delegation graph for a specific issue.
 * Each participant has at most one outgoing edge per issue
 * (the highest-precedence active delegation).
 */
export interface DelegationEdge {
  readonly sourceId: ParticipantId;
  readonly targetId: ParticipantId;
  readonly delegationId: DelegationId;
}

/**
 * The delegation graph for a specific issue, after scope resolution.
 * From Appendix C: G_i = (P, E_i)
 */
export interface DelegationGraph {
  readonly issueId: IssueId;
  /** Edges in the graph (source → target). One per participant max. */
  readonly edges: readonly DelegationEdge[];
  /** Participants who are in delegation cycles (if any). */
  readonly cycleParticipants: ReadonlySet<ParticipantId>;
}

// ---------------------------------------------------------------------------
// Weight distribution
// ---------------------------------------------------------------------------

/**
 * The effective voting weights for all participants on a specific issue.
 * From Appendix C: w(p, i) for all p in P.
 */
export interface WeightDistribution {
  readonly issueId: IssueId;
  /** Maps participant → effective weight. Only includes participants with weight > 0. */
  readonly weights: ReadonlyMap<ParticipantId, number>;
  /** Total weight distributed (should equal number of participating voters). */
  readonly totalWeight: number;
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

/**
 * The full delegation chain from a participant to their terminal voter.
 */
export interface DelegationChain {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  /** The chain of participant IDs, from source to terminal voter. */
  readonly chain: readonly ParticipantId[];
  /** The terminal voter (last in chain), or null if the chain is unresolved (cycle/abstain). */
  readonly terminalVoter: ParticipantId | null;
  /** Whether the participant voted directly. */
  readonly votedDirectly: boolean;
}

// ---------------------------------------------------------------------------
// Concentration metrics
// ---------------------------------------------------------------------------

/**
 * Metrics about the concentration of voting weight for an issue.
 */
export interface ConcentrationMetrics {
  readonly issueId: IssueId;
  /** Gini coefficient of weight distribution (0 = perfect equality, 1 = total inequality). */
  readonly giniCoefficient: number;
  /** The maximum weight held by any single participant. */
  readonly maxWeight: number;
  /** The participant with the maximum weight. */
  readonly maxWeightHolder: ParticipantId | null;
  /** Distribution of chain lengths. Maps length → count. */
  readonly chainLengthDistribution: ReadonlyMap<number, number>;
  /** Total number of participants with active delegations. */
  readonly delegatingCount: number;
  /** Total number of participants voting directly. */
  readonly directVoterCount: number;
}

// ---------------------------------------------------------------------------
// CRUD params
// ---------------------------------------------------------------------------

export interface CreateDelegationParams {
  readonly sourceId: ParticipantId;
  readonly targetId: ParticipantId;
  readonly topicScope: readonly TopicId[];
}

export interface RevokeDelegationParams {
  readonly sourceId: ParticipantId;
  readonly topicScope: readonly TopicId[];
}
