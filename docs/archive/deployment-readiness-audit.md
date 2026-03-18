# Votiverse Deployment Readiness Audit

**Date:** 2026-03-16
**Auditor:** Claude (Opus 4.6)
**Scope:** Full-stack audit for production deployment + Tauri mobile readiness
**Prior audit:** `architecture-audit.md` (same date) — all critical/high issues resolved

---

## 1. Executive Summary

The system is a working MVP. The engine (12 packages, 319 tests, zero circular dependencies) is production-ready. The VCP server is architecturally sound but needs infrastructure hardening for production. The web client is well-built, mobile-responsive, and 85% ready for Tauri wrapping. Documentation is comprehensive but has gaps in operational procedures and deployment guides.

**Bottom line:** The codebase is ready for a deployment phase. The work ahead is infrastructure, not governance logic.

### What's solid

- **Engine packages:** All 12 compile, export cleanly, have complete type definitions, and are npm-publishable. No circular dependencies. 319 passing tests. Architecture audit remediation is complete.
- **Privacy architecture:** PII removed from VCP. Identity owned by client. VCP database holds only opaque participant IDs.
- **Sovereignty enforcement:** All write endpoints (votes, polls, predictions, delegations) validate caller identity via `requireParticipant` middleware.
- **Web client UX:** Mobile-first responsive design. Bottom tabs on mobile, header nav on desktop. Touch targets ≥44px. Safe-area padding for notched devices. iOS zoom prevention. Brand theming via CSS custom properties.
- **Materialization:** Lazy, idempotent materialization of tallies, weights, concentration, and participation for closed events. O(1) reads after first computation.

### What needs work for production

| Category | Severity | Summary |
|----------|----------|---------|
| Authentication | **Blocker** | Static API keys + untrusted `X-Participant-Id` header. Need JWT/OAuth2. |
| Database | **Blocker** | SQLite can't handle concurrent writes or scale horizontally. Need PostgreSQL. |
| API configuration | **High** | Hardcoded API key and base URL in web client. No env var support. |
| Logging | **High** | Console.log only. Need structured JSON logging. |
| Rate limiting | **High** | No rate limiting on any endpoint. |
| Identity system | **High** | Static `identity.json` is dev-only. Need real auth flow. |
| Documentation | **Medium** | Missing deployment guide, operations runbook, environment config reference. |
| Testing (web) | **Medium** | Zero tests in web client. |
| Monitoring | **Medium** | No metrics, tracing, or alerting. |

---

## 1.1 Implementation Status Update

The action plan from Section 6 has been executed. Current status:

| Phase | Scope | Status | Notes |
|-------|-------|--------|-------|
| **Phase A: Configuration** | Env vars, fail-fast, logging, dead code cleanup, outcomes auth | **COMPLETED** | `VITE_API_BASE_URL` supported; `resolveId()` removed; `POST /outcomes` requires operational scope |
| **Phase B: PostgreSQL** | Async `DatabaseAdapter`, `ON CONFLICT` SQL, PostgreSQL adapter | **COMPLETED** | Connection pooling, `AsyncLocalStorage`, JSONB auto-parsing fix |
| **Phase C: JWT Auth** | JWT authentication, identity resolution | **COMPLETED** | Implemented in client backend (`platform/backend/`), not in VCP directly. Backend authenticates users and injects participant identity into VCP requests. |
| **Phase D: Operational Hardening** | Rate limiting, request IDs, body size limits, pagination, health, metrics | **COMPLETED** | Token-bucket rate limiter; `X-Request-Id` middleware; limit/offset on 6 endpoints; `GET /metrics` |
| **Client Backend** | User auth service, VCP proxy, membership mapping | **IMPLEMENTED** | New `platform/backend/` service (Hono, SQLite, port 4000). Argon2 + JWT + refresh token rotation. 59 seeded users. |
| **Web Client Migration** | Login form, backend proxy, remove static identity | **COMPLETED** | Removed `identity-store.ts`, `VITE_API_KEY`, client-side `X-Participant-Id` injection. Login replaces identity picker. |

**Remaining items from the original audit:**
- Phase E (Tauri Mobile Apps): Not started
- Phase F (Documentation): Partially addressed
- Background materialization: Still runs in request path
- Cache eviction / LRU for engine instances: Not implemented
- Web client tests: Still zero

