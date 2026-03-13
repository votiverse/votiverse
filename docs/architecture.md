# Votiverse Architecture

**Technical Architecture Document — v0.1 Draft**

---

## 1. Overview

Votiverse is implemented as a **headless governance engine** — a set of composable libraries that encode the governance model described in the [whitepaper](whitepaper.md). The engine has no opinion about presentation. It exposes a programmatic API that any client — web application, CLI tool, mobile app, or third-party integration — can drive.

The codebase is organized as a **TypeScript monorepo** managed with **pnpm workspaces**. Each major subsystem is a separate package published under the `@votiverse` npm scope. Packages have explicit dependencies on each other, forming a directed acyclic graph with clear layering.

---

## 2. Design Principles

**Headless first.** The governance engine is pure logic. It accepts inputs (configurations, votes, delegations, predictions, poll responses) and produces outputs (tallies, delegation graphs, weight distributions, alerts, trend data). It does not render, route, or manage sessions. Any UI is a consumer of the engine, not a part of it.

**Correctness over performance.** For a governance system, a wrong answer delivered quickly is worse than a correct answer delivered slowly. The engine prioritizes algorithmic correctness, formal property preservation (sovereignty, one-person-one-vote, monotonicity), and comprehensive testing. Performance optimization comes later, guided by profiling real deployments.

**Explicit boundaries.** Each package owns a single domain. Cross-domain communication happens through well-defined interfaces (TypeScript types and function signatures), never through shared mutable state. A package can be understood, tested, and replaced without understanding the rest of the system.

**Configuration as data.** Governance configurations — the "presets" and custom parameter combinations described in the whitepaper — are plain data objects conforming to a schema. The engine interprets configurations; it does not hard-code governance rules.

**Event-sourced core.** The governance engine records all state changes as an append-only sequence of events (vote cast, delegation created, delegation revoked, prediction committed, poll response submitted, outcome recorded). Current state is derived by replaying events. This provides a complete audit trail, supports temporal queries ("what was the delegation graph at the time of vote X?"), and aligns naturally with the blockchain integrity layer.

---

## 3. Repository Structure

```
votiverse/
├── docs/
│   ├── whitepaper.md
│   ├── architecture.md          ← this document
│   └── research/
├── packages/
│   ├── config/                  ← governance configuration schemas and validation
│   ├── core/                    ← shared types, event definitions, utilities
│   ├── delegation/              ← delegation graph, resolution, weight computation
│   ├── voting/                  ← vote tallying, ballot methods, quorum checks
│   ├── prediction/              ← prediction lifecycle, outcome recording, accuracy
│   ├── polling/                 ← participant polls, trend computation
│   ├── awareness/               ← governance awareness layer, alerts, signals
│   ├── identity/                ← identity abstraction, provider interface
│   ├── integrity/               ← blockchain commitments, verification
│   ├── simulate/                ← AI-driven simulation framework
│   ├── engine/                  ← orchestration layer, wires everything together
│   └── cli/                     ← command-line interface for engine operations
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
            ┌──────────┬───────┼───────┬──────────┐
            │          │       │       │          │
       ┌────▼───┐ ┌───▼───┐ ┌▼────┐ ┌▼────────┐ ┌▼─────────┐
       │awareness│ │voting │ │polls│ │prediction│ │integrity │
       └────┬────┘ └───┬───┘ └──┬──┘ └────┬────┘ └─────┬────┘
            │          │        │          │            │
            └──────┬───┴────┬───┘          │            │
                   │        │              │            │
              ┌────▼────┐   │         ┌────▼────┐      │
              │delegation│   │         │prediction│      │
              └────┬────┘   │         └────┬────┘      │
                   │        │              │            │
              ┌────▼────┐ ┌─▼──────┐      │            │
              │identity │ │ config │      │            │
              └────┬────┘ └───┬────┘      │            │
                   │          │           │            │
                   └────┬─────┴───────────┴────────────┘
                        │
                   ┌────▼────┐
                   │  core   │
                   └─────────┘
```

