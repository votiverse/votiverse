# Votiverse Architecture Audit

**Date:** 2026-03-16
**Auditor:** Claude (Opus 4.6)
**Scope:** Full architectural review — VCP, web client, engine integration
**Reference documents:** whitepaper.md, architecture.md, integration-architecture.md, vcp-architecture.md, product-workflow.md, terminology-ux-guide.md

> **Remediation status (2026-03-16):** All critical and high-priority issues have been resolved.
> See commits `b9b926d` (Phase 1: sovereignty), `fd3d620` (Phase 2: PII removal),
> `194bc14` (Phase 3: CORS), `70edee0` (Phase 4: consistency), `f93f7bf` (Phase 5: materialization).

---

## 1. Executive Summary

The foundation is sound. The engine is clean, independent, and correctly implements the governance model. Assembly isolation is enforced consistently. The event store is truly append-only. The adapter pattern works as designed and will support the transition from SQLite to PostgreSQL without application code changes. The web client implements the terminology guide largely correctly and handles ballot secrecy, delegation visibility, and sealed results with meaningful nuance.

**Where drift has occurred** is at the identity boundary between the VCP and clients. The integration architecture specifies that the VCP holds no PII and receives only opaque ParticipantId values. The implementation stores participant names and has introduced a `users` table with names and emails — a cross-assembly identity layer that was not part of the original design. This was a pragmatic choice to support the web client's identity selector and cross-assembly participant linking, but it violates the documented privacy architecture. If left uncorrected, it means the VCP database cannot be exposed without revealing who participants are, which was an explicit design goal.

A second category of drift is **inconsistent trust enforcement**. The VCP is strict about some things — delegation creation enforces sovereignty through middleware that validates the caller's identity against assembly membership — but permissive about others — vote casting accepts an unvalidated `participantId` from the request body with no middleware verification. This inconsistency creates a trust model that is robust in some places and theatrical in others.

The system is deployable for demonstration and evaluation in its current state. For production deployment, the identity boundary violation and trust inconsistencies need to be resolved.

---

## 2. Critical Issues

### 2.1 PII in the VCP database

**Severity:** Critical — violates a foundational privacy guarantee

The VCP database contains two tables with personally identifiable information:

**`users` table** (`sqlite.ts:57-62`):
```sql
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`participants` table** (`sqlite.ts:65-73`):
```sql
CREATE TABLE IF NOT EXISTS participants (
  id              TEXT NOT NULL,
  assembly_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  ...
);
```

The integration architecture (Section 4.1) states: *"The VCP does not authenticate end users. Clients authenticate users through their own systems... The VCP holds no personally identifiable information."*

The VCP architecture (Section 13.4) states: *"The VCP stores ParticipantId values (opaque identifiers) but no personally identifiable information. Names, emails, and authentication credentials live in Uniweb. If the VCP database were fully exposed, an attacker would see governance events linked to opaque IDs — they would not know who those IDs represent."*

**Current state:** If the VCP database were fully exposed, an attacker would know every participant's full name, their email address (if provided), which assemblies they belong to, how they voted, who they delegated to, and their complete governance activity — all linked to real identities. This is the exact scenario the architecture was designed to prevent.

**Risk:** This is a data classification problem. If the VCP is self-hosted by a third party (a stated deployment goal), they have full access to participant names and governance activity. If the VCP database is backed up, replicated, or accessed by support staff, PII is exposed. The privacy boundary between governance data and identity data — which was the foundation of the multi-tenant trust model — does not exist.

### 2.2 Inconsistent participant identity validation on write operations

**Severity:** High — inconsistent trust model

The VCP uses two different patterns for validating who is performing a write operation:

**Pattern A — Middleware-enforced sovereignty** (used by delegations):
```
POST /assemblies/:id/delegations
  → requireParticipant(manager) middleware
  → resolves X-User-Id or X-Participant-Id header
  → validates participant exists and is active in assembly
  → sets c.set("participantId", participant.id)
  → route handler uses authenticated ID: sourceId = c.get("participantId")
