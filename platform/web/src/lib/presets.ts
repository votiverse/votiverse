/** Maps engine preset config names to user-facing labels.
 *  Used wherever a preset name appears in the UI — assembly cards, profile, dashboard.
 */
export const PRESET_LABELS: Record<string, string> = {
  "Liquid Delegation": "The recommended default",
  "Direct Democracy": "Everyone votes directly",
  "Swiss Votation": "Structured deliberation, then direct vote",
  "Liquid Open": "Flexible delegation for close-knit groups",
  "Representative": "Appointed representatives",
  "Civic Participatory": "Municipal-scale governance",
  // Legacy names (backward compat with pre-rename assemblies)
  "Modern Democracy": "The recommended default",
  "Full Accountability": "Maximum transparency and accountability",
  "Board Proxy": "Elected representatives",
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

export function humanizeBoolean(value: boolean, style: "yes-no" | "enabled-disabled" = "yes-no"): string {
  if (style === "enabled-disabled") return value ? "Enabled" : "Disabled";
  return value ? "Yes" : "No";
}

// ── Admission mode descriptions ────────────────────────────────────────

export function describeAdmissionMode(mode: string): string {
  switch (mode) {
    case "open": return "Anyone with an invite link can join immediately";
    case "approval": return "New members need admin approval to join";
    case "invite-only": return "Members can only join through direct invitation";
    default: return "Admin approval required";
  }
}

// ── Governance rule summarization ──────────────────────────────────────

import type { GovernanceConfig } from "../api/types.js";

/** Whether delegation is enabled in this config. */
export function isDelegationEnabled(config: GovernanceConfig): boolean {
  return config.delegation.candidacy || config.delegation.transferable;
}

/** Generates plain-language governance rules from the config. */
export function summarizeRules(config: GovernanceConfig): string[] {
  const rules: string[] = [];

  // Delegation
  const delegationEnabled = isDelegationEnabled(config);
  if (!delegationEnabled) {
    rules.push("Every member votes directly on every question");
  } else if (config.delegation.candidacy && config.delegation.transferable) {
    rules.push("Members can delegate their vote to trusted candidates or any member, by topic or issue");
  } else if (config.delegation.candidacy) {
    rules.push("Members appoint a declared candidate as their representative");
  } else {
    rules.push("Members can delegate their vote to any other member");
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
  if (config.ballot.secret) {
    rules.push("Ballots are secret; results are revealed after voting ends");
  } else {
    rules.push("Ballots are public" + (config.ballot.liveResults ? " with live results" : ""));
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