---

## 2. Engine Packages

**Status: Production-ready.**

### Build & Distribution

All 12 packages compile to ESM with TypeScript declarations and source maps. Configuration is consistent across packages (tsup, vitest, eslint, prettier). Zero production dependencies except `commander` in CLI.

### Test Coverage

| Package | Tests | Focus |
|---------|-------|-------|
| core | 64 | Event store, Result type, errors, utilities |
| config | 50 | Presets, validation, diffing, derivation |
| identity | 18 | Invitation provider |
| delegation | 33 | Graph construction, weights, cycles, sovereignty |
| voting | 28 | Ballot methods, multi-option, tally, quorum |
| prediction | 44 | Commitment hashing, evaluation, track records |
| polling | 17 | Aggregation, non-delegability |
| awareness | 11 | Concentration, alerting, profiles |
| integrity | 18 | Commitment, anchoring, verification |
| engine | 9 | Cross-package orchestration |
| cli | 5 | End-to-end CLI |
| simulate | 22 | Rule-based simulation framework |

### Minor remaining items

1. **Engine doesn't re-export AwarenessService or IntegrityService** — one-line fix in `packages/engine/src/index.ts`, low priority.
2. **Outcome source credibility weighting** — deferred design item in prediction evaluation. Documented with TODO comments. No blocker.

---

## 3. VCP Server

**Status: Development-ready. Needs hardening for production.**

### 3.1 Endpoint Inventory

**31 endpoints total** (26 implemented, 5 stubbed as 501).

#### Assembly & Participants
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | None | DB connectivity check |
| POST | `/assemblies` | API key | Create assembly |
| GET | `/assemblies` | API key | List all (no pagination) |
| GET | `/assemblies/:id` | API key | Assembly details |
| POST | `/assemblies/:id/participants` | API key | Add participant |
| GET | `/assemblies/:id/participants` | API key | List participants |
| DELETE | `/assemblies/:id/participants/:pid` | API key | Remove participant |
| PATCH | `/assemblies/:id/participants/:pid/status` | API key | Change status |

#### Voting Events
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/assemblies/:id/events` | API key | Create event |
| GET | `/assemblies/:id/events` | API key | List events (no pagination) |
| GET | `/assemblies/:id/events/:eid` | API key | Event with computed status |

#### Voting
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/assemblies/:id/votes` | X-Participant-Id | Sovereignty enforced |
| GET | `/assemblies/:id/events/:eid/tally` | API key | Materialized for closed events |
| GET | `/assemblies/:id/events/:eid/participation` | API key | Secrecy-filtered |
| GET | `/assemblies/:id/events/:eid/weights` | API key | Forbidden under secret ballot |

#### Delegations
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/assemblies/:id/delegations` | X-Participant-Id | Sovereignty enforced |
| DELETE | `/assemblies/:id/delegations/:did` | X-Participant-Id | Only delegator can revoke |
| GET | `/assemblies/:id/delegations` | API key | Visibility-filtered |
| GET | `/assemblies/:id/delegations/chain` | API key | Chain resolution |
| GET | `/assemblies/:id/delegations/my-weight` | X-Participant-Id | Delegation weight |

#### Polls
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/assemblies/:id/polls` | API key | Create poll |
| GET | `/assemblies/:id/polls` | API key | List polls |
| POST | `/assemblies/:id/polls/:pid/respond` | X-Participant-Id | Sovereignty enforced, non-delegable |
| GET | `/assemblies/:id/polls/:pid/results` | API key | Aggregated results |
| GET | `/assemblies/:id/trends/:topic` | API key | Topic trends |

#### Predictions
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/assemblies/:id/predictions` | X-Participant-Id | Sovereignty enforced |
| GET | `/assemblies/:id/predictions` | API key | Requires participantId query |
| POST | `/assemblies/:id/outcomes` | API key | **No participant auth** (design gap) |
| GET | `/assemblies/:id/predictions/:pid/eval` | API key | Accuracy evaluation |
| GET | `/assemblies/:id/track-record/:pid` | API key | Track record |

#### Awareness
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/assemblies/:id/awareness/concentration` | API key | Materialized for closed |
| GET | `/assemblies/:id/awareness/history/:pid` | API key | Secrecy-filtered |
| GET | `/assemblies/:id/awareness/profile/:pid` | API key | Visibility-filtered |

