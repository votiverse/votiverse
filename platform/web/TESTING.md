# Testing Guide — Votiverse Web Platform

This guide maps features to specific test identities and assemblies so you know which participant to select when testing.

For the full testing guide — engine unit tests, VCP integration tests, backend tests, dev clock usage, notification testing, and detailed manual scenarios — see [`docs/testing.md`](../../docs/testing.md).

---

## Quick Start

```bash
# Terminal 1 — VCP server (port 3000)
cd platform/vcp && pnpm reset && pnpm dev

# Terminal 2 — Client backend (port 4000)
cd platform/backend && pnpm reset && pnpm dev

# Terminal 3 — Web frontend
cd platform/web && pnpm dev
```

Open the URL shown by Vite (typically `http://localhost:5173`, port may vary). You'll be prompted to log in with an email and password.

---

## Test Credentials

All seeded users have the email format `{slugified-name}@example.com` and the password `password`.

For example, to log in as Elena Vasquez, use `elena-vasquez@example.com` / `password`.

### Recommended Cross-Assembly Test Accounts

These users belong to multiple assemblies, making them the best starting points for testing cross-assembly features:

| Email | Name | Assemblies |
|---|---|---|
| `sofia-reyes@example.com` | Sofia Reyes | OSC + Youth |
| `marcus-chen@example.com` | Marcus Chen | OSC + Municipal |
| `priya-sharma@example.com` | Priya Sharma | Municipal + Youth |
| `james-okafor@example.com` | James Okafor | Municipal + Board |

---

## Assembly-by-Feature Matrix

| Assembly | Preset | Members | Delegation | Polls | Predictions | Key Feature |
|---|---|---|---|---|---|---|
| **Greenfield Community Council** | TOWN_HALL | 12 | Disabled | No | Off | Direct voting only |
| **OSC Governance Board** | LIQUID_STANDARD | 15 | Transitive, topic-scoped | No | Mandatory | Delegation chains, multi-option elections |
| **Municipal Budget Committee** | CIVIC_PARTICIPATORY | 18 | Transitive, depth=3 | Yes | Opt-in | Polls + delegation, chain depth limit |
| **Youth Advisory Panel** | LIQUID_ACCOUNTABLE | 10 | Transitive, topic-scoped | Yes | Opt-in | Polls, delegation, closed poll results |
| **Board of Directors** | BOARD_PROXY | 8 | Non-transitive, 1 delegate | No | Off | Single-delegate proxy |

---

## Recommended Test Identities

### Direct Voting (No Delegation)

| Identity | Assembly | Notes |
|---|---|---|
| **Elena Vasquez** | Greenfield | Simplest case — 12 members, all vote directly, no delegation noise |
| **Kai Andersen** | OSC | No outgoing delegations, votes directly on everything |
| **Nkechi Adeyemi** | Municipal | Direct voter, no delegations in either direction |

### Delegation — Override Rule

| Identity | Assembly | Notes |
|---|---|---|
| **Chiara Rossi** | OSC | Delegates globally to Mei-Ling Wu. Votes directly on some issues, overriding the delegation. When viewing events, some issues show "You voted" and others show "Delegated to Mei-Ling Wu" |

### Delegation — Depth-2 Chains

| Identity | Assembly | Notes |
|---|---|---|
| **Nadia Boutros** | OSC | Chain: Nadia → Chiara → Mei-Ling. View chain resolver to see 3-node chain |
| **Tanya Volkov** | OSC | Chain: Tanya → Stefan → Jordan. Another depth-2 example |
| **Omar Hadid** | Municipal | Chain: Omar → Kwame → Marcus. Depth-2 with chain depth cap of 3 |
| **Lars Johansson** | Municipal | Chain: Lars → Fiona → Isabel. Another depth-2 in Municipal |

### Delegation — As Delegate (Receiving Weight)

| Identity | Assembly | Notes |
|---|---|---|
| **Anika Patel** | OSC | Receives delegation from Zara Ibrahim. Weight = 2 on issues where both participate |
| **Mei-Ling Wu** | OSC | Terminal voter in chain: Nadia → Chiara → Mei-Ling. Weight up to 3 |
| **Marcus Chen** | Municipal | Terminal voter: Omar → Kwame → Marcus. Also receives from Oscar (OSC) |
| **Sofia Reyes** | Youth | Receives delegation from Jin Park |
| **Priya Sharma** | Youth | Receives delegation from Chloe Beaumont |

