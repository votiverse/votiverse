# Delegation Sovereignty, Lifecycle & Visibility — Design Document

## Context

The delegation system has three critical gaps discovered during UX review:

1. **No authorization** — Anyone can create delegations "from" any participant and revoke anyone's delegation. The engine trusts callers blindly, and the VCP API does no identity verification. The `DelegationRevokedEvent` doesn't even record who initiated the revocation.

2. **No lifecycle management** — Delegations live forever. There's no expiry, no way to handle a delegator who has left or passed away, and `revocableAnytime` exists in the config but is never enforced.

3. **No visibility controls** — All delegations are visible to all users. The whitepaper explicitly states visibility should be configurable per assembly. The current UI shows an admin-like view to every participant, including revoke buttons on other people's delegations.

This design document is the specification for fixing all three. It will serve as the prompt for the CLI agent to implement the changes.

### Design Principles (from discussion with project owner)

- Only the delegator can revoke their delegation. No admin override. No backdoor.
- Delegation visibility is an assembly-level config. When public, everyone sees the same data. When private, you only see your own.
- No admin privilege tier — admins don't get more visibility than voters.
- Delegates always know their total weight, regardless of visibility settings.
- Incoming visibility (who delegated to me) is parameterized: `"direct"` vs `"chain"`.
- Participant "sunset" (deactivation) handles the "delegator is gone" problem by expiring all their delegations. This is a status change on the participant, not targeted revocation.

---

## Pillar 1: Delegation Sovereignty & Authorization

### 1.1 Where Authorization Lives

**Authorization enforcement belongs at the VCP layer, not the engine.**

The engine is a trusted library — its callers are responsible for establishing identity. Adding caller identity to every engine method would violate its design as a pure governance logic library. The VCP is the HTTP boundary where untrusted input arrives.

**Exception:** `revocableAnytime` enforcement belongs in the engine. It's a governance rule (like `maxDelegatesPerParticipant`), not an access control check.

### 1.2 Participant Identity on Requests

The web UI already stores participant identity in localStorage and sends it as part of request bodies. The change is to formalize this as a header that the server validates.

**Changes to `platform/vcp/src/api/middleware/auth.ts`:**
- Create `requireParticipant` middleware that reads `X-Participant-Id` header, validates the participant exists in the assembly, and sets it on the request context
- Apply to delegation mutation routes (POST, DELETE) — not to read routes (those are governed by visibility config)

**Changes to `platform/web/src/api/client.ts`:**
- Include `X-Participant-Id` header on all requests when identity is available
- Remove `sourceId` from the `createDelegation` request body — server derives it from the header

### 1.3 Sovereignty Enforcement on Routes

**`POST /assemblies/:id/delegations` (create):**
- Force `sourceId = authenticated participant`. Ignore `sourceId` from request body.
- Return 403 if no participant identity on request.

**`DELETE /assemblies/:id/delegations/:did` (revoke):**
- Look up delegation. If `delegation.sourceId !== authenticated participant`, return 403.
- No admin override. No backdoor.

### 1.4 Revocation Audit Trail

**Changes to `packages/core/src/events.ts`:**

Add initiator tracking to `DelegationRevokedPayload`:

```
DelegationRevokedPayload:
  delegationId: DelegationId
  sourceId: ParticipantId
  topicScope: readonly TopicId[]
  revokedBy: DelegationRevocationInitiator   ← NEW

DelegationRevocationInitiator =
  | { kind: 'source' }                                      // delegator revoked their own
  | { kind: 'sunset', participantId: ParticipantId }         // participant was sunset
  | { kind: 'expiry' }                                       // TTL expired
  | { kind: 'system', reason: string }                       // system-initiated (future)
```

**Backward compatibility:** Existing events without `revokedBy` default to `{ kind: 'source' }` during replay. The `buildActiveDelegations()` function doesn't use this field — it only matches on `delegationId`.

### 1.5 Engine: Enforce `revocableAnytime`

**Changes to `packages/delegation/src/delegation-service.ts`:**

In `revoke()`, check the config before proceeding:

```
if (!this.config.delegation.revocableAnytime) {
  throw GovernanceRuleViolation('revocableAnytime', '...')
}
```

Pass `revokedBy` through `RevokeDelegationParams` (optional, defaults to `{ kind: 'source' }`), include it in the emitted `DelegationRevokedEvent`.

**BOARD_PROXY note:** `revocableAnytime: false` means the engine rejects all revocations. The whitepaper's "revocable before meeting" semantic requires future work where the engine accepts a voting event context and checks timing. Out of scope — mark with `// DECISION NEEDED:`.

### 1.6 New Error Type

