# Vote Lifecycle: Abort-During-Voting and Archive-Closed

**Status:** Proposed (deferred follow-ups to shipped vote cancellation)
**Date:** 2026-07-10
**Context:** `docs/design/entity-mutability.md`, `docs/design/groups-and-capabilities.md`, `docs/design/governance-parameter-space.md`, `docs/design/notification-hub.md`, Paper I (integrity, one-person-one-vote)

---

## 1. Problem Statement

A voting event moves through four phases — **deliberation → curation → voting → closed** (`platform/vcp/src/engine/event-phases.ts`). What it means to "remove" a vote depends entirely on which phase it is in, because the stakes are whether cast votes get invalidated.

We shipped the first, lowest-stakes case on 2026-07-10: **Cancel a vote before voting opens** (engine `cancelEvent`/`isEventCancelled` + `VotingEventCancelled`; VCP `POST …/events/:eid/cancel`; backend admin gate; web admin control). See section 3.

Two phases remain uncovered, and each is a distinct feature wearing the same "delete a vote" label:

- **Abort-during-voting** — stopping a vote whose window is open and which already has cast votes. This is the hard one: it destroys/voids in-flight votes and has integrity implications.
- **Archive-closed** — hiding a finished vote from the active list to declutter, without touching the governance record. This is the easy one conceptually, but has a real architectural wrinkle (the backend does not own events).

This document specifies both so they can be approved and built independently. It is deliberately opinionated but flags every decision the project owner must make.

---

## 2. Background: what "delete" must mean here

Two architectural constraints from `CLAUDE.md` shape everything below:

1. **Event sourcing — no hard deletes.** State changes are an append-only log; current state is derived by replay. "Deleting" a vote is never a row deletion. It is a new event (`VotingEventCancelled`, and — proposed — `VotingEventAborted`) that changes derived state, or, for archival, a backend-only visibility flag. The audit trail stays intact; this *is* the integrity story.

2. **The VCP computes; the backend stores content and owns visibility.** Governance state changes (cancel, abort) are VCP/engine concerns and must be events. Pure visibility/decluttering (archive) is a backend concern that never reaches the VCP — exactly like group archival.

Two more facts established while scoping this doc:

- **"Closed" is time-derived, not an event.** `deriveEventStatus()` (web) and `getEventPhase()` (VCP) compute `closed` from the timeline; no event is emitted at close. A `VotingEventClosed` event type exists in `@votiverse/core` but is **never emitted** — a latent hook if explicit closure is ever needed. Archive-closed must therefore key off the derived status, not an event.
- **The backend has no events table.** It forwards event reads to the VCP (`GET …/events` → proxy → VCP). Group archival could reuse a `groups.archived_at` column because groups *are* a backend table; event archival cannot, because there is no backend events row. This is the wrinkle in section 5.

---

## 3. The three lifecycle actions

```
   phase:     deliberation / curation        voting (open)            closed
   votes:          none yet                  cast, in-flight        cast, final
                       │                          │                     │
   action:         CANCEL                       ABORT                ARCHIVE
                (shipped)                    (proposed §4)        (proposed §5)
   nature:    governance event            governance event       backend visibility
   record:    "never happened"          "stopped mid-flight,     "happened; hidden
                                          votes existed"           from the list"
   reversible:     no (terminal)            no (terminal)            yes (restore)
   who:            admin                  owner-only (proposed)       admin
```

They are **not** three settings of one control. Cancel and Abort are terminal governance state changes with different meanings and different guards. Archive is a reversible cosmetic flag that never declares anything about the vote's validity. Keeping them distinct — in naming, in UI, and in the log — is the core design principle.

### 3.1 What shipped (Cancel), for reference

- Allowed only while `now < votingStart` (engine rejects later with `CANCELLATION_TOO_LATE`, 409).
- Appends `VotingEventCancelled { votingEventId, issueIds, cancelledBy, reason }`; cascades to issues (added to `cancelledIssues`, so votes are rejected and issue badges render), auto-withdraws submitted proposals.
- Terminal — no restore. The reason is recorded; re-opening a "void" vote would be confusing.
- Admin-only, enforced in the backend proxy (which also closed a pre-existing gap where any member could cancel an *issue*).

Abort and Archive are specified to compose cleanly with this.

---

## 4. Part A — Abort-during-voting

### 4.1 What it is

An administrator stops a vote whose window is **open** (`votingStart ≤ now < votingEnd`) and which may already have cast votes. Motivating cases: a compromised or manipulated ballot, discovered mass ineligibility, a legal/emergency stop, or a materially wrong question that only surfaced after voting began.

Distinct from cancel: with abort, **votes already exist**. Distinct from a natural non-decision: a vote that simply *closes without meeting quorum* is already handled by `BallotConfig.quorum` and needs no manual action — do not conflate quorum failure with abort.

### 4.2 The central tension — should it exist at all?

Two defensible positions:

- **(N) Never allow it.** An open vote is sacred; the only way it ends is time + quorum rules. Cleanest for integrity; no admin can erase an inconvenient result mid-flight. But brittle: real governance bodies need an emergency stop, and without one the workaround (letting a known-compromised vote run to completion) is worse.
- **(C) Allow, tightly constrained.** Provide the escape hatch, but make it rare, accountable, non-destructive to the record, and hard to do by accident.

