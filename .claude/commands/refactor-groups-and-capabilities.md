# Refactor: Groups and Capabilities

You are implementing a pre-production architectural refactor that restructures how Votiverse organizes its top-level entities and capabilities. This is the most significant structural change before the platform goes to production.

## Before you start

Read these documents thoroughly, in this order:

1. `CLAUDE.md` — project instructions, conventions, current architecture
2. `docs/design/groups-and-capabilities.md` — **the primary design document for this refactor** (v1.0). It contains the full rationale, schema audit, entity classification, and implementation sequence.
3. `docs/architecture.md` — current engine internals
4. `docs/integration-architecture.md` — current VCP/backend boundary

After reading, write a brief summary of your understanding of the refactor and any observations, questions, or suggestions before writing code. If you find something in the design document that could be improved — a better approach, an edge case not covered, a simplification — raise it. The design was produced through careful analysis but has not been peer-reviewed. You are expected to think critically, not just execute.

## What has already been done

- The design document (`docs/design/groups-and-capabilities.md`) is complete and committed.
- `CLAUDE.md` has been updated with the upcoming refactor section and the new design doc reference.
- The prediction mode dropdown (off/opt-in/mandatory/encouraged) has been removed from the group creation UI (`platform/web/src/pages/create-assembly.tsx`). The `ConfigDraft.features.predictions` field was changed from `string` to `boolean`, and the dropdown was replaced with a checkbox. All `PRESET_CONFIGS` were updated to use booleans.
- These changes are committed and pushed to `main`.

## Scope

The refactor has three tiers as described in design doc section 12. Execute them in the order specified in section 13 (Implementation Sequence). Each tier should be committed and pushed before starting the next so progress can be monitored.

### Tier 1 — Engine cleanup (no schema changes, no API changes)

- Remove `FeatureConfig` entirely from `GovernanceConfig` in `packages/config/src/types.ts`
- Remove the `features` section from all 6 presets in `packages/config/src/presets.ts`
- Remove `name` and `description` from `GovernanceConfig` (the group owns these, not the governance config — see design doc section 10.4)
- Remove the feature gate in `PredictionService.commit()` (`packages/prediction/src/prediction-service.ts`)
- Remove the feature gate in `NoteService.create()` (`packages/content/src/notes.ts`)
- Make `Prediction.proposalId` optional in `packages/prediction/src/types.ts` and update `CommitPredictionParams`
- Update the `VotiverseEngine` to stop passing feature config to sub-services
- Update `packages/config/src/validation.ts` — the validator no longer needs to validate features
- Update `packages/config/src/derive.ts` — derivation logic for features goes away
- Update all engine tests that reference `features.*` or construct `GovernanceConfig` with a `features` section
- Update web UI: remove the features section from the creation form (`ConfigDraft` type, `PRESET_CONFIGS`, `ConfigModal`)
- Update web UI: remove predictions/features display from the assembly dashboard
- Update web UI: remove prediction feature check from the onboarding dialog
- Update `platform/web/src/api/types.ts` — the `GovernanceConfig` mirror type needs to match
- Update VCP routes and assembly manager that read or pass `config.features`
- Update backend proxy and `assemblies_cache` handling that pass feature config through
- Update the config package tests (`packages/config/tests/`)

Run all tests after Tier 1. Every existing test suite must pass (with test code updated as needed). Commit and push.

### Tier 2 — Backend: introduce group entity

