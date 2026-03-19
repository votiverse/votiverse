# Votiverse Architecture

**Technical Architecture Document — v0.1 Draft**

---

## 1. Overview

Votiverse is implemented as a **headless governance engine** — a set of composable libraries that encode the governance model described in the [whitepaper](papers/paper-i-whitepaper.md). The engine has no opinion about presentation. It exposes a programmatic API that any client — web application, CLI tool, mobile app, or third-party integration — can drive.

The codebase is organized as a **TypeScript monorepo** managed with **pnpm workspaces**. Each major subsystem is a separate package published under the `@votiverse` npm scope. Packages have explicit dependencies on each other, forming a directed acyclic graph with clear layering.

---

## 2. Design Principles

**Headless first.** The governance engine is pure logic. It accepts inputs (configurations, votes, delegations, predictions, survey responses) and produces outputs (tallies, delegation graphs, weight distributions, alerts, trend data). It does not render, route, or manage sessions. Any UI is a consumer of the engine, not a part of it.

**Correctness over performance.** For a governance system, a wrong answer delivered quickly is worse than a correct answer delivered slowly. The engine prioritizes algorithmic correctness, formal property preservation (sovereignty, one-person-one-vote, monotonicity), and comprehensive testing. Performance optimization comes later, guided by profiling real deployments.

**Explicit boundaries.** Each package owns a single domain. Cross-domain communication happens through well-defined interfaces (TypeScript types and function signatures), never through shared mutable state. A package can be understood, tested, and replaced without understanding the rest of the system.

**Configuration as data.** Governance configurations — the "presets" and custom parameter combinations described in the whitepaper — are plain data objects conforming to a schema. The engine interprets configurations; it does not hard-code governance rules.

**Event-sourced core.** The governance engine records all state changes as an append-only sequence of events (vote cast, delegation created, delegation revoked, prediction committed, survey response submitted, outcome recorded). Current state is derived by replaying events. This provides a complete audit trail, supports temporal queries ("what was the delegation graph at the time of vote X?"), and aligns naturally with the blockchain integrity layer.

---

## 3. Repository Structure

```
votiverse/
├── docs/
│   ├── architecture.md          ← this document
│   ├── integration-architecture.md ← 3-tier system architecture, VCP/backend boundary
│   ├── papers/                  ← governance papers (Paper I whitepaper, Paper II extensions)
│   ├── design/                  ← approved design documents
│   ├── research/                ← background research
│   └── archive/                 ← historical phase reports and audits
├── packages/
│   ├── config/                  ← governance configuration schemas and validation
│   ├── core/                    ← shared types, event definitions, utilities
│   ├── content/                 ← proposal/candidacy/note metadata, lifecycle, evaluation
│   ├── delegation/              ← delegation graph, resolution, weight computation
│   ├── voting/                  ← vote tallying, ballot methods, quorum checks
│   ├── prediction/              ← prediction lifecycle, outcome recording, accuracy
│   ├── polling/                 ← participant surveys/surveys, trend computation
│   ├── awareness/               ← governance awareness layer, alerts, signals
│   ├── identity/                ← identity abstraction, provider interface
│   ├── integrity/               ← blockchain commitments, verification
│   ├── simulate/                ← AI-driven simulation framework
│   ├── engine/                  ← orchestration layer, wires everything together
│   └── cli/                     ← command-line interface for engine operations
├── platform/
│   ├── vcp/                     ← VCP HTTP API (governance metadata, events, computation)
│   ├── backend/                 ← client backend (auth, content storage, VCP proxy)
│   └── web/                     ← React web UI
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json                 ← root scripts, dev dependencies
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Each directory under `packages/` is an independent npm package with its own `package.json`, `tsconfig.json`, `README.md`, and test suite.

---

## 4. Package Dependency Graph

Dependencies flow strictly downward. No circular dependencies are permitted.

```
                          ┌─────────┐
                          │   cli   │
                          └────┬────┘
                               │
                          ┌────▼────┐
                          │ engine  │
                          └────┬────┘
                               │
       ┌──────────┬────────┬───┼───────┬──────────┬──────────┐
       │          │        │   │       │          │          │
  ┌────▼───┐ ┌───▼───┐ ┌──▼─┐│┌▼────┐ ┌▼────────┐ ┌▼─────────┐
  │awareness│ │voting │ │cont│││polls│ │prediction│ │integrity │
  └────┬────┘ └───┬───┘ │ent ││└──┬──┘ └────┬────┘ └─────┬────┘
       │          │      └──┬─┘│   │         │            │
       └───┬──────┴─────────┼──┘   │         │            │
           │                │      │         │            │
      ┌────▼────┐           │      │         │            │
      │delegation│           │      │         │            │
      └────┬────┘           │      │         │            │
           │                │      │         │            │
      ┌────▼────┐      ┌───▼──────▼─────────▼────────────▼─┐
      │identity │      │              config                │
      └────┬────┘      └─────────────────┬──────────────────┘
           │                             │
           └──────────┬──────────────────┘
                      │
                 ┌────▼────┐
                 │  core   │
                 └─────────┘
```

Text form:
```
cli → engine → [awareness, voting, content, polling, prediction, integrity]
                awareness → [delegation, voting, prediction, polling, config, core, content]
                content → [config, core]
                voting → [delegation, config, core]
                polling → [identity, config, core]
                prediction → [config, core]
                delegation → [identity, config, core]
                integrity → [config, core]
                identity → [core]
                config → [core]
                simulate → [engine]
                core → (nothing)
