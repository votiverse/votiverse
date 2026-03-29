# Scoring Events v2: Lifecycle Management

**Design Document — v2.0**
**March 2026**

---

## 1. Problem

Scoring v1 treats event timelines like voting events: a fixed `opensAt`/`closesAt` window where status is derived purely from timestamps. This works for votes and surveys where deadlines are constitutional, but scoring events have fundamentally different temporal needs:

- **Competition judging** — a judge is traveling; the panel needs an extension.
- **Grant review** — all reviewers finished early; waiting for the deadline wastes time.
- **Contractor selection** — the RFP process changes; the rubric needs revision before evaluators see it.

Scoring events need explicit lifecycle management: draft preparation, manual open/close, and deadline flexibility.

---

## 2. Status Model

### 2.1 Three-state lifecycle

Replace the v1 `"scheduled" | "open" | "closed"` derivation with a three-state model backed by an explicit `status` field:

```
draft → open → closed
```

| Status   | Meaning | Transitions |
|----------|---------|-------------|
| `draft`  | Admin is building the rubric and entries. Not visible to evaluators. Editable via `updateDraft()`. | → `open` (via `open` command or auto-open) · → `closed` (via `close` command — discards the draft) |
| `open`   | Evaluators can view the event and submit/revise scorecards. Rubric and entries are frozen. | → `closed` (via `close` command or auto-close at `closesAt`) |
| `closed` | Scoring is complete. Results available. Terminal state. | (none) |

### 2.2 Commanded vs effective status

The `ScoringEvent` in-memory type stores a **commanded status** — the status last set by a command (`create`, `open`, `close`). Time-based transitions (auto-open, auto-close) are not commands: they don't emit events and don't mutate stored state. Instead, `getStatus()` computes the **effective status** by combining the commanded status with the current time:

```typescript
getStatus(event: ScoringEvent): ScoringStatus {
  const now = this.timeProvider.now();

  // Terminal — always closed
  if (event.status === "closed") return "closed";

  // Explicitly opened — check auto-close
  if (event.status === "open") {
    return now >= event.timeline.closesAt ? "closed" : "open";
  }

  // status === "draft"
  if (event.startAsDraft) return "draft";       // stays draft until open() is called

  // Not startAsDraft — auto-open at opensAt, auto-close at closesAt
  if (now >= event.timeline.closesAt) return "closed";
  if (now >= event.timeline.opensAt)  return "open";
  return "draft";
}
```

This design is consistent with how voting events work — `VotingEventClosed` is only emitted for manual close; natural expiry is derived from `votingEnd`. No events are emitted for time-based scoring transitions either.

### 2.3 Why not four states?

The v1 type has `"scheduled" | "open" | "closed"`. Adding `"draft"` creates four states. But `"scheduled"` and `"draft"` serve the same purpose: "not yet open." The only difference is whether auto-open applies. Rather than encoding that in the status value, we encode it in the `startAsDraft` flag and keep three clean states.

For both `startAsDraft: false` events before `opensAt` and `startAsDraft: true` events, the effective status is `"draft"` — the event hasn't opened yet. The admin knows whether it will auto-open (based on the `opensAt` they set) or requires manual opening (based on the flag they set at creation time).

---

## 3. Commands

### 3.1 `create(params)` (existing, modified)

Creates a scoring event with initial commanded status `"draft"`.

- When `startAsDraft` is false (default, backward compatible): the event will auto-open at `opensAt`. Before that time, the effective status is `"draft"` and the event is editable.
- When `startAsDraft` is true: the event stays in `"draft"` until `open()` is called. `opensAt` is informational (planned open time) and doesn't trigger auto-open.

Emits `ScoringEventCreated` (existing event type, payload extended with `startAsDraft`).

### 3.2 `open(scoringEventId)` — NEW

Transitions `draft → open`.

- Sets the commanded status to `"open"`.
- Always sets `opensAt` to `now`. Whether the original `opensAt` was in the past (admin kept the event in draft past the planned time) or the future (admin is opening early), the timeline should reflect when evaluators actually gained access.
- Rejects if effective status is not `"draft"` (already open or closed).
- Emits `ScoringEventOpened`.

### 3.3 `extendDeadline(scoringEventId, newClosesAt)` — NEW

