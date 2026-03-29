# Groups and Capabilities: Modular Architecture for Collective Decision-Making

**Design Document — v1.0**
**March 2026**

---

## 1. Motivation

Votiverse's current architecture treats the **assembly** as the universal top-level entity. An assembly bundles governance configuration, membership, voting mechanics, delegation, surveys, predictions, community notes, proposals, candidacies, topics, and awareness into a single concept. Governance configuration is set at creation time, frozen, and determines which features are available for the assembly's lifetime.

This design has served well during initial development, but three problems have emerged:

### 1.1 The creation flow overwhelms new users

Creating a group requires choosing from 6 governance presets, each bundling 13+ parameters across delegation, ballot, features, and timeline. A user setting up a judge panel or a book club must navigate concepts like "liquid delegation," "curation days," and "prediction mode" that are irrelevant to their use case.

### 1.2 Capabilities are artificially coupled to voting

Scoring, surveys, predictions, and community notes are independently valuable capabilities. A judge panel needs scoring but not voting. A feedback board needs surveys but not delegation. Today, all capabilities are bundled into the governance config and set at creation time. There is no way to use one without configuring all of them, and no way to add or remove capabilities later.

### 1.3 The assembly entity is overloaded

The assembly carries: governance config, participant list, features, topics, events, issues, delegations, surveys, predictions, community notes, proposals, candidacies, booklets, and awareness data. This makes the entity model rigid, the API surface wide, and the concept hard to explain to users.

---

## 2. Core Concepts

### 2.1 Groups and capabilities

A **group** is a social container — a set of people who do things together. It has a name, members, admission rules, and a set of enabled **capabilities**. A group is not a governance concept; it is an organizational one.

A **capability** is a specific tool for collective action that a group can enable or disable independently. Each capability has its own configuration, its own data, and its own formal properties. Capabilities can be activated at any point in a group's lifetime and deactivated without destroying historical data.

The identified capabilities are:

| Capability | What it is | Temporal orientation |
|---|---|---|
| **Voting** | Binding collective decisions through structured ballots, with optional delegation | Present — "what should we do?" |
| **Scoring** | Rubric-based collective evaluation — structured judgment against defined criteria | Present — "how do we rate this?" |
| **Surveys** | Non-binding sentiment measurement — each member senses local reality and reports back | Past/present — "how do you feel about this?" |
| **Community Notes** | Crowd-sourced contextual annotations on entities, evaluated for helpfulness | Present — "what context is missing?" |

This list is not closed. Future capabilities (e.g., budgeting, scheduling) can be added without modifying the group entity or existing capabilities.

**Note on predictions:** Predictions (forecasting future outcomes) are a platform-level feature, not a per-group capability. See section 2.4.

### 2.2 The group is not an assembly

Today, "assembly" means everything. In this design, the terms are distinct:

- **Group** — the social container. Backend-owned. Users interact with groups. The word "assembly" never appears in the user interface.
- **Assembly** — the VCP's representation of a group's collective decision-making context. An internal/engine concept. Created when any VCP-backed capability is enabled for a group. Users never see this term.

A group may have zero or one assemblies. If a group enables no VCP-backed capabilities, no assembly exists. If it enables voting, scoring, surveys, or any other VCP capability, an assembly is created in the VCP to host those capabilities.

### 2.3 Voting and the four quadrants

Voting is the most structurally consequential capability. When enabled, the group must choose a **delegation model** — the fundamental power-flow structure. This is defined by two independent boolean axes (see *Governance Parameter Space Redesign* for the full rationale):

|  | **Not transferable** | **Transferable** |
|---|---|---|
| **No candidates** | **Direct** — Everyone votes on everything. No delegation exists. | **Open** — Delegate to anyone informally. Chains flow freely. Trust-based. |
| **Candidates** | **Proxy** — Appoint a declared candidate as your representative. No chains. | **Liquid** — Candidates for discoverability + transitive delegation chains. |

The quadrant name is the short identifier: **Direct**, **Open**, **Proxy**, **Liquid**.

The delegation quadrant is the one setting that is genuinely immutable — changing it mid-life would retroactively alter how existing delegations and vote tallies are interpreted. All other voting settings (ballot defaults, timeline defaults, quorum) can be adjusted between voting events.

### 2.4 Predictions: a platform feature, not a capability

Predictions don't fit the capability model. The four capabilities above share a temporal character — they produce or capture collective judgment in the present. Predictions are about a **possible future**: claims whose value is unknowable at creation time and only becomes meaningful retroactively, when reality catches up and the prediction can be compared to what actually happened.

This temporal oddness is why predictions feel unnatural as a tab alongside Voting, Surveys, and Scoring. They're not a workflow members go to — they're a **behavior that arises in context**:

- Reading a proposal: "I predict this will cost 20% more than estimated."
- Before a vote: "I predict this passes with >70% support."
- In a community note: "Despite the optimistic framing, I predict delivery slips past Q3."

Predictions are **always available as a platform feature**, not toggled per-group. Any member can make a prediction wherever the UI offers the affordance. There is no "mandatory predictions" mode — the original whitepaper envisioned enforcing predictions on proposals, but this design rejects that. Whether a proposal includes predictions is a choice made by the author and curators, not a governance rule.

**Properties:**

- A prediction is a standalone claim about a future outcome, authored by a member.
- Predictions have commitment integrity (hash proves the prediction existed before resolution).
- Predictions are immutable after commitment.
- Predictions are subject to community notes and micro-voting (endorse/dispute).
- Predictions are linkable — embeddable in proposals, notes, and other entities with rich-link rendering.
- Resolution can be against a voting outcome (automatic) or a real-world observation (manual).
- Prediction accuracy contributes to a member's track record, visible on their profile — particularly relevant for delegate candidates.

