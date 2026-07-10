# Adding Issues to a Voting Event During Deliberation

**Status:** Approved — building 2026-07-10
**Date:** 2026-07-10
**Context:** complements shipped vote cancellation (`docs/design/vote-lifecycle-abort-and-archive.md`), `docs/design/topic-navigation.md`, memory `topic-reform-2026-03-19`

---

## 1. Problem

Issues are fixed at creation (`engine.events.create` takes the full `issues[]`; the set is frozen thereafter). An organizer must know the entire agenda up front, which is often impractical — deliberation itself surfaces new questions. Today the only recourse is to create a *separate* voting event with its own timeline.

We already let admins **cancel** an issue before voting opens (shipped). So the agenda is already mutable-by-removal. It should be mutable-by-**addition** too.

## 2. Mental model

**The ballot's issue set is editable until `votingStart`.** Cancel removes a question; add introduces one. Both are "editing the agenda before it locks" — same guard, same authority. Once voting opens, the ballot is fixed.

## 3. Scope and rules

- **Window: deliberation *or* curation** — allowed while `now < votingStart`, mirroring cancel's exact guard. Rejected once voting has started (409) and on cancelled events. *(Decision 2026-07-10: mirror cancel rather than deliberation-only; see §9.)*
- **Append-only.** New issues go at the **end** of the list. Never insert mid-list: the VCP tally/weights arrays are position-indexed and the web reads them by index (`tallyData.tallies[idx]`), so appending keeps every existing index stable while inserting would silently misalign results.
- **Admin-only**, enforced server-side in the backend proxy (same as create/cancel).
- New issues **inherit the event's eligibility** (`eligibleParticipantIds` is event-level) and may carry a topic + binary/choices ballot, exactly like at creation.
- **Out of scope:** editing an existing issue's text (cancel + re-add covers it, and in-place editing muddies already-attached proposals); adding after `votingStart`.
- **Curation fairness (soft).** An issue added during curation has had less deliberation time than its siblings. This is **not** a hard block — the UI shows a soft warning; agenda quality is the admin's judgment.

## 4. Engine

- **core:** `IssuesAdded { votingEventId, issues: VotingEventIssuePayload[], addedBy }` — batch payload mirroring `VotingEventCreated`'s issue metadata.
- **`addIssues(votingEventId, issues, addedBy)`:** validate (event exists / not cancelled / `now < votingStart` / non-empty); generate issue ids and build `Issue` + payload objects (identical to `create`); set `this.issues`; **reconstruct the parent `VotingEvent` with an extended `issueIds`** — the one real wrinkle, since `VotingEvent` is otherwise treated as immutable and built once at create; append `IssuesAdded`; return the new `Issue[]` (so the VCP can persist them).
- **Replay:** on `IssuesAdded`, add each issue to `this.issues` and extend the parent event's `issueIds`. `VotingEventCreated` always precedes `IssuesAdded`, so the parent exists.

## 5. VCP

- `POST /assemblies/:id/events/:eid/issues` → `engine.events.addIssues(...)`, then `manager.persistIssues(assemblyId, newIssues)`, then return the **full updated event** via `buildEventResponse`. Both the list and detail endpoints already project from `issueIds`, so the added issues appear in both (no list/detail divergence — gotcha #6).
- Mirrors the cancel route's auth (`requireParticipant`); the backend is the authorization boundary.

## 6. Backend

- Admin-gate `POST /events/:eid/issues` in the proxy — regex `^/events/[^/]+/issues/?$`, distinct from the issue-cancel subpath `^/events/[^/]+/issues/[^/]+/cancel$`. The voting-capability gate and archived-group write-gate already apply via the `/events` prefix.

## 7. Web

- **Extract** the create form's issue editor (`events-list.tsx` `CreateEventForm` — the `IssueDraft` rows: title/description/topic/binary-or-choices) into a shared `components/issue-list-editor.tsx` (`IssueListEditor`, `IssueDraft`, `newIssueDraft`, `issueDraftToApi`). Reuse it in **both** `CreateEventForm` and a new admin **"Add question"** control on event-detail. (We do not copy the form — duplicated create forms have bitten us before.)
- The add control appears on event-detail for admins while `status` is not `voting`/`closed` and the event is not cancelled; it shows the curation soft-warning when the event is in curation (computed with the group's timeline config).
- `api.addIssues(groupId, eventId, issues)`; on success refetch the event and fire the attention signal so the ballot updates without reload.

## 8. Testing

- **Engine:** added issues extend `issueIds` and `this.issues`; votes are accepted on added issues within the window; `addIssues` rejects after `votingStart` and on a cancelled event; rejects an empty list; cancellation-style replay persistence (a fresh engine sees the added issues).
- **API e2e:** admin add → 201 and the new issue appears in both the list and detail responses; member add → 403; add after voting started → 409.

## 9. Decisions

| Decision | Ruling (2026-07-10) |
|----------|---------------------|
| Editable window | **Deliberation + curation** (`now < votingStart`), mirroring cancel. Deliberation-only was the stricter-fairness alternative; rejected in favour of one guard and a soft curation warning. |
| Ordering | **Append-only** — preserves position-indexed tally/weights/UI. |
| Authority | **Admin-only**, server-enforced. |
| In-place issue editing | **Out of scope** — use cancel + add. |
