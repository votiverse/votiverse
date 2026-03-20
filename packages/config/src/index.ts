/**
 * @votiverse/config — Public API
 *
 * Governance configuration schemas, validation, named presets, and diffing.
 */

// Types
export type {
  GovernanceConfig,
  DelegationConfig,
  DelegationVisibilityConfig,
  BallotConfig,
  FeatureConfig,
  ThresholdConfig,
  TimelineConfig,
  TopicConfig,
  PresetName,
  BallotSecrecy,
  DelegateVoteVisibility,
  VotingMethod,
  ParticipationMode,
  ResultsVisibility,
  PredictionRequirement,
  AwarenessIntensity,
  DelegationMode,
  SurveyResponseAnonymity,
} from "./types.js";

// Presets
export { PRESETS, DEFAULT_PRESET, getPreset, getPresetNames } from "./presets.js";

// Validation
export type { ValidationIssue, ValidationResult } from "./validation.js";
export { validateConfig } from "./validation.js";

// Diffing
export type { ConfigDiff } from "./diff.js";
export { diffConfig } from "./diff.js";

// Derivation
export type { ConfigOverrides } from "./derive.js";
export { deriveConfig } from "./derive.js";