**Where predictions surface in the UI** is deliberately left open. Candidate profiles, proposal pages, community notes, and member profiles are all natural homes. We expect to learn over time which placements feel right. The architecture supports predictions everywhere; the UI can evolve without structural changes.

### 2.5 Micro-voting as a unified mechanism

Several entities are subject to binary collective judgment:

| Entity | Stances | Purpose |
|---|---|---|
| Proposals | Endorse / Dispute | Gate progression to voting booklet; signal community support |
| Candidacies | Endorse / Dispute | Signal trust; inform delegation decisions |
| Community Notes | Helpful / Not helpful | Determine note credibility and visibility |
| Predictions | Endorse / Dispute | Signal agreement with the forecast; build accountability signal |

All four follow the same pattern: one-stance-per-member-per-entity, mutable (you can change your mind), aggregate counts matter. This is a single mechanism with different labels, not four independent features. The VCP should offer a unified **stance** primitive:

```
Stance:
  entity_type: "proposal" | "candidacy" | "community_note" | "prediction"
  entity_id:   uuid
  member_id:   uuid
  value:       "endorse" | "dispute" | "helpful" | "not_helpful"

Guarantees:
  - One stance per member per entity (upsert semantics)
  - Aggregate counts are authoritative
  - Event sourced: StanceSet, StanceCleared
```

---

## 3. The VCP/Backend Boundary

### 3.1 Boundary principle

The existing *Content Architecture* document establishes the line: "If the VCP needs it for computation or governance enforcement, the VCP stores it. If it's display content, the backend stores it."

This design refines that principle with a sharper test:

**The VCP is the engine of collective decision-making.** It owns mechanisms where many individuals contribute to a shared outcome that requires formal guarantees: one-per-member enforcement, integrity of aggregation, immutability of committed records, time-window enforcement, delegation computation, and event-sourced auditability.

**The backend is the social and identity layer.** It owns users, groups, content, admission, and the capability registry. It orchestrates calls to the VCP when collective mechanics are needed. The backend must also be auditable, but its guarantees are about identity integrity, access control, and content provenance — not collective computation.

**The group is a backend-only concept.** The VCP never sees a "group." It works with assembly IDs and participant IDs. The backend maintains the mapping between groups and VCP entities.

### 3.2 Capability placement

Applying the boundary principle to each capability:

**Group capabilities** (toggleable per-group):

| Concept | Collective decision-making? | Formal guarantees needed? | Home |
|---|---|---|---|
| **Voting + delegation** | Core. Binding decisions with delegated power. | One-person-one-vote, delegation graph integrity, immutable quadrant, timeline enforcement, event sourcing. | **VCP** |
| **Scoring** | Yes. Structured collective judgment. Scores determine outcomes (rankings, selections, awards). | One-per-member-per-criterion, integrity of aggregation, immutable after deadline, potential blind evaluation. | **VCP** |
| **Surveys** | Yes. Collective sensing — each member reports local reality. A key feedback loop in the information system for collective decision-making. | One-per-member, non-delegable (hard architectural constraint), time-window enforcement, immutable after close. | **VCP** |
| **Community Notes** | Split. Note *content* is authored by individuals (backend). Note *evaluations* are collective judgment (VCP, via the stance mechanism). | Evaluations: one-per-member, aggregate integrity. Content: authorship, provenance, content hash. | **Content: Backend. Evaluations: VCP.** |

**Platform-level features** (always available, not per-group):

| Concept | Collective decision-making? | Formal guarantees needed? | Home |
|---|---|---|---|
| **Predictions** | Partially. Individual claims with collective accountability. Not a group workflow — a contextual behavior that surfaces across entities. | Commitment integrity (hash), immutability, resolution, accuracy tracking. | **VCP** (mechanics). **Backend** (content). |
| **Micro-voting (stances)** | Yes. Binary collective judgment, one-per-member, aggregate counts produce governance-relevant outcomes. | One-per-member, aggregate integrity, event sourced. | **VCP** |

**Infrastructure concepts:**

| Concept | Collective decision-making? | Formal guarantees needed? | Home |
|---|---|---|---|
| **Topics** | Only relevant to delegation. They structure power flows, not content. | Hierarchy integrity, delegation scoping. | **VCP** (assembly-scoped, only exists when voting is enabled) |
| **Group** | No. Binding layer, not a mechanism. | Membership integrity, access control. | **Backend** |
| **Content** (proposal docs, candidacy profiles, note text, prediction descriptions) | No. Authored by individuals, consumed by the collective. | Authorship, provenance, content hashing. | **Backend** |
| **Admission** | No. Access control. | Identity verification, Sybil resistance. | **Backend** |

### 3.3 The VCP's internal entity model

The VCP currently has one top-level entity: the assembly. With the group model, the assembly becomes the VCP's representation of "a set of people who perform collective decision-making." It is created when a group enables its first VCP-backed capability (voting, scoring, surveys, community notes).

The assembly generalizes slightly:

- An assembly **may** have a governance config (quadrant + ballot + timeline). This is set when voting is enabled. If only scoring or surveys are enabled, the assembly exists but has no governance config.
- An assembly **always** has participants (mapped from group members by the backend).
- The VCP has **no capability flags**. It does not track which capabilities are enabled — that is the backend's responsibility (via the `group_capabilities` table). The VCP processes whatever requests the backend sends. The backend is the sole gatekeeper for capability access control. This is consistent with how the VCP already works: it trusts that the backend has authenticated and authorized every request before forwarding it.
- Predictions are always available for any assembly with participants. The prediction engine operates at the platform level.
- Enabling/disabling a capability at the group level (backend) does not destroy VCP data. Disabling voting does not delete events or tallies. Disabling scoring does not delete evaluations. The backend simply stops proxying requests for the disabled capability.

This preserves the existing VCP architecture with minimal disruption. The assembly remains the single top-level entity. The change is that it no longer requires governance config at creation, and capabilities are toggleable rather than fixed.

