# Group Creation, Governance Defaults, and Assembly Roles

**Design Document — v1.0**
**March 2026**

---

## 1. Motivation

Votiverse offers a configurable governance engine with six named presets. But the current design has three gaps:

1. **No recommended default.** The presets are presented as equals, implying that disabling delegation (TOWN_HALL) is a valid starting point rather than a deliberate simplification. In practice, the platform's strongest features — liquid delegation with candidate scrutiny, Swiss-style booklets, community notes, surveys — work best together. A new group should start with all of them enabled.

2. **No assembly-level timeline configuration.** Deliberation, curation, and voting durations are set per event or hardcoded. Members must check each event to understand the timeline. Assembly-level timeline config means: learn the rules once, they never change.

3. **No ownership or admin model.** Assemblies have no concept of who can administer them. Event creators have curation rights for their own events, but there is no assembly-wide authority for managing membership, creating events, or transferring control. A single creator with no succession plan makes the group fragile.

This document addresses all three gaps.

---

## 2. The "Modern Democracy" Default

### 2.1 Why a default matters

Every group that adopts Votiverse faces a cold-start problem: which governance parameters should we use? Most groups don't have the expertise or interest to evaluate 20+ configuration parameters. They want a system that works.

The default is not neutral — it is a normative claim about what modern democracy should look like. It synthesizes:

- From **Swiss direct democracy**: the voting booklet, structured deliberation, proposals with for/against positions
- From **liquid democracy**: revocable, topic-scoped delegation with candidate scrutiny and accountability
- From **social networks**: community notes with crowd-sourced evaluation, surveys as a sensing mechanism
- From **prediction markets**: falsifiable predictions attached to proposals, track records over time

All of this runs on the device in your pocket — the same device people already trust to manage their bank accounts, their health data, and their social lives. Modern democracy means governance designed for the smartphone era, not adapted from 18th-century parliamentary procedure.

### 2.2 The MODERN_DEMOCRACY preset

This becomes the **recommended default** for all new groups. It replaces the implicit default of no preset / TOWN_HALL.

```typescript
const MODERN_DEMOCRACY: GovernanceConfig = {
  name: "Modern Democracy",
  description:
    "Liquid delegation with candidate profiles, Swiss-style voting booklets, " +
    "community notes, surveys, and prediction tracking. " +
    "The recommended starting point for any group.",

  delegation: {
    delegationMode: "candidacy",
    topicScoped: true,
    transitive: true,
    revocableAnytime: true,
    maxDelegatesPerParticipant: null,
    maxAge: null,
    visibility: { mode: "public", incomingVisibility: "direct" },
  },

  ballot: {
    secrecy: "secret",
    delegateVoteVisibility: "delegators-only",
    votingMethod: "simple-majority",
    supermajorityThreshold: 0.5,
    quorum: 0.1,
    participationMode: "voluntary",
    resultsVisibility: "sealed",
    allowVoteChange: true,
  },

  features: {
    predictions: "encouraged",
    communityNotes: true,
    noteVisibilityThreshold: 0.3,
    noteMinEvaluations: 3,
    polls: true,
    surveyResponseAnonymity: "anonymous",
    awarenessIntensity: "standard",
    blockchainIntegrity: false,
  },

  thresholds: {
    concentrationAlertThreshold: 0.15,
  },

  timeline: {
    deliberationDays: 7,
    curationDays: 2,
    votingDays: 7,
  },
};
```

**Key choices and rationale:**

| Parameter | Value | Why |
|-----------|-------|-----|
| `delegationMode: "candidacy"` | Structured delegation with scrutiny | The platform's strongest differentiator. Degrades gracefully — if nobody publishes a candidacy, people use search (equivalent to `open` mode) |
| `topicScoped: true` | Topic-specific delegation | Lets members delegate on topics they don't follow while voting directly on topics they care about |
| `secrecy: "secret"` | Secret ballot | Protects voters from coercion. Delegate candidates can opt into transparency individually |
| `resultsVisibility: "sealed"` | Results hidden until voting ends | Prevents strategic voting. Combined with `allowVoteChange: true`, maximizes deliberation freedom |
| `predictions: "encouraged"` | Predictions active but not required | Builds the accountability infrastructure without alienating newcomers who just want to vote |
| `communityNotes: true` | Distributed verification | Self-sustaining system (Paper II §4) — no administrator needed for content curation |
| `polls: true` | Surveys enabled | Evidence base for prediction tracking (Paper II §3) — the feedback loop that makes accountability functional |
| `deliberationDays: 7` | One week for proposals and endorsements | Long enough for thoughtful deliberation, short enough to maintain engagement |
| `curationDays: 2` | Two days for admin curation | Dedicated window after deliberation for booklet preparation |
| `votingDays: 7` | One week to vote | Accommodates different schedules without dragging |

