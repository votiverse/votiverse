# Votiverse Cloud Platform (VCP) Architecture

**Service Architecture Document — v0.1 Draft**

---

## 1. Overview

The Votiverse Cloud Platform (VCP) is the headless governance engine service that turns the `@votiverse/engine` library into an HTTP API. It handles governance computation, event sourcing, delegation graphs, voting, polls, predictions, and awareness. The VCP holds no PII and no rich content — it receives only opaque participant IDs from upstream client backends, and stores only governance metadata and content hashes (never markdown documents or binary assets). Rich content lives in the client backend; the `contentHash` provides integrity verification. See `docs/design/content-architecture.md` for the content boundary design.

In the production architecture, the VCP sits behind a **client backend** (`platform/backend/`) that owns user authentication, session management, and user-to-participant identity mapping. The client backend proxies governance requests to the VCP with the correct `X-Participant-Id` header. Web and mobile clients never talk to the VCP directly.

The VCP is a single codebase that runs in two modes:

- **Local development** — everything runs in a single Node.js process. SQLite for storage, in-process scheduling, console output for webhooks. Start with `vcp dev` and the entire system is running on localhost.
- **AWS production** — the same code, decomposed across infrastructure: API behind a load balancer, workers processing queues, scheduled jobs on timers, PostgreSQL for storage, SES for email triggers, and real webhook delivery.

The design principle is **one codebase, two topologies**. The application code doesn't know whether it's running locally or on AWS. The difference is in the infrastructure adapters — which database, which queue, which scheduler — injected at startup.

---

## 2. Workload Analysis

The VCP handles four distinct workload types. Each has different characteristics that inform infrastructure choices.

### 2.1 Synchronous API Requests

**What:** HTTP requests from client backend apps. Cast votes, create delegations, submit poll responses, query tallies, fetch awareness data.

**Characteristics:**
- Latency-tolerant: this is humans making governance decisions, not credit card transactions. A response within 2–3 seconds is perfectly adequate. Sub-second is nice but not a design requirement.
- Consistency matters but not at extreme speed: a vote cast should be reflected in the tally within seconds, not milliseconds. If the tally page refreshes every 30 seconds during an active vote, that's fine.
- Read-heavy: awareness queries, tally checks, and trend data are queried more often than votes are cast.
- Bursty but not dramatically: a voting event deadline may produce a brief spike, but "a few hundred votes over an hour" is the realistic peak, not thousands per second.

**Scaling pattern:** A single API server handles the expected load comfortably. Horizontal scaling (multiple instances behind a load balancer) is available if needed but may not be necessary for early and moderate deployments.

### 2.2 Scheduled Jobs

**What:** Recurring tasks that run on a timer, independent of API requests.

| Job | Frequency | Tolerance |
|-----|-----------|-----------|
| Poll cadence management (open/close polls) | Per-Assembly schedule (daily to quarterly) | Must fire within minutes of scheduled time |
| Prediction timeframe monitoring | Daily scan | Hours of delay acceptable |
| Trend recomputation | After each poll closes, plus periodic refresh | Minutes |
| Integrity commitment batching | Configurable (hourly to daily) | Hours |
| Reminder generation | Days/hours before event deadlines | Minutes |
| Stale delegation detection | Weekly | Hours |

**Characteristics:**
- Not latency-sensitive, but must be reliable. A poll that doesn't open on time breaks trust.
- Lightweight individually, but accumulate as the number of Assemblies grows.
- Most jobs are idempotent — running them twice produces the same result.

**Scaling pattern:** Single scheduler instance is sufficient for moderate scale. Jobs are enqueued, not executed inline — the scheduler triggers work, workers execute it.

### 2.3 Asynchronous Workers

**What:** Tasks triggered by events that shouldn't block the API request path.

| Worker | Trigger | Duration |
|--------|---------|----------|
| AI outcome gathering | Prediction timeframe elapsed | 5–30 seconds (API calls to AI providers) |
| Anomaly detection | Vote cast, delegation created | 1–5 seconds |
| Webhook delivery | Any state change that clients subscribe to | Sub-second per delivery, retries over minutes |
| Awareness recomputation | Vote/delegation changes during active events | 1–10 seconds |
| Prediction evaluation | Outcome recorded | Sub-second |

**Characteristics:**
- Can tolerate seconds to minutes of delay.
- Some are expensive (AI API calls with multiple providers for ensemble verification).
- Must be retryable — if a worker fails, the task should be re-queued.
- Webhook delivery specifically needs exponential backoff and dead-letter handling.

**Scaling pattern:** Worker pool processing a shared queue. Scale by adding workers.

### 2.4 Outbound Communication

**What:** Notifications pushed to Client instances (via webhooks) and optionally to participants (via email, triggered through Client).

**Characteristics:**
- At-least-once delivery guarantee for webhooks.
- Idempotent processing expected on the receiving end.
- Not latency-sensitive (seconds to minutes is fine).
- Volume scales with the number of active Assemblies and participants.

