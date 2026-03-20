/**
 * Voting events and issues per assembly.
 *
 * Timelines are expressed as offsets (in ms) from Date.now().
 * Use the helpers: DAY, HOUR.
 */

import { DAY, HOUR } from "./helpers.js";

export interface IssueDef {
  title: string;
  description: string;
  /** Named choices for multi-option ballots. Omit for binary for/against. */
  choices?: string[];
  /** Topic key for linking this issue to a topic. Resolved to an ID at seed time. */
  topicKey?: string;
}

export interface EventDef {
  key: string;
  assemblyKey: string;
  title: string;
  description: string;
  issues: IssueDef[];
  /** ms offset from now */
  deliberationStart: number;
  /** ms offset from now */
  votingStart: number;
  /** ms offset from now */
  votingEnd: number;
}

export const EVENTS: EventDef[] = [
  // ── Greenfield Community Council (TOWN_HALL) ─────────────────────────

  {
    key: "greenfield-spring",
    assemblyKey: "greenfield",
    title: "Spring Community Improvement Vote",
    description: "Annual spring vote on neighborhood improvement proposals submitted by residents.",
    deliberationStart: -30 * DAY,
    votingStart: -21 * DAY,
    votingEnd: -7 * DAY,
    issues: [
      {
        title: "Renovate Elm Street Playground",
        description: "Replace aging playground equipment with modern, accessible play structures. Estimated cost: $45,000 from the community improvement fund.",
      },
      {
        title: "Adopt Nighttime Noise Ordinance",
        description: "Establish quiet hours from 10 PM to 7 AM on weekdays and 11 PM to 8 AM on weekends, with enforcement via community mediation first.",
      },
      {
        title: "Fund Summer Block Party",
        description: "Allocate $3,500 for the annual summer block party including permits, entertainment, and food vendor coordination.",
      },
    ],
  },

  {
    key: "greenfield-infra",
    assemblyKey: "greenfield",
    title: "Q1 Infrastructure Decisions",
    description: "Quarterly infrastructure proposals addressing maintenance and accessibility improvements.",
    deliberationStart: -5 * DAY,
    votingStart: -1 * DAY,
    votingEnd: 6 * DAY,
    issues: [
      {
        title: "Repair Community Center Roof",
        description: "Approve $28,000 emergency repair for the community center roof following the March storm damage assessment.",
      },
      {
        title: "Install Electric Vehicle Charging Stations",
        description: "Partner with the city to install 4 Level 2 EV chargers in the community parking lot. Community share: $12,000.",
      },
      {
        title: "Approve Sidewalk Accessibility Upgrades",
        description: "Add curb ramps and tactile paving at 6 intersections along Main Street to meet ADA compliance standards.",
      },
      {
        title: "Extend Community Garden Lease",
        description: "Renew the 5-year lease on the Oak Avenue community garden plot. Annual cost: $2,400.",
      },
    ],
  },

  {
    key: "greenfield-budget",
    assemblyKey: "greenfield",
    title: "Annual Budget Review 2026",
    description: "Review and approve the association's operating budget and reserve allocations for 2026.",
    deliberationStart: 3 * DAY,
    votingStart: 10 * DAY,
    votingEnd: 24 * DAY,
    issues: [
      {
        title: "Approve Annual Operating Budget",
        description: "Ratify the proposed $180,000 operating budget covering maintenance, administration, insurance, and community programs.",
      },
      {
        title: "Allocate Reserve Fund for Emergency Repairs",
        description: "Set aside $25,000 from surplus into the emergency repair reserve, bringing the total reserve to $72,000.",
      },
    ],
  },

  // ── OSC Governance Board (LIQUID_STANDARD) ───────────────────────────

  {
    key: "osc-retro",
    assemblyKey: "osc",
    title: "2025 Roadmap Retrospective",
    description: "Review of completed features, deprecated APIs, and community contributions from the 2025 development cycle.",
    deliberationStart: -35 * DAY,
    votingStart: -28 * DAY,
    votingEnd: -14 * DAY,
    issues: [
      {
        title: "Approve 2025 Feature Completion Report",
        description: "Accept the official report showing 87% of planned features shipped, with 3 deferred to H1 2026.",
        topicKey: "roadmap",
      },
      {
        title: "Ratify Deprecation of Legacy API v1",
        description: "Formally deprecate API v1 with a 6-month sunset period. Migration tooling and documentation have been prepared.",
        topicKey: "technical",
      },
      {
        title: "Accept Community Contributor Recognition Awards",
        description: "Approve the list of 12 community contributors for the annual recognition program, including travel stipends for the contributor summit.",
        topicKey: "contributors",
      },
    ],
  },

  {
    key: "osc-deps",
    assemblyKey: "osc",
    title: "Dependency Policy Review",
    description: "Establish policies governing third-party dependency management, security scanning, and license compliance.",
    deliberationStart: -10 * DAY,
    votingStart: -2 * DAY,
    votingEnd: 5 * DAY,
    issues: [
      {
        title: "Mandate License Compatibility Checks for All Dependencies",
        description: "Require automated license scanning in CI for all new dependencies. Reject packages with GPL-incompatible licenses without board exemption.",
        topicKey: "dependencies",
      },
      {
        title: "Adopt Automated Vulnerability Scanning Pipeline",
        description: "Integrate Snyk or Dependabot into all repositories with blocking on critical/high vulnerabilities.",
        topicKey: "security",
      },
      {
        title: "Restrict Use of Pre-1.0 Dependencies in Production",
        description: "Require explicit board approval for any dependency below version 1.0 in production builds. Dev/test dependencies exempt.",
        topicKey: "dependencies",
      },
      {
        title: "Require Two-Maintainer Review for Security Patches",
        description: "Security-related PRs must have approval from at least 2 core maintainers before merge, even for urgent fixes.",
        topicKey: "security",
      },
      {
        title: "Fund External Security Audit for Core Modules",
        description: "Allocate $15,000 from the project fund for an independent security audit of the authentication and data storage modules.",
        topicKey: "security",
      },
    ],
  },

  {
    key: "osc-governance",
    assemblyKey: "osc",
    title: "Community Governance Evolution",
    description: "Proposals for evolving the community governance structure, contributor programs, and code of conduct processes.",
    deliberationStart: -8 * DAY,
    votingStart: -1 * DAY,
    votingEnd: 10 * DAY,
    issues: [
      {
        title: "Create Funded Internship for First-Time Contributors",
        description: "Establish a 3-month paid internship program ($2,000/month) for 4 first-time contributors per cycle, mentored by core maintainers.",
        topicKey: "contributors",
      },
      {
        title: "Establish Code of Conduct Review Committee",
        description: "Form a 5-member rotating committee to handle CoC reports, replacing the current ad-hoc process. Members serve 6-month terms.",
        topicKey: "governance",
      },
    ],
  },

  {
    key: "osc-roadmap",
    assemblyKey: "osc",
    title: "H2 2026 Roadmap Proposals",
    description: "Technical proposals for the second half of 2026, covering new platform capabilities and integrations.",
    deliberationStart: -2 * DAY,
    votingStart: 5 * DAY,
    votingEnd: 19 * DAY,
    issues: [
      {
        title: "Prioritize WebAssembly Support",
        description: "Compile core engine to WASM for browser-native execution. Estimated effort: 3 engineer-months.",
        topicKey: "roadmap",
      },
      {
        title: "Build Plugin Marketplace",
        description: "Create a curated marketplace for community-built plugins with automated security review and sandboxed execution.",
        topicKey: "roadmap",
      },
      {
        title: "Native Mobile SDK Development",
        description: "Develop iOS and Android SDKs wrapping the core API with platform-native UI components.",
        topicKey: "roadmap",
      },
      {
        title: "Enterprise SSO Integration",
        description: "Add SAML 2.0 and OIDC support for enterprise single sign-on, including directory sync and role mapping.",
        topicKey: "security",
      },
    ],
  },

  // ── Municipal Budget Committee (CIVIC_PARTICIPATORY) ─────────────────

  {
    key: "municipal-budget",
    assemblyKey: "municipal",
    title: "Participatory Budget Cycle 2025",
    description: "Annual participatory budgeting process for municipal capital projects. Citizens vote on how to allocate $5M in discretionary spending.",
    deliberationStart: -45 * DAY,
    votingStart: -30 * DAY,
    votingEnd: -20 * DAY,
    issues: [
      {
        title: "Allocate $2M for Public Transit Expansion",
        description: "Fund two new bus routes connecting underserved neighborhoods to the downtown transit hub, including shelters and real-time arrival displays.",
        topicKey: "transit",
      },
      {
        title: "Fund Community Health Clinic Staffing",
        description: "Hire 4 additional staff members for the community health clinic: 2 nurse practitioners, 1 mental health counselor, and 1 bilingual coordinator.",
        topicKey: "health",
      },
      {
        title: "Renovate Downtown Public Library",
        description: "Modernize the main library branch with new HVAC, accessibility upgrades, a maker space, and expanded children's section. Budget: $1.2M.",
        topicKey: "buildings",
      },
      {
        title: "Install Solar Panels on Municipal Buildings",
        description: "Phase 1 solar installation on city hall, community center, and fire station. Projected 30% energy cost reduction over 10 years.",
        topicKey: "energy",
      },
    ],
  },

  {
    key: "municipal-emergency",
    assemblyKey: "municipal",
    title: "Emergency Infrastructure Measures",
    description: "Urgent response to the February bridge inspection findings. Expedited voting timeline due to safety concerns.",
    deliberationStart: -5 * DAY,
    votingStart: -1 * DAY,
    votingEnd: 3 * DAY,
    issues: [
      {
        title: "Approve Emergency Bridge Repair Funding",
        description: "Release $800,000 from the infrastructure reserve for immediate structural repairs on the River Road bridge, rated 'poor' in the February inspection.",
        topicKey: "roads",
      },
      {
        title: "Temporary Traffic Management Plan",
        description: "Implement weight restrictions and alternate routing during bridge repairs. Includes signage, traffic officer overtime, and public notification campaign.",
        topicKey: "roads",
      },
      {
        title: "Resident Relocation Assistance Program",
        description: "Provide temporary relocation stipends ($500/month for up to 3 months) for households directly affected by construction noise and access restrictions.",
        topicKey: "housing",
      },
    ],
  },

  // ── Youth Advisory Panel (LIQUID_ACCOUNTABLE) ────────────────────────

  {
    key: "youth-priorities",
    assemblyKey: "youth",
    title: "Youth Program Priorities 2026",
    description: "Setting priorities for youth programming and resource allocation in the coming year.",
    deliberationStart: -12 * DAY,
    votingStart: -3 * DAY,
    votingEnd: 8 * DAY,
    issues: [
      {
        title: "Expand After-School STEM Workshops",
        description: "Add robotics and coding workshops at 3 additional community centers, reaching an estimated 200 more students per semester.",
        topicKey: "stem",
      },
      {
        title: "Launch Youth Mental Health Support Initiative",
        description: "Partner with local therapists to offer free counseling sessions and peer support groups for teens. Budget: $40,000/year.",
        topicKey: "mental-health",
      },
      {
        title: "Create Youth-Led Environmental Action Fund",
        description: "Establish a $15,000 micro-grant fund for youth-proposed environmental projects, administered by a student review board.",
        topicKey: "environment",
      },
    ],
  },

  {
    key: "youth-digital",
    assemblyKey: "youth",
    title: "Digital Citizenship Curriculum",
    description: "Proposals for digital literacy and online safety education in partnership with local schools.",
    deliberationStart: -3 * DAY,
    votingStart: 4 * DAY,
    votingEnd: 18 * DAY,
    issues: [
      {
        title: "Introduce Digital Literacy in Middle Schools",
        description: "Develop a 10-week curriculum covering critical thinking about online information, basic data privacy, and responsible social media use.",
        topicKey: "digital",
      },
      {
        title: "Pilot Youth Online Safety Program",
        description: "Launch a peer-educator program where trained high school students lead online safety workshops for younger students.",
        topicKey: "digital",
      },
    ],
  },

  // ── Board of Directors (BOARD_PROXY) ─────────────────────────────────

  {
    key: "board-q4",
    assemblyKey: "board",
    title: "Q4 2025 Board Resolutions",
    description: "Quarterly board meeting resolutions covering strategic initiatives, executive compensation, and shareholder matters.",
    deliberationStart: -25 * DAY,
    votingStart: -18 * DAY,
    votingEnd: -10 * DAY,
    issues: [
      {
        title: "Approve Merger with Pacific Industries",
        description: "Authorize the acquisition of Pacific Industries for $42M in a stock-and-cash transaction. Due diligence complete; regulatory approval pending.",
        topicKey: "partnerships",
      },
      {
        title: "Executive Compensation Package Review",
        description: "Approve revised compensation packages for C-suite executives including base salary adjustments, equity grants, and performance bonus restructuring.",
        topicKey: "compensation",
      },
      {
        title: "Shareholder Dividend Declaration",
        description: "Declare quarterly dividend of $0.85 per share, payable to shareholders of record as of December 15, 2025.",
        topicKey: "dividends",
      },
    ],
  },

  {
    key: "board-q1",
    assemblyKey: "board",
    title: "Q1 2026 Strategic Decisions",
    description: "First quarter strategic decisions including international expansion and governance committee appointments.",
    deliberationStart: -8 * DAY,
    votingStart: -2 * DAY,
    votingEnd: 4 * DAY,
    issues: [
      {
        title: "Authorize New Market Expansion into Southeast Asia",
        description: "Approve the business case for opening regional offices in Singapore and Jakarta. Initial investment: $8M over 18 months.",
        topicKey: "expansion",
      },
      {
        title: "Appoint Independent Audit Committee Chair",
        description: "Confirm the appointment of an independent director to chair the audit committee, replacing the outgoing chair whose term expired.",
        topicKey: "committees",
      },
    ],
  },

  // ── Maple Heights Condo Board (MODERN_DEMOCRACY) ────────────────────────

  {
    key: "maple-roof",
    assemblyKey: "maple",
    title: "Emergency Roof Repair",
    description: "Urgent vote on authorizing roof repairs and choosing a funding source after March storm damage.",
    deliberationStart: -25 * DAY,
    votingStart: -18 * DAY,
    votingEnd: -4 * DAY,
    issues: [
      {
        title: "Authorize $45,000 Emergency Roof Repair",
        description: "Approve emergency funds for immediate roof repairs to units 12-18 following the March 2 storm damage assessment by Apex Roofing.",
      },
      {
        title: "Funding Source for Roof Repair",
        description: "Choose how to fund the $45,000 repair: draw from the reserve fund (current balance: $72,000) or levy a special assessment of $1,875 per unit.",
        choices: ["Reserve Fund", "Special Assessment"],
      },
    ],
  },

  {
    key: "maple-lobby",
    assemblyKey: "maple",
    title: "Lobby Renovation Decision",
    description: "Proposed renovation of the ground-floor lobby including new flooring, lighting, mailbox upgrade, and accessibility improvements.",
    deliberationStart: -5 * DAY,
    votingStart: 4 * DAY,
    votingEnd: 11 * DAY,
    issues: [
      {
        title: "Approve Lobby Renovation Budget",
        description: "Authorize up to $120,000 for a comprehensive lobby renovation including new tile flooring, LED lighting, ADA-compliant entrance ramp, and modern mailbox units.",
      },
      {
        title: "Temporary Lobby Closure Plan",
        description: "Approve a 3-week lobby closure during renovation. Residents will use the side entrance. Building management will provide daily updates.",
      },
    ],
  },

  // ── Elections ──────────────────────────────────────────────────────────

  {
    key: "osc-election",
    assemblyKey: "osc",
    title: "2026 Maintainer Elections",
    description: "Annual election for project leadership roles. Vote for your preferred candidates for Lead Maintainer, Release Manager, and Community Liaison.",
    deliberationStart: -10 * DAY,
    votingStart: -2 * DAY,
    votingEnd: 6 * DAY,
    issues: [
      {
        title: "Elect Lead Maintainer",
        description: "Select the Lead Maintainer responsible for merge authority, release scheduling, and technical direction for the next 12 months.",
        choices: ["Anika Patel", "Leo Fernandez", "Marcus Chen", "Jordan Blake"],
        topicKey: "governance",
      },
      {
        title: "Elect Release Manager",
        description: "Select the Release Manager who will own the release pipeline, changelog curation, and backward compatibility reviews.",
        choices: ["Mei-Ling Wu", "Sofia Reyes", "Tyler Nguyen"],
        topicKey: "governance",
      },
      {
        title: "Elect Community Liaison",
        description: "Select the Community Liaison who will represent the project at conferences, manage contributor onboarding, and coordinate with downstream users.",
        choices: ["Chiara Rossi", "Nadia Boutros", "Oscar Lindgren", "Zara Ibrahim"],
        topicKey: "contributors",
      },
    ],
  },

  {
    key: "board-election",
    assemblyKey: "board",
    title: "2026 Board Officer Election",
    description: "Annual election for board officer positions. Members vote for their preferred candidates for Chairperson, Vice-Chairperson, and Treasurer.",
    deliberationStart: -15 * DAY,
    votingStart: -5 * DAY,
    votingEnd: -1 * DAY,
    issues: [
      {
        title: "Elect Chairperson",
        description: "Select the next Chairperson of the Board of Directors for the 2026-2027 term. The Chairperson presides over board meetings and serves as the primary liaison with executive management.",
        choices: ["Victoria Harrington", "Robert Blackwell", "Catherine Zhao"],
        topicKey: "officers",
      },
      {
        title: "Elect Vice-Chairperson",
        description: "Select the Vice-Chairperson who will serve as acting Chair when the Chairperson is unavailable and lead the governance committee.",
        choices: ["James Okafor", "William Thornton", "Margaret Ashworth"],
        topicKey: "officers",
      },
      {
        title: "Elect Treasurer",
        description: "Select the Treasurer responsible for financial oversight, audit committee liaison, and quarterly financial report review.",
        choices: ["Catherine Zhao", "William Thornton", "Elizabeth Fairfax"],
        topicKey: "officers",
      },
    ],
  },
];