#### Topics
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/assemblies/:id/topics` | API key | Hierarchical taxonomy |
| POST | `/assemblies/:id/topics` | API key | Create topic |

#### Stubs (501)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/assemblies/:id/integrity/commit` | Blockchain anchoring |
| GET | `/assemblies/:id/integrity/verify/:cid` | Verify commitment |
| POST | `/webhooks` | Register webhook |
| GET | `/webhooks` | List webhooks |
| DELETE | `/webhooks/:id` | Delete webhook |

### 3.2 Database

SQLite with WAL mode. 13 tables:

| Table | Purpose | Production concern |
|-------|---------|-------------------|
| `events` | Append-only event log | Unbounded growth; no retention/archival |
| `assemblies` | Assembly registry | Fine |
| `clients` | API keys | Fine |
| `participants` | Assembly members | Fine |
| `issues` | Voting issue metadata | Fine |
| `topics` | Topic taxonomy | Fine |
| `webhook_subscriptions` | Stub (unused) | Dead table |
| `issue_participation` | Materialized participation | One row per participant per issue |
| `issue_tallies` | Materialized tallies | One row per issue |
| `issue_weights` | Materialized weights | One row per issue |
| `issue_concentration` | Materialized concentration | One row per issue |

**SQLite limitations for production:**
- Single writer at a time (WAL helps readers but writes serialize)
- No clustering, replication, or horizontal scaling
- Sequence number generation via trigger uses `MAX()` scan — O(n) worst case
- No backup strategy; database files are ephemeral
- File-based — no network access, no connection pooling

**Recommendation:** PostgreSQL adapter is the critical-path production item.

### 3.3 In-Memory State

The `AssemblyManager` caches one `VotiverseEngine` instance per assembly in a `Map`. This means:
- **Server restart clears all cached engines** — events are persisted, state is rebuilt from events on next access (correct by design)
- **No cache size limits** — could load thousands of assemblies into memory
- **No distributed cache** — can't run multiple VCP instances sharing state
- **Materialization runs in the request path** — first query for a closed event's tally triggers computation + DB write

### 3.4 Configuration

| Env var | Default | Issue |
|---------|---------|-------|
| `VCP_PORT` | 3000 | Fine |
| `VCP_DB_PATH` | ./vcp-dev.db | Relative path; prod needs absolute |
| `VCP_API_KEYS` | `vcp_dev_key_00000000` | Dev key hardcoded; must override |
| `VCP_LOG_LEVEL` | info | Parsed but **not actually used** |
| `VCP_CORS_ORIGINS` | localhost:5173, 5174 | Must override for production |

### 3.5 Security Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Static API keys, no rotation/expiry | High | Need JWT or key management |
| `X-Participant-Id` header trusted as-is | High | Anyone with API key can impersonate |
| `POST /outcomes` has no participant auth | Medium | Outcomes can be manipulated |
| No rate limiting | Medium | DoS risk |
| No request size limits | Medium | Memory pressure from large payloads |
| No audit logging | Medium | Can't trace who changed what |
| Console.log logging, no redaction | Medium | Sensitive data could leak |
| `resolveId()` is now a no-op pass-through | Low | Dead code; 10+ callsites invoke it |

### 3.6 Missing for Production

**Blockers:**
- [ ] PostgreSQL adapter
- [ ] JWT/OAuth2 authentication
- [ ] Structured logging (JSON output)
- [ ] CORS fail-fast when `VCP_CORS_ORIGINS` not set in production

**High priority:**
- [ ] Rate limiting per API key
- [ ] Request size limits
- [ ] Pagination on list endpoints (assemblies, participants, delegations, polls)
- [ ] Background materialization (move off request path)
- [ ] Cache eviction / LRU for engine instances
- [ ] Audit logging for sensitive operations
- [ ] Health check expanded (queue, scheduler, engine health)

**Medium priority:**
- [ ] Request validation with Zod/Typebox schemas
- [ ] OpenAPI spec generation
- [ ] Response compression (gzip)
- [ ] Cache-Control / ETag headers for immutable data
- [ ] Topic parent validation
- [ ] Poll response validation against question options
- [ ] Distributed tracing (request IDs)

---

## 4. Web Client

**Status: Well-built SPA. Needs configuration changes for deployment and Tauri.**