```

**Pattern B — Client-asserted identity** (used by voting and polls):
```
POST /assemblies/:id/votes
  → no requireParticipant middleware
  → participantId comes from request body: body.participantId
  → no validation that the caller IS this participant
  → engine.voting.cast(body.participantId, ...)
```

This means:
- A client cannot create a delegation on behalf of another participant (sovereignty enforced).
- A client CAN cast a vote on behalf of any participant it knows the ID of (sovereignty not enforced).
- A client CAN submit a poll response on behalf of any participant (non-transferability not enforced at the API layer).

The engine enforces governance rules (is voting open? is the participant eligible?), but it cannot enforce *who is calling* — that is the API layer's responsibility. The inconsistency means that delegation sovereignty is enforced at two layers (API + engine) while voting and poll sovereignty are enforced at only one layer (engine eligibility checks, but not caller identity).

**Risk:** In the current dev client, the web app sends the correct participantId from its identity selector. But the API contract allows any client to impersonate any participant for voting and poll responses. A malicious or buggy client could cast votes for participants who didn't intend to vote.

### 2.3 The `/users` endpoint is not assembly-scoped

**Severity:** High — breaks assembly isolation

The `/users` endpoints operate outside the assembly isolation boundary:

- `GET /users` — returns ALL users across ALL assemblies
- `POST /users` — creates a user with cross-assembly links
- `GET /users/:userId/assemblies` — returns all assemblies a user belongs to

The integration architecture (Section 6) states: *"No API call can access data across Assemblies."*

The users endpoint violates this: it exposes which assemblies a user belongs to, their participant ID in each assembly, and their name — all from a single non-assembly-scoped request. This is a cross-assembly information leak. If Client A manages Assembly X and Client B manages Assembly Y, Client A can see that user "Sofia Reyes" is also a member of Client B's assembly.

---

## 3. Architectural Drift

### 3.1 Users table and cross-assembly identity (introduced, not designed)

**What exists:** A `users` table with `id`, `name`, `email`, `created_at`. A `user_id` foreign key on `participants`. Routes at `/users`, `/users/:id`, `/users/:id/assemblies`. A `requireParticipant` middleware that resolves `X-User-Id` headers to assembly-specific participant IDs.

**What was designed:** The VCP receives opaque ParticipantId values. The client is responsible for identity. There is no user concept in the VCP.

**Why it was introduced:** The web client's identity selector needed a way to:
1. Show a list of people the user can switch between (for evaluation/demo purposes).
2. Resolve a single person's identity across multiple assemblies (Sofia Reyes has different participant IDs in OSC and Youth).

The `users` table and cross-assembly resolution solved both problems pragmatically.

**Assessment:** This is architectural drift driven by a legitimate UX need, but it was solved at the wrong layer. The cross-assembly identity resolution belongs in the client application, not in the VCP. The VCP should not know that participant `p_abc` in Assembly X and participant `p_def` in Assembly Y are the same person. See Section 4 for detailed recommendation.

### 3.2 Participant names stored in VCP (data ownership violation)

**What exists:** The `POST /assemblies/:id/participants` endpoint accepts `{ name: string }` and stores it in the `participants` table. The awareness profile endpoint (`GET /awareness/profile/:pid`) resolves participant names from the engine's identity provider and returns them in API responses.

**What was designed:** The VCP stores only opaque ParticipantId values. Display names are the client's responsibility.

**Why it was introduced:** The seed script creates participants with names so the web client can display human-readable identities. Without names in the VCP, the client would need its own participant registry — which is architecturally correct but was more work during rapid development.

**Assessment:** This is a data ownership violation. Participant names are content, not governance data. They should live in the client. The VCP should accept an opaque ID (or generate one) and return it. The client maintains the mapping from ID to display name.

### 3.3 Issue details stored in a separate table (reasonable adaptation)

**What exists:** An `issues` table storing `id`, `title`, `description`, `topic_ids`, `voting_event_id`, `choices` per assembly. The VCP phase 1 report documents this as compensating for an engine limitation: the engine's `VotingEventCreated` event stores issue IDs but not issue details.

**Assessment:** This is a reasonable adaptation. Issue titles and descriptions are needed for API responses and there's no other place to store them. The `issues` table functions as a content store for governance-adjacent data, similar to how the client would store proposal text. This is acceptable as long as it remains content metadata (titles, descriptions) and doesn't expand to include user-generated rich content.

### 3.4 Topic taxonomy stored in VCP (reasonable adaptation)

**What exists:** A `topics` table with hierarchical topic definitions per assembly. Topic management routes at `/assemblies/:id/topics`.

**What was designed:** Topics are not mentioned in the original VCP architecture database schema (Section 5).

**Assessment:** Topics are governance-relevant data — they define the scoping structure for delegations, which is core governance computation. Storing them in the VCP is architecturally defensible. The alternative (client sends topic IDs and the VCP trusts them) would be less robust.

### 3.5 Materialized participation records (reasonable adaptation)

**What exists:** An `issue_participation` table that materializes per-participant voting outcomes (direct/delegated/absent, effective choice, delegation chain). Computed lazily at tally time and queried by the participation endpoint.

**What was designed:** The VCP architecture mentions materialized views for delegation graphs, vote tallies, predictions, poll results, topic trends, and awareness metrics — but not per-participant participation records.

**Assessment:** This is a useful read-side optimization. It avoids recomputing delegation chain resolution for every request on closed events. It's computed from events (as designed) and is idempotent. Good adaptation.

### 3.6 `PATCH /participants/:pid/status` endpoint (reasonable addition)

**What exists:** A status transition endpoint that changes a participant's status (active → inactive → sunset) and cascades delegation revocations on sunset.

**What was designed:** Not in the integration architecture's endpoint list.

**Assessment:** Participant lifecycle management is necessary for any production system. The implementation correctly emits events (`ParticipantStatusChanged`, `DelegationRevoked`), evicts the engine cache, and requires the `operational` auth scope. Well-implemented addition.

### 3.7 `GET /assemblies/:id/events/:eid/participation` endpoint (reasonable addition)

**What exists:** A participation records endpoint with ballot secrecy filtering and delegation visibility controls.

**What was designed:** Not in the integration architecture's endpoint list.

**Assessment:** This endpoint is the backbone of the closed-event historical view in the web client. It correctly applies secrecy filtering (secret ballot hides choices from non-subjects) and delegation visibility filtering (private mode hides structural info). A well-designed addition with proper governance-config-aware access control.

---

## 4. The Identity Question

### What exists now

The VCP has a three-tier identity model:

1. **Users** — global cross-assembly identity. Name, optional email. One user → many participants.
2. **Participants** — assembly-scoped identity. Name, status, user_id link. One participant per assembly.
3. **Engine ParticipantId** — opaque branded string used in all governance computation.

The web client's identity picker calls `GET /users`, which returns all users with their names. When a user is selected, the client stores `{ userId, participantId, participantName }` in localStorage and sends `X-User-Id` and `X-Participant-Id` headers on all requests. The VCP's `requireParticipant` middleware resolves the user ID to an assembly-specific participant ID.

### Why it was introduced

The seed script (`scripts/seed.ts`, lines 77-99) explicitly creates user records and links them to participants across assemblies. This was done to enable the cross-assembly identity selector: Sofia Reyes appears in OSC and Youth, and the client needs to know both participant IDs when she switches assemblies.

Without the users table, the web client would need to:
- Maintain its own user-to-participant mapping
- Handle the "show me all the people who use this system" query locally
- Resolve cross-assembly identity without VCP help

### Whether it's correct

No. The current model contradicts the documented architecture in three ways:

1. **PII in the VCP.** The VCP was designed to be PII-free. It now stores names and emails.
2. **Cross-assembly linking in the VCP.** The VCP was designed with assembly-level isolation. It now maintains a global user registry that links identities across assemblies.
3. **The VCP authenticates users.** The `X-User-Id` header and `requireParticipant` middleware effectively make the VCP aware of user identity — the thing it was designed not to care about.

### Recommendation

**Move identity back to the client.** The VCP should not have a users table, should not store participant names, and should not resolve cross-assembly identity.

**Concrete changes:**

1. **Remove the `users` table and `/users` routes from the VCP.** The VCP should not know that two participants in different assemblies are the same person.

2. **Remove `name` from the `participants` table.** The `POST /assemblies/:id/participants` endpoint should accept `{ id?: string }` (client can provide an opaque ID or let the VCP generate one) but not a name. The `GET /assemblies/:id/participants` response returns IDs and status only.

3. **Remove `user_id` from the `participants` table.** Cross-assembly linking is a client concern.

4. **Move the identity resolver to the client.** The web client maintains a local identity map:
   ```
   { userId: "sofia", assemblies: [
     { assemblyId: "osc-123", participantId: "p_abc" },
     { assemblyId: "youth-456", participantId: "p_def" }
   ]}
   ```
   When the user selects Sofia and navigates to the OSC assembly, the client sends `X-Participant-Id: p_abc`. When she navigates to Youth, the client sends `X-Participant-Id: p_def`. The VCP never knows these are the same person.

5. **The identity picker becomes client-side.** Instead of `GET /users`, the client loads its own user registry (from a local JSON file for dev, from a client-side database or auth provider in production). The seed script populates both the VCP (participants by opaque ID) and the client's identity store (name-to-ID mappings).

6. **Remove the `X-User-Id` header and user-based resolution from auth middleware.** The VCP accepts only `X-Participant-Id`. The client is responsible for knowing which participant ID to send for each assembly.

**Impact:** This is a significant refactor affecting the seed script, web client identity system, VCP auth middleware, and several route handlers that resolve participant names. But it restores the privacy guarantee that the VCP database can be fully exposed without revealing who any participant is — a guarantee that matters for multi-tenant deployment, third-party hosting, and regulatory compliance.

**Risk of not changing:** Every VCP deployment stores PII. Any data breach, misconfigured backup, or overly permissive database access exposes participant identities along with their governance activity. Third-party VCP operators can see who voted how. The privacy architecture described in every design document does not hold.

---

## 5. Consistency Issues

### 5.1 Sovereignty enforcement is inconsistent across write operations

| Operation | Identity source | Middleware validation | Sovereignty enforced? |
|-----------|----------------|----------------------|----------------------|
| Create delegation | `X-User-Id` / `X-Participant-Id` header | `requireParticipant` | Yes — sourceId forced to authenticated caller |
| Revoke delegation | `X-User-Id` / `X-Participant-Id` header | `requireParticipant` | Yes — only source can revoke |
| Cast vote | `body.participantId` | None | No — any participantId accepted |
| Submit poll response | `body.participantId` | None | No — any participantId accepted |
| Commit prediction | `body` (engine params) | None | No — engine accepts any valid ID |
| Change participant status | Path param `/:pid` | `requireScope("operational")` | Scope-gated, not identity-gated |

The fix is straightforward: voting and poll response endpoints should use `requireParticipant` middleware and take the participant ID from the authenticated context, not the request body. This is the same pattern delegations already use.

### 5.2 Delegation visibility defaults are inconsistent

In `delegations.ts:111`:
```typescript
const visibility = info.config.delegation.visibility ?? { mode: "public" as const, incomingVisibility: "direct" as const };
```

In `delegations.ts:160`:
```typescript
const chainVisibility = info.config.delegation.visibility ?? { mode: "public" as const, incomingVisibility: "direct" as const };
```

In `voting.ts:146`:
```typescript
const delegationVisibility = info.config.delegation.visibility ?? { mode: "public" as const };
```

In `awareness.ts:127`:
```typescript
const visibility = info.config.delegation.visibility ?? { mode: "public" as const, incomingVisibility: "direct" as const };
```

The fallback defaults are inconsistent — some include `incomingVisibility`, others don't. This should be a single shared constant or a config validation guarantee that `visibility` is always present.

### 5.3 Assembly existence checks are inconsistent

Some route handlers verify the assembly exists before proceeding:
```typescript
const info = manager.getAssemblyInfo(assemblyId);
if (!info) return c.json({ error: ... }, 404);
```

Others skip this and go directly to `manager.getEngine(assemblyId)`, which will throw an untyped error if the assembly doesn't exist. Examples:

- `POST /assemblies/:id/votes` — no explicit assembly existence check
- `GET /assemblies/:id/polls` — no explicit assembly existence check
- `POST /assemblies/:id/polls/:pid/respond` — no explicit assembly existence check

The error handler catches the resulting exception and maps it to a 404, but the error path is inconsistent with routes that do explicit checks.

### 5.4 CORS allows all origins

In `server.ts:29-33`:
```typescript
app.use("*", cors({
  origin: (origin) => origin,  // reflects any origin
  ...
}));
```

This is fine for local development but is a security issue for production. The CORS policy should be configurable.

---

## 6. Undocumented Changes

### 6.1 Tables not in the design docs

| Table | In vcp-architecture.md? | Status |
|-------|------------------------|--------|
| `events` | Yes | Matches design |
| `assemblies` | Yes | Matches design |
| `clients` | Yes | Matches design |
| `webhook_subscriptions` | Yes | Matches design |
| `users` | No | **REMOVED** — was undocumented PII store |
| `participants` | No (participants were expected to be opaque IDs) | Undocumented — stores names (from engine events). `user_id` column **REMOVED**. |
| `issues` | No | Undocumented — documented in phase 1 report |
| `topics` | No | Undocumented |
| `issue_participation` | No | Undocumented materialized view |

Missing from implementation but in design docs:
- `delegation_graph` (materialized view) — delegations are computed live from events instead
- `voting_events` (materialized view) — events are computed live from events
- `vote_tallies` (materialized view) — tallies are computed live
- `predictions` (materialized view) — predictions are computed live
- `poll_results` (materialized view) — results are computed live
- `topic_trends` (materialized view) — trends are computed live
- `awareness_metrics` (materialized view) — metrics are computed live

The absence of pre-computed materialized views is not a problem — the engine computes everything from events on demand, which is correct for the current scale. The design docs anticipated read-performance optimization that isn't needed yet.

### 6.2 Endpoints not in the integration architecture

| Endpoint | Documented? | Notes |
|----------|-------------|-------|
| `GET /assemblies` | No | List all assemblies — added for web client |
| `GET /users` | No | Cross-assembly user list |
| `POST /users` | No | Create user with links |
| `GET /users/:id` | No | Get user |
| `GET /users/:id/assemblies` | No | Cross-assembly memberships |
| `PATCH /participants/:pid/status` | No | Participant lifecycle management |
| `GET /events/:eid/participation` | No | Per-participant participation records |
| `GET /delegations/my-weight` | No | Delegate's weight breakdown |
| `GET /assemblies/:id/topics` | No | Topic list |
| `POST /assemblies/:id/topics` | No | Topic creation |
| `GET /assemblies/:id/polls` | No | Poll list (documented as missing in web-client-report) |
| `GET /assemblies/:id/predictions` | No | Prediction list by participant |

### 6.3 Headers not in the integration architecture

| Header | Documented? | Notes |
|--------|-------------|-------|
| `X-Participant-Id` | Partially (mentioned in CLAUDE.md) | Direct participant identity — now the only identity header |
| `X-User-Id` | No | **REMOVED** — cross-assembly resolution moved to client |

### 6.4 Terminology changes applied partially

The terminology guide (`terminology-ux-guide.md`) was applied to the web client (`terminology-changes-report.md`), but some issues noted in Section 2.12 remain:

- Profile page stat label says "Delegate to You" — correct per the guide (replaces "Trust You")
- Profile page text says "X members delegate to you" — correct
- But the delegations page form header says "Delegate your vote" where the guide suggested "Trust someone with your vote" as the CTA

The delegation page's language is actually better than the guide's suggestion — it avoids the "trust" framing for relationships while still being clear. This is a case where implementation improved on the guide.

---

## 7. Recommendations

### Priority 1: Critical (must fix before any production deployment)

**R1. Remove PII from the VCP.** ~~Implement the identity boundary changes described in Section 4. Remove the `users` table, remove `name` from `participants`, move the identity resolver to the client.~~ **RESOLVED** — `users` table removed, `/users` routes deleted, `user_id` column removed from `participants`, `X-User-Id` header resolution removed. Identity is now owned by the web client via `identity.json` generated by the seed script. Note: participant `name` column retained in `participants` table (already in event payloads; removing requires engine changes).

**R2. Enforce sovereignty on all write operations.** ~~Add `requireParticipant` middleware to `POST /votes` and `POST /polls/:pid/respond`.~~ **RESOLVED** — `requireParticipant` middleware added to `POST /votes`, `POST /polls/:pid/respond`, and `POST /predictions`. All write operations now validate the caller via `X-Participant-Id` header.

### Priority 2: High (should fix before multi-tenant deployment)

**R3. Remove or assembly-scope the users endpoints.** ~~The `/users` endpoints must be gated behind an `operational` scope.~~ **RESOLVED** — Entire users route file deleted. No cross-assembly identity endpoints exist.

**R4. Make CORS configurable.** ~~Replace wildcard-reflecting origin with a configurable allowlist.~~ **RESOLVED** — CORS origins configurable via `VCP_CORS_ORIGINS` env var. Defaults to localhost dev ports.

**R5. Standardize delegation visibility defaults.** ~~Extract the fallback into a shared constant.~~ **RESOLVED** — `DEFAULT_DELEGATION_VISIBILITY` constant in `shared.ts`, used by all route handlers. Fixed the `voting.ts` fallback that was missing `incomingVisibility`.

### Priority 3: Medium (should fix for code quality)

**R6. Standardize assembly existence checks.** ~~All route handlers that take an assembly ID should verify the assembly exists.~~ **RESOLVED** — Global error handler now detects assembly-not-found errors from `getEngine()` and returns 404 consistently.

**R7. Document all undocumented endpoints.** Update `integration-architecture.md` Section 5.2 to include all implemented endpoints. The documentation should match reality. *Remaining — documentation task.*

**R8. Document the identity model decision.** ~~Whether R1 is implemented or the current model is kept, the decision should be documented.~~ **RESOLVED** — R1 was implemented. The identity model now matches the documented architecture: VCP receives opaque ParticipantId values, client owns identity.

### Priority 4: Low (nice to have)

**R9. Add rate limiting middleware.** The VCP architecture (Section 4.3) specifies per-client, per-assembly rate limiting. This is not implemented. *Remaining — production hardening task.*

**R10. Add API versioning.** The integration architecture (Section 8.5) mentions URL-prefix versioning (`/v1/`). This is not implemented. *Remaining — production hardening task.*

**R11. Update the seed script for identity separation.** ~~The seed script needs to generate two artifacts.~~ **RESOLVED** — Seed script now generates VCP data AND `platform/web/public/identity.json` with client-side identity mappings.

### New: Performance (added during remediation)

**R12. Materialized tallies, weights, and concentration.** **RESOLVED** — Three new materialization tables added. Closed events are materialized on first query and served from cache on subsequent requests. Open events compute live.

---

*This audit was conducted by reading every design document, every database schema definition, every API route handler, every middleware file, the complete web client API layer and identity system, the seed scripts, and relevant engine package interfaces. File references are relative to the repository root.*
