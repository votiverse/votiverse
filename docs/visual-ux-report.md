# Visual UX Verification & Fixes Report

**Date:** 2026-03-15
**Scope:** Verified all terminology changes from `docs/terminology-ux-guide.md` across every screen, then implemented UX fixes from Sections 3 and 4.

---

## Part 1: Terminology Verification

### Correctly Applied by Previous Agent

The following terminology changes were verified as correctly applied across the web client:

| Area | Old | New | Status |
|------|-----|-----|--------|
| Global nav | Dashboard, Assemblies, Profile | Home, My Groups, Me | ✅ |
| Assembly nav | Events, Delegations, Polls | Votes, Delegates, Surveys | ✅ |
| Page titles | Events, Delegations, Polls, Profile | Votes, Delegates, Surveys, Me | ✅ |
| Create buttons | Create Event, Create Delegation, Create Poll | Create a Vote, Trust someone..., New Survey | ✅ |
| Content labels | Issues, Participants, Weight Distribution | Questions, Members, Vote breakdown | ✅ |
| Vote results | "Winner: for" (always shown) | "Result: Approved" (closed only) | ✅ |
| Vote detail | "Cast vote:" | "Your vote:" | ✅ |
| Timeline | Deliberation → Voting → Ended | Discussion → Voting → Ended | ✅ |
| Stat labels | Delegators, Delegations | Trust You, My Delegates | ✅ |
| Pending badges | "X pending" | "X votes need you" | ✅ |
| Preset subtitles | "Board Proxy preset" | "Elected representatives" | ✅ |
| Conditional tabs | Always show all | Delegates hidden when disabled; Surveys hidden when disabled | ✅ |
| Empty states | "Create an event to start voting on issues" | "Create a vote to start making decisions" | ✅ |

### Terminology Issues Found and Fixed in This Session

| Location | Issue | Fix Applied |
|----------|-------|-------------|
| Dashboard banner | "21 votes pending" | Changed to "21 votes need you" |
| StatusBadge (ui.tsx) | "Closed" on votes list cards | Changed to "Ended" |
| EventStatusBadge (event-detail.tsx) | "Closed" next to vote title | Changed to "Ended" |
| Quorum text (event-detail.tsx) | "Quorum: Met (10%)" | Changed to "Enough members voted to count ✓" / "Not enough members voted yet (need X%)" |
| Profile page preset badges | Raw engine names: "Board Proxy", "Liquid Accountable" | Plain-language labels via shared `presetLabel()` |
| Assembly dashboard preset label | "Governance Settings (Board Proxy)" | "Governance Settings (Elected representatives)" |
| Dashboard group cards | Raw engine preset names as subtitles | Plain-language labels via shared `presetLabel()` |

### Terminology Issues Found But Not Fixed (Require Data/API Changes)

| Location | Issue | Recommendation |
|----------|-------|----------------|
| Assembly descriptions | Jargon dumps from seed data (e.g., "Single-delegate proxy voting. Non-transitive, revocable before meeting, secret ballot.") | Rewrite seed data descriptions in plain language. Consider generating human-readable descriptions from config at the API layer. |
| Profile: delegator chips | Shows truncated UUIDs ("8709cdbc") instead of member names | API should return names with delegator IDs, or UI should resolve names from participant list. |
| Profile: vote history | Shows truncated UUIDs ("f1874daa-492...") instead of question titles | API should return issue titles in voting history, or UI should join issue data. |
| Members page | UUIDs visible under each member name | Hide UUIDs in the UI. Only show the member name (and optionally a role or join date). |
| Identity card | UUID visible under participant name | Hide or collapse behind a "show ID" toggle for dev mode. |
| Assembly dashboard stat cards | "Your Delegates: 0" shows on Town Hall (no delegation) | Hide delegation-related stat cards when `delegation.enabled === false`. |

---

## Part 2: UX Fixes Implemented

### 2.1 Dashboard Card Grouping ✅

**Problem (Section 3.5):** Each question was displayed as a separate card, repeating the vote name and assembly name on every card. Three questions from the same vote created three nearly-identical cards.

**Fix:** Restructured the Pending Votes section to group questions under their parent vote. Each vote is now a single card with:
- Assembly badge and vote title at the top
- Summary chip showing pending count ("2 votes needed" or "All voted")
- Countdown timer
- Bulleted list of questions with individual status chips (Voted / Vote needed / Delegated)

**Files changed:** `platform/web/src/pages/dashboard.tsx` — added `groupByEvent()` helper and `VoteGroup` interface, restructured the pending votes rendering.

