# @votiverse/identity

Identity abstraction layer. Defines the interface for participant identity without mandating a specific provider.

## What it provides

- **IdentityProvider interface** — `authenticate()`, `verifyUniqueness()`, `getParticipant()`, `listParticipants()`.
- **InvitationProvider** — built-in provider for small groups where identity is established by personal knowledge.
- **SybilCheck interface** — a hook for certifying participant uniqueness.
- **Typed errors** — `IdentityError` with structured error kinds.

## Usage

```typescript
import { InvitationProvider } from "@votiverse/identity";
import { InMemoryEventStore, isOk } from "@votiverse/core";

const store = new InMemoryEventStore();
const identity = new InvitationProvider(store);

// Invite participants
const result = await identity.invite("Alice");
if (isOk(result)) {
  console.log(result.value.id); // ParticipantId
}

// Authenticate
const auth = await identity.authenticate({ name: "Alice" });

// Verify uniqueness
const unique = await identity.verifyUniqueness(participantId);
```

## Dependencies

- `@votiverse/core`