---

## 4. Immutability Model

The current system treats the entire `GovernanceConfig` as immutable: set at creation, frozen forever. This design narrows the immutability scope:

### 4.1 What is immutable

| Setting | When set | Why immutable |
|---|---|---|
| **Delegation quadrant** (candidacy + transferable) | When voting is enabled | Changing the power-flow model would retroactively alter how existing delegations are interpreted and how historical tallies would be computed. A Direct-to-Liquid switch mid-life would mean past votes were tallied under rules that no longer apply. |

### 4.2 What is adjustable between events

| Setting | Default source | Adjustable? | Constraint |
|---|---|---|---|
| **Ballot: secret** | Set with quadrant | Between events | Changing from secret to public (or vice versa) affects voter behavior expectations. This is a significant trust change but not a retroactive computation change — past votes retain their original secrecy. Consider requiring member notification or a cooling period. |
| **Ballot: liveResults** | Set with quadrant | Between events | Same as above — affects strategic behavior but doesn't retroactively change past results. |
| **Ballot: allowVoteChange** | Set with quadrant | Between events | Only affects future events. |
| **Ballot: quorum** | Set with quadrant | Between events | Only affects future events. Past tallies retain their original quorum. |
| **Ballot: method** | Set with quadrant | Between events | Majority vs supermajority. Only affects future events. |
| **Timeline defaults** | Set with quadrant | Anytime | These are defaults for new events. Each event has its own actual dates. |

### 4.3 What is always mutable

| Setting | Notes |
|---|---|
| **Capabilities** (voting, scoring, surveys, community notes) | Enable/disable anytime. Disabling preserves historical data. |
| **Admission mode** | Already mutable today. |
| **Group metadata** (name, handle, website, avatar) | Social layer, always editable. |

### 4.4 The voting-enable transition

When a group first enables voting:

1. The admin selects a delegation quadrant (Direct / Open / Proxy / Liquid).
2. The admin configures ballot defaults (secret, sealed, quorum, method) — or accepts the quadrant's sensible defaults.
3. The admin sets timeline defaults (deliberation, curation, voting days) — or accepts defaults.
4. The backend calls the VCP to set the governance config on the assembly.
5. The quadrant is locked. Ballot and timeline defaults remain adjustable.

This is a one-way door for the quadrant only. A group that starts without voting can add it later; once added, the power-flow model is permanent.

---

## 5. Group Creation Flow

### 5.1 Design goals

- A user creating a group should encounter **only concepts relevant to their use case**.
- The simplest path (name + admission + create) produces a working group with no capabilities enabled.
- Capabilities are added progressively, each with its own focused configuration.
- Named templates provide convenience shortcuts for common use cases without being architectural constructs.

### 5.2 The creation form

The creation form has three required elements and one optional accelerator:

```
[Group name]  ____________________

Who can join?  [Approval required ▾]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What does your group need?

┌─ ☑ Voting ─────────────────────────────────────────────┐
│                                                         │
│  ○ Direct      ○ Open       ○ Proxy      ● Liquid      │
│  Everyone      Delegate to   Appoint a    Candidates    │
│  votes         anyone        proxy        + chains      │
│                                                         │
│  ▸ Ballot settings                                      │
│  ▸ Timeline defaults                                    │
└─────────────────────────────────────────────────────────┘

┌─ ☐ Scoring ────────────────────────────────────────────┐
│  Evaluate with structured criteria. Set up after        │
│  creation.                                              │
└─────────────────────────────────────────────────────────┘

┌─ ☐ Surveys ────────────────────────────────────────────┐
│  Non-binding sentiment polls.                           │
└─────────────────────────────────────────────────────────┘

┌─ ☐ Community Notes ────────────────────────────────────┐
│  Members add context and fact-checks to shared          │
│  entities.                                              │
└─────────────────────────────────────────────────────────┘

                                        [Create group]
```

Checking a capability enables it. Only Voting requires inline configuration (the quadrant). Other capabilities have sensible defaults and are configured in group settings after creation.

### 5.3 Whether voting defaults to on

This is a UX decision, not an architectural one:

- **Default on (with Liquid pre-selected):** Optimizes for the common case where groups want governance. A judge-panel user unchecks Voting. Matches current behavior where every group has governance.
- **Default off (nothing checked):** Forces an intentional choice. Cleaner for non-governance use cases. May add friction for the majority who do want voting.
- **Default depends on template:** If the user picks a template, capabilities are pre-checked. If they start blank, nothing is checked.

The template-driven approach may be the best compromise. See section 5.4.

### 5.4 Named templates

Templates are pure UI shortcuts. They pre-check capabilities, pre-select the quadrant, and pre-fill settings. They are not stored after creation — the group's actual state is the source of truth.

| Template | Voting | Quadrant | Notable ballot settings | Other capabilities | Example use |
|---|---|---|---|---|---|
| **Community** | Yes | Liquid | Secret, sealed | Notes, Surveys | Neighborhood associations, civic groups, organizations |
| **Town Hall** | Yes | Direct | Public, live results | Notes | Open forums, small assemblies, clubs |
| **Board** | Yes | Proxy | Secret, sealed, 50% quorum | Scoring | HOAs, corporate boards, unions, committees |
| **Open Collective** | Yes | Open | Public, live results | — | Tech communities, collectives, high-trust teams |
| **Judge Panel** | No | — | — | Scoring | Competitions, grant reviews, hiring panels |
| **Feedback Group** | No | — | — | Surveys | Customer feedback, team retrospectives, polling |
| **Blank** | No | — | — | — | Start from scratch |

The template list is curated, not exhaustive. It should cover the most common starting points without being overwhelming. Three to five templates may be sufficient for the initial release.

Templates can also serve as educational tools — their descriptions explain *why* that combination of capabilities and settings works for the stated use case.

