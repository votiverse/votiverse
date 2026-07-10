# Vote Lifecycle: Abort-During-Voting and Archive-Closed

**Status:** 2026-07-10 — **abort-during-voting rejected** (ratified non-feature); **archive-closed deferred** (specified in §5, not scheduled — build only when a decluttering need is demonstrated). See the Decision Log (§8).
**Date:** 2026-07-10
**Context:** `docs/design/entity-mutability.md`, `docs/design/groups-and-capabilities.md`, `docs/design/governance-parameter-space.md`, `docs/design/notification-hub.md`, Paper I (integrity, one-person-one-vote); ratified constraint also recorded in `CLAUDE.md` → "Architectural Decisions — Do Not Revisit".

---

## 1. Problem Statement

A voting event moves through four phases — **deliberation → curation → voting → closed** (`platform/vcp/src/engine/event-phases.ts`). What it means to "remove" a vote depends entirely on which phase it is in, because the stakes are whether cast votes get invalidated.

We shipped the first, lowest-stakes case on 2026-07-10: **Cancel a vote before voting opens** (engine `cancelEvent`/`isEventCancelled` + `VotingEventCancelled`; VCP `POST …/events/:eid/cancel`; backend admin gate; web admin control). See §3.

This document scoped the two remaining phases and the project owner ruled on them (§8):

- **Abort-during-voting — REJECTED.** Stopping an open vote is a ratified **non-feature** (§4). An open vote ends only via time + quorum.
- **Archive-closed — DEFERRED.** The design stands (§5) and its sub-decisions are settled, but the owner deferred building it (2026-07-10) until a concrete need for decluttering closed votes is demonstrated. We don't yet know we need it.

---

## 2. Background: what "delete" must mean here

Two architectural constraints from `CLAUDE.md` shape everything below:

1. **Event sourcing — no hard deletes.** State changes are an append-only log; current state is derived by replay. "Deleting" a vote is never a row deletion. It is a new event (`VotingEventCancelled`) that changes derived state, or, for archival, a backend-only visibility flag. The audit trail stays intact; this *is* the integrity story.

2. **The VCP computes; the backend stores content and owns visibility.** Governance state changes (cancel) are VCP/engine concerns and must be events. Pure visibility/decluttering (archive) is a backend concern that never reaches the VCP — exactly like group archival.

Two facts established while scoping this doc:

- **"Closed" is time-derived, not an event.** `deriveEventStatus()` (web) and `getEventPhase()` (VCP) compute `closed` from the timeline; no event is emitted at close. A `VotingEventClosed` event type exists in `@votiverse/core` but is **never emitted** — a latent hook if explicit closure is ever needed. Archive-closed must therefore key off the derived status, not an event.
- **The backend has no events table.** It forwards event reads to the VCP (`GET …/events` → proxy → VCP). Group archival could reuse a `groups.archived_at` column because groups *are* a backend table; event archival cannot, because there is no backend events row. This is the wrinkle in §5.

---

## 3. The lifecycle actions

```
   phase:     deliberation / curation        voting (open)            closed
   votes:          none yet                  cast, in-flight        cast, final
                       │                          │                     │
   action:         CANCEL                    (no action)            ARCHIVE
                (shipped §3.1)          abort is a non-feature §4   (build §5)
   nature:    governance event               —                    backend visibility
   record:    "never happened"          vote runs to votingEnd;    "happened; hidden
                                          quorum decides result      from the list"
   reversible:     no (terminal)              n/a                     yes (restore)
   who:            admin                       —                      admin
```

Cancel and Archive are **not** two settings of one control. Cancel is a terminal governance state change meaning "this never happened." Archive is a reversible cosmetic flag that says nothing about the vote's validity. Keeping them distinct — in naming, UI, and the log — is the core principle. There is deliberately **no** mid-flight action (§4).

### 3.1 What shipped (Cancel), for reference