---

## 5. Package Specifications

### 5.1 `@votiverse/core`

**Purpose:** Shared foundation. Types, event definitions, and utilities used by all other packages.

**Owns:**
- Base entity types: `Participant`, `Issue`, `Topic`, `VotingEvent`.
- Event type definitions: `VoteCast`, `DelegationCreated`, `DelegationRevoked`, `PredictionCommitted`, `PollResponseSubmitted`, `OutcomeRecorded`, etc.
- Event store interface: `EventStore` (abstract — implementations provided by consumers or the engine package).
- Common utilities: ID generation, timestamp handling, schema validation helpers.
- Error types: typed errors for all domain-specific failure modes.

**Dependencies:** None (leaf package).

**Key design decision:** The event store interface is defined here but not implemented. This allows the engine to use an in-memory store for testing, a database-backed store for production, and a blockchain-anchored store for integrity-critical deployments — all conforming to the same interface.

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
- `IdentityProvider` interface: `authenticate()`, `verifyUniqueness()`, `getParticipant()`.
- Built-in providers: `InvitationProvider` (small groups), `OAuthProvider` (organizational SSO).
- Provider registration: organizations plug in their identity provider at configuration time.
- Sybil resistance interface: `SybilCheck` — a hook that providers implement to certify that a participant is unique.

**Dependencies:** `@votiverse/core`.

**Key design decision:** The identity layer is deliberately thin. It defines *what* the engine needs from an identity system (authentication, uniqueness) without prescribing *how*. Verified-identity and cryptographic-identity providers are implemented outside the core engine, conforming to the same interface.

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
- Prediction creation: structured claims (variable, direction, magnitude, timeframe, methodology) attached to proposals.
- Prediction commitment: produce a cryptographic hash of the prediction at submission time (for integrity layer anchoring).
- Outcome recording: link outcome data (official metrics, poll-derived signals, AI-gathered evidence) to predictions.
- Accuracy evaluation: compare outcomes to predictions using the standardized patterns (absolute change, percentage change, threshold, binary, range, comparative).
- Track records: compute prediction accuracy for participants, delegates, and proponents over time.
- Trend integration: accept poll trend data as a supplementary signal for outcome evaluation.

**Dependencies:** `@votiverse/core`, `@votiverse/config`.

**Key design decision:** Predictions are immutable once committed. The commitment hash ensures that predictions cannot be retroactively edited. Outcome data can be updated (new data arrives, measurements are revised), but each update is a new event, preserving the full history of how outcomes were assessed over time.

---

### 5.7 `@votiverse/polling`

**Purpose:** Participant polls — the non-delegable sensing mechanism.

**Owns:**
- Poll creation: structured questions, neutral framing validation, scheduling.
- Response collection: non-transferable responses, one per participant per poll.
- Aggregation: compute aggregate results, breakdowns by topic community, response rates.
- Trend computation: given a series of polls on related questions over time, compute trend lines.
- Cadence management: enforce configured frequency limits, schedule upcoming polls.

**Dependencies:** `@votiverse/core`, `@votiverse/config`, `@votiverse/identity`.

**Key design decision:** Poll responses are linked to verified participants (to ensure one-response-per-person) but can be aggregated anonymously (to protect individual privacy). The identity link is used for deduplication, not for attribution. Whether individual responses are visible to administrators is configurable.

---

### 5.8 `@votiverse/awareness`

**Purpose:** The governance awareness layer — monitoring, alerting, and contextual information delivery.

**Owns:**
- Concentration monitoring: real-time computation of weight distribution metrics, threshold alerts.
- Chain resolution display: for a given participant and issue, compute and return the full delegation chain to the terminal voter.
- Delegation harvesting detection: pattern recognition for bulk re-delegation behavior.
- Delegate track records: aggregate a delegate's voting history, prediction accuracy, and delegation statistics.
- Engagement prompts: given a participant's delegations and the current state of a vote, determine whether to surface a prompt (close vote, prediction mismatch, delegate behavior anomaly).
- Personal voting history: for a given participant, compile the retrospective record of all votes (direct and delegated), outcomes, and prediction results.
- Historical context: for a given issue and topic, retrieve relevant past decisions, predictions, outcomes, and poll trends.
- Progressive disclosure: all queries support summary and detail levels.