### 4.1 Architecture

- React 19 + React Router v7 + Tailwind v4 + Vite 8
- 13 pages, 7 hooks, 8 UI components
- ~5,000 LOC (TypeScript + TSX)
- Bundle: ~150-200 KB gzipped (excellent)
- Only external runtime deps: react, react-dom, react-router, lucide-react

### 4.2 Hardcoded Values

| Value | Location | Issue |
|-------|----------|-------|
| `BASE_URL = "/api"` | `src/api/client.ts` | Relies on Vite dev proxy; no env var |
| `API_KEY = "vcp_dev_key_00000000"` | `src/api/client.ts` | Dev key in source code |
| Proxy target `localhost:3000` | `vite.config.ts` | Dev-only; gone in production build |

**Fix:** Add `VITE_API_BASE_URL` and `VITE_API_KEY` environment variables. Create `.env.example`.

### 4.3 Identity System

Currently uses `identity.json` (generated by seed script) + localStorage. This is a dev-mode system:
- No authentication
- No session management
- No token expiry
- Anyone can select any identity

**For production:** Replace with OAuth2/OIDC flow. The `useIdentity` hook and `X-Participant-Id` plumbing are correct — only the identity source needs to change.

### 4.4 Mobile Responsiveness

Excellent. Already implemented:
- Bottom tab bar on mobile (`lg:hidden`)
- Header nav on desktop (`hidden lg:flex`)
- Touch targets ≥44px with `min-h-[44px]`/`min-h-[52px]`
- Safe-area padding: `env(safe-area-inset-bottom)`
- iOS zoom prevention: `font-size: 16px !important` on inputs
- Single-column layout on mobile, grid on desktop

### 4.5 Tauri Compatibility

**Browser APIs used — all available in Tauri WebView:**
- `fetch()` — works
- `localStorage` — works
- `window.history` — works
- `document.visibilityState` — works
- `StorageEvent` (cross-tab sync) — works

**No problematic APIs:** No WebWorkers, Service Workers, IndexedDB, camera, geolocation, WebSocket.

**Required changes for Tauri:**

1. **API base URL must be configurable** — Tauri can't use Vite dev proxy. Need `VITE_API_BASE_URL` env var or runtime config.
2. **CORS** — VCP must allow Tauri's origin (or Tauri uses IPC bridge for same-process communication).
3. **Identity flow** — Static `identity.json` won't work in production. Tauri can use secure storage API instead of localStorage.

### 4.6 Missing