### 2.3 Preset renaming

The existing presets get clearer, non-hierarchical names:

| Old Name | New Name | Description |
|----------|----------|-------------|
| *(new)* | **Modern Democracy** | *"The recommended default."* Delegation with candidates, booklet, surveys, community notes, predictions |
| TOWN_HALL | **Direct Democracy** | Every member votes on every question. No delegation. Suitable for small groups that want simplicity |
| SWISS_MODEL | **Swiss Votation** | Direct democracy with structured booklets and community notes. Like Switzerland — everyone votes, but well-informed |
| LIQUID_STANDARD | **Liquid Open** | Open delegation without candidacy profiles. For groups where everyone knows each other |
| LIQUID_ACCOUNTABLE | **Full Accountability** | Everything on, predictions mandatory, aggressive awareness. Maximum transparency and accountability |
| BOARD_PROXY | **Board Proxy** | *(unchanged)* Single-delegate proxy voting for formal governance bodies |
| CIVIC_PARTICIPATORY | **Civic Participatory** | *(unchanged)* Municipal-scale deployment with blockchain integrity |

The old `PresetName` enum values remain as internal identifiers for backward compatibility. The `name` field on each preset carries the new display name.

---

## 3. Assembly-Level Timeline Configuration

### 3.1 New config section: `TimelineConfig`

Timeline parameters are part of the immutable `GovernanceConfig`. They apply to all voting events within the assembly.

```typescript
interface TimelineConfig {
  /** Days for the deliberation phase. Proposals, endorsements, community notes. */
  readonly deliberationDays: number;
  /**
   * Days for the curation phase. Admins curate the booklet and write recommendations.
   * 0 = no curation phase; system auto-selects highest-endorsed proposals immediately.
   */
  readonly curationDays: number;
  /** Days for the voting phase. */
  readonly votingDays: number;
}
```

Added to `GovernanceConfig`:

```typescript
interface GovernanceConfig {
  // ... existing fields ...
  /** Timeline durations for voting events. */
  readonly timeline: TimelineConfig;
}
```

### 3.2 Event lifecycle with curation phase

When an event is created, the timeline is computed from `GovernanceConfig.timeline`:

```
Event created
  │
  ▼
[Deliberation: N days]
  - Proposals can be submitted
  - Endorsements (thumbs up/down) are active
  - Community notes can be attached
  - Admins can begin curating (featuring proposals)
  │
  ▼
[Curation: M days]  (skipped if curationDays = 0)
  - No new proposals accepted
  - Endorsements frozen (scores locked)
  - Admins curate: feature/unfeature proposals, write recommendations
  - The booklet is finalized during this window
  │
  ▼
[Voting: P days]
  - Proposals locked (already locked since curation start)
  - Booklet available to all voters
  - Votes accepted
  │
  ▼
Closed
  - Results visible (if sealed, now revealed)
  - Predictions can be evaluated against outcomes
```

When `curationDays = 0`:
- Deliberation transitions directly to voting
- Proposals lock when voting opens
- The system applies the auto-fallback for the booklet: highest-endorsed proposal per position
- Admins can still feature proposals during deliberation, but there's no protected curation-only window

**Community notes during curation:** Community notes remain active during the curation phase. They are part of the ongoing deliberation process — an admin might discover a note during curation that changes which proposal to feature. Only proposals and endorsements are frozen.

**Multi-admin curation conflict:** Multiple admins can curate simultaneously. To prevent confusion, at most one proposal per `choiceKey` per issue can be featured at a time. Featuring a new proposal for the same position automatically unfeatures the previous one. The booklet query always returns exactly one featured (or auto-selected) proposal per position.

### 3.3 Why assembly-level, not per-event

The timeline is part of the governance rules. Members learn the rules once during onboarding: "In this group, you get 7 days to deliberate, 2 days for curation, then 7 days to vote." They never need to check per-event whether this particular vote has different timing.

This is consistent with Paper II §5.2: "Assembly governance configuration is immutable... set at creation and cannot be changed." Timeline parameters are governance rules, not event-specific decisions.

The event creator sets the *start date*. The system computes all phase transitions from the start date plus the assembly's timeline config.

### 3.4 Timeline defaults for existing presets

