# CLAUDE.md — Instructions for Claude Code

This file is the primary reference for AI-assisted development on Votiverse. Read it at the start of every session and after every context compaction event.

---

## Project Summary

Votiverse is a configurable governance engine — a headless TypeScript library that implements democratic decision-making with delegation, prediction tracking, participant surveys, and a governance awareness layer. The core engine is consumed by CLI tools and by the web platform.

The repository has three layers:
- **`packages/`** — the engine: pure TypeScript library packages (`@votiverse/core`, `@votiverse/config`, `@votiverse/delegation`, `@votiverse/content`, etc.). Pure computation — no HTTP, no infrastructure.
- **`platform/vcp/`** — the Votiverse Cloud Platform: a governance-as-a-service HTTP API that wraps the engine. Stores governance metadata and events. Holds no PII, no rich content. Can serve multiple client backends.
- **`platform/backend/`** — the client backend: owns user identity (JWT auth), rich content (proposal documents, candidacy profiles, community notes, assets), and proxies governance requests to the VCP with identity injection.
- **`platform/web/`** — the React web UI: communicates exclusively with the backend, never with the VCP directly.

**Read these documents for full context:**
- `docs/architecture.md` — engine internals: package specs, dependency graph, data model
- `docs/integration-architecture.md` — 3-tier system architecture, VCP/backend boundary, API contract
- `docs/papers/paper-i-whitepaper.md` — governance model, formal properties, design rationale
- `docs/papers/paper-ii-self-sustaining-governance.md` — proposals, candidacies, community notes, self-sustaining governance
- `docs/design/content-architecture.md` — design for proposals, candidacies, community notes, asset storage
- `docs/design/onboarding-invitations-handles.md` — handles, invite links, direct invitations, signup flow
- `docs/design/admission-control.md` — admission modes (open/approval/invite-only), Sybil resistance, join requests
- `docs/testing.md` — comprehensive testing guide: seed data, dev clock, unit tests, integration tests, manual scenarios
- `platform/web/TESTING.md` — test identities, assembly-by-feature matrix, delegation graphs, seeded data reference

---

## Session Start

**In dev, the VCP resolves engine imports from TypeScript source** — not from compiled `dist/`. This is done via the `"source"` export condition in each engine package's `package.json`, activated by `--conditions source` in the VCP's dev/seed/reset scripts and `resolve.conditions` in `vitest.config.ts`. You do **not** need to rebuild `dist/` for local development.

If you are preparing a **production build or CI run**, ensure dist is current:

```bash
./scripts/check-dist.sh --rebuild
```

---

## After Context Compaction

When context is compacted, you lose architectural reasoning. Before resuming any work:

1. Re-read this file (`CLAUDE.md`)
2. Re-read `docs/architecture.md`
3. Re-read the `README.md` of the package you are currently working on
4. Re-read the existing tests for that package
5. If working on the web UI, re-read `platform/web/TESTING.md`
6. Only then resume implementation

This is not optional. Skipping this step leads to architectural drift that is expensive to fix.

---

## Architectural Decisions — Do Not Revisit

These decisions are final. Do not reconsider them without explicit instruction from the project owner.

- **Event sourcing.** All state changes are recorded as an append-only sequence of immutable events. Current state is derived by replaying events. There is no mutable state store.
- **Delegation graphs are computed fresh** from the event log for each issue. They are not maintained as mutable state. This ensures temporal queries work correctly and the override rule is always applied against current state.
- **The awareness package is read-only.** It queries state produced by other packages. It never modifies engine state. It never writes events.
- **Surveys are non-delegable.** This is a hard architectural constraint, not a configuration option. Survey responses cannot be transferred or delegated under any configuration.
- **Predictions are immutable once committed.** The commitment hash prevents retroactive editing. Outcome data can be updated (new events), but the original prediction is never modified.
- **The engine exposes a programmatic TypeScript API, not HTTP.** An HTTP layer is a consumer concern built on top of the engine.
- **Configuration is data.** Governance rules come from `GovernanceConfig` objects. The engine interprets configs — it never hard-codes governance logic.
- **No circular dependencies between packages.** Dependencies flow strictly downward. See the dependency graph in `docs/architecture.md`.
- **Time is injectable via TimeProvider.** All time-dependent operations (vote acceptance, event status, survey windows, delegation maxAge) use a `TimeProvider` interface from `@votiverse/core`. Default is `systemTime` (real clock). Tests use `TestClock` which can be advanced programmatically. The VCP exposes dev-only `/dev/clock` endpoints for Stripe-style test clock control. Never use `Date.now()` directly in engine or VCP code — use `timeProvider.now()`.
- **Voting windows are enforced by the engine.** The engine's `voting.cast()` rejects votes outside the `votingStart`–`votingEnd` window with `GovernanceRuleViolation`. This is not just a UI concern — it's enforced at the engine level.
- **The VCP stores governance metadata; the backend stores content.** The VCP is a governance computation and integrity engine. It stores event payloads, governance metadata, and content hashes — never markdown documents, binary assets, or PII. Rich content (proposal documents, candidacy profiles, community note text, uploaded files) lives in the client backend. The `contentHash` in the VCP provides integrity verification: anyone can hash backend-served content and compare it to the VCP's record. This separation keeps the VCP lean, deployment-agnostic, and capable of serving multiple client backends.
- **The backend orchestrates; the VCP computes.** The backend is the entry point for all user actions. It manages drafts, stores content, and calls the VCP to record governance events and perform governance computation. The VCP never initiates contact with the backend.

