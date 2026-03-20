/**
 * @votiverse/config — GovernanceConfig type definitions
 *
 * The complete configuration schema covering delegation primitives,
 * ballot parameters, feature toggles, and thresholds.
 */

// ---------------------------------------------------------------------------
// Delegation configuration
// ---------------------------------------------------------------------------

/** Controls who can see delegation graph edges. */
export interface DelegationVisibilityConfig {
  /** 'public' = all edges visible to all; 'private' = only own edges visible. */
  readonly mode: "public" | "private";
  /**
   * What a delegate can see about who delegated to them.
   * 'direct' = only direct delegators; 'chain' = full upstream chain.
   */
  readonly incomingVisibility: "direct" | "chain";
}

/**
 * Controls who appears in the delegate discovery interface.
 * - 'open': anyone can receive delegations, all members shown in discovery.
 * - 'candidacy': only declared candidates with profiles are featured in discovery,
 *   but any member can still be found via direct search/nomination.
 * - 'none': delegation is disabled entirely.
 */
export type DelegationMode = "open" | "candidacy" | "none";

/** Controls how voting power delegation works. */
export interface DelegationConfig {
  /** Delegation mode: 'open', 'candidacy', or 'none' (disabled). */
  readonly delegationMode: DelegationMode;
  /** Whether delegations can be scoped to specific topics. */
  readonly topicScoped: boolean;
  /** Whether delegation chains are transitive (A→B→C means C carries A's weight). */
  readonly transitive: boolean;
  /** Whether delegations can be revoked at any time before voting closes. */
  readonly revocableAnytime: boolean;
  /** Maximum number of delegates a participant can assign. null = unlimited. */
  readonly maxDelegatesPerParticipant: number | null;
  /** Maximum delegation age in milliseconds. null = never expires. */
  readonly maxAge: number | null;
  /** Visibility settings for delegation graph edges. */
  readonly visibility: DelegationVisibilityConfig;
}

// ---------------------------------------------------------------------------
// Ballot configuration
// ---------------------------------------------------------------------------

/** Ballot secrecy options. */
export type BallotSecrecy = "secret" | "public" | "anonymous-auditable";

/** Visibility of how delegates voted. */
export type DelegateVoteVisibility = "public" | "delegators-only" | "private";

/** Available voting methods. */
export type VotingMethod = "simple-majority" | "supermajority" | "ranked-choice" | "approval";

/** How participation is enforced. */
export type ParticipationMode = "voluntary" | "mandatory" | "mandatory-with-delegation";

/** When vote tallies become visible. */
export type ResultsVisibility = "sealed" | "live";

/** Controls the voting mechanism and ballot parameters. */
export interface BallotConfig {
  /** How ballot secrecy is handled. */
  readonly secrecy: BallotSecrecy;
  /** Visibility of delegate votes to various audiences. */
  readonly delegateVoteVisibility: DelegateVoteVisibility;
  /** The voting method used to determine outcomes. */
  readonly votingMethod: VotingMethod;
  /** Supermajority threshold (0-1). Only relevant when votingMethod is "supermajority". */
  readonly supermajorityThreshold: number;
  /** Minimum participation percentage (0-1) for a vote to be valid. */
  readonly quorum: number;
  /** How participation is enforced. */
  readonly participationMode: ParticipationMode;
  /** When tally results are visible: 'sealed' = after voting ends, 'live' = real-time. */
  readonly resultsVisibility: ResultsVisibility;
  /** Whether participants can change their vote during the open voting period. */
  readonly allowVoteChange: boolean;
}

// ---------------------------------------------------------------------------
// Feature toggles
// ---------------------------------------------------------------------------

/** How strongly predictions are required on proposals. */
export type PredictionRequirement = "disabled" | "optional" | "encouraged" | "mandatory";

/** How intensively the awareness layer monitors governance activity. */
export type AwarenessIntensity = "minimal" | "standard" | "aggressive";