- New migration: `groups` table, `group_capabilities` table, `group_members` table
- Refactor `memberships` → `group_members` (absorb roles from VCP's `assembly_roles`)
- Move `invitations`, `join_requests`, `notifications`, `assets` from assembly-scoped to group-scoped
- Split `assemblies_cache` into group metadata + VCP config cache
- Add capability gating to the backend proxy — check `group_capabilities` before forwarding to VCP
- New API routes: `/api/groups/...` (can coexist with `/api/assembly/...` during transition or replace directly — your call, since we're pre-production)
- Update backend services: membership-service, invitation logic, notification logic
- Update backend seed script to create groups and populate `group_capabilities`

Run all backend tests. Commit and push.

### Tier 3 — VCP: generalize assembly

- New migration: make `assemblies.config` nullable
- Remove `assembly_roles` table and role enforcement from VCP (roles now enforced by backend)
- Consider keeping `RoleGranted`/`RoleRevoked` events as audit trail
- Consolidate `proposal_endorsements` + `entity_endorsements` + `note_evaluations` → unified `stances` table (design doc section 2.5)
- Update VCP assembly creation to accept nullable config
- Update VCP seed to work with the new schema

Run all VCP tests. Commit and push.

### Web UI update

- Shift routing from `/assembly/:id/...` to `/group/:id/...`
- Update all hooks: `useAssembly` → `useGroup`, `useAssemblyRole` → `useGroupRole`, signal keys `"assemblies"` → `"groups"`
- Update creation page to the new flow (capability toggles, quadrant selection for voting)
- Update group settings page with capability management section
- Update sidebar, navigation, dashboard to use group terminology
- Remove any remaining references to "assembly" in user-facing text (check translation files)

Run web tests and manually verify the UI works end-to-end. Commit and push.

### Seeding and end-to-end verification

After all tiers are complete:

1. **Reset and reseed everything:**
   ```bash
   cd platform/vcp && pnpm reset
   cd platform/backend && pnpm reset  # with VCP running
   ```

2. **Run the full test suites:**
   ```bash
   # Engine tests
   cd packages/config && pnpm test
   cd packages/engine && pnpm test

   # VCP tests
   cd platform/vcp && pnpm test

   # Backend tests
   cd platform/backend && pnpm test

   # Web tests
   cd platform/web && pnpm test
   ```

3. **Test with PostgreSQL.** The backend and VCP both support PostgreSQL via dialect-specific migrations. Set `VCP_DATABASE_URL` and `BACKEND_DATABASE_URL` to PostgreSQL connection strings and verify:
   - Migrations apply cleanly on PostgreSQL
   - VCP reset + seed works
   - Backend reset + seed works
   - All test suites pass against PostgreSQL

   If PostgreSQL is not available locally, document what would need to be verified and flag it.

4. **Manual smoke test.** Start all three servers, log in as a seeded user, and verify:
   - Groups list loads (was assemblies list)
   - Group detail pages work (events, delegates, scoring, surveys, members, settings)
   - Group creation works with the new capability toggles
   - Enabling/disabling capabilities works in group settings
   - Existing seed data (voting events, delegations, proposals, community notes, scoring) displays correctly

## Guidelines

- **Commit frequently.** One commit per logical unit of work. Push after every commit. Follow the commit conventions in `CLAUDE.md`.
- **When a test fails, fix it — don't skip it.** If a test is genuinely obsolete (testing removed functionality), delete it. If it needs updating for the new model, update it.
- **Both SQLite and PostgreSQL migrations.** Every new migration needs both `.sqlite.sql` and `.postgres.sql` variants. Follow existing migration patterns.
- **Don't break the seed.** The seed data should continue to produce the same 7 assemblies (now as groups) with all their existing data. The seed manifest should still work.
- **Translation strings.** When renaming "assembly" to "group" in user-facing text, update the translation files in `platform/web/public/locales/en/`. The i18n keys can be renamed or aliased — your call.
- **If you find a design document gap**, document it with a `// DECISION NEEDED:` comment and note it in your commit message. Don't block on it — make a principled choice and move on.
- **If a tier is taking longer than expected**, commit and push what you have as WIP and document what remains.

## What success looks like

- All test suites pass (engine, VCP, backend, web) on SQLite
- PostgreSQL migrations apply and tests pass (or gaps are documented)
- The seed produces correct data and the seed manifest works
- The web UI uses "group" terminology everywhere — no user-visible "assembly" references
- `GovernanceConfig` has 10 parameters (delegation + ballot + timeline), no `FeatureConfig`
- Predictions are not gated by any config — always available
- The backend owns groups, capabilities, roles, memberships, invitations, assets, notifications
- The VCP is a pure computation engine — no role enforcement, no capability flags
- The design document's section 12 (Refactor Scope Summary) can be checked off item by item