---

## Technology Stack

### Shared
- **Language:** TypeScript (strict mode, ESM syntax)
- **Package manager:** pnpm with workspaces
- **Monorepo structure:** `packages/` (engine) and `platform/` (VCP server + client backend + web UI)
- **npm scope:** `@votiverse` (engine packages only)
- **Runtime:** Node.js 22.x+ (LTS)
- **Linting:** eslint with TypeScript rules
- **Formatting:** prettier

### Engine (`packages/`)
- **Build:** `tsup` for package compilation (ESM output). Plain `tsc` with project references is acceptable for pure library packages.
- **Testing:** Vitest (latest stable, currently 4.x)
- Keep runtime-agnostic where possible for future Bun/Deno compatibility.

### VCP Server (`platform/vcp/`)
- **Framework:** Hono (lightweight HTTP framework)
- **Database:** better-sqlite3 (SQLite, file-based: `vcp-dev.db`)
- **Dev runner:** `tsx` (TypeScript execution without build step)
- **Port:** 3000

### Client Backend (`platform/backend/`)
- **Framework:** Hono (same as VCP)
- **Database:** better-sqlite3 (SQLite, file-based: `backend-dev.db`), PostgreSQL for production
- **Auth:** JWT access tokens + Argon2 password hashing (`@node-rs/argon2`)
- **Dev runner:** `tsx` (TypeScript execution without build step)
- **Port:** 4000

### Web UI (`platform/web/`)
- **Framework:** React 19 with React Router v7
- **Build/Dev:** Vite (HMR dev server on port 5174)
- **Styling:** Tailwind CSS

**Note:** Vite is used for the web UI only. The engine packages do NOT use Vite — use `tsup` or `tsc` for compilation and Vitest for testing.

Always use the latest stable versions of all dependencies. Check npm before installing to ensure you are not pinning to outdated versions.

---

## Package Dependency Rules

```
cli → engine → [awareness, voting, survey, prediction, integrity, content]
                awareness → [delegation, voting, prediction, survey, config, core, content]
                content → [config, core]
                voting → [delegation, config, core]
                survey → [identity, config, core]
                prediction → [config, core]
                delegation → [identity, config, core]
                integrity → [config, core]
                identity → [core]
                config → [core]
                simulate → [engine]
                core → (nothing)
```

**Rules:**
- `core` has zero dependencies. It is the leaf package.
- No package may depend on `engine` except `cli` and `simulate`.
- No package may depend on `cli`.
- No circular dependencies. If you need shared logic, it goes in `core`.
- Each package has its own `package.json`, `tsconfig.json`, `README.md`, and test directory.

---

## Coding Conventions

### General
- ESM syntax always (`import`/`export`, never `require`)
- Strict TypeScript (`"strict": true` in tsconfig)
- No `any` types. Use `unknown` and narrow.
- Prefer `interface` over `type` for object shapes that will be implemented.
- Prefer `type` for unions, intersections, and utility types.
- All public APIs must have JSDoc comments.
- No default exports. Use named exports only.

### Naming
- Packages: `@votiverse/<name>` (lowercase, single word)
- Files: `kebab-case.ts`
- Types and interfaces: `PascalCase`
- Functions and variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Event types: `PascalCase` (e.g., `VoteCast`, `DelegationCreated`)

