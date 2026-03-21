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
  FeatureConfig,
  TimelineConfig,
} from "./types.js";

/** Partial override type for GovernanceConfig. */
export interface ConfigOverrides {
  readonly name?: string;
  readonly description?: string;
  readonly delegation?: Partial<DelegationConfig>;
  readonly ballot?: Partial<BallotConfig>;
  readonly features?: Partial<FeatureConfig>;
  readonly timeline?: Partial<TimelineConfig>;
}

/**
 * Creates a new GovernanceConfig by applying overrides to a base config.
 * The base config is never mutated.
 */
export function deriveConfig(base: GovernanceConfig, overrides: ConfigOverrides): GovernanceConfig {
  return {
    name: overrides.name ?? base.name,
    description: overrides.description ?? base.description,
    delegation: {
      ...base.delegation,
      ...overrides.delegation,
    },
    ballot: {
      ...base.ballot,
      ...overrides.ballot,
    },
    features: {
      ...base.features,
      ...overrides.features,
    },
    timeline: {
      ...base.timeline,
      ...overrides.timeline,
    },
  };
}
