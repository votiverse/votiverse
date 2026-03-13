/**
 * @votiverse/simulate — Public API
 *
 * Rule-based simulation framework for stress-testing governance configurations.
 */

// Types
export type {
  SimulationScenario,
  TopicDefinition,
  EngagementPattern,
  TrustHeuristic,
  ForecastingAbility,
  AdversarialStrategy,
  AgentProfile,
  PopulationSpec,
  VotingEventSpec,
  IssueSpec,
  GroundTruthSpec,
  GroundTruthTopic,
  SimulatedAgent,
  SimulationScript,
  SimulationAction,
  RegisterParticipantAction,
  CreateTopicAction,
  CreateVotingEventAction,
  DelegateAction,
  VoteAction,
  PollRespondAction,
  CommitPredictionAction,
  RecordOutcomeAction,
  ConcentrationSnapshot,
  PredictionAccuracyEntry,
  SimulationResults,
} from "./types.js";

// Generation
export { generateScript, computeGroundTruthAtEvent } from "./generate.js";

// Playback
export { playback } from "./playback.js";

// Top-level runner
export type { SimulationRunResult } from "./simulate.js";
export { runSimulation } from "./simulate.js";

// Random
export type { Rng } from "./random.js";
export { createRng } from "./random.js";
