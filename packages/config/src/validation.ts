/**
 * @votiverse/config — Configuration validation
 *
 * Validates GovernanceConfig for type and range correctness.
 * Every combination of the 10 parameters is valid — there are no
 * cross-field constraint violations. Only range/type checks remain.
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
 * Validates a GovernanceConfig for range and type correctness.
 *
 * All combinations of the 10 governance parameters are valid.
 * This function only checks that numeric values are within legal ranges
 * and timeline values are positive integers.
 */
export function validateConfig(config: GovernanceConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  // --- Ballot ---

  if (config.ballot.quorum < 0 || config.ballot.quorum > 1) {
    issues.push({
      field: "ballot.quorum",
      message: "Quorum must be between 0 and 1",
      severity: "error",
    });
  }

  // --- Timeline ---

  if (!Number.isInteger(config.timeline.deliberationDays) || config.timeline.deliberationDays < 1) {
    issues.push({
      field: "timeline.deliberationDays",
      message: "Deliberation days must be an integer >= 1",
      severity: "error",
    });
  }

  if (!Number.isInteger(config.timeline.curationDays) || config.timeline.curationDays < 0) {
    issues.push({
      field: "timeline.curationDays",
      message: "Curation days must be an integer >= 0 (0 = no curation phase)",
      severity: "error",
    });
  }

  if (!Number.isInteger(config.timeline.votingDays) || config.timeline.votingDays < 1) {
    issues.push({
      field: "timeline.votingDays",
      message: "Voting days must be an integer >= 1",
      severity: "error",
    });
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    issues,
  };
}
