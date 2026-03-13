# @votiverse/prediction

Prediction lifecycle management: creation, commitment hashing, outcome recording, accuracy evaluation, and track records.

## Lifecycle

```
Commit (immutable) → Record outcomes (append-only) → Evaluate (recomputable)
```

## Prediction patterns

- **absolute-change**: "X will change by N" (e.g., +200 participants)
- **percentage-change**: "X will change by N%" (e.g., -15%)
- **threshold**: "X will reach T" (e.g., above 80%)
- **binary**: "X will/won't happen"
- **range**: "X will be between min and max"
- **comparative**: "X will be greater/less than Y"

## Evaluation model

Accuracy is a continuous 0-1 score, not binary met/not-met. Status classifications:
- `met` (accuracy >= 0.8)
- `partially-met` (accuracy >= 0.5)
- `not-met` (accuracy < 0.5)
- `pending` (timeframe not elapsed)
- `insufficient` (no outcomes recorded)

## Poll-to-prediction integration

`evaluateFromTrend(predictionId, trendScore, pollId)` creates outcome records from poll trend data, bridging sensing and accountability.

## Dependencies

- `@votiverse/core`
- `@votiverse/config`
