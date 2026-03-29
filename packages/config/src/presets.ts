/**
 * @votiverse/config — Named presets
 *
 * Curated governance configurations — named points in the 10-parameter space.
 * Each represents a genuinely different governance philosophy, not a parameter tweak.
 *
 * 10 parameters across 3 sections: delegation (2) + ballot (5) + timeline (3).
 * Capability toggles (community notes, surveys, scoring) are managed by the
 * backend's group capability registry, not by presets.
 *
 * Presets are frozen objects — customization produces a new config
 * derived from a preset, never mutates the preset.
 */

import type { GovernanceConfig, PresetName } from "./types.js";

/**
 * Liquid Delegation: The recommended default for any group.
 * Candidates for discoverability and accountability, transitive delegation
 * chains, and structured deliberation with a curation phase.
 * Secret ballot, sealed results.
 * Typical use: any group that wants a well-rounded governance system.
 */
const LIQUID_DELEGATION: GovernanceConfig = Object.freeze({
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
  timeline: Object.freeze({
    deliberationDays: 7,
    curationDays: 0,
    votingDays: 7,
  }),
});

/**
 * Swiss Votation: Direct democracy with structured deliberation.
 * No delegation, with a curation phase for the voting booklet.
 * Typical use: cooperatives, associations, civic groups.
 */
const SWISS_VOTATION: GovernanceConfig = Object.freeze({
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
  timeline: Object.freeze({
    deliberationDays: 3,
    curationDays: 0,
    votingDays: 3,
  }),
});

/**
 * Civic Participatory: Liquid delegation at municipal scale.
 * Longer timelines for broad participation.
 * Typical use: cities, participatory budgeting, citizen assemblies.
 */
const CIVIC: GovernanceConfig = Object.freeze({
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
