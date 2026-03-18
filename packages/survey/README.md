# @votiverse/survey

Participant surveys — the non-delegable sensing mechanism. Surveys capture observations, not decisions. Responses are non-transferable.

## Question types

- **likert**: Scale 1-5 or 1-7 with endpoint labels
- **numeric**: Value within a configurable range with unit
- **direction**: "improved" / "same" / "worsened"
- **yes-no**: Boolean response
- **multiple-choice**: Select from options

## Trend computation

Trends are computed per topic across multiple surveys. Each question's aggregate result is normalized to a [-1, +1] sentiment scale, enabling comparison across different question types and phrasings.

## Non-delegability

Survey responses are structurally non-delegable. The `SubmitResponseParams` accepts a `ParticipantId` (verified by the engine layer) — there is no API path for delegation. Participant IDs are hashed for deduplication without attribution.

## Dependencies

- `@votiverse/core`
- `@votiverse/config`