### Cross-Assembly Participants

| Identity | Assemblies | Notes |
|---|---|---|
| **Sofia Reyes** | OSC + Youth | Dashboard shows pending votes from both assemblies |
| **Marcus Chen** | OSC + Municipal | Delegate in both — good for testing weight across assemblies |
| **Priya Sharma** | Municipal + Youth | Delegate target in both |
| **James Okafor** | Municipal + Board | Direct voter in Municipal, member in Board |

### Polls

| Identity | Assembly | Notes |
|---|---|---|
| **Nina Kowalski** | Youth | Youth-only member, good for polls testing. Already responded to Study Space Survey |
| **Carmen Delgado** | Municipal | Has delegators, created Transit Priority Sentiment poll |
| **Jin Park** | Youth | Created Preferred Community Event Type poll |
| **Fiona MacLeod** | Municipal | Created Neighborhood Priorities poll |

### Board Proxy (Non-Transitive)

| Identity | Assembly | Notes |
|---|---|---|
| **Margaret Ashworth** | Board | Delegates to Victoria Harrington (non-transitive, single hop) |
| **David Greenfield** | Board | Delegates to Robert Blackwell |
| **William Thornton** | Board | No delegation — direct voter in Board |

### Multi-Option Elections

| Identity | Assembly | Notes |
|---|---|---|
| **Any OSC member** | OSC | The osc-election event has 3 issues with named candidates: Lead Maintainer (4 candidates), Release Manager (3 candidates), Community Liaison (4 candidates) |

---

## Topics

Each assembly (except Greenfield) has a hierarchical topic taxonomy. Topics are used for scoping delegations and categorizing issues.

### OSC Governance Board (8 topics)

```
Technical
├── Dependencies
├── Security
└── Infrastructure
Community
├── Governance
└── Contributors
Roadmap
```

### Municipal Budget Committee (10 topics)

```
Infrastructure
├── Transit
├── Buildings
└── Roads
Social Services
├── Health
└── Housing
Environment
├── Energy
└── Parks
```

### Youth Advisory Panel (9 topics)

```
Education
├── STEM Programs
└── Digital Literacy
Health & Wellness
├── Mental Health
└── Sports & Recreation
Community
├── Events
└── Environment
```

### Board of Directors (9 topics)

```
Strategic
├── Market Expansion
└── Partnerships
Finance
├── Dividends
└── Compensation
Governance
├── Board Officers
└── Committees
```

### Greenfield Community Council

```
No topics — TOWN_HALL preset has no delegation.
```

### Topic-Scoped Delegations

| From | To | Assembly | Scope |
|---|---|---|---|
| Kai Andersen | Leo Fernandez | OSC | Technical |
| Rina Kurosawa | Sofia Reyes | OSC | Community |
| Nkechi Adeyemi | Carmen Delgado | Municipal | Infrastructure |
| Gabriela Santos | Priya Sharma | Municipal | Social Services |
| Aisha Moyo | Sofia Reyes | Youth | Education |
| Tariq Hassan | Liam Torres | Youth | Health & Wellness |

---

## Delegation Graphs

### OSC Governance Board

```
Zara Ibrahim ──────→ Anika Patel
Tyler Nguyen ──────→ Leo Fernandez
Oscar Lindgren ────→ Marcus Chen
Stefan Kovac ──────→ Jordan Blake
    ↑
Tanya Volkov ──┘    (depth 2: Tanya → Stefan → Jordan)

Chiara Rossi ──────→ Mei-Ling Wu    (overrides with direct vote on some issues)
    ↑
Nadia Boutros ─┘    (depth 2: Nadia → Chiara → Mei-Ling)

Kai Andersen ─────→ Leo Fernandez      (topic-scoped: Technical)
Rina Kurosawa ────→ Sofia Reyes        (topic-scoped: Community)

Direct voters (no global delegation): Sofia Reyes, Kai Andersen, Rina Kurosawa
```

### Municipal Budget Committee

