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
