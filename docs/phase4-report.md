# Phase 4: Simulation — Status Report

**Completed:** March 2026

## Summary

Phase 4 implements the rule-based simulation framework for stress-testing governance configurations. The framework uses a two-phase architecture: deterministic script generation followed by playback through the real engine.

## Package Implemented

### `@votiverse/simulate` (22 tests)

**Two-phase architecture:**

1. **Generation phase** — Pure computation with no engine dependency. Given a scenario definition and a random seed (Mulberry32 PRNG), produces a complete, deterministic action script. Same seed always produces the same script.

2. **Playback phase** — Feeds the generated script into a real `VotiverseEngine` instance, action by action. The engine processes them exactly as it would real user actions. No mocking — simulation bugs are engine bugs.

**Design decisions:**

### Agent profiles
Profiles are plain data objects (fully JSON-serializable):
- **Engagement**: active-deliberator (always votes), selective-engager (votes on topics of interest), pure-delegator (never votes), pure-sensor (only polls)
- **Trust heuristic**: highest-track-record, most-active, topic-expert, random
- **Forecasting ability**: good (80% correct), average (55%), poor (35%) — correlates with both vote direction and prediction accuracy noise
- **Poll reliability**: 0-1, controls noise added to ground truth observations
- **Adversarial**: optional strategy flag

### Population specification
Rather than requiring explicit profiles for each agent, the scenario specifies distributions (e.g., 30% active-deliberator, 40% average forecasters, 10% adversarial). The generator samples from these distributions using the seeded PRNG.

### Ground truth model
Each topic has a `baseValue`, a `trajectory` (improving/stable/worsening), and a `changeRate`. The ground truth at event N is computed as: `baseValue + direction * changeRate * (N+1)`. This is what polls sense (with noise) and predictions try to forecast (with ability-correlated accuracy).

### Adversarial strategies implemented
1. **Vote harvester**: Accumulates delegations by being an active deliberator, then re-delegates to a co-conspirator to concentrate weight.
2. **Vague predictor**: Generates binary predictions on vague variables ("overall situation") with far-future deadlines — structurally unfalsifiable.
3. **Coordinated capture**: (Defined in types but not yet fully exercised in generation — the framework supports it for future scenarios.)

### Simulation results
After playback, the framework extracts:
- **Concentration snapshots**: Gini coefficient and max weight per event
- **Prediction accuracy**: Per-agent accuracy with forecasting ability labels

### Tested scenarios
- **Determinism**: Same seed produces identical scripts and results
- **Concentration emergence**: Delegation-heavy populations produce higher max weight than direct-voter-heavy populations
- **Prediction signal**: Good forecasters produce predictions; the framework enables testing whether they achieve higher accuracy
- **Adversarial robustness**: Vote-harvester scenarios complete without errors

### JSON serialization
Scripts are fully JSON-serializable: `JSON.stringify(script)` → save to file → `JSON.parse(json)` → replay later. This enables scenario libraries, regression testing, and sharing simulation fixtures.

## What I'd change in existing code

1. **Delegation service limitation**: The `DelegationService.create()` checks `maxDelegatesPerParticipant` against all active delegations from a source, but doesn't distinguish delegations by scope. In simulation with global delegations, a participant trying to delegate to multiple people on different topics may be blocked. This doesn't break anything for Phase 4 but will matter for more complex scenarios.

2. **Poll integration gap**: The playback phase skips `poll-respond` actions because the polling service requires a real poll to exist first, and polls aren't automatically created as part of voting events. The framework tests sensing via `evaluateFromTrend()` instead. A future improvement would have the playback create polls alongside voting events and route responses through them.

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
| awareness | 11 |
| engine | 9 |
| cli | 5 |
| simulate | 22 |
| **Total** | **301** |