**Add to `packages/core/src/errors.ts`:**

```
AuthorizationError extends VotiverseError
  action: string
  reason: string
```

Thrown at the VCP layer. Defined in core for consistent error handling across the stack.

### 1.7 Web UI: Delegation Form Changes

**Changes to `platform/web/src/pages/delegations.tsx`:**
- Remove the "From (Delegator)" dropdown. The source is always the current participant (from `useIdentity()`).
- Display current identity as read-only text.
- Revoke button only appears on delegations where `sourceId === currentParticipantId`.

---

## Pillar 2: Delegation Lifecycle

### 2.1 Delegation Expiry (TTL)

**Config addition to `DelegationConfig`:**

```
maxAge: number | null   // milliseconds, null = never expires
```

**How it works with event sourcing — computed, not event-based:**

Expiry is determined at query time: if `(now - delegation.createdAt) > maxAge`, the delegation is excluded from the active set. No cron job, no `DelegationExpired` events needed.

This preserves the event sourcing property that state is a pure function of events + config. Given the same log and config, the same delegations are active.

**Changes to `packages/delegation/src/graph.ts`:**

`buildActiveDelegations()` gains a config-aware option:

```
buildActiveDelegations(eventStore, options?: {
  before?: Timestamp
  maxAge?: number | null
  asOf?: Timestamp       // defaults to now()
})
```

After building the active set from events, filter: exclude delegations where `(asOf - createdAt) > maxAge`.

**Changes to `packages/delegation/src/delegation-service.ts`:**

All methods that call `buildActiveDelegations()` pass `{ maxAge: this.config.delegation.maxAge }`.

### 2.2 Participant Status Model

**New type in `packages/core/src/types.ts`:**

```
ParticipantStatus = 'active' | 'inactive' | 'sunset'
```

**Extend `Participant` interface:**

```
Participant:
  id, name, registeredAt
  status: ParticipantStatus   ← NEW (defaults to 'active')
```

**Semantics:**
- `active` — normal participant
- `inactive` — temporarily unavailable. Delegations remain valid but the awareness layer flags delegations TO this participant as potentially orphaned.
- `sunset` — permanently departed. ALL delegations from AND to this participant are revoked.

**New event in `packages/core/src/events.ts`:**

```
ParticipantStatusChangedPayload:
  participantId: ParticipantId
  previousStatus: ParticipantStatus
  newStatus: ParticipantStatus
  reason: string
```

### 2.3 Sunset Cascade

When a participant is sunset, the VCP layer orchestrates revocation:

1. Emit `ParticipantStatusChanged` event with `newStatus: 'sunset'`.
2. Query all active delegations where the participant is source OR target.
3. Emit `DelegationRevoked` events for each, with `revokedBy: { kind: 'sunset', participantId }`.

This is VCP-level orchestration. The engine processes each event independently — no side effects in the engine.

### 2.4 VCP Endpoint for Status Changes

**New route in `platform/vcp/src/api/routes/participants.ts`:**

```
PATCH /assemblies/:id/participants/:pid/status
Body: { status: "active" | "inactive" | "sunset", reason: string }
```

**Authorization: separate auth scope.** Sunsetting a participant is an operational action, not a governance action. It requires a different API key or auth scope than normal participant operations. The current `ClientInfo` model needs to be extended with scopes/roles:

- Regular participant API keys can only perform participant-level actions (vote, delegate, respond to polls).
- Operational API keys (a new concept) can perform status changes like sunset.
- The web UI does NOT expose sunset controls — it's an operational tool, accessed via API or CLI.

This keeps the "no admin privilege tier" principle intact for governance operations (voting, delegating, viewing) while acknowledging that participant lifecycle management is a separate operational concern.

Emits the status event, updates the DB, and if sunset, orchestrates delegation revocations.

### 2.5 Expiry Notifications (Awareness Integration)

When `maxAge` is configured, the awareness layer adds a `'delegation-expiring'` engagement prompt when a delegation reaches 80% of its TTL. This prompts the delegator to renew (re-create) the delegation.

**Changes to `packages/awareness/src/` — new prompt reason.**

### 2.6 Validation Rules

- `maxAge` set when delegation disabled → warning
- `maxAge < 1 day` → error

### 2.7 Preset Values for `maxAge`

| Preset | maxAge |
|---|---|
| TOWN_HALL | null (disabled) |
| SWISS_MODEL | null (disabled) |
| LIQUID_STANDARD | null |
| LIQUID_ACCOUNTABLE | null |
| BOARD_PROXY | null |
| CIVIC_PARTICIPATORY | 31536000000 (365 days) |

---

## Pillar 3: Delegation Visibility