**Recommendation: (C), tightly constrained.** The rest of this section specifies that. If the owner prefers (N), stop here and document it as a formal non-feature (like survey non-delegability).

### 4.3 Proposed semantics

- **Guard:** allowed only while `votingStart ≤ now < votingEnd`. Before `votingStart` → use Cancel. After `votingEnd` → the vote is a completed record; you may Archive it, never abort it.
- **Cast votes are preserved-but-void.** Existing `VoteCast` events are **never** deleted or retracted. The abort event supersedes them: the vote produces **no declared result**. The tally endpoint returns an `aborted` state, not a winner. This keeps "who voted what, and that it was voided" fully auditable.
- **No new votes.** After abort, `voting.cast` rejects with an `EVENT_ABORTED` rule violation (mirror of the `ISSUE_CANCELLED` guard at `engine.ts:564`).
- **Proposals:** submitted proposals are left as-is in the historical record (they were legitimately submitted); they are simply frozen. (Open question 4.9-b: withdraw vs. freeze.)
- **Terminal, no restore** — same rationale as cancel.

### 4.4 Predictions

Predictions tied to an aborted vote's issues/proposals will **never receive an `OutcomeRecorded` event**, because no outcome materializes. Prediction evaluation already treats "no outcomes" as pending (`packages/prediction/src/evaluation.ts`), so nothing breaks. The open decision: do we leave those predictions **pending forever**, or emit a synthetic "void" outcome so they resolve as *not scored* (neither correct nor incorrect) and drop out of pending queues? Recommendation: **void**, so predictors are not penalized for an administrative act and stale pending items are cleared. (Decision 4.9-c.)

### 4.5 Who can abort — gating

Abort is more destructive than cancel, so raise the bar:

- **Owner-only** (not all admins), via `isOwnerOfGroup()` in the backend proxy. Rationale: it voids other members' cast votes; that should sit with the group's ultimate authority.
- **Config-gated.** Add `BallotConfig.allowAbort: boolean` (default depends on preset — see `governance-parameter-space.md`). High-integrity presets (e.g. `SWISS_VOTATION`) default `false`; operational presets may default `true`. This lets a group contractually promise "an open vote cannot be stopped." A disabled group returns 403 regardless of role.

### 4.6 Engine / VCP / backend shape