### Events
- Every event type extends `BaseEvent` from `@votiverse/core`
- Events include: `id`, `type`, `timestamp`, `payload`
- Events are immutable. Use `Readonly<T>` or `as const`.
- Event types are string literal unions, not enums.

### Testing
- Write tests BEFORE implementation when possible.
- Test files: `<module>.test.ts` alongside source files, or in a `__tests__` directory.
- Unit tests for every public function.
- Property-based tests for formal guarantees (sovereignty, one-person-one-vote, monotonicity, revocability).
- Integration tests go in the `engine` package.
- Use descriptive test names: `"direct vote overrides delegation for the same issue"` not `"test override"`.

### Error Handling
- Define typed error classes in each package, extending a base error from `core`.
- Never throw raw strings or generic Error objects.
- Functions that can fail return `Result<T, E>` or throw typed errors — pick one pattern per package and be consistent.

---

## Development Phases

Work proceeds in phases. Complete one phase fully before starting the next. At the end of each phase, run all tests, write a status report in the PR description, and STOP. Do not proceed to the next phase without explicit instruction.

**Current status:** All engine packages (Phases 1–7) are complete, including `@votiverse/content` (proposals, candidacies, community notes). The platform layer implements a full working UI: voting, delegations, surveys, predictions, awareness, proposals with TipTap editor, delegate candidacies with candidacy discovery, community notes with evaluations, and member search. Group creation with LIQUID_DELEGATION default, assembly roles (owner/admin), curation phase enforcement. Onboarding system: handles (@username), invite links with public group preview, direct invitations by handle, multi-step onboarding dialog, avatar style picker, profile editing. Invitation hardening: email notifications (InvitationNotifier with adapter pattern), bulk CSV import with preview. Admission control: backend-owned mutable `admissionMode` (open/approval/invite-only), join request flow, Sybil risk warnings in UI. 830+ tests across engine (471), VCP (143), backend (146), web (16), and config (88).

### Phase 1: Foundation
1. `@votiverse/core` — base types, event definitions, EventStore interface, Result type, error base class
2. Tests for core
3. `@votiverse/config` — GovernanceConfig schema, validation, named presets, diffing
4. Tests for config
5. `@votiverse/identity` — IdentityProvider interface, InvitationProvider implementation
6. Tests for identity
7. `@votiverse/delegation` — delegation CRUD, graph construction, scope resolution, weight computation, cycle detection, concentration metrics
8. Tests for delegation (including whitepaper Appendix C examples)
9. `@votiverse/voting` — vote casting, override rule, ballot methods (SimpleMajority, Supermajority), quorum checking, tally
10. Tests for voting
11. `@votiverse/engine` — wire core, config, identity, delegation, voting together. Event bus. Public API surface.
12. Integration tests across Phase 1 packages
13. `@votiverse/cli` — init, config commands, basic event/delegate/vote commands (Modes 1 and 2)
14. End-to-end test: create a voting event with delegations and verify tally from CLI
15. **STOP. Write status report. Wait for review.**

### Phase 2: Accountability
1. `@votiverse/prediction` — prediction creation, commitment hashing, outcome recording, accuracy evaluation, track records
2. Tests for prediction
3. `@votiverse/survey` — survey creation, response collection, aggregation, trend computation
4. Tests for survey
5. Wire prediction and survey into engine
6. CLI commands for predict and survey
7. Integration tests
8. **STOP. Write status report. Wait for review.**

### Phase 3: Awareness
1. `@votiverse/awareness` — concentration monitoring, chain resolution, harvesting detection, delegate profiles, engagement prompts, personal voting history, historical context
2. Tests for awareness
3. Wire awareness into engine
4. CLI awareness commands
5. Integration tests
6. **STOP. Write status report. Wait for review.**

### Phase 4: Simulation
1. `@votiverse/simulate` — rule-based agent framework, persona definitions, simulation runner
2. Tests for simulation framework
3. Run simulations against all named presets, document findings
4. CLI simulate commands
5. LLM-driven agent support (Anthropic API integration)
6. **STOP. Write status report. Wait for review.**

### Phase 5: Integrity
1. `@votiverse/integrity` — commitment generation, BlockchainAnchor interface, no-op anchor, verification tools
2. Tests for integrity
3. Wire integrity into engine
4. CLI integrity commands
5. **STOP. Write status report. Wait for review.**

### Phase 6: Production Hardening
1. PostgreSQL storage adapter
2. Performance profiling and optimization
3. Error handling audit
4. Logging and monitoring hooks
5. Documentation polish — all package READMEs, API docs
6. **STOP. Write status report. Wait for review.**

