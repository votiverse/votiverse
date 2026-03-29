# Scoring Events v2: Lifecycle Management

**Design Document — v2.0**
**March 2026**

---

## 1. Problem

Scoring v1 treats event timelines like voting events: a fixed `opensAt`/`closesAt` window where status is derived purely from timestamps. This works for votes and surveys where deadlines are constitutional, but scoring events have fundamentally different temporal needs:

- **Competition judging** — a judge is traveling; the panel needs an extension
- **Grant review** — all reviewers finished early; waiting for the deadline wastes time
- **Contractor selection** — the RFP process changes; the rubric needs revision before evaluators see it

Scoring events need explicit lifecycle management: draft preparation, manual open/close, and deadline flexibility.

---

## 2. Design

### 2.1 Status model

Replace pure timestamp derivation with an explicit status field on `ScoringEvent`:

```
draft → open → closed
```

| Status | Meaning | Transitions |
|--------|---------|-------------|
| `draft` | Admin is building the rubric and entries. Not visible to evaluators. | → `open` (via `open` command) |
| `open` | Evaluators can view the event and submit/revise scorecards. | → `closed` (via `close` command or auto-close at `closesAt`) |
| `closed` | Scoring is complete. Results are available. Terminal state. | (none) |

**Key change:** Status is no longer derived from `opensAt`/`closesAt` alone. The engine stores an explicit `status` field, updated by commands. The timestamps serve as *defaults* — if no manual action occurs, the event auto-opens at `opensAt` and auto-closes at `closesAt`. But admin commands can override this at any time.

### 2.2 New commands

Three new engine commands on `ScoringService`:

**`open(scoringEventId)`**
- Transitions `draft → open`
- Sets `opensAt` to `now` if the stored `opensAt` is in the future (so evaluators see the correct "opened at" time)
- Rejects if status is not `draft`
- Emits `ScoringEventOpened` event

**`extendDeadline(scoringEventId, newClosesAt)`**
- Updates `closesAt` to a later timestamp
- Only allowed when status is `open`
- `newClosesAt` must be after the current `closesAt` (no shortening — use `close` for early termination)
- Emits `ScoringEventDeadlineExtended` event
- Records the original deadline for audit trail

**`close(scoringEventId)`** (already exists)
- Transitions `open → closed`
- Already emits `ScoringEventClosed`
- No change needed except verifying it works with explicit status field

### 2.3 New event types (appended to `@votiverse/core`)

```typescript
// Event type union additions:
| "ScoringEventOpened"
| "ScoringEventDeadlineExtended"

// Payloads:
interface ScoringEventOpenedPayload {
  scoringEventId: ScoringEventId;
  openedAt: Timestamp;
}

interface ScoringEventDeadlineExtendedPayload {
  scoringEventId: ScoringEventId;
  previousClosesAt: Timestamp;
  newClosesAt: Timestamp;
  extendedAt: Timestamp;
}
```

### 2.4 Changes to `ScoringEvent` type

```typescript
interface ScoringEvent {
  // ... existing fields ...
  status: "draft" | "open" | "closed";       // NEW: explicit status
  manuallyClosed: boolean;                     // existing
  manuallyOpened: boolean;                     // NEW: true if opened via command vs auto-open
  originalClosesAt?: Timestamp;                // NEW: set when deadline is extended
}
```

### 2.5 Auto-open and auto-close

The explicit status model still respects timestamps as defaults:

- **Auto-open:** When `status === "draft"` and `timeProvider.now() >= opensAt`, any read operation (getStatus, getScoringEvent) should report the event as `open`. The engine should transition the status lazily or via a periodic check. Recommendation: transition lazily on first access after `opensAt`.
- **Auto-close:** When `status === "open"` and `timeProvider.now() >= closesAt`, same lazy transition to `closed`.

This means an admin who creates a scoring event with `opensAt` in 2 hours doesn't need to manually open it — it opens automatically. But an admin who creates with `startAsDraft: true` keeps it in draft until they explicitly call `open`.

### 2.6 Create flow changes

`CreateScoringEventParams` gets a new optional field:

```typescript
interface CreateScoringEventParams {
  // ... existing fields ...
  startAsDraft?: boolean;  // Default: false (immediate open, backward compatible)
}
```

When `startAsDraft` is true:
- The event is created with `status: "draft"`
- `opensAt` is informational (planned open time) but doesn't trigger auto-open
- The event is only visible to admins until `open()` is called

When `startAsDraft` is false (default):
- Current behavior — event opens immediately or at `opensAt`
- Backward compatible with v1

---

## 3. Implementation Plan

### 3.1 Layer order

Same as v1: core → scoring → engine → VCP → backend → web.

### 3.2 Step 1: Core event types

Add to `packages/core/src/events.ts`:
- `ScoringEventOpened` event type and payload
- `ScoringEventDeadlineExtended` event type and payload
- Update `DomainEvent` union

### 3.3 Step 2: Scoring package

Update `packages/scoring/src/types.ts`:
- Add `status: "draft" | "open" | "closed"` to `ScoringEvent`
- Add `manuallyOpened: boolean` to `ScoringEvent`
- Add `originalClosesAt?: Timestamp` to `ScoringEvent`
- Add `startAsDraft?: boolean` to `CreateScoringEventParams`

