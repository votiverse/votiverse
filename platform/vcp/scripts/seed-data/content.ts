/**
 * Proposals, candidacies, and community notes seed data.
 *
 * Proposals are submitted during the deliberation phase of events.
 * Candidacies are assembly-wide delegate profiles.
 * Community notes are attached to proposals and candidacies.
 *
 * Only assemblies with the relevant features enabled get content:
 * - Proposals: all assemblies with events in deliberation
 * - Candidacies: assemblies with delegationMode 'candidacy' or 'open'
 * - Community notes: assemblies with communityNotes: true
 *   (LIQUID_ACCOUNTABLE, CIVIC_PARTICIPATORY, SWISS_MODEL)
 */

export interface ProposalDef {
  assemblyKey: string;
  eventKey: string;
  issueIndex: number;
  choiceKey?: string;
  authorName: string;
  title: string;
  markdown: string;
}

export interface CandidacyDef {
  assemblyKey: string;
  participantName: string;
  topicKeys: string[];
  voteTransparencyOptIn: boolean;
  markdown: string;
}

export interface NoteDef {
  assemblyKey: string;
  authorName: string;
  targetType: "proposal" | "candidacy";
  /** Index into the PROPOSALS or CANDIDACIES array for resolving the target ID. */
  targetRef: number;
  markdown: string;
}

export interface NoteEvaluationDef {
  assemblyKey: string;
  /** Index into NOTES array */
  noteRef: number;
  participantName: string;
  evaluation: "endorse" | "dispute";
}

export interface ProposalEndorsementDef {
  assemblyKey: string;
  /** Index into PROPOSALS array */
  proposalRef: number;
  participantName: string;
  evaluation: "endorse" | "dispute";
}

// ── Proposals ────────────────────────────────────────────────────────────
// Submitted during deliberation phase of events with votingStart > 0

export const PROPOSALS: ProposalDef[] = [
  // OSC Roadmap (deliberation: -2d, votingStart: +5d) — in deliberation
  {
    assemblyKey: "osc",
    eventKey: "osc-roadmap",
    issueIndex: 0,
    choiceKey: "for",
    authorName: "Mei-Ling Wu",
    title: "Accelerate API Stabilization",
    markdown: `# Accelerate API Stabilization

## Summary
We should prioritize API stabilization in H2. The current rate of breaking changes
is slowing down third-party integrations and costing the ecosystem more than new features would gain.

## Evidence
- 12 breaking changes in the last 3 releases (tracked in CHANGELOG)
- 3 major integrators have delayed their releases waiting for a stable API
- Developer satisfaction survey shows API stability as the #1 requested improvement

## Predictions
If we freeze the public API surface for H2, I predict:
- Third-party integration count will increase by 40% by end of year
- Developer satisfaction scores will improve from 3.2 to 4.0+
`,
  },
  {
    assemblyKey: "osc",
    eventKey: "osc-roadmap",
    issueIndex: 0,
    choiceKey: "against",
    authorName: "Kai Andersen",
    title: "Feature Velocity Over Stability",
    markdown: `# Feature Velocity Over Stability

## Counter-argument
Freezing the API prematurely locks us into decisions we haven't fully validated.
The breaking changes are a sign of rapid learning, not carelessness.

## Alternative
Instead of a freeze, we should invest in a compatibility layer and versioned
endpoints. This gives integrators stability without sacrificing our ability to evolve.

## Risk
An API freeze will force us to ship workarounds and shims for the next 6 months
instead of building the right abstractions.
`,
  },

  // OSC Dependency Policy (voting: -2d to +12d) — in active voting
  {
    assemblyKey: "osc",
    eventKey: "osc-deps",
    issueIndex: 0,
    choiceKey: "for",
    authorName: "Sofia Reyes",
    title: "License Checks Protect the Project",
    markdown: `# License Checks Protect the Project

## Why This Matters
Automated license scanning in CI prevents legal surprises. A single GPL-incompatible
dependency in our stack could force us to re-license or rewrite critical modules.

## Evidence
- The Node.js Foundation requires license audits for all hosted projects
- Two incidents in 2025 where transitive dependencies introduced AGPL code undetected
- Estimated cost of retroactive compliance: 2-4 engineer-weeks per incident

## Recommendation
Vote **For** to mandate license compatibility checks on all new dependencies.
The upfront cost is a one-time CI configuration; the risk of not doing it is unbounded.
`,
  },
  {
    assemblyKey: "osc",
    eventKey: "osc-deps",
    issueIndex: 0,
    choiceKey: "against",
    authorName: "Tyler Nguyen",
    title: "License Enforcement Slows Innovation",
    markdown: `# License Enforcement Slows Innovation

## The Problem with Mandates
Blanket license checks create friction for every dependency update. Contributors will
avoid adding useful libraries because the compliance overhead isn't worth it for small utilities.

## Current Reality
- 95% of our dependencies are MIT/Apache — license risk is theoretical, not practical
- The two 2025 incidents were caught in code review, not by automated tools
- False positives from license scanners waste more time than manual review

## Alternative
Instead of mandatory CI gates, adopt a quarterly manual audit of new dependencies.
This catches real issues without blocking day-to-day development velocity.
`,
  },

  // Youth Digital Citizenship (deliberation: -3d, votingStart: +4d) — in deliberation
  {
    assemblyKey: "youth",
    eventKey: "youth-digital",
    issueIndex: 0,
    authorName: "Aisha Moyo",
    title: "Digital Literacy Workshops for All Ages",
    markdown: `# Digital Literacy Workshops for All Ages

## Proposal
Launch a monthly workshop series covering online safety, critical media analysis,
and responsible social media use. Open to all panel members and their communities.

## Budget
- Facilitator stipend: $200/session
- Materials and platform licenses: $50/session
- 12 sessions planned for the year: $3,000 total

## Expected Impact
Participants will develop skills to identify misinformation and protect their
digital identity. We predict workshop satisfaction ratings above 4/5.
`,
  },
];

