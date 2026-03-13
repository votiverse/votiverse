# @votiverse/integrity

Blockchain anchoring, commitment generation, and verification for governance integrity.

## Architecture

The package is blockchain-agnostic. Implementations plug in through the `BlockchainAnchor` interface.

## Flow

```
Artifact data → hashArtifact() → SHA-256 hash → anchor.commit() → block reference
                                                                      ↓
Verify: artifact data → hashArtifact() → compare hash + anchor.verify()
```

## Built-in anchors

- **NoOpAnchor**: No blockchain integration. Returns null references. Verification always passes.
- **InMemoryAnchor**: For testing. Stores hashes in memory with sequential block references.

Custom anchors implement the `BlockchainAnchor` interface for Ethereum, Solana, etc.

## Dependencies

- `@votiverse/core`
- `@votiverse/config`