### 5.5 Group settings: capability management

After creation, the group settings page includes a **Capabilities** section where admins can enable or disable capabilities:

Each capability is presented as a card with:
- Name and one-line description
- Current status (enabled/disabled)
- Toggle action (Enable / Disable)
- Configuration link (if enabled and configurable)

Disabling a capability shows a confirmation: "Historical data will be preserved. Members will no longer be able to create new [surveys/scores/etc]. You can re-enable this at any time."

Enabling Voting for the first time triggers the quadrant selection flow (section 4.4). Subsequent toggles simply enable/disable without re-configuration.

Note: Predictions are not listed here. They are a platform-level feature available to all groups, surfacing contextually on proposals, notes, candidate profiles, and member profiles. No admin toggle is needed.

---

## 6. Data Model Changes

### 6.1 Backend: new tables

```sql
-- Groups table (new top-level entity)
CREATE TABLE groups (
  id              TEXT PRIMARY KEY,    -- uuid
  name            TEXT NOT NULL,
  handle          TEXT UNIQUE NOT NULL,
  avatar_style    TEXT NOT NULL DEFAULT 'initials',
  website_url     TEXT,
  admission_mode  TEXT NOT NULL DEFAULT 'approval'
                  CHECK (admission_mode IN ('open', 'approval', 'invite-only')),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  -- VCP link (null until any VCP capability is enabled)
  vcp_assembly_id TEXT UNIQUE
);

-- Capability registry
CREATE TABLE group_capabilities (
  group_id        TEXT NOT NULL REFERENCES groups(id),
  capability      TEXT NOT NULL
                  CHECK (capability IN (
                    'voting', 'scoring', 'surveys',
                    'community_notes'
                  )),
  enabled         INTEGER NOT NULL DEFAULT 1,
  enabled_at      TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at     TEXT,
  PRIMARY KEY (group_id, capability)
);

-- Group membership (replaces per-assembly membership tracking)
CREATE TABLE group_members (
  group_id        TEXT NOT NULL REFERENCES groups(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  role            TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'admin', 'member')),
  joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);
```

### 6.2 VCP: assembly changes

The VCP assembly entity needs one change: `config` becomes nullable.

```sql
-- Governance config becomes nullable.
-- null = assembly exists for non-voting capabilities (scoring, surveys, etc.)
-- The VCP has NO capability flags. The backend controls which capabilities
-- are active via the group_capabilities table and only proxies requests
-- for enabled capabilities.
```

The existing `config` column (JSON governance config) remains but is only set when voting is enabled. The config contains delegation + ballot + timeline (10 parameters). When voting is not enabled, `config` is null. The VCP processes whatever requests the backend sends — scoring, surveys, predictions, notes — without checking capability flags.

### 6.3 Migration path from current state

Existing assemblies become groups with all current capabilities enabled:

1. For each existing assembly, create a `groups` row with the assembly's name, handle, and metadata.
2. Set `vcp_assembly_id` to the existing assembly ID.
3. Populate `group_capabilities` by inspecting what data exists in the VCP: has voting events? → voting enabled. Has scoring events? → scoring enabled. Has surveys? → surveys enabled. Has community notes? → community notes enabled.
4. Populate `group_members` from existing membership data.
5. Existing VCP data (events, delegations, surveys, predictions) is unchanged — it already hangs off the assembly.

This migration is backward-compatible. No VCP data changes. The backend gains new tables and the web UI shifts from assembly-centric to group-centric routing.

---

## 7. Entity Relationship Diagram

```
Backend                              VCP
────────────────────────────         ────────────────────────────

Group                                Assembly
├── id ─────────────────────────────→ id (via vcp_assembly_id)
├── name, handle, avatar             ├── config (nullable, voting-only)
├── admission_mode                   │   └── delegation + ballot + timeline
├── website_url                      │
│                                    ├── Participants[]
├── GroupCapabilities[]              │   └── (synced from GroupMembers)
│   ├── voting                       │
│   ├── scoring                      │   (no capability flags — VCP trusts
│   ├── surveys                      │    that the backend only proxies
│   └── community_notes              │    requests for enabled capabilities)
│                                    ├── Topics[] (if voting)
│                                    ├── VotingEvents[] (if voting)
├── GroupMembers[]                   ├── Delegations[] (if voting)
│   ├── user_id, role                ├── Surveys[] (if surveys)
│   └── joined_at                    ├── Predictions[] (always available)
│                                    ├── ScoringContexts[] (if scoring)
├── Content (backend-owned)          ├── Stances[] (micro-voting)
│   ├── Proposal documents           │   ├── on proposals
│   ├── Candidacy profiles           │   ├── on candidacies
│   ├── Community Note text          │   ├── on community notes
│   ├── Prediction descriptions      │   └── on predictions
│   └── Assets (images, files)       │
│                                    └── Awareness (computed, read-only)
├── Invitations[]
├── JoinRequests[]
└── InvitationNotifications[]
```

---

## 8. API Surface Changes

### 8.1 Backend API: group-centric routing

The backend API shifts from `/api/assembly/:id/...` to `/api/group/:id/...`:

```
Group management:
  POST   /api/groups                        Create group
  GET    /api/groups/:id                    Get group
  PATCH  /api/groups/:id                    Update group metadata

Capability management:
  GET    /api/groups/:id/capabilities       List capabilities + status
  POST   /api/groups/:id/capabilities/:cap  Enable capability
  DELETE /api/groups/:id/capabilities/:cap  Disable capability

Voting configuration (when enabling voting):
  POST   /api/groups/:id/voting/configure   Set quadrant + ballot + timeline

Membership:
  GET    /api/groups/:id/members            List members
  POST   /api/groups/:id/members            Add member
  ...

Proxied to VCP (unchanged in spirit, new URL prefix):
  GET    /api/groups/:id/events             Voting events
  GET    /api/groups/:id/delegations        Delegations
  GET    /api/groups/:id/surveys            Surveys
  GET    /api/groups/:id/scoring            Scoring contexts
  GET    /api/groups/:id/predictions        Predictions (always available, contextual)
  GET    /api/groups/:id/awareness          Awareness data
  ...
```

