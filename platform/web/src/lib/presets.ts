/** Maps engine preset config names to i18n keys for user-facing labels. */
const PRESET_LABEL_KEYS: Record<string, string> = {
  "Liquid Delegation": "presets.liquidDelegation",
  "Direct Democracy": "presets.directDemocracy",
  "Swiss Votation": "presets.swissVotation",
  "Liquid Open": "presets.liquidOpen",
  "Representative": "presets.representative",
  "Civic Participatory": "presets.civicParticipatory",
  // Legacy names (backward compat with pre-rename assemblies)
  "Modern Democracy": "presets.liquidDelegation",
  "Full Accountability": "presets.fullAccountability",
  "Board Proxy": "presets.boardProxy",
  "Town Hall": "presets.directDemocracy",
  "Swiss Model": "presets.swissVotation",
  "Liquid Standard": "presets.liquidOpen",
  "Liquid Accountable": "presets.fullAccountability",
};

/** English fallback strings for all i18n keys used by preset helpers. */
const EN_FALLBACK: Record<string, string> = {
  "presets.liquidDelegation": "The recommended default",
  "presets.directDemocracy": "Everyone votes directly",
  "presets.swissVotation": "Structured deliberation, then direct vote",
  "presets.liquidOpen": "Flexible delegation for close-knit groups",
  "presets.representative": "Appointed representatives",
  "presets.civicParticipatory": "Municipal-scale governance",
  "presets.fullAccountability": "Maximum transparency and accountability",
  "presets.boardProxy": "Elected representatives",
  "presets.enabled": "Enabled",
  "presets.disabled": "Disabled",
  "presets.yes": "Yes",
  "presets.no": "No",
  "presets.admissionOpen": "Anyone with an invite link can join immediately",
  "presets.admissionApproval": "New members need admin approval to join",
  "presets.admissionInviteOnly": "Members can only join through direct invitation",
  "presets.ruleDirect": "Every member votes directly on every question",
  "presets.ruleCandidacyTransferable": "Members can delegate their vote to trusted candidates or any member, by topic or issue",
  "presets.ruleCandidacy": "Members appoint a declared candidate as their representative",
  "presets.ruleTransferable": "Members can delegate their vote to any other member",
  "presets.ballotSecret": "Ballots are secret; results are revealed after voting ends",
  "presets.ballotPublicLive": "Ballots are public with live results",
  "presets.ballotPublic": "Ballots are public",
  "presets.ballotVoteChange": "You can change your vote any time before voting closes",
  "presets.featureNotes": "Community notes help verify claims in proposals and candidate profiles",
  "presets.featureSurveys": "Surveys capture member observations as evidence for accountability",
  "presets.timelineThen": "then",
};

/** Translation function signature accepted by preset helpers. */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * Identity-like fallback `t` that resolves keys from the English fallback map.
 * Used when callers haven't been i18n-ized yet and don't pass a real `t()`.
 */
function fallbackT(key: string, options?: Record<string, unknown>): string {
  let value = EN_FALLBACK[key] ?? key;
  if (options) {
    for (const [k, v] of Object.entries(options)) {
      value = value.replace(`{{${k}}}`, String(v));
    }
  }
  return value;
}

/** Return a plain-language label for a preset config name. Falls back to the raw name. */
export function presetLabel(configName: string, t?: TranslateFn): string {
  const translate = t ?? fallbackT;
  const key = PRESET_LABEL_KEYS[configName];
  return key ? translate(key) : configName;
}

// ── Config value humanizers ────────────────────────────────────────────

export function humanizeBoolean(value: boolean, style: "yes-no" | "enabled-disabled" = "yes-no", t?: TranslateFn): string {
  const translate = t ?? fallbackT;
  if (style === "enabled-disabled") return value ? translate("presets.enabled") : translate("presets.disabled");
  return value ? translate("presets.yes") : translate("presets.no");
}

// ── Admission mode descriptions ────────────────────────────────────────

export function describeAdmissionMode(mode: string, t?: TranslateFn): string {
  const translate = t ?? fallbackT;
  switch (mode) {
    case "open": return translate("presets.admissionOpen");
    case "approval": return translate("presets.admissionApproval");
    case "invite-only": return translate("presets.admissionInviteOnly");
    default: return translate("presets.admissionApproval");
  }
}

// ── Governance rule summarization ──────────────────────────────────────

import type { GovernanceConfig } from "../api/types.js";

/** Whether delegation is enabled in this config. */
export function isDelegationEnabled(config: GovernanceConfig): boolean {
  return config.delegation.candidacy || config.delegation.transferable;
}

/** Generates plain-language governance rules from the config. */
export function summarizeRules(config: GovernanceConfig, t?: TranslateFn): string[] {
  const translate = t ?? fallbackT;
  const rules: string[] = [];

  // Delegation
  const delegationEnabled = isDelegationEnabled(config);
  if (!delegationEnabled) {
    rules.push(translate("presets.ruleDirect"));
  } else if (config.delegation.candidacy && config.delegation.transferable) {
    rules.push(translate("presets.ruleCandidacyTransferable"));
  } else if (config.delegation.candidacy) {
    rules.push(translate("presets.ruleCandidacy"));
  } else {
    rules.push(translate("presets.ruleTransferable"));
  }

  // Timeline
  const tl = config.timeline;
  if (tl) {
    const parts = [translate("presets.timelineDeliberation", { days: tl.deliberationDays })];
    if (tl.curationDays > 0) parts.push(translate("presets.timelineCuration", { days: tl.curationDays }));
    parts.push(translate("presets.timelineVoting", { days: tl.votingDays }));
    rules.push(parts.join(`, ${translate("presets.timelineThen")} `));
  }

  // Ballot
  if (config.ballot.secret) {
    rules.push(translate("presets.ballotSecret"));
  } else {
    rules.push(config.ballot.liveResults ? translate("presets.ballotPublicLive") : translate("presets.ballotPublic"));
  }

  if (config.ballot.allowVoteChange) {
    rules.push(translate("presets.ballotVoteChange"));
  }

  // Features
  if (config.features.communityNotes) {
    rules.push(translate("presets.featureNotes"));
  }
  if (config.features.surveys) {
    rules.push(translate("presets.featureSurveys"));
  }

  return rules;
}