**Dependencies:** `@votiverse/core`, `@votiverse/config`, `@votiverse/delegation`, `@votiverse/voting`, `@votiverse/prediction`, `@votiverse/polling`.

**Key design decision:** The awareness layer is read-only. It queries the state produced by other packages but never modifies it. This makes it safe to add, remove, or modify awareness features without risk to the governance logic. It is also the most likely package to evolve rapidly — new signal types, new detection heuristics, new presentation strategies — so decoupling it from the core logic is essential.

---

### 5.9 `@votiverse/integrity`

**Purpose:** Blockchain anchoring and verification for platform meta-accountability.

**Owns:**
- Commitment generation: produce cryptographic commitments (hashes) of critical governance artifacts (vote tallies, prediction texts, poll results, delegation snapshots).
- Blockchain interface: abstract `BlockchainAnchor` interface with methods `commit(hash)` and `verify(hash, blockReference)`.
- Built-in anchors: Ethereum (via smart contract), and a no-op anchor for deployments that don't need blockchain integrity.
- Verification tools: given a governance artifact and a block reference, verify that the artifact has not been altered since commitment.
- Oracle interface: abstract `OracleProvider` interface for bringing external outcome data into the system with cryptographic provenance.

**Dependencies:** `@votiverse/core`, `@votiverse/config`.

**Key design decision:** The integrity package does not depend on any specific blockchain. The `BlockchainAnchor` interface is abstract, and implementations are pluggable. An organization using Ethereum, Solana, or a private chain provides the appropriate anchor implementation. The no-op anchor allows the same engine code to run without blockchain integration — no conditional logic, just a different anchor at configuration time.

---

### 5.10 `@votiverse/engine`

**Purpose:** Orchestration layer. Wires all packages together into a coherent runtime.

**Owns:**
- Engine initialization: accept a `GovernanceConfig`, instantiate all subsystems with the appropriate settings.
- Event bus: route events from the event store to the packages that need to react to them.
- API surface: the public interface that consumers (CLI, web app, API server) interact with. Delegates to the appropriate package for each operation.
- Transaction boundaries: ensure that multi-step operations (e.g., "cast a vote, which triggers override rule, which updates weights, which may trigger an awareness alert") are atomic.
- Configuration hot-reload: allow configuration changes between voting events without restarting the engine.

**Dependencies:** All other packages.

**Key design decision:** The engine package is the only package that knows about all other packages. Every other package depends only on `core`, `config`, and at most one or two domain-specific peers. This keeps the dependency graph shallow and makes individual packages testable in isolation.

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

**Polls:**

```
votiverse poll create [--questions <file>] [--schedule <date>]
votiverse poll respond <poll-id>                # interactive prompt for responses
votiverse poll results <poll-id>
votiverse poll trends [--topic <scope>] [--range <start>..<end>]
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
votiverse poll trends --topic education --range last-quarter --format csv > trends.csv
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
| `PollResponseSubmitted` | Participant (hashed for privacy), poll ref, responses, timestamp | polling |
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

The API is organized by domain:

```typescript
// Configuration
engine.config.validate(config: GovernanceConfig): ValidationResult
engine.config.getPreset(name: PresetName): GovernanceConfig

// Voting Events
engine.events.create(params: CreateEventParams): VotingEvent
engine.events.get(id: EventId): VotingEvent

// Delegations
engine.delegation.create(params: CreateDelegationParams): Delegation
engine.delegation.revoke(params: RevokeDelegationParams): void
engine.delegation.resolve(participantId, issueId): DelegationChain
engine.delegation.weights(issueId): WeightDistribution