### 8.2 VCP API: unchanged

The VCP API continues to work with assembly IDs. The backend translates group IDs to assembly IDs before proxying. The VCP does not need to know about groups.

### 8.3 Web UI routing

```
/groups                          Dashboard (list of groups)
/group/:id                       Group home
/group/:id/events                Voting events
/group/:id/delegates             Delegate discovery
/group/:id/scoring               Scoring
/group/:id/surveys               Surveys
/group/:id/members               Membership
/group/:id/settings              Group settings + capabilities
/create-group                    Group creation
```

---

## 9. Open Questions

### 9.1 Awareness: VCP or backend?

The awareness package currently lives in the engine and is exposed through the VCP. It aggregates data across voting, delegations, predictions, surveys, and community notes to produce participation summaries and governance health metrics.

With capabilities split across VCP and backend, awareness has two options:

**Option A: Stay in VCP.** The VCP has all the computation data. The backend pushes community note activity to the VCP (or the VCP queries it). Awareness remains a VCP-computed read-only view.

**Option B: Move to backend.** The backend is the orchestration layer with access to both its own data and VCP data. It could compute awareness by aggregating across sources.

**Arguments for A:** The awareness engine package already exists and works. It does sophisticated computation (participation rates, delegation coverage, prediction accuracy). Moving it to the backend means re-implementing or duplicating engine logic.

**Arguments for B:** The backend already knows about groups and members. Some awareness signals (community note contributions, content authorship) are backend-native. Aggregating at the backend avoids the VCP needing to know about backend-owned entities.

**Recommendation:** Defer this decision. Awareness is read-only and can be refactored without affecting data integrity. Start with Option A (status quo) and revisit when the capability split creates friction.

### 9.2 Can ballot type (secret/public) change mid-life?

Section 4.2 lists ballot settings as adjustable between events. But switching from secret to public ballots is a significant trust change — members who joined expecting secret voting may feel exposed. Options:

- **Lock ballot type with quadrant:** Simplest, most conservative. Users choose secret or public when enabling voting.
- **Allow change with safeguards:** Require admin notification to all members, cooling period before taking effect, or member consent.
- **Per-event override:** Keep the group default locked but allow individual voting events to override (e.g., a one-time public vote in a normally secret-ballot group). This is more flexible but more complex.

### 9.3 Prediction resolution authority

With predictions decoupled from voting, resolution becomes a question: who determines whether a prediction was correct?

- **Automated:** If the prediction references a voting event, resolution is automatic (the outcome is known).
- **Author-resolved:** The prediction author declares the outcome. Simple but subject to bias.
- **Admin-resolved:** A group admin adjudicates. More authoritative but creates admin burden.
- **Community-resolved:** Members vote on whether the prediction was correct. Most democratic but heaviest.

This may vary by prediction type. Voting-linked predictions resolve automatically. Open-ended predictions may need author or admin resolution.

### 9.4 Template curation and evolution

The initial template list (section 5.4) is a starting point. Questions for ongoing curation:

- How many templates should we show? Too many recreates the preset-overwhelm problem.
- Should templates be community-contributed (groups share their configurations)?
- Should templates evolve as we add capabilities, or stay stable?

### 9.5 Predictions: where they surface in the UI

Predictions are always available but have no dedicated page or tab. Where should the UI offer prediction affordances? Candidate surfaces include:

- **Proposal pages:** "Make a prediction about this proposal's outcome" action.
- **Voting event pages:** "Predict the result" before voting closes.
- **Community notes:** Embed prediction links in note text.
- **Candidate profiles:** Show the candidate's prediction track record and accuracy.
- **Member profiles:** Track record section showing prediction history and accuracy.
- **Awareness dashboard:** Prediction accuracy as a signal of member engagement quality.

This list is deliberately open. We expect to learn through usage which placements feel natural and which create noise. The architecture supports predictions anywhere; the UI should evolve incrementally.

### 9.6 Scoring without voting: VCP entity lifecycle

If a group enables only scoring (no voting), the backend creates a VCP assembly with `config = NULL`. This assembly has participants and scoring contexts but no governance config, no topics, no delegations. The VCP has no capability flags — it simply processes whatever the backend sends.

Is "assembly" still the right internal name for this VCP entity? Alternatives: "workspace," "context," "collective." This is purely internal naming — users never see it — but it affects code readability and developer mental models.

---

## 10. Schema Audit: What Moves, What Stays

This section is the result of a complete audit of the VCP schema (25 tables), backend schema (25 tables), and all 12 engine packages, evaluated against the group model.

### 10.1 Entities that stay assembly-scoped (no change)

These entities are governance computation internals. The VCP owns them, they're scoped to the assembly, and the group model doesn't change that.

| VCP table | Why it stays |
|---|---|
| `events` (event log) | Core event sourcing — all governance state |
| `participants` | VCP's representation of members. Sync source changes (from backend memberships to group members) but scoping doesn't. |
| `topics` | Only relevant to delegation. Assembly-internal. |
| `issues` | Voting issues. Only exist when voting is enabled. |
| `voting_event_creators` | Attribution for voting events. |
| `proposals` (metadata) | Tied to voting issues. Only exist with voting. |
| `proposal_versions` | Append-only proposal history. |
| `candidacies` (metadata) | Tied to delegation. Only exist with voting. |
| `candidacy_versions` | Append-only candidacy history. |
| `booklet_recommendations` | Voting booklet editorial. Only with voting. |
| `scoring_events` | Scoring mechanics. VCP capability. |
| `scorecards` | Individual evaluator scores. |
| `scoring_results` (materialized) | Aggregate scoring rankings. |
| `issue_participation` (materialized) | Computed at tally time. |
| `issue_tallies` (materialized) | Vote counts, frozen at close. |
| `issue_weights` (materialized) | Delegation weight distribution. |
| `issue_concentration` (materialized) | Gini coefficient, chain stats. |
| `clients` | API client registry. Infrastructure. |
| `webhook_subscriptions` | Event webhooks. Infrastructure. |