```

---

## 5. Package Specifications

### 5.1 `@votiverse/core`

**Purpose:** Shared foundation. Types, event definitions, and utilities used by all other packages.

**Owns:**
- Branded ID types: `ParticipantId`, `TopicId`, `IssueId`, `VotingEventId`, `EventId`, `DelegationId`, `PredictionId`, `PollId`, `ProposalId`, `CommitmentId`, `OutcomeId`, `QuestionId`. Compile-time safety prevents accidentally mixing ID types.
- Base entity types: `Participant`, `Issue`, `Topic`, `VotingEvent`, `EventTimeline`, `VoteChoice`.
- Event type definitions: 12 domain event types as a discriminated union (`DomainEvent`), each extending `BaseEvent<TType, TPayload>`.
- Event store interface: `EventStore` with `append()`, `getById()`, `query()`, `getAll()`. `InMemoryEventStore` implementation included for testing and simulation.
- `Result<T, E>` type with `ok()`, `err()`, `isOk()`, `isErr()`, `unwrap()` helpers.
- Error hierarchy: `VotiverseError` base class, `NotFoundError`, `ValidationError`, `InvalidStateError`, `GovernanceRuleViolation`.
- Utilities: ID generators (`generateEventId()`, etc.), timestamp helpers (`now()`, `timestamp()`, `timestampFromDate()`).
- `TimeProvider` interface and `systemTime` default — injectable time source for all time-dependent operations. `TestClock` class enables controlled time in tests (advance, set, reset).

**Dependencies:** None (leaf package).

**Key design decision:** The event store interface is defined here along with an `InMemoryEventStore` implementation. The interface is generic over `DomainEvent` — packages cast from the generic `Record<string, unknown>` payload to their typed structures. This keeps core stable while allowing packages to evolve their payload schemas independently. Database-backed implementations (SQLite, PostgreSQL) are future work.

---

### 5.2 `@votiverse/config`

**Purpose:** Governance configuration schemas, validation, and named presets.

**Owns:**
- `GovernanceConfig` type: the complete configuration schema covering delegation primitives, ballot parameters, feature toggles, and thresholds.
- Validation functions: `validateConfig(config)` — checks for internal consistency (e.g., "if delegation is disabled, transitivity must also be disabled").
- Named presets: `PRESETS.TOWN_HALL`, `PRESETS.SWISS_MODEL`, `PRESETS.LIQUID_STANDARD`, `PRESETS.LIQUID_ACCOUNTABLE`, `PRESETS.BOARD_PROXY`, `PRESETS.CIVIC_PARTICIPATORY`.
- Configuration diffing: `diffConfig(a, b)` — shows what a customized config changed from its base preset.
- Compatibility warnings: flags for untested or potentially problematic parameter combinations.

**Dependencies:** `@votiverse/core`.

**Key design decision:** Presets are frozen objects. Customization produces a new config derived from a preset, never mutates the preset itself. The diff function makes customizations explicit and auditable.

---

### 5.3 `@votiverse/identity`

**Purpose:** Identity abstraction layer. Defines the interface for participant identity without mandating a specific provider.

**Owns:**
- `IdentityProvider` interface: `authenticate()`, `verifyUniqueness()`, `getParticipant()`, `listParticipants()`.
- `SybilCheck` interface: a hook for certifying participant uniqueness.
- Built-in provider: `InvitationProvider` for small groups (Stage 1). Records `ParticipantRegistered` events. Supports `rehydrate()` for rebuilding state from a persisted event store.
- Structured `IdentityError` type with error kinds (`authentication_failed`, `not_found`, `duplicate_participant`, `invalid_invitation`, `provider_error`).

**Dependencies:** `@votiverse/core`.

**Key design decision:** The identity layer is deliberately thin. `OAuthProvider` is not yet implemented — only the interface and `InvitationProvider` exist. The `rehydrate()` pattern (replaying events to rebuild in-memory state) was added during CLI implementation and is a general pattern needed by any service that maintains in-memory maps alongside the event store.

---

### 5.4 `@votiverse/delegation`

**Purpose:** Delegation graph management, resolution, and weight computation. This is the algorithmic heart of the governance engine.

**Owns:**
- Delegation CRUD: create, revoke, and query delegations.
- Graph construction: for a given issue, build the active delegation graph from the event log.
- Scope resolution: given an issue's topics and a participant's delegations, determine which delegation has precedence.
- Weight computation: apply the override rule (direct votes sever chains), resolve transitive weights, detect and handle cycles.
- Concentration metrics: Gini coefficient of voting weights, maximum individual weight, chain-length distribution.
- Graph queries: "who is the terminal voter for participant X on issue Y?", "what is the full chain?", "how many participants delegate through node Z?"

**Dependencies:** `@votiverse/core`, `@votiverse/config`, `@votiverse/identity`.

**Key design decision:** The delegation graph is computed fresh for each issue from the event log, not maintained as mutable state. This ensures that temporal queries ("what was the graph at time T?") are trivially supported, and that the override rule is always applied correctly against the current state of direct votes.

**Algorithmic notes:** Weight computation is a tree traversal on the pruned delegation forest. Cycle detection uses Tarjan's algorithm or equivalent. For the expected deployment sizes (Stages 1–3), these operations are fast on a single thread. If performance becomes critical at larger scale, the graph computation can be parallelized or moved to a compiled module (Rust via NAPI) behind the same interface.

---

### 5.5 `@votiverse/voting`

**Purpose:** Vote casting, tallying, and ballot method implementation.

**Owns:**
- Vote casting: record a direct vote, applying the override rule to active delegations.
- Ballot methods: `SimpleMajority`, `Supermajority(threshold)`, `RankedChoice`, `ApprovalVoting`. Each method implements a common `BallotMethod` interface with a `tally(votes, weights)` function.
- Quorum checking: verify that participation meets the configured threshold before finalizing results.
- Result computation: given votes, delegation-derived weights, and the configured ballot method, produce a result.
- Secret ballot support: when configured, votes are recorded in a way that allows tallying without revealing individual choices. (The cryptographic details of verifiable secret ballots are an open design problem — see Section 8.)

**Dependencies:** `@votiverse/core`, `@votiverse/config`, `@votiverse/delegation`.

**Key design decision:** The voting package does not decide what ballot method to use. It receives the method from the governance configuration and applies it. Adding a new ballot method means implementing the `BallotMethod` interface — no changes to the voting package's orchestration logic.

---

### 5.6 `@votiverse/prediction`

**Purpose:** Prediction lifecycle management, outcome recording, and accuracy computation.

**Owns:**
- `PredictionClaim` with 6 pattern types as a discriminated union: `absolute-change`, `percentage-change`, `threshold`, `binary`, `range`, `comparative`. Each variant carries exactly the fields needed for its evaluation.
- SHA-256 commitment hashing via deterministic JSON canonicalization (`computeCommitmentHash()`, `verifyCommitment()`).
- Outcome recording with typed sources: `official`, `survey-derived`, `community`, `automated`. Multiple outcomes per prediction support temporal tracking.
- Continuous accuracy evaluation (0.0–1.0 score), not binary. Status classifications: `met` (>=0.8), `partially-met` (>=0.5), `not-met`, `pending`, `insufficient`.
- Trajectory analysis across outcome data points: `improving`, `stable`, `worsening`, `volatile`.
- `evaluateFromTrend()`: explicit bridge between polling trends and prediction outcomes. Maps normalized [-1,+1] trend scores to pattern-appropriate measured values.
- Track records: per-participant accuracy aggregates.

**Dependencies:** `@votiverse/core`, `@votiverse/config`.

**Key design decision:** Accuracy is continuous, not binary — addressing the "outcome measurement ambiguity" open question from the original spec. Outcome sources are typed to support future credibility weighting (currently all sources carry equal weight — see Decisions Log). The `evaluateFromTrend()` function is the structural link between the sensing layer (surveys) and the accountability layer (predictions).

---

### 5.7 `@votiverse/survey`

**Purpose:** Participant surveys — the non-delegable sensing mechanism.

**Owns:**
- 5 question types as a discriminated union: `likert` (5/7 scale), `numeric` (range + unit), `direction` (improved/same/worsened), `yes-no`, `multiple-choice`.
- Survey creation with scheduling, topic scoping, and question tagging.
- Response collection: SHA-256 hashed participant IDs for deduplication without attribution. Duplicate responses rejected.
- Aggregation: mean, median, standard deviation, frequency distributions.
- Trend computation: per-topic normalized [-1,+1] sentiment scoring across surveys. Linear regression slope classifies direction (`improving`, `stable`, `worsening`, `insufficient`).

**Dependencies:** `@votiverse/core`, `@votiverse/config`.

**Key design decision:** The identity dependency was removed (changed from the original spec). The polling package accepts `ParticipantId` values that have already been verified by the engine layer, and hashes them internally for deduplication. This keeps polling's dependency footprint minimal and follows the same pattern as other domain packages. Non-delegability is structural — there is no delegation reference in `SubmitResponseParams`. Trend computation is per-topic rather than per-question, handling the fact that question phrasing changes across surveys while topic tags remain stable.

---

### 5.8 `@votiverse/awareness`

**Purpose:** The governance awareness layer — monitoring, alerting, and contextual information delivery.

**Owns:**
- `ConcentrationReport`: weight distribution analysis with threshold-based alerts (Gini coefficient, max weight).
- Chain resolution: full delegation chain from participant to terminal voter.
- `DelegateProfile`: aggregates delegation stats, prediction accuracy, and voting participation rate.
- `EngagementPrompt` generation: triggered by `close-vote`, `concentration-alert`, `delegate-behavior-anomaly`, or `chain-changed` conditions.
- `VotingHistory`: retrospective record per issue — direct vs. delegated, delegate chain, effective choice.
- `HistoricalContext`: related past decisions by topic overlap, plus survey trend data.
- `DetailLevel` type (`summary` | `full`) for progressive disclosure (defined but not yet consumed).

**Dependencies:** `@votiverse/core`, `@votiverse/config`, `@votiverse/delegation`, `@votiverse/voting`, `@votiverse/prediction`, `@votiverse/survey`.

**Key design decision:** The awareness layer is read-only and uses the `IssueContext` pattern — rather than accessing engine internals directly, it receives plain data objects containing everything it needs (issueId, title, topicIds, eligible participants, topic ancestors). This makes it testable without the full engine stack and prevents tight coupling to engine internals. The layer instantiates its own `PredictionService` and `PollingService` for querying, but never writes events.

---

### 5.9 `@votiverse/integrity`

**Purpose:** Blockchain anchoring and verification for platform meta-accountability.

**Owns:**
- `hashArtifact()`: SHA-256 of deterministically canonicalized artifact data.
- `commitArtifact()`: hash + anchor to blockchain + record `IntegrityCommitment` event.
- `verifyArtifact()`: recompute hash + compare + verify blockchain anchor. Returns structured `VerificationResult` with hash validity, anchor validity, and human-readable message.
- `BlockchainAnchor` interface: `commit(hash) → blockReference`, `verify(hash, blockReference) → boolean`.
- Built-in anchors: `NoOpAnchor` (no blockchain, null references), `InMemoryAnchor` (for testing).
- `OracleProvider` interface: for external data with cryptographic attestation (defined, not yet implemented).
- 5 artifact types: `vote-tally`, `prediction-commitment`, `survey-results`, `delegation-snapshot`, `event-batch`.

**Dependencies:** `@votiverse/core`, `@votiverse/config`.

**Key design decision:** No Ethereum-specific implementation yet — only the abstract interface and two anchors (no-op and in-memory). The Ethereum smart contract anchor is deferred until a real deployment needs it. The `canonicalize()` function is duplicated between prediction and integrity packages; extracting it to core is a known refactoring target.

---

### 5.10 `@votiverse/engine`

**Purpose:** Orchestration layer. Wires all packages together into a coherent runtime.

**Owns:**
- `VotiverseEngine` class with domain-organized API: `config`, `identity`, `topics_api`, `events`, `delegation`, `voting`, `prediction`, `surveys`.
- `createEngine(options)` factory accepting `GovernanceConfig`, optional `EventStore`, optional `IdentityProvider`.
- `rehydrate()` for rebuilding in-memory state (topics, voting events) from a persisted event store.
- `injectIssue()` for restoring issue data during rehydration (issues are stored separately from events since issue details aren't captured in `VotingEventCreated` payloads).
- Re-exports key types from all sub-packages for consumer convenience.

**Dependencies:** `@votiverse/core`, `@votiverse/config`, `@votiverse/identity`, `@votiverse/delegation`, `@votiverse/voting`, `@votiverse/prediction`, `@votiverse/survey`.

**Key design decision:** The engine maintains in-memory maps for topics, voting events, and issues alongside the event store. These maps must be rebuilt via `rehydrate()` when loading a persisted event store. The awareness and integrity packages are not wired into the engine API yet — awareness queries require `IssueContext` objects that the engine could construct, and integrity could be exposed as `engine.integrity`. This is deferred to avoid expanding the engine's dependency footprint until consumers need it.

---

### 5.11 `@votiverse/simulate`

**Purpose:** Rule-based simulation framework for stress-testing governance configurations.

**Owns:**
- Two-phase architecture: deterministic script generation (Mulberry32 seeded PRNG) → playback through the real engine.
- `SimulationScenario` definition: config, topics, population spec, voting events, ground truth model.
- `AgentProfile` with 4 engagement patterns, 4 trust heuristics, 3 forecasting abilities.
- 3 adversarial strategies: `vote-harvester`, `vague-predictor`, `coordinated-capture`.
- `SimulationScript`: JSON-serializable action sequence (register, create-topic, create-event, delegate, vote, predict, record-outcome).
- `SimulationResults`: concentration snapshots over time, prediction accuracy per agent.
- Ground truth model: per-topic base values with configurable trajectories and change rates.

**Dependencies:** `@votiverse/engine` (and transitively all governance packages).

**Key design decision:** Simulation is two-phase, not reactive. The entire action sequence is pre-generated from agent profiles and the seeded PRNG, then played back through the real engine. This gives reproducibility (same seed = same results), inspectability (scripts can be examined or hand-edited before playback), and correctness (simulation bugs are engine bugs, since playback uses the real engine API).

---

### 5.12 `@votiverse/cli`

**Purpose:** Command-line interface for engine operations.

**Owns:**
- `votiverse init`, `status`, `config` (presets/show/validate), `participant` (add/list), `event` (create/list), `delegate` (set/list), `vote` (cast/tally/weights), `events log`.
- JSON-file-based state persistence (`.votiverse/state.json`) for cross-invocation operation.
- `TestOutput` class for programmatic CLI testing without console output.

**Dependencies:** `@votiverse/engine`, `@votiverse/core`, `@votiverse/config`, `@votiverse/identity`, `commander`.

---

### 5.11 `@votiverse/cli`

**Purpose:** Command-line interface for engine operations. Primary tool for development, testing, headless deployments, and authenticated access to remote Votiverse instances.

**Dependencies:** `@votiverse/engine` (and transitively, all other packages).

**Key design decision:** The CLI is the reference consumer of the engine API. If a governance operation cannot be performed from the CLI, the engine API is incomplete. The CLI is also the primary testing and debugging tool during development.

#### Operating Modes

The CLI operates in four modes. The same commands work in every mode — only the backing infrastructure changes.

**Mode 1: Local simulation.** No auth, no network, no persistence. The engine runs in-memory. This mode is for exploring configurations, testing governance scenarios, and running "what if" experiments. A researcher or developer can `votiverse init --preset liquid-standard`, simulate participants, cast votes, resolve delegations, and inspect results — all without signing up for anything.

```bash
votiverse init --preset swiss-model --storage memory
votiverse simulate --participants 30 --events 5
```

**Mode 2: Local persistent.** No auth, no network, but state is persisted to SQLite on disk. A small group runs Votiverse on someone's machine or a shared local server. Identity is invitation-based. This is the Stage 1 deployment mode — a club, a parent committee, a small association. The administrator adds participants, creates voting events, and results are stored locally.

```bash
votiverse init --preset town-hall --storage sqlite://./my-club.db
votiverse participant add "Alice" --email alice@example.com
```

**Mode 3: CLI as client to a remote engine.** The Votiverse engine runs as a hosted service (cloud-hosted, self-hosted, or on a shared server), and the CLI is an authenticated client that communicates over HTTPS. This is the primary mode for Stage 2+ deployments.

Authentication uses browser-based OAuth, following the same pattern as GitHub CLI, Vercel CLI, and similar tools:

```bash
votiverse login --server https://my-org.votiverse.org
# → Opens browser for OAuth flow
# → On success, stores token locally at ~/.votiverse/credentials
# → Subsequent commands authenticate automatically

