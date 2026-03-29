/**
 * @votiverse/config — GovernanceConfig type definitions
 *
 * The minimal governance parameter space. Every parameter represents
 * a governance decision that a group creator can understand and reason about.
 *
 * See docs/design/governance-parameter-space.md for the full design rationale.
 */

// ---------------------------------------------------------------------------
// Delegation configuration
// ---------------------------------------------------------------------------

/**
 * Controls voting power delegation through two orthogonal axes.
 *
 * The 2×2 grid:
 * - candidacy=false, transferable=false → Direct democracy (no delegation)
 * - candidacy=false, transferable=true  → Informal liquid (anyone to anyone, chains flow)
 * - candidacy=true,  transferable=false → Representative/proxy (declared candidates only, no chains)
 * - candidacy=true,  transferable=true  → Liquid delegation (candidates for discovery, chains flow)
 *
 * Delegation exists when `candidacy || transferable`.
 * Topic and issue scoping is always available when delegation exists.
 */
export interface DelegationConfig {
  /**
   * Formal candidate declaration system. When true, members can declare
   * themselves as candidates, publish profiles, and appear in delegate
   * discovery. In proxy mode (transferable=false), only declared candidates
   * can receive delegations.
   */
  readonly candidacy: boolean;

  /**
   * Transitive vote delegation. When true, delegated voting power flows
   * through chains (A→B→C means C carries A's weight). When false with
   * candidacy=true, delegation is limited to a single hop to a declared
   * candidate (classic proxy/representative).
   */
  readonly transferable: boolean;
}

// ---------------------------------------------------------------------------
// Ballot configuration
// ---------------------------------------------------------------------------

/** How votes are counted. */
export type VotingMethod = "majority" | "supermajority";

/**
 * Controls the voting mechanism and ballot parameters.
 *
 * These five parameters interact to produce recognizable voting patterns:
 * - Swiss votation: secret=true, liveResults=false, allowVoteChange=true
 * - Show of hands: secret=false, liveResults=true, allowVoteChange=true
 * - Traditional election: secret=true, liveResults=false, allowVoteChange=false
 * - Accountable board: secret=false, liveResults=false, allowVoteChange=false
 */
export interface BallotConfig {
  /** Are individual votes hidden from other members? */
  readonly secret: boolean;

  /** Are aggregate tallies visible while voting is still open? */
  readonly liveResults: boolean;

  /** Can participants change their vote during the voting period? */
  readonly allowVoteChange: boolean;

  /** Minimum fraction of members who must vote for the result to be valid (0–1). */
  readonly quorum: number;

  /** How votes are counted. */
  readonly method: VotingMethod;
}

// ---------------------------------------------------------------------------
// Feature toggles
// ---------------------------------------------------------------------------

/** Controls which features are active in the governance instance. */
export interface FeatureConfig {
  /** Crowd-sourced context notes on proposals, evaluated by the community. */
  readonly communityNotes: boolean;

  /** Falsifiable predictions attached to proposals, with track records over time. */
  readonly predictions: boolean;

  /** Sentiment surveys decoupled from binding votes. */
  readonly surveys: boolean;

  /** Rubric-based multi-criteria scoring events (non-delegable). */
  readonly scoring: boolean;
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
// Complete governance configuration
// ---------------------------------------------------------------------------

/**
 * The complete governance configuration for a Votiverse instance.
 * Configuration is data — the engine interprets configs, it never
 * hard-codes governance logic.
 *
 * 13 parameters across 4 sections. Every parameter represents a
 * governance decision. Implementation tuning (note thresholds,
 * awareness intensity, chain depth) lives in sensible defaults,
 * not in the configuration surface.
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
  /** Timeline durations for voting events. */
  readonly timeline: TimelineConfig;
}

// ---------------------------------------------------------------------------
// Preset names
// ---------------------------------------------------------------------------

/** Names of the built-in governance presets. */
export type PresetName =
  | "LIQUID_DELEGATION"
  | "DIRECT_DEMOCRACY"
  | "SWISS_VOTATION"
  | "LIQUID_OPEN"
  | "REPRESENTATIVE"
  | "CIVIC";
