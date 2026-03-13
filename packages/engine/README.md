# @votiverse/engine

Orchestration layer that wires all Votiverse packages into a coherent runtime. This is the main entry point for consumers.

## What it provides

- **VotiverseEngine** — domain-organized API surface: `config`, `identity`, `topics_api`, `events`, `delegation`, `voting`.
- **Engine factory** — `createEngine(options)` to instantiate the engine with a config and optional event store / identity provider.
- **Re-exports** — key types from all sub-packages for consumer convenience.

## API

```typescript
import { createEngine, getPreset, InMemoryEventStore } from "@votiverse/engine";

const engine = createEngine({
  config: getPreset("LIQUID_STANDARD"),
  eventStore: new InMemoryEventStore(),
});

// Config
engine.config.validate(config);
engine.config.getPreset("TOWN_HALL");

// Identity
const participants = await engine.identity.listParticipants();

// Topics
const topic = await engine.topics_api.create("Finance");

// Voting Events
const event = await engine.events.create({ title, description, issues, eligibleParticipantIds, timeline });

// Delegations
await engine.delegation.create({ sourceId, targetId, topicScope });
const chain = await engine.delegation.resolve(participantId, issueId);
const weights = await engine.delegation.weights(issueId);

// Voting
await engine.voting.cast(participantId, issueId, "for");
const tally = await engine.voting.tally(issueId);
```

## Dependencies

- `@votiverse/core`
- `@votiverse/config`
- `@votiverse/identity`
- `@votiverse/delegation`
- `@votiverse/voting`
