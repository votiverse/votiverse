/**
 * @votiverse/delegation — Public API
 *
 * Delegation graph management, resolution, weight computation,
 * and concentration metrics.
 */

// Types
export type {
  Delegation,
  DelegationEdge,
  DelegationGraph,
  WeightDistribution,
  DelegationChain,
  ConcentrationMetrics,
  CreateDelegationParams,
  RevokeDelegationParams,
} from "./types.js";

// Graph functions
export {
  buildActiveDelegations,
  getDirectVoters,
  resolveDelegationForIssue,
  buildDelegationGraph,
  computeWeights,
  resolveChain,
  computeConcentrationMetrics,
} from "./graph.js";

// Service
export { DelegationService } from "./delegation-service.js";
