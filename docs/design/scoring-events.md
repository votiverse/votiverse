# Scoring Events: Rubric-Based Multi-Criteria Ranking

**Design Document — v1.2**
**March 2026**

---

## 1. Motivation

Votiverse's participation model currently supports three modes of structured input from group members:

1. **Voting** — choosing among options on an issue (single-dimensional, delegable)
2. **Surveys** — responding to structured questions (multi-dimensional, non-delegable, non-binding)
3. **Predictions** — committing falsifiable forecasts (immutable, individually accountable)

There is a fourth mode that these three do not capture: **multi-criteria scoring**. This is the pattern where a group of people scores a set of entries against a structured rubric — each entry rated on multiple dimensions, each dimension with its own scale, dimensions optionally grouped into weighted categories.

Real-world instances of this pattern:

- **Competition judging** — hackathons, science fairs, talent shows, design contests
- **Grant review panels** — scoring proposals on feasibility, impact, budget, team
- **Contractor selection** — scoring bids on cost, quality, timeline, reputation
- **Award committees** — rating nominees across achievement categories
- **Hiring panels** — scoring candidates on skills, experience, culture fit
- **Project portfolio prioritization** — scoring initiatives on ROI, risk, alignment

These all share the same structure: a panel of scorers, a set of entries, a rubric defining scoring dimensions, and an aggregation method that produces a ranking. The binding question is not "for or against?" but "how does this entry compare to the others across these criteria?"

This document designs scoring as a standalone concept in the Votiverse engine — parallel to voting and surveys, reusing existing infrastructure where possible, introducing new primitives only where the domain demands it.

### 1.1 Why "scoring" and not "evaluation"

The term "evaluation" is already used in the codebase for the endorse/dispute signal on community notes and proposals (`NoteEvaluation`, `CommunityNoteEvaluated`, `ProposalEvaluation`). Using `@votiverse/evaluation` for multi-criteria scoring would create a semantic collision — "evaluation" would mean two different things.

"Scoring" describes the core action precisely, creates a natural family with the other participation modes (`voting` → Votes, `survey` → Surveys, `scoring` → Scores), and avoids collision with any existing concept.

---

## 2. Design Principles

### 2.1 No new structural concepts

The scoring model reuses existing Votiverse concepts wherever possible:

| Scoring concept | Existing concept | Rationale |
|---|---|---|
| Panel of judges | Group (assembly) | A group is already a bounded set of participants with shared governance config. A judge panel is a group whose purpose is scoring. |
| Entry being scored | Opaque entity with ID and label | Same as voting issues — the engine doesn't model what the entry *is*. It could be a person, a project, a proposal, a dish. The real-world meaning is external. |
| Scoring event | Event (parallel to voting event) | The operational container. Has a timeline, a set of entries, a rubric, and optionally a restricted panel. |
| Evaluator | Participant | No new role type. Every group member is a potential evaluator, just as every group member is a potential voter. |

The only genuinely new primitive is the **scorecard** — an evaluator's dimensional scoring of a single entry.

### 2.2 The engine captures mechanics, not domain

The scoring package captures the mechanics of rubric-based scoring: defining dimensions, collecting scorecards, aggregating results, producing rankings. It does not model:

- What entries represent (candidates, projects, proposals, dishes)
- What happens after rankings are computed (who wins the contract, who gets funded)
- How entries are submitted or curated (that's a consumer/backend concern)
- Rich content about entries (descriptions, attachments — that's backend content)

This follows the same boundary as voting: the engine knows how to tally votes, not what a vote *means* for the organization.

### 2.3 Non-delegable

Scoring is inherently personal. A judge's assessment reflects their individual expertise, observation, and judgment. It cannot be meaningfully transferred to someone else — delegation would undermine the purpose of having multiple independent evaluators.

This is the same invariant as surveys, but with an even stronger justification. Surveys capture sentiment, which is personal but potentially aggregatable. Scores carry epistemic weight — they presume the evaluator has directly observed or assessed the entry. A delegated score would be epistemically hollow.

**Invariant: Scorecards are non-delegable. Every evaluator scores for themselves or not at all.**

### 2.4 Coexistence with voting

A group can have both voting events and scoring events. A condo board might vote on budget proposals (binary) and score contractor bids (rubric-scored) within the same group. The two mechanisms are parallel and independent — they share the participant pool and topic system but use different event types, different submission formats, and different result structures.

---

## 3. Data Model

### 3.1 Branded IDs (added to `@votiverse/core`)

```typescript
/** Unique identifier for a scoring event. */
type ScoringEventId = string & { readonly __brand: "ScoringEventId" };

/** Unique identifier for an entry being scored. */
type EntryId = string & { readonly __brand: "EntryId" };

/** Unique identifier for a submitted scorecard. */
type ScorecardId = string & { readonly __brand: "ScorecardId" };
```

Rubric dimension IDs are plain strings scoped to the rubric definition. They don't need branded types because they're never referenced outside their rubric context (unlike `IssueId`, which appears in delegations, votes, proposals, etc.).

### 3.2 Rubric

The rubric defines the scoring framework — what dimensions exist, how they're scaled, how they're grouped, and how they're weighted. It is defined per scoring event, not per group, because different scoring events in the same group may need different rubrics.

```typescript
/** A single scoring dimension within a rubric category. */
interface RubricDimension {
  /** Unique within the rubric. Plain string, not branded. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Scoring scale for this dimension. */
  readonly scale: {
    readonly min: number;
    readonly max: number;
    /** Step size. Default 1 (integer scores). Use 0.5 for half-point scales. */
    readonly step?: number;
  };
  /** Relative weight within its category. Default 1. */
  readonly weight: number;
  /**
   * Optional named anchors for scale points.
   * E.g., ["poor", "fair", "good", "very good", "excellent"] for a 1-5 scale.
   * Length should match the number of discrete scale points.
   */
  readonly labels?: readonly string[];
}

/** A category grouping related dimensions. */
interface RubricCategory {
  /** Unique within the rubric. */
  readonly id: string;
  readonly name: string;
  /** Relative weight of this category in the final score. */
  readonly weight: number;
  readonly dimensions: readonly RubricDimension[];
}

/**
 * The complete rubric for a scoring event.
 *
 * The rubric combines structure (categories, dimensions, scales) with
 * aggregation methods. Aggregation lives here rather than in ScoringSettings
 * because the choice of method is tightly coupled with rubric design: you might
 * choose geometric-mean specifically because you designed a rubric where balance
 * across dimensions matters, or trimmed-mean because you expect a large panel.
 * The rubric is "what to measure and how to combine the measurements."
 * ScoringSettings is "operational policies" (revision, secrecy, normalization).
 */
interface Rubric {
  readonly categories: readonly RubricCategory[];
  /** How individual scores from multiple evaluators are combined per dimension. */
  readonly evaluatorAggregation: EvaluatorAggregation;
  /** How dimensional scores are combined into a final score per entry. */
  readonly dimensionAggregation: DimensionAggregation;
}
```

**Category hierarchy.** Categories are a single flat level of grouping. Dimensions are always nested within exactly one category. There is no deeper nesting. This matches real-world rubric design — competition rubrics have categories ("Technical", "Presentation", "Innovation") containing criteria, not arbitrarily deep trees.

**A rubric with one category** degenerates into a flat list of dimensions. The category still exists but has weight 1.0 and carries no semantic meaning beyond grouping.

**Weight semantics.** Weights are relative within their scope: dimension weights are relative within a category, category weights are relative across categories. The engine normalizes them during aggregation. A category with weight 2 counts twice as much as a category with weight 1, regardless of how many dimensions each contains.

### 3.3 Aggregation methods

The aggregation pipeline has two stages, each independently configurable, plus an optional normalization pre-processing step (see Section 6.0). The two core stages are:

```typescript
/**
 * How to combine scores from multiple evaluators for the same dimension.
 * Stage 1: across evaluators, per (entry, dimension) pair.
 */
type EvaluatorAggregation =
  | "mean"          // Arithmetic mean. Simple, standard.
  | "median"        // Robust to outliers. Good for panels > 5.
  | "trimmed-mean"; // Drop highest and lowest, then mean. Classic competition judging.

/**
 * How to combine dimensional scores into a single score per entry.
 * Stage 2: across dimensions, per entry.
 */
type DimensionAggregation =
  | "weighted-sum"      // Σ(weight_i × score_i). Linear. Most common.
  | "geometric-mean";   // ∏(score_i ^ weight_i). Penalizes imbalance.
                        // Caution: a zero on any dimension zeros the total.
                        // Rubrics using geometric-mean should have min ≥ 1
                        // on all dimensions to avoid this sharp edge.
```

**Why two stages?** They answer different questions. Stage 1 resolves disagreement between evaluators ("what do the judges collectively think about this dimension?"). Stage 2 resolves the commensurability problem across dimensions ("how do we combine 'creativity' and 'execution' into one number?"). These are independent design decisions — a competition might use trimmed-mean across judges (standard fairness practice) but weighted-sum across dimensions (simple, transparent).

**Why not outranking methods (ELECTRE, PROMETHEE)?** Outranking avoids the commensurability problem by comparing entries pairwise across criteria rather than scalarizing. It's theoretically appealing but produces partial orders (incomparabilities), is harder to explain to participants, and requires additional parameters (concordance/discordance thresholds). The scalarization approach (weighted sum, geometric mean) is what real competition judging uses universally, and it produces total rankings. Outranking could be added as a third `DimensionAggregation` variant later if research use cases demand it.

### 3.4 Entry

An entry is the thing being scored. It is intentionally minimal — the real-world meaning is external.

```typescript
/** An entry in a scoring event. Parallel to Issue in a voting event. */
interface ScoringEntry {
  readonly id: EntryId;
  readonly title: string;
  /** Optional short summary. Rich content about entries is a backend concern. */
  readonly description?: string;
}
```

No `topicId`, no `choices`, no content hash. The scoring package doesn't need to know what the entry represents. If entries need rich content (documents, images, portfolios), that's a backend concern — the same VCP/backend boundary that applies to proposals and candidacies.

**Immutability.** The entry list is fixed at creation time. Entries cannot be added or removed after the `ScoringEventCreated` event is recorded. This is the same rule as voting events (issues are fixed at creation). Adding entries mid-scoring would create ranking instability — late entries have fewer scores than early ones, distorting aggregation.

### 3.5 Scorecard

The scorecard is the core new primitive. It's an evaluator's complete scoring of a single entry against the rubric.

```typescript
/** A single dimension score within a scorecard. */
interface DimensionScore {
  /** Must match a dimension ID in the rubric. */
  readonly dimensionId: string;
  readonly score: number;
}

/**
 * An evaluator's scoring of one entry. One scorecard per evaluator per entry.
 * Parallel to VoteRecord (one vote per participant per issue).
 */
interface Scorecard {
  readonly id: ScorecardId;
  readonly scoringEventId: ScoringEventId;
  readonly evaluatorId: ParticipantId;
  readonly entryId: EntryId;
  readonly scores: readonly DimensionScore[];
  readonly submittedAt: Timestamp;
}
```

**Completeness.** A scorecard must include a score for every dimension in the rubric. Partial scorecards are rejected. This matches competition judging practice — a judge who doesn't score all criteria is disqualified or recused, not partially counted. If future use cases need partial scoring (e.g., large entry pools with specialist judges), this constraint can be relaxed per-event via a config flag.

**One scorecard per evaluator per entry.** This is the same constraint as one vote per participant per issue. Whether the scorecard can be revised depends on the scoring event's configuration (see Section 3.7).

### 3.6 Scoring event

The container for a scoring session. Parallel to `VotingEvent`.

```typescript
interface ScoringEvent {
  readonly id: ScoringEventId;
  readonly title: string;
  readonly description: string;
  readonly entries: readonly ScoringEntry[];
  readonly rubric: Rubric;
  /**
   * Optional panel restriction. When set, only these participants can
   * submit scorecards. When null/omitted, all active group members
   * can score — eligibility is checked at submission time against
   * current group membership.
   */
  readonly panelMemberIds: readonly ParticipantId[] | null;
  readonly timeline: ScoringTimeline;
  readonly settings: ScoringSettings;
  readonly createdAt: Timestamp;
}

/**
 * Timeline for a scoring event.
 * Simpler than voting: no deliberation/curation distinction.
 * Scoring opens, evaluators submit scorecards, scoring closes.
 */
interface ScoringTimeline {
  readonly opensAt: Timestamp;
  readonly closesAt: Timestamp;
}

/**
 * Scoring event status, derived from timeline and TimeProvider.
 * Not stored — computed on read, avoiding stale state.
 *
 * - "scheduled": now < opensAt
 * - "open": opensAt ≤ now < closesAt
 * - "closed": now ≥ closesAt, or ScoringEventClosed received
 */
type ScoringStatus = "scheduled" | "open" | "closed";

/** Per-scoring-event settings (not assembly-level config). */
interface ScoringSettings {
  /** Can evaluators revise their scorecards before the event closes? */
  readonly allowRevision: boolean;
  /** Are individual evaluator scores hidden until the event closes? */
  readonly secretScores: boolean;
  /**
   * Normalize scores across evaluators before aggregation.
   * When true, each evaluator's scores are z-score standardized
   * (subtract evaluator's mean, divide by standard deviation, rescale
   * to rubric range) before evaluator aggregation. This corrects for
   * "generous" vs. "strict" scoring tendencies so that all evaluators
   * contribute equally to relative ordering regardless of their
   * individual scale usage.
   *
   * Requires at least 3 scored entries per evaluator to compute
   * meaningful statistics. Falls back to raw scores otherwise.
   *
   * Default false — raw scores are used as submitted.
   */
  readonly normalizeScores: boolean;
}
```

**Evaluator eligibility: open vs. panel.** By default, all active group members can score — no fixed evaluator list needed. This means members who join after the scoring event is created can still participate while it's open. When a specific panel is needed (competition jury, expert review), the creator selects members and their IDs are stored in `panelMemberIds`. The VCP checks membership at scorecard submission time: if `panelMemberIds` is set, the submitter must be in the list; otherwise, any active group member is eligible.

**Why settings are per-event, not per-group.** Different scoring events in the same group may need different policies. A preliminary judging round might allow revision (judges compare notes), while a final round might lock scores on submission. A transparent scoring event might show live scores; a competition might seal them. A small panel of experienced judges may not need normalization; a large panel with mixed experience levels may benefit from it. Following the minimal config philosophy, these are per-event settings with no assembly-level defaults. The governance config gets only a feature toggle.

### 3.7 Ranking result

The output of aggregation. Parallel to `TallyResult` for voting.

```typescript
/** Per-dimension aggregate for one entry. */
interface DimensionResult {
  readonly dimensionId: string;
  readonly dimensionName: string;
  /** Aggregated score across evaluators (after evaluator aggregation). */
  readonly aggregatedScore: number;
  /** Per-evaluator stats. */
  readonly mean: number;
  readonly median: number;
  readonly standardDeviation: number;
  /** Number of evaluators who scored this dimension for this entry. */
  readonly evaluatorCount: number;
}

/** Per-category aggregate for one entry. */
interface CategoryResult {
  readonly categoryId: string;
  readonly categoryName: string;
  /** Weighted combination of dimension scores within this category. */
  readonly categoryScore: number;
  readonly dimensions: readonly DimensionResult[];
}

/** Complete result for one entry. */
interface EntryResult {
  readonly entryId: EntryId;
  readonly entryTitle: string;
  /** Final aggregated score (after both aggregation stages). */
  readonly finalScore: number;
  /** Rank position (1-based). Ties share the same rank. */
  readonly rank: number;
  readonly categories: readonly CategoryResult[];
}

/** Complete scoring result. Parallel to TallyResult. */
interface ScoringResult {
  readonly scoringEventId: ScoringEventId;
  /** Entries sorted by rank (ascending — rank 1 first). */
  readonly entries: readonly EntryResult[];
  /** Total number of eligible evaluators. */
  readonly eligibleCount: number;
  /** Number of evaluators who submitted at least one scorecard. */
  readonly participatingCount: number;
  /** Participation rate (participating / eligible). */
  readonly participationRate: number;
  readonly computedAt: Timestamp;
}
```

**No winner field.** Unlike `TallyResult` which has a single `winner`, the scoring result produces a complete ranking. The consumer decides what "winning" means — top 1, top 3, everyone above a threshold. This is a deliberate difference: voting has a natural winner concept (the choice with the most votes); scoring produces a continuum.

**No quorum.** Scoring events don't have a quorum concept in the same way voting does. If 3 out of 5 judges submit scorecards, the result is computed from those 3. The `participationRate` is reported so consumers can decide if the result is legitimate, but the engine doesn't enforce a minimum. This could be added as an optional `ScoringSettings` field later if needed.

**Result computation.** Rankings are computed on demand, not only at close time. This follows the same pattern as voting tallies — the `scoring_results` table is a materialized cache recomputed when requested via `GET /results`. This means live results are possible when `secretScores` is false: the API returns the current ranking based on all scorecards submitted so far. When `secretScores` is true, the results endpoint returns data only after the scoring event is closed.

---

## 4. Events

Four new event types, following the existing event-sourcing pattern:

```typescript
// Added to EventType union in @votiverse/core

| "ScoringEventCreated"
| "ScorecardSubmitted"
| "ScorecardRevised"
| "ScoringEventClosed"
```

### 4.1 Event payloads

```typescript
interface ScoringEventCreatedPayload {
  readonly scoringEventId: ScoringEventId;
  readonly title: string;
  readonly description: string;
  readonly entries: readonly ScoringEntry[];
  readonly rubric: Rubric;
  /** Null = all active group members can score. */
  readonly panelMemberIds: readonly ParticipantId[] | null;
  readonly timeline: ScoringTimeline;
  readonly settings: ScoringSettings;
}

interface ScorecardSubmittedPayload {
  readonly scorecardId: ScorecardId;
  readonly scoringEventId: ScoringEventId;
  readonly evaluatorId: ParticipantId;
  readonly entryId: EntryId;
  readonly scores: readonly DimensionScore[];
}

interface ScorecardRevisedPayload {
  readonly scorecardId: ScorecardId;
  readonly scoringEventId: ScoringEventId;
  readonly evaluatorId: ParticipantId;
  readonly entryId: EntryId;
  /** The complete new set of scores (replaces the previous scorecard). */
  readonly scores: readonly DimensionScore[];
}

interface ScoringEventClosedPayload {
  readonly scoringEventId: ScoringEventId;
}
```

### 4.2 Event lifecycle

```
ScoringEventCreated
  │
  ├── ScorecardSubmitted  (one per evaluator per entry)
  ├── ScorecardSubmitted
  ├── ScorecardRevised    (only if allowRevision=true, before close)
  ├── ScorecardSubmitted
  │   ...
  │
  └── ScoringEventClosed
```

**ScorecardRevised vs. re-submitting.** A revision replaces the previous scorecard entirely. The event log preserves both the original and the revision (immutable events), but ranking computation uses only the latest scorecard per evaluator per entry. This is the same pattern as `VoteCast` with `allowVoteChange` — the engine processes events in sequence and the latest submission wins.

**Why a separate `ScorecardRevised` event?** Rather than reusing `ScorecardSubmitted`, a distinct event type makes the audit trail explicit. You can see at a glance whether an evaluator changed their mind.

**ScorecardId semantics.** The `ScorecardId` is generated once when the first scorecard is submitted for an (evaluator, entry) pair. Subsequent revisions reference the same `ScorecardId`, creating a chain of events for the same logical scorecard. The materialized `scorecards` table (Section 9.1) uses the composite key `(scoringEventId, evaluatorId, entryId)` for upsert; the `ScorecardId` serves as a stable handle for the API and event references.

**No retraction.** Unlike voting (`VoteRetracted`), there is no `ScorecardRetracted` event. Once an evaluator submits a scorecard, it cannot be withdrawn — only revised (if `allowRevision` is true). Retraction would create an asymmetry where some entries have fewer scores than others, distorting the ranking. If an evaluator submitted scores by mistake, a revision to corrected scores is the appropriate remedy.

---

## 5. Validation Rules

The scoring service enforces these rules:

| Rule | Enforcement | Error |
|---|---|---|
| Scoring must be enabled in group config | `config.features.scoring === true` | `ValidationError` |
| Scorecards only accepted during open window | `opensAt ≤ now < closesAt` | `InvalidStateError` |
| One scorecard per evaluator per entry | Deduplication by (evaluatorId, entryId) | `DuplicateError` |
| All dimensions must be scored | `scores.length === rubric.totalDimensions` | `ValidationError` |
| Scores within scale bounds | `scale.min ≤ score ≤ scale.max` | `ValidationError` |
| Scores respect step size | `(score - min) % step === 0` | `ValidationError` |
| Revision only if allowed | `settings.allowRevision === true` | `InvalidStateError` |
| Revision only before close | `now < closesAt` | `InvalidStateError` |
| Evaluator must be eligible | If `panelMemberIds` set: `evaluatorId ∈ panelMemberIds`. Otherwise: active group member. | `AuthorizationError` |
| Normalization requires sufficient data | `normalizeScores` needs ≥ 3 scored entries per evaluator | Falls back to raw scores |
| Entry must exist in event | `entryId ∈ entries` | `NotFoundError` |
| Only admins can create scoring events | Same admin-check pattern as voting events | `AuthorizationError` |
| Only admins can close scoring events | Creator or group admin | `AuthorizationError` |
| Entries are immutable after creation | No add/remove entries post-creation | `InvalidStateError` |

---

## 6. Aggregation Pipeline

The ranking computation is a two-stage aggregation pipeline with an optional normalization pre-processing step, transforming raw scorecards into a ranked list of entries.

```
raw_scores[evaluator][entry][dimension]
  → (optional) normalize across evaluators
  → stage 1: aggregate across evaluators per (entry, dimension)
  → stage 2: aggregate across dimensions per entry, respecting dimension/category weights
  → rank entries by final score
```

### 6.0 Pre-processing: Score normalization (optional)

When `settings.normalizeScores` is true, each evaluator's scores are z-score standardized before aggregation. This corrects for "generous" vs. "strict" scoring tendencies.

**Procedure per evaluator:**
1. Collect all scores the evaluator submitted across all entries and dimensions
2. Compute the evaluator's mean (μ) and standard deviation (σ) across all their scores
3. For each score: `z = (score - μ) / σ`
4. Rescale to the dimension's own scale (since different dimensions may have different ranges):
   `rescaled = z × (dim.max - dim.min) / 4 + (dim.max + dim.min) / 2`, clamped to `[dim.min, dim.max]`

   The `/4` factor is a heuristic: it assumes ~95% of z-scores fall within [-2, 2], mapping that range onto the dimension's full scale. This is an approximation, not exact — clamping handles the tails.

**Guard:** Requires the evaluator to have submitted scores for at least 3 entries. Evaluators with fewer entries are included with raw (un-normalized) scores, since their statistics are unreliable.

**When to use normalization:** Large panels with mixed experience levels, or any context where evaluators demonstrate visibly different scale usage. Small panels of experienced judges who calibrate together typically don't need it.

### 6.1 Stage 1: Evaluator aggregation (per entry, per dimension)

**Input:** All (optionally normalized) scores for entry E, dimension D.
**Output:** A single consensus score for (E, D).

All evaluators have equal weight (v1). Per-evaluator weighting is a future extension (see Section 13).

```
For a given (entry, dimension), with evaluators j₁, j₂, j₃:

mean:         sum(scores) / count(scores)
median:       middle value (or average of two middle values)
trimmed-mean: drop the highest and lowest score values, then mean
              of remaining (requires ≥ 3 evaluators; falls back to mean otherwise)
```

### 6.2 Stage 2: Dimension aggregation (per entry, across dimensions)

**Input:** Consensus scores for all dimensions of entry E, plus category and dimension weights.
**Output:** A single final score for E.

```
For weighted-sum:
  category_score_c = Σ(w_dim × consensus_dim) / Σ(w_dim)    for dims in category c
  final_score      = Σ(w_cat × category_score_c) / Σ(w_cat)  for all categories c

For geometric-mean:
  category_score_c = ∏(consensus_dim ^ w_dim) ^ (1/Σ(w_dim))  for dims in category c
  final_score      = ∏(category_score_c ^ w_cat) ^ (1/Σ(w_cat))
```

Weights are normalized within their scope (dimension weights within category, category weights across categories) so that the absolute values don't matter — only ratios.

### 6.3 Ranking

Entries are sorted by `finalScore` descending. Ties share the same rank. The next rank after a tie skips (standard competition ranking: 1, 2, 2, 4).

---

## 7. Package Structure

### 7.1 New package: `@votiverse/scoring`

```
packages/scoring/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts            ← public API (re-exports)
│   ├── types.ts            ← Rubric, Scorecard, ScoringEvent, ScoringResult, etc.
│   ├── scoring-service.ts  ← create, submit scorecard, revise, close, compute ranking
│   └── aggregation.ts      ← evaluator aggregation, dimension aggregation, ranking
└── tests/
    └── unit/
        ├── scoring-service.test.ts
        └── aggregation.test.ts
```

### 7.2 Dependencies

```
scoring → [config, core]
```

No dependency on `voting`, `delegation`, `survey`, or `identity`. The package only needs:
- `core` — branded IDs, `BaseEvent`, `EventStore`, `TimeProvider`, error classes
- `config` — `GovernanceConfig` (to check the `features.scoring` toggle)

### 7.3 Updated dependency graph

```
awareness → [delegation, voting, prediction, survey, scoring, config, core, content]
scoring → [config, core]
survey  → [identity, config, core]
voting  → [delegation, config, core]
```

Scoring and survey are peer packages at the same level in the dependency graph. Neither depends on the other.

### 7.4 Awareness integration

The awareness package gains read-only access to scoring data:

- **Scoring history:** which scoring events a participant has scored in
- **Scoring completeness:** how many entries a participant has left to score in open events
- **Participation patterns:** scoring consistency, participation rate across scoring events

This follows the existing pattern: awareness queries scoring state but never modifies it.

---

## 8. Governance Config Change

One addition to `FeatureConfig`:

```typescript
interface FeatureConfig {
  readonly communityNotes: boolean;
  readonly predictions: boolean;
  readonly surveys: boolean;
  readonly scoring: boolean;   // ← new
}
```

This is the only change to the governance config surface. All scoring-specific settings (rubric, aggregation method, revision policy, score secrecy) are per-scoring-event, not per-group. This keeps the governance parameter count at 14 (from 13) with no new sections.

**Preset updates:** Most presets set `scoring: false`. The `REPRESENTATIVE` preset sets it to `true` — boards and committees are the most natural context for structured scoring (contractor bids, project proposals). Other groups can enable it by customizing their config.

---

## 9. VCP and Backend Changes

### 9.1 VCP

**New database tables:**

The canonical data for scorecards lives in the `events` table as `ScorecardSubmitted` and `ScorecardRevised` events, following the same event-sourcing pattern as votes. The `scorecards` and `scoring_results` tables below are **materialized views** — derived state kept in sync for efficient querying, same pattern as the existing `issue_tallies` table for voting. The `scorecards` table is upserted on each `ScorecardSubmitted`/`ScorecardRevised` event; the `scoring_results` table is recomputed on demand.

```sql
CREATE TABLE scoring_events (
  id                TEXT PRIMARY KEY,
  assembly_id       TEXT NOT NULL REFERENCES assemblies(id),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  entries           TEXT NOT NULL,   -- JSON: ScoringEntry[]
  rubric            TEXT NOT NULL,   -- JSON: Rubric
  panel_member_ids  TEXT,            -- JSON: ParticipantId[] | null (null = all members)
  opens_at          TEXT NOT NULL,
  closes_at         TEXT NOT NULL,
  settings          TEXT NOT NULL,   -- JSON: ScoringSettings
  created_at        TEXT NOT NULL
);

-- Materialized current state: upserted on each ScorecardSubmitted/Revised event.
-- The UNIQUE constraint reflects "latest scorecard wins" — revisions overwrite.
CREATE TABLE scorecards (
  id                TEXT PRIMARY KEY,
  assembly_id       TEXT NOT NULL,
  scoring_event_id  TEXT NOT NULL REFERENCES scoring_events(id),
  evaluator_id      TEXT NOT NULL,
  entry_id          TEXT NOT NULL,
  scores            TEXT NOT NULL,  -- JSON: DimensionScore[]
  submitted_at      TEXT NOT NULL,
  UNIQUE(scoring_event_id, evaluator_id, entry_id)
);

-- Materialized ranking: recomputed on demand from current scorecards.
CREATE TABLE scoring_results (
  assembly_id       TEXT NOT NULL,
  scoring_event_id  TEXT NOT NULL REFERENCES scoring_events(id),
  entries           TEXT NOT NULL,  -- JSON: EntryResult[]
  eligible_count    INTEGER NOT NULL,
  participating_count INTEGER NOT NULL,
  participation_rate REAL NOT NULL,
  computed_at       TEXT NOT NULL,
  PRIMARY KEY (assembly_id, scoring_event_id)
);
```

**New API routes:**

```
POST   /assemblies/:id/scoring                      — create scoring event
GET    /assemblies/:id/scoring                      — list scoring events
GET    /assemblies/:id/scoring/:eid                 — get scoring event detail
POST   /assemblies/:id/scoring/:eid/scorecards      — submit scorecard
PUT    /assemblies/:id/scoring/:eid/scorecards/:sid — revise scorecard
GET    /assemblies/:id/scoring/:eid/scorecards      — list scorecards (respects secretScores)
GET    /assemblies/:id/scoring/:eid/results         — get ranking results
POST   /assemblies/:id/scoring/:eid/close           — close scoring event
```

### 9.2 Backend

The backend proxies scoring routes to the VCP with identity injection, same as voting routes. No scoring-specific backend logic — content about entries (if any) follows the same VCP/backend boundary as proposals and candidacies.

### 9.3 Web UI

**Naming:** The UI uses "Scores" as the user-facing term. This follows the same pattern as Groups (not Assemblies) and Votes (not VotingEvents) — the simplest word that communicates the concept to any user. The tab reads: **Votes · Surveys · Scores · Delegates**. The creation button reads **"New Scoring"**.

**Creation flow ("New Scoring"):**

1. **Basics** — title, description, timeline (opens/closes)
2. **Entries** — what's being scored (add/name entries)
3. **Who scores** — toggle: "All members" (default) or "Selected panel" (shows member picker)
4. **Rubric** — categories → dimensions → scale → labels → weights
5. **Settings** — three toggles: Secret Scores, Allow Revision, Normalize Scores (advanced)

The rubric builder is the core UI component. Scale presets (1-5, 1-10, 1-100) simplify the most common choice. Category/dimension weights default to equal, adjustable via proportional sliders. Aggregation methods (evaluator aggregation, dimension aggregation) default to mean + weighted-sum and are not exposed in v1 — added later if needed.

**Pages/components:**

- **Scores tab** — lists open/closed scoring events
- **Scoring event detail page** — shows rubric, entries, and scoring interface
- **Scorecard form** — rubric-driven form: categories as sections, dimensions as sliders/inputs
- **Results page** — ranking table with expandable dimensional breakdown per entry
- **Scoring progress** — which entries you've scored, which are remaining

---

## 10. Relationship to Existing Concepts

### 10.1 Scoring vs. voting

| Aspect | Voting | Scoring |
|---|---|---|
| Input | Single choice (or ranked list) | Multi-dimensional score vector |
| Delegation | Configurable (the core mechanism) | Never (personal judgment) |
| Result | Winner (single choice) | Ranking (ordered list with scores) |
| Aggregation | Counting (weighted votes) | Statistical (mean/median across evaluators, then weighted combination across dimensions) |
| Issue/entry | Has declared choices | Scored against rubric dimensions |
| Quorum | Enforced (required for valid result) | Not enforced (participation rate reported) |

### 10.2 Scoring vs. surveys

| Aspect | Surveys | Scoring |
|---|---|---|
| Purpose | Sense community sentiment | Score entries for ranking |
| Delegation | Never | Never |
| Anonymity | Anonymous (hashed participant) | Identified (evaluator ID preserved) |
| Structure | Questions with varied types | Rubric with numeric dimensions |
| Output | Aggregate statistics per question | Ranked entries with dimensional breakdown |
| Binding | Non-binding (sensing mechanism) | Produces an actionable ranking |
| Scope | Topic-scoped | Entry-scoped (entries within a scoring event) |

### 10.3 Scoring vs. endorsements

Endorsements (endorse/dispute on proposals and candidacies) are binary signals — thumbs up or thumbs down. Scoring is multi-dimensional and granular. An endorsement says "I support this"; a scorecard says "here's how this rates on 8 specific criteria."

---

## 11. Open Questions for Implementation

These don't need answers now but will arise during implementation:

### 11.1 Live vs. sealed results

When `secretScores: false`, should live aggregate results be visible while scoring is still open? This is analogous to `ballot.liveResults` for voting.

**Leaning toward:** Yes, as a natural extension. When scores are not secret, showing live aggregates is useful (e.g., a transparent grant review where applicants can see interim standings). Add `liveResults: boolean` to `ScoringSettings` if this distinction matters.

### 11.2 Comments alongside scores

Should evaluators be able to attach free-text comments to individual dimension scores or to the overall scorecard? Useful for grant review panels and hiring committees.

**Leaning toward:** Not in v1. Keep the scorecard purely numeric for clean aggregation. Comments are a backend/content concern — the backend can store evaluator notes keyed by (scoringEventId, evaluatorId, entryId) without any engine changes.

### 11.3 Out of scope

The following are explicitly outside the engine's domain:

- **Conflict of interest** — the engine doesn't know the relationship between evaluators and entries. Excluding a judge from scoring their own entry is a consumer/backend concern when constructing the scoring event.
- **Multi-round progression** — preliminary rounds narrowing the field to finals are modeled as separate, independent scoring events. The consumer decides which entries advance. The engine doesn't need progression logic.

---

## 12. v1 Scope

The engine supports the full aggregation pipeline (all methods, normalization, weighted dimensions). The v1 implementation defers certain features that add complexity without clear immediate demand:

| Feature | v1 | Future |
|---|---|---|
| Evaluator eligibility | All members or selected panel | — |
| Per-evaluator weighting | Equal weight for all evaluators | Optional `weight` field on panel members. Requires weighted-mean/median in stage 1. |
| Evaluator aggregation method | Mean (hardcoded default) | UI toggle: mean / median / trimmed-mean |
| Dimension aggregation method | Weighted-sum (hardcoded default) | UI toggle: weighted-sum / geometric-mean |
| Category/dimension weights | Supported from v1 (rubric builder) | — |
| Score normalization | Supported from v1 (settings toggle) | — |
| Scale presets | 1-5, 1-10, 1-100 | Custom min/max/step |
| Labels on scale points | Supported from v1 | — |

The deferred features require no data model changes — the `Rubric` type already includes `evaluatorAggregation` and `dimensionAggregation` fields. v1 simply defaults them. When the UI exposes these options later, existing scoring events continue to work.

---

## 13. Decisions Log

| Decision | Rationale |
|---|---|
| Package named `scoring`, not `evaluation` | "Evaluation" already means endorse/dispute in the codebase (`NoteEvaluation`, `CommunityNoteEvaluated`). "Scoring" describes the core action, avoids collision, and creates a natural family with `voting` and `survey`. |
| Standalone package, not an extension of voting | Scoring has fundamentally different invariants: non-delegable, multi-dimensional, statistical aggregation. Forcing it into voting would dilute both concepts. |
| No new structural concepts (panel = group, entry = opaque ID, evaluator = participant) | Reuse existing infrastructure. The only new primitive is the scorecard. |
| Non-delegable, always | Judgment is personal. This is a harder constraint than surveys — delegation would be epistemically meaningless. |
| Rubric defined per scoring event, not per group | Different scoring events need different rubrics. The governance config gets only a feature toggle. |
| Two-stage aggregation (across evaluators, then across dimensions) | Separates two independent design decisions: how to resolve evaluator disagreement vs. how to combine incommensurable dimensions. |
| Weighted-sum and geometric-mean as dimension aggregation methods | Covers the most common real-world approaches. Geometric-mean adds the useful property of penalizing imbalance. Outranking methods deferred. |
| Complete scorecards required (all dimensions scored) | Matches competition judging practice. Partial scoring can be added later as an opt-in setting. |
| No quorum enforcement | Scoring panels are typically small, purposefully selected groups. Report participation rate instead; let consumers decide legitimacy. |
| Per-event settings for revision, secrecy, and normalization | More flexible than assembly-level config. Different scoring events in the same group may need different policies. |
| Evaluator weighting deferred to post-v1 | Equal weight covers 90%+ of use cases. Per-evaluator weighting adds UX complexity (weight column in panel picker, harder-to-interpret results) without clear immediate demand. The data model can accommodate it later as a backwards-compatible optional field. |
| Aggregation method UI deferred to post-v1 | Mean + weighted-sum are the right defaults for most use cases. The engine supports all methods from day one; the UI exposes them when there's demand. |
| Open-to-all-members by default | Most groups want all members to score. A fixed evaluator list forces manual selection and excludes members who join after creation. Open-by-default with optional panel restriction covers both cases simply. |
| Score normalization as opt-in setting | Corrects for generous/strict scoring tendencies. Opt-in because it modifies submitted scores, which can surprise participants. Requires sufficient data (≥ 3 entries per evaluator) to be meaningful. |
| Entries are opaque | The engine captures scoring mechanics, not domain semantics. What entries represent is external. |
| Conflict of interest is a consumer concern | The engine doesn't model relationships between evaluators and entries. Recusals are enforced by excluding evaluator-entry pairs when constructing the event. |
| Multi-round progression is a consumer concern | Rounds are separate scoring events. Which entries advance is a consumer decision, not engine logic. |
| No scorecard retraction | Retraction would create asymmetric evaluator counts across entries, distorting rankings. Revision is the remedy for mistakes. |
| Status derived from timeline, not stored | Avoids stale state. Computed from `opensAt`/`closesAt` + `TimeProvider`, same pattern as voting windows. |
| Results computed on demand | Follows voting tally pattern. Enables live results when scores are not secret. Materialized table is a cache, not source of truth. |
| Entries immutable after creation | Prevents ranking instability from late entries having fewer scores. Same rule as voting events. |
| Admin-only creation and close | Parallels voting event authorization. Uses existing `isAdminOf()` pattern. |
| Entry description is optional | Keeps entries lightweight. Rich content is a backend concern, following the VCP/backend boundary. |
| UI label: "Scores" tab, "New Scoring" button | Simplest words that communicate the concept to any user. Same pattern as Groups/Votes/Surveys — user-facing terms don't need to match internal package names. "New Scoring" describes the activity being created, not the result. |
