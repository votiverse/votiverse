# Votiverse Cloud Platform (VCP)

The VCP is a Node.js server that imports the `@votiverse/engine` library and wraps it in production infrastructure — a REST API, SQLite database, task queue, and scheduled jobs. It turns the headless governance engine into a service that any client (web app, mobile app, CLI, bot) can drive over HTTP. For the full design rationale, see the [VCP Architecture](../../docs/vcp-architecture.md) and [Integration Architecture](../../docs/integration-architecture.md) docs.

---

## Quick Start

```bash
# Install dependencies (from monorepo root)
pnpm install && pnpm build

# Start the server
pnpm dev
# → http://localhost:3000

# Seed sample data (in a second terminal)
pnpm seed

# Reset to fresh seed data (wipes DB and re-seeds)
pnpm reset

# Run tests
pnpm test
```

### Sample Data

The seed script (`pnpm seed`) creates a rich, diverse dataset for UI/UX evaluation:

- **4 organizations, 5 assemblies** — each using a different governance preset (Town Hall, Liquid Standard, Civic Participatory, Liquid Accountable, Board Proxy)
- **63 participants** across all assemblies, with 4 cross-assembly participants (same name, different IDs) to test identity deduplication
- **13 voting events** in all lifecycle states: 4 closed, 5 voting, 2 deliberation, 2 upcoming
- **42 issues** with unique, realistic titles and descriptions
- **21 delegations** including depth-2 chains and override scenarios
- **155 pre-cast votes** with varied margins (landslides, tight races, quorum edge cases)
- **2 polls** with 16 responses across assemblies that have polling enabled

To reset the database to fresh seed data at any time, run `pnpm reset`. This wipes the SQLite database, starts the server, runs the seed script, and stops the server — one command to get back to a known state.

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VCP_PORT` | `3000` | HTTP server port |
| `VCP_DB_PATH` | `./vcp-dev.db` | SQLite database file path |
| `VCP_API_KEYS` | `vcp_dev_key_00000000` | API keys (JSON array or single key string) |
| `VCP_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

---

## API Endpoints

Every request (except `/health`) requires `Authorization: Bearer <key>`.

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |

### Assemblies

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies` | Create assembly (with preset name or full config) |
| `GET` | `/assemblies` | List all assemblies |
| `GET` | `/assemblies/:id` | Get assembly state and config |

### Participants

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/participants` | Add participant |
| `GET` | `/assemblies/:id/participants` | List participants |
| `DELETE` | `/assemblies/:id/participants/:pid` | Remove participant |

### Voting Events

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/events` | Create voting event with issues |
| `GET` | `/assemblies/:id/events` | List voting events |
| `GET` | `/assemblies/:id/events/:eid` | Get event status and details |

### Delegations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/delegations` | Create delegation |
| `GET` | `/assemblies/:id/delegations` | List delegations (optional `?sourceId=` filter) |
| `GET` | `/assemblies/:id/delegations/chain` | Resolve delegation chain (`?participantId=&issueId=`) |
| `DELETE` | `/assemblies/:id/delegations/:did` | Revoke delegation |

### Voting

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/votes` | Cast vote |
| `GET` | `/assemblies/:id/events/:eid/tally` | Weighted tally for all issues in an event |
| `GET` | `/assemblies/:id/events/:eid/weights` | Weight distribution per issue |

### Predictions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/predictions` | Commit prediction |
| `POST` | `/assemblies/:id/outcomes` | Record outcome data |
| `GET` | `/assemblies/:id/predictions/:pid/eval` | Evaluate prediction accuracy |
| `GET` | `/assemblies/:id/track-record/:pid` | Participant prediction track record |

### Polls

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assemblies/:id/polls` | Create poll |
| `GET` | `/assemblies/:id/polls` | List polls |
| `POST` | `/assemblies/:id/polls/:pid/respond` | Submit poll response |
| `GET` | `/assemblies/:id/polls/:pid/results` | Poll results |
| `GET` | `/assemblies/:id/trends/:topic` | Topic trend data |

### Awareness

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/assemblies/:id/awareness/concentration` | Concentration metrics (`?issueId=`) |
| `GET` | `/assemblies/:id/awareness/history/:pid` | Participant voting history |
| `GET` | `/assemblies/:id/awareness/profile/:pid` | Delegate profile |

### Stubbed (501 Not Implemented)

| Path | Description |
|------|-------------|
| `/assemblies/:id/integrity/*` | Integrity anchoring and verification |
| `/webhooks` | Webhook subscription management |
| `/assemblies/:id/awareness/context/:eid` | Historical context |
| `/assemblies/:id/awareness/prompts/:pid` | Engagement prompts |

---

## Architecture

The VCP follows the **adapter pattern** — every infrastructure dependency is behind an interface:

| Adapter | Phase 1 (local dev) | Production (future) |
|---------|-------|------------|
| Database | SQLite (better-sqlite3) | PostgreSQL |
| Queue | In-memory array | SQS |
| Scheduler | setInterval | EventBridge |
| Webhook | Console logging | HTTP delivery |
| Auth | Static API keys | OAuth/JWT |

Application code never references a specific technology directly. Swapping SQLite for PostgreSQL requires changing only the adapter construction in `main.ts` — zero changes to route handlers or engine integration.

The engine integration uses `SQLiteEventStore`, which implements the `@votiverse/core` EventStore interface over the VCP's database. Each assembly gets its own logically scoped event stream. Engine instances are cached per assembly and rehydrated from persisted events on first access.

For full details, see [VCP Phase 1 Report](../../docs/vcp-phase1-report.md).

---

## Links

- [Root README](../../README.md) — project overview and quick start
- [Integration Architecture](../../docs/integration-architecture.md) — API contract and multi-tenancy model
- [VCP Architecture](../../docs/vcp-architecture.md) — internal design, database schema, AWS deployment
