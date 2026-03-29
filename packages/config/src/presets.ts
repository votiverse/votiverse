/**
 * @votiverse/config — Named presets
 *
 * Curated governance configurations — named points in the 13-parameter space.
 * Each represents a genuinely different governance philosophy, not a parameter tweak.
 *
 * Presets are frozen objects — customization produces a new config
 * derived from a preset, never mutates the preset.
 */

import type { GovernanceConfig, PresetName } from "./types.js";

/**
 * Liquid Delegation: The recommended default for any group.
 * Candidates for discoverability and accountability, transitive delegation
 * chains, community notes, predictions, surveys, and structured deliberation
 * with a curation phase. Secret ballot, sealed results.
 * Typical use: any group that wants a well-rounded governance system.
 */
const LIQUID_DELEGATION: GovernanceConfig = Object.freeze({
  name: "Liquid Delegation",
  description:
    "Delegate to trusted candidates or any member, verify with community notes, " +
    "or vote directly. The recommended starting point for any group.",
  delegation: Object.freeze({
    candidacy: true,
    transferable: true,
  }),
  ballot: Object.freeze({
    secret: true,
    liveResults: false,
    allowVoteChange: true,
    quorum: 0.1,
    method: "majority" as const,
  }),
  features: Object.freeze({
    communityNotes: true,
    predictions: true,
    surveys: true,
    scoring: false,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 2,
    votingDays: 7,
  }),
});

/**
 * Direct Democracy: Every member votes on every question.
 * No delegation, no community notes, no curation.
 * Typical use: small clubs, parent committees, informal groups.
 */
const DIRECT_DEMOCRACY: GovernanceConfig = Object.freeze({
  name: "Direct Democracy",
  description: "Every member votes on every question. No delegation. Simple majority decides.",
  delegation: Object.freeze({
    candidacy: false,
    transferable: false,
  }),
  ballot: Object.freeze({
    secret: true,
    liveResults: false,
    allowVoteChange: true,
    quorum: 0,
    method: "majority" as const,
  }),
  features: Object.freeze({
    communityNotes: false,
    predictions: false,
    surveys: false,
    scoring: false,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 0,
    votingDays: 7,
  }),
});

/**
 * Swiss Votation: Direct democracy with structured deliberation.
 * No delegation, but community notes provide crowd-sourced context
 * and predictions encourage accountability. Curation phase for the
 * voting booklet.
 * Typical use: cooperatives, associations, civic groups.
 */
const SWISS_VOTATION: GovernanceConfig = Object.freeze({
  name: "Swiss Votation",
  description:
    "Direct democracy with structured voting booklets, community notes, and predictions. " +
    "Informed direct participation.",
  delegation: Object.freeze({
    candidacy: false,
    transferable: false,
  }),
  ballot: Object.freeze({
    secret: true,
    liveResults: false,
    allowVoteChange: true,
    quorum: 0.2,
    method: "majority" as const,
  }),
  features: Object.freeze({
    communityNotes: true,
    predictions: true,
    surveys: false,
    scoring: false,
  }),
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 2,
    votingDays: 7,
  }),
});

/**
 * Liquid Open: Informal liquid democracy for groups where everyone knows each other.
 * No formal candidates — anyone delegates to anyone. Public ballots with live results.
 * Typical use: tech communities, professional associations, medium organizations with high trust.
 */
const LIQUID_OPEN: GovernanceConfig = Object.freeze({
  name: "Liquid Open",
  description:
    "Anyone can delegate to anyone. Public ballots, live results. " +
    "For groups where everyone knows each other.",
  delegation: Object.freeze({
    candidacy: false,
    transferable: true,
  }),
  ballot: Object.freeze({
    secret: false,
    liveResults: true,
    allowVoteChange: true,
    quorum: 0.1,
    method: "majority" as const,
  }),
  features: Object.freeze({
    communityNotes: false,
    predictions: false,
    surveys: false,
    scoring: false,
  }),
  timeline: Object.freeze({
    deliberationDays: 5,
    curationDays: 0,
    votingDays: 5,
  }),
});

/**
 * Representative: Classic proxy voting.
 * Declare a candidate, appoint them as your representative.
 * They vote for you but cannot transfer your vote further.
 * Typical use: corporate boards, HOAs, unions, formal committees.
 */
const REPRESENTATIVE: GovernanceConfig = Object.freeze({
  name: "Representative",
  description:
    "Appoint a declared candidate as your proxy. Non-transitive — " +
    "representatives vote directly, no chains.",
  delegation: Object.freeze({
    candidacy: true,
    transferable: false,
  }),
  ballot: Object.freeze({
    secret: true,
    liveResults: false,
    allowVoteChange: true,
    quorum: 0.5,
    method: "majority" as const,
  }),
  features: Object.freeze({
    communityNotes: false,
    predictions: false,
    surveys: false,
    scoring: true,
  }),
  timeline: Object.freeze({
    deliberationDays: 3,
    curationDays: 0,
    votingDays: 3,
  }),
});

/**
 * Civic Participatory: Liquid delegation at municipal scale.
 * Longer timelines, full feature set with community notes, predictions,
 * and surveys.
 * Typical use: cities, participatory budgeting, citizen assemblies.
 */
const CIVIC: GovernanceConfig = Object.freeze({
  name: "Civic Participatory",
  description:
    "Municipal-scale governance with liquid delegation, community notes, " +
    "predictions, surveys, and longer timelines for broad participation.",
  delegation: Object.freeze({
    candidacy: true,
    transferable: true,
  }),
  ballot: Object.freeze({
    secret: true,
    liveResults: false,
    allowVoteChange: true,
    quorum: 0.1,
    method: "majority" as const,
  }),
  features: Object.freeze({
    communityNotes: true,
    predictions: true,
    surveys: true,
    scoring: false,
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
  LIQUID_DELEGATION,
  DIRECT_DEMOCRACY,
  SWISS_VOTATION,
  LIQUID_OPEN,
  REPRESENTATIVE,
  CIVIC,
});

/** The default preset used for new group creation. */
export const DEFAULT_PRESET: PresetName = "LIQUID_DELEGATION";

/** Returns a preset by name, or undefined if the name is not recognized. */
export function getPreset(name: PresetName): GovernanceConfig {
  return PRESETS[name];
}

/** Returns all available preset names. */
export function getPresetNames(): readonly PresetName[] {
  return Object.keys(PRESETS) as PresetName[];
}