- **core:** `VotingEventAborted { votingEventId, issueIds, abortedBy, reason, voteCountAtAbort }` (snapshot the count for the record). New entry in the event-type union and `AnyEvent`.
- **engine:** an `abortedEvents: Set<VotingEventId>`; `abortEvent(id, abortedBy, reason)` with the during-voting guard and `allowAbort` check; `isEventAborted(id)`; replay handler; `voting.cast` rejects aborted events; tally computation returns an `aborted` marker.
- **VCP:** `POST /assemblies/:id/events/:eid/abort` mirroring the cancel route; `aborted` flag on event responses (list **and** detail, per gotcha #6); tally endpoint returns the aborted state.
- **backend:** proxy `POST /groups/:id/events/:eid/abort`, **owner-only** + `allowAbort` capability/config check, server-side. Add `/^\/events\/[^/]+\/abort\/?$/` to the admin/owner gate block.

### 4.7 Web UX

Distinct from, and heavier than, the cancel control:

- Offered only when `status === "voting"`, owner-only, and `allowAbort` is on.
- A destructive confirmation with **more friction** than cancel — e.g. require typing the vote's title to confirm, and show the current cast-vote count ("This will void 23 cast votes"). Uses the same `error-*` token treatment and a required reason.
- Aborted events render an "Aborted" badge (distinct label/color from "Cancelled"); the tally area shows "No result — this vote was stopped on {date}: {reason}" instead of results.

### 4.8 Notification (deliberate exception to voter-fatigue)

Our default is passive transparency over active notification (`feedback_voter_fatigue`). Aborting a vote members actively participated in is a **material** event, not routine noise — members who cast a vote should be told it was voided and why. Route through the notification hub (`docs/design/notification-hub.md`) to the set of participants who cast a vote on the event. (Decision 4.9-d: notify all eligible, or only those who voted? Recommend: only those who voted.)

### 4.9 Decisions needed (Abort)

- **(a)** Allow abort at all — position (C) constrained, or (N) formal non-feature?
- **(b)** On abort, freeze submitted proposals (recommended) or withdraw them like cancel does?
- **(c)** Predictions on an aborted vote: leave pending, or emit a synthetic void outcome (recommended)?
- **(d)** Notify only voters (recommended) or all eligible participants?
- **(e)** `allowAbort` default per preset — which presets ship `false`?
- **(f)** Owner-only (recommended) or any admin?

---

## 5. Part B — Archive-closed

### 5.1 What it is

An admin hides a **closed** vote from the active events list to declutter, keeping the governance record fully intact and reachable. Purely a backend visibility concern — the VCP and engine never hear about it. Reversible (restore), mirroring group archival (shipped 2026-07-10).

Scope: **closed events only.** Upcoming/deliberation votes use Cancel; active votes use Abort (if enabled) or run their course. Archiving is not a way to make a live vote disappear.

### 5.2 The architectural wrinkle

Group archival reused `groups.archived_at` because a group is a backend row. **Events are not backend rows** — the backend forwards event reads to the VCP. So archive-closed needs:

1. **A new backend table** to record which events are archived, and
2. **List-time filtering / annotation** of the VCP's event responses, since the VCP will keep returning the archived events.

This keeps the boundary clean: the VCP stays the single source of truth for events; the backend layers a per-group visibility view on top.

### 5.3 Proposed schema (migration `012_event_archive`)

```sql
-- 012_event_archive.{sqlite,postgres}.sql
CREATE TABLE IF NOT EXISTS archived_events (
  group_id    TEXT NOT NULL,          -- backend group id (UUID in postgres)
  event_id    TEXT NOT NULL,          -- VCP voting event id
  archived_at TIMESTAMP NOT NULL,     -- CURRENT_TIMESTAMP; TIMESTAMPTZ in postgres
  archived_by TEXT NOT NULL,          -- backend user id
  PRIMARY KEY (group_id, event_id)
);
```

Dialect-specific files per the migrations convention. No VCP migration — the VCP is untouched.

### 5.4 Backend

- **`event-archive-service.ts`** (or extend an existing service): `archive(groupId, eventId, userId)`, `restore(groupId, eventId)`, `listArchivedEventIds(groupId): Set<string>`.
- **Proxy routes:** `POST /groups/:id/events/:eid/archive` and `/restore`, **admin-only** (mirror group archive/restore; owner-only not required — archival is non-destructive).
- **List filtering / annotation:** in the `GET …/events` proxy path, fetch `listArchivedEventIds(groupId)` and either (a) drop archived events from the default response, or (b) annotate each with `archived: true` and let the client filter. Recommendation: **annotate** (`archived: true/false`) and support `?archived=true` to return only archived — symmetric with the shipped `GET /groups?archived=true`. Guard: only allow archiving when the event's derived status is `closed` (compute from its timeline server-side, or trust the client gate + a soft check).
- **Interaction with the archived-*group* write-gate:** already compatible — archiving lives under the group; a group that is itself archived rejects these writes.

### 5.5 Web UX

Mirror the group-list Archived section (shipped this session):

- Events list: an "Archived" section below the active list, each row with a **Restore** button; active list excludes archived events.
- Event detail (or an events-list row menu): an admin-only "Archive" action, shown only when `status === "closed"`.
- Reuse `signal("attention")` / the events signal so the list updates without reload.
- `api.archiveEvent` / `restoreEvent` / `listArchivedEvents`; `archived?: boolean` on the `VotingEvent` type.

### 5.6 Future: auto-archive

Optional later: auto-hide votes closed more than N months ago (still restorable, still in the record). Out of scope for v1; note it so the schema (which already timestamps) supports it.

### 5.7 Decisions needed (Archive)

- **(a)** Admin-only (recommended) or owner-only?
- **(b)** List response: filter out archived by default (recommended) with `?archived=true` for the restore list — confirm the symmetry with groups.
- **(c)** Enforce "closed-only" strictly server-side, or trust the client gate with a soft check?

---

## 6. Cross-cutting concerns

- **Terminology.** Three verbs, kept distinct in code, UI, and i18n: **cancel** (pre-voting, governance), **abort** (during voting, governance), **archive** (post-close, visibility). Avoid "delete" everywhere — nothing is deleted.
- **Event sourcing.** Cancel and Abort are events; Archive is a backend flag. Never a row deletion.
- **List/detail parity.** Any new field (`aborted`, `archived`) must appear on **both** the list and detail endpoints (gotcha #6).
- **Security.** Every gate enforced server-side in the backend proxy (owner for abort, admin for archive), never only in the UI (`CLAUDE.md` authorization rule). Add to the `security-hardening-backlog` audit-logging item: cancel/abort/archive are security-relevant actions worth an audit entry.
- **i18n.** New `governance` strings; other locales fall back to English (established pattern).
- **Testing.** Engine unit tests for abort (blocks new votes, preserves cast votes, rejects outside the window, `allowAbort` gate, replay). Backend integration tests for the gates (owner 200 / admin 403 for abort; admin 200 / member 403 for archive; archived list; closed-only). Property check: abort/cancel never mutate or delete a `VoteCast` event.

---

## 7. Recommended sequencing

1. **Archive-closed first.** No governance decision required, low risk, immediate declutter value. The only real work is the backend table + list annotation; the web mirrors the shipped group-archive UI.
2. **Abort-during-voting second, decision-gated.** Do **not** start with code. Start with decisions 4.9-(a) and (e): does abort exist, and how is it config-gated? Once the owner rules on those, the implementation mirrors the shipped cancel path with a stricter guard, owner gating, preserved votes, and notification.

This ordering ships the safe, useful piece immediately and reserves the integrity-sensitive piece for an explicit governance decision — consistent with how Cancel was scoped.