**Scaling pattern:** Part of the async worker pool. Webhook delivery is a worker task.

---

## 3. Application Architecture

### 3.1 Module Structure

The VCP is a TypeScript application organized into layers:

```
vcp/
├── src/
│   ├── api/                    # HTTP API layer
│   │   ├── routes/             # Route definitions by domain
│   │   │   ├── assemblies.ts
│   │   │   ├── delegations.ts
│   │   │   ├── voting.ts
│   │   │   ├── predictions.ts
│   │   │   ├── polls.ts
│   │   │   ├── awareness.ts
│   │   │   ├── integrity.ts
│   │   │   └── webhooks.ts
│   │   ├── middleware/         # Auth, rate limiting, validation, error handling
│   │   └── server.ts          # HTTP server setup
│   │
│   ├── workers/                # Async task processors
│   │   ├── ai-outcome.ts      # AI-assisted outcome gathering
│   │   ├── anomaly.ts         # Delegation anomaly detection
│   │   ├── webhook.ts         # Webhook delivery with retry
│   │   ├── awareness.ts       # Awareness recomputation
│   │   └── evaluation.ts      # Prediction evaluation
│   │
│   ├── scheduler/              # Scheduled job definitions
│   │   ├── poll-cadence.ts
│   │   ├── prediction-monitor.ts
│   │   ├── trend-refresh.ts
│   │   ├── integrity-batch.ts
│   │   ├── reminder.ts
│   │   └── stale-delegation.ts
│   │
│   ├── adapters/               # Infrastructure abstractions
│   │   ├── database/
│   │   │   ├── interface.ts    # DatabaseAdapter interface
│   │   │   ├── sqlite.ts       # Local dev implementation
│   │   │   └── postgres.ts     # Production implementation
│   │   ├── queue/
│   │   │   ├── interface.ts    # QueueAdapter interface
│   │   │   ├── memory.ts       # In-process queue (local dev)
│   │   │   └── sqs.ts          # AWS SQS implementation
│   │   ├── scheduler/
│   │   │   ├── interface.ts    # SchedulerAdapter interface
│   │   │   ├── local.ts        # setInterval-based (local dev)
│   │   │   └── eventbridge.ts  # AWS EventBridge implementation
│   │   ├── email/
│   │   │   ├── interface.ts    # EmailAdapter interface
│   │   │   ├── console.ts      # Log to console (local dev)
│   │   │   └── ses.ts          # AWS SES implementation
│   │   ├── storage/
│   │   │   ├── interface.ts    # ObjectStorageAdapter interface
│   │   │   ├── filesystem.ts   # Local filesystem (local dev)
│   │   │   └── s3.ts           # AWS S3 implementation
│   │   └── blockchain/
│   │       ├── interface.ts    # BlockchainAdapter (from engine's integrity package)
│   │       ├── noop.ts         # No-op (local dev)
│   │       └── ethereum.ts     # Ethereum mainnet/testnet
│   │
│   ├── engine/                 # Engine integration layer
│   │   ├── instance.ts         # Engine instance management per Assembly
│   │   ├── event-bridge.ts     # Translates engine events to worker tasks
│   │   └── storage-adapter.ts  # Implements engine's StorageAdapter over VCP database
│   │
│   ├── config/                 # VCP configuration
│   │   ├── schema.ts           # VCP config type definition
│   │   ├── local.ts            # Default config for local dev
│   │   └── production.ts       # Production config (reads from environment)
│   │
│   └── main.ts                 # Entry point — reads config, wires adapters, starts services
│
├── migrations/                 # Database migrations (PostgreSQL)
├── scripts/
│   ├── dev.ts                  # `vcp dev` — local development mode
│   ├── migrate.ts              # Run database migrations
│   └── seed.ts                 # Seed test data
├── test/
├── Dockerfile
├── package.json
└── tsconfig.json
```

### 3.2 Adapter Pattern

The core design principle is the **adapter pattern** — every infrastructure dependency is behind an interface. The application code never references AWS services, SQLite, or any specific technology directly. At startup, the configuration determines which adapter implementations are injected.

```typescript
interface VCPAdapters {
  database: DatabaseAdapter;       // SQLite or PostgreSQL
  queue: QueueAdapter;             // In-memory or SQS
  scheduler: SchedulerAdapter;     // setInterval or EventBridge
  email: EmailAdapter;             // Console or SES
  storage: ObjectStorageAdapter;   // Filesystem or S3
  blockchain: BlockchainAdapter;   // No-op or Ethereum
}
```

Local dev:
```typescript
const adapters: VCPAdapters = {
  database: new SQLiteAdapter('./vcp-dev.db'),
  queue: new MemoryQueueAdapter(),
  scheduler: new LocalSchedulerAdapter(),
  email: new ConsoleEmailAdapter(),
  storage: new FilesystemStorageAdapter('./data'),
  blockchain: new NoOpBlockchainAdapter(),
};
```