### Phase 7: Content — Proposals, Candidacies, and Community Notes

See `docs/design/content-architecture.md` for the full design. The VCP stores governance metadata and content hashes; the backend stores rich content (markdown, assets).

**A. Foundation types and events**
1. Add `CandidacyId`, `NoteId`, `AssetId`, `ContentHash` branded types to `@votiverse/core`
2. Add new event types and payload interfaces to `@votiverse/core/events.ts`
3. Add delegation `candidacy`/`transferable` booleans, `allowVoteChange`, `noteVisibilityThreshold`, `noteMinEvaluations`, `surveyResponseAnonymity` to `@votiverse/config`
4. Replace `DelegationConfig.enabled` with `candidacy`/`transferable` in all presets and tests
5. Update config validation

**B. Content package**
6. Create `@votiverse/content` package scaffold
7. Implement content hash utility (with tests)
8. Implement proposal metadata lifecycle (with tests)
9. Implement candidacy metadata lifecycle (with tests)
10. Implement community note lifecycle + evaluation + visibility (with tests)
11. Property-based tests for immutability guarantees

**C. Engine + awareness integration**
12. Wire content into `@votiverse/engine` API
13. Implement proposal locking on voting window open
14. Implement vote transparency for opted-in candidates
15. Extend awareness layer (DelegateProfile, HistoricalContext, engagement prompts)
16. Integration tests

**D. VCP layer**
17. VCP database schema additions
18. VCP API routes for proposals, candidacies, notes (metadata only)
19. VCP integration tests

**E. Backend layer**
20. Backend database schema additions (content + drafts + assets)
21. Asset store adapter (PostgreSQL initially)
22. Backend API routes (drafts, content, assets, VCP proxy for evaluations)
23. Backend integration tests

**F. Web UI**
24. Markdown editor component (with asset upload)
25. Proposal creation/viewing pages
26. Candidacy profile pages
27. Community notes display + evaluation UI
28. Updated delegation discovery (candidacy mode)
29. **STOP. Write status report. Wait for review.**

---

## Formal Properties to Test

These properties must hold for ALL governance configurations. Write property-based tests that generate random configurations and verify:

1. **Sovereignty.** A participant who casts a direct vote always has weight = 1 on that issue, regardless of any delegation.
2. **One person, one vote.** The sum of all effective weights for an issue equals the number of participants who either voted directly or whose delegation chain terminates at a voter. No weight is created or destroyed.
3. **Monotonicity.** Casting a direct vote never reduces a participant's influence compared to delegating.
4. **Revocability.** Revoking a delegation and recomputing weights produces the same result as if the delegation had never existed.
5. **Override rule.** If participant A delegates to B, and A votes directly, then B's weight does not include A's vote.
6. **Cycle resolution.** Participants in a delegation cycle who do not vote directly have effective weight 0. A direct vote from any cycle member breaks the cycle at that point.
7. **Scope precedence.** A more specific delegation always overrides a more general one for the same participant and issue.
8. **Survey non-transferability.** No API path allows a survey response to be submitted on behalf of another participant.

---

## File Structure

### Engine Packages

```
packages/<name>/
├── package.json
├── tsconfig.json
├── README.md              ← package purpose, API overview, examples
├── src/
│   ├── index.ts           ← public API (re-exports)
│   ├── types.ts           ← package-specific types
│   └── ...                ← implementation files
└── tests/
    ├── unit/
    └── integration/       ← (if applicable)
```

### Platform

