# CLAUDE.md — Instructions for Claude Code

This file is the primary reference for AI-assisted development on Votiverse. Read it at the start of every session and after every context compaction event.

---

## Project Summary

Votiverse is a configurable governance engine — a headless TypeScript library that implements democratic decision-making with delegation, prediction tracking, participant polling, and a governance awareness layer. It is not a web app. It is a pure logic engine consumed by CLI tools and (separately) by a proprietary web UI.

**Read these documents for full context:**
- `docs/architecture.md` — technical architecture, module specs, API design, development phases
- `docs/whitepaper.md` — governance model, formal properties, design rationale

---

## After Context Compaction

When context is compacted, you lose architectural reasoning. Before resuming any work:

1. Re-read this file (`CLAUDE.md`)
2. Re-read `docs/architecture.md`
3. Re-read the `README.md` of the package you are currently working on
4. Re-read the existing tests for that package
5. Only then resume implementation

This is not optional. Skipping this step leads to architectural drift that is expensive to fix.

---

## Architectural Decisions — Do Not Revisit

These decisions are final. Do not reconsider them without explicit instruction from the project owner.

- **Event sourcing.** All state changes are recorded as an append-only sequence of immutable events. Current state is derived by replaying events. There is no mutable state store.
- **Delegation graphs are computed fresh** from the event log for each issue. They are not maintained as mutable state. This ensures temporal queries work correctly and the override rule is always applied against current state.
- **The awareness package is read-only.** It queries state produced by other packages. It never modifies engine state. It never writes events.
- **Polls are non-delegable.** This is a hard architectural constraint, not a configuration option. Poll responses cannot be transferred or delegated under any configuration.
- **Predictions are immutable once committed.** The commitment hash prevents retroactive editing. Outcome data can be updated (new events), but the original prediction is never modified.
- **The engine exposes a programmatic TypeScript API, not HTTP.** An HTTP layer is a consumer concern built on top of the engine.
- **Configuration is data.** Governance rules come from `GovernanceConfig` objects. The engine interprets configs — it never hard-codes governance logic.
- **No circular dependencies between packages.** Dependencies flow strictly downward. See the dependency graph in `docs/architecture.md`.

---

## Technology Stack

- **Language:** TypeScript (strict mode, ESM syntax)
- **Package manager:** pnpm with workspaces
- **Monorepo structure:** all packages under `packages/`
- **npm scope:** `@votiverse`
- **Runtime:** Node.js (keep runtime-agnostic where possible for future Bun/Deno compatibility)
- **Build:** `tsup` for package compilation (ESM output). If tsup adds unnecessary complexity for a pure library package, plain `tsc` with project references is acceptable.
- **Testing:** Vitest (latest stable, currently 4.x)
- **Linting:** eslint with TypeScript rules
- **Formatting:** prettier
- **Node version:** 22.x+ (LTS)

**Note:** Vite is a frontend build tool and is NOT needed for the engine packages. The engine is a headless TypeScript library and CLI — there is no dev server, no HMR, no browser asset pipeline. Vite will be relevant for the separate proprietary web UI, not for this repo. Use `tsup` or `tsc` for compilation and Vitest for testing.

Always use the latest stable versions of all dependencies. Check npm before installing to ensure you are not pinning to outdated versions.

---

## Package Dependency Rules

```
cli → engine → [awareness, voting, polling, prediction, integrity]
                awareness → [delegation, voting, prediction, polling, config, core]
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
3. `@votiverse/polling` — poll creation, response collection, aggregation, trend computation
4. Tests for polling
5. Wire prediction and polling into engine
6. CLI commands for predict and poll
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
8. **Poll non-transferability.** No API path allows a poll response to be submitted on behalf of another participant.

---

## File Structure Per Package

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
1. Check the whitepaper for the conceptual intent.
2. If still unclear, write a comment in the code with `// DECISION NEEDED:` and proceed with the simplest reasonable approach.
3. Flag the decision in the phase status report.

Do not spend tokens deliberating on decisions that can be easily changed later. Make the simple choice, document it, and move on.