| Preset | Deliberation | Curation | Voting |
|--------|-------------|----------|--------|
| Modern Democracy | 7 | 2 | 7 |
| Direct Democracy | 7 | 0 | 7 |
| Swiss Votation | 7 | 2 | 7 |
| Liquid Open | 5 | 0 | 5 |
| Full Accountability | 7 | 3 | 7 |
| Board Proxy | 3 | 0 | 3 |
| Civic Participatory | 14 | 3 | 14 |

Direct Democracy and Liquid Open have `curationDays: 0` because they either lack the booklet infrastructure or operate in informal contexts. Board Proxy is shorter because board meetings operate on tighter schedules. Civic Participatory is longer because municipal decisions affect more people and deserve more deliberation time.

---

## 4. Assembly Ownership and Administration

### 4.1 Role model

```
Owners ⊆ Admins ⊆ Participants
```

Every owner is also an admin. Every admin is also a participant. The creating participant is the initial owner (and therefore also admin).

### 4.2 Role capabilities

| Capability | Participant | Admin | Owner |
|-----------|-------------|-------|-------|
| Vote, delegate, endorse | Yes | Yes | Yes |
| Submit proposals, community notes | Yes | Yes | Yes |
| Respond to surveys | Yes | Yes | Yes |
| Create voting events | No | Yes | Yes |
| Create surveys | No | Yes | Yes |
| Curate booklet (feature/unfeature) | No | Yes | Yes |
| Write booklet recommendations | No | Yes | Yes |
| Manage assembly membership | No | Yes | Yes |
| Add/remove admins | No | No | Yes |
| Add/remove owners | No | No | Yes |
| Delete the assembly | No | No | Yes |

**Note:** "Curate booklet" replaces the current "event creator only" authorization. Now any admin can curate any event's booklet within the assembly. This is more practical — the event creator may not be available during the curation window, and it avoids the single-point-of-failure problem at the event level too.

### 4.3 Invariants

1. **At least one owner must always exist.** An owner cannot remove themselves if they are the last owner. They must first promote another admin to owner, or delete the assembly.

2. **Owners are always admins.** Promoting a participant to owner automatically makes them an admin if they aren't already. Demoting an owner to non-owner keeps them as admin (they can be separately removed from admin). Corollary: removing admin from an owner requires removing ownership first — the system rejects admin removal if the participant is still an owner.

3. **The assembly creator is the initial owner.** No assembly can be created without an owner.

4. **GovernanceConfig is immutable; assembly metadata is mutable.** The governance rules (delegation mode, ballot parameters, timeline, features, thresholds) are set at creation and cannot be changed. Assembly metadata — name, description, roles, membership — is mutable and recorded as events. This distinction ensures governance predictability while allowing normal organizational evolution.

### 4.4 Owner transfer and succession

**Voluntary transfer:** An owner promotes another admin (or participant) to owner. The original owner can then optionally step down from ownership. This is a two-step process to prevent accidental loss of control.

**Multi-owner model:** Any number of admins can be promoted to owner. This addresses the fragility problem — people can die, lose access to devices, become unreachable. Multiple owners ensure continuity.

**Last-owner constraint:** The last remaining owner cannot resign ownership. They must either:
- Promote another admin to owner first, then resign
- Delete the assembly entirely

There is no platform-level recovery for orphaned assemblies because orphaned assemblies cannot exist.

### 4.5 Data model

#### VCP layer

Role changes are recorded as events (`RoleGranted`, `RoleRevoked`) in the event store, consistent with the event-sourcing architecture and Paper II §5.2 ("administrative actions recorded in the event store"). The `assembly_roles` table is a materialized view for fast authorization checks.

```sql
-- Materialized role state (rebuilt from events)
CREATE TABLE assembly_roles (
  assembly_id    TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  role           TEXT NOT NULL,  -- 'owner' | 'admin'
  granted_by     TEXT NOT NULL,  -- participant_id who granted this role
  granted_at     INTEGER NOT NULL,
  PRIMARY KEY (assembly_id, participant_id, role)
);
```

Ownership and admin status live in the VCP because they govern authorization for governance operations (event creation, curation, membership management). The VCP already authorizes these operations — adding role-based checks is a natural extension.

The `voting_event_creators` table is retained for historical attribution (who created this event) but is no longer used for curation authorization. Curation authorization checks `assembly_roles` for admin status.

#### Backend layer

The backend enriches role data with display names and avatars when serving the group profile. It queries the VCP for roles and joins with its own user identity data.

### 4.6 Group profile display

The group profile page shows:

1. **Group name and description**
2. **Governance rules summary** (preset name + key parameters)
3. **Timeline** (deliberation/curation/voting durations)
4. **Owners** — listed with name, avatar, and "Owner" badge
5. **Admins** — listed with name, avatar, and "Admin" badge
6. **Member count** (not a full member list — privacy per Paper II §2.6)

This transparency is consistent with the platform's ethos: participants should know who has administrative power in their group.

---

## 5. Group Creation UX

### 5.1 Flow

```
[1. Name & Description]
    Group name, optional description

[2. Governance Rules]
    Pre-filled with Modern Democracy defaults

    "These rules define how your group governs itself.
     They apply to all votes and cannot be changed after creation.
     This ensures every member can trust that the rules won't shift."

    [Customize ▼]  (collapsed by default)
      ┌─────────────────────────────────────────┐
      │ Preset: [Modern Democracy ▼]            │
      │         Reset all settings to preset     │
      │                                          │
      │ Delegation                               │
      │   Mode: [Candidacy ▼]                    │
      │   Topic-scoped: [Yes]                    │
      │   Transitive: [Yes]                      │
      │   Max delegates: [Unlimited]             │
      │   ...                                    │
      │                                          │
      │ Ballot                                   │
      │   Secrecy: [Secret ▼]                    │
      │   Results visibility: [Sealed ▼]         │
      │   Allow vote change: [Yes]               │
      │   Quorum: [10%]                          │
      │   ...                                    │
      │                                          │
      │ Timeline                                 │
      │   Deliberation: [7] days                 │
      │   Curation: [2] days                     │
      │   Voting: [7] days                       │
      │                                          │
      │ Features                                 │
      │   Community notes: [Enabled]             │
      │   Surveys: [Enabled]                     │
      │   Predictions: [Encouraged ▼]            │
      │   ...                                    │
      └─────────────────────────────────────────┘

[3. Create Group]
    Button: "Create Group"
    Confirmation: "These rules are permanent. Continue?"
```

### 5.2 Key UX principles

1. **The default is pre-filled and ready.** A user who clicks "Create Group" without expanding "Customize" gets Modern Democracy. Most groups should never touch the customization panel.

2. **Customization is opt-in, not the default path.** The collapsed panel signals: "You can change this, but you probably don't need to."

3. **The preset selector resets everything.** Selecting a preset from the dropdown replaces all parameter values with that preset's values. This is a bulk reset, not a merge.

4. **Immutability is framed as a feature, not a limitation.** The language emphasizes trust and predictability: "every member can trust that the rules won't shift."

5. **No jargon in the UI.** "Delegation with candidates" not "candidacy mode." "Secret ballot" not "ballot secrecy: secret." The underlying config keys are for developers; the UI speaks plain language.

### 5.3 Onboarding: showing rules to new members

When a user joins an assembly, they see a governance rules summary:

```
Welcome to [Group Name]

This group uses Modern Democracy governance:
  - Members can delegate their vote to trusted candidates by topic
  - Proposals are deliberated for 7 days, curated for 2 days, then voted on for 7 days
  - Community notes help verify claims in proposals and candidate profiles
  - Ballots are secret; results are revealed after voting ends
  - You can change your vote any time before voting closes

These rules are permanent and apply to all votes in this group.
```

This summary is generated from the `GovernanceConfig` — not hardcoded per preset. Any custom configuration produces an accurate plain-language summary.

---

## 6. Revised Preset Summary

| Preset | Delegation | Curation | Notes | Surveys | Predictions | Timeline (D/C/V) |
|--------|-----------|----------|-------|---------|-------------|-------------------|
| **Modern Democracy** *(default)* | Candidacy, topic-scoped, transitive | 2 days | Yes | Yes | Encouraged | 7/2/7 |
| **Direct Democracy** | None | None | No | No | Disabled | 7/0/7 |
| **Swiss Votation** | None | 2 days | Yes | No | Encouraged | 7/2/7 |
| **Liquid Open** | Open, topic-scoped, transitive | None | No | No | Optional | 5/0/5 |
| **Full Accountability** | Candidacy, topic-scoped, transitive | 3 days | Yes | Yes | Mandatory | 7/3/7 |
| **Board Proxy** | Open, 1 delegate, non-transitive | None | No | No | Disabled | 3/0/3 |
| **Civic Participatory** | Open, topic-scoped, transitive | 3 days | Yes | Yes | Mandatory | 14/3/14 |

**Note on proposals and booklets:** Proposals and the voting booklet are available to all assemblies regardless of preset — they are platform capabilities, not configuration toggles. Any member can submit a proposal for any voting issue. What varies by configuration is the **curation phase**: whether admins get a dedicated window to curate the booklet. When curation is "None" (`curationDays: 0`), the booklet still works — the system auto-selects the highest-endorsed proposal per position.