```
platform/
├── vcp/                         ← Votiverse Control Plane (HTTP API server)
│   ├── src/
│   │   ├── main.ts              ← entry point (starts Hono server)
│   │   ├── adapters/
│   │   │   ├── index.ts         ← VCPAdapters type, wiring
│   │   │   ├── database/sqlite.ts ← SQLite schema + queries
│   │   │   └── auth/            ← auth adapter (header-based identity)
│   │   ├── engine/
│   │   │   └── assembly-manager.ts ← manages assemblies, wraps engine API
│   │   └── api/
│   │       ├── server.ts        ← Hono app, middleware, route mounting
│   │       ├── middleware/      ← auth, error-handler
│   │       └── routes/          ← assemblies, participants, events, delegations,
│   │                              voting, predictions, surveys, topics, awareness
│   ├── seed-manifest.json        ← generated key→UUID registry (gitignored)
│   └── scripts/
│       ├── seed.ts              ← orchestrator: wipes + reseeds all data
│       ├── reset.ts             ← wipes DB, starts server, runs seed, stops server
│       └── seed-data/           ← data definitions (assemblies, participants,
│                                  events, delegations, surveys, topics, helpers)
├── backend/                       ← Client backend (auth, identity, VCP proxy)
│   ├── src/
│   │   ├── main.ts              ← entry point
│   │   ├── config/schema.ts     ← BackendConfig, env vars
│   │   ├── lib/                 ← logger, metrics, jwt, password
│   │   ├── adapters/            ← database (SQLite/PostgreSQL)
│   │   ├── services/            ← user-service, session-service,
│   │   │                          membership-service, vcp-client
│   │   └── api/
│   │       ├── server.ts        ← Hono app, middleware, route mounting
│   │       ├── middleware/      ← auth (JWT), error-handler, request-id
│   │       └── routes/          ← auth, me, proxy (to VCP)
│   ├── test/                    ← integration tests
│   └── scripts/
│       ├── seed.ts              ← creates users + memberships from VCP data
│       └── reset.ts             ← wipes backend DB, seeds from VCP
└── web/                         ← React web UI
    ├── src/
    │   ├── main.tsx             ← entry point
    │   ├── api/
    │   │   ├── client.ts        ← HTTP client functions (fetch wrappers)
    │   │   └── types.ts         ← API response types
    │   ├── hooks/               ← useApi, useIdentity, useAssembly
    │   ├── components/          ← layout, avatar, topic-picker, UI primitives
    │   └── pages/               ← dashboard, events, event-detail, delegations,
    │                              polls, predictions, awareness
    └── TESTING.md               ← test identity guide, assembly matrix
```

---

## Platform Development Workflow

### Starting Fresh

```bash
# Step 1: Rebuild engine packages (if pulling new code or switching branches)
./scripts/check-dist.sh --rebuild

# Step 2: Reset VCP (self-contained — starts its own server, seeds, stops)
cd platform/vcp && pnpm reset

# Step 3: Reset backend (requires VCP running — start VCP first, then reset)
cd platform/vcp && pnpm dev &    # start VCP in background
cd platform/backend && pnpm reset
kill %1                           # stop background VCP
```

**Important:** The backend reset fetches participant data from the VCP via HTTP. If the VCP is not running, the backend reset fails with `ECONNREFUSED`. The VCP reset is self-contained (starts/stops its own server), but the backend reset requires an already-running VCP.

The VCP reset runs `scripts/reset.ts`: deletes `vcp-dev.db*`, starts the VCP server, executes `scripts/seed.ts` (which creates 7 assemblies with participants, topics, events, delegations, surveys, proposals, and community notes), then stops the server. The VCP seed also writes `platform/vcp/seed-manifest.json` — a JSON file mapping all semantic keys to generated UUIDs (see **Seed Manifest** below). The backend reset creates user accounts and assembly memberships by reading participant data from the VCP.

### Running Dev Servers

From the repo root:
```bash
# VCP API server (port 3000)
cd platform/vcp && pnpm dev

# Client Backend (port 4000) — in a separate terminal
cd platform/backend && pnpm dev

# Web UI (port 5173) — in a third terminal
cd platform/web && pnpm dev
```

Or use the `.claude/launch.json` configurations (`vcp`, `backend`, and `web`) with the preview tool.

### Seed Data Overview

The seed creates 7 assemblies using different governance presets:

| Assembly       | Key          | Preset              | Delegation                | Surveys | Predictions |
|----------------|--------------|---------------------|---------------------------|---------|-------------|
| Greenfield     | `greenfield` | DIRECT_DEMOCRACY    | None                      | No      | Off         |
| OSC            | `osc`        | LIQUID_OPEN         | Open, transferable        | No      | Mandatory   |
| Municipal      | `municipal`  | CIVIC               | Open, transferable        | Yes     | Opt-in      |
| Youth          | `youth`      | LIQUID_DELEGATION   | Candidacy, transferable   | Yes     | Opt-in      |
| Board          | `board`      | REPRESENTATIVE      | Open, non-transferable    | No      | Off         |
| Maple Heights  | `maple`      | LIQUID_DELEGATION   | Candidacy, transferable   | Yes     | Encouraged  |
| Riverside      | `riverside`  | CIVIC               | Open, transferable        | No      | Off         |