Production:
```typescript
const adapters: VCPAdapters = {
  database: new PostgresAdapter(process.env.DATABASE_URL),
  queue: new SQSAdapter(process.env.SQS_QUEUE_URL),
  scheduler: new EventBridgeAdapter(process.env.SCHEDULER_ARN),
  email: new SESAdapter(process.env.SES_REGION),
  storage: new S3Adapter(process.env.S3_BUCKET),
  blockchain: new EthereumAdapter(process.env.ETH_RPC_URL),
};
```

### 3.3 Engine Integration

The VCP imports `@votiverse/engine` as a library dependency. The engine integration layer manages:

**Engine instances.** Each Assembly has a logically separate engine instance. In practice, engine instances share the same database but operate on separate event streams (scoped by Assembly ID). The engine's `VotiverseEngine` class is instantiated per-request with the Assembly's governance configuration and a storage adapter scoped to that Assembly's events.

**Event bridging.** When the engine processes a command (vote cast, delegation created, prediction committed), it emits domain events. The VCP's event bridge listens to these events and translates them into worker tasks: "a vote was cast on issue X → enqueue awareness recomputation for this Assembly," "a prediction timeframe has elapsed → enqueue AI outcome gathering."

**Storage adapter.** The VCP implements the engine's `StorageAdapter` interface, delegating to its own database adapter. This is the bridge between the engine's abstract storage needs and the VCP's concrete database.

---

## 4. HTTP API

### 4.1 Framework

The API is built on a lightweight HTTP framework — Hono, Fastify, or Express. The choice is not architecturally significant because the framework is a thin layer over the route handlers, which delegate to the engine.

Requirements:
- TypeScript-native with strong typing for request/response.
- Middleware support (auth, rate limiting, validation, error handling).
- Compatible with both standalone Node.js server (local dev) and containerized deployment (production).

### 4.2 Authentication and Authorization

**Client authentication.** Each Client instance and CLI client authenticates with an API key or OAuth2 client credentials. The VCP issues credentials when a client is registered. Every request must include valid credentials.

**Participant identity.** The VCP receives an opaque `ParticipantId` from the client. The client is responsible for authenticating the user and mapping their identity to a ParticipantId. The VCP trusts the client's assertion. The VCP holds no PII.

**Authorization.** The VCP enforces Assembly-level authorization: the authenticated client must have access to the Assembly referenced in the request. Within an Assembly, the VCP trusts the client's role assertions (admin, member) because RBAC is a Client concern. The VCP enforces governance rules (non-delegable polls, override rule, quorum) — these are engine-level constraints, not RBAC.

### 4.3 Rate Limiting

Per-client and per-Assembly rate limiting to prevent abuse and protect the service.

| Operation type | Limit (per Assembly, per minute) |
|---------------|----------------------------------|
| Read (awareness queries, tallies, trends) | 300 |
| Write (votes, delegations, poll responses) | 60 |
| Admin (create events, manage participants) | 30 |
| Webhook management | 10 |

Limits are configurable per-client. White-label instances with high traffic can have elevated limits.

### 4.4 API Endpoints

The full REST API as sketched in the [integration architecture](integration-architecture.md), Section 7. The VCP implements each endpoint as:

1. Authenticate client.
2. Validate request payload against typed schema.
3. Resolve Assembly and load engine configuration.
4. Call engine API function with translated parameters.
5. If the engine call produces domain events, enqueue worker tasks via the event bridge.
6. Return response.

### 4.5 Request Lifecycle Example

A vote is cast:

```
Client (Client) → POST /assemblies/:id/votes { participantId, issueId, choice }
  ↓
API middleware: authenticate client, validate payload, check rate limit
  ↓
Route handler: load Assembly config, instantiate engine
  ↓
engine.voting.cast({ participantId, issueId, choice })
  ↓
Engine: validates (is voting open? is participant eligible? does this override a delegation?)
Engine: appends VoteCast event to event store
Engine: returns Result<void, VotingError>
  ↓
Event bridge: VoteCast event → enqueue awareness recomputation task
Event bridge: VoteCast event → enqueue webhook notifications for subscribed clients
  ↓
Route handler: return 200 OK (or 4xx error)
```

---

## 5. Database

### 5.1 Schema Design

The database serves two purposes: the **event store** (source of truth) and **materialized views** (derived state for fast reads).

**Event store tables:**

```sql
-- Core event log, append-only
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assembly_id     UUID NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sequence_num    BIGSERIAL,
    
    INDEX idx_events_assembly (assembly_id, sequence_num),
    INDEX idx_events_type (assembly_id, event_type, occurred_at)
);

-- Assembly registry
CREATE TABLE assemblies (
    id              UUID PRIMARY KEY,
    organization_id UUID,
    name            VARCHAR(500) NOT NULL,
    config          JSONB NOT NULL,          -- immutable governance configuration
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(50) NOT NULL DEFAULT 'active'
);

-- Client registry (Client instances, CLI)
CREATE TABLE clients (
    id              UUID PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    api_key_hash    VARCHAR(200) NOT NULL,
    assembly_access UUID[] NOT NULL DEFAULT '{}',
    rate_limits     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook subscriptions
CREATE TABLE webhook_subscriptions (
    id              UUID PRIMARY KEY,
    client_id       UUID NOT NULL REFERENCES clients(id),
    assembly_id     UUID NOT NULL REFERENCES assemblies(id),
    endpoint_url    VARCHAR(2000) NOT NULL,
    event_types     VARCHAR(100)[] NOT NULL,  -- which events to deliver
    secret          VARCHAR(200) NOT NULL,     -- for HMAC signature verification
    status          VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Additional data tables:**

```sql
-- Participants per assembly
CREATE TABLE participants (
    id              TEXT NOT NULL,
    assembly_id     TEXT NOT NULL,
    name            TEXT NOT NULL,
    registered_at   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (assembly_id, id)
);