Extends the deadline for an open scoring event.

- Updates `closesAt` to `newClosesAt`.
- Only allowed when effective status is `"open"`.
- `newClosesAt` must be strictly after the current `closesAt` (no shortening — use `close()` for early termination).
- Records the original `closesAt` in `originalClosesAt` (set on first extension only — preserves the original deadline for audit trail).
- Emits `ScoringEventDeadlineExtended`.

### 3.4 `updateDraft(scoringEventId, updates)` — NEW

Updates a draft scoring event's content, rubric, entries, settings, timeline, or panel.

- Only allowed when effective status is `"draft"`.
- Accepts partial updates but emits a **full-state snapshot** event (`ScoringEventDraftUpdated`). The command merges the updates with the current state, then the event carries the complete new state. This makes rehydration trivial: replace the full in-memory state.
- Cannot change `startAsDraft` (use `open()` instead).
- Validates the updated state the same way `create()` does.

### 3.5 `close(scoringEventId)` (existing, modified)

Transitions `draft → closed` or `open → closed`.

- Works from both `draft` and `open`. Closing a draft discards it — the event was never visible to evaluators, but the event store records that it existed.
- Rejects if effective status is already `"closed"`.
- Emits `ScoringEventClosed` (existing event type, no payload changes).

---

## 4. Event Types

### 4.1 New event types (appended to `@votiverse/core`)

```typescript
// Event type union additions:
| "ScoringEventOpened"
| "ScoringEventDeadlineExtended"
| "ScoringEventDraftUpdated"

// Payloads:

interface ScoringEventOpenedPayload {
  scoringEventId: ScoringEventId;
  /** The opensAt value after the open command — always set to now.
   *  The event's BaseEvent.timestamp also records when open() was called,
   *  consistent with ScoringEventClosedPayload (which has no closedAt field). */
  opensAt: Timestamp;
}

interface ScoringEventDeadlineExtendedPayload {
  scoringEventId: ScoringEventId;
  previousClosesAt: Timestamp;
  newClosesAt: Timestamp;
}

interface ScoringEventDraftUpdatedPayload {
  scoringEventId: ScoringEventId;
  title: string;
  description: string;
  entries: readonly ScoringEntryPayload[];
  rubric: RubricPayload;
  panelMemberIds: readonly ParticipantId[] | null;
  timeline: ScoringTimelinePayload;
  settings: ScoringSettingsPayload;
}
```

### 4.2 Modified event types

`ScoringEventCreatedPayload` gains a new field:

```typescript
interface ScoringEventCreatedPayload {
  // ... all existing fields ...
  startAsDraft?: boolean;  // Default: false (backward compatible with existing events)
}
```

The field is optional so that existing events in the store (which lack it) rehydrate correctly with `false` semantics.

---

## 5. Type Changes

### 5.1 `ScoringEvent` (in-memory type)

```typescript
interface ScoringEvent {
  // ... existing fields (id, title, description, entries, rubric,
  //     panelMemberIds, timeline, settings, createdAt) ...

  status: "draft" | "open" | "closed";    // REPLACES manuallyClosed
  startAsDraft: boolean;                    // NEW: controls auto-open behavior
  originalClosesAt?: Timestamp;             // NEW: original deadline before first extension
}
```

The `manuallyClosed: boolean` field is removed. Its semantics are subsumed by `status === "closed"`.

Note: `timeline.opensAt` and `timeline.closesAt` are now logically mutable — `open()` updates `opensAt`, `extendDeadline()` updates `closesAt`, and `updateDraft()` can update both. The `readonly` modifier on the type is preserved (immutable value semantics — the entire `ScoringEvent` object is replaced, never mutated in place).

### 5.2 `ScoringStatus` type

```typescript
// BEFORE (v1):
type ScoringStatus = "scheduled" | "open" | "closed";

// AFTER (v2):
type ScoringStatus = "draft" | "open" | "closed";
```

### 5.3 `CreateScoringEventParams`

```typescript
interface CreateScoringEventParams {
  // ... existing fields ...
  startAsDraft?: boolean;  // Default: false
}
```

### 5.4 `UpdateDraftParams` (new)

