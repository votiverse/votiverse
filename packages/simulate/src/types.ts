/**
 * @votiverse/simulate — Type definitions
 *
 * The simulation framework has two phases:
 *   1. Generation: produce a deterministic action script from agent profiles
 *   2. Playback: feed the script into the real engine, event by event
 *
 * All types are serializable (JSON-compatible) so scenarios and scripts
 * can be saved, shared, versioned, and replayed.
 */

import type { GovernanceConfig, PresetName } from "@votiverse/config";
import type { PredictionClaim } from "@votiverse/prediction";

// ---------------------------------------------------------------------------
// Scenario definition
// ---------------------------------------------------------------------------

/**
 * Complete specification of a simulation run.
 * Everything needed to reproduce a simulation is captured here.
 */
export interface SimulationScenario {
  readonly name: string;
  readonly description: string;
  /** Deterministic random seed. Same seed = same script = same results. */
  readonly seed: number;
  /** Governance configuration: a preset name or a full config object. */
  readonly config: GovernanceConfig | PresetName;
  /** Topic taxonomy to create. */
  readonly topics: readonly TopicDefinition[];
  /** Agent population specification. */
  readonly population: PopulationSpec;
  /** Voting events to run. */
  readonly votingEvents: readonly VotingEventSpec[];
  /** The "reality" that surveys sense and predictions try to forecast. */
  readonly groundTruth: GroundTruthSpec;
}

export interface TopicDefinition {
  readonly name: string;
  readonly parent?: string;
}

// ---------------------------------------------------------------------------
// Agent profiles
// ---------------------------------------------------------------------------

/** How an agent participates in governance. */
export type EngagementPattern =
  | "active-deliberator"
  | "selective-engager"
  | "pure-delegator"
  | "pure-sensor";

/** How an agent selects delegates. */
export type TrustHeuristic = "highest-track-record" | "most-active" | "random" | "topic-expert";

/** How well an agent forecasts outcomes. */
export type ForecastingAbility = "good" | "average" | "poor";

/** Adversarial strategies an agent may employ. */
export type AdversarialStrategy = "vote-harvester" | "vague-predictor" | "coordinated-capture";

/**
 * Behavioral profile for a simulated agent.
 * Profiles are plain data — no methods, fully serializable.
 */
export interface AgentProfile {
  /** How the agent participates: votes directly, delegates, just senses, etc. */
  readonly engagement: EngagementPattern;
  /** Topics this agent cares about. Indices into scenario.topics. */
  readonly topicInterests: readonly string[];
  /** How the agent picks delegates. */
  readonly trustHeuristic: TrustHeuristic;
  /** How accurately the agent predicts outcomes. */
  readonly forecastingAbility: ForecastingAbility;
  /** How accurately the agent reports ground truth in surveys (0-1). */
  readonly surveyReliability: number;
  /** Optional adversarial strategy. */
  readonly adversarial?: AdversarialStrategy;
}

/**
 * Specification for the agent population.
 * Either explicit profiles or a distribution to generate from.
 */
export interface PopulationSpec {
  /** Total number of agents. */
  readonly count: number;
  /** Distribution of engagement patterns. Fractions must sum to ~1. */
  readonly engagementDistribution: Readonly<Record<EngagementPattern, number>>;
  /** Distribution of forecasting abilities. */
  readonly forecastingDistribution: Readonly<Record<ForecastingAbility, number>>;
  /** Fraction of agents that are adversarial (0-1). */
  readonly adversarialFraction: number;
  /** Adversarial strategy to use. */
  readonly adversarialStrategy?: AdversarialStrategy;
}

// ---------------------------------------------------------------------------
// Voting event specification
// ---------------------------------------------------------------------------

export interface VotingEventSpec {
  readonly title: string;
  readonly issues: readonly IssueSpec[];
}