- [ ] **Zero tests** — No unit, component, or E2E tests
- [ ] **No env var support** — API URL and key hardcoded
- [ ] **No `.env.example`** — No documentation of expected env vars
- [ ] **No error retry logic** — Network failures are terminal
- [ ] **No offline detection** — No fallback UI
- [ ] **No code splitting** — Single bundle (acceptable for current size)
- [ ] **Accessibility audit** — Need to verify WCAG AA contrast for brand blue (#185FA5)

---

## 5. Documentation

### 5.1 Inventory

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/architecture.md` | Canonical technical reference | Current |
| `docs/whitepaper.md` | Governance model, formal properties | Current |
| `docs/integration-architecture.md` | API contract, multi-tenancy | **Missing 11 endpoints** |
| `docs/vcp-architecture.md` | VCP internals, DB schema, AWS deployment | Aspirational materialization tables |
| `docs/product-workflow.md` | Entity model, UX workflows | Current |
| `docs/terminology-ux-guide.md` | UX terminology corrections | Current |
| `docs/architecture-audit.md` | Prior audit + remediation status | Current |
| `docs/phase{2-6}-report.md` | Phase implementation reports | Current |
| `CHANGELOG.md` | Per-phase changes | Current |
| `platform/web/TESTING.md` | Test identities, seeded data | Current |

### 5.2 Gaps

**Missing documentation needed for deployment:**

1. **Deployment guide** — How to deploy VCP + web client. Environment setup, reverse proxy config, database provisioning, SSL.
2. **Operations runbook** — Database migration, materialized view recovery, backup/restore, monitoring playbooks.
3. **Environment configuration reference** — All env vars with descriptions, required vs optional, production defaults.
4. **Security documentation** — Authentication architecture, API key management, CORS policy, trust boundaries.

**Missing documentation for Tauri:**

5. **Tauri integration guide** — Project setup, build configuration, API connectivity, identity flow, platform-specific considerations.
6. **Offline-first architecture** — Client-side event queue, conflict resolution, sync strategy (if applicable).

**Documentation debt:**

7. **integration-architecture.md Section 5.2** — 11 implemented endpoints not documented (carried from prior audit as R7).
8. **vcp-architecture.md Section 5** — Lists aspirational materialized views that don't exist as described. The actual materialized tables (`issue_tallies`, `issue_weights`, `issue_concentration`, `issue_participation`) are different.

### 5.3 Cross-Document Consistency

Generally good. All documents consistently use:
- "Assembly" (not "organization" or "group")
- "VotingEvent" internally, "vote" in UX
- "Poll" internally, "survey" in UX
- "ParticipantId" (opaque, per-assembly)
- Six named presets with consistent descriptions

**No stale references to removed features** (users table, /users API, X-User-Id header) in non-audit documents.

---

## 6. Prioritized Action Plan

### Phase A: Configuration & Deployment Prep (1-2 days)

These changes are minimal-code and unblock everything else:

1. **Web client env vars** — Add `VITE_API_BASE_URL` and `VITE_API_KEY` support in `client.ts`. Create `.env.example`. Remove hardcoded dev values.
2. **VCP fail-fast** — If `NODE_ENV=production` and `VCP_CORS_ORIGINS` is not set, refuse to start.
3. **VCP log level** — Wire `VCP_LOG_LEVEL` to actually control logging output.
4. **Clean up `resolveId()`** — Remove the no-op method and update 10+ callsites to use the ID directly.
5. **Add `POST /outcomes` auth** — Require operational scope on the outcome recording endpoint.

### Phase B: PostgreSQL Adapter (1 week)

The SQLite adapter implements a clean interface. Build a PostgreSQL adapter implementing the same interface:
- Connection pooling (pg-pool)
- Proper sequence generation (PostgreSQL sequences, not MAX() triggers)
- Same schema with PostgreSQL types
- Run all 55 VCP tests against PostgreSQL
- Add `VCP_DATABASE_URL` env var

### Phase C: Authentication (1 week)

Replace static API keys + untrusted headers:
- JWT token issuance and validation
- `X-Participant-Id` derived from JWT claims (not trusted from header)
- Token refresh flow
- Web client OAuth2/OIDC integration (replace `identity.json`)
- Tauri secure storage for tokens

### Phase D: Operational Hardening (1 week)

- Structured JSON logging with log levels
- Rate limiting middleware (per-key)
- Request size limits
- Pagination on list endpoints
- Background materialization job (off request path)
- Health check expansion
- Basic metrics (request count, latency, error rate)

### Phase E: Tauri Mobile Apps (parallel with B-D)

- Initialize Tauri project wrapping `platform/web`
- Configure `tauri.conf.json` for dev and production
- API connectivity (direct HTTP to VCP, not proxy)
- Test on iOS and Android
- Handle deep links, safe areas, platform permissions

### Phase F: Documentation (parallel with B-D)

- Write deployment guide
- Write environment configuration reference
- Update `integration-architecture.md` with all 31 endpoints
- Update `vcp-architecture.md` schema section with actual tables
- Write Tauri integration guide

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite write contention under load | High | Service degradation | Phase B: PostgreSQL |
| Identity impersonation via header | High | Security breach | Phase C: JWT auth |
| Memory exhaustion from engine cache | Medium | Server crash | Phase D: LRU eviction |
| Materialization timeout on first query | Medium | Slow response | Phase D: Background job |
| Tauri WebView differences across platforms | Medium | UI bugs | Phase E: Platform testing |
| Env var misconfiguration in production | Medium | Broken deployment | Phase A: Fail-fast validation |

---

## 8. What's Ready Today

For a **demo/evaluation deployment** (not production):

1. Build engine: `pnpm --filter '@votiverse/*' build`
2. Seed VCP: `cd platform/vcp && pnpm reset`
3. Start VCP: `cd platform/vcp && pnpm dev`
4. Build web: `cd platform/web && pnpm build`
5. Serve `platform/web/dist/` behind nginx with `/api` proxied to VCP port 3000
6. Select identity from picker, use the system

This works with SQLite and static identity for evaluation. Not suitable for multiple concurrent users or untrusted networks.
