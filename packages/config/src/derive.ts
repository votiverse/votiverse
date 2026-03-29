/**
 * @votiverse/config — Configuration derivation
 *
 * Creates a new config by applying overrides to a base config.
 * The base config is never mutated.
 */

import type {
  GovernanceConfig,
  DelegationConfig,
  BallotConfig,
  TimelineConfig,
} from "./types.js";

/** Partial override type for GovernanceConfig. */
export interface ConfigOverrides {
  readonly delegation?: Partial<DelegationConfig>;
  readonly ballot?: Partial<BallotConfig>;
  readonly timeline?: Partial<TimelineConfig>;
}

/**
 * Creates a new GovernanceConfig by applying overrides to a base config.
 * The base config is never mutated.
 */
export function deriveConfig(base: GovernanceConfig, overrides: ConfigOverrides): GovernanceConfig {
  return {
    delegation: {
      ...base.delegation,
      ...overrides.delegation,
    },
    ballot: {
      ...base.ballot,
      ...overrides.ballot,
    },
    timeline: {
      ...base.timeline,
      ...overrides.timeline,
    },
  };
}
