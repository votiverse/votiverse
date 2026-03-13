/**
 * @votiverse/config — Configuration validation
 *
 * Validates GovernanceConfig for internal consistency.
 */

import type { GovernanceConfig } from "./types.js";

/** A single validation issue. */
export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

/** Result of validating a governance configuration. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Validates a GovernanceConfig for internal consistency.
 *
 * Returns errors for invalid configurations and warnings for
 * potentially problematic but technically valid combinations.
 */
export function validateConfig(config: GovernanceConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  // --- Delegation consistency ---

  if (!config.delegation.enabled) {
    if (config.delegation.transitive) {
      issues.push({
        field: "delegation.transitive",
        message: "Transitivity must be disabled when delegation is disabled",
        severity: "error",
      });
    }
    if (config.delegation.topicScoped) {
      issues.push({
        field: "delegation.topicScoped",
        message: "Topic scoping must be disabled when delegation is disabled",
        severity: "error",
      });
    }
    if (config.delegation.maxChainDepth !== null && config.delegation.maxChainDepth > 0) {
      issues.push({
        field: "delegation.maxChainDepth",
        message: "Chain depth limit is meaningless when delegation is disabled",
        severity: "warning",
      });
    }
  }

  if (
    !config.delegation.transitive &&
    config.delegation.maxChainDepth !== null &&
    config.delegation.maxChainDepth > 1
  ) {
    issues.push({
      field: "delegation.maxChainDepth",
      message: "Chain depth > 1 has no effect when transitivity is disabled",
      severity: "warning",
    });
  }

  if (config.delegation.maxChainDepth !== null && config.delegation.maxChainDepth < 1) {
    issues.push({
      field: "delegation.maxChainDepth",
      message: "Chain depth must be at least 1 if set",
      severity: "error",
    });
  }

  if (
    config.delegation.maxDelegatesPerParticipant !== null &&
    config.delegation.maxDelegatesPerParticipant < 1
  ) {
    issues.push({
      field: "delegation.maxDelegatesPerParticipant",
      message: "Max delegates per participant must be at least 1 if set",
      severity: "error",
    });
  }

  // --- Ballot consistency ---

  if (
    config.ballot.votingMethod !== "supermajority" &&
    config.ballot.supermajorityThreshold !== 0.5
  ) {
    issues.push({
      field: "ballot.supermajorityThreshold",
      message: "Supermajority threshold is only relevant when voting method is 'supermajority'",
      severity: "warning",
    });
  }

  if (config.ballot.supermajorityThreshold <= 0 || config.ballot.supermajorityThreshold > 1) {
    issues.push({
      field: "ballot.supermajorityThreshold",
      message: "Supermajority threshold must be between 0 (exclusive) and 1 (inclusive)",
      severity: "error",
    });
  }

  if (config.ballot.quorum < 0 || config.ballot.quorum > 1) {
    issues.push({
      field: "ballot.quorum",
      message: "Quorum must be between 0 and 1",
      severity: "error",
    });
  }

  // --- Delegate vote visibility ---

  if (!config.delegation.enabled && config.ballot.delegateVoteVisibility !== "private") {
    issues.push({
      field: "ballot.delegateVoteVisibility",
      message: "Delegate vote visibility is irrelevant when delegation is disabled",
      severity: "warning",
    });
  }

  // --- Participation mode ---

  if (
    config.ballot.participationMode === "mandatory-with-delegation" &&
    !config.delegation.enabled
  ) {
    issues.push({
      field: "ballot.participationMode",
      message: "'mandatory-with-delegation' requires delegation to be enabled",
      severity: "error",
    });
  }

  // --- Feature / interaction warnings ---

  if (
    config.ballot.secrecy === "secret" &&
    config.ballot.delegateVoteVisibility === "public" &&
    config.delegation.enabled
  ) {
    issues.push({
      field: "ballot.secrecy",
      message:
        "Secret ballots with public delegate votes may create coercion risks in small groups",
      severity: "warning",
    });
  }

  // --- Thresholds ---

  if (
    config.thresholds.concentrationAlertThreshold <= 0 ||
    config.thresholds.concentrationAlertThreshold > 1
  ) {
    issues.push({
      field: "thresholds.concentrationAlertThreshold",
      message: "Concentration alert threshold must be between 0 (exclusive) and 1 (inclusive)",
      severity: "error",
    });
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    issues,
  };
}