```
Sunita Rao ────────→ Carmen Delgado
Benjamin Archer ───→ Antoine Lefebvre
Hana Yokota ───────→ Priya Sharma
Diego Morales ─────→ Ayesha Khan

Omar Hadid ────────→ Kwame Mensah ──→ Marcus Chen    (depth 2)
Lars Johansson ────→ Fiona MacLeod ─→ Isabel Cruz    (depth 2)

Nkechi Adeyemi ───→ Carmen Delgado     (topic-scoped: Infrastructure)
Gabriela Santos ──→ Priya Sharma       (topic-scoped: Social Services)

Direct voters (no global delegation): James Okafor, Nkechi Adeyemi, Mikhail Petrov, Gabriela Santos
```

### Youth Advisory Panel

```
Jin Park ──────────→ Sofia Reyes
Chloe Beaumont ────→ Priya Sharma
Emilia Strand ─────→ Liam Torres

Aisha Moyo ───────→ Sofia Reyes        (topic-scoped: Education)
Tariq Hassan ─────→ Liam Torres        (topic-scoped: Health & Wellness)

Direct voters (no global delegation): Aisha Moyo, Tariq Hassan, Nina Kowalski, Ravi Gupta
```

### Board of Directors

```
Margaret Ashworth ─→ Victoria Harrington    (non-transitive)
David Greenfield ──→ Robert Blackwell       (non-transitive)
Elizabeth Fairfax ─→ Catherine Zhao          (non-transitive)

Direct voters: James Okafor, William Thornton
```

### Greenfield Community Council

```
No delegations — all 12 members vote directly.
```

---

## Seeded Polls

Only Youth Advisory Panel and Municipal Budget Committee have polls enabled.

### Youth Advisory Panel (10 members)

| Poll | Questions | Status | Responses | Created By |
|---|---|---|---|---|
| Youth Program Satisfaction Survey | 2 (likert + yes-no) | Open | 6 of 10 | Sofia Reyes |
| Preferred Community Event Type | 1 (multiple-choice, 5 options) | Open | 5 of 10 | Jin Park |
| Study Space Survey | 2 (likert + direction) | Closed | 7 of 10 | Chloe Beaumont |

### Municipal Budget Committee (18 members)

| Poll | Questions | Status | Responses | Created By |
|---|---|---|---|---|
| Transit Priority Sentiment | 2 (yes-no + likert) | Open | 10 of 18 | Marcus Chen |
| Transit Improvement Priority | 1 (multiple-choice, 5 options) | Open | 8 of 18 | Carmen Delgado |
| Neighborhood Priorities | 3 (yes-no + likert + multiple-choice) | Open | 6 of 18 | Fiona MacLeod |

---

## Seeded Events (Summary)

15 voting events across 5 assemblies. Status is relative to seed time — use the dev clock to advance through lifecycle phases.

| Assembly | Event | Issues | Status at seed time |
|---|---|---|---|
| Greenfield | Spring Community Improvement Vote | 3 | Closed |
| Greenfield | Q1 Infrastructure Decisions | 4 | Voting |
| Greenfield | Annual Budget Review 2026 | 2 | Upcoming |
| OSC | 2025 Roadmap Retrospective | 3 | Closed |
| OSC | Dependency Policy Review | 5 | Voting |
| OSC | Community Governance Evolution | 2 | Voting |
| OSC | H2 2026 Roadmap Proposals | 4 | Deliberation |
| OSC | 2026 Maintainer Elections | 3 (multi-option) | Voting |
| Municipal | Participatory Budget Cycle 2025 | 4 | Closed |
| Municipal | Emergency Infrastructure Measures | 3 | Voting |
| Youth | Youth Program Priorities 2026 | 3 | Voting |
| Youth | Digital Citizenship Curriculum | 2 | Deliberation |
| Board | Q4 2025 Board Resolutions | 3 | Closed |
| Board | Q1 2026 Strategic Decisions | 2 | Voting |
| Board | 2026 Board Officer Election | 3 (multi-option) | Closed |