votiverse event list        # queries the remote engine
votiverse vote 42 yes       # casts a vote on the remote instance
votiverse awareness history # retrieves personal voting history
```

The token is stored securely in `~/.votiverse/credentials`. Multiple server connections can be stored and switched between:

```bash
votiverse login --server https://my-coop.votiverse.org --alias coop
votiverse login --server https://city.votiverse.org --alias city
votiverse use coop          # switch active context
```

**Mode 4: CLI as server.** The CLI hosts the engine locally, exposing an HTTP API that other clients — browsers, other CLI instances, mobile apps — connect to. This is the self-hosted deployment path for organizations that want to control their own infrastructure.

```bash
votiverse serve --config ./governance.json --port 3000 --storage postgres://...
# → Engine starts, API available at http://localhost:3000
# → Web frontend or other CLI clients connect to this endpoint
```

This mode sits between Mode 2 (single-user local) and Mode 3 (cloud-hosted). The organization runs the infrastructure; participants connect remotely.

#### Command Structure

Commands are organized by domain, mirroring the engine's API structure. All commands work in every mode.

**Instance management:**

```
votiverse init [--preset <name>] [--config <file>] [--storage <uri>]
votiverse login [--server <url>] [--alias <name>]
votiverse use <alias>
votiverse serve [--config <file>] [--port <n>] [--storage <uri>]
votiverse status
```

**Configuration:**

```
votiverse config presets                        # list available presets
votiverse config show [<file>]                  # display current config
votiverse config validate [<file>]              # validate a config
votiverse config diff <preset> [<file>]         # show customizations from preset
```

**Voting events:**

```
votiverse event create [--title ...] [--issues ...]
votiverse event list [--status open|closed|all]
votiverse event status <event-id>
votiverse event booklet <issue-id>              # display the digital booklet
```

**Delegations:**

```
votiverse delegate set <target> [--scope <topics>]
votiverse delegate revoke [--scope <topics>]
votiverse delegate list                         # show your active delegations
votiverse delegate chain <issue-id>             # show full chain to terminal voter
```

**Voting:**

```
votiverse vote <issue-id> <choice>
votiverse vote tally <issue-id>
votiverse vote weights <issue-id>               # show weight distribution
```

**Predictions:**

```
votiverse predict commit <proposal-id> [--file <prediction.json>]
votiverse predict evaluate <prediction-id>
votiverse predict track-record [<participant>] [--topic <scope>]
```

**Surveys:**

```
votiverse survey create [--questions <file>] [--schedule <date>]
votiverse survey respond <survey-id>                # interactive prompt for responses
votiverse survey results <survey-id>
votiverse survey trends [--topic <scope>] [--range <start>..<end>]
```

**Awareness:**

```
votiverse awareness chain [--issue <id>]        # your delegation chain
votiverse awareness concentration [--issue <id>]# weight distribution metrics
votiverse awareness history                     # personal voting history
votiverse awareness profile <delegate>          # delegate track record
votiverse awareness context <issue-id>          # historical context for an issue
votiverse awareness prompts                     # active engagement prompts
```

**Integrity:**

```
votiverse integrity commit [--scope <event-id>] # anchor artifacts to blockchain
votiverse integrity verify <commitment-id>      # verify a commitment
votiverse integrity audit <event-id>            # full integrity report for an event
```

**Developer and admin tools:**

```
votiverse events log [--tail <n>]               # inspect the event log
votiverse participant add <name> [--email ...]  # add participant (local/server mode)
votiverse participant list
votiverse export <event-id> [--format json|csv] # export event data
votiverse simulate [--participants <n>] [--events <n>] # run simulation
```

#### Output Formats

All commands support `--format` for programmatic use:

- `--format human` (default): readable terminal output with color and formatting.
- `--format json`: structured JSON for piping to other tools or scripts.
- `--format csv`: tabular data for spreadsheet import.

This enables scripting and automation. For example, a cron job that monitors delegation concentration:

```bash
votiverse awareness concentration --format json | jq '.gini_coefficient'
```

Or a script that generates a weekly governance report:

```bash
votiverse survey trends --topic education --range last-quarter --format csv > trends.csv
votiverse predict track-record --format json > delegate-records.json
```

---

## 6. Data Model

### 6.1 Event Sourcing

All state changes in the engine are recorded as immutable events. The core event types are:

| Event | Payload | Produced By |
|-------|---------|-------------|
| `VotingEventCreated` | Config, issues, timeline, eligible participants | engine |
| `DelegationCreated` | Source, target, topic scope, timestamp | delegation |
| `DelegationRevoked` | Source, scope, timestamp | delegation |
| `VoteCast` | Participant, issue, choice, timestamp | voting |
| `PredictionCommitted` | Proposal, prediction data, commitment hash, timestamp | prediction |
| `OutcomeRecorded` | Prediction ref, outcome data, source, timestamp | prediction |
| `PollCreated` | Questions, schedule, governance scope | polling |
| `PollResponseSubmitted` | Participant (hashed for privacy), survey ref, responses, timestamp | polling |
| `IntegrityCommitment` | Artifact type, artifact hash, block reference, timestamp | integrity |

Current state is derived by folding events. This means:
- The full history is always available.
- Temporal queries are natural: "replay events up to time T" gives you the state at T.
- The event log is the natural unit for blockchain anchoring.
- Testing is straightforward: construct event sequences and assert derived state.

### 6.2 Storage

The engine defines a `StorageAdapter` interface, not a specific database. Implementations can target:

- **In-memory** — for testing, simulation, and small ephemeral deployments.
- **SQLite** — for single-node CLI deployments and local development.
- **PostgreSQL** — for production hosted deployments.
- **Custom** — organizations can implement the adapter for their own storage backend.

The event log and derived state (materialized views for performance) are separate concerns. The event log is the source of truth. Materialized views are rebuilt from events and can be discarded and recomputed.

---

## 7. API Design

The engine exposes a **programmatic TypeScript API**, not an HTTP API. An HTTP API (REST, GraphQL, or other) is a consumer-layer concern — built on top of the engine API by whatever server framework the deployment uses.

The implemented API is organized by domain. Key divergences from the original illustrative design are noted.

```typescript
// Configuration
engine.config.validate(config): ValidationResult
engine.config.getPreset(name): GovernanceConfig
engine.config.getPresetNames(): PresetName[]
engine.config.derive(overrides): GovernanceConfig   // added: derive from current config
engine.config.getCurrent(): GovernanceConfig         // added: access current config