---

## 7. Implementation Plan

### Behavioral changes to call out

- **Event creation restricted to admins.** Currently any participant can create voting events. This design restricts event creation to admins and owners. Existing assemblies will need role backfill (see migration below).
- **Curation authorization broadened.** Currently event-creator-only. This design allows any admin to curate any event's booklet. The `voting_event_creators` table is retained for attribution but no longer used for auth.
- **Featured proposals are exclusive per position.** Currently multiple proposals per `choiceKey` can be featured simultaneously. This design enforces at most one featured per `choiceKey` per issue.

### Migration strategy for existing assemblies

Existing assemblies store a `GovernanceConfig` without a `timeline` field. Migration approach:

1. **Config backfill:** When loading an assembly whose config lacks `timeline`, derive defaults from the preset name stored at creation. If no preset was used, apply `{ deliberationDays: 7, curationDays: 0, votingDays: 7 }` as a safe fallback. This is a read-time migration — no schema change needed.
2. **Role backfill:** Existing assemblies have no roles. Run a migration script that grants `owner` + `admin` to the participant who created each assembly (derived from the first event or from `voting_event_creators`). If the creator cannot be determined, flag the assembly for manual resolution.
3. **In-flight events:** Events that are already in deliberation or voting when the migration runs keep their current phase timing. The assembly-level timeline applies only to events created after migration.

### A. Config package changes

1. Add `TimelineConfig` interface to `@votiverse/config/types.ts`
2. Add `timeline` field to `GovernanceConfig`
3. Add `MODERN_DEMOCRACY` preset, set as the new default
4. Rename existing presets (new display names, keep internal keys for backward compatibility)
5. Add `timeline` values to all existing presets
6. Update config validation to enforce `deliberationDays >= 1`, `curationDays >= 0`, `votingDays >= 1`
7. Update tests

### B. VCP changes

8. Add `RoleGranted` and `RoleRevoked` event types to `@votiverse/core`
9. Add `assembly_roles` table as materialized view (SQLite + PostgreSQL schemas)
10. Add role assignment on assembly creation (creator becomes owner + admin)
11. Add role management API routes: `POST/DELETE /assemblies/:id/roles`
12. Update curation authorization to check admin role instead of event creator
13. Enforce exclusive featuring: featuring a proposal for a position auto-unfeatures any other for the same `choiceKey`
14. Implement curation phase enforcement: reject new proposals and endorsements during curation window
15. Compute event phase transitions from assembly timeline config
16. Migration script for existing assemblies (role backfill, config backfill)
17. Update tests

### C. Backend changes

18. Add role queries to VCP client
19. Add group profile endpoint that includes roles with user identity enrichment
20. Update assembly creation to pass creator identity for role assignment
21. Update tests

### D. Web UI changes

22. Group creation form with preset selector and customization panel
23. Immutability messaging and confirmation
24. Group profile page with owner/admin display
25. Onboarding rules summary for new members
26. Update event timeline display to show deliberation/curation/voting phases
27. Update tests

---

## 8. Toward Paper III

These design decisions form the basis for a third paper: **"Democracy in Every Pocket: Sensible Defaults for Modern Collective Decision-Making."**

The argument:
- Paper I defined the governance parameter space — the full spectrum from direct democracy to liquid delegation
- Paper II showed the system must be self-sustaining — generating its own evidence, verifying its own claims, maintaining its own accountability
- Paper III argues that a good default is not a cop-out but a normative contribution: *if you had to design democracy from scratch today, knowing what we know about participation, delegation, information, accountability, and the devices people carry — what would you build?*

The answer is Modern Democracy: liquid delegation with candidate scrutiny, Swiss-style structured deliberation, community notes for distributed verification, surveys for self-generated evidence, and prediction tracking for institutional learning. Not because this is the only valid configuration, but because it composes the strongest available mechanisms into a coherent whole that degrades gracefully when any component is underused.

Customization exists not because the default is arbitrary, but because the right to define your own governance rules is itself a democratic principle. Every group can choose direct democracy, board proxy, or any other configuration. The default is what the platform recommends — the configuration it would choose for a group that asked "just make it work."

The paper would also explore the philosophical implications: that choosing a default for governance is itself a governance act, that the platform's defaults will shape millions of small democracies, and that this responsibility demands the same rigor as any formal governance mechanism.

---

*This document supersedes the implicit preset hierarchy in the codebase. The endorsement-curation-booklet design (v1.0) is extended by the curation phase timeline in Section 3.*
