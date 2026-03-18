/**
 * @votiverse/config — Configuration derivation
 *
 * Creates a new config by applying overrides to a base config.
 * The base config is never mutated.
 */

import type {
  GovernanceConfig,
  DelegationConfig,
  DelegationVisibilityConfig,
  BallotConfig,
  FeatureConfig,
  ThresholdConfig,
  TimelineConfig,
} from "./types.js";

/** Deep partial override for DelegationConfig, with nested visibility support. */
export type DelegationOverrides = Partial<Omit<DelegationConfig, "visibility">> & {
  readonly visibility?: Partial<DelegationVisibilityConfig>;
};

/** Deep partial type for GovernanceConfig overrides. */
export interface ConfigOverrides {
  readonly name?: string;
  readonly description?: string;
  readonly delegation?: DelegationOverrides;
  readonly ballot?: Partial<BallotConfig>;
  readonly features?: Partial<FeatureConfig>;
  readonly thresholds?: Partial<ThresholdConfig>;
  readonly timeline?: Partial<TimelineConfig>;
}

/**
 * Creates a new GovernanceConfig by applying overrides to a base config.
 * The base config is never mutated. Nested objects (e.g. delegation.visibility)
 * are merged at two levels.
 */
export function deriveConfig(base: GovernanceConfig, overrides: ConfigOverrides): GovernanceConfig {
  const { visibility: visibilityOverride, ...delegationFlat } = overrides.delegation ?? {};
  return {
    name: overrides.name ?? base.name,
    description: overrides.description ?? base.description,
    delegation: {
      ...base.delegation,
      ...delegationFlat,
      visibility: {
        ...base.delegation.visibility,
        ...visibilityOverride,
      },
    },
    ballot: {
      ...base.ballot,
      ...overrides.ballot,
    },
    features: {
      ...base.features,
      ...overrides.features,
    },
    thresholds: {
      ...base.thresholds,
      ...overrides.thresholds,
    },
    timeline: {
      ...base.timeline,
      ...overrides.timeline,
    },
  };
}