Update `packages/scoring/src/scoring-service.ts`:
- **`create()`** — set initial status based on `startAsDraft` and current time vs `opensAt`
- **`open()`** — new command, transitions draft → open
- **`extendDeadline()`** — new command, updates closesAt
- **`close()`** — verify it checks explicit status, not just timestamps
- **`getStatus()`** — use explicit status field with lazy auto-transitions
- **`submitScorecard()`** — check explicit status is `open`, not timestamp derivation
- **`rehydrate()`** — handle new event types

Add tests for:
- Draft → open → closed lifecycle
- Auto-open at `opensAt`
- Auto-close at `closesAt`
- Manual open before `opensAt`
- Manual close before `closesAt`
- Extend deadline
- Submit rejected in draft state
- Submit rejected in closed state

### 3.4 Step 3: Engine wiring

Update `packages/engine/src/engine.ts`:
- Add `scoring.open()` method
- Add `scoring.extendDeadline()` method
- Re-export new types

### 3.5 Step 4: VCP routes

Update `platform/vcp/src/api/routes/scoring.ts`:
- **`POST /assemblies/:id/scoring/:eid/open`** — open a draft event (admin-enforced)
- **`POST /assemblies/:id/scoring/:eid/extend`** — extend deadline (admin-enforced), body: `{ closesAt: string }`
- **`POST /assemblies/:id/scoring/:eid/close`** — already exists
- **`GET /assemblies/:id/scoring`** — filter: admins see draft events, non-admins don't
- Update materialization for new event types

VCP migration:
- Add `status TEXT NOT NULL DEFAULT 'open'` to `scoring_events` table
- Add `original_closes_at TEXT` to `scoring_events` table

### 3.6 Step 5: Backend proxy

Update `platform/backend/src/api/routes/proxy.ts`:
- Add admin enforcement for `POST /scoring/:eid/open`
- Add admin enforcement for `POST /scoring/:eid/extend`
- (close already enforced)

### 3.7 Step 6: Web UI

**Scoring list page:**
- Admins see draft events with a "Draft" badge
- Three tabs: "Drafts" (admin only), "Open", "Closed" — or keep two tabs and show drafts as a section above like proposals show drafts above submitted

**Scoring detail page — admin controls:**
- When `draft`: show "Open Scoring" button + ability to edit rubric/entries/settings
- When `open`: show "Close Scoring" button + "Extend Deadline" action
- When `closed`: show results (existing behavior)

**Extend deadline dialog:**
- Simple date picker showing current deadline and allowing a new one
- Validation: new date must be after current `closesAt`

**Create form:**
- Add "Save as Draft" secondary action alongside "Publish Scoring Event"
- "Save as Draft" creates with `startAsDraft: true`
- "Publish" creates with immediate open (current behavior)

**Status derivation:**
- Update `deriveScoringStatus()` to accept the explicit status from the API rather than deriving from timestamps
- Keep timestamp-based derivation as fallback for backward compatibility

**i18n additions:**
- `scoring.draft` / `scoring.statusDraft` — "Draft"
- `scoring.openScoring` — "Open Scoring"
- `scoring.closeScoring` — "Close Scoring"
- `scoring.extendDeadline` — "Extend Deadline"
- `scoring.saveAsDraft` — "Save as Draft"
- `scoring.extendTo` — "Extend to"
- `scoring.deadlineExtended` — "Deadline extended from {{original}}"
- `scoring.confirmClose` — "Close this scoring event? Evaluators will no longer be able to submit or revise scorecards."

---

## 4. Draft editing

When a scoring event is in `draft` status, the admin should be able to edit:
- Title and description
- Entries (add, remove, rename)
- Rubric (categories, dimensions, weights, scales)
- Settings (secretScores, allowRevision, normalizeScores)
- Panel members
- Timeline (opensAt, closesAt)

Once the event transitions to `open`, the rubric and entries are frozen — you cannot change the scoring criteria after evaluators have started submitting. Settings (secretScores, allowRevision) could theoretically be changed mid-event, but v2 keeps them frozen after open for simplicity.

This requires a new engine command:

```typescript
updateDraft(scoringEventId: ScoringEventId, params: Partial<CreateScoringEventParams>): Promise<ScoringEvent>
```

This emits a `ScoringEventDraftUpdated` event and replaces the draft state. Only allowed when `status === "draft"`.

The web UI reuses the create form as an edit form when viewing a draft event.

---

## 5. Scope summary

| Feature | Engine | VCP | Backend | Web |
|---------|--------|-----|---------|-----|
| Explicit status field | `ScoringEvent.status` | Migration + response | — | Status from API |
| Close early | Existing `close()` | Existing route | Existing enforcement | "Close Scoring" button |
| Extend deadline | New `extendDeadline()` | New route | New enforcement | "Extend Deadline" dialog |
| Draft state | New `open()`, `updateDraft()` | New routes + visibility filter | New enforcement | Draft section, "Save as Draft", edit form |
| Auto-open/close | Lazy transition in `getStatus()` | — | — | — |

---

## 6. What this does NOT include

- **Reopen a closed event** — closed is terminal. If you need to re-score, create a new event.
- **Shorten a deadline** — use "Close Early" instead. Shortening creates confusion about whether evaluators had enough time.
- **Per-entry open/close** — all entries share the same lifecycle. If you need to score entries at different times, create separate events.
- **Rubric versioning** — editing a draft replaces the rubric, it doesn't create versions. Once open, the rubric is frozen.