### 3.1 Config Schema

**New type in `packages/config/src/types.ts`:**

```
DelegationVisibilityConfig:
  mode: 'public' | 'private'
  incomingVisibility: 'direct' | 'chain'
```

**Add to `DelegationConfig`:**

```
visibility: DelegationVisibilityConfig
```

### 3.2 Visibility Rules

| Participant Role | mode = public | mode = private |
|---|---|---|
| Source (my outgoing) | See all delegations | See only my outgoing delegations |
| Target (my incoming) | See all delegations | See delegations TO me (filtered by incomingVisibility) |
| Unrelated participant | See all delegations | Cannot see any individual edges |
| **Weight** | Full distribution visible | Delegates always see own total weight |
| **Aggregates** (gini, concentration) | Visible to all | Visible to all |
| **Chain resolver** | Any participant | Only your own chain |

**Key rule:** Aggregate statistics are ALWAYS visible to all participants (per whitepaper). Weight distribution is an aggregate — it shows totals, not edge structure. Delegation visibility controls the graph (who → whom), not the computed weights.

### 3.3 API Endpoint Changes

**`GET /assemblies/:id/delegations`:**
- Read `X-Participant-Id` header (optional for GET).
- If `mode === 'private'` and no identity: return empty list.
- If `mode === 'private'` and identity present: filter to delegations where caller is source or target.
- If `mode === 'public'`: return all (no revoke capability indicated — read only).

**`GET /assemblies/:id/delegations/chain`:**
- If `mode === 'private'` and `queryParticipantId !== callerId`: return 403.
- If `mode === 'public'`: resolve for any participant.

**`GET /assemblies/:id/awareness/profile/:pid`:**
- If `mode === 'private'` and caller is NOT the profile subject: return `delegatorsCount` but NOT `delegatorsIds`.
- If caller IS the profile subject: filter `delegatorsIds` by `incomingVisibility`.

**New endpoint — `GET /assemblies/:id/delegations/my-weight?issueId=xxx`:**

```json
{
  "participantId": "...",
  "issueId": "...",
  "directWeight": 1,
  "delegatedWeight": 3,
  "totalWeight": 4,
  "delegatorsCount": 3,
  "delegators": ["..."]
}
```

Always available regardless of visibility mode. The `delegators` array is conditional on `incomingVisibility` config.

### 3.4 Preset Values for Visibility

| Preset | mode | incomingVisibility | Rationale |
|---|---|---|---|
| TOWN_HALL | private | direct | Delegation disabled, irrelevant |
| SWISS_MODEL | private | direct | Delegation disabled, irrelevant |
| LIQUID_STANDARD | public | direct | Open liquid democracy, public graph |
| LIQUID_ACCOUNTABLE | public | chain | Maximum transparency, full upstream visible |
| BOARD_PROXY | private | direct | Corporate proxy, relationships private |
| CIVIC_PARTICIPATORY | private | direct | Municipal — whitepaper says "aggregate only" |

### 3.5 Validation Rules

- `mode === 'public'` when delegation disabled → warning
- `incomingVisibility === 'chain'` when `transitive === false` → warning (chain depth always 1)

### 3.6 Web UI: Two-View Redesign

**Tab 1: "My Delegations" (always visible)**
- **My outgoing**: delegations where I am source, with revoke buttons
- **My incoming**: delegations where I am target (filtered by `incomingVisibility`)
- **My weight**: total weight display
- **My chain trace**: resolve my own chain for a given issue
- **Create delegation**: "To" picker only — source is always me

**Tab 2: "Assembly Delegations" (only when `visibility.mode === 'public'`)**
- Read-only list of all delegations. No revoke buttons.
- Chain resolver for any participant.
- This tab is entirely hidden when `mode === 'private'`.

---

## Cross-Cutting Concerns

### Formal Properties

All eight properties from CLAUDE.md are preserved:

1. **Sovereignty** — unchanged (direct vote overrides delegation)
2. **One-person-one-vote** — expiry removes weight correctly (expired delegator has weight 0)
3. **Monotonicity** — unchanged
4. **Revocability** — now explicitly configurable via `revocableAnytime`
5. **Override rule** — unchanged
6. **Cycle resolution** — expiry may break cycles by removing edges (beneficial)
7. **Scope precedence** — unchanged
8. **Poll non-transferability** — unchanged

### Event Backward Compatibility

- `DelegationRevokedPayload.revokedBy`: absent = `{ kind: 'source' }` during replay
- `Participant.status`: absent = `'active'`
- No existing events are invalidated

### Config Derivation

`deriveConfig()` in `packages/config/src/derive.ts` needs two-level merge for the nested `visibility` object.

