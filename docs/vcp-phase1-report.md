# VCP Phase 1 — Implementation Report

**Date:** 2026-03-14
**Status:** Complete — 16 integration tests passing

---

## What was built

A single-process Node.js governance service that imports `@votiverse/engine` as a library and wraps it in production-ready infrastructure. The VCP runs API server, workers, and scheduler in one process, using SQLite for persistence and in-memory adapters for queue/scheduler.

### Architecture

```
platform/vcp/
├── src/
│   ├── adapters/           # Infrastructure abstractions
│   │   ├── auth/           # API key validation
│   │   ├── database/       # SQLite (better-sqlite3)
│   │   ├── queue/          # In-memory task queue
│   │   ├── scheduler/      # setInterval-based scheduler
│   │   └── webhook/        # Console logging
│   ├── api/
│   │   ├── middleware/     # Auth + error handling
│   │   └── routes/         # REST endpoint handlers
│   ├── engine/
│   │   ├── assembly-manager.ts    # Engine instance lifecycle
│   │   └── sqlite-event-store.ts  # EventStore over SQLite
│   ├── config/             # VCP configuration
│   └── main.ts             # Entry point
├── test/                   # Integration tests
├── scripts/
│   └── seed.ts             # Sample data population
├── package.json
└── tsconfig.json
```

### Technology choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| HTTP framework | **Hono** | TypeScript-native, lightweight, fast, excellent middleware support. Works standalone or in containers. |
| Database | **better-sqlite3** | Synchronous API (simpler adapter), fastest SQLite binding for Node.js, WAL mode for concurrent reads. |
| Task runner | **tsx** | Direct TypeScript execution for `pnpm dev` and `pnpm seed` without a build step. |

### Adapter pattern

Every infrastructure dependency is behind an interface. For Phase 1, only local/simple adapters are implemented:

| Adapter | Interface | Phase 1 Implementation |
|---------|-----------|----------------------|
| Database | `DatabaseAdapter` | `SQLiteAdapter` — better-sqlite3 with WAL mode |
| Queue | `QueueAdapter` | `MemoryQueueAdapter` — in-memory array with setInterval processing |
| Scheduler | `SchedulerAdapter` | `LocalSchedulerAdapter` — setInterval-based |
| Webhook | `WebhookAdapter` | `ConsoleWebhookAdapter` — logs to stdout |
| Auth | `AuthAdapter` | `SimpleAuthAdapter` — static key lookup + optional DB check |

The adapter interfaces are defined but PostgreSQL, SQS, EventBridge, SES, S3, and blockchain adapters are NOT implemented. Swapping SQLite for PostgreSQL requires zero changes to application code — only the adapter construction in `main.ts` changes.

---

## Engine integration

### SQLiteEventStore

The engine's `EventStore` interface is implemented by `SQLiteEventStore`, which persists events to the VCP's SQLite database scoped by `assembly_id`. Each Assembly gets its own logically isolated event stream.

The engine was **not modified** for VCP integration. The existing `EventStore` interface from `@votiverse/core` was sufficient. The VCP creates an `SQLiteEventStore` per Assembly and passes it to the engine constructor.

### AssemblyManager

Manages engine instances per Assembly with caching:

1. First request for an Assembly creates a `SQLiteEventStore`, `InvitationProvider`, and `VotiverseEngine`
2. Rehydrates all three from persisted events
3. Injects persisted issue details (stored in a separate `issues` table)
4. Caches the engine instance for subsequent requests
5. The cached engine stays consistent because all mutations go through its API

### Issue persistence

The engine's `VotingEventCreated` event stores issue IDs but not issue details (title, description, topicIds). During rehydration, the engine creates stub issues with empty fields. The VCP stores issue details in a separate `issues` table and injects them after rehydration — the same pattern the CLI uses with its JSON state file.

---

## API endpoints

### Fully implemented (with tests)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth required) |
| `POST` | `/assemblies` | Create assembly (with preset name or full config) |
| `GET` | `/assemblies/:id` | Get assembly state and config |
| `POST` | `/assemblies/:id/participants` | Add participant |
| `GET` | `/assemblies/:id/participants` | List participants |
| `DELETE` | `/assemblies/:id/participants/:pid` | Remove participant |
| `POST` | `/assemblies/:id/events` | Create voting event with issues |
| `GET` | `/assemblies/:id/events` | List voting events |
| `GET` | `/assemblies/:id/events/:eid` | Get event status (includes computed status) |
| `POST` | `/assemblies/:id/delegations` | Create delegation |
| `DELETE` | `/assemblies/:id/delegations/:did` | Revoke delegation |
| `GET` | `/assemblies/:id/delegations` | List delegations (optional sourceId filter) |
| `GET` | `/assemblies/:id/delegations/chain` | Resolve delegation chain |
| `POST` | `/assemblies/:id/votes` | Cast vote |
| `GET` | `/assemblies/:id/events/:eid/tally` | Get tally results for all issues |
| `GET` | `/assemblies/:id/events/:eid/weights` | Get weight distribution |

