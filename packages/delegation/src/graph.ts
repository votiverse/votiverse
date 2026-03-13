/**
 * @votiverse/delegation — Graph construction and resolution
 *
 * Builds the delegation graph for a given issue from the event log.
 * Implements scope resolution, override rule, cycle detection, and
 * weight computation per Appendix C of the whitepaper.
 */

import type {
  EventStore,
  ParticipantId,
  TopicId,
  IssueId,
  DelegationId,
  Timestamp,
  DelegationCreatedEvent,
  DelegationRevokedEvent,
  VoteCastEvent,
} from "@votiverse/core";
import type {
  Delegation,
  DelegationEdge,
  DelegationGraph,
  WeightDistribution,
  DelegationChain,
  ConcentrationMetrics,
} from "./types.js";

// ---------------------------------------------------------------------------
// Build active delegations from event log
// ---------------------------------------------------------------------------

/**
 * Replays the event log to build the current set of active delegations.
 */
export async function buildActiveDelegations(
  eventStore: EventStore,
  before?: Timestamp,
): Promise<Delegation[]> {
  const events = await eventStore.query({
    types: ["DelegationCreated", "DelegationRevoked"],
    ...(before !== undefined ? { before } : {}),
  });

  const delegations = new Map<DelegationId, Delegation>();

  for (const event of events) {
    if (event.type === "DelegationCreated") {
      const e = event as DelegationCreatedEvent;
      delegations.set(e.payload.delegationId, {
        id: e.payload.delegationId,
        sourceId: e.payload.sourceId,
        targetId: e.payload.targetId,
        topicScope: e.payload.topicScope,
        createdAt: e.timestamp,
        active: true,
      });
    } else if (event.type === "DelegationRevoked") {
      const e = event as DelegationRevokedEvent;
      delegations.delete(e.payload.delegationId);
    }
  }

  return [...delegations.values()].filter((d) => d.active);
}

/**
 * Get the set of participants who cast a direct vote on an issue.
 */