-- Issues (persisted from VotingEventCreated events)
CREATE TABLE issues (
    id              TEXT NOT NULL,
    assembly_id     TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    topic_ids       JSONB NOT NULL DEFAULT '[]',
    voting_event_id TEXT NOT NULL,
    choices         JSONB,
    PRIMARY KEY (assembly_id, id)
);

-- Topic taxonomy per assembly
CREATE TABLE topics (
    id              TEXT NOT NULL,
    assembly_id     TEXT NOT NULL,
    name            TEXT NOT NULL,
    parent_id       TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (assembly_id, id)
);
```

**Materialized view tables (lazy, idempotent — computed on first query for closed events):**

```sql
-- Per-participant voting records (direct vote, delegated, chain)
CREATE TABLE issue_participation (
    assembly_id       TEXT NOT NULL,
    issue_id          TEXT NOT NULL,
    participant_id    TEXT NOT NULL,
    status            TEXT NOT NULL,        -- 'direct', 'delegated', 'abstained'
    effective_choice  TEXT,                  -- JSON, null if secret ballot
    delegate_id       TEXT,
    terminal_voter_id TEXT,
    chain             JSONB NOT NULL DEFAULT '[]',
    computed_at       TEXT NOT NULL,
    PRIMARY KEY (assembly_id, issue_id, participant_id)
);

-- Vote count tallies (computed when event closes)
CREATE TABLE issue_tallies (
    assembly_id         TEXT NOT NULL,
    issue_id            TEXT NOT NULL,
    winner              TEXT,
    counts              JSONB NOT NULL,     -- {"yes": 5, "no": 3}
    total_votes         INTEGER NOT NULL,
    quorum_met          BOOLEAN NOT NULL,
    quorum_threshold    DOUBLE PRECISION NOT NULL,
    eligible_count      INTEGER NOT NULL,
    participating_count INTEGER NOT NULL,
    computed_at         TEXT NOT NULL,
    PRIMARY KEY (assembly_id, issue_id)
);

-- Delegation weight distribution per issue
CREATE TABLE issue_weights (
    assembly_id   TEXT NOT NULL,
    issue_id      TEXT NOT NULL,
    weights       JSONB NOT NULL,           -- {"pid1": 3.0, "pid2": 1.0}
    total_weight  DOUBLE PRECISION NOT NULL,
    computed_at   TEXT NOT NULL,
    PRIMARY KEY (assembly_id, issue_id)
);

-- Concentration metrics (Gini, max weight, chain lengths)
CREATE TABLE issue_concentration (
    assembly_id              TEXT NOT NULL,
    issue_id                 TEXT NOT NULL,
    gini_coefficient         DOUBLE PRECISION NOT NULL,
    max_weight               DOUBLE PRECISION NOT NULL,
    max_weight_holder        TEXT,
    chain_length_distribution JSONB NOT NULL,
    delegating_count         INTEGER NOT NULL,
    direct_voter_count       INTEGER NOT NULL,
    computed_at              TEXT NOT NULL,
    PRIMARY KEY (assembly_id, issue_id)
);
```

**Note:** Delegation graphs, voting event state, predictions, polls, and trends are computed live from the event store by the engine — they are NOT pre-materialized in separate tables. The four materialized tables above (`issue_participation`, `issue_tallies`, `issue_weights`, `issue_concentration`) are populated lazily on first query for closed events, using `INSERT ... ON CONFLICT DO NOTHING` for idempotency.

### 5.2 Event Store Principles

- **Append-only.** Events are never updated or deleted. The event log is the immutable audit trail.
- **Assembly-scoped.** Every event belongs to exactly one Assembly. Cross-Assembly queries never happen.
- **Sequence-numbered.** Each event within an Assembly has a monotonically increasing sequence number. This enables consistent replay and catch-up for materialized views.
- **JSONB payloads.** Event payloads are stored as JSONB. The engine packages interpret the payload according to the event type. The database doesn't need to understand the payload schema.

### 5.3 Materialized View Refresh

Materialized views are derived state — they can always be rebuilt by replaying events. They exist for read performance.

**Lazy materialization:** Materialized views are computed on first read (not on write). When a client queries the tally for a closed event, the handler checks if materialized data exists. If not, it computes from the event store, writes to the materialized table, and returns the result. Subsequent queries are O(1). This avoids write-path latency and ensures materialization only happens for data that is actually read.

**Asynchronous refresh:** Some views can tolerate staleness. Awareness metrics, poll trends, and prediction evaluations are refreshed by worker tasks. They may lag seconds behind the event stream.

**Full rebuild:** If a materialized view becomes corrupted or a schema change requires it, the view can be dropped and rebuilt from the event log. The `vcp rebuild-views` command does this for a specific Assembly or all Assemblies.

### 5.4 SQLite for Local Dev

For local development, the same schema runs on SQLite with minor adaptations:
- `UUID` → `TEXT`
- `JSONB` → `TEXT` (JSON stored as string, parsed in application code)
- `TIMESTAMPTZ` → `TEXT` (ISO 8601 strings)
- `BIGSERIAL` → `INTEGER` with autoincrement
- Array columns → JSON arrays stored as TEXT

The adapter abstracts these differences. Application code uses the `DatabaseAdapter` interface and never writes raw SQL.

---

## 6. Queue and Workers

### 6.1 Queue Design

The task queue decouples event-producing operations (API requests, scheduler ticks) from event-processing operations (awareness recomputation, webhook delivery, AI calls).

**Task structure:**

```typescript
interface WorkerTask {
  id: string;
  type: WorkerTaskType;
  assemblyId: string;
  payload: Record<string, unknown>;
  priority: 'high' | 'normal' | 'low';
  createdAt: string;
  attempts: number;
  maxAttempts: number;
}