### 2.3 "Closed" → "Ended" Badge ✅

**Problem (Section 3.3):** The StatusBadge and EventStatusBadge both displayed "Closed" for ended votes. The timeline already showed "Ended" correctly, creating an inconsistency.

**Fix:** Changed the badge label from "Closed" to "Ended" in both:
- `components/ui.tsx` — `StatusBadge` component
- `pages/event-detail.tsx` — `EventStatusBadge` component

### 2.5 Terminology Fixes ✅

**Dashboard banner:** Changed "X votes pending" to "X votes need you" to match the pattern used in My Groups badges.

**Quorum text:** Replaced "Quorum: Met (10%)" with "Enough members voted to count ✓" (when met) or "Not enough members voted yet (need X%)" (when not met).

**Preset labels:** Created shared `lib/presets.ts` with `presetLabel()` function that maps engine preset names to user-facing labels. Applied to:
- `pages/profile.tsx` — assembly cards
- `pages/assembly-dashboard.tsx` — governance settings label
- `pages/dashboard.tsx` — "Your Groups" cards
- `pages/assembly-list.tsx` — refactored to use shared utility (was previously inline)

---

## Part 2: Design Recommendations (Not Yet Implemented)

### 2.2 Contextual Creation Buttons (Section 3.8)

**Current state:** Each screen has a prominent creation button ("Create a Vote", "New Survey", "Add Member", "New Group"). These are functional but mix participant and organizer concerns.

**Recommendation:** Implement a participant/organizer separation:
1. **Default view (participant):** Hide creation buttons. Show only what needs attention — pending votes, open surveys, results.
2. **Organizer view:** A persistent "+" FAB (floating action button) with contextual options:
   - On Home: "New group"
   - Inside a group's Overview: "New vote", "New survey", "Invite member"
   - On Votes tab: "New vote"
   - On Surveys tab: "New survey"
3. **Visibility rule:** "+" only visible to users with organizer permissions for that group.

**Impact:** Medium. Requires permission model integration and layout restructuring.

### 2.4 Hide Results During Open Voting (Section 3.4)

**Current state:** Full vote results (percentages, bar charts) are visible while voting is still open. This can influence voters.

**Recommendation:** Make this configurable per assembly:
- **Default (recommended):** Hide results during open voting. Show only "X of Y members have voted."
- **Transparent mode:** Show live results (opt-in for assemblies that want this).
- **Config field:** Add `resultsVisibility: 'sealed' | 'live'` to `BallotConfig`.

**Impact:** Medium. Requires config schema change, engine support, and UI conditional rendering.

### 2.6 "Vote Needed" vs "Vote Now" Consistency (Section 3.7)

**Current state:** The banner has a "Vote Now" CTA button; grouped cards show "Vote needed" status chips.

**Assessment:** These serve different purposes — "Vote Now" is a call-to-action (tapping it navigates you to vote), while "Vote needed" is a status indicator (this question still needs your input). The grouped card redesign actually improves this: the card-level chip says "2 votes needed" (status summary), while individual question chips say "Vote needed" / "Voted" / "Delegated" (per-question status). The "Vote Now" CTA button on the banner is appropriately action-oriented.

**No change needed.** The current design is consistent within its own framework.

---

## Files Modified

| File | Changes |
|------|---------|
| `platform/web/src/lib/presets.ts` | **New file.** Shared preset name → label mapping. |
| `platform/web/src/components/ui.tsx` | StatusBadge: "Closed" → "Ended" |
| `platform/web/src/pages/dashboard.tsx` | Banner wording, card grouping, preset labels |
| `platform/web/src/pages/event-detail.tsx` | EventStatusBadge: "Closed" → "Ended"; quorum text |
| `platform/web/src/pages/profile.tsx` | Preset label mapping |
| `platform/web/src/pages/assembly-dashboard.tsx` | Preset label in governance settings |
| `platform/web/src/pages/assembly-list.tsx` | Refactored to use shared presetLabel() |

## What Was NOT Changed

- API endpoints or VCP route handlers
- TypeScript types and interfaces
- Engine package code
- Internal variable names
- Database columns or seed data content
- Assembly descriptions (these come from seed data and need a data-level fix)
- Results visibility during open voting (needs config schema change)
- Creation button placement (needs permission model)

## Build Status

- Web TypeScript: **compiles cleanly** (no errors)
- All changes are UI-only label/layout changes with no behavioral impact on the engine.