### Implemented (should-have tier)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/predictions` | Commit prediction |
| `POST` | `/assemblies/:id/outcomes` | Record outcome |
| `GET` | `/assemblies/:id/predictions/:pid/eval` | Evaluate prediction |
| `GET` | `/assemblies/:id/track-record/:pid` | Participant track record |
| `POST` | `/assemblies/:id/polls` | Create poll |
| `POST` | `/assemblies/:id/polls/:pid/respond` | Submit poll response |
| `GET` | `/assemblies/:id/polls/:pid/results` | Poll results |
| `GET` | `/assemblies/:id/trends/:topic` | Topic trend data |
| `GET` | `/assemblies/:id/awareness/concentration` | Concentration metrics |
| `GET` | `/assemblies/:id/awareness/history/:pid` | Voting history |
| `GET` | `/assemblies/:id/awareness/profile/:pid` | Delegate profile |

### Stubbed (501 Not Implemented)

- `POST /assemblies/:id/integrity/commit`
- `GET /assemblies/:id/integrity/verify/:cid`
- `POST /webhooks`
- `GET /webhooks`
- `DELETE /webhooks/:id`
- `GET /assemblies/:id/awareness/context/:eid`
- `GET /assemblies/:id/awareness/prompts/:pid`

### Request/response examples

**Create assembly:**
```bash
curl -X POST http://localhost:3000/assemblies \
  -H "Authorization: Bearer vcp_dev_key_00000000" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Assembly", "preset": "LIQUID_STANDARD"}'
```
```json
{
  "id": "uuid",
  "organizationId": null,
  "name": "My Assembly",
  "config": { ... },
  "status": "active",
  "createdAt": "2026-03-14T..."
}
```

**Cast vote:**
```bash
curl -X POST http://localhost:3000/assemblies/{id}/votes \
  -H "Authorization: Bearer vcp_dev_key_00000000" \
  -H "Content-Type: application/json" \
  -d '{"participantId": "...", "issueId": "...", "choice": "for"}'
```

**Get tally:**
```bash
curl http://localhost:3000/assemblies/{id}/events/{eid}/tally \
  -H "Authorization: Bearer vcp_dev_key_00000000"
```
```json
{
  "eventId": "...",
  "tallies": [{
    "issueId": "...",
    "winner": "for",
    "counts": { "for": 4, "against": 1 },
    "totalVotes": 5,
    "quorumMet": true,
    "quorumThreshold": 0.1,
    "eligibleCount": 5,
    "participatingCount": 5
  }]
}
```

### Error format

All errors follow a consistent structure:
```json
{
  "error": {
    "code": "ASSEMBLY_NOT_FOUND",
    "message": "Assembly \"abc\" not found"
  }
}
```

Error codes: `UNAUTHORIZED`, `VALIDATION_ERROR`, `ASSEMBLY_NOT_FOUND`, `NOT_FOUND`, `CONFLICT`, `GOVERNANCE_RULE_VIOLATION`, `ENGINE_ERROR`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`.

---

## Authentication

Simple API key scheme via `Authorization: Bearer <key>` header.

- Default dev key: `vcp_dev_key_00000000`
- Keys are configurable via `VCP_API_KEYS` environment variable (JSON array or single key)
- The auth middleware is replaceable via the `AuthAdapter` interface
- `/health` endpoint is exempt from auth

---

## Database schema

SQLite adaptation of the PostgreSQL schema from vcp-architecture.md Section 5:

- `events` — append-only event log with assembly scoping and auto-incrementing sequence numbers
- `assemblies` — assembly registry with governance config
- `clients` — API key registry (hashed keys)
- `participants` — per-assembly participant records
- `issues` — issue details (stored separately from events)
- `webhook_subscriptions` — webhook registration (for future use)

Key adaptations for SQLite: UUID→TEXT, JSONB→TEXT, TIMESTAMPTZ→TEXT (ISO 8601), arrays→JSON text, BIGSERIAL→INTEGER with trigger-based auto-increment.

---

## Testing

16 integration tests across 3 test files:

**lifecycle.test.ts** (4 tests):
- Health check
- Complete governance lifecycle (create assembly → participants → event → delegations → votes → tally)
- Sovereignty/override rule verification through HTTP API
- One-person-one-vote with multiple delegation chains

**multi-tenancy.test.ts** (2 tests):
- Assembly isolation (participants, events)
- Independent tallies across assemblies

**error-handling.test.ts** (10 tests):
- Missing/invalid auth
- Non-existent assembly (404)
- Missing required fields (400)
- Invalid preset name (400)
- Non-existent voting event (404)
- Stub endpoints (501)
- Duplicate participant (409)
- Non-existent participant deletion (404)
- Health check without auth

All tests use in-memory SQLite (`:memory:`) for isolation and speed.

---

## How to run

```bash
# From platform/vcp/
pnpm dev          # Start on localhost:3000
pnpm seed         # Populate sample data (server must be running)
pnpm test         # Run integration tests

# Environment variables
VCP_PORT=3000              # Server port
VCP_DB_PATH=./vcp-dev.db   # SQLite database path
VCP_API_KEYS=...           # API keys (JSON array or single key)
VCP_LOG_LEVEL=info         # Log level
```

---

## What's deferred

- PostgreSQL adapter
- SQS/EventBridge adapters
- Real webhook delivery (currently console logging)
- AI integration for outcome gathering
- Blockchain integrity anchoring
- Rate limiting middleware
- Webhook subscription management (CRUD endpoints)
- Engagement prompts and historical context endpoints
- API versioning (`/v1/` prefix)
- Admin UI for dev mode
- Docker containerization