For timeline decay details and reseeding instructions, see [`docs/testing.md`](../../docs/testing.md#10-seeded-data-reference).

---

## Content Pages (Proposals, Candidacies, Notes)

### New pages

| Route | Description |
|---|---|
| `/assembly/:id/proposals` | List all proposals across events in the assembly |
| `/assembly/:id/candidacies` | List all candidacies across elections in the assembly |

### Assembly tab visibility

- **Candidates tab** appears only for assemblies with `delegationMode: 'candidacy'` — currently **Youth Advisory Panel** only.
- **Proposals** are accessible from within events that are in Deliberation phase (via "View Proposals" button).

### Member search with candidacy discovery

The delegation page includes a member search feature. When searching for members, candidacy declarations are surfaced alongside delegation options, enabling candidacy discovery within the delegation workflow.

### TipTap markdown editor

Proposal drafts and candidacy declarations use a TipTap rich-text editor with:
- Markdown rendering (headings, lists, bold, italic, links)
- **Import button** — imports Word/DOCX files directly into the editor

### Community notes

Community notes appear on proposals and candidacies in assemblies with `communityNotes: true` (Youth Advisory Panel). Each note has evaluations (helpful / not helpful) from other participants.

### Seeded content

| Type | Assembly | Items | Authors |
|---|---|---|---|
| Proposals | OSC | 2 (on H2 2026 Roadmap Proposals) | Mei-Ling Wu, Leo Fernandez |
| Proposals | Youth | 1 (on Digital Citizenship Curriculum) | Aisha Moyo |
| Candidacies | OSC | 2 (Lead Maintainer, Release Manager) | Mei-Ling Wu, Leo Fernandez |
| Candidacies | Youth | 1 | Aisha Moyo |
| Community Notes | Youth | 3 (on Youth Program Priorities 2026) | Various, with 9 evaluations |

### Content testing scenarios

**Scenario: Draft and submit a proposal**
1. Log in as **Nina Kowalski** (`nina-kowalski@example.com`) → Youth Advisory Panel
2. Go to Events → Digital Citizenship Curriculum (Deliberation)
3. Click "View Proposals" → "New Draft"
4. Write title and body in the TipTap editor (or import a .docx file)
5. Click "Submit" → proposal appears in the list

**Scenario: View candidacies**
1. Log in as **Sofia Reyes** (`sofia-reyes@example.com`) → OSC Governance Board
2. Go to Events → 2026 Maintainer Elections → "View Candidates"
3. Verify Mei-Ling Wu and Leo Fernandez candidacies appear

**Scenario: Community notes on Youth proposals**
1. Log in as any Youth member → Youth Advisory Panel
2. Go to Events → Youth Program Priorities 2026 → View Proposals
3. Community notes should be visible with evaluation counts

### Web client tests (16 tests)

Tests in `platform/web/test/`:

| File | Tests | Focus |
|---|---|---|
| `member-search.test.ts` | — | Member search filtering and candidacy discovery |
| `assembly-tabs.test.ts` | — | Tab visibility based on assembly configuration |

---

## Common Testing Scenarios

### Scenario 1: Delegation Override
1. Log in as **Chiara Rossi** (`chiara-rossi@example.com`) → OSC Governance Board
2. Go to Events → OSC Dependencies Audit
3. Some issues should show "Delegated to Mei-Ling Wu"
4. Vote directly on one → verify your direct vote appears and delegation is overridden

### Scenario 2: Chain Visualization
1. Log in as **Nadia Boutros** (`nadia-boutros@example.com`) → OSC Governance Board
2. Go to Delegations → Chain Resolver
3. Select Nadia + any issue → verify chain shows Nadia → Chiara → Mei-Ling

### Scenario 3: Poll Response + Results
1. Log in as **Ravi Gupta** (`ravi-gupta@example.com`) → Youth Advisory Panel (hasn't responded to "Preferred Community Event Type")
2. Go to Polls → click an option on the multiple-choice poll
3. Verify response is recorded and results bar chart appears
4. Scroll to Study Space Survey → verify closed poll shows auto-loaded results

### Scenario 4: Cross-Assembly Dashboard
1. Log in as **Sofia Reyes** (`sofia-reyes@example.com`)
2. Dashboard should show pending votes from both OSC and Youth assemblies
3. Navigate into each assembly to verify different delegation contexts

### Scenario 5: Board Proxy (Non-Transitive)
1. Log in as **Margaret Ashworth** (`margaret-ashworth@example.com`) → Board of Directors
2. Go to Delegations → verify single delegation to Victoria Harrington
3. Verify no chain depth beyond 1 (non-transitive preset)
