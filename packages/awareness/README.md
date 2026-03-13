# @votiverse/awareness

Governance awareness layer — read-only monitoring, alerting, and contextual information delivery.

## What it surfaces

- **Concentration monitoring** — alerts when a delegate's weight exceeds the configured threshold
- **Chain resolution** — full delegation chain from participant to terminal voter
- **Delegate profiles** — delegation stats, prediction track record, voting participation rate
- **Engagement prompts** — contextual nudges for close votes, concentration alerts, unresolved chains
- **Personal voting history** — retrospective record of direct votes and delegated outcomes
- **Historical context** — related past decisions and poll trends for an issue's topics

## Design principles

- **Read-only**: never modifies engine state
- **Contextual delivery**: information at the point of decision
- **Progressive disclosure**: summary by default, detail on demand
- **Personal relevance**: notifications about *your* delegation chain

## Dependencies

- `@votiverse/core`, `@votiverse/config`
- `@votiverse/delegation`, `@votiverse/voting`
- `@votiverse/prediction`, `@votiverse/polling`
