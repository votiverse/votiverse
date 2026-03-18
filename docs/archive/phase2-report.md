# Phase 2: Accountability — Status Report

**Completed:** March 2026

## Summary

Phase 2 implements the prediction tracking and participant polling packages, then wires them into the engine. This closes the accountability loop described in the whitepaper: proposals carry predictions, outcomes are recorded, accuracy is evaluated, and poll trends provide a second channel of ground-truth evidence.

## Packages Implemented

### `@votiverse/prediction` (44 tests)

**Lifecycle:** Commit → Record outcomes → Evaluate

**Data model decisions:**

- **PredictionClaim** uses a discriminated union on `pattern.type` with 6 variants (absolute-change, percentage-change, threshold, binary, range, comparative). Each variant carries exactly the fields needed for its evaluation — no optional field ambiguity.

- **Accuracy is continuous (0-1)**, not binary. Status classifications are derived from the score: `met` (≥0.8), `partially-met` (≥0.5), `not-met` (<0.5), `pending` (timeframe not elapsed), `insufficient` (no outcomes).

- **Multiple outcomes are supported.** The most recent outcome within/after the prediction timeframe is used for accuracy. All outcomes are used for trajectory analysis (improving/stable/worsening/volatile).

- **Commitment hash** is SHA-256 of deterministic JSON (sorted keys). `verifyCommitment(claim, hash)` enables tamper detection.

- **Outcome sources** are typed: `official`, `poll-derived`, `community`, `automated`. All sources currently carry equal weight in evaluation. The data model supports future credibility weighting.

**TODO documented in code:** Outcome source credibility weighting. An official government statistic should carry more weight than a single community submission. The evaluation code contains a detailed comment referencing whitepaper Section 13.4–13.5 on AI ensemble verification and oracle trustworthiness. The `OutcomeSource` type is designed to enable per-source weighting when implemented.

### `@votiverse/polling` (17 tests)

**Design decisions:**

- **5 question types:** likert (5/7 scale), numeric (range with unit), direction (improved/same/worsened), yes-no, multiple-choice. Each maps to a numeric representation for trend computation.

- **Non-delegability is structural.** `SubmitResponseParams` accepts a `ParticipantId` — there is no delegation reference in the API. Participant IDs are SHA-256 hashed for deduplication without attribution.

- **Trend computation is per-topic, not per-question.** Questions tagged with a topic are normalized to [-1, +1] sentiment, averaged per poll, and plotted as a time series. This handles the fact that questions change across polls while topics remain stable. Linear regression slope classifies direction.

- **Identity dependency removed** (accepted pushback from design proposal). The polling package depends on `core` + `config` only. Identity verification happens at the engine boundary.

- **Poll metadata serialization workaround.** The core `PollCreatedPayload.questions` field is `string[]`. The polling package encodes metadata (`closesAt`, `title`, `createdBy`) as a JSON object in the first element of that array, marked with `__meta: true`. This is pragmatic — the alternative was modifying the core event payload, which would break the principle that core stays stable while packages interpret.

### `@votiverse/prediction` ↔ `@votiverse/polling` integration

**`evaluateFromTrend(predictionId, trendScore, pollId, notes?)`** is the explicit bridge between sensing and accountability. It:

1. Takes a normalized trend score (-1 to +1) from polling data
2. Maps it to a measured value appropriate for the prediction's pattern type
3. Creates an `OutcomeRecord` with source type `poll-derived`

The mapping is pattern-specific:
- Absolute/percentage change: `baseline + expected * trendScore`
- Threshold: linear interpolation between baseline and target
- Range: centered on range midpoint, scaled by half-range
- Binary: positive trend → 1, negative → 0
- Comparative: trend score passed through directly (low accuracy expected)

### Engine integration

The engine now exposes `engine.prediction` and `engine.polls` API namespaces, following the same domain-organized pattern as delegation and voting.

## Test count

| Package | Tests |
|---------|-------|
| core | 64 |
| config | 50 |
| identity | 18 |
| delegation | 33 |
| voting | 28 |
| prediction | 44 |
| polling | 17 |
| engine | 9 |
| cli | 5 |
| **Total** | **268** |

## Open questions for future phases

1. **Proposal-to-issue link.** Predictions are attached to proposals, but the current data model doesn't explicitly link proposals to issues. This matters for the awareness layer when it tries to surface prediction summaries in voting history. Flagged with `// DECISION NEEDED` in awareness-service.ts.

2. **Core event payload limitations.** Both prediction and polling packages work around the generic `Record<string, unknown>` payloads in core by casting between their typed structures and the generic form. This works but loses type safety at the event store boundary. A future improvement could introduce an event store that's generic over a schema registry.

3. **Poll question neutrality.** The whitepaper specifies that poll questions must be neutrally framed. The current implementation has no automated bias detection. This is flagged in the architecture doc as an open technical question.