```typescript
interface UpdateDraftParams {
  title?: string;
  description?: string;
  entries?: readonly Omit<ScoringEntry, "id">[];
  rubric?: Rubric;
  panelMemberIds?: readonly ParticipantId[] | null;
  timeline?: ScoringTimeline;
  settings?: ScoringSettings;
}
```

All fields optional — the command merges with current state.

---

## 6. Auto-open and Auto-close

Time-based transitions are purely derived — no events are emitted, no in-memory state is mutated. The `getStatus()` method is a pure function of `(event, now)`.

| Commanded status | `startAsDraft` | `now` vs timestamps | Effective status |
|-----------------|----------------|---------------------|------------------|
| `closed` | any | any | `closed` |
| `open` | any | `now < closesAt` | `open` |
| `open` | any | `now >= closesAt` | `closed` |
| `draft` | `true` | any | `draft` |
| `draft` | `false` | `now >= closesAt` | `closed` |
| `draft` | `false` | `now >= opensAt` | `open` |
| `draft` | `false` | `now < opensAt` | `draft` |

This table is exhaustive. The derivation is deterministic and stateless.

### Interaction with commands

Commands check the **effective** status, not the commanded status:
- `open()` requires effective status `"draft"` — rejects if already open or closed (including time-closed).
- `close()` requires effective status not `"closed"` — can close from draft or open.
- `extendDeadline()` requires effective status `"open"` — only extend an active event.
- `updateDraft()` requires effective status `"draft"` — only edit a not-yet-open event.
- `submitScorecard()` / `reviseScorecard()` require effective status `"open"`.

### Editability window for non-draft events

When `startAsDraft` is false and `opensAt` is in the future, the event is editable via `updateDraft()` until `opensAt` arrives. Once `now >= opensAt`, the effective status becomes `"open"` and the rubric/entries freeze. This gives admins an implicit editing window between creation and `opensAt`.

---

## 7. Draft Editing

When a scoring event is in `draft` status (effective), the admin can update:
- Title and description
- Entries (add, remove, rename — new entry IDs are generated for all entries in the update; this is safe because no scorecards can exist in draft state)
- Rubric (categories, dimensions, weights, scales)
- Settings (secretScores, allowRevision, normalizeScores)
- Panel members
- Timeline (opensAt, closesAt)

Once the effective status transitions to `open`, everything is frozen. Evaluators score against a stable rubric. The `extendDeadline()` command is the only modification allowed on open events.

The `ScoringEventDraftUpdated` event carries a full state snapshot. On rehydration, it completely replaces the in-memory state for that scoring event (preserving only `id`, `status`, `startAsDraft`, `createdAt`, `originalClosesAt`).

The web UI reuses the create form as an edit form when viewing a draft event.

---

## 8. Implementation Plan

### 8.1 Layer order

Same as v1: core → scoring → engine → VCP → backend → web.

### 8.2 Step 1: Core event types

Add to `packages/core/src/events.ts`:
- `ScoringEventOpened` type, payload, and concrete event type
- `ScoringEventDeadlineExtended` type, payload, and concrete event type
- `ScoringEventDraftUpdated` type, payload, and concrete event type
- `startAsDraft?: boolean` to `ScoringEventCreatedPayload`
- Update `EventType` union and `DomainEvent` union
- Update exports in `index.ts`

### 8.3 Step 2: Scoring package

Update `packages/scoring/src/types.ts`:
- Change `ScoringStatus` from `"scheduled" | "open" | "closed"` to `"draft" | "open" | "closed"`
- Replace `manuallyClosed: boolean` with `status: "draft" | "open" | "closed"` on `ScoringEvent`
- Add `startAsDraft: boolean` to `ScoringEvent`
- Add `originalClosesAt?: Timestamp` to `ScoringEvent`
- Add `startAsDraft?: boolean` to `CreateScoringEventParams`
- Add `UpdateDraftParams` type

Update `packages/scoring/src/scoring-service.ts`:
- **`create()`** — set `status: "draft"`, `startAsDraft: params.startAsDraft ?? false`
- **`open()`** — new command: `draft → open`, update `opensAt` if needed
- **`extendDeadline()`** — new command: update `closesAt`, set `originalClosesAt`
- **`updateDraft()`** — new command: merge updates, emit full-snapshot event
- **`close()`** — update to use `status` field, allow close from `draft`
- **`getStatus()`** — new derivation using `status + startAsDraft + timestamps`
- **`requireOpen()`** — use `getStatus()` which already does the right thing
- **`rehydrate()`** — handle new event types, backward compat for old events (no `startAsDraft` → `false`)