// ── Candidacies ──────────────────────────────────────────────────────────
// OSC uses LIQUID_ACCOUNTABLE (candidacy mode), Youth uses LIQUID_ACCOUNTABLE

export const CANDIDACIES: CandidacyDef[] = [
  {
    assemblyKey: "osc",
    participantName: "Mei-Ling Wu",
    topicKeys: ["technical", "dependencies"],
    voteTransparencyOptIn: true,
    markdown: `# Mei-Ling Wu — Delegate Candidate

## Topics: Technical Architecture, Dependencies

### Qualifications
- 8 years as a senior architect at distributed systems companies
- Core contributor to the project since v0.2
- Authored the dependency management RFC that was adopted last quarter

### Positions
- **Dependencies**: I favor aggressive automated updates with comprehensive test coverage.
  We should never be more than one major version behind on any critical dependency.
- **Security**: Zero-trust by default. No exceptions for internal services.

### Track Record
I've been participating in OSC governance since founding. I aim to vote on every
issue within my topic scope.

### Vote Transparency
I opt into full vote transparency with my delegators. If you delegate to me,
you can see exactly how I vote on every issue.
`,
  },
  {
    assemblyKey: "osc",
    participantName: "Leo Fernandez",
    topicKeys: ["community", "governance"],
    voteTransparencyOptIn: false,
    markdown: `# Leo Fernandez — Delegate Candidate

## Topics: Community, Governance

### Qualifications
- Community manager for 3 open-source projects
- Organized 5 contributor summits
- Mediator for contributor disputes since 2024

### Positions
- **Governance**: I believe in lightweight process. Rules should be minimal and
  enforced by culture, not automation.
- **Contributors**: Every contributor, regardless of commit count, deserves a voice.
  I'll advocate for inclusive decision-making.

### Note
I do not opt into vote transparency — I believe delegates should be free to vote
their conscience without social pressure on individual decisions. Judge me by outcomes.
`,
  },
  {
    assemblyKey: "youth",
    participantName: "Aisha Moyo",
    topicKeys: ["education", "digital"],
    voteTransparencyOptIn: true,
    markdown: `# Aisha Moyo — Delegate Candidate

## Topics: Education, Digital Literacy

### About Me
High school senior passionate about technology education and digital citizenship.
Active in coding clubs and peer tutoring since grade 10.

### Positions
- **STEM Education**: We need more hands-on project-based learning, not just theory.
- **Digital Literacy**: Every student should learn to evaluate online sources critically.

### Vote Transparency
I opt into transparent voting so my delegators can hold me accountable.
`,
  },
];

// ── Community Notes ──────────────────────────────────────────────────────
// Notes on proposals and candidacies in assemblies with communityNotes: true