| Backend table | Why it stays |
|---|---|
| `proposal_drafts` | Pre-submission drafts. Tied to voting issues. |
| `proposal_content` | Immutable versioned content for proposals. |
| `candidacy_content` | Immutable versioned content for candidacies. |
| `booklet_recommendation_content` | Editorial content for voting booklets. |
| `topics_cache` | Immutable mirror of VCP topics. |
| `surveys_cache` | Immutable mirror of VCP surveys. |
| `tracked_events` | Notification scheduling for voting events. |
| `tracked_surveys` | Notification scheduling for surveys. |
| `survey_responses` | One-way latch for survey completion tracking. |
| `survey_response_checks` | VCP sync status for surveys. |
| `survey_dismissals` | UI dismissal tracking. |

### 10.2 Entities that move from assembly to group

These entities are about group membership and social infrastructure, not governance computation.

| Entity | Currently | New home | Rationale |
|---|---|---|---|
| **Roles** (VCP: `assembly_roles`) | VCP, assembly-scoped | **Backend**, group-scoped | Roles (owner/admin/member) are about who can manage the group, not governance computation. The VCP doesn't need to know who's an admin — the backend enforces access control before proxying to the VCP. |
| **Memberships** (Backend: `memberships`) | Backend, assembly-scoped | **Backend**, group-scoped | You're a member of a group, not an assembly. The `participant_id` mapping to VCP stays as a derived link. Becomes the `group_members` table. |
| **Assets** (Backend: `assets`) | Backend, assembly-scoped | **Backend**, group-scoped | Assets belong to the group. A scoring-only group still needs to upload images. A group with no VCP capabilities still needs assets for its profile. |
| **Invitations** (Backend: `invitations`, `invitation_acceptances`) | Backend, assembly-scoped | **Backend**, group-scoped | You invite people to a group. The assembly is an internal detail. |
| **Join requests** (Backend: `join_requests`) | Backend, assembly-scoped | **Backend**, group-scoped | People request to join a group. |
| **Notifications** (Backend: `notifications`) | Backend, assembly-scoped | **Backend**, group-scoped | Notifications are about group activity. The assembly_id foreign key becomes group_id. |
| **Admission mode** (Backend: `assemblies_cache.admission_mode`) | Backend, on assemblies_cache | **Backend**, on groups table | Already mutable, already backend-owned. Just moves to the groups table. |

### 10.3 Entities that need structural changes

| Entity | Change needed | Detail |
|---|---|---|
| **`assemblies_cache`** (Backend) | **Split.** | Group metadata (name, admission, website, vote_creation) moves to the `groups` table. Governance config stays as a VCP assembly config cache. |
| **`proposal_endorsements`** + **`entity_endorsements`** + **`note_evaluations`** (VCP) | **Consolidate.** | Three separate tables with the same pattern (one-per-member, endorse/dispute). Unify into a single `stances` table per the stance mechanism design (section 2.5). |
| **`community_notes`** (VCP) | **Expand target types.** | Currently `target_type IN ('proposal', 'candidacy')`. In the new model, notes can target predictions, scoring entries, and potentially other entities. The target_type enum needs to grow. Also: if community notes are a group capability (not just voting-related), their scoping may need to shift. |
| **`FeatureConfig`** (Engine: config package) | **Remove entirely.** | See section 10.4 for the full argument. All four booleans (`communityNotes`, `predictions`, `surveys`, `scoring`) are capability toggles that belong in the backend's group capability registry, not in the VCP's governance config. |
| **`GovernanceConfig`** (Engine: config package) | **Remove `features` section.** | Config shrinks from 13 parameters to 10: delegation (2) + ballot (5) + timeline (3). All voting-specific. This is what the VCP needs for governance computation — nothing more. |
| **`Prediction` type** (Engine: prediction package) | **Make `proposalId` optional.** | Currently `proposalId: ProposalId` is required. Standalone predictions have no associated proposal. Change to `proposalId?: ProposalId`. Update `CommitPredictionParams` accordingly. Also update the JSDoc that says "attached to a proposal." |
| **`PredictionService.commit()`** (Engine) | **Remove feature gate.** | Currently throws if `!this.config.features.predictions`. Remove this check — predictions are always available. |
| **`NoteService` constructor** (Engine: content package) | **Remove feature gate.** | Currently checks `!this.config.features.communityNotes`. Remove — capability gating is the backend's job. |

### 10.4 FeatureConfig removal — resolved

**Decision:** Remove `FeatureConfig` entirely from `GovernanceConfig`. All capability gating moves to the backend.

**Current state:** `FeatureConfig` has four booleans:

| Field | Current behavior | Why it doesn't belong in GovernanceConfig |
|---|---|---|
| `predictions` | Engine gates `PredictionService.commit()` | Predictions are always available (section 2.4). Not a governance decision. |
| `communityNotes` | Engine gates `NoteService.create()` | Community notes are a group capability. The backend decides whether to proxy note-creation requests based on the group's capability registry. |
| `surveys` | Not checked by any engine service | Already unenforced at the engine level. The VCP creates surveys when asked; the backend decides when to ask. |
| `scoring` | Not checked by any engine service | Same as surveys. The backend decides whether to proxy scoring requests. |

**The argument:**