/** Anonymity of survey/poll responses in aggregate results. */
export type SurveyResponseAnonymity = "anonymous" | "visible";

/** Controls which features are active in the governance instance. */
export interface FeatureConfig {
  /** Whether and how predictions are required on proposals. */
  readonly predictions: PredictionRequirement;
  /** Whether community notes are enabled. */
  readonly communityNotes: boolean;
  /**
   * Fraction of evaluating participants who must endorse a community note
   * for it to be prominently displayed (0.0–1.0). Default: 0.3.
   */
  readonly noteVisibilityThreshold: number;
  /**
   * Minimum number of evaluations before the visibility threshold applies.
   * Notes below this count are shown with a "not yet evaluated" indicator. Default: 3.
   */
  readonly noteMinEvaluations: number;
  /** Whether participant surveys are enabled. */
  readonly surveys: boolean;
  /** Anonymity of survey/poll responses in aggregate results. */
  readonly surveyResponseAnonymity: SurveyResponseAnonymity;
  /** Intensity of the governance awareness layer. */
  readonly awarenessIntensity: AwarenessIntensity;
  /** Whether blockchain integrity anchoring is enabled. */
  readonly blockchainIntegrity: boolean;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Configurable thresholds for awareness alerts and limits. */
export interface ThresholdConfig {
  /**
   * Weight percentage (0-1) that triggers a concentration alert when a
   * single delegate exceeds it.
   */
  readonly concentrationAlertThreshold: number;
}

// ---------------------------------------------------------------------------
// Timeline configuration
// ---------------------------------------------------------------------------

/** Controls the duration of each phase in the voting event lifecycle. */
export interface TimelineConfig {
  /**
   * Days for the deliberation phase.
   * During this phase, proposals can be submitted, endorsed, and community-noted.
   * Must be >= 1.
   */
  readonly deliberationDays: number;
  /**
   * Days for the curation phase.
   * During this phase, admins curate the voting booklet and write recommendations.
   * No new proposals accepted; endorsements frozen.
   * 0 = no curation phase; system auto-selects highest-endorsed proposals.
   */
  readonly curationDays: number;
  /**
   * Days for the voting phase.
   * Must be >= 1.
   */
  readonly votingDays: number;
}

// ---------------------------------------------------------------------------
// Topic configuration
// ---------------------------------------------------------------------------

/** Controls the structure of the topic taxonomy. */
export interface TopicConfig {
  /**
   * Maximum depth of the topic hierarchy.
   * 1 = flat (root topics only), 2 = one level of nesting (root + child).
   * Must be >= 1.
   */
  readonly maxTopicDepth: number;
}

// ---------------------------------------------------------------------------
// Complete governance configuration
// ---------------------------------------------------------------------------

/**
 * The complete governance configuration for a Votiverse instance.
 * Configuration is data — the engine interprets configs, it never
 * hard-codes governance logic.
 */
export interface GovernanceConfig {
  /** Human-readable name for this configuration. */
  readonly name: string;
  /** Optional description. */
  readonly description: string;
  /** Delegation primitives. */
  readonly delegation: DelegationConfig;
  /** Ballot and voting parameters. */
  readonly ballot: BallotConfig;
  /** Feature toggles. */
  readonly features: FeatureConfig;
  /** Alert and limit thresholds. */
  readonly thresholds: ThresholdConfig;
  /** Timeline durations for voting events. */
  readonly timeline: TimelineConfig;
  /** Topic taxonomy structure. */
  readonly topics: TopicConfig;
}

// ---------------------------------------------------------------------------
// Preset names
// ---------------------------------------------------------------------------

/** Names of the built-in governance presets. */
export type PresetName =
  | "MODERN_DEMOCRACY"
  | "TOWN_HALL"
  | "SWISS_MODEL"
  | "LIQUID_STANDARD"
  | "LIQUID_ACCOUNTABLE"
  | "BOARD_PROXY"
  | "CIVIC_PARTICIPATORY";
