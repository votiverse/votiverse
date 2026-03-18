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
- **2 surveys** with 16 responses across assemblies that have surveys enabled

To reset the database to fresh seed data at any time, run `pnpm reset`. This wipes the SQLite database, starts the server, runs the seed script, and stops the server — one command to get back to a known state.

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VCP_PORT` | `3000` | HTTP server port |
| `VCP_DB_PATH` | `./vcp-dev.db` | SQLite database file path |
| `VCP_DATABASE_URL` | (none) | PostgreSQL connection URL. If set, PostgreSQL is used instead of SQLite. |
| `VCP_API_KEYS` | `vcp_dev_key_00000000` | API keys (JSON array, see below) |
| `VCP_JWT_SECRET` | (none) | JWT signing secret. Enables JWT auth for participants. |
| `VCP_JWT_EXPIRY` | `24h` | JWT token expiry duration |
| `VCP_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `VCP_CORS_ORIGINS` | `localhost:5173,5174` | Comma-separated CORS origins |
| `VCP_RATE_LIMIT_RPM` | `0` (disabled) | Requests per minute per client |
| `VCP_MAX_BODY_SIZE` | `1048576` (1MB) | Max request body size in bytes |

### API Key Configuration

`VCP_API_KEYS` accepts a JSON array of key objects:

```json
[{
  "key": "vcp_key_xxx",
  "clientId": "my-backend",
  "clientName": "My Backend",
  "assemblyAccess": "*",
  "scopes": ["participant", "operational"]
}]
```

- **`assemblyAccess`**: `"*"` for unrestricted access, or an array of assembly IDs. Default: `"*"`.
- **`scopes`**: `"participant"` allows governance actions (vote, delegate, survey). `"operational"` additionally allows admin writes (create participants, events, surveys, topics). Default: both.

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

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/assemblies/:id/participants` | operational | Add participant |
| `GET` | `/assemblies/:id/participants` | participant | List participants |
| `DELETE` | `/assemblies/:id/participants/:pid` | operational | Remove participant |

### Voting Events

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/assemblies/:id/events` | operational | Create voting event with issues |
| `GET` | `/assemblies/:id/events` | participant | List voting events |
| `GET` | `/assemblies/:id/events/:eid` | participant | Get event status and details |

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

### Surveys

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/assemblies/:id/surveys` | operational | Create survey |
| `GET` | `/assemblies/:id/surveys` | participant | List surveys |
| `POST` | `/assemblies/:id/surveys/:pid/respond` | participant | Submit survey response |
| `GET` | `/assemblies/:id/surveys/:pid/results` | participant | Survey results |
| `GET` | `/assemblies/:id/trends/:topic` | participant | Topic trend data |

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

| Adapter | Local dev | Production |
|---------|-----------|------------|
| Database | SQLite or PostgreSQL | PostgreSQL |
| Queue | In-memory array | SQS |
| Scheduler | setInterval | EventBridge |
| Webhook | Console logging | HTTP delivery |
| Auth | Static API keys (with assemblyAccess + scopes) | OAuth/JWT |

Application code never references a specific technology directly. Set `VCP_DATABASE_URL` to use PostgreSQL — zero changes to route handlers or engine integration.

**Access control.** Every assembly-scoped request passes through `requireAssemblyAccess()` middleware, which checks the client's `assemblyAccess` against the route's assembly ID. Admin write operations additionally require the `"operational"` scope via `requireScope()`. This is enforced at the middleware layer — individual route handlers don't need access control logic.

The engine integration uses `SQLiteEventStore`, which implements the `@votiverse/core` EventStore interface over the VCP's database. Each assembly gets its own logically scoped event stream. Engine instances are cached per assembly and rehydrated from persisted events on first access.

For full details, see [VCP Architecture](../../docs/vcp-architecture.md).

---

## Links

- [Root README](../../README.md) — project overview and quick start
- [Integration Architecture](../../docs/integration-architecture.md) — API contract and multi-tenancy model
- [VCP Architecture](../../docs/vcp-architecture.md) — internal design, database schema, AWS deployment