// Voting
engine.voting.cast(params: CastVoteParams): void
engine.voting.tally(issueId): TallyResult

// Predictions
engine.prediction.commit(params: CommitPredictionParams): Prediction
engine.prediction.recordOutcome(params: RecordOutcomeParams): void
engine.prediction.evaluate(predictionId): PredictionEvaluation
engine.prediction.trackRecord(participantId, topicScope?): TrackRecord

// Polls
engine.polls.create(params: CreatePollParams): Poll
engine.polls.respond(params: PollResponseParams): void
engine.polls.results(pollId): PollResults
engine.polls.trends(topicScope, timeRange): TrendData

// Awareness
engine.awareness.chain(participantId, issueId): ChainResolution
engine.awareness.concentration(issueId): ConcentrationMetrics
engine.awareness.delegateProfile(delegateId): DelegateProfile
engine.awareness.votingHistory(participantId): VotingHistory
engine.awareness.context(issueId): HistoricalContext
engine.awareness.prompts(participantId, issueId): EngagementPrompt[]

// Integrity
engine.integrity.commit(artifactType, artifactData): Commitment
engine.integrity.verify(commitment): VerificationResult
```

This is illustrative, not final. The actual API will be shaped by implementation experience. But the domain structure should remain stable.

---

## 8. Open Technical Questions

Several technical problems are not yet resolved. They are listed here to guide early development and research.

**Verifiable secret ballots.** When ballot secrecy is configured, the system must tally votes without revealing individual choices, while still allowing participants to verify that their vote was counted. This is a well-studied problem in cryptographic voting (homomorphic encryption, zero-knowledge proofs, mixnets), but selecting and implementing the right approach for Votiverse requires careful analysis. The delegation-override interaction adds complexity: the system must verify that a direct vote was cast (to apply the override rule) without revealing the vote's content.

**Delegation graph performance at scale.** The current design computes the delegation graph fresh from the event log for each issue. This is correct and simple but potentially expensive for large deployments. Incremental graph maintenance (updating the graph as events arrive rather than recomputing from scratch) is a performance optimization that will be needed at Stage 3+. The key constraint is that incremental maintenance must produce identical results to full recomputation.

**Poll question neutrality.** The whitepaper states that poll questions must be neutrally framed. Enforcing this programmatically is an open problem. Initial deployments can rely on administrator review, but larger-scale deployments may need automated bias detection (potentially AI-assisted, with the same multi-provider and auditability constraints described in the whitepaper).

**Outcome measurement ambiguity.** Predictions claim "X will change by Y within Z time." Evaluating whether the prediction was met requires measuring X, which may be ambiguous (multiple data sources disagree), contested (the measurement methodology is disputed), or confounded (X changed, but for reasons unrelated to the proposal). The prediction package needs a framework for expressing evaluation confidence, not just binary right/wrong.

**Blockchain cost and latency.** Anchoring every governance event to a public blockchain is expensive and slow. The integrity package should batch commitments (e.g., Merkle tree of events committed periodically) rather than committing individual events. The batching strategy — how often, what triggers a commit, how to handle verification of individual events within a batch — is a design problem.

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

**Rule-based agents (lightweight).** Each agent follows configurable behavioral heuristics: "delegate to the agent with the highest prediction track record in my topic," "vote directly if the proposal touches my core interest area," "respond to polls based on a ground-truth function with some noise." Rule-based agents are fast and cheap. Thousands of agents can run in seconds, enabling statistical analysis across many runs. This mode is appropriate for testing structural properties: does delegation concentration stabilize or diverge? How does the override rate change with different awareness layer thresholds? At what group size does the poll signal-to-noise ratio degrade?

**LLM-driven agents (full AI).** Each agent is backed by an LLM prompt with a detailed persona: background, expertise, biases, engagement level, trust relationships, and temperament. The agent receives the voting booklet, awareness data, delegation chain information, and past poll results — the same information a real participant would see — and produces realistic deliberative behavior. LLM agents are expensive but produce qualitatively richer scenarios. They discover failure modes that rule-based agents wouldn't exhibit: a charismatic agent who accumulates delegations through rhetorical skill despite poor prediction accuracy, a coordinated group that gradually captures a topic community, a well-intentioned expert who delegates to the wrong person due to misleading track record presentation.

### 10.2 What the Simulation Tests

**Concentration dynamics.** Seed a simulation with hundreds of agents and let delegation networks form organically based on each agent's topic interests and trust heuristics. Observe whether super-delegates emerge, whether the awareness layer's concentration alerts trigger revocations, and how different configurations (bounded vs. unbounded transitivity, different alert thresholds) affect the equilibrium.

**Prediction signal quality.** Give agents different levels of forecasting ability. Over multiple voting events, do the agents with genuinely better judgment accumulate delegations? Does the prediction tracking signal cut through narrative noise, or do charismatic-but-inaccurate agents dominate despite poor track records?

**Sensor value.** Create a population where 80% are pure sensors (respond to polls, delegate everything) and 20% are active deliberators. Run proposals with predictions. Have sensor polls reflect a configurable ground truth. Compare outcomes to a simulation with no polling layer. This directly tests whether the sensing layer improves decision quality.

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
- Poll trend lines and comparison to ground truth.
- Awareness layer alert history.
- Narrative summary (LLM-generated): what happened, what patterns emerged, what broke.

The narrative summary is particularly valuable for LLM-driven simulations. Instead of parsing raw metrics, a researcher can read: "Over 20 voting events, Agent 'Charismatic Charlie' accumulated 18% of delegation weight on Finance topics despite a prediction accuracy of 31%. The awareness layer flagged the concentration at event 12, triggering 6 revocations. By event 15, Charlie's weight had stabilized at 9%. However, a coordinated group of 4 agents exploiting a topic-scope overlap were not detected until event 18."

### 10.5 Implementation Notes

The simulation framework is part of the `@votiverse/cli` package (the `votiverse simulate` command family) and an optional `@votiverse/simulate` package for programmatic use.

Rule-based agents are implemented as configurable state machines within the simulate package — no external dependencies.

LLM-driven agents use the Anthropic API (or other LLM providers, following the same multi-provider principle as the AI assistance layer in the whitepaper). The persona prompt, the governance context (booklet, awareness data), and the expected output format are assembled by the simulate package and sent to the LLM. The LLM's response is parsed as a governance action (vote, delegate, respond to poll, submit prediction) and fed into the engine.

Simulation runs are reproducible: a random seed and a set of persona files define the initial conditions. For LLM-driven simulations, the LLM responses are logged and can be replayed deterministically.

---

## 11. Development Phases

### Phase 1: Foundation

Build `core`, `config`, `delegation`, and `voting`. This is the minimum viable governance engine — a system that can configure a governance model, manage delegations, resolve votes with transitive delegation and override rules, and tally results using configurable ballot methods.

Deliverable: a CLI that can run a complete voting event with delegation for a small group.

### Phase 2: Accountability

Add `prediction` and `polling`. The engine can now track predictions attached to proposals, record outcomes, compute accuracy, run non-delegable polls, and compute trend lines.

Deliverable: a CLI that can run a voting event with predictions, followed by outcome recording and accuracy evaluation. Polls with trend visualization.

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

The primary UI for Votiverse will be built on the **Uniweb Platform** by Proximify Inc. This UI is a separate, proprietary codebase that consumes the engine's TypeScript API (likely via an HTTP API layer built on top of the engine).

The open-source engine and the proprietary UI form an **open-core model**:

- **Open source (this repo):** governance engine, CLI, all core logic, documentation.
- **Proprietary (separate repo):** Uniweb-based web application, visual configuration tools, hosted service infrastructure.

This separation ensures that the governance logic is inspectable, auditable, and forkable by anyone, while the commercial product built on top funds ongoing development.

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