Each assembly has hierarchical topics (45 total), participants with cross-assembly overlap, voting events with issues mapped to topics, delegations (global + topic-scoped), and surveys (Municipal + Youth only). The Maple Heights assembly provides seed data for the Maple Heights Condo Board case study (proposals, community notes, closed results). The Riverside Community Center assembly provides seed data for the Riverside case study (topic navigation, issue cancellation/reclassification, community notes on misclassification).

The backend seed creates 71 user accounts mapped to VCP participants, with 8 cross-assembly users who have memberships in multiple assemblies.

See `platform/web/TESTING.md` for full details on test identities and delegation graphs.

### Seed Manifest

After seeding, the VCP writes `platform/vcp/seed-manifest.json` — a JSON file mapping semantic keys to generated UUIDs. This is the **single source of truth** for entity IDs in external tooling (screenshot scripts, case study Playwright scripts, etc.).

**Why this exists:** The VCP API generates UUIDs at seed time. These IDs change on every reseed. Without the manifest, screenshot scripts and other tooling would hardcode UUIDs that break after any `pnpm reset`.

**Structure:**
```json
{
  "generatedAt": "2026-03-19T22:27:43.756Z",
  "assemblies": { "municipal": "uuid-...", "maple": "uuid-...", ... },
  "participants": { "municipal::Carmen Delgado": "uuid-...", ... },
  "topics": { "municipal::roads": "uuid-...", ... },
  "events": { "municipal-emergency": { "eventId": "uuid-...", "issueIds": ["uuid-...", ...] }, ... }
}
```

**Consumers:** The docs repo (`docs/lib/seed-manifest.ts`) provides a typed reader:
```typescript
import { loadManifest } from "../../lib/seed-manifest.js";
const m = loadManifest();
const assemblyId = m.assembly("maple");
const eventId = m.event("maple-lobby");
const issueId = m.issue("maple-lobby", 0);
```

**Rules:**
- The manifest is `.gitignore`d — it's generated and environment-specific.
- Never hardcode UUIDs in screenshot scripts. Always use the manifest.
- If you add a new assembly or event to the seed, it automatically appears in the manifest after the next `pnpm reset`.
- The manifest reader auto-discovers the file by looking for a sibling `votiverse/` repo. Override with `SEED_MANIFEST_PATH` env var.

### Identity System

The web UI uses JWT-based authentication through the client backend. Users log in with email/password, the backend issues JWT access tokens, and all API requests go through the backend which resolves user identity to assembly-specific participant IDs. The VCP never sees user credentials — it receives only opaque `X-Participant-Id` headers from the backend.

For local development, the seed script creates test users with email format `{slug}@example.com` and password `password1234`. See `platform/web/TESTING.md` for the full list.

### Case Studies & Screenshots

Case studies live in a separate repo (`docs/`) alongside this one. Each case study has a Playwright script that captures screenshots from a running Votiverse instance.

**Adding a new case study:**

1. **Add seed data.** Define the assembly, participants, events, votes, proposals, and notes in `platform/vcp/scripts/seed-data/`. Use semantic keys (e.g., `maple-lobby`) — the seed assigns UUIDs.
2. **Reset.** Run `pnpm reset` in both VCP and backend. The manifest regenerates automatically.
3. **Write the screenshot script** in `docs/case-studies/<name>/take-screenshots.ts`. Use the manifest to resolve IDs:
   ```typescript
   import { loadManifest } from "../../lib/seed-manifest.js";
   const m = loadManifest();
   const asmId = m.assembly("maple");
   const eventId = m.event("maple-lobby");
   ```
4. **Run the script:** `npx tsx case-studies/<name>/take-screenshots.ts` (from the docs repo, with all three servers running).
5. **Add the npm script** to `docs/package.json`: `"screenshots:<name>": "tsx case-studies/<name>/take-screenshots.ts"`.

**Existing case studies:**
- `maple-heights-condo-board` — group creation, invitations, proposals, community notes, voting, results (assembly key: `maple`)
- `neighborhood-budget-council` — delegation, topic scoping, chains, override rule, voting weight (assembly key: `municipal`)

See `docs/guides/screenshot-workflow.md` for Playwright patterns (login switching, clock advancement, scrolling, etc.).

---

## Commit and Push Cadence

Commit and push frequently so progress can be monitored remotely. Follow these rules:

- **Commit after completing each numbered step** in the current phase task list. Do not accumulate multiple steps into one commit.
- **Push after every commit.** Do not batch pushes. The remote repository should always reflect current progress.
- **If a step involves both implementation and tests**, commit the tests first, then the implementation, then push. This keeps the history clean and shows the test-first discipline.
- **If you are debugging a failing test**, commit the fix when it passes and push immediately.
- **If you are in the middle of a step and have been working for more than 15 minutes**, commit what you have as a work-in-progress (`wip(package): description`) and push. This ensures progress is never lost.

The project owner monitors progress by watching the commit log remotely. Frequent, well-described commits are the primary communication channel during autonomous work.

---

## Commit Conventions

- `feat(package): description` — new feature
- `fix(package): description` — bug fix
- `test(package): description` — test additions
- `docs: description` — documentation changes
- `refactor(package): description` — code restructuring without behavior change
- `chore: description` — build, tooling, dependencies

Keep commits atomic. One logical change per commit.

---

## When Unsure

If you encounter an architectural ambiguity not covered by this file or the architecture doc:
1. Check the papers (`docs/papers/`) for the conceptual intent — Paper I for the governance model, Paper II for proposals, candidacies, and community notes.
2. Check the design docs (`docs/design/`) for approved architectural decisions.
3. If still unclear, write a comment in the code with `// DECISION NEEDED:` and proceed with a principled approach.
4. Flag the decision in the phase status report.

Do not spend tokens deliberating on decisions that can be easily changed later. Make the principled choice, document it, and move on.

---

## Troubleshooting — Known Gotchas

These are recurring issues that waste debugging time. Read this section before investigating any runtime or build problem.

### 1. Stale `dist/` builds (production/CI only — resolved for dev)

**This problem has been structurally resolved for local development.** Each engine package's `package.json` now includes a `"source"` export condition pointing at `src/index.ts`. The VCP's dev, seed, and reset scripts pass `--conditions source` to `tsx`, which resolves imports directly from TypeScript source. The VCP's `vitest.config.ts` also sets `resolve.conditions: ["source"]` so tests resolve from source too.

**This means:** In dev, you can modify engine source code and the VCP will pick up changes on restart without needing to rebuild `dist/`. The `check-dist.sh` script is no longer needed for day-to-day dev work.

**When `dist/` still matters:**
- **Production builds** — the `"import"` condition (used without `--conditions source`) still resolves to `dist/`. You must rebuild before deploying.
- **CI** — same as production.
- **Publishing packages** — `"files": ["dist"]` means only compiled output is published to npm.

**If you do hit stale dist in production/CI:**

```bash
./scripts/check-dist.sh --rebuild
```

### 2. Vite dev server caching stale transforms

**Symptom:** Vite HMR fails with parse errors (e.g., duplicate identifiers), even though the file on disk is correct. The page is blank with no visible error.

**Cause:** Vite's OXC parser (stricter than `tsc`) caches module transforms in memory. If an intermediate edit introduced a parse error, HMR fails and the module gets stuck in a broken state. Even after fixing the file, the server may not re-transform it.

**Fix:**
1. Delete the Vite cache: `rm -rf platform/web/node_modules/.vite`
2. If that doesn't work, restart the Vite dev server (kill the process and re-run `pnpm dev`)
3. Touch the file to force re-transform: `touch platform/web/src/pages/the-file.tsx`

**Note:** `tsc --noEmit` and `vite build` may pass while the dev server stays broken — they use separate module caches.

### 3. React hooks after early returns

**Symptom:** Component renders as blank/white. React DevTools shows "An error occurred in the \<Component\>". No visible error in the console (only a generic error boundary warning).

**Cause:** React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, etc.) called AFTER an early `return` statement. On the first render, the early return fires before the hook is reached. On subsequent renders, the hook IS reached. React sees different hook counts between renders and crashes.

**Rule:** All hooks must be placed BEFORE any conditional `return` statements. This includes `useMemo` — it's a hook, not just a utility.

```tsx
// WRONG — useMemo after early return
function Component() {
  const { data, loading } = useApi(...);
  if (loading) return <Spinner />;        // early return
  const derived = useMemo(() => ..., []); // 💥 hook after return
}

// CORRECT — useMemo before early return
function Component() {
  const { data, loading } = useApi(...);
  const derived = useMemo(() => ..., []); // ✅ hook before return
  if (loading) return <Spinner />;
}
```

### 4. Multiple dev servers on different ports

**Symptom:** Confusing behavior, stale pages, or "Bad Gateway" errors. Two Vite dev servers running on different ports (e.g., 5173 and 5174).