export interface IssueSpec {
  readonly title: string;
  /** Topic names this issue falls under. */
  readonly topics: readonly string[];
  /** Ground truth direction for this issue (does the policy work?). */
  readonly groundTruthOutcome: boolean;
}

// ---------------------------------------------------------------------------
// Ground truth
// ---------------------------------------------------------------------------

/**
 * Defines the "reality" that surveys sense and predictions forecast.
 * Each topic has a numeric value that evolves over the simulation.
 */
export interface GroundTruthSpec {
  readonly topics: Readonly<Record<string, GroundTruthTopic>>;
}

export interface GroundTruthTopic {
  /** Starting value. */
  readonly baseValue: number;
  /** Direction of change over time. */
  readonly trajectory: "improving" | "stable" | "worsening";
  /** Rate of change per voting event. */
  readonly changeRate: number;
}

// ---------------------------------------------------------------------------
// Generated simulation script (output of generation phase)
// ---------------------------------------------------------------------------

/** A named agent with an assigned profile. */
export interface SimulatedAgent {
  readonly name: string;
  readonly profile: AgentProfile;
}

/**
 * The complete generated action sequence. Serializable as JSON.
 * This is the "fixture" that can be saved, shared, and replayed.
 */
export interface SimulationScript {
  readonly scenario: SimulationScenario;
  readonly agents: readonly SimulatedAgent[];
  readonly actions: readonly SimulationAction[];
}

/** Discriminated union of all simulation actions. */
export type SimulationAction =
  | RegisterParticipantAction
  | CreateTopicAction
  | CreateVotingEventAction
  | DelegateAction
  | VoteAction
  | SurveyRespondAction
  | CommitPredictionAction
  | RecordOutcomeAction;

export interface RegisterParticipantAction {
  readonly type: "register-participant";
  readonly name: string;
}

export interface CreateTopicAction {
  readonly type: "create-topic";
  readonly name: string;
  readonly parentName?: string;
}

export interface CreateVotingEventAction {
  readonly type: "create-voting-event";
  readonly title: string;
  readonly issues: readonly { title: string; topicNames: readonly string[] }[];
}

export interface DelegateAction {
  readonly type: "delegate";
  readonly sourceName: string;
  readonly targetName: string;
  readonly topicNames: readonly string[];
}

export interface VoteAction {
  readonly type: "vote";
  readonly participantName: string;
  readonly eventIndex: number;
  readonly issueIndex: number;
  readonly choice: string;
}

export interface SurveyRespondAction {
  readonly type: "survey-respond";
  readonly participantName: string;
  readonly eventIndex: number;
  readonly answers: readonly { questionText: string; value: number | string | boolean }[];
}

export interface CommitPredictionAction {
  readonly type: "commit-prediction";
  readonly participantName: string;
  readonly eventIndex: number;
  readonly issueIndex: number;
  readonly claim: PredictionClaim;
}

export interface RecordOutcomeAction {
  readonly type: "record-outcome";
  readonly eventIndex: number;
  readonly issueIndex: number;
  readonly measuredValue: number | boolean;
}

// ---------------------------------------------------------------------------
// Simulation results (output of playback phase)
// ---------------------------------------------------------------------------

export interface ConcentrationSnapshot {
  readonly eventIndex: number;
  readonly giniCoefficient: number;
  readonly maxWeight: number;
  readonly maxWeightHolder: string;
}

export interface PredictionAccuracyEntry {
  readonly agentName: string;
  readonly forecastingAbility: ForecastingAbility;
  readonly averageAccuracy: number;
  readonly predictionCount: number;
}

export interface SimulationResults {
  readonly scenarioName: string;
  readonly agentCount: number;
  readonly eventCount: number;
  /** Concentration metrics after each voting event. */
  readonly concentrationOverTime: readonly ConcentrationSnapshot[];
  /** Prediction accuracy per agent. */
  readonly predictionAccuracies: readonly PredictionAccuracyEntry[];
  /** Total actions played. */
  readonly actionCount: number;
}
