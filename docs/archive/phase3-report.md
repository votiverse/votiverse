# Phase 3: Awareness — Status Report

**Completed:** March 2026

## Summary

Phase 3 implements the governance awareness layer — a read-only monitoring and alerting system that queries state from all other packages and delivers contextual findings to participants.

## Package Implemented

### `@votiverse/awareness` (11 tests)

**Architecture:**

The awareness layer is strictly read-only. It instantiates `PredictionService` and `PollingService` internally for querying, but never writes events. It receives `IssueContext` objects from the engine layer rather than accessing engine state directly.

**What it surfaces:**

1. **Concentration monitoring.** Computes weight distribution for an issue and generates `ConcentrationAlert` objects when any delegate's weight fraction exceeds the configured `concentrationAlertThreshold`. Reports include the Gini coefficient and max weight for distribution analysis.

2. **Chain resolution.** Wraps the delegation package's `resolveChain()` with context-aware setup — delegates, voters, and graph construction from a single `IssueContext`.

3. **Delegate profiles.** Aggregates multiple signals into a `DelegateProfile`:
   - Current delegator count and active topics
   - Prediction track record (accuracy, count, by-status breakdown)
   - Voting participation rate (votes cast / eligible issues)

4. **Engagement prompts.** Conditionally generated notifications:
   - `concentration-alert`: terminal voter exceeds weight threshold
   - `delegate-behavior-anomaly`: delegation chain doesn't reach a voter
   - `close-vote`: margin between top two choices < 10% of total weight
   - Direct voters receive no prompts (they've already engaged)

5. **Personal voting history.** Compiles retrospective entries per issue:
   - Whether the participant voted directly or delegated
   - Immediate delegate and terminal voter IDs
   - Effective choice (what was voted on their behalf)
   - Summary stats: total direct vs. delegated

6. **Historical context.** For a given issue, finds:
   - Related past decisions (overlapping topics)
   - Poll trend data for the issue's topics (score, direction, data points)

**Design decisions:**

- **IssueContext pattern.** Rather than giving the awareness service direct access to the engine's internal maps, the engine constructs `IssueContext` objects containing everything the awareness service needs (issueId, title, topicIds, eligible participants, topic ancestors). This keeps the awareness layer decoupled from engine internals and makes it testable without the full engine stack.

- **Progressive disclosure via type system.** The `DetailLevel` type ("summary" | "full") is defined but not yet consumed by query methods. The current implementation returns full detail; summary views are deferred to when the UI/CLI layer needs them. The type exists to prevent API-breaking changes later.

- **Prompt severity levels.** Prompts are classified as "info" (gentle nudges) or "warning" (actionable flags). This maps to the whitepaper's principle that engagement prompts should not be nagging — they fire only on specific conditions.

## What I'd change in existing code

1. **Proposal entity.** The whitepaper treats proposals as first-class objects that carry predictions. The current data model jumps from issues to predictions without an explicit proposal entity. This means the awareness layer can't fully implement "prediction summaries per issue" without a proposal-to-issue link. I flagged this with `// DECISION NEEDED` and return empty arrays for now. Adding a `Proposal` entity to core and linking it to both issues and predictions would unblock this.

2. **Event payload typing.** The pattern of casting between `Record<string, unknown>` and typed structures (used in prediction and polling) works but is brittle. If the prediction package's `PredictionClaim` shape ever changes, the event store contains old-format events that won't match the new type. An event versioning strategy (even just a `version` field on each event) would make this safer.

3. **Awareness service event access pattern.** The awareness service queries the event store repeatedly for the same data (e.g., `buildActiveDelegations` is called multiple times across different methods for the same issue). This is correct but wasteful. A future optimization would cache intermediate results within a single awareness query session.

## Test count (cumulative)

| Package | Tests |
|---------|-------|
| core | 64 |
| config | 50 |
| identity | 18 |
| delegation | 33 |
| voting | 28 |
| prediction | 44 |
| polling | 17 |
| awareness | 11 |
| engine | 9 |
| cli | 5 |
| **Total** | **279** |
