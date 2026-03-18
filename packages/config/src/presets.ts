/**
 * @votiverse/config — Named presets
 *
 * Curated governance configurations with sensible defaults.
 * Presets are frozen objects — customization produces a new config
 * derived from a preset, never mutates the preset.
 */

import type { GovernanceConfig, PresetName } from "./types.js";

/**
 * Modern Democracy: The recommended default for any group.
 * Liquid delegation with candidate profiles, Swiss-style voting booklets,
 * community notes, surveys, and prediction tracking.
 * Typical use: any group that wants a well-rounded governance system.
 */
const MODERN_DEMOCRACY: GovernanceConfig = Object.freeze({
  name: "Modern Democracy",
  description:
    "Liquid delegation with candidate profiles, Swiss-style voting booklets, " +
    "community notes, surveys, and prediction tracking. " +
    "The recommended starting point for any group.",
  delegation: Object.freeze({
    delegationMode: "candidacy" as const,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
    maxAge: null,
    visibility: Object.freeze({ mode: "public" as const, incomingVisibility: "direct" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "delegators-only" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
    resultsVisibility: "sealed" as const,
    allowVoteChange: true,
  }),
  features: Object.freeze({
    predictions: "encouraged" as const,
    communityNotes: true,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: true,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "standard" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.15,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 2,
    votingDays: 7,
  }),
});

/**
 * Direct Democracy: Every member votes on every question.
 * Secret ballot, simple majority, no delegation.
 * Typical use: small clubs, parent committees, informal groups.
 */
const TOWN_HALL: GovernanceConfig = Object.freeze({
  name: "Direct Democracy",
  description: "Every member votes on every question. No delegation. Simple majority decides.",
  delegation: Object.freeze({
    delegationMode: "none" as const,
    topicScoped: false,
    transitive: false,
    revocableAnytime: false,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
    maxAge: null,
    visibility: Object.freeze({ mode: "private" as const, incomingVisibility: "direct" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "private" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0,
    participationMode: "voluntary" as const,
    resultsVisibility: "sealed" as const,
    allowVoteChange: true,
  }),
  features: Object.freeze({
    predictions: "disabled" as const,
    communityNotes: false,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: false,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "minimal" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 1.0,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 0,
    votingDays: 7,
  }),
});

/**
 * Swiss Votation: Direct democracy per issue with structured information.
 * Predictions encouraged, community notes enabled, curation phase for booklet preparation.
 * Typical use: associations, cooperatives, civic groups.
 */
const SWISS_MODEL: GovernanceConfig = Object.freeze({
  name: "Swiss Votation",
  description:
    "Direct democracy per issue with structured voting booklets, predictions encouraged, community notes enabled.",
  delegation: Object.freeze({
    delegationMode: "none" as const,
    topicScoped: false,
    transitive: false,
    revocableAnytime: false,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
    maxAge: null,
    visibility: Object.freeze({ mode: "private" as const, incomingVisibility: "direct" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "private" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.2,
    participationMode: "voluntary" as const,
    resultsVisibility: "sealed" as const,
    allowVoteChange: true,
  }),
  features: Object.freeze({
    predictions: "encouraged" as const,
    communityNotes: true,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: false,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "minimal" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 1.0,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 2,
    votingDays: 7,
  }),
});

/**
 * Liquid Open: Topic-specific liquid delegation for groups where everyone knows each other.
 * Open delegation without candidacy profiles, transitive, revocable anytime.
 * Typical use: medium organizations, tech communities, professional associations.
 */
const LIQUID_STANDARD: GovernanceConfig = Object.freeze({
  name: "Liquid Open",
  description:
    "Open delegation without candidacy profiles. Topic-specific, transitive, revocable anytime. For groups where everyone knows each other.",
  delegation: Object.freeze({
    delegationMode: "open" as const,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
    maxAge: null,
    visibility: Object.freeze({ mode: "public" as const, incomingVisibility: "direct" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "public" as const,
    delegateVoteVisibility: "delegators-only" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
    resultsVisibility: "live" as const,
    allowVoteChange: false,
  }),
  features: Object.freeze({
    predictions: "optional" as const,
    communityNotes: false,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: false,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "standard" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.15,
  }),
  timeline: Object.freeze({
    deliberationDays: 5,
    curationDays: 0,
    votingDays: 5,
  }),
});

/**
 * Full Accountability: Everything on, predictions mandatory, aggressive awareness.
 * Candidacy-mode delegation with maximum transparency and accountability.
 * Typical use: organizations that prioritize long-term accountability.
 */
const LIQUID_ACCOUNTABLE: GovernanceConfig = Object.freeze({
  name: "Full Accountability",
  description:
    "Everything on: candidacy-mode delegation, mandatory predictions, full awareness layer, " +
    "community notes, surveys. Maximum transparency and accountability.",
  delegation: Object.freeze({
    delegationMode: "candidacy" as const,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
    maxAge: null,
    visibility: Object.freeze({ mode: "public" as const, incomingVisibility: "chain" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "public" as const,
    delegateVoteVisibility: "public" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
    resultsVisibility: "live" as const,
    allowVoteChange: false,
  }),
  features: Object.freeze({
    predictions: "mandatory" as const,
    communityNotes: true,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: true,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "aggressive" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.1,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 3,
    votingDays: 7,
  }),
});

/**
 * Board Proxy: Single-delegate proxy voting.
 * Non-transitive, revocable before meeting, secret ballot.
 * Typical use: corporate boards, formal governance bodies.
 */
const BOARD_PROXY: GovernanceConfig = Object.freeze({
  name: "Board Proxy",
  description:
    "Single-delegate proxy voting. Non-transitive, revocable before meeting, secret ballot.",
  delegation: Object.freeze({
    delegationMode: "open" as const,
    topicScoped: false,
    transitive: false,
    revocableAnytime: false,
    maxChainDepth: 1,
    maxDelegatesPerParticipant: 1,
    maxAge: null,
    visibility: Object.freeze({ mode: "private" as const, incomingVisibility: "direct" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "private" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.5,
    participationMode: "voluntary" as const,
    resultsVisibility: "sealed" as const,
    allowVoteChange: true,
  }),
  features: Object.freeze({
    predictions: "disabled" as const,
    communityNotes: false,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: false,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "minimal" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.5,
  }),
  timeline: Object.freeze({
    deliberationDays: 3,
    curationDays: 0,
    votingDays: 3,
  }),
});

/**
 * Civic Participatory: Liquid delegation with chain depth cap and full accountability.
 * Mandatory predictions, community notes, surveys, blockchain integrity.
 * Typical use: municipal deployments, participatory budgeting, citizen assemblies.
 */
const CIVIC_PARTICIPATORY: GovernanceConfig = Object.freeze({
  name: "Civic Participatory",
  description:
    "Municipal-scale governance with liquid delegation (depth cap), mandatory predictions, " +
    "community notes, surveys, and blockchain integrity.",
  delegation: Object.freeze({
    delegationMode: "open" as const,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: 3,
    maxDelegatesPerParticipant: null,
    maxAge: 31_536_000_000,
    visibility: Object.freeze({ mode: "private" as const, incomingVisibility: "direct" as const }),
  }),
  ballot: Object.freeze({
    secrecy: "anonymous-auditable" as const,
    delegateVoteVisibility: "delegators-only" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
    resultsVisibility: "sealed" as const,
    allowVoteChange: true,
  }),
  features: Object.freeze({
    predictions: "mandatory" as const,
    communityNotes: true,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: true,
    surveyResponseAnonymity: "anonymous" as const,
    awarenessIntensity: "aggressive" as const,
    blockchainIntegrity: true,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.05,
  }),
  timeline: Object.freeze({
    deliberationDays: 14,
    curationDays: 3,
    votingDays: 14,
  }),
});

/**
 * All named presets, indexed by PresetName.
 * Presets are frozen — use deriveConfig() to create customizations.
 */
export const PRESETS: Readonly<Record<PresetName, GovernanceConfig>> = Object.freeze({
  MODERN_DEMOCRACY,
  TOWN_HALL,
  SWISS_MODEL,
  LIQUID_STANDARD,
  LIQUID_ACCOUNTABLE,
  BOARD_PROXY,
  CIVIC_PARTICIPATORY,
});

/** The default preset used for new group creation. */
export const DEFAULT_PRESET: PresetName = "MODERN_DEMOCRACY";

/** Returns a preset by name, or undefined if the name is not recognized. */
export function getPreset(name: PresetName): GovernanceConfig {
  return PRESETS[name];
}

/** Returns all available preset names. */
export function getPresetNames(): readonly PresetName[] {
  return Object.keys(PRESETS) as PresetName[];
}
