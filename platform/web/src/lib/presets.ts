/** Maps engine preset config names to user-facing labels.
 *  Used wherever a preset name appears in the UI — assembly cards, profile, dashboard.
 */
export const PRESET_LABELS: Record<string, string> = {
  "Modern Democracy": "The recommended default",
  "Direct Democracy": "Everyone votes directly",
  "Swiss Votation": "Structured deliberation, then direct vote",
  "Liquid Open": "Flexible delegation for close-knit groups",
  "Full Accountability": "Maximum transparency and accountability",
  "Board Proxy": "Elected representatives",
  "Civic Participatory": "Municipal-scale governance",
  // Legacy names (backward compat with pre-rename assemblies)
  "Town Hall": "Everyone votes directly",
  "Swiss Model": "Structured deliberation, then direct vote",
  "Liquid Standard": "Flexible delegation for close-knit groups",
  "Liquid Accountable": "Maximum transparency and accountability",
};

/** Return a plain-language label for a preset config name. Falls back to the raw name. */
export function presetLabel(configName: string): string {
  return PRESET_LABELS[configName] ?? configName;
}

// ── Config value humanizers ────────────────────────────────────────────

const VOTING_METHODS: Record<string, string> = {
  "simple-majority": "Simple Majority",
  "supermajority": "Supermajority",
};

const SECRECY_LABELS: Record<string, string> = {
  "public": "Public",
  "secret": "Secret Ballot",
  "anonymous-auditable": "Anonymous (Auditable)",
};

const PARTICIPATION_LABELS: Record<string, string> = {
  "voluntary": "Voluntary",
  "mandatory": "Required",
};

const PREDICTIONS_LABELS: Record<string, string> = {
  "disabled": "Disabled",
  "voluntary": "Optional",
  "optional": "Optional",
  "encouraged": "Encouraged",
  "mandatory": "Required",
};

const AWARENESS_LABELS: Record<string, string> = {
  "standard": "Standard",
  "minimal": "Basic",
  "detailed": "Detailed",
  "aggressive": "Full",
};

const RESULTS_VISIBILITY_LABELS: Record<string, string> = {
  "live": "Live",
  "sealed": "After Voting Ends",
  "after-vote": "After Voting",
  "after-close": "After Close",
};

export function humanizeVotingMethod(value: string): string {
  return VOTING_METHODS[value] ?? value;
}

export function humanizeSecrecy(value: string): string {
  return SECRECY_LABELS[value] ?? value;
}

export function humanizeParticipation(value: string): string {
  return PARTICIPATION_LABELS[value] ?? value;
}

export function humanizePredictions(value: string): string {
  return PREDICTIONS_LABELS[value] ?? value;
}

export function humanizeAwareness(value: string): string {
  return AWARENESS_LABELS[value] ?? value;
}

export function humanizeResultsVisibility(value: string): string {
  return RESULTS_VISIBILITY_LABELS[value] ?? value;
}

export function humanizeBoolean(value: boolean, style: "yes-no" | "enabled-disabled" = "yes-no"): string {
  if (style === "enabled-disabled") return value ? "Enabled" : "Disabled";
  return value ? "Yes" : "No";
}

// ── Governance rule summarization ──────────────────────────────────────

import type { GovernanceConfig } from "../api/types.js";

/** Generates plain-language governance rules from the config. */
export function summarizeRules(config: GovernanceConfig): string[] {
  const rules: string[] = [];

  // Delegation
  if (config.delegation.delegationMode === "none") {
    rules.push("Every member votes directly on every question");
  } else if (config.delegation.delegationMode === "candidacy") {
    rules.push("Members can delegate their vote to trusted candidates" + (config.delegation.topicScoped ? " by topic" : ""));
  } else {
    rules.push("Members can delegate their vote to any other member" + (config.delegation.topicScoped ? " by topic" : ""));
  }

  // Timeline
  const tl = config.timeline;
  if (tl) {
    const parts = [`${tl.deliberationDays} day${tl.deliberationDays !== 1 ? "s" : ""} for deliberation`];
    if (tl.curationDays > 0) parts.push(`${tl.curationDays} day${tl.curationDays !== 1 ? "s" : ""} for curation`);
    parts.push(`${tl.votingDays} day${tl.votingDays !== 1 ? "s" : ""} to vote`);
    rules.push(parts.join(", then "));
  }

  // Ballot
  if (config.ballot.secrecy === "secret") {
    rules.push("Ballots are secret; results are revealed after voting ends");
  } else if (config.ballot.secrecy === "public") {
    rules.push("Ballots are public" + (config.ballot.resultsVisibility === "live" ? " with live results" : ""));
  }

  if (config.ballot.allowVoteChange) {
    rules.push("You can change your vote any time before voting closes");
  }

  // Features
  if (config.features.communityNotes) {
    rules.push("Community notes help verify claims in proposals and candidate profiles");
  }
  if (config.features.surveys) {
    rules.push("Surveys capture member observations as evidence for accountability");
  }

  return rules;
}