`GovernanceConfig` should contain what the VCP needs for governance *computation* — the rules that determine how votes are cast, how delegation works, and how timelines unfold. These are the parameters that, once set, define the mechanics of collective decision-making within a group.

Capability toggles (which features are available) are *access control*, not computation. Whether a group has scoring enabled doesn't change how scoring works — it determines whether scoring requests are accepted at all. That's an orchestration decision, and orchestration is the backend's job.

The pattern is already established: the backend checks authentication (JWT), authorization (roles), and membership before proxying requests to the VCP. The VCP trusts that proxied requests are authorized — it processes whatever it receives. Adding capability gating to this existing check is natural: the backend verifies that the requested capability is enabled for the group before forwarding to the VCP.

**What this means for the VCP:**

The VCP does not check capability flags. It has no `scoring_enabled` or `surveys_enabled` columns. When the backend sends a "create scoring event" request, the VCP creates it. When the backend sends a "submit survey response" request, the VCP records it. The backend is the sole gatekeeper.

This eliminates the "defense in depth" duplication. The VCP's responsibility is computation integrity (one-per-member, delegation graphs, immutability, tallying). The backend's responsibility is access control (auth, roles, capabilities, admission). Each layer does one job well.

**What this means for `GovernanceConfig`:**

```typescript
interface GovernanceConfig {
  readonly delegation: DelegationConfig;    // 2 params: candidacy, transferable
  readonly ballot: BallotConfig;            // 5 params: secret, liveResults,
                                            //   allowVoteChange, quorum, method
  readonly timeline: TimelineConfig;        // 3 params: deliberationDays,
                                            //   curationDays, votingDays
}
```

10 parameters, all voting-specific. The group owns `name` and `description` — the VCP's governance config is purely computational. Clean.

**What this means for the engine packages:**

- `PredictionService`: remove `if (!this.config.features.predictions)` gate
- `NoteService`: remove `if (!this.config.features.communityNotes)` gate
- `VotiverseEngine`: stop passing feature config to sub-services
- Engine packages that don't check feature config (voting, delegation, survey, scoring, awareness, integrity): no change

**What this means for presets:**

Presets shrink. They define delegation + ballot + timeline only. No more `features` section. Templates (the UI concept) handle which capabilities are pre-checked in the creation form — but that's a UI concern, not a config concern.

### 10.5 Remaining open questions

**Should `assembly_roles` stay in the VCP at all?**

Currently, `RoleGranted` and `RoleRevoked` are events in the VCP event log, and `assembly_roles` is a materialized table. In the group model, roles belong to the group (backend). The VCP uses roles to enforce admin-only operations (creating voting events, managing scoring events, curating booklets).

**Decision: Move roles to backend entirely.** The backend checks roles before proxying. The VCP trusts that proxied requests are authorized. This matches the existing pattern where the backend does auth and the VCP trusts `X-Participant-Id`. It's consistent with the FeatureConfig removal: the backend handles all access control, the VCP handles computation.

The `RoleGranted`/`RoleRevoked` events in the VCP event log can be kept as an audit trail if desired, but `assembly_roles` as a materialized table with enforcement is no longer needed in the VCP.

**Where do community notes live when they can target non-voting entities?**

Today, notes target proposals and candidacies — both voting-related. If notes can also target predictions (always available) and scoring entries (a separate capability), they're no longer strictly tied to voting.

This argues for community notes being either:
- A group capability independent of voting (backend-toggled, VCP-computed evaluations)
- Always available (like predictions) — any entity can be noted

The audit found that notes are already split: content in backend, evaluations in VCP. The capability toggle lives in the backend's group capability registry; the VCP handles evaluation mechanics (one-per-member, aggregate counts) for whatever notes are sent to it.

This question does not need to be resolved before the refactor begins. The current target types (`proposal`, `candidacy`) continue to work. Expanding target types is additive and can happen when prediction or scoring note support is implemented.

### 10.6 Does the VCP need a group concept?

The design document initially stated: "The VCP never sees a group." The audit tests this assumption.

**Arguments for keeping the VCP group-unaware:**

1. **The VCP doesn't need groups for computation.** Delegation graphs, vote tallying, scoring aggregation, survey responses — none of these computations require knowing that a scoring event and a voting event belong to the same group. They operate on participants and domain entities.

2. **The backend already maps group → assembly.** When the backend proxies a request, it resolves the group ID to an assembly ID. The VCP works with assembly IDs. Clean separation.

3. **Simpler VCP.** The VCP remains a focused computation engine. Adding a group concept adds a layer of indirection with no computational benefit.

**Arguments for giving the VCP group awareness:**

1. **Cross-capability queries.** Awareness needs to aggregate across voting, scoring, surveys, predictions, and notes for a single participant. If these are all scoped to the same assembly ID, this works today. But if a group could theoretically have multiple assemblies (we said 0-or-1 for now, but the architecture should not prevent future evolution), awareness would need a grouping concept.

2. **Prediction track records span capabilities.** A member's prediction accuracy contributes to their delegate profile. Predictions might reference voting events, scoring outcomes, or standalone claims. If predictions are always available and not assembly-scoped, the VCP needs some way to scope "all predictions for members of this group."

3. **Participant pool sharing.** If a group enables scoring first (creating an assembly) and later enables voting (same assembly), the participant pool is shared. But what if — hypothetically — different capabilities needed different participant subsets? (This seems unlikely, but worth noting.)

**Analysis:**

The strongest argument for VCP group awareness is prediction scoping. If predictions are always available and not tied to an assembly, the VCP needs to know which participants belong together to compute track records. But predictions are scoped to participants, and participants are scoped to assemblies. As long as 0-or-1 holds (one assembly per group), the assembly ID *is* the group scope from the VCP's perspective.

The critical assumption: **every group that uses any VCP feature has exactly one assembly.** Under this assumption, the assembly ID serves as the group identifier within the VCP, and the VCP doesn't need a separate group concept. The backend maps between the user-facing group ID and the VCP's assembly ID.

