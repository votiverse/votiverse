# @votiverse/delegation

Delegation graph management, resolution, weight computation, and concentration metrics. This is the algorithmic heart of the governance engine.

## What it provides

- **Delegation CRUD** — create, revoke, and query delegations via `DelegationService`.
- **Graph construction** — build the active delegation graph for a given issue from the event log.
- **Scope resolution** — determine which delegation has precedence based on topic specificity and recency.
- **Weight computation** — apply the override rule, resolve transitive weights, handle cycles per Appendix C.
- **Chain resolution** — "who is the terminal voter for participant X on issue Y?"
- **Concentration metrics** — Gini coefficient, maximum individual weight, chain-length distribution.

## Key algorithms

- **Override rule**: A direct vote removes the voter's outgoing delegation edge before weight computation.
- **Cycle detection**: Participants in delegation cycles who don't vote directly have effective weight 0.
- **Scope precedence**: More specific topic scope wins; equal specificity → most recent wins.
- **Weight computation**: Bottom-up tree traversal on the pruned delegation forest.

## Dependencies

- `@votiverse/core`
- `@votiverse/config`
- `@votiverse/identity`
