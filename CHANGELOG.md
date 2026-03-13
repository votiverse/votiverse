# Changelog

All notable changes to the Votiverse project.

## Phase 6: Production Hardening — March 2026

### Added
- Root ESLint configuration with typescript-eslint rules
- Root Prettier configuration (100 char width, double quotes)
- Architecture doc: Decisions Log (Section 8.1) with 12 key decisions and rationale
- CHANGELOG.md

### Changed
- Architecture doc Section 5: updated all package specifications to match implementation
- Architecture doc Section 7: updated API design to match actual engine API with divergences noted
- Architecture doc Section 8: separated resolved vs remaining open questions, added 5 new questions discovered during implementation
- README.md: added Quick Start section, package listing, updated status and document links
- Formatted all source and test files across 12 packages with Prettier
- Fixed 15 ESLint errors (inline import() annotations, unused imports)

## Phase 5: Integrity — March 2026

### Added
- `@votiverse/integrity` package (18 tests)
  - `hashArtifact()`: SHA-256 of canonicalized artifact data
  - `commitArtifact()` / `verifyArtifact()`: end-to-end commitment flow
  - `BlockchainAnchor` interface (abstract, pluggable)
  - `NoOpAnchor` and `InMemoryAnchor` implementations
  - `OracleProvider` interface for external data with attestation
  - 5 artifact types: vote-tally, prediction-commitment, poll-results, delegation-snapshot, event-batch

## Phase 4: Simulation — March 2026

### Added
- `@votiverse/simulate` package (22 tests)
  - Two-phase architecture: deterministic script generation + real engine playback
  - Mulberry32 seeded PRNG for reproducibility
  - Agent profiles: 4 engagement patterns, 4 trust heuristics, 3 forecasting abilities
  - 3 adversarial strategies: vote-harvester, vague-predictor, coordinated-capture
  - JSON-serializable simulation scripts
  - Ground truth model with configurable per-topic trajectories
  - Concentration and prediction accuracy metrics extraction

## Phase 3: Awareness — March 2026

### Added
- `@votiverse/awareness` package (11 tests)
  - Concentration monitoring with threshold-based alerts
  - Delegation chain resolution
  - Delegate profiles (delegation stats + prediction accuracy + participation rate)
  - Engagement prompts (close-vote, concentration-alert, delegate-behavior-anomaly)
  - Personal voting history compilation
  - Historical context (related decisions by topic, poll trends)
  - `IssueContext` pattern for engine decoupling

## Phase 2: Accountability — March 2026

### Added
- `@votiverse/prediction` package (44 tests)
  - 6 prediction patterns as discriminated union
  - SHA-256 commitment hashing with deterministic canonicalization
  - Continuous 0-1 accuracy evaluation
  - Trajectory analysis (improving/stable/worsening/volatile)
  - `evaluateFromTrend()` poll-to-prediction bridge
  - Track records per participant
- `@votiverse/polling` package (17 tests)
  - 5 question types (likert, numeric, direction, yes-no, multiple-choice)
  - Non-delegable response collection with participant hashing
  - Per-topic normalized [-1,+1] trend computation
  - Linear regression slope for trend direction
- Engine integration: `engine.prediction.*` and `engine.polls.*` APIs
- `OutcomeId` and `QuestionId` branded types in core

### Changed
- Removed `@votiverse/identity` dependency from polling (identity verification at engine boundary)

## Phase 1: Foundation — March 2026

### Added
- `@votiverse/core` package (64 tests)
  - 12 branded ID types, base entity types
  - 12 domain event types, `BaseEvent` interface, `DomainEvent` union
  - `EventStore` interface and `InMemoryEventStore`
  - `Result<T, E>` type with helpers
  - Error hierarchy: VotiverseError, NotFoundError, ValidationError, InvalidStateError, GovernanceRuleViolation
- `@votiverse/config` package (50 tests)
  - `GovernanceConfig` type with delegation, ballot, features, thresholds sections
  - 6 frozen presets: Town Hall, Swiss Model, Liquid Standard, Liquid Accountable, Board Proxy, Civic Participatory
  - `validateConfig()`, `deriveConfig()`, `diffConfig()`
- `@votiverse/identity` package (18 tests)
  - `IdentityProvider` and `SybilCheck` interfaces
  - `InvitationProvider` with `rehydrate()`
- `@votiverse/delegation` package (33 tests)
  - Delegation CRUD with event sourcing
  - Graph construction, scope resolution, weight computation
  - Override rule, cycle detection, concentration metrics
- `@votiverse/voting` package (28 tests)
  - 4 ballot methods: SimpleMajority, Supermajority, RankedChoice, ApprovalVoting
  - Quorum checking, delegation-weighted tallying
- `@votiverse/engine` package (9 tests)
  - Domain-organized API surface
  - `createEngine()` factory, `rehydrate()`, `injectIssue()`
- `@votiverse/cli` package (5 tests)
  - CLI commands for init, config, participant, event, delegate, vote, events log
  - JSON-file state persistence
- Monorepo infrastructure: pnpm workspaces, tsconfig.base.json, tsup builds, vitest
