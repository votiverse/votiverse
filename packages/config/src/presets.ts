/**
 * @votiverse/config — Named presets
 *
 * Curated governance configurations with sensible defaults.
 * Presets are frozen objects — customization produces a new config
 * derived from a preset, never mutates the preset.
 */

import type { GovernanceConfig, PresetName } from "./types.js";

/**
 * Town Hall: Pure direct democracy.
 * Secret ballot, simple majority, no delegation.
 * Typical use: small clubs, parent committees, informal groups.
 */
const TOWN_HALL: GovernanceConfig = Object.freeze({
  name: "Town Hall",
  description: "Direct democracy with secret ballot. No delegation. Simple majority decides.",
  delegation: Object.freeze({
    enabled: false,
    topicScoped: false,
    transitive: false,
    revocableAnytime: false,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "private" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0,
    participationMode: "voluntary" as const,
  }),
  features: Object.freeze({
    predictions: "disabled" as const,
    communityNotes: false,
    polls: false,
    awarenessIntensity: "minimal" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 1.0,
  }),
});

/**
 * Swiss Model: Direct democracy per issue with structured information.
 * Predictions encouraged, community notes enabled.
 * Typical use: associations, cooperatives, civic groups.
 */
const SWISS_MODEL: GovernanceConfig = Object.freeze({
  name: "Swiss Model",
  description:
    "Direct democracy per issue with structured voting booklets, predictions encouraged, community notes enabled.",
  delegation: Object.freeze({
    enabled: false,
    topicScoped: false,
    transitive: false,
    revocableAnytime: false,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "private" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.2,
    participationMode: "voluntary" as const,
  }),
  features: Object.freeze({
    predictions: "encouraged" as const,
    communityNotes: true,
    polls: false,
    awarenessIntensity: "minimal" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 1.0,
  }),
});

/**
 * Liquid Standard: Topic-specific liquid delegation.
 * Transitive, revocable anytime, delegate votes visible to delegators.
 * Typical use: medium organizations, tech communities, professional associations.
 */
const LIQUID_STANDARD: GovernanceConfig = Object.freeze({
  name: "Liquid Standard",
  description:
    "Topic-specific liquid delegation. Transitive, revocable anytime, delegate votes visible to delegators.",
  delegation: Object.freeze({
    enabled: true,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
  }),
  ballot: Object.freeze({
    secrecy: "public" as const,
    delegateVoteVisibility: "delegators-only" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
  }),
  features: Object.freeze({
    predictions: "optional" as const,
    communityNotes: false,
    polls: false,
    awarenessIntensity: "standard" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.15,
  }),
});

/**
 * Liquid Accountable: Liquid Standard plus mandatory predictions and full awareness.
 * Delegate track records public.
 * Typical use: organizations that prioritize long-term accountability.
 */
const LIQUID_ACCOUNTABLE: GovernanceConfig = Object.freeze({
  name: "Liquid Accountable",
  description:
    "Liquid delegation with mandatory predictions, full awareness layer, and public delegate track records.",
  delegation: Object.freeze({
    enabled: true,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: null,
    maxDelegatesPerParticipant: null,
  }),
  ballot: Object.freeze({
    secrecy: "public" as const,
    delegateVoteVisibility: "public" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
  }),
  features: Object.freeze({
    predictions: "mandatory" as const,
    communityNotes: true,
    polls: true,
    awarenessIntensity: "aggressive" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.1,
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
    enabled: true,
    topicScoped: false,
    transitive: false,
    revocableAnytime: false,
    maxChainDepth: 1,
    maxDelegatesPerParticipant: 1,
  }),
  ballot: Object.freeze({
    secrecy: "secret" as const,
    delegateVoteVisibility: "private" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.5,
    participationMode: "voluntary" as const,
  }),
  features: Object.freeze({
    predictions: "disabled" as const,
    communityNotes: false,
    polls: false,
    awarenessIntensity: "minimal" as const,
    blockchainIntegrity: false,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.5,
  }),
});

/**
 * Civic Participatory: Liquid delegation with chain depth cap and full accountability.
 * Verified identity, mandatory predictions, community notes, polls, blockchain integrity.
 * Typical use: municipal deployments, participatory budgeting, citizen assemblies.
 */
const CIVIC_PARTICIPATORY: GovernanceConfig = Object.freeze({
  name: "Civic Participatory",
  description:
    "Liquid delegation with chain depth cap, mandatory predictions, community notes, polls, and blockchain integrity.",
  delegation: Object.freeze({
    enabled: true,
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxChainDepth: 3,
    maxDelegatesPerParticipant: null,
  }),
  ballot: Object.freeze({
    secrecy: "anonymous-auditable" as const,
    delegateVoteVisibility: "delegators-only" as const,
    votingMethod: "simple-majority" as const,
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary" as const,
  }),
  features: Object.freeze({
    predictions: "mandatory" as const,
    communityNotes: true,
    polls: true,
    awarenessIntensity: "aggressive" as const,
    blockchainIntegrity: true,
  }),
  thresholds: Object.freeze({
    concentrationAlertThreshold: 0.05,
  }),
});

/**
 * All named presets, indexed by PresetName.
 * Presets are frozen — use deriveConfig() to create customizations.
 */
export const PRESETS: Readonly<Record<PresetName, GovernanceConfig>> = Object.freeze({
  TOWN_HALL,
  SWISS_MODEL,
  LIQUID_STANDARD,
  LIQUID_ACCOUNTABLE,
  BOARD_PROXY,
  CIVIC_PARTICIPATORY,
});

/** Returns a preset by name, or undefined if the name is not recognized. */
export function getPreset(name: PresetName): GovernanceConfig {
  return PRESETS[name];
}

/** Returns all available preset names. */
export function getPresetNames(): readonly PresetName[] {
  return Object.keys(PRESETS) as PresetName[];
}
