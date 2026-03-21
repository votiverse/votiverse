/**
 * Pre-cast vote definitions.
 *
 * Each entry references an event key, issue index, participant name, and choice.
 * Delegators generally should NOT vote (to test delegation behavior) unless
 * we're specifically testing the override rule.
 */

export interface VoteDef {
  assemblyKey: string;
  eventKey: string;
  issueIndex: number;
  participant: string;
  choice: string;
}

export const VOTES: VoteDef[] = [
  // ════════════════════════════════════════════════════════════════════════
  // Greenfield Community Council — DIRECT_DEMOCRACY (no delegation, all direct)
  // ════════════════════════════════════════════════════════════════════════

  // ── Spring Community Improvement Vote (CLOSED) ─────────────────────
  // Issue 0: "Renovate Elm Street Playground" — passes 8-3 (1 didn't vote)
  ...greenfield("greenfield-spring", 0, [
    ["Elena Vasquez", "for"],
    ["Thomas Wright", "for"],
    ["Amara Johnson", "for"],
    ["Hiroshi Tanaka", "against"],
    ["Claire Dubois", "for"],
    ["Samuel Okonkwo", "for"],
    ["Fatima Al-Hassan", "for"],
    ["Robert Kim", "against"],
    ["Linda Muller", "for"],
    ["Yuki Nakamura", "against"],
    ["David Petrov", "for"],
    // Ingrid Svensson didn't vote
  ]),

  // Issue 1: "Adopt Nighttime Noise Ordinance" — tight: 6-5 (1 didn't vote)
  ...greenfield("greenfield-spring", 1, [
    ["Elena Vasquez", "for"],
    ["Thomas Wright", "against"],
    ["Amara Johnson", "for"],
    ["Hiroshi Tanaka", "for"],
    ["Claire Dubois", "against"],
    ["Samuel Okonkwo", "against"],
    ["Fatima Al-Hassan", "for"],
    ["Robert Kim", "against"],
    ["Linda Muller", "for"],
    ["Yuki Nakamura", "for"],
    ["David Petrov", "against"],
    // Ingrid didn't vote
  ]),

  // Issue 2: "Fund Summer Block Party" — passes 9-1 (2 didn't vote)
  ...greenfield("greenfield-spring", 2, [
    ["Elena Vasquez", "for"],
    ["Thomas Wright", "for"],
    ["Amara Johnson", "for"],
    ["Hiroshi Tanaka", "for"],
    ["Claire Dubois", "for"],
    ["Samuel Okonkwo", "for"],
    ["Fatima Al-Hassan", "for"],
    ["Robert Kim", "against"],
    ["Linda Muller", "for"],
    ["Yuki Nakamura", "for"],
    // David, Ingrid didn't vote
  ]),

  // ── Q1 Infrastructure Decisions (VOTING — partial) ─────────────────
  // Issue 0: "Repair Community Center Roof" — 5 voted so far
  ...greenfield("greenfield-infra", 0, [
    ["Elena Vasquez", "for"],
    ["Thomas Wright", "for"],
    ["Amara Johnson", "for"],
    ["Hiroshi Tanaka", "for"],
    ["Claire Dubois", "against"],
  ]),

  // Issue 1: "Install EV Charging Stations" — no votes yet (for testing)

  // Issue 2: "Approve Sidewalk Accessibility Upgrades" — 3 voted
  ...greenfield("greenfield-infra", 2, [
    ["Elena Vasquez", "for"],
    ["Samuel Okonkwo", "for"],
    ["Fatima Al-Hassan", "for"],
  ]),

  // Issue 3: "Extend Community Garden Lease" — 1 vote
  ...greenfield("greenfield-infra", 3, [
    ["Linda Muller", "for"],
  ]),

  // ════════════════════════════════════════════════════════════════════════
  // OSC Governance Board — LIQUID_OPEN (with delegations)
  // ════════════════════════════════════════════════════════════════════════

  // ── 2025 Roadmap Retrospective (CLOSED) ────────────────────────────
  // Direct voters (non-delegators): Sofia, Marcus, Anika, Leo, Mei-Ling, Jordan, Kai, Rina
  // Delegators who don't vote: Zara→Anika, Tyler→Leo, Oscar→Marcus, Stefan→Jordan,
  //   Chiara→Mei-Ling, Nadia→Chiara→Mei-Ling, Tanya→Stefan→Jordan

  // Issue 0: "Approve 2025 Feature Completion Report" — consensus
  ...osc("osc-retro", 0, [
    ["Sofia Reyes", "for"],
    ["Marcus Chen", "for"],
    ["Anika Patel", "for"],    // carries Zara's weight
    ["Leo Fernandez", "for"],   // carries Tyler's weight
    ["Mei-Ling Wu", "for"],     // carries Chiara + Nadia's weight
    ["Jordan Blake", "for"],    // carries Stefan + Tanya's weight
    ["Kai Andersen", "for"],
    ["Rina Kurosawa", "against"],
  ]),

  // Issue 1: "Ratify Deprecation of Legacy API v1" — passes 6-2
  ...osc("osc-retro", 1, [
    ["Sofia Reyes", "for"],
    ["Marcus Chen", "for"],
    ["Anika Patel", "for"],
    ["Leo Fernandez", "against"],
    ["Mei-Ling Wu", "for"],
    ["Jordan Blake", "for"],
    ["Kai Andersen", "against"],
    ["Rina Kurosawa", "for"],
  ]),

  // Issue 2: "Accept Community Contributor Recognition Awards" — unanimous
  ...osc("osc-retro", 2, [
    ["Sofia Reyes", "for"],
    ["Marcus Chen", "for"],
    ["Anika Patel", "for"],
    ["Leo Fernandez", "for"],
    ["Mei-Ling Wu", "for"],
    ["Jordan Blake", "for"],
    ["Kai Andersen", "for"],
    ["Rina Kurosawa", "for"],
  ]),

  // ── Dependency Policy Review (VOTING — partial) ────────────────────
  // Issue 0: "Mandate License Compatibility Checks" — 4 voted
  ...osc("osc-deps", 0, [
    ["Sofia Reyes", "for"],
    ["Marcus Chen", "for"],
    ["Anika Patel", "for"],     // carries Zara's weight
    ["Kai Andersen", "against"],
  ]),

  // Issue 1: "Adopt Automated Vulnerability Scanning" — 3 voted
  ...osc("osc-deps", 1, [
    ["Sofia Reyes", "for"],
    ["Leo Fernandez", "for"],   // carries Tyler's weight
    ["Rina Kurosawa", "for"],
  ]),

  // Issue 2: "Restrict Pre-1.0 Dependencies" — 2 voted, contentious
  ...osc("osc-deps", 2, [
    ["Marcus Chen", "against"],
    ["Kai Andersen", "for"],
  ]),

  // Issue 3: "Two-Maintainer Review for Security Patches" — Chiara overrides delegation
  ...osc("osc-deps", 3, [
    ["Sofia Reyes", "for"],
    ["Chiara Rossi", "for"],    // OVERRIDE: delegates to Mei-Ling but votes directly here
    ["Jordan Blake", "for"],    // carries Stefan + Tanya's weight
  ]),

  // Issue 4: "Fund External Security Audit" — no votes yet

  // ── Community Governance Evolution (VOTING — no votes yet) ─────────
  // No votes cast — all issues pending

  // ════════════════════════════════════════════════════════════════════════
  // Municipal Budget Committee — CIVIC (with delegation chains)
  // ════════════════════════════════════════════════════════════════════════

  // ── Participatory Budget Cycle 2025 (CLOSED) ──────────────────────
  // Direct voters: Marcus, Priya, James, Carmen, Antoine, Nkechi, Mikhail, Isabel, Ayesha, Gabriela
  // Delegators: Sunita→Carmen, Benjamin→Antoine, Hana→Priya, Diego→Ayesha,
  //   Omar→Kwame→Marcus, Lars→Fiona→Isabel

  // Issue 0: "Allocate $2M for Public Transit Expansion" — passes 8-2
  ...municipal("municipal-budget", 0, [
    ["Marcus Chen", "for"],      // carries Omar→Kwame chain weight
    ["Priya Sharma", "for"],     // carries Hana's weight
    ["James Okafor", "for"],
    ["Carmen Delgado", "for"],   // carries Sunita's weight
    ["Antoine Lefebvre", "against"], // carries Benjamin's weight
    ["Nkechi Adeyemi", "for"],
    ["Mikhail Petrov", "against"],
    ["Isabel Cruz", "for"],      // carries Lars→Fiona chain weight
    ["Ayesha Khan", "for"],      // carries Diego's weight
    ["Gabriela Santos", "for"],
  ]),

  // Issue 1: "Fund Community Health Clinic Staffing" — passes 9-1
  ...municipal("municipal-budget", 1, [
    ["Marcus Chen", "for"],
    ["Priya Sharma", "for"],
    ["James Okafor", "for"],
    ["Carmen Delgado", "for"],
    ["Antoine Lefebvre", "for"],
    ["Nkechi Adeyemi", "for"],
    ["Mikhail Petrov", "for"],
    ["Isabel Cruz", "against"],
    ["Ayesha Khan", "for"],
    ["Gabriela Santos", "for"],
  ]),

  // Issue 2: "Renovate Downtown Public Library" — passes 7-3
  ...municipal("municipal-budget", 2, [
    ["Marcus Chen", "for"],
    ["Priya Sharma", "against"],
    ["James Okafor", "for"],
    ["Carmen Delgado", "for"],
    ["Antoine Lefebvre", "against"],
    ["Nkechi Adeyemi", "for"],
    ["Mikhail Petrov", "for"],
    ["Isabel Cruz", "for"],
    ["Ayesha Khan", "against"],
    ["Gabriela Santos", "for"],
  ]),

  // Issue 3: "Install Solar Panels on Municipal Buildings" — passes 6-4
  ...municipal("municipal-budget", 3, [
    ["Marcus Chen", "for"],
    ["Priya Sharma", "for"],
    ["James Okafor", "against"],
    ["Carmen Delgado", "against"],
    ["Antoine Lefebvre", "for"],
    ["Nkechi Adeyemi", "against"],
    ["Mikhail Petrov", "for"],
    ["Isabel Cruz", "for"],
    ["Ayesha Khan", "against"],
    ["Gabriela Santos", "for"],
  ]),

  // ── Emergency Infrastructure Measures (VOTING — partial) ───────────
  // Issue 0: "Approve Emergency Bridge Repair Funding" — 6 voted
  ...municipal("municipal-emergency", 0, [
    ["Marcus Chen", "for"],
    ["Priya Sharma", "for"],
    ["James Okafor", "for"],
    ["Carmen Delgado", "for"],
    ["Nkechi Adeyemi", "for"],
    ["Gabriela Santos", "against"],
  ]),

  // Issue 1: "Temporary Traffic Management Plan" — 3 voted
  ...municipal("municipal-emergency", 1, [
    ["Marcus Chen", "for"],
    ["Antoine Lefebvre", "against"],
    ["Mikhail Petrov", "for"],
  ]),

  // Issue 2: "Resident Relocation Assistance" — 2 voted
  ...municipal("municipal-emergency", 2, [
    ["James Okafor", "for"],
    ["Nkechi Adeyemi", "for"],
  ]),

  // ════════════════════════════════════════════════════════════════════════
  // Youth Advisory Panel — LIQUID_DELEGATION (with simple delegations)
  // ════════════════════════════════════════════════════════════════════════

  // ── Youth Program Priorities 2026 (VOTING — some votes) ────────────
  // Direct voters: Sofia (carries Jin), Priya (carries Chloe), Liam (carries Emilia), Aisha, Tariq, Ravi, Nina

  // Issue 0: "Expand After-School STEM Workshops" — 4 voted
  ...youth("youth-priorities", 0, [
    ["Sofia Reyes", "for"],     // carries Jin's weight
    ["Priya Sharma", "for"],    // carries Chloe's weight
    ["Liam Torres", "for"],     // carries Emilia's weight
    ["Aisha Moyo", "for"],
  ]),

  // Issue 1: "Launch Youth Mental Health Support" — 3 voted
  ...youth("youth-priorities", 1, [
    ["Sofia Reyes", "for"],
    ["Tariq Hassan", "for"],
    ["Nina Kowalski", "against"],
  ]),

  // Issue 2: "Create Youth-Led Environmental Action Fund" — 2 voted
  ...youth("youth-priorities", 2, [
    ["Ravi Gupta", "for"],
    ["Aisha Moyo", "for"],
  ]),

  // ════════════════════════════════════════════════════════════════════════
  // Maple Heights Condo Board — LIQUID_DELEGATION
  // ════════════════════════════════════════════════════════════════════════

  // ── Emergency Roof Repair (CLOSED) ───────────────────────────────────
  // Issue 0: "Authorize $45,000 Emergency Roof Repair" — approved 3-0 (unanimous)
  ...maple("maple-roof", 0, [
    ["Elena Vasquez", "for"],
    ["Marcus Chen", "for"],
    ["Thomas Wright", "for"],
  ]),

  // Issue 1: "Funding Source" — Reserve Fund wins 2-1
  ...maple("maple-roof", 1, [
    ["Elena Vasquez", "Reserve Fund"],
    ["Marcus Chen", "Special Assessment"],
    ["Thomas Wright", "Reserve Fund"],
  ]),

  // ════════════════════════════════════════════════════════════════════════
  // Riverside Community Center — CIVIC (with topic delegations)
  // ════════════════════════════════════════════════════════════════════════

  // ── Spring Program & Facilities Review (CLOSED) ─────────────────────

  // Issue 0: "Pool Resurfacing Schedule" (Facilities / Maintenance) — passes 9-1
  // Active delegations: Priya→Marco (facilities), Fatima→Marco (maintenance)
  // Priya and Fatima do NOT vote — their weight flows to Marco (weight 3)
  ...riverside("riverside-spring", 0, [
    ["Diana Reyes", "for"],
    ["Sam Okonkwo", "for"],
    ["Leah Chen", "for"],
    ["Marco Rossi", "for"],       // carries weight 3: self + Priya + Fatima
    ["Tomás Herrera", "for"],
    ["Janet Kim", "for"],
    ["Kwesi Appiah", "for"],
    ["David Park", "against"],
    ["Nina Volkov", "for"],
    ["Rashid Khan", "for"],
    // Priya Nair — delegated to Marco (facilities)
    // Fatima Al-Rashid — delegated to Marco (maintenance)
  ]),

  // Issue 1: "Annual Membership Fee Adjustment" (Budget / Fees) — passes 7-1
  // Active delegations: Priya→Sam (budget), David→Sam (budget), Kwesi→Sam (budget)
  // Priya, David, Kwesi do NOT vote — their weight flows to Sam (weight 4)
  ...riverside("riverside-spring", 1, [
    ["Diana Reyes", "for"],
    ["Sam Okonkwo", "for"],       // carries weight 4: self + Priya + David + Kwesi
    ["Leah Chen", "for"],
    ["Marco Rossi", "for"],
    ["Tomás Herrera", "against"], // opposes fee increase
    ["Janet Kim", "for"],
    ["Fatima Al-Rashid", "for"],
    ["Nina Volkov", "for"],
    ["Rashid Khan", "for"],
    // Priya Nair — delegated to Sam (budget)
    // David Park — delegated to Sam (budget)
    // Kwesi Appiah — delegated to Sam (budget)
  ]),

  // Issue 2: "Youth Summer Basketball League" (Programs / Youth) — passes 10-0
  // Active delegations: Janet→Leah (youth), Nina→Leah (programs, covers youth)
  // Janet and Nina do NOT vote — their weight flows to Leah (weight 3)
  ...riverside("riverside-spring", 2, [
    ["Diana Reyes", "for"],
    ["Sam Okonkwo", "for"],
    ["Leah Chen", "for"],         // carries weight 3: self + Janet + Nina
    ["Marco Rossi", "for"],
    ["Priya Nair", "for"],
    ["Tomás Herrera", "for"],
    ["Kwesi Appiah", "for"],
    ["David Park", "for"],
    ["Fatima Al-Rashid", "for"],
    ["Rashid Khan", "for"],
    // Janet Kim — delegated to Leah (youth)
    // Nina Volkov — delegated to Leah (programs)
  ]),

  // ════════════════════════════════════════════════════════════════════════
  // Board of Directors — REPRESENTATIVE (non-transitive proxy)
  // ════════════════════════════════════════════════════════════════════════

  // ── Q4 2025 Board Resolutions (CLOSED) ─────────────────────────────
  // Direct voters: James, Victoria (carries Margaret), Robert (carries David),
  //   Catherine (carries Elizabeth), William
  // 8 members total, 50% quorum = 4 needed

  // Issue 0: "Approve Merger with Pacific Industries" — passes 4-3 (quorum=5 participating, 4 for)
  ...board("board-q4", 0, [
    ["James Okafor", "for"],
    ["Victoria Harrington", "for"],   // carries Margaret's weight
    ["Robert Blackwell", "against"],  // carries David's weight
    ["Catherine Zhao", "for"],        // carries Elizabeth's weight
    ["William Thornton", "for"],
  ]),

  // Issue 1: "Executive Compensation Package Review" — rejected 3-4
  ...board("board-q4", 1, [
    ["James Okafor", "against"],
    ["Victoria Harrington", "for"],
    ["Robert Blackwell", "against"],
    ["Catherine Zhao", "against"],
    ["William Thornton", "for"],
  ]),

  // Issue 2: "Shareholder Dividend Declaration" — unanimous
  ...board("board-q4", 2, [
    ["James Okafor", "for"],
    ["Victoria Harrington", "for"],
    ["Robert Blackwell", "for"],
    ["Catherine Zhao", "for"],
    ["William Thornton", "for"],
  ]),

  // ── Q1 2026 Strategic Decisions (VOTING — few votes) ───────────────
  // Issue 0: "Authorize New Market Expansion" — 2 voted
  ...board("board-q1", 0, [
    ["James Okafor", "for"],
    ["Victoria Harrington", "for"],  // carries Margaret's weight
  ]),

  // Issue 1: "Appoint Independent Audit Committee Chair" — 1 voted
  ...board("board-q1", 1, [
    ["William Thornton", "for"],
  ]),

  // ── 2026 Maintainer Elections (VOTING — multi-option, partial) ───
  // Issue 0: "Elect Lead Maintainer" — choices: Anika, Leo, Marcus, Jordan
  ...osc("osc-election", 0, [
    ["Anika Patel", "Anika Patel"],
    ["Leo Fernandez", "Leo Fernandez"],
    ["Marcus Chen", "Marcus Chen"],
    ["Mei-Ling Wu", "Anika Patel"],
    ["Jordan Blake", "Jordan Blake"],
    ["Sofia Reyes", "Leo Fernandez"],
  ]),

  // Issue 1: "Elect Release Manager" — choices: Mei-Ling, Sofia, Tyler
  ...osc("osc-election", 1, [
    ["Anika Patel", "Mei-Ling Wu"],
    ["Leo Fernandez", "Sofia Reyes"],
    ["Marcus Chen", "Mei-Ling Wu"],
    ["Sofia Reyes", "Sofia Reyes"],
  ]),

  // Issue 2: "Elect Community Liaison" — choices: Chiara, Nadia, Oscar, Zara
  // (no votes yet — test zero-vote state on open election)

  // ── 2026 Board Officer Election (CLOSED — multi-option) ──────────
  // Issue 0: "Elect Chairperson" — choices: Victoria, Robert, Catherine
  ...board("board-election", 0, [
    ["James Okafor", "Victoria Harrington"],
    ["Victoria Harrington", "Victoria Harrington"],  // carries Margaret's weight
    ["Robert Blackwell", "Robert Blackwell"],         // carries David's weight
    ["Catherine Zhao", "Catherine Zhao"],              // carries Elizabeth's weight
    ["William Thornton", "Victoria Harrington"],
  ]),

  // Issue 1: "Elect Vice-Chairperson" — choices: James, William, Margaret
  ...board("board-election", 1, [
    ["James Okafor", "James Okafor"],
    ["Victoria Harrington", "James Okafor"],
    ["Robert Blackwell", "William Thornton"],
    ["Catherine Zhao", "James Okafor"],
    ["William Thornton", "William Thornton"],
  ]),

  // Issue 2: "Elect Treasurer" — choices: Catherine, William, Elizabeth
  ...board("board-election", 2, [
    ["James Okafor", "Catherine Zhao"],
    ["Victoria Harrington", "Catherine Zhao"],
    ["Robert Blackwell", "William Thornton"],
    ["Catherine Zhao", "Catherine Zhao"],
    ["William Thornton", "William Thornton"],
  ]),
];

// ── Helper functions to reduce repetition ────────────────────────────────

function makeVotes(
  assemblyKey: string,
  eventKey: string,
  issueIndex: number,
  votes: [string, string][],
): VoteDef[] {
  return votes.map(([participant, choice]) => ({
    assemblyKey,
    eventKey,
    issueIndex,
    participant,
    choice,
  }));
}

function greenfield(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("greenfield", eventKey, issueIndex, votes);
}

function osc(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("osc", eventKey, issueIndex, votes);
}

function municipal(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("municipal", eventKey, issueIndex, votes);
}

function youth(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("youth", eventKey, issueIndex, votes);
}

function board(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("board", eventKey, issueIndex, votes);
}

function maple(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("maple", eventKey, issueIndex, votes);
}

function riverside(eventKey: string, issueIndex: number, votes: [string, string][]): VoteDef[] {
  return makeVotes("riverside", eventKey, issueIndex, votes);
}