**Cause:** Starting `pnpm dev` manually while the preview tool also starts its own server. Or starting a server before a previous instance was fully killed.

**Fix:** Before starting servers, check what's running:

```bash
lsof -i :5173 -i :5174 -i :3000 -i :4000 -P | grep LISTEN
```

Kill everything and start fresh. Use either manual `pnpm dev` or the `.claude/launch.json` preview tool — not both.

### 5. VCP server must be restarted after rebuild (production only)

**Note:** In dev, this is no longer an issue — the VCP resolves from engine source via the `"source"` export condition (see gotcha #1). You only need to rebuild `dist/` for production/CI.

**Symptom:** Engine packages rebuild successfully but the VCP still returns old errors.

**Cause:** The VCP server loads modules into memory at startup. Rebuilding `dist/` doesn't affect a running process.

**Fix:** Always restart the VCP server after rebuilding packages.

### 6. Vote rejected with VOTING_NOT_OPEN or VOTING_CLOSED

**Symptom:** `GovernanceRuleViolation: Voting has not started yet` or `Voting has closed` when casting a vote.

**Cause:** The engine now enforces timeline windows. Votes are only accepted when `timeProvider.now()` is between `votingStart` and `votingEnd`.

**Fix for tests:** Use a `TestClock` and either:
- Create events with `votingStart` in the past and `votingEnd` in the future
- Use `clock.advance(ms)` to move time into the voting window

**Fix for dev:** Use the VCP's dev clock API:
```bash
# Check current server time
curl http://localhost:3000/dev/clock

# Advance 1 day
curl -X POST http://localhost:3000/dev/clock/advance \
  -H 'Content-Type: application/json' -d '{"ms": 86400000}'

# Reset to real time
curl -X POST http://localhost:3000/dev/clock/reset
```

**Note:** Dev clock endpoints are only available when `NODE_ENV !== "production"`. They are double-gated: not mounted in production AND a middleware guard blocks even if misconfigured.

### 7. VCP list vs detail endpoint divergence

**Symptom:** A page shows correct data when viewing a single entity (e.g., event detail shows issues with topics) but an overview/list page shows missing data (e.g., events list has no issues, so topic counts are 0).

**Cause:** The VCP has separate list and detail endpoints that may return different response shapes. For example, `GET /assemblies/:id/events` (list) historically returned only `issueIds` while `GET /assemblies/:id/events/:eid` (detail) returned full `issues[]` with `topicId`, `cancelled`, etc. When new fields are added to the detail endpoint, the list endpoint may not be updated.

**Fix:** Check the VCP route handler for the list endpoint (e.g., `platform/vcp/src/api/routes/events.ts`) and compare its response shape to the detail endpoint. Ensure both return the fields that consumers need.

**Prevention:** When adding new fields to entity responses, update both the list and detail endpoints. The web client's TypeScript types (in `platform/web/src/api/types.ts`) define optional fields like `issues?: Issue[]` — if a list endpoint doesn't populate them, code using `event.issues ?? []` silently returns empty arrays rather than erroring.

### 8. Delegation visibility hides data by design

**Symptom:** Delegations show as empty (0 delegations) for some assemblies or users.

**Cause:** Not a bug. Assemblies with `delegation.visibility.mode: "private"` only return delegations where the caller is the source or target. If the logged-in user hasn't delegated and nobody delegates to them, the API correctly returns 0.

**Which assemblies are public vs private:** Check with `sqlite3 platform/vcp/vcp-dev.db "SELECT name, json_extract(config, '$.delegation.visibility.mode') FROM assemblies;"`. Currently: OSC, Youth, and Maple are public; Greenfield, Municipal, Board, and Riverside are private.

**Fix:** If you need to verify delegations exist, test with a participant who is a delegation source or target (check `seed-data/delegations.ts`), or query the VCP database directly.

### Troubleshooting Routine

When something breaks at runtime, follow this checklist in order:

1. **Check VCP server logs** for 500 errors or `is not a function` — indicates stale `dist/`
2. **Check Vite dev server logs** for transform/parse errors — indicates stale module cache
3. **Check browser console** for React error boundary warnings — indicates hooks violation or component crash
4. **Check network tab** for 500/502 responses — indicates VCP not running or stale
5. **Verify ports** — ensure only one web server, one backend, and one VCP are running
6. **Rebuild + restart** — when in doubt: rebuild all packages, restart all servers, reload the page
