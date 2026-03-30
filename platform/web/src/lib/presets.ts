/**
 * Maps engine preset config names to i18n keys for user-facing labels.
 * Keys are prefixed with "common:" so they resolve correctly regardless
 * of which namespace's `t` function is passed by the caller.
 */
const PRESET_LABEL_KEYS: Record<string, string> = {
  "Liquid Delegation": "common:presets.liquidDelegation",
  "Direct Democracy": "common:presets.directDemocracy",
  "Swiss Votation": "common:presets.swissVotation",
  "Liquid Open": "common:presets.liquidOpen",
  "Representative": "common:presets.representative",
  "Civic Participatory": "common:presets.civicParticipatory",
  // Legacy names (backward compat with pre-rename assemblies)
  "Modern Democracy": "common:presets.liquidDelegation",
  "Full Accountability": "common:presets.fullAccountability",
  "Board Proxy": "common:presets.boardProxy",
  "Town Hall": "common:presets.directDemocracy",
  "Swiss Model": "common:presets.swissVotation",
  "Liquid Standard": "common:presets.liquidOpen",
  "Liquid Accountable": "common:presets.fullAccountability",
};

/** English fallback strings for all i18n keys used by preset helpers. */
const EN_FALLBACK: Record<string, string> = {
  "common:presets.liquidDelegation": "The recommended default",
  "common:presets.directDemocracy": "Everyone votes directly",
  "common:presets.swissVotation": "Structured deliberation, then direct vote",
  "common:presets.liquidOpen": "Flexible delegation for close-knit groups",
  "common:presets.representative": "Appointed representatives",
  "common:presets.civicParticipatory": "Municipal-scale governance",
  "common:presets.fullAccountability": "Maximum transparency and accountability",
  "common:presets.boardProxy": "Elected representatives",
  "common:quadrant.direct": "Direct Only",
  "common:quadrant.proxy": "Candidates Only",
  "common:quadrant.open": "Optional Delegation",
  "common:quadrant.liquid": "Optional Delegation & Candidates",
  "common:presets.enabled": "Enabled",
  "common:presets.disabled": "Disabled",
  "common:presets.yes": "Yes",
  "common:presets.no": "No",
  "common:presets.admissionOpen": "Anyone with an invite link can join immediately",
  "common:presets.admissionApproval": "New members need admin approval to join",
  "common:presets.admissionInviteOnly": "Members can only join through direct invitation",
  "common:presets.ruleDirect": "Every member votes directly on every question",
  "common:presets.ruleCandidacyTransferable": "Members can delegate their vote to trusted candidates or any member, by topic or issue",
  "common:presets.ruleCandidacy": "Members appoint a declared candidate as their representative",
  "common:presets.ruleTransferable": "Members can delegate their vote to any other member",
  "common:presets.ballotSecret": "Ballots are secret; results are revealed after voting ends",
  "common:presets.ballotPublicLive": "Ballots are public with live results",
  "common:presets.ballotPublic": "Ballots are public",
  "common:presets.ballotVoteChange": "You can change your vote any time before voting closes",
  "common:presets.featureNotes": "Community notes help verify claims in proposals and candidate profiles",
  "common:presets.featureSurveys": "Surveys capture member observations as evidence for accountability",
  "common:presets.timelineDeliberation": "{{days}} days for deliberation",
  "common:presets.timelineCuration": "{{days}} days for curation",
  "common:presets.timelineVoting": "{{days}} days to vote",
  "common:presets.timelineThen": "then",
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

/**
 * Derive a preset label from the delegation quadrant when config.name is unavailable.
 * Maps the four delegation quadrants to their canonical preset labels.
 */
export function quadrantLabel(config: { delegation?: { candidacy: boolean; transferable: boolean } } | null | undefined, t?: TranslateFn): string {
  const translate = t ?? fallbackT;
  if (!config?.delegation) return translate("common:quadrant.direct");
  const { candidacy, transferable } = config.delegation;
  if (candidacy && transferable) return translate("common:quadrant.liquid");
  if (!candidacy && !transferable) return translate("common:quadrant.direct");
  if (candidacy && !transferable) return translate("common:quadrant.proxy");
  return translate("common:quadrant.open");
}

// ── Config value humanizers ────────────────────────────────────────────

export function humanizeBoolean(value: boolean, style: "yes-no" | "enabled-disabled" = "yes-no", t?: TranslateFn): string {
  const translate = t ?? fallbackT;
  if (style === "enabled-disabled") return value ? translate("common:presets.enabled") : translate("common:presets.disabled");
  return value ? translate("common:presets.yes") : translate("common:presets.no");
}

// ── Admission mode descriptions ────────────────────────────────────────

export function describeAdmissionMode(mode: string, t?: TranslateFn): string {
  const translate = t ?? fallbackT;
  switch (mode) {
    case "open": return translate("common:presets.admissionOpen");
    case "approval": return translate("common:presets.admissionApproval");
    case "invite-only": return translate("common:presets.admissionInviteOnly");
    default: return translate("common:presets.admissionApproval");
  }
}

// ── Governance rule summarization ──────────────────────────────────────

import type { GovernanceConfig } from "../api/types.js";

/** Whether delegation is enabled in this config. */
export function isDelegationEnabled(config: GovernanceConfig | null | undefined): boolean {
  if (!config) return false;
  return config.delegation.candidacy || config.delegation.transferable;
}

/** Generates plain-language governance rules from the config. */
export function summarizeRules(config: GovernanceConfig | null | undefined, t?: TranslateFn): string[] {
  if (!config) return [];
  const translate = t ?? fallbackT;
  const rules: string[] = [];

  // Delegation
  const delegationEnabled = isDelegationEnabled(config);
  if (!delegationEnabled) {
    rules.push(translate("common:presets.ruleDirect"));
  } else if (config.delegation.candidacy && config.delegation.transferable) {
    rules.push(translate("common:presets.ruleCandidacyTransferable"));
  } else if (config.delegation.candidacy) {
    rules.push(translate("common:presets.ruleCandidacy"));
  } else {
    rules.push(translate("common:presets.ruleTransferable"));
  }

  // Timeline
  const tl = config.timeline;
  if (tl) {
    const parts = [translate("common:presets.timelineDeliberation", { days: tl.deliberationDays })];
    if (tl.curationDays > 0) parts.push(translate("common:presets.timelineCuration", { days: tl.curationDays }));
    parts.push(translate("common:presets.timelineVoting", { days: tl.votingDays }));
    rules.push(parts.join(`, ${translate("common:presets.timelineThen")} `));
  }

  // Ballot
  if (config.ballot.secret) {
    rules.push(translate("common:presets.ballotSecret"));
  } else {
    rules.push(config.ballot.liveResults ? translate("common:presets.ballotPublicLive") : translate("common:presets.ballotPublic"));
  }

  if (config.ballot.allowVoteChange) {
    rules.push(translate("common:presets.ballotVoteChange"));
  }

  return rules;
}
