# Changelog

All notable changes to the Votiverse project.

## Time-Based Lifecycle Management — March 2026

### Added
- `TimeProvider` interface in `@votiverse/core` — injectable time source for all time-dependent operations
- `TestClock` class — controllable clock with `advance(ms)`, `set(ms)`, `reset()` for testing
- `systemTime` default provider — uses `Date.now()` for production
- Timeline enforcement in engine's `voting.cast()` — rejects votes outside `votingStart`–`votingEnd` window
- Dev test clock API in VCP (`GET/POST /dev/clock/*`) — Stripe-style time control for lifecycle testing
- Double-gated safety: dev routes not mounted in production + middleware guard as fallback
- Smart datetime display in web UI — shows time component when not midnight

### Changed
- `VotiverseEngine` accepts optional `timeProvider` in `EngineOptions`
- VCP `AssemblyManager` exposes `timeProvider` field, passed to engine instances
- VCP event status and tally routes use `manager.timeProvider.now()` instead of `Date.now()`
- All VCP and engine tests updated to use `TestClock` with proper timeline windows

## Client Backend (Phases 1–6) — March 2026

### Added
- `platform/backend/` service — Hono HTTP server on port 4000 with SQLite persistence
- User authentication with Argon2 password hashing + JWT access tokens + refresh token rotation
- VCP HTTP client for governance API communication
- Membership service mapping users to participants across assemblies
- VCP proxy with identity injection (resolves authenticated user to participant per assembly)
- Seed script creating 59 users from VCP participant data
- Login form in web client replacing static identity picker

### Changed
- Web client migrated from direct VCP connection to backend proxy (port 4000)
- Removed `identity-store.ts`, `VITE_API_KEY`, and client-side `X-Participant-Id` injection

## Deployment Hardening (Phases A–D) — March 2026

### Added
- Web client env var support (`VITE_API_BASE_URL`)
- VCP production config validation (fail-fast when `VCP_CORS_ORIGINS` not set)
- Structured logger with JSON output in production
- `POST /outcomes` now requires operational scope
- Async `DatabaseAdapter` interface (all methods return Promises)
- PostgreSQL adapter with connection pooling and `AsyncLocalStorage`
- JWT authentication for VCP participant identity
- Request ID middleware (`X-Request-Id`)
- Rate limiting (per-client token bucket)
- Request body size limits
- Paginated list endpoints (limit/offset on 6 endpoints)
- Expanded health check (per-component status)
- Metrics endpoint (`GET /metrics`)

### Changed
- Standardized SQL with `ON CONFLICT` syntax (cross-DB compatible)
- JSONB auto-parsing fix for PostgreSQL

### Removed
- Dead `resolveId()` pass-through (10+ callsites updated)

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