type WorkerTaskType =
  | 'awareness-recompute'
  | 'webhook-deliver'
  | 'ai-outcome-gather'
  | 'anomaly-detect'
  | 'prediction-evaluate'
  | 'reminder-send'
  | 'trend-refresh'
  | 'integrity-commit';
```

**Priority levels:**
- **High:** Webhook delivery, awareness recomputation during active voting events. These affect the user experience in real time.
- **Normal:** Prediction evaluation, anomaly detection, trend refresh. Important but not time-critical.
- **Low:** AI outcome gathering, integrity batching, stale delegation cleanup. Can wait minutes or hours.

### 6.2 Worker Pool

Workers are long-running processes that pull tasks from the queue and execute them. Each worker can handle any task type — they're generalist, not specialized. This simplifies scaling: add more workers to increase throughput, regardless of task mix.

**Worker lifecycle:**

```
Pull task from queue → Execute handler → On success: delete task
                                        → On failure: increment attempts
                                          → If attempts < maxAttempts: re-queue with backoff
                                          → If attempts >= maxAttempts: move to dead letter
```

**Concurrency:** Each worker processes one task at a time. Multiple workers run in parallel. For local dev, a single in-process worker handles all tasks sequentially.

### 6.3 In-Memory Queue (Local Dev)

For local development, the queue is an in-memory array with a `setInterval` loop that processes tasks. Tasks are executed synchronously in the main process. This means no SQS dependency, no separate worker process, and immediate visibility of task processing in the console.

### 6.4 SQS Queue (Production)

In production, the queue is an SQS standard queue (or FIFO if ordering matters for specific task types). Workers run as separate processes — either on dedicated EC2 instances or as containers in the same auto-scaling group as the API servers.

**Dead letter queue:** Failed tasks that exceed maxAttempts are moved to a DLQ for manual inspection. An alert fires when the DLQ is non-empty.

**Visibility timeout:** Set to the maximum expected task duration plus margin (60 seconds for most tasks, 120 seconds for AI outcome gathering).

---

## 7. Scheduler

### 7.1 Job Definitions

Each scheduled job is defined as:

```typescript
interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;           // cron expression or interval
  handler: (ctx: JobContext) => Promise<void>;
  assemblyScope: 'all' | 'active';  // run for all assemblies or only active ones
}
```

The scheduler doesn't execute jobs directly. It enqueues worker tasks at the scheduled time. This means job execution inherits all the retry, concurrency, and dead-letter behavior of the worker pool.

### 7.2 Assembly-Scoped Scheduling

Some jobs run per-Assembly with Assembly-specific timing. Poll cadence is the primary example — each Assembly has its own poll schedule. The scheduler maintains a registry of Assembly-specific schedules and checks them on each tick.

For local dev, this is a `setInterval` that scans the Assembly table every minute. For production, this could be EventBridge rules per Assembly (at small scale) or a single EventBridge rule that triggers a Lambda which scans and enqueues per-Assembly tasks (at moderate scale).

### 7.3 Local Scheduler

```typescript
class LocalSchedulerAdapter implements SchedulerAdapter {
  private timers: Map<string, NodeJS.Timer> = new Map();
  
  schedule(job: ScheduledJob): void {
    const interval = cronToMs(job.schedule);
    const timer = setInterval(() => this.enqueueJob(job), interval);
    this.timers.set(job.id, timer);
  }
  