- Allowed only while `now < votingStart` (engine rejects later with `CANCELLATION_TOO_LATE`, 409).
- Appends `VotingEventCancelled { votingEventId, issueIds, cancelledBy, reason }`; cascades to issues (added to `cancelledIssues`, so votes are rejected and issue badges render), auto-withdraws submitted proposals.
- Terminal — no restore. The reason is recorded.
- Admin-only, enforced in the backend proxy (which also closed a pre-existing gap where any member could cancel an *issue*).

---

## 4. Abort-during-voting — ratified non-feature

**Decision (2026-07-10): an open vote cannot be aborted.** This section records what abort would have been and *why it was rejected*, so it is not re-proposed.

### 4.1 What it would have been

An administrator stopping a vote whose window is **open** (`votingStart ≤ now < votingEnd`) and which may already have cast votes — motivated by a compromised/manipulated ballot, discovered mass ineligibility, or a legal/emergency stop. Unlike cancel, **votes already exist**, so it would have voided real participation.

### 4.2 Why rejected

The alternative to an emergency stop is not chaos — it is the system's existing integrity machinery:

- **An open vote is sacred.** Removing the ability to stop a vote mid-flight means no administrator can erase or truncate an inconvenient result while it is being decided. Cast votes and declared results stay tamper-evident. This is the stronger guarantee for a governance engine and is consistent with one-person-one-vote and the "predictions/votes are immutable once committed" posture (Paper I).
- **Non-decisions are already handled.** A vote that closes without meeting `BallotConfig.quorum` yields *no result* automatically — the normal, principled way for a vote to "not count." Abort would have been a manual shortcut around a rule the config already expresses; there is no need to conflate the two.
- **The compromised-vote recourse exists without an override.** If a live vote is being manipulated or was posed wrongly, the recourse is (a) the **immutable record**, which makes the manipulation visible and disputable; (b) **community notes** on the event; and (c) a **follow-up vote** once the current one closes. None of these require an admin stop button, and all of them leave an auditable trail — which an abort would not improve on.
- **Blast radius.** An abort control is a high-value target: a single owner action that voids everyone's participation. Not building it removes that risk surface entirely.

### 4.3 Consequences of the decision

- No `VotingEventAborted` event, no `abortEvent` engine method, no `BallotConfig.allowAbort` flag, no abort route or UI. The engine's existing behavior stands: once `now ≥ votingStart`, the vote runs to `votingEnd` and quorum decides whether it produces a result.
- The pre-voting **Cancel** (§3.1) remains the only way to stop a vote, and only before it opens.
- If this is ever revisited, it requires explicit project-owner instruction (per `CLAUDE.md` Do-Not-Revisit) and must re-answer: what happens to cast votes, results, and predictions, and why the record + follow-up-vote recourse is insufficient.

*(The Q2–Q4 sub-decisions from the proposal — owner-only gating, config-gating, notification policy — are moot given this decision and are not carried forward.)*

---

## 5. Archive-closed — specified but deferred

> **Deferred 2026-07-10.** The design and its sub-decisions (§5.6) are settled, but building it is deferred until a real need to declutter closed votes appears. The spec below is ready to pick up on demand; nothing here is scheduled.

### 5.1 What it is

An admin hides a **closed** vote from the active events list to declutter, keeping the governance record fully intact and reachable. Purely a backend visibility concern — the VCP and engine never hear about it. Reversible (restore), mirroring group archival (shipped 2026-07-10).

Scope: **closed events only.** Upcoming/deliberation votes use Cancel; active votes run their course (no abort, §4). Archiving is not a way to make a live vote disappear.

### 5.2 The architectural wrinkle

Group archival reused `groups.archived_at` because a group is a backend row. **Events are not backend rows** — the backend forwards event reads to the VCP. So archive-closed needs:

1. **A new backend table** to record which events are archived, and
2. **List-time annotation** of the VCP's event responses, since the VCP will keep returning the archived events.

This keeps the boundary clean: the VCP stays the single source of truth for events; the backend layers a per-group visibility view on top.

