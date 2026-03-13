# @votiverse/voting

Vote casting, tallying, and ballot method implementations.

## What it provides

- **VotingService** — cast votes (records VoteCast events), retrieve votes, compute tallies with delegation weights.
- **BallotMethod interface** — `tally(votes, issueId, eligibleCount, quorum)`.
- **SimpleMajority** — most weighted votes wins; tie = no winner.
- **Supermajority** — requires a configurable threshold percentage (e.g., 67%).
- **RankedChoice** — instant runoff with elimination rounds.
- **ApprovalVoting** — voters approve multiple choices; most approved wins.
- **Quorum checking** — verifies participation meets the configured threshold.
- **Override rule integration** — direct votes automatically override delegations during tally.

## Usage

```typescript
import { VotingService } from "@votiverse/voting";
import { InMemoryEventStore } from "@votiverse/core";
import { getPreset } from "@votiverse/config";

const store = new InMemoryEventStore();
const voting = new VotingService(store, getPreset("LIQUID_STANDARD"));

// Cast votes
await voting.cast({ participantId, issueId, choice: "for" });

// Compute tally (integrates with delegation weights)
const result = await voting.tally(issueId, issueTopics, eligibleParticipants);
```

## Dependencies

- `@votiverse/core`
- `@votiverse/config`
- `@votiverse/delegation`