  private enqueueJob(job: ScheduledJob): void {
    this.queue.enqueue({
      type: job.id as WorkerTaskType,
      assemblyId: '*',
      priority: 'normal',
      payload: {},
    });
  }
}
```

---

## 8. Webhook Delivery

### 8.1 Delivery Flow

```
Engine event → Event bridge → Enqueue webhook-deliver task
  → Worker picks up task
  → Look up subscriptions for this Assembly + event type
  → For each subscription:
    → Compute HMAC signature of payload using subscription secret
    → POST to endpoint_url with signature header
    → On 2xx: mark delivered
    → On failure: re-queue with exponential backoff
```

### 8.2 Reliability

- **At-least-once delivery.** A webhook may be delivered more than once if the acknowledgment is lost. Clients must handle idempotent processing.
- **Exponential backoff.** Retries at 10s, 30s, 90s, 270s, 810s (approximately 1s, 30s, 1.5m, 4.5m, 13.5m). After 5 failures, the task moves to the dead letter queue.
- **Subscription health.** If a subscription's endpoint fails consistently (e.g., 10 consecutive failures), the subscription is marked `degraded` and an alert is generated. It is not automatically disabled — an admin reviews and decides.
- **Signature verification.** Each delivery includes an `X-Votiverse-Signature` header — HMAC-SHA256 of the payload body using the subscription's shared secret. Clients verify the signature to ensure the webhook is authentic.

### 8.3 Payload Format

```json
{
  "id": "evt_abc123",
  "type": "vote.cast",
  "assemblyId": "asm_xyz",
  "timestamp": "2026-03-14T18:30:00Z",
  "data": {
    "participantId": "p_456",
    "issueId": "iss_789",
    "choice": "for"
  }
}
```

---

## 9. AI Integration

### 9.1 Outcome Gathering

When a prediction's timeframe elapses, the VCP enqueues an AI outcome gathering task. The worker:

1. Loads the prediction claim (variable, expected value, timeframe, methodology).
2. Constructs a research prompt: "Find current data on [variable]. The prediction claimed [expected outcome] by [timeframe]. Find evidence that confirms or contradicts this."
3. Sends the prompt to multiple AI providers (ensemble verification per whitepaper Section 13.4).
4. Parses each provider's response for: measured value, source URLs, confidence assessment.
5. If providers converge: creates an OutcomeRecord with source type `automated` and the consensus value.
6. If providers diverge: creates an OutcomeRecord with lower confidence and flags for human review.
7. Enqueues a prediction evaluation task.

### 9.2 AI Provider Interface

```typescript
interface AIProvider {
  name: string;
  gatherOutcomeEvidence(claim: PredictionClaim): Promise<AIEvidence>;
}

interface AIEvidence {
  provider: string;
  measuredValue: number | boolean | null;
  confidence: 'high' | 'medium' | 'low';
  sources: Array<{ url: string; title: string; relevance: string }>;
  reasoning: string;
}
```

Multiple providers are configured. The VCP calls all configured providers in parallel and compares results. This is the ensemble verification pattern.

### 9.3 Cost Management

AI calls are expensive. Cost controls:

- **Rate limiting per Assembly.** Each Assembly has a budget for AI-assisted evaluation (configurable by plan tier).
- **Batching.** Multiple predictions with elapsed timeframes in the same Assembly are gathered in a single AI session where possible.
- **Caching.** If multiple predictions reference the same variable and timeframe, the evidence from one can inform the others.
- **Fallback.** If AI budget is exhausted, predictions are marked `awaiting-manual-evaluation` and surfaced in the admin interface.

---

## 10. Local Development Mode

### 10.1 Single Command Startup

```bash
# Start the entire VCP locally
pnpm dev

# Or with specific options
pnpm dev --port 3000 --db ./dev.db --seed
```

This starts:
- HTTP API server on localhost:3000
- In-process worker (processes tasks immediately)
- In-process scheduler (setInterval-based)
- SQLite database (file-based or in-memory)
- Console adapters for email and webhooks (logs output)
- No-op blockchain adapter

### 10.2 Development Tools

**Seed data.** `pnpm dev --seed` creates a sample Organization, Assembly (Liquid Standard preset), 10 participants, and a voting event with issues — enough to exercise the full workflow immediately.

**Admin UI.** A minimal admin interface (served from the API server in dev mode) showing: event log viewer, queue status, Assembly state, and a webhook event console. Not a production feature — just a development tool.

**Request logging.** All API requests are logged with timing, method, path, Assembly ID, and response status. In dev mode, engine events and worker task executions are also logged.

### 10.3 Testing Against Local VCP

Integration tests can start a local VCP in-process and make HTTP requests against it. The test suite creates Assemblies, runs voting events, and verifies end-to-end behavior including worker task processing and materialized view updates.

```typescript
import { createTestVCP } from '@votiverse/vcp/test';

const vcp = await createTestVCP({ seed: true });
const res = await vcp.request('POST', '/assemblies/asm_1/votes', {
  participantId: 'p_1',
  issueId: 'iss_1',
  choice: 'for',
});
expect(res.status).toBe(200);