### 5.3 Schema (migration `012_event_archive`)

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
- **Proxy routes:** `POST /groups/:id/events/:eid/archive` and `/restore`, **admin-only** (resolved — §5.6-a), enforced server-side via `isAdminOfGroup`.
- **List annotation / filtering (resolved — §5.6-b):** in the `GET …/events` proxy path, fetch `listArchivedEventIds(groupId)` and **annotate** each event with `archived: true/false`; **exclude archived from the default response**; support `?archived=true` to return only archived — symmetric with the shipped `GET /groups?archived=true`.
- **Closed-only guard (resolved — §5.6-c):** trust the client gate plus a **server-side soft check** — compute the event's derived status from its timeline and reject archiving anything not `closed` (400). Cheap and prevents a `curl` bypass hiding a live vote.
- **Interaction with the archived-*group* write-gate:** already compatible — archiving lives under the group; a group that is itself archived rejects these writes.

### 5.5 Web

Mirror the group-list Archived section (shipped this session):

- Events list: an "Archived" section below the active list, each row with a **Restore** button; active list excludes archived events.
- Event detail (or an events-list row menu): an admin-only "Archive" action, shown only when `status === "closed"`.
- Reuse the mutation signal so the list updates without reload.
- `api.archiveEvent` / `restoreEvent` / `listArchivedEvents`; `archived?: boolean` on the `VotingEvent` type.

### 5.6 Resolved decisions (Archive)

- **(a)** Who can archive → **admin-only** (archival is non-destructive and reversible; owner-only is unnecessary friction).
- **(b)** List response → **exclude archived by default; annotate `archived`; `?archived=true` for the restore list** (symmetric with groups).
- **(c)** Closed-only → **client gate + server-side soft check** on derived status.

### 5.7 Future: auto-archive

Optional later: auto-hide votes closed more than N months ago (still restorable, still in the record). Out of scope for v1; the schema already timestamps, so it is supported.

---

## 6. Cross-cutting concerns (Archive)

- **Terminology.** Two verbs, kept distinct in code, UI, and i18n: **cancel** (pre-voting, governance) and **archive** (post-close, visibility). There is no "abort." Avoid "delete" everywhere — nothing is deleted.
- **List/detail parity.** The new `archived` field must appear on **both** the list and detail endpoints (gotcha #6).
- **Security.** The archive/restore gate is enforced server-side in the backend proxy (admin), never only in the UI (`CLAUDE.md` authorization rule). Worth an entry in the `security-hardening-backlog` audit-logging item: cancel/archive are security-relevant actions.
- **i18n.** New `governance` strings; other locales fall back to English (established pattern).
- **Testing.** Backend integration tests for the gates (admin 200 / member 403; archived list; closed-only soft check rejects a live vote); web check for the Archived section + restore, mirroring the group-archive tests.

---

## 7. Sequencing

Nothing from this doc is scheduled. Abort is a ratified non-feature (§4); archive-closed is specified but **deferred** (§5) until decluttering closed votes becomes a demonstrated need — it is low-risk and self-contained, so it can be picked up on demand.

---

## 8. Decision Log

| # | Decision | Ruling (2026-07-10) |
|---|----------|---------------------|
| A1 | Allow aborting an open vote? | **No — ratified non-feature.** An open vote ends only via `votingEnd` + `quorum`. Recorded in `CLAUDE.md` Do-Not-Revisit. |
| A2–A4 | Abort gating / config flag / notification | **Moot** (abort not built). |
| B0 | Build archive-closed now? | **Deferred** — spec stands (§5); build only when a decluttering need is demonstrated. |
| B1 | Who can archive a closed vote? | **Admin-only** (settled for when it's built). |
| B2 | Archive list response shape | **Exclude by default; annotate `archived`; `?archived=true` for restore list.** |
| B3 | Enforce closed-only | **Client gate + server-side soft check** on derived status. |

Cancel (shipped 2026-07-10) + this ruling complete the vote-lifecycle design: cancel before voting, nothing during, archive after close.