export async function getDirectVoters(
  eventStore: EventStore,
  issueId: IssueId,
  before?: Timestamp,
): Promise<Set<ParticipantId>> {
  const events = await eventStore.query({
    types: ["VoteCast"],
    ...(before !== undefined ? { before } : {}),
  });

  const voters = new Set<ParticipantId>();
  for (const event of events) {
    const e = event as VoteCastEvent;
    if (e.payload.issueId === issueId) {
      voters.add(e.payload.participantId);
    }
  }
  return voters;
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

/**
 * Given an issue's topics and a participant's active delegations,
 * determines which delegation has precedence.
 *
 * Rules (from whitepaper Section 5.5):
 * 1. A delegation is active for an issue if any of its topic scope
 *    overlaps with the issue's topics.
 * 2. More specific scope (more matching topics) wins.
 * 3. If equal specificity, most recently created wins.
 *
 * @param issueTopics - The topics of the issue being resolved.
 * @param delegations - All active delegations from a single source participant.
 * @param topicAncestors - Map from topicId to all its ancestor topic IDs (for hierarchy).
 * @returns The winning delegation, or undefined if none apply.
 */
export function resolveDelegationForIssue(
  issueTopics: readonly TopicId[],
  delegations: readonly Delegation[],
  topicAncestors: ReadonlyMap<TopicId, readonly TopicId[]>,
): Delegation | undefined {
  // Expand issue topics to include ancestors for matching
  const issueTopicSet = new Set<TopicId>(issueTopics);
  for (const topicId of issueTopics) {
    const ancestors = topicAncestors.get(topicId);
    if (ancestors) {
      for (const ancestor of ancestors) {
        issueTopicSet.add(ancestor);
      }
    }
  }

  let best: Delegation | undefined = undefined;
  let bestSpecificity = -1;

  for (const delegation of delegations) {
    // Check if this delegation is active for the issue
    const matchingTopics = delegation.topicScope.filter((t) => issueTopicSet.has(t));

    if (matchingTopics.length === 0) {
      // If delegation has empty scope, treat as global (matches everything)
      if (delegation.topicScope.length === 0) {
        const specificity = 0;
        if (
          specificity > bestSpecificity ||
          (specificity === bestSpecificity &&
            best !== undefined &&
            delegation.createdAt > best.createdAt)
        ) {
          best = delegation;
          bestSpecificity = specificity;
        }
      }
      continue;
    }

    // Specificity = number of matching topics that are also in the issue's
    // direct topic set (not ancestor matches). More specific = higher.
    const directMatches = matchingTopics.filter((t) => issueTopics.includes(t));
    const specificity = directMatches.length > 0 ? directMatches.length : 0.5;

    if (
      specificity > bestSpecificity ||
      (specificity === bestSpecificity &&
        best !== undefined &&
        delegation.createdAt > best.createdAt)
    ) {
      best = delegation;
      bestSpecificity = specificity;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Builds the delegation graph for a specific issue.
 *
 * From Appendix C: G_i = (P, E_i) where each participant has at most
 * one outgoing edge (the highest-precedence active delegation).
 *
 * The override rule is NOT applied here — it's applied during weight
 * computation. The raw graph includes edges even for direct voters.
 */
export function buildDelegationGraph(
  issueId: IssueId,
  issueTopics: readonly TopicId[],
  activeDelegations: readonly Delegation[],
  topicAncestors: ReadonlyMap<TopicId, readonly TopicId[]>,
): DelegationGraph {
  // Group delegations by source
  const bySource = new Map<ParticipantId, Delegation[]>();
  for (const delegation of activeDelegations) {
    const existing = bySource.get(delegation.sourceId);
    if (existing) {
      existing.push(delegation);
    } else {
      bySource.set(delegation.sourceId, [delegation]);
    }
  }

  // Resolve each source to their best delegation for this issue
  const edges: DelegationEdge[] = [];
  const adjacency = new Map<ParticipantId, ParticipantId>();

  for (const [sourceId, delegations] of bySource) {
    const best = resolveDelegationForIssue(issueTopics, delegations, topicAncestors);
    if (best) {
      edges.push({
        sourceId,
        targetId: best.targetId,
        delegationId: best.id,
      });
      adjacency.set(sourceId, best.targetId);
    }
  }

  // Detect cycles using color-based DFS
  const cycleParticipants = detectCycles(adjacency);

  return { issueId, edges, cycleParticipants };
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

/**
 * Detects cycles in the delegation graph using iterative path-following.
 * Returns the set of participants involved in cycles.
 */
function detectCycles(adjacency: ReadonlyMap<ParticipantId, ParticipantId>): Set<ParticipantId> {
  const cycleMembers = new Set<ParticipantId>();
  const visited = new Set<ParticipantId>();

  for (const startNode of adjacency.keys()) {
    if (visited.has(startNode)) continue;

    // Follow the chain from startNode, recording the path
    const path: ParticipantId[] = [];
    const pathSet = new Set<ParticipantId>();
    let current: ParticipantId | undefined = startNode;

    while (current !== undefined && !visited.has(current)) {
      if (pathSet.has(current)) {
        // Found a cycle — mark all members from current back to current
        const cycleStart = path.indexOf(current);
        for (let i = cycleStart; i < path.length; i++) {
          cycleMembers.add(path[i]!);
        }
        break;
      }

      path.push(current);
      pathSet.add(current);
      current = adjacency.get(current);
    }

    // Mark all nodes in this path as visited
    for (const node of path) {
      visited.add(node);
    }
  }

  return cycleMembers;
}

// ---------------------------------------------------------------------------
// Weight computation
// ---------------------------------------------------------------------------

/**
 * Computes the effective voting weight for all participants on a given issue.
 *
 * From Appendix C, Section C.4:
 *   w(p, i) = 1 + sum of w(q, i) for all q that delegate directly to p
 *
 * The override rule: if p voted directly, the edge (p, target) is removed.
 * Cycle members who did not vote directly have weight 0.
 */
export function computeWeights(
  graph: DelegationGraph,
  directVoters: ReadonlySet<ParticipantId>,
  allParticipants: ReadonlySet<ParticipantId>,
): WeightDistribution {
  // Build pruned adjacency: remove edges where source is a direct voter
  // (override rule) and remove edges involving cycle members who didn't vote
  const prunedEdges = new Map<ParticipantId, ParticipantId>();
  const incomingEdges = new Map<ParticipantId, ParticipantId[]>();

  for (const edge of graph.edges) {
    // Override rule: if source voted directly, skip this edge
    if (directVoters.has(edge.sourceId)) {
      continue;
    }

    // If source is in a cycle and didn't vote, skip (abstained)
    if (graph.cycleParticipants.has(edge.sourceId)) {
      continue;
    }

    prunedEdges.set(edge.sourceId, edge.targetId);

    const existing = incomingEdges.get(edge.targetId);
    if (existing) {
      existing.push(edge.sourceId);
    } else {
      incomingEdges.set(edge.targetId, [edge.sourceId]);
    }
  }

  // Compute weights via bottom-up traversal.
  // For each direct voter, their weight = 1 + weight contributed by their delegators.
  const weights = new Map<ParticipantId, number>();

  // Recursive weight computation with memoization
  function computeWeight(participantId: ParticipantId): number {
    const cached = weights.get(participantId);
    if (cached !== undefined) return cached;

    // A participant has weight > 0 only if:
    // 1. They voted directly, OR
    // 2. They are the terminal voter for a delegation chain that reaches a direct voter

    // Follow chain from this participant to find terminal voter
    if (!directVoters.has(participantId)) {
      // This participant didn't vote directly.
      // If they delegate to someone, their weight goes to that someone.
      // They themselves have weight 0 (their contribution is counted at the terminal).
      const target = prunedEdges.get(participantId);
      if (target !== undefined) {
        // Weight flows to target — this participant contributes to target's weight
        weights.set(participantId, 0);
        return 0;
      }
      // No delegation, didn't vote — abstained, weight 0
      weights.set(participantId, 0);
      return 0;
    }

    // Direct voter: weight = 1 + sum of weight from all delegators
    let weight = 1;
    const delegators = incomingEdges.get(participantId);
    if (delegators) {
      for (const delegator of delegators) {
        weight += countSubtree(delegator);
      }
    }

    weights.set(participantId, weight);
    return weight;
  }

  /**
   * Count the size of the subtree rooted at this participant (including self).
   * This participant is a delegator — their weight contribution is 1 + their subtree.
   */
  function countSubtree(participantId: ParticipantId): number {
    let count = 1; // This participant contributes 1 unit of weight
    const delegators = incomingEdges.get(participantId);
    if (delegators) {
      for (const delegator of delegators) {
        count += countSubtree(delegator);
      }
    }
    return count;
  }

  // Compute weights for all participants
  for (const pid of allParticipants) {
    computeWeight(pid);
  }

  // Calculate total weight
  let totalWeight = 0;
  for (const w of weights.values()) {
    totalWeight += w;
  }

  return {
    issueId: graph.issueId,
    weights,
    totalWeight,
  };
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the delegation chain for a specific participant on a specific issue.
 */
export function resolveChain(
  participantId: ParticipantId,
  graph: DelegationGraph,
  directVoters: ReadonlySet<ParticipantId>,
): DelegationChain {
  // If the participant voted directly, chain is just themselves
  if (directVoters.has(participantId)) {
    return {
      participantId,
      issueId: graph.issueId,
      chain: [participantId],
      terminalVoter: participantId,
      votedDirectly: true,
    };
  }

  // Build adjacency from edges
  const adjacency = new Map<ParticipantId, ParticipantId>();
  for (const edge of graph.edges) {
    adjacency.set(edge.sourceId, edge.targetId);
  }

  // Follow the chain
  const chain: ParticipantId[] = [participantId];
  const visited = new Set<ParticipantId>([participantId]);
  let current: ParticipantId | undefined = adjacency.get(participantId);

  while (current !== undefined && !visited.has(current)) {
    chain.push(current);
    if (directVoters.has(current)) {
      // Found a terminal voter
      return {
        participantId,
        issueId: graph.issueId,
        chain,
        terminalVoter: current,
        votedDirectly: false,
      };
    }
    visited.add(current);
    current = adjacency.get(current);
  }

  // Chain ends without reaching a direct voter (abstained or cycle)
  if (current !== undefined && visited.has(current)) {
    // Cycle detected
    return {
      participantId,
      issueId: graph.issueId,
      chain,
      terminalVoter: null,
      votedDirectly: false,
    };
  }

  // Delegation doesn't reach a voter
  return {
    participantId,
    issueId: graph.issueId,
    chain,
    terminalVoter: null,
    votedDirectly: false,
  };
}

// ---------------------------------------------------------------------------
// Concentration metrics
// ---------------------------------------------------------------------------

/**
 * Computes concentration metrics for a weight distribution.
 */
export function computeConcentrationMetrics(
  distribution: WeightDistribution,
  graph: DelegationGraph,
  directVoters: ReadonlySet<ParticipantId>,
): ConcentrationMetrics {
  const weights = [...distribution.weights.entries()].filter(([_, w]) => w > 0);

  // Gini coefficient
  const gini = computeGini(weights.map(([_, w]) => w));

  // Max weight
  let maxWeight = 0;
  let maxWeightHolder: ParticipantId | null = null;
  for (const [pid, w] of weights) {
    if (w > maxWeight) {
      maxWeight = w;
      maxWeightHolder = pid;
    }
  }

  // Chain length distribution
  const chainLengths = new Map<number, number>();
  const adjacency = new Map<ParticipantId, ParticipantId>();
  for (const edge of graph.edges) {
    if (!directVoters.has(edge.sourceId)) {
      adjacency.set(edge.sourceId, edge.targetId);
    }
  }

  // Count delegating participants and direct voters
  let delegatingCount = 0;
  for (const edge of graph.edges) {
    if (!directVoters.has(edge.sourceId)) {
      delegatingCount++;
    }
  }

  return {
    issueId: distribution.issueId,
    giniCoefficient: gini,
    maxWeight,
    maxWeightHolder,
    chainLengthDistribution: chainLengths,
    delegatingCount,
    directVoterCount: directVoters.size,
  };
}

/**
 * Computes the Gini coefficient for a set of values.
 * Returns 0 for empty input or single value.
 */
function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  let weightedSum = 0;

  for (let i = 0; i < n; i++) {
    sum += sorted[i]!;
    weightedSum += (i + 1) * sorted[i]!;
  }

  if (sum === 0) return 0;

  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}