const tally = await vcp.request('GET', '/assemblies/asm_1/events/evt_1/tally');
// verify weighted tally
```

---

## 11. AWS Production Architecture

### 11.1 Progressive Deployment

The AWS architecture follows a progressive model. Start with the simplest deployment that works, add complexity only when actual usage demands it. This is not a system that needs to handle credit card transactions or real-time bidding — it's humans making governance decisions at human pace.

### 11.2 Stage 1: Single Instance (Launch)

For launch and early growth. Handles: a handful of Organizations, dozens of Assemblies, a few thousand participants. Estimated cost: $100–300/month.

```
                    ┌─────────────────┐
                    │   Route 53       │
                    │  api.votiverse.  │
                    │     org          │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Single EC2    │
                    │  (t3.medium)    │
                    │                 │
                    │  API server     │
                    │  + workers      │
                    │  + scheduler    │
                    │  (one process)  │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
         ┌─────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
         │ PostgreSQL  │ │  SQS   │ │    S3      │
         │ (RDS small) │ │ Queue  │ │  (assets)  │
         └────────────┘ └────────┘ └────────────┘
```

Everything runs on a single EC2 instance: the API server, the worker pool, and the scheduler — all in one Node.js process, exactly like local dev but with PostgreSQL and real SQS. This is possible because the traffic is low and the workloads are not latency-critical.

| Component | Sizing | Cost estimate |
|-----------|--------|---------------|
| EC2 | 1x t3.medium | ~$30/month |
| RDS PostgreSQL | db.t4g.small, single-AZ | ~$30/month |
| SQS | Standard queue + DLQ | ~$1/month |
| S3 | Single bucket | ~$5/month |
| Route 53 + TLS | Hosted zone + ACM cert | ~$1/month |
| Data transfer | Minimal | ~$5/month |

SQS is used even at this stage (rather than the in-memory queue) because it provides retry and dead-letter handling for free. The queue adapter swap from memory to SQS is a configuration change, not a code change.

### 11.3 Stage 2: Separated Workers (Growth)

When the single instance starts to feel constrained — typically because AI outcome gathering tasks or large awareness recomputations are competing with API responsiveness. Estimated cost: $200–500/month.

```
                    ┌─────────────────┐
                    │   Route 53       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   API EC2       │
                    │  (t3.medium)    │
                    │  + scheduler    │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
         ┌─────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
         │   RDS       │ │  SQS   │ │    S3      │
         └────────────┘ └───┬────┘ └────────────┘
                            │
                    ┌───────▼───────┐
                    │  Worker EC2   │
                    │  (t3.small)   │
                    └───────────────┘
```

The only change: workers move to a separate instance. The API server keeps the scheduler (lightweight) but offloads task processing. Same Docker image, different startup command.

### 11.4 Stage 3: Load-Balanced API (Scale)

When API traffic from multiple Client instances justifies horizontal scaling. This is the "moderate scale" target: 100+ Organizations, 500+ Assemblies, 50,000+ participants. Estimated cost: $500–1,500/month.

```
                    ┌─────────────────┐
                    │   Route 53       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      ALB        │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
         ┌─────▼─────┐ ┌───▼─────┐ ┌────▼─────┐
         │  API EC2   │ │ API EC2  │ │ API EC2  │
         └────────────┘ └─────────┘ └──────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
         ┌─────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
         │   RDS       │ │  SQS   │ │    S3      │
         │  Multi-AZ   │ │        │ │            │
         └────────────┘ └───┬────┘ └────────────┘
                            │
               ┌────────────┼────────────┐
               │            │            │
         ┌─────▼─────┐ ┌──▼──────┐ ┌───▼────────┐
         │  Worker    │ │ Worker  │ │  Worker    │
         └───────────┘ └─────────┘ └────────────┘

         ┌────────────┐
         │ EventBridge│ → scheduler Lambda
         └────────────┘