export const NOTES: NoteDef[] = [
  // Note on Aisha's "Digital Literacy Workshops" proposal (Youth — LIQUID_ACCOUNTABLE, communityNotes: true)
  {
    assemblyKey: "youth",
    authorName: "Liam Torres",
    targetType: "proposal",
    targetRef: 2, // Youth proposal is at index 2 in PROPOSALS
    markdown: "The $200/session facilitator stipend seems low for qualified instructors. Comparable programs in our district pay $300-400. We should either increase the budget or plan for peer-led sessions.",
  },
  // Note on the same proposal — different perspective
  {
    assemblyKey: "youth",
    authorName: "Jin Park",
    targetType: "proposal",
    targetRef: 2,
    markdown: "I participated in a similar pilot program at my school last year. Satisfaction was high (4.3/5) but attendance dropped after month 3. Suggest front-loading the most engaging topics.",
  },
  // Note on Aisha's candidacy (Youth)
  {
    assemblyKey: "youth",
    authorName: "Priya Sharma",
    targetType: "candidacy",
    targetRef: 2, // Aisha's candidacy is at index 2 in CANDIDACIES
    markdown: "Aisha has been leading the coding club for two semesters and organized the inter-school hackathon. Her practical experience with digital education is relevant to this delegate role.",
  },
];

// ── Note Evaluations ─────────────────────────────────────────────────────

export const NOTE_EVALUATIONS: NoteEvaluationDef[] = [
  // Liam's note on the workshop proposal — mostly endorsed
  { assemblyKey: "youth", noteRef: 0, participantName: "Sofia Reyes", evaluation: "endorse" },
  { assemblyKey: "youth", noteRef: 0, participantName: "Priya Sharma", evaluation: "endorse" },
  { assemblyKey: "youth", noteRef: 0, participantName: "Chloe Beaumont", evaluation: "endorse" },

  // Jin's note on the workshop proposal — mixed
  { assemblyKey: "youth", noteRef: 1, participantName: "Liam Torres", evaluation: "endorse" },
  { assemblyKey: "youth", noteRef: 1, participantName: "Tariq Hassan", evaluation: "dispute" },
  { assemblyKey: "youth", noteRef: 1, participantName: "Emilia Strand", evaluation: "endorse" },

  // Priya's note on Aisha's candidacy — endorsed
  { assemblyKey: "youth", noteRef: 2, participantName: "Sofia Reyes", evaluation: "endorse" },
  { assemblyKey: "youth", noteRef: 2, participantName: "Jin Park", evaluation: "endorse" },
  { assemblyKey: "youth", noteRef: 2, participantName: "Liam Torres", evaluation: "endorse" },
];

// ── Proposal Endorsements ────────────────────────────────────────────────
// Community scoring of proposals during deliberation

export const PROPOSAL_ENDORSEMENTS: ProposalEndorsementDef[] = [
  // OSC Roadmap — "Accelerate API Stabilization" (index 0) — mostly endorsed
  { assemblyKey: "osc", proposalRef: 0, participantName: "Sofia Reyes", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 0, participantName: "Tyler Nguyen", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 0, participantName: "Priya Sharma", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 0, participantName: "Leo Fernandez", evaluation: "dispute" },

  // OSC Roadmap — "Feature Velocity Over Stability" (index 1) — mixed
  { assemblyKey: "osc", proposalRef: 1, participantName: "Sofia Reyes", evaluation: "dispute" },
  { assemblyKey: "osc", proposalRef: 1, participantName: "Priya Sharma", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 1, participantName: "Leo Fernandez", evaluation: "endorse" },

  // OSC Deps — "License Checks Protect" (index 2) — strong endorsement
  { assemblyKey: "osc", proposalRef: 2, participantName: "Mei-Ling Wu", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 2, participantName: "Kai Andersen", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 2, participantName: "Leo Fernandez", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 2, participantName: "Priya Sharma", evaluation: "endorse" },
  { assemblyKey: "osc", proposalRef: 2, participantName: "Tyler Nguyen", evaluation: "dispute" },

  // OSC Deps — "License Enforcement Slows Innovation" (index 3) — moderate dispute
  { assemblyKey: "osc", proposalRef: 3, participantName: "Mei-Ling Wu", evaluation: "dispute" },
  { assemblyKey: "osc", proposalRef: 3, participantName: "Kai Andersen", evaluation: "dispute" },
  { assemblyKey: "osc", proposalRef: 3, participantName: "Sofia Reyes", evaluation: "endorse" },

  // Youth — "Digital Literacy Workshops" (index 4) — endorsed
  { assemblyKey: "youth", proposalRef: 4, participantName: "Liam Torres", evaluation: "endorse" },
  { assemblyKey: "youth", proposalRef: 4, participantName: "Jin Park", evaluation: "endorse" },
  { assemblyKey: "youth", proposalRef: 4, participantName: "Priya Sharma", evaluation: "endorse" },
];
