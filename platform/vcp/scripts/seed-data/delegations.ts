/**
 * Delegation graph definitions per assembly.
 *
 * Each entry references participant names (resolved to IDs at seed time).
 * topicScope is empty array for global delegations.
 */

export interface DelegationDef {
  assemblyKey: string;
  source: string;
  target: string;
  topicScope: string[];
  /** Topic keys to resolve to IDs at seed time. Overrides topicScope when present. */
  topicKeys?: string[];
  /** For issue-scoped delegations: event key to resolve the issue ID. */
  issueEventKey?: string;
  /** For issue-scoped delegations: index of the issue within the event. */
  issueIndex?: number;
}

export const DELEGATIONS: DelegationDef[] = [
  // ── OSC Governance Board (LIQUID_STANDARD — transitive, topic-scoped) ──

  // Simple delegations
  { assemblyKey: "osc", source: "Zara Ibrahim", target: "Anika Patel", topicScope: [] },
  { assemblyKey: "osc", source: "Tyler Nguyen", target: "Leo Fernandez", topicScope: [] },
  { assemblyKey: "osc", source: "Oscar Lindgren", target: "Marcus Chen", topicScope: [] },
  { assemblyKey: "osc", source: "Stefan Kovac", target: "Jordan Blake", topicScope: [] },

  // Chiara delegates to Mei-Ling but will vote directly on some issues (override test)
  { assemblyKey: "osc", source: "Chiara Rossi", target: "Mei-Ling Wu", topicScope: [] },

  // Chain depth 2: Nadia → Chiara → Mei-Ling
  { assemblyKey: "osc", source: "Nadia Boutros", target: "Chiara Rossi", topicScope: [] },

  // Chain depth 2: Tanya → Stefan → Jordan
  { assemblyKey: "osc", source: "Tanya Volkov", target: "Stefan Kovac", topicScope: [] },

  // ── Municipal Budget Committee (CIVIC_PARTICIPATORY — depth cap 3) ─────

  { assemblyKey: "municipal", source: "Sunita Rao", target: "Carmen Delgado", topicScope: [] },
  { assemblyKey: "municipal", source: "Benjamin Archer", target: "Antoine Lefebvre", topicScope: [] },
  { assemblyKey: "municipal", source: "Hana Yokota", target: "Priya Sharma", topicScope: [] },
  { assemblyKey: "municipal", source: "Diego Morales", target: "Ayesha Khan", topicScope: [] },

  // Chain depth 2: Omar → Kwame → Marcus
  { assemblyKey: "municipal", source: "Omar Hadid", target: "Kwame Mensah", topicScope: [] },
  { assemblyKey: "municipal", source: "Kwame Mensah", target: "Marcus Chen", topicScope: [] },

  // Chain depth 2: Lars → Fiona → Isabel
  { assemblyKey: "municipal", source: "Lars Johansson", target: "Fiona MacLeod", topicScope: [] },
  { assemblyKey: "municipal", source: "Fiona MacLeod", target: "Isabel Cruz", topicScope: [] },

  // ── Youth Advisory Panel (LIQUID_ACCOUNTABLE — transitive) ─────────────

  { assemblyKey: "youth", source: "Jin Park", target: "Sofia Reyes", topicScope: [] },
  { assemblyKey: "youth", source: "Chloe Beaumont", target: "Priya Sharma", topicScope: [] },
  { assemblyKey: "youth", source: "Emilia Strand", target: "Liam Torres", topicScope: [] },

  // ── Topic-scoped delegations ──────────────────────────────────────────

  // OSC: Kai delegates to Leo on technical topics only
  { assemblyKey: "osc", source: "Kai Andersen", target: "Leo Fernandez", topicScope: [], topicKeys: ["technical"] },
  // OSC: Rina delegates to Sofia on community topics only
  { assemblyKey: "osc", source: "Rina Kurosawa", target: "Sofia Reyes", topicScope: [], topicKeys: ["community"] },

  // Municipal: Nkechi delegates to Carmen on infrastructure topics
  { assemblyKey: "municipal", source: "Nkechi Adeyemi", target: "Carmen Delgado", topicScope: [], topicKeys: ["infrastructure"] },
  // Municipal: Gabriela delegates to Priya on social services topics
  { assemblyKey: "municipal", source: "Gabriela Santos", target: "Priya Sharma", topicScope: [], topicKeys: ["social"] },

  // Youth: Aisha delegates to Sofia on education topics
  { assemblyKey: "youth", source: "Aisha Moyo", target: "Sofia Reyes", topicScope: [], topicKeys: ["education"] },
  // Youth: Tariq delegates to Liam on wellness topics
  { assemblyKey: "youth", source: "Tariq Hassan", target: "Liam Torres", topicScope: [], topicKeys: ["wellness"] },

  // ── Board of Directors (BOARD_PROXY — non-transitive, single delegate) ─

  { assemblyKey: "board", source: "Margaret Ashworth", target: "Victoria Harrington", topicScope: [] },
  { assemblyKey: "board", source: "David Greenfield", target: "Robert Blackwell", topicScope: [] },
  { assemblyKey: "board", source: "Elizabeth Fairfax", target: "Catherine Zhao", topicScope: [] },

  // ── Riverside Community Center (CIVIC_PARTICIPATORY — topic-scoped) ──

  // Priya trusts Sam on all budget matters
  { assemblyKey: "riverside", source: "Priya Nair", target: "Sam Okonkwo", topicScope: [], topicKeys: ["budget"] },
  // Priya trusts Marco on all facilities matters
  { assemblyKey: "riverside", source: "Priya Nair", target: "Marco Rossi", topicScope: [], topicKeys: ["facilities"] },
  // David trusts Sam on budget matters
  { assemblyKey: "riverside", source: "David Park", target: "Sam Okonkwo", topicScope: [], topicKeys: ["budget"] },
  // Kwesi trusts Sam on budget matters
  { assemblyKey: "riverside", source: "Kwesi Appiah", target: "Sam Okonkwo", topicScope: [], topicKeys: ["budget"] },
  // Janet trusts Leah specifically on youth programs
  { assemblyKey: "riverside", source: "Janet Kim", target: "Leah Chen", topicScope: [], topicKeys: ["youth"] },
  // Nina trusts Leah on all programs (covers both Youth and Adult)
  { assemblyKey: "riverside", source: "Nina Volkov", target: "Leah Chen", topicScope: [], topicKeys: ["programs"] },
  // Fatima trusts Marco specifically on facilities maintenance
  { assemblyKey: "riverside", source: "Fatima Al-Rashid", target: "Marco Rossi", topicScope: [], topicKeys: ["maintenance"] },

  // Issue-scoped: Tomás delegates the HVAC issue specifically to Marco
  // (He's new and doesn't want to delegate all Facilities — just this one complex issue)
  { assemblyKey: "riverside", source: "Tomás Herrera", target: "Marco Rossi", topicScope: [], issueEventKey: "riverside-summer", issueIndex: 0 },
];