Tests for:
- Full lifecycle: draft → open → closed
- Auto-open at `opensAt` (when `startAsDraft: false`)
- Auto-close at `closesAt`
- Manual open before `opensAt`
- Close from draft (discard)
- Close from open (early close)
- Extend deadline
- Reject extend on draft/closed
- updateDraft with rubric/entry changes
- Reject updateDraft on open event
- Submit rejected in draft state
- Submit rejected in closed state
- Backward compat: events without `startAsDraft` behave as v1

### 8.4 Step 3: Engine wiring

Update `packages/engine/src/engine.ts`:
- Add `scoring.open()` method
- Add `scoring.extendDeadline()` method
- Add `scoring.updateDraft()` method

### 8.5 Step 4: VCP

**Migration** (new file `004_scoring_lifecycle.{sqlite,postgres}.sql`):
- Add `status TEXT NOT NULL DEFAULT 'open'` to `scoring_events`
- Add `original_closes_at TEXT` to `scoring_events`
- Add `start_as_draft INTEGER NOT NULL DEFAULT 0` to `scoring_events`

Existing rows get `status = 'open'`, `start_as_draft = 0` (backward compatible — they were published, not drafts). Effective status is derived from timestamps on read.

**Important:** The `status` column stores the **commanded** status, not the effective status. The VCP computes effective status on every read (list and detail responses) using the same derivation as the engine's `getStatus()`. This avoids needing to update the SQL column on time-based transitions.

**Route changes** (`platform/vcp/src/api/routes/scoring.ts`):
- **`POST /assemblies/:id/scoring`** — persist `status`, `start_as_draft` in SQL
- **`POST /assemblies/:id/scoring/:eid/open`** — new route, calls engine, updates SQL `status` and `opens_at`
- **`POST /assemblies/:id/scoring/:eid/extend`** — new route, body: `{ closesAt: string }`, calls engine, updates SQL `closes_at` and `original_closes_at`
- **`PUT /assemblies/:id/scoring/:eid`** — new route for draft update, calls engine, updates all mutable SQL columns
- **`GET /assemblies/:id/scoring`** — return effective status in response; filter drafts from non-admin responses
- **`GET /assemblies/:id/scoring/:eid`** — return effective status in response; return 404 for non-admins requesting a draft event (the "not visible to evaluators" guarantee applies to direct URL access too, not just the list)
- Update `ScoringEventRow` type and `rowToScoringEventResponse` helper — add an `effectiveStatus()` function that applies the same derivation logic as the engine's `getStatus()`, using `status`, `start_as_draft`, `opens_at`, `closes_at`, and the current time from the assembly's TimeProvider (dev clock aware)
- Update `isClosed` checks (scorecards, results) to use effective status instead of raw timestamp comparison

### 8.6 Step 5: Backend proxy

Update `platform/backend/src/api/routes/proxy.ts`:
- Add admin enforcement for `POST /scoring/:eid/open`
- Add admin enforcement for `POST /scoring/:eid/extend`
- Add admin enforcement for `PUT /scoring/:eid` (draft update)

### 8.7 Step 6: Web UI

**Status derivation** (`platform/web/src/lib/status.ts`):
- Update `ScoringStatus` type to `"draft" | "open" | "closed"`
- Update `deriveScoringStatus()` to accept optional explicit status from API. When the API provides `status`, `startAsDraft`, and timestamps, use the same derivation logic. Keep timestamp-only fallback for backward compat.

**Scoring list page:**
- Admins see a "Drafts" section above the tab bar (or a third tab) showing draft events
- Non-admins don't see drafts (filtered by API)
- Open/Closed tabs remain

**Scoring detail page — admin controls:**
- When `draft`: show "Open Scoring" button + "Edit" button (opens the create form in edit mode) + "Discard" action (calls close)
- When `open`: show "Close Scoring" button + "Extend Deadline" action
- When `closed`: show results (existing behavior)

**Extend deadline dialog:**
- Date picker showing current deadline, allowing a new one
- Validation: new date must be after current `closesAt`
- Shows `originalClosesAt` when set: "Originally due {{date}}"

