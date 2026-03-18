# @votiverse/content

Governance metadata lifecycle for proposals, delegate candidacies, and community notes.

This package manages the **VCP-side** of content entities — metadata, content hashes, lifecycle state machines, and evaluation logic. Rich content (markdown documents, binary assets) lives in the client backend. The `contentHash` provides the integrity bridge between the two.

## What this package does

- **Proposals**: submit → version → lock (when voting starts) → withdraw. Linked to issues and choices.
- **Candidacies**: declare → version → withdraw → reactivate. Linked to participants and topic scopes.
- **Community Notes**: create → evaluate (endorse/dispute) → withdraw. Linked to any notable target (proposal, candidacy, survey, or another note).
- **Content Hash**: SHA-256 canonical hash over markdown + sorted asset hashes.
- **Visibility Computation**: Note visibility based on configurable threshold and minimum evaluations.

## Dependencies

```
content → [config, core]
```

This package depends only on `@votiverse/core` (types, events, event store) and `@votiverse/config` (governance configuration). It does not depend on voting, delegation, or any other domain package.

## Design Reference

See [docs/design/content-architecture.md](../../docs/design/content-architecture.md) for the full architectural design.