// Identity (added: not in original spec)
engine.identity.getProvider(): IdentityProvider
engine.identity.getParticipant(id): Participant | undefined
engine.identity.listParticipants(): Participant[]

// Topics (added: topic management)
engine.topics_api.create(name, parentId?): Topic
engine.topics_api.get(id): Topic | undefined
engine.topics_api.list(): Topic[]

// Voting Events
engine.events.create(params): VotingEvent
engine.events.get(id): VotingEvent | undefined
engine.events.getIssue(id): Issue | undefined        // added: issue access
engine.events.listIssues(): Issue[]                   // added: list all issues
engine.events.list(): VotingEvent[]

// Delegations
engine.delegation.create(params): Delegation
engine.delegation.revoke(params): void
engine.delegation.listActive(sourceId?): Delegation[] // added: list delegations
engine.delegation.resolve(participantId, issueId): DelegationChain
engine.delegation.weights(issueId): WeightDistribution
engine.delegation.concentration(issueId): ConcentrationMetrics  // added

// Voting — changed: cast takes individual args instead of params object
engine.voting.cast(participantId, issueId, choice): void
engine.voting.getVotes(issueId): VoteRecord[]         // added
engine.voting.tally(issueId): TallyResult

// Predictions
engine.prediction.commit(params): Prediction
engine.prediction.recordOutcome(params): OutcomeRecord
engine.prediction.evaluate(predictionId): PredictionEvaluation
engine.prediction.evaluateFromTrend(predictionId, score, pollId): OutcomeRecord  // added
engine.prediction.trackRecord(participantId): TrackRecord
engine.prediction.get(predictionId): Prediction | undefined     // added
engine.prediction.getByParticipant(participantId): Prediction[] // added

