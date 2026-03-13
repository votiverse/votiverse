# @votiverse/simulate

Rule-based simulation framework for stress-testing governance configurations.

## Two-phase architecture

1. **Generation**: Given a scenario definition and a random seed, produces a complete deterministic action script (JSON-serializable).
2. **Playback**: Feeds the script into a real VotiverseEngine instance, event by event, extracting metrics after each voting event.

## Agent profiles

Agents have configurable behavioral profiles:
- **Engagement**: active-deliberator, selective-engager, pure-delegator, pure-sensor
- **Trust heuristic**: highest-track-record, most-active, random, topic-expert
- **Forecasting ability**: good, average, poor (correlates to prediction accuracy)
- **Adversarial strategy**: vote-harvester, vague-predictor, coordinated-capture

## Usage

```typescript
import { runSimulation } from "@votiverse/simulate";

const result = await runSimulation({
  name: "Concentration test",
  seed: 42,
  config: "LIQUID_STANDARD",
  topics: [{ name: "Finance" }],
  population: { count: 50, ... },
  votingEvents: [{ title: "Budget", issues: [...] }],
  groundTruth: { topics: { Finance: { baseValue: 100, trajectory: "improving", changeRate: 5 } } },
});

console.log(result.results.concentrationOverTime);
console.log(result.results.predictionAccuracies);
```

## Dependencies

- `@votiverse/engine` (and transitively all governance packages)
