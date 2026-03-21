/**
 * Topic taxonomy definitions per assembly.
 *
 * Each topic has a key (for referencing in issue/delegation assignments),
 * a display name, an optional parentKey, and a sortOrder.
 *
 * Greenfield uses DIRECT_DEMOCRACY (no delegation) so no topics needed.
 */

export interface TopicDef {
  assemblyKey: string;
  key: string;
  name: string;
  parentKey: string | null;
  sortOrder: number;
}

export const TOPICS: TopicDef[] = [
  // ── OSC Governance Board ─────────────────────────────────────────────

  // Root topics
  { assemblyKey: "osc", key: "technical",     name: "Technical",     parentKey: null,          sortOrder: 0 },
  { assemblyKey: "osc", key: "community",     name: "Community",     parentKey: null,          sortOrder: 10 },
  { assemblyKey: "osc", key: "roadmap",       name: "Roadmap",       parentKey: null,          sortOrder: 20 },
  // Technical children
  { assemblyKey: "osc", key: "dependencies",  name: "Dependencies",  parentKey: "technical",   sortOrder: 0 },
  { assemblyKey: "osc", key: "security",      name: "Security",      parentKey: "technical",   sortOrder: 10 },
  { assemblyKey: "osc", key: "infrastructure",name: "Infrastructure", parentKey: "technical",  sortOrder: 20 },
  // Community children
  { assemblyKey: "osc", key: "governance",    name: "Governance",    parentKey: "community",   sortOrder: 0 },
  { assemblyKey: "osc", key: "contributors",  name: "Contributors",  parentKey: "community",   sortOrder: 10 },

  // ── Municipal Budget Committee ───────────────────────────────────────

  // Root topics
  { assemblyKey: "municipal", key: "infrastructure", name: "Infrastructure", parentKey: null,             sortOrder: 0 },
  { assemblyKey: "municipal", key: "social",         name: "Social Services", parentKey: null,            sortOrder: 10 },
  { assemblyKey: "municipal", key: "environment",    name: "Environment",    parentKey: null,             sortOrder: 20 },
  // Infrastructure children
  { assemblyKey: "municipal", key: "transit",        name: "Transit",        parentKey: "infrastructure", sortOrder: 0 },
  { assemblyKey: "municipal", key: "buildings",      name: "Buildings",      parentKey: "infrastructure", sortOrder: 10 },
  { assemblyKey: "municipal", key: "roads",          name: "Roads",          parentKey: "infrastructure", sortOrder: 20 },
  // Social Services children
  { assemblyKey: "municipal", key: "health",         name: "Health",         parentKey: "social",         sortOrder: 0 },
  { assemblyKey: "municipal", key: "housing",        name: "Housing",        parentKey: "social",         sortOrder: 10 },
  // Environment children
  { assemblyKey: "municipal", key: "energy",         name: "Energy",         parentKey: "environment",    sortOrder: 0 },
  { assemblyKey: "municipal", key: "parks",          name: "Parks",          parentKey: "environment",    sortOrder: 10 },

  // ── Youth Advisory Panel ─────────────────────────────────────────────

  // Root topics
  { assemblyKey: "youth", key: "education",   name: "Education",        parentKey: null,          sortOrder: 0 },
  { assemblyKey: "youth", key: "wellness",    name: "Health & Wellness", parentKey: null,         sortOrder: 10 },
  { assemblyKey: "youth", key: "community",   name: "Community",        parentKey: null,          sortOrder: 20 },
  // Education children
  { assemblyKey: "youth", key: "stem",        name: "STEM Programs",    parentKey: "education",   sortOrder: 0 },
  { assemblyKey: "youth", key: "digital",     name: "Digital Literacy",  parentKey: "education",  sortOrder: 10 },
  // Health & Wellness children
  { assemblyKey: "youth", key: "mental-health", name: "Mental Health",  parentKey: "wellness",    sortOrder: 0 },
  { assemblyKey: "youth", key: "sports",      name: "Sports & Recreation", parentKey: "wellness", sortOrder: 10 },
  // Community children
  { assemblyKey: "youth", key: "events",      name: "Events",           parentKey: "community",   sortOrder: 0 },
  { assemblyKey: "youth", key: "environment", name: "Environment",      parentKey: "community",   sortOrder: 10 },

  // ── Board of Directors ───────────────────────────────────────────────

  // Root topics
  { assemblyKey: "board", key: "strategic",   name: "Strategic",        parentKey: null,          sortOrder: 0 },
  { assemblyKey: "board", key: "finance",     name: "Finance",          parentKey: null,          sortOrder: 10 },
  { assemblyKey: "board", key: "governance",  name: "Governance",       parentKey: null,          sortOrder: 20 },
  // Strategic children
  { assemblyKey: "board", key: "expansion",   name: "Market Expansion", parentKey: "strategic",   sortOrder: 0 },
  { assemblyKey: "board", key: "partnerships", name: "Partnerships",   parentKey: "strategic",   sortOrder: 10 },
  // Finance children
  { assemblyKey: "board", key: "dividends",   name: "Dividends",        parentKey: "finance",     sortOrder: 0 },
  { assemblyKey: "board", key: "compensation", name: "Compensation",   parentKey: "finance",     sortOrder: 10 },
  // Governance children
  { assemblyKey: "board", key: "officers",    name: "Board Officers",   parentKey: "governance",  sortOrder: 0 },
  { assemblyKey: "board", key: "committees",  name: "Committees",       parentKey: "governance",  sortOrder: 10 },

  // ── Riverside Community Center ──────────────────────────────────────
  // Root topics
  { assemblyKey: "riverside", key: "programs",     name: "Programs",     parentKey: null,          sortOrder: 0 },
  { assemblyKey: "riverside", key: "facilities",   name: "Facilities",   parentKey: null,          sortOrder: 10 },
  { assemblyKey: "riverside", key: "budget",       name: "Budget",       parentKey: null,          sortOrder: 20 },
  // Programs children
  { assemblyKey: "riverside", key: "youth",        name: "Youth",        parentKey: "programs",    sortOrder: 0 },
  { assemblyKey: "riverside", key: "adult",        name: "Adult",        parentKey: "programs",    sortOrder: 10 },
  // Facilities children
  { assemblyKey: "riverside", key: "maintenance",  name: "Maintenance",  parentKey: "facilities",  sortOrder: 0 },
  { assemblyKey: "riverside", key: "improvements", name: "Improvements", parentKey: "facilities",  sortOrder: 10 },
  // Budget children
  { assemblyKey: "riverside", key: "fees",         name: "Fees",         parentKey: "budget",      sortOrder: 0 },
  { assemblyKey: "riverside", key: "grants",       name: "Grants",       parentKey: "budget",      sortOrder: 10 },
];