If we ever allow multiple assemblies per group, we'd need to introduce a group concept in the VCP. But that's a future concern, and we explicitly chose 0-or-1 for good reasons.

**Conclusion:** The VCP does not need a group entity. The assembly serves as the implicit group scope within the VCP. The backend is the authoritative source for group metadata and manages the group → assembly mapping. This keeps the VCP simple and focused.

One nuance: the VCP's assembly should not *require* governance config. Today, `assemblies.config` is `NOT NULL`. It needs to become nullable to support groups that enable scoring or surveys without voting. The assembly becomes "a participant pool with optional governance config" — effectively the VCP's representation of a group, but without calling it one. The VCP has no capability flags; it processes whatever the backend sends.

---

## 11. Relationship to Existing Design Documents

This document supersedes or modifies several existing documents:

| Document | Relationship |
|---|---|
| **Governance Parameter Space Redesign** | The four-quadrant model is preserved and sharpened. `FeatureConfig` removed entirely — capability gating moves to the backend. GovernanceConfig shrinks from 13 to 10 parameters: delegation (2) + ballot (5) + timeline (3), all voting-specific. |
| **Content Architecture** | The VCP/backend boundary principle is refined but compatible. Content stays in the backend. Governance computation stays in the VCP. The group adds a new backend entity above the content layer. |
| **Entity Mutability Reference** | Needs updating: assembly config immutability narrows to the delegation quadrant. New entities (groups, group_capabilities, group_members) need classification. Predictions gain new mutability rules (standalone entity, subject to stances). |
| **Group Creation, Defaults, and Roles** | Substantially reworked by this design. The creation flow, preset system, and role model change. |
| **Endorsement, Curation, and Booklet** | Endorsements are unified under the stance mechanism. Curation and booklet mechanics are unchanged but scoped to voting-enabled groups. |
| **Scoring Events / Scoring V2 Lifecycle** | Scoring becomes a standalone capability, not tied to a governance preset. The scoring lifecycle design is compatible with this change. |

---

## 12. Refactor Scope Summary

Based on the audit, the pre-production refactor has three tiers:

**Tier 1 — Engine cleanup (no schema changes, no API changes):**
- Remove `FeatureConfig` entirely from `GovernanceConfig` (section 10.4)
- Remove `features` section from all 6 presets
- Remove feature gates: `PredictionService.commit()` and `NoteService.create()`
- Make `Prediction.proposalId` optional (standalone predictions)
- Update `GovernanceConfig` parameter count documentation (13 → 10)
- Update web UI: remove features section from creation form, remove from dashboard display
- Update all engine tests that reference `features.*`

**Tier 2 — Backend: introduce group entity:**
- New `groups` table (name, handle, avatar, website, admission_mode, created_by)
- New `group_capabilities` table (group_id, capability, enabled, timestamps) — replaces `FeatureConfig`
- New `group_members` table (group_id, user_id, role, joined_at) — absorbs `memberships`
- Move `invitations`, `join_requests`, `notifications`, `assets` from assembly-scoped to group-scoped
- Split `assemblies_cache` into group metadata + VCP config cache
- Move role enforcement from VCP to backend (backend checks roles before proxying)
- Add capability gating to backend proxy (check `group_capabilities` before forwarding to VCP)
- New API routes: `/api/groups/...` replacing `/api/assembly/...`

**Tier 3 — VCP: generalize assembly:**
- Make `assemblies.config` nullable (support scoring/survey-only groups)
- Remove `assembly_roles` table (roles enforced by backend)
- Remove `RoleGranted`/`RoleRevoked` event enforcement (keep as audit trail)
- No capability flags on the VCP assembly — the VCP trusts the backend
- Consolidate `proposal_endorsements` + `entity_endorsements` + `note_evaluations` → unified `stances` table
- Expand `community_notes.target_type` to support predictions and scoring entries

**Not in scope (future):**
- Standalone prediction UI (contextual affordances — learn through usage first)
- Awareness refactoring (stays in VCP for now, revisit when capability split creates friction)
- Multi-assembly per group (explicitly deferred; 0-or-1 is sufficient)

---

## 13. Implementation Sequence

This is not an implementation plan — it is a dependency ordering for when implementation begins.

1. **Engine: Remove FeatureConfig + prediction decoupling.** Remove `FeatureConfig` entirely from `GovernanceConfig`. Remove all feature gates from engine services. Make `Prediction.proposalId` optional. Update presets (features section gone), web UI, and tests. (Tier 1 — can be done immediately.)
2. **Backend: Group entity + capability registry.** New tables, CRUD API, migration from assembly-centric model. Move roles, invitations, join requests, notifications, assets to group scope. Add capability gating to proxy. (Tier 2.)
3. **VCP: Nullable governance config.** Allow assembly creation without voting config. Remove role enforcement from VCP. No capability flags — VCP trusts the backend. (Tier 3.)
4. **Backend: Group-to-assembly mapping.** Capability enable/disable endpoints that create or configure the VCP assembly.
5. **Web UI: Group-centric routing and creation flow.** New creation page with capability toggles and templates. Settings page with capability management.
6. **VCP: Unified stance mechanism.** Consolidate proposal endorsements, candidacy endorsements, and note evaluations under one primitive.
7. **VCP + Backend: Predictions as standalone entities.** Decouple from voting events. Add stance support. Backend stores prediction content.
8. **Web UI: Contextual prediction affordances.** "Make a prediction" actions on proposals, votes, and notes. Track record on member/candidate profiles. Rich-link embedding.
9. **Documentation: Update all affected design documents.**

Each step is independently deployable and backward-compatible with the previous state. Step 1 (prediction cleanup) has no dependencies and can be executed immediately as a standalone refactor.
