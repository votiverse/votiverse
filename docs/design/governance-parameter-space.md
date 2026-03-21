# Governance Parameter Space Redesign

**Design Document — v1.0**
**March 2026**

---

## 1. Motivation

The governance configuration has grown organically. The `DelegationConfig` alone has 8 fields, the `BallotConfig` has 8 more, `FeatureConfig` has 8, plus thresholds and topics. Many of these parameters are implementation tuning disguised as governance choices, and several are not orthogonal — they conflate independent concerns or represent derived values that shouldn't be configured directly.

Three problems prompted this redesign:

**The delegation model is misrepresented.** The current `delegationMode` type — `"open" | "candidacy" | "none"` — conflates two independent axes: whether formal candidates exist (a discoverability/accountability concept) and whether vote delegation is enabled at all. The `"candidacy"` value bundles "anyone can delegate to anyone" with "candidates are featured in discovery," making it impossible to express "candidates only, no transitivity" (classic proxy) as a first-class mode. Meanwhile, `transitive: boolean` is declared in the config but never enforced in the engine — all chains are resolved transitively regardless. The parameter space suggests distinctions that don't exist in the implementation, and lacks distinctions that matter in governance theory.

**Too many knobs, not enough decisions.** A group creator configuring their governance faces 20+ parameters spread across 6 sections. Most of these aren't governance *decisions* — they're implementation details. `noteVisibilityThreshold: 0.3` is a tuning parameter. `awarenessIntensity: "standard"` is an infrastructure dial. `maxAge: 31_536_000_000` is an operational timeout. These belong in sensible defaults, not in the configuration surface that defines how a community governs itself.

**The default preset needs a better name.** "Modern Democracy" is aspirational rather than descriptive. It tells you nothing about what the system actually does. The name should communicate the core mechanism — delegation — and the word "modern" adds no information.

---

## 2. The Two Axes of Delegation

The central insight of this redesign is that delegation is defined by two independent boolean axes:

### Axis 1: Candidacy

*Is there a formal system for declaring "I'm willing to represent others"?*

When **enabled**: members can declare themselves as candidates, publish profiles explaining their positions, and appear in the delegate discovery UI. This is an accountability mechanism — it ensures that people accumulating delegated voting power have explicitly opted in and made their positions visible.

When **disabled**: there is no candidate declaration system. Delegation, if it exists, is informal — you delegate to someone you know, without any institutional framework for discovering or evaluating potential delegates.

### Axis 2: Transferability

*Can delegated voting power flow through chains?*

When **enabled**: if Alice delegates to Bob, and Bob delegates to Carol, then Carol carries Alice's weight. Voting power is transferable — it flows through the delegation graph like liquid. This is the core mechanism of liquid democracy.