**Create form:**
- Add "Save as Draft" secondary button alongside "Publish Scoring Event"
- "Save as Draft" creates with `startAsDraft: true`
- "Publish" creates with `startAsDraft: false` (current behavior)
- When editing a draft, the form pre-fills and the primary action is "Save Changes"

**i18n additions:**
- `scoring.statusDraft` — "Draft"
- `scoring.openScoring` — "Open Scoring"
- `scoring.closeScoring` — "Close Scoring"
- `scoring.extendDeadline` — "Extend Deadline"
- `scoring.saveAsDraft` — "Save as Draft"
- `scoring.extendTo` — "New deadline"
- `scoring.deadlineExtended` — "Extended from {{original}}"
- `scoring.confirmClose` — "Close this scoring event? Evaluators will no longer be able to submit or revise scorecards."
- `scoring.confirmDiscard` — "Discard this draft? The scoring event will be closed without ever opening."
- `scoring.editDraft` — "Edit Draft"
- `scoring.discardDraft` — "Discard"
- `scoring.draftsSection` — "Drafts"
- `scoring.noDrafts` — "No draft scoring events"
- `scoring.saveChanges` — "Save Changes"
- `scoring.originalDeadline` — "Originally due {{date}}"

---

## 9. Scope Summary

| Feature | Engine | VCP | Backend | Web |
|---------|--------|-----|---------|-----|
| Explicit status field | `ScoringEvent.status` replaces `manuallyClosed` | Migration + API response | — | Status from API |
| Close early | Modified `close()` (accepts draft too) | Existing route | Existing enforcement | "Close Scoring" / "Discard" button |
| Extend deadline | New `extendDeadline()` | New route | New enforcement | "Extend Deadline" dialog |
| Draft state | New `open()`, `updateDraft()` | New routes + visibility filter | New enforcement | Draft section, "Save as Draft", edit form |
| Auto-open/close | Pure derivation in `getStatus()` | Computed on read | — | Computed from API response |

---

## 10. What This Does NOT Include

- **Reopen a closed event** — closed is terminal. If you need to re-score, create a new event.
- **Shorten a deadline** — use "Close Early" instead. Shortening creates confusion about whether evaluators had enough time.
- **Per-entry open/close** — all entries share the same lifecycle. If you need to score entries at different times, create separate events.
- **Rubric versioning** — editing a draft replaces the rubric, it doesn't create versions. Once open, the rubric is frozen.

---

## 11. Design Rationale

### Why `status` replaces `manuallyClosed`

The v1 `manuallyClosed: boolean` tracks one bit of information (was `close()` called?). The v2 `status` field tracks the full state machine. Since the state machine is `draft → open → closed`, a single `status` field is strictly more expressive and replaces the boolean without loss.

### Why no `manuallyOpened` field

The v2 design originally proposed a `manuallyOpened: boolean` to distinguish admin-opened events from auto-opened ones. This is unnecessary — the event log already records `ScoringEventOpened` for manual opens. The information exists; it just doesn't need to be denormalized into the in-memory type because no business logic branches on it.

### Why `updateDraft` emits a full snapshot, not a partial diff

Event sourcing rehydration replays events to rebuild state. If `ScoringEventDraftUpdated` carried a partial diff (`{ title?: string, entries?: ... }`), the replay logic would need to merge partials — which introduces ordering sensitivity and edge cases. A full snapshot makes rehydration trivial: replace the state entirely. The command accepts partials for ergonomics; the event stores the resolved full state.

### Why `close()` works from `draft`

An admin who creates a draft and decides to abandon it needs a way to discard it. Options: (a) a separate "delete" or "discard" command, (b) allow `close()` from draft. Option (b) is simpler — same command, same event (`ScoringEventClosed`), same terminal state. The event log tells an honest story: `ScoringEventCreated → ScoringEventClosed` (never opened = discarded). No new concepts needed.

### Why no events for auto-open/auto-close

This follows the existing architectural pattern for voting events. Time-based transitions are deterministic given `(events, now)` — they add no information that can't be derived. Emitting events on read would create side effects on query operations, violating the CQRS principle that reads are pure. It would also require the VCP to materialize state changes during GET requests, complicating the read path.