// Surveys
engine.surveys.create(params): Survey
engine.surveys.respond(params): PollResponse
engine.surveys.results(pollId, eligibleCount): PollResults  // changed: needs eligibleCount
engine.surveys.trends(topicId, eligibleCount): TrendData    // changed: topicId not scope
engine.surveys.get(pollId): Survey | undefined                // added
engine.surveys.list(): Survey[]                               // added
```

**Not yet wired into the engine:** Awareness and integrity are implemented as standalone services but not exposed through the engine API. Awareness requires `IssueContext` objects that the engine could construct; integrity could be exposed as `engine.integrity`. These are deferred to avoid expanding the engine API until consumers need them.

---

## 8. Open Technical Questions

### Resolved

**Outcome measurement ambiguity.** *Resolved in Phase 2.* The prediction package uses continuous accuracy scoring (0-1) rather than binary met/not-met. Multiple outcome data points are supported, with trajectory analysis detecting reversal patterns. The `EvaluationConfidence` level (high/medium/low) is currently based on outcome count; credibility weighting by source type is the planned next step.

**Polling dependency structure.** *Resolved in Phase 2.* The original spec listed `@votiverse/identity` as a polling dependency. This was removed — the polling package accepts pre-verified `ParticipantId` values and hashes them internally. Identity verification happens at the engine boundary.

### Remaining

**Verifiable secret ballots.** When ballot secrecy is configured, the system must tally votes without revealing individual choices, while still allowing participants to verify that their vote was counted. The delegation-override interaction adds complexity: the system must verify that a direct vote was cast without revealing the vote's content. Not yet addressed.

**Delegation graph performance at scale.** The current design computes the delegation graph fresh from the event log for each issue. Correct and simple but potentially expensive at scale. The awareness layer compounds this by querying the same graph data multiple times within a single request. Caching intermediate results within a query session would help.

**Survey question neutrality.** Enforcing neutral framing programmatically remains an open problem. The current implementation has no automated bias detection.

**Blockchain cost and latency.** The integrity package defines an `event-batch` artifact type for Merkle tree batching, but batch construction is not yet implemented. The `InMemoryAnchor` is sufficient for testing; real blockchain anchors need the batching strategy resolved first.

### Discovered During Implementation

**Proposal entity.** The whitepaper treats proposals as first-class objects that carry predictions. The current data model links predictions to `ProposalId` but does not define a `Proposal` entity. This means the awareness layer cannot fully implement "prediction summaries per issue" — there is no link from issues to proposals to predictions. Adding a `Proposal` entity to core would unblock this.

**Event payload schema evolution.** Prediction and polling packages store typed structures in the generic `Record<string, unknown>` event payloads by casting. If a package's type shape changes, the event store contains old-format events that won't match. An event versioning strategy (even a simple `version` field) would make migration safer.

**Canonicalization duplication.** Both `@votiverse/prediction` and `@votiverse/integrity` contain identical `canonicalize()` functions for deterministic JSON serialization. This should be extracted to `@votiverse/core`.

**Engine rehydration complexity.** The engine, identity provider, and CLI state all need `rehydrate()` methods to rebuild in-memory maps from persisted events. Issue data is stored separately from events because `VotingEventCreated` payloads don't include full issue details. A more principled approach would embed issue data in events or define a `rehydrate` protocol.

**Simulation survey integration.** The simulation playback phase skips `survey-respond` actions because surveys aren't automatically created alongside voting events. The framework tests sensing via `evaluateFromTrend()` instead. A future improvement would have playback create surveys during event creation.

---

## 8.1 Decisions Log

Key architectural decisions made during implementation, with rationale. This is the canonical record — phase reports contain additional context.

| # | Decision | Rationale | Phase |
|---|----------|-----------|-------|
| D1 | `InMemoryEventStore` in core, not just the interface | Testing and simulation need a concrete store. Defining it in core avoids every consumer creating their own. | 1 |
| D2 | Branded ID types (`ParticipantId`, `IssueId`, etc.) | Compile-time safety prevents accidentally passing the wrong ID type. Small runtime cost (just string + brand). | 1 |
| D3 | `Result<T, E>` for identity package, typed throws elsewhere | Identity operations are expected to fail (auth failures). Other packages use `ValidationError` / `NotFoundError` throws. Mixing patterns is pragmatic — pick what fits the domain. | 1 |
| D4 | Prediction accuracy as continuous 0-1 score | Binary met/not-met is insufficient for governance accountability. The score enables ranking and trend analysis. Thresholds for status classification (`met` >= 0.8) are separable from the score itself. | 2 |
| D5 | Prediction patterns as discriminated union | Exhaustive matching in evaluation logic. Each variant carries exactly the fields it needs — no optional field ambiguity. New patterns are addable without modifying existing evaluation code. | 2 |
| D6 | Survey trends per-topic, not per-question | Questions change across surveys; topics remain stable. Normalizing to [-1,+1] makes different question types comparable on the same trend line. | 2 |
| D7 | Remove identity dependency from polling | The polling package doesn't authenticate — it deduplicates. Accepting pre-verified `ParticipantId` values keeps the dependency graph shallow. | 2 |
| D8 | Outcome source credibility weighting deferred | The data model supports typed sources (`official`, `survey-derived`, `community`, `automated`). All currently carry equal weight. Implementing weighting requires solving the oracle trust problem (whitepaper 13.4–13.5). The infrastructure is ready; the policy is not. | 2 |
| D9 | `IssueContext` pattern for awareness decoupling | The awareness layer needs issue data but shouldn't reach into engine internals. Plain data objects passed as parameters make the service testable in isolation. | 3 |
| D10 | Two-phase simulation (generate then playback) | Reproducibility (same seed = same script), inspectability (examine/edit the script), and correctness (playback uses the real engine, so simulation bugs are engine bugs). | 4 |
| D11 | `NoOpAnchor` as default when blockchain disabled | Same engine code runs with or without blockchain integrity. No conditional logic — just a different anchor at configuration time. | 5 |
| D12 | Survey metadata in event payload workaround | Core's `PollCreatedPayload.questions` is `string[]`. The polling package encodes `closesAt`, `title`, `createdBy` as a JSON metadata object in the first array element, marked with `__meta: true`. Pragmatic workaround to avoid modifying core's event payloads. | 2 |

---

## 9. Testing Strategy

**Unit tests** for each package in isolation. The delegation package's weight computation is tested against hand-computed examples from the whitepaper (Section 5 and Appendix C). The voting package's ballot methods are tested against known election scenarios. The prediction package's accuracy evaluation is tested against the standardized patterns.

**Integration tests** across packages via the engine. Scenario-based tests that replay event sequences and verify end-to-end behavior: "given this configuration, these delegations, and these votes, the tally should be X, the awareness layer should flag Y, and the delegation graph should look like Z."

**Property-based tests** for the formal guarantees: sovereignty (a direct vote always overrides), one-person-one-vote (total weight equals number of active participants), monotonicity (casting a vote never reduces influence). These use generative testing to explore the configuration space and catch edge cases that hand-written tests miss.

**Configuration fuzzing** to discover problematic parameter combinations. Generate random governance configurations, run governance scenarios, and check invariants. This is how we discover which configurations need warnings in the experimental mode.

---

## 10. AI-Driven Simulation

### 10.1 The Simulation Laboratory

Beyond mechanical testing, Votiverse includes a **simulation framework** that populates the engine with AI-driven agents who behave like realistic participants. This gives the project something no governance platform has had before: a stress-testing laboratory that can explore behavioral dynamics at any scale, including adversarial scenarios, before real people use the system.

The simulation framework operates at two levels:

**Rule-based agents (lightweight).** Each agent follows configurable behavioral heuristics: "delegate to the agent with the highest prediction track record in my topic," "vote directly if the proposal touches my core interest area," "respond to surveys based on a ground-truth function with some noise." Rule-based agents are fast and cheap. Thousands of agents can run in seconds, enabling statistical analysis across many runs. This mode is appropriate for testing structural properties: does delegation concentration stabilize or diverge? How does the override rate change with different awareness layer thresholds? At what group size does the survey signal-to-noise ratio degrade?

**LLM-driven agents (full AI).** Each agent is backed by an LLM prompt with a detailed persona: background, expertise, biases, engagement level, trust relationships, and temperament. The agent receives the voting booklet, awareness data, delegation chain information, and past survey results — the same information a real participant would see — and produces realistic deliberative behavior. LLM agents are expensive but produce qualitatively richer scenarios. They discover failure modes that rule-based agents wouldn't exhibit: a charismatic agent who accumulates delegations through rhetorical skill despite poor prediction accuracy, a coordinated group that gradually captures a topic community, a well-intentioned expert who delegates to the wrong person due to misleading track record presentation.

### 10.2 What the Simulation Tests

**Concentration dynamics.** Seed a simulation with hundreds of agents and let delegation networks form organically based on each agent's topic interests and trust heuristics. Observe whether super-delegates emerge, whether the awareness layer's concentration alerts trigger revocations, and how different configurations (bounded vs. unbounded transitivity, different alert thresholds) affect the equilibrium.

**Prediction signal quality.** Give agents different levels of forecasting ability. Over multiple voting events, do the agents with genuinely better judgment accumulate delegations? Does the prediction tracking signal cut through narrative noise, or do charismatic-but-inaccurate agents dominate despite poor track records?

**Sensor value.** Create a population where 80% are pure sensors (respond to surveys, delegate everything) and 20% are active deliberators. Run proposals with predictions. Have sensor surveys reflect a configurable ground truth. Compare outcomes to a simulation with no polling layer. This directly tests whether the sensing layer improves decision quality.

**Adversarial scenarios.** Introduce agents who deliberately harvest delegations and re-delegate in bulk. Introduce agents who submit vague, unfalsifiable predictions. Introduce coordinated groups that try to dominate a topic community. Measure whether the awareness layer, prediction tracking, and community notes detect and resist these behaviors — and at what scale the defenses break.

**Scale transitions.** Run the same governance configuration at 20, 200, 2,000, and 20,000 agents. Identify where the model's properties hold and where they degrade. Map the results to the Stage 1–4 deployment ladder.

**Configuration exploration.** Run simulations across the governance configuration space. Which parameter combinations produce stable, healthy delegation networks? Which produce pathological concentration? Which ballot methods interact badly with delegation? This generates the empirical basis for the preset library and the experimental-mode warnings.

### 10.3 Agent Personas

LLM-driven agents are defined by persona files that specify:

- **Background:** expertise areas, knowledge level, community role.
- **Engagement pattern:** active deliberator, selective engager, pure delegator, pure sensor, or a mix.
- **Trust heuristics:** how the agent decides whom to delegate to (track record, personal relationship, topic expertise, charisma).
- **Biases:** overconfidence, anchoring, tribalism, contrarianism, apathy.
- **Adversarial flag:** whether the agent is trying to game the system, and by what strategy.

A library of reusable personas covers common participant archetypes: the engaged expert, the passive delegator, the angry activist, the strategic power-seeker, the well-meaning generalist, the single-issue voter, the NPC sensor, the community leader, the skeptic.

Custom personas can be authored for specific simulation scenarios.

### 10.4 Simulation Output

Each simulation run produces:

- Complete event log (replayable for analysis).
- Delegation graph snapshots at each voting event.
- Concentration metrics over time.
- Prediction accuracy distributions.
- Survey trend lines and comparison to ground truth.
- Awareness layer alert history.
- Narrative summary (LLM-generated): what happened, what patterns emerged, what broke.

The narrative summary is particularly valuable for LLM-driven simulations. Instead of parsing raw metrics, a researcher can read: "Over 20 voting events, Agent 'Charismatic Charlie' accumulated 18% of delegation weight on Finance topics despite a prediction accuracy of 31%. The awareness layer flagged the concentration at event 12, triggering 6 revocations. By event 15, Charlie's weight had stabilized at 9%. However, a coordinated group of 4 agents exploiting a topic-scope overlap were not detected until event 18."

### 10.5 Implementation Notes

The simulation framework is part of the `@votiverse/cli` package (the `votiverse simulate` command family) and an optional `@votiverse/simulate` package for programmatic use.

Rule-based agents are implemented as configurable state machines within the simulate package — no external dependencies.

LLM-driven agents use the Anthropic API (or other LLM providers, following the same multi-provider principle as the AI assistance layer in the whitepaper). The persona prompt, the governance context (booklet, awareness data), and the expected output format are assembled by the simulate package and sent to the LLM. The LLM's response is parsed as a governance action (vote, delegate, respond to survey, submit prediction) and fed into the engine.

Simulation runs are reproducible: a random seed and a set of persona files define the initial conditions. For LLM-driven simulations, the LLM responses are logged and can be replayed deterministically.

---

## 11. Development Phases

### Phase 1: Foundation

Build `core`, `config`, `delegation`, and `voting`. This is the minimum viable governance engine — a system that can configure a governance model, manage delegations, resolve votes with transitive delegation and override rules, and tally results using configurable ballot methods.

Deliverable: a CLI that can run a complete voting event with delegation for a small group.

### Phase 2: Accountability

Add `prediction` and `polling`. The engine can now track predictions attached to proposals, record outcomes, compute accuracy, run non-delegable surveys, and compute trend lines.

Deliverable: a CLI that can run a voting event with predictions, followed by outcome recording and accuracy evaluation. Surveys with trend visualization.

### Phase 3: Awareness

Add `awareness`. The engine can now compute delegate track records, resolve delegation chains, detect concentration patterns, generate engagement prompts, and compile personal voting histories.

Deliverable: a CLI that provides full awareness queries — "show me my voting history," "who is my terminal delegate on this issue," "what is the concentration distribution."

### Phase 4: Simulation

Add `simulate`. Rule-based agent simulations first, then LLM-driven agents. Run the simulation suite against all named presets and document the results. Use findings to refine presets, calibrate awareness layer thresholds, and generate experimental-mode warnings.

Deliverable: a simulation framework that can stress-test any governance configuration at scale, with published results for the default presets.

### Phase 5: Integrity

Add `integrity`. The engine can anchor critical artifacts to a blockchain, verify commitments, and integrate oracle-sourced outcome data.

Deliverable: a CLI that can commit governance artifacts to a test blockchain and verify them.

### Phase 6: Production Hardening

Performance optimization, storage adapter implementations (PostgreSQL), error handling, logging, monitoring, and documentation polish. This phase prepares the engine for real deployments.

---

## 12. Relationship to UI

The Votiverse engine is headless. It does not include a user interface.

The primary UI for Votiverse will be built on a standalone app with a frontend and a backend (the Client). This UI is a separate codebase that consumes the engine's TypeScript API (likely via an HTTP API layer built on top of the engine).

The open-source engine and the proprietary UI form an **open-core model**:

- **Open source (this repo):** governance engine, CLI, all core logic, documentation. It also include a reference web application with frontend and backend.
- **Proprietary (separate repo):** Client web and mobile application, deployment tools, hosted service infrastructure.

This separation ensures that the governance logic is inspectable, auditable, and forkable by anyone.

Third parties are free to build their own UI on top of the open-source engine. The CLI serves as both a reference implementation and a tool for deployments that don't need a visual interface.

---

## 13. Research Pipeline

Votiverse is not only a governance platform — it is a research instrument. The simulation framework (Section 10), the event-sourced data model (Section 6), and the prediction tracking system produce structured, reproducible data about how governance configurations behave under controlled conditions. This data has value beyond the project itself.

### 13.1 Research Outputs

The project aims to publish findings in several categories:

**Configuration analysis.** Systematic comparison of governance configurations across scales. Which combinations of delegation, ballot method, and awareness thresholds produce stable, healthy networks? Where do pathologies emerge? These findings are relevant to computational social science, mechanism design, and civic technology.

**Sensing thesis validation.** Empirical analysis of whether the polling/sensing layer improves decision quality. Simulations comparing populations with and without structured polling, measuring outcome quality against ground truth. This directly tests the project's foundational claim (whitepaper Section 3.4) that even disengaged participants improve governance through observation.

**Prediction tracking dynamics.** Does visible prediction accuracy change delegate selection behavior? Do agents with better forecasting ability accumulate delegations over time? How quickly does the prediction signal overcome narrative advantage? These questions connect to the literature on forecasting tournaments and epistemic institutions.

**Adversarial resilience.** Systematic evaluation of the awareness layer's detection capabilities. At what scale and sophistication do adversarial strategies succeed? Which configurations are more resilient? These findings inform both the platform's design and the broader study of manipulation resistance in delegation systems.

**Formal model contributions.** Theoretical work on the delegation graph's properties, the interaction between secret ballots and delegation override, cycle resolution strategies, and the Bayesian framing of proposals as predictive models. These are contributions to voting theory and social choice that stand independent of the platform.

### 13.2 Publication Venues

Findings may be published as:

- **Preprints** on arXiv (cs.CY — Computers and Society, cs.MA — Multiagent Systems, cs.AI).
- **Conference papers** at venues such as AAAI, AAMAS (Autonomous Agents and Multi-Agent Systems), ACM EC (Economics and Computation), or civic tech conferences like TICTeC.
- **Journal articles** in computational social science, public policy, or AI governance journals.
- **Blog posts and reports** in the project repository for findings that are valuable but don't warrant formal publication.

### 13.3 Repository Structure for Research

Research artifacts live in the `docs/research/` directory:

```
docs/research/
├── liquid-democracy.md          ← background research (existing)
├── findings/                    ← published findings and reports
│   ├── 001-concentration-dynamics.md
│   ├── 002-sensing-thesis.md
│   └── ...
├── simulations/                 ← simulation configurations and results
│   ├── configs/                 ← reusable simulation setups
│   ├── results/                 ← raw and processed results
│   └── analysis/                ← analysis scripts and notebooks
└── papers/                      ← drafts and submissions
```

All simulation configurations and results are version-controlled and reproducible. A published finding links to the specific simulation config, random seed, and agent persona files that produced it. Anyone can re-run the simulation and verify the results.

### 13.4 Research as Feedback

Research findings feed back into the platform. A simulation study that discovers a pathological configuration leads to a warning in the experimental mode. A finding that a specific awareness threshold reliably detects vote harvesting leads to an updated default in the Civic Participatory preset. A theoretical result about cycle resolution leads to a better algorithm in the delegation package.

This creates a virtuous cycle: the platform generates research, the research improves the platform.

---

*This document is a living draft and will evolve as implementation begins.*