### SQLite Schema

- Add `status TEXT NOT NULL DEFAULT 'active'` column to `participants` table
- Assembly config JSON already stores the full config — new fields are added automatically when presets are updated

---

## Implementation Sequence

### Phase A: Engine Foundation

| Step | File | Change |
|---|---|---|
| A1 | `packages/core/src/errors.ts` | Add `AuthorizationError` |
| A2 | `packages/core/src/types.ts` | Add `ParticipantStatus`, extend `Participant` with `status` |
| A3 | `packages/core/src/events.ts` | Add `DelegationRevocationInitiator`, extend `DelegationRevokedPayload` with `revokedBy`, add `ParticipantStatusChanged` event |
| A4 | `packages/config/src/types.ts` | Add `DelegationVisibilityConfig`, add `maxAge` and `visibility` to `DelegationConfig` |
| A5 | `packages/config/src/presets.ts` | Update all 6 presets with new fields |
| A6 | `packages/config/src/validation.ts` | New validation rules for maxAge and visibility |
| A7 | `packages/config/src/derive.ts` | Two-level merge for nested `visibility` |
| A8 | `packages/delegation/src/types.ts` | Add `revokedBy` to `RevokeDelegationParams` (optional) |
| A9 | `packages/delegation/src/graph.ts` | Add `maxAge`/`asOf` options to `buildActiveDelegations()`, implement expiry filtering |
| A10 | `packages/delegation/src/delegation-service.ts` | Thread `maxAge` to `buildActiveDelegations()`, enforce `revocableAnytime`, include `revokedBy` in events |
| A11 | `packages/*/tests/` | Tests for expiry, revocableAnytime enforcement, backward compatibility, property-based tests with new config fields |

### Phase B: VCP Platform

| Step | File | Change |
|---|---|---|
| B1 | `platform/vcp/src/adapters/database/sqlite.ts` | Add `status` column to participants table |
| B2 | `platform/vcp/src/api/middleware/auth.ts` | Create `requireParticipant` middleware. Extend `ClientInfo` with auth scopes (participant vs operational). |
| B3 | `platform/vcp/src/api/routes/delegations.ts` | Enforce sovereignty on POST (force sourceId from header) and DELETE (check sourceId matches). Add visibility filtering on GET. Add `/my-weight` endpoint. |
| B4 | `platform/vcp/src/api/routes/participants.ts` | Add `PATCH .../status` endpoint with sunset cascade. Require operational auth scope. |
| B5 | `platform/vcp/src/api/routes/awareness.ts` | Visibility filtering on delegate profile |
| B6 | `platform/vcp/scripts/seed-data/` | Update preset configs with new fields |
| B7 | VCP tests | Authorization, visibility, lifecycle tests |

### Phase C: Web UI

| Step | File | Change |
|---|---|---|
| C1 | `platform/web/src/api/client.ts` | Include `X-Participant-Id` header, remove `sourceId` from createDelegation body |
| C2 | `platform/web/src/api/types.ts` | Add `DelegationVisibilityConfig`, `ParticipantStatus`, `maxAge` |
| C3 | `platform/web/src/pages/delegations.tsx` | Two-tab redesign: "My Delegations" + "Assembly Delegations". Remove "From" dropdown. Revoke only on own. Weight display. |
| C4 | `platform/web/src/components/` | New weight display component, participant status indicators |
| C5 | Error handling | Handle new 403 responses for unauthorized delegation operations |

---

## Verification

### Sovereignty
1. As participant A, try to create a delegation "from" participant B → expect 403
2. As participant A, try to revoke participant B's delegation → expect 403
3. As participant A, revoke own delegation → succeeds

### Lifecycle
1. Set `maxAge` on an assembly, create delegation, advance time past maxAge → delegation excluded from active set
2. Sunset a participant → all their delegations (incoming + outgoing) revoked, events recorded with `revokedBy: { kind: 'sunset' }`
3. With `revocableAnytime: false` (BOARD_PROXY), attempt revocation → expect GovernanceRuleViolation

### Visibility
1. In `private` mode assembly: participant sees only their own delegations
2. In `public` mode assembly: participant sees all delegations
3. In `private` mode: chain resolver for another participant → 403
4. In any mode: weight distribution endpoint returns data (aggregate is always visible)
5. `incomingVisibility: 'direct'`: delegate sees direct delegators only
6. `incomingVisibility: 'chain'`: delegate sees full upstream chain

### Web UI
1. Delegation form shows current identity as read-only source
2. "Assembly Delegations" tab hidden in private mode
3. Revoke button only on own delegations
4. Weight displayed for delegates