When **disabled**: voting power cannot be transferred beyond one hop. In combination with candidacy, this produces classic proxy/representative voting — you appoint a declared candidate, and they vote for you, but they cannot pass your vote further. Without candidacy, this means no delegation exists at all (there's no mechanism to delegate, and no one to delegate to).

### The 2×2 Grid

These two axes produce four governance families, all meaningful:

|  | No transfers | Transfers |
|---|---|---|
| **No candidates** | **Direct democracy.** Everyone votes on everything. No delegation mechanism exists. | **Informal liquid.** Anyone can delegate to anyone. Chains flow freely. No formal candidate system — groups where everyone knows each other. |
| **Candidates** | **Representative.** Appoint a declared candidate as your proxy. They vote for you but cannot pass your vote further. Classic proxy voting. | **Liquid delegation.** Candidates exist for discoverability and accountability. Anyone can delegate to anyone. Chains are transitive. Our recommended default. |

Delegation exists when either axis is enabled. When both are off, it's pure direct democracy.

### Why not a single `mode` enum?

An earlier design considered `delegationMode: "none" | "proxy" | "open"` as a single axis. This is simpler but loses expressiveness:

- It can't represent "informal liquid" (transfers without candidates) as a distinct mode — you'd need to bolt on a `candidacy: boolean` anyway.
- It bundles transitivity with eligibility: `"proxy"` implicitly means non-transitive, which prevents a researcher from studying "candidates-only with transitive chains" (hierarchical representation).
- Two booleans are more intuitive than a 3-value enum: "Do we have formal candidates? Can votes be transferred?" are questions any group creator can answer.

### What about topic and issue scoping?

Topic-scoped delegation and issue-scoped delegation are always available when delegation is enabled. Topic scoping means "I trust Alice on Finance topics." Issue scoping means "I trust Alice on this specific ballot measure." An issue is the atomic unit of decision-making — the most granular possible topic scope.

This is not configurable because there's no principled reason to restrict it. If you trust someone enough to delegate your vote, you should be able to express the scope of that trust precisely. Scoping doesn't change the governance model — it refines how delegation is applied within any model.

---

## 3. The Minimal Parameter Space

The full governance configuration is reduced to 13 parameters across 4 sections. Every parameter represents a governance decision that a group creator can understand and reason about.

### 3.1 Delegation (2 parameters)

```typescript
interface DelegationConfig {
  /** Formal candidate declaration system. When true, members can declare
   *  as candidates, publish profiles, and appear in delegate discovery. */
  readonly candidacy: boolean;

  /** Transitive vote delegation. When true, delegated voting power flows
   *  through chains (A→B→C means C carries A's weight). */
  readonly transferable: boolean;
}
```

**Derived behaviors (not configured):**
- Delegation exists when `candidacy || transferable`
- Topic and issue scoping: always available when delegation exists
- Chain depth: unlimited when transferable; 1 hop when candidacy-only (proxy)
- Revocability: always — revoking a delegation is a core sovereignty right
- Max delegates per participant: unlimited
- Delegation expiry: none
- Delegation visibility: public when candidacy is enabled (accountability requires visibility), otherwise determined by implementation defaults

### 3.2 Ballot (5 parameters)

```typescript
interface BallotConfig {
  /** Are individual votes hidden from other members? */
  readonly secret: boolean;

  /** Are aggregate tallies visible while voting is still open? */
  readonly liveResults: boolean;

  /** Can participants change their vote during the voting period? */
  readonly allowVoteChange: boolean;

  /** Minimum fraction of members who must vote for the result to be valid (0–1). */
  readonly quorum: number;

  /** How votes are counted. */
  readonly method: "majority" | "supermajority";
}
```

These five parameters interact to produce recognizable voting patterns:

| Pattern | secret | liveResults | voteChange | Description |
|---|---|---|---|---|
| Swiss votation | true | false | true | Private deliberation, sealed until close |
| Show of hands | false | true | true | Open, deliberative, consensus-building |
| Traditional election | true | false | false | Cast once, sealed results |
| Accountable board vote | false | false | false | Public record, commitment once cast |

**Derived behaviors (not configured):**
- Supermajority threshold: 2/3 when method is supermajority (the overwhelmingly common threshold)
- Delegate vote visibility: delegates are always accountable to their delegators — when delegation exists, a delegator can see how their delegate voted, regardless of ballot secrecy. This is a structural property of delegation, not a configuration choice.
- Participation mode: always voluntary. Mandatory voting is a rare institutional requirement that can be added later if needed.

### 3.3 Features (3 parameters)

```typescript
interface FeatureConfig {
  /** Crowd-sourced context notes on proposals, evaluated by the community. */
  readonly communityNotes: boolean;

  /** Falsifiable predictions attached to proposals, with track records over time. */
  readonly predictions: boolean;

  /** Sentiment surveys decoupled from binding votes. */
  readonly surveys: boolean;
}
```

**What was removed:**
- `predictions` simplified from 4-level (`disabled | optional | encouraged | mandatory`) to boolean. The distinction between "optional" and "encouraged" is a UI nudge, not a governance rule. "Mandatory" is a rare institutional requirement. On/off is the governance decision; intensity is UX.
- `noteVisibilityThreshold`, `noteMinEvaluations`: implementation tuning with sensible defaults (0.3 and 3 respectively). Not governance decisions.
- `surveyResponseAnonymity`: surveys are always anonymous. This is a design principle, not a choice.
- `awarenessIntensity`: infrastructure dial, not a governance parameter.
- `blockchainIntegrity`: future feature, not essential to the governance model.

### 3.4 Timeline (3 parameters)

```typescript
interface TimelineConfig {
  /** Days for deliberation. Proposals submitted, endorsed, community-noted. Must be ≥ 1. */
  readonly deliberationDays: number;

  /** Days for curation. Admins curate the voting booklet. 0 = no curation phase. */
  readonly curationDays: number;

  /** Days for voting. Must be ≥ 1. */
  readonly votingDays: number;
}
```

Timeline is unchanged from the current design but is surfaced differently in the UI (see Section 5).

### 3.5 Removed sections

| Section | Reason |
|---|---|
| `ThresholdConfig` (`concentrationAlertThreshold`) | Awareness tuning, not a governance decision. Internal default. |
| `TopicConfig` (`maxTopicDepth`) | Always 2. Never varied across any preset. Not a governance choice. |

---

## 4. Named Presets

Presets are named points in the 13-parameter space. Each represents a genuinely different governance philosophy — not a parameter tweak.

### 4.1 Preset table

| Preset key | User-facing name | candidacy | transferable | secret | liveResults | voteChange | quorum | method | notes | predictions | surveys | delib | curation | voting |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `LIQUID_DELEGATION` | Liquid Delegation | true | true | true | false | true | 10% | majority | on | on | on | 7 | 2 | 7 |
| `DIRECT_DEMOCRACY` | Direct Democracy | false | false | true | false | true | 0% | majority | off | off | off | 7 | 0 | 7 |
| `SWISS_VOTATION` | Swiss Votation | false | false | true | false | true | 20% | majority | on | on | off | 7 | 2 | 7 |
| `LIQUID_OPEN` | Liquid Open | false | true | false | true | true | 10% | majority | off | off | off | 5 | 0 | 5 |
| `REPRESENTATIVE` | Representative | true | false | true | false | true | 50% | majority | off | off | off | 3 | 0 | 3 |
| `CIVIC` | Civic Participatory | true | true | true | false | true | 10% | majority | on | on | on | 14 | 3 | 14 |

### 4.2 Preset rationale

**Liquid Delegation** (default) — The recommended starting point. Combines liquid delegation with candidate accountability, community notes for crowd-sourced verification, predictions for long-term track records, and structured deliberation with a curation phase. Secret ballot protects voters from social pressure. Sealed results prevent bandwagon effects. This is the synthesis described in Paper I.

**Direct Democracy** — Everyone votes on everything. No delegation, no community notes, no curation. For small groups (clubs, parent committees, informal collectives) where direct participation is practical and adding governance infrastructure would be overhead.

**Swiss Votation** — Direct democracy with structured deliberation. No delegation, but community notes provide crowd-sourced context and predictions encourage accountability. A curation phase produces a voting booklet. Inspired by the Swiss popular vote model. For cooperatives, associations, and civic groups that want informed direct democracy.

**Liquid Open** — Informal liquid democracy for groups where everyone knows each other. No formal candidates — anyone delegates to anyone. Public ballots with live results: the group deliberates in the open. Short timelines, no curation. For tech communities, professional associations, and medium-sized organizations with high trust.

**Representative** — Classic proxy voting. Declare a candidate, appoint them as your representative. They vote for you but cannot transfer your vote further. High quorum (50%) ensures legitimacy. Short timelines for focused decision-making. For corporate boards, formal committees, HOAs, and unions.

**Civic Participatory** — Liquid delegation at municipal scale. Longer timelines (14-day deliberation, 14-day voting) for broader participation. Full feature set with community notes, predictions, and surveys. For cities, participatory budgeting, citizen assemblies, and any context where the voter population is large and diverse.

### 4.3 Removed presets

| Former preset | Disposition |
|---|---|
| `MODERN_DEMOCRACY` | Renamed to `LIQUID_DELEGATION`. Same governance model, descriptive name. |
| `LIQUID_ACCOUNTABLE` | Removed. It was Liquid Delegation with `secrecy: "public"` and `predictions: "mandatory"` — a parameter tweak, not a distinct philosophy. Groups that want full transparency can start from Liquid Delegation and flip `secret` to false. |
| `BOARD_PROXY` | Renamed to `REPRESENTATIVE`. The name "Board Proxy" was too narrow — the same model applies to unions, HOAs, committees, and any context with appointed representatives. |

---

## 5. Group Creation UX Changes

### 5.1 Timeline in the main form

Timeline settings (deliberation, curation, voting days) are moved from the customization modal to the main group creation form. They appear between the governance summary and the admission mode selector.

**Rationale:** Timeline is a different kind of setting from governance rules. Governance rules (delegation model, ballot secrecy) define *how decisions work* — they're structural and permanent. Timeline defines *how long things take* — it's operational and the first thing a group creator will want to tune. A condo board that meets weekly wants 3-day votes. A city council needs 14-day deliberation. This isn't "advanced" — it's the most practical question after "what's the group called?"

**Layout:** Three inline inputs on a single row, reading left to right as a pipeline:

```
Deliberation  [7] days    Curation  [2] days    Voting  [7] days
                                        Total: 16 days per vote
```

Changing the governance preset updates the timeline defaults. Editing the timeline values marks the configuration as customized.

### 5.2 Simplified customization modal

The customization modal ("Customize rules") loses the Timeline section (moved to main form). The remaining sections are:

1. **Preset selector** — dropdown with the 6 presets, each with a one-line description
2. **Delegation** — candidacy toggle, transferable toggle
3. **Ballot** — secret toggle, live results toggle, vote change toggle, quorum slider, method selector
4. **Features** — community notes toggle, predictions toggle, surveys toggle

This is 13 parameters total: 2 + 5 + 3 + 3 (timeline in main form). Each one has a clear label and a binary or simple-value control. No nested sub-sections, no conditional fields (like supermajority threshold appearing only when supermajority is selected).

---

## 6. Engine and VCP Changes

### 6.1 Config types

Replace the current `DelegationConfig` (8 fields), `BallotConfig` (8 fields), `FeatureConfig` (8 fields), `ThresholdConfig` (1 field), and `TopicConfig` (1 field) with the minimal interfaces defined in Section 3.

The old fields become internal defaults or derived behaviors. They are not removed from the engine's internal processing — they're removed from the configuration surface. The engine may still maintain internal representations (e.g., resolved chain depth, visibility mode) derived from the simplified config.

### 6.2 Delegation enforcement

Two new enforcement paths in the delegation engine:

1. **Proxy mode** (`candidacy=true, transferable=false`): the delegation service rejects targets who haven't declared candidacy. Graph resolution truncates chains at depth 1.

2. **Informal liquid** (`candidacy=false, transferable=true`): delegation works identically to the current open mode. No candidate profiles needed.

The `transitive` flag, which was declared in config but never enforced, is removed. Transitivity is now derived from `transferable`.

### 6.3 Preset migration

All preset constants are updated to use the new config shape. The `PresetName` type changes to reflect renamed/removed presets. The default changes from `"MODERN_DEMOCRACY"` to `"LIQUID_DELEGATION"`.

### 6.4 Validation

Config validation enforces the single constraint: there are no invalid parameter combinations in the simplified space. Every combination of the 13 parameters is valid. The only derived constraint — `candidacy=true` implies candidate declaration infrastructure exists — is an implementation concern, not a validation rule.

---

## 7. What Researchers Can Do

The 13-parameter space is small enough to enumerate but expressive enough for meaningful experiments. Every combination is valid — there are no invalid states.

The parameter space produces `2 × 2 × 2 × 2 × 2 × continuous × 2 × 2 × 2 × 2 × continuous × continuous × continuous = 512 discrete combinations × continuous ranges` for the boolean/enum params alone.

Some research-relevant configurations not covered by named presets:

| Configuration | Parameters | Research question |
|---|---|---|
| Liquid + public ballots | candidacy=true, transferable=true, secret=false | Does delegate accountability change when votes are visible? |
| Representative by topic | candidacy=true, transferable=false | Does topic-scoped representation outperform global proxies? (researchers would create topic-scoped delegations within this config) |
| Bounded liquid | candidacy=true, transferable=true + internal maxChainDepth override | What happens when chains can't grow beyond N hops? |
| Direct + community notes | candidacy=false, transferable=false, communityNotes=true | Do community notes improve outcomes without delegation? |
| Liquid + mandatory quorum | candidacy=true, transferable=true, quorum=0.5 | Does high quorum reduce delegation reliance? |
| Show-of-hands liquid | transferable=true, secret=false, liveResults=true | How does real-time visibility affect delegation behavior? |

For edge cases beyond the 13 parameters (bounded chain depth, delegation expiry, max delegates), the engine maintains internal configuration that researchers can set programmatically through the engine API. The 13 parameters define the governance *model*; internal parameters tune the *implementation*.

---

## 8. Naming: Why "Liquid Delegation"

The default preset was previously named "Modern Democracy." This name was changed because:

1. **"Modern" is empty.** Every governance tool calls itself modern. The word adds no information about what the system does.
2. **"Democracy" is presumptuous.** A condo board using Votiverse isn't practicing democracy — they're making collective decisions. The system shouldn't tell groups what they are.
3. **"Liquid" does real work.** It communicates the core mechanism — delegations flow like liquid through a network. It's a term of art in governance research (liquid democracy) but also intuitive to newcomers. Liquid means fluid, revocable, dynamic.
4. **"Delegation" is descriptive.** It tells you what happens: you delegate your vote. It pairs naturally with "Direct Democracy" (you vote directly) and "Representative" (you appoint a representative) — three points on the delegation spectrum.

The name describes the mechanism, not the aspiration. The mechanism is what makes it distinctive.

---

## 9. Decisions Log

| Decision | Rationale |
|---|---|
| Two boolean axes for delegation (candidacy × transferable) | Orthogonal, all four quadrants meaningful, each axis answers a question any group creator can understand |
| Remove `transitive` from config | Was never enforced. Transitivity is now derived from `transferable` (true → unlimited chains, false + candidacy → depth 1) |
| Remove `topicScoped` from config | Topic and issue scoping are always available when delegation exists. No principled reason to restrict scope granularity. |
| Remove `maxChainDepth`, `maxDelegates`, `maxAge`, `revocable` from config | Implementation tuning, not governance decisions. Sensible defaults; available as internal engine params for researchers using the programmatic API. |
| Remove `delegateVoteVisibility` from config | Derived: delegates are always accountable to their delegators. This is a structural property of delegation. |
| Remove `DelegationVisibilityConfig` from config | Default: public when candidacy is enabled. Not a governance decision at the config level. |
| Collapse `BallotSecrecy` from 3-way to boolean | "anonymous-auditable" is an implementation technique, not a governance choice. |
| Collapse `PredictionRequirement` from 4-level to boolean | The disabled/optional/encouraged/mandatory spectrum is UX intensity, not governance design. |
| Remove `participationMode` from config | Mandatory voting is rare. Can be added later if a research or institutional need arises. |
| Remove `ThresholdConfig` and `TopicConfig` from config | Tuning and constants, not governance choices. |
| Rename MODERN_DEMOCRACY → LIQUID_DELEGATION | Descriptive name that communicates the mechanism. |
| Remove LIQUID_ACCOUNTABLE preset | Parameter tweak from Liquid Delegation (public ballots + mandatory predictions), not a distinct governance philosophy. |
| Rename BOARD_PROXY → REPRESENTATIVE | The proxy model applies broadly (unions, HOAs, committees), not just boards. |
| Timeline in main form, not in customization modal | Timeline is operational ("how long?"), not structural ("how does it work?"). Different kind of setting, deserves direct access. |
| Removed presets are parameter tweaks, not philosophies | Each surviving preset occupies a distinct position in the delegation 2×2 grid or represents a meaningfully different deliberation structure. |
