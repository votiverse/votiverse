# @votiverse/core

Shared foundation for all Votiverse packages. This is the leaf package in the dependency graph — it has zero external dependencies.

## What it provides

- **Branded ID types** — `ParticipantId`, `IssueId`, `TopicId`, `VotingEventId`, `EventId`, `DelegationId`, `PredictionId`, `PollId`, `ProposalId`, `CommitmentId`. Compile-time safety prevents accidentally mixing ID types.
- **Base entity types** — `Participant`, `Topic`, `Issue`, `VotingEvent`, `EventTimeline`, `VoteChoice`.
- **Event definitions** — `BaseEvent` interface, all domain event types (`VoteCast`, `DelegationCreated`, `DelegationRevoked`, etc.), and the `DomainEvent` discriminated union.
- **EventStore interface** — Abstract interface for event persistence, plus an `InMemoryEventStore` implementation for testing and simulation.
- **Result type** — `Result<T, E>` discriminated union with `ok()`, `err()`, `isOk()`, `isErr()`, `unwrap()`, `unwrapErr()` helpers.
- **Error base classes** — `VotiverseError`, `NotFoundError`, `ValidationError`, `InvalidStateError`, `GovernanceRuleViolation`.
- **Utilities** — ID generation (`generateEventId()`, etc.), timestamp helpers (`now()`, `timestamp()`, `timestampFromDate()`, `dateFromTimestamp()`).

## Usage

```typescript
import {
  InMemoryEventStore,
  createEvent,
  generateEventId,
  generateParticipantId,
  now,
  ok,
  err,
  isOk,
} from "@votiverse/core";
import type {
  ParticipantRegisteredEvent,
  Result,
  ParticipantId,
} from "@votiverse/core";

// Create an event store
const store = new InMemoryEventStore();

// Create and append an event
const event = createEvent<ParticipantRegisteredEvent>(
  "ParticipantRegistered",
  { participantId: generateParticipantId(), name: "Alice" },
  generateEventId(),
  now(),
);
await store.append(event);

// Query events
const votes = await store.query({ types: ["VoteCast"] });

// Use Result type for error handling
function findParticipant(id: ParticipantId): Result<string, string> {
  if (id === "known") return ok("Alice");
  return err("not found");
}
```

## Dependencies

None. This is the leaf package.