```

At this stage: ALB for load balancing and TLS termination, auto-scaling group for API servers (2–3 instances), multiple workers, RDS upgraded to Multi-AZ for availability, and EventBridge replaces the in-process scheduler with a Lambda that enqueues tasks.

### 11.5 Scaling Triggers

Don't scale preemptively. Scale in response to observed signals:

| Signal | Action |
|--------|--------|
| API response times regularly exceed 3–5 seconds | Move to Stage 2 (separate workers) |
| Multiple Client instances connecting | Move to Stage 3 (load-balanced API) |
| SQS queue depth regularly exceeds 50 | Add worker instances |
| RDS CPU regularly exceeds 70% | Upgrade instance size |
| Need for high availability (civic/institutional clients) | Enable RDS Multi-AZ |

### 11.6 Networking

- VPC with public and private subnets across 2+ availability zones.
- API servers in public subnets (behind ALB in Stage 3, direct in Stage 1–2).
- Workers and RDS in private subnets.
- NAT gateway for workers' outbound access (AI API calls, webhook delivery).
- Security groups restricting access between components.

### 11.7 Deployment

**Containerized.** Both API servers and workers run the same Docker image. The startup command determines the role:

```dockerfile
CMD ["node", "dist/main.js", "--role", "api"]      # API server mode
CMD ["node", "dist/main.js", "--role", "worker"]    # Worker mode
CMD ["node", "dist/main.js", "--role", "all"]       # Everything (Stage 1)
```

**CI/CD.** GitHub Actions builds the Docker image, pushes to ECR, and triggers deployment. In Stage 1, this is a simple restart. In Stage 3, it's a rolling deployment via ASG.

**Database migrations.** Run as a separate step before deployment: `vcp migrate` executes pending migrations against RDS. Migrations are forward-only, tested in staging first.

---

## 12. Monitoring and Operations

### 12.1 Health Checks

- **API:** `/health` endpoint returns 200 if the server can reach the database and the queue. ALB checks this every 30 seconds.
- **Workers:** Heartbeat to a health-check endpoint (or CloudWatch custom metric) every 60 seconds. Alert if a worker hasn't heartbeated in 3 minutes.
- **Database:** RDS automated monitoring (connections, CPU, storage, replication lag).
- **Queue:** CloudWatch metrics on queue depth, age of oldest message, DLQ count.

### 12.2 Logging

Structured JSON logs to CloudWatch Logs. Log fields: timestamp, level, service (api/worker/scheduler), assembly_id, request_id, event_type, duration_ms, error (if any).

### 12.3 Alerting

| Condition | Severity | Action |
|-----------|----------|--------|
| API error rate > 5% for 5 min | High | Page on-call |
| API latency p99 > 2s for 5 min | Medium | Notify Slack |
| Worker DLQ non-empty | Medium | Notify Slack |
| Worker heartbeat missing > 3 min | High | Page on-call |
| Database CPU > 80% for 10 min | Medium | Notify Slack |
| Queue depth > 500 for 10 min | Medium | Notify Slack, consider scaling workers |
| Webhook subscription degraded | Low | Notify admin |

### 12.4 Backup and Recovery

- **Database:** RDS automated daily snapshots with 7-day retention. Point-in-time recovery enabled.
- **Event store:** Because the event store is append-only, backup is straightforward. A daily pg_dump of the events table provides a portable backup. Since materialized views can be rebuilt from events, only the event store backup is critical.
- **Configuration:** Assembly configurations are immutable and stored in the database. They're included in the database backup. VCP configuration (environment variables, adapter settings) is managed in AWS Systems Manager Parameter Store.

---

## 13. Security

### 13.1 Data in Transit

- All external traffic over TLS 1.2+ (enforced at ALB).
- Internal traffic (API ↔ RDS, API ↔ SQS) over TLS within the VPC.
- Webhook deliveries over HTTPS with HMAC signature.

### 13.2 Data at Rest

- RDS encryption at rest (AWS KMS).
- S3 server-side encryption.
- SQS encryption at rest.

### 13.3 Secrets Management

- API keys, database credentials, AI provider keys, blockchain private keys stored in AWS Secrets Manager.
- Rotated on a schedule (90 days for API keys, per-provider policy for AI keys).
- Never logged, never included in error responses.

### 13.4 No PII in the Engine

The VCP stores `ParticipantId` values (opaque identifiers) but no personally identifiable information. Names, emails, and authentication credentials live in Client. If the VCP database were fully exposed, an attacker would see governance events (votes, delegations, poll responses) linked to opaque IDs — they would not know who those IDs represent without also compromising Client.

---

## 14. Open Questions

### 14.1 Database choice for event store
PostgreSQL with JSONB payloads is the current choice. DynamoDB would offer better write scaling and simpler operational management but worse query flexibility (awareness computations involve complex aggregations). The decision may be revisited if write volume exceeds PostgreSQL's comfortable range.

### 14.2 Worker specialization
The current design uses generalist workers. If AI outcome gathering tasks (which are slow and expensive) start starving faster tasks (webhook delivery), we may need separate queues with priority-based routing. This is an optimization, not a design change — the adapter interface supports multiple queues.

### 14.3 Real-time updates
The current architecture is request/response + webhooks. Some features (live vote tallies during an active event, real-time delegation chain updates) would benefit from WebSocket connections. Adding a WebSocket layer is straightforward (API servers maintain connections, engine events push updates) but adds operational complexity. Deferred until user experience demands it.

### 14.4 Multi-region
The current design is single-region. For global Assemblies with participants across continents, latency may be a concern. Multi-region deployment (read replicas in different regions, write routing to primary) is architecturally feasible but operationally complex. Deferred until geographic distribution of users justifies it.

### 14.5 Cost at scale
At Stage 1 (launch), the monthly AWS cost is minimal (~$100–300). At Stage 3 (moderate scale), it grows to $500–1,500. The primary variable cost driver is AI API calls for outcome gathering. The AI cost management strategy (Section 9.3) is critical for controlling this. Infrastructure costs (EC2, RDS) scale predictably with instance count.

---

*This document is a living draft and will evolve as the VCP moves from design to implementation.*
