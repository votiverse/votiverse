# Voting & Delegation UX Redesign

**Status:** Proposed
**Date:** 2026-03-27
**Context:** Event detail page, Delegates tab, delegation management

---

## 1. Problem Statement

The voting and delegation UI has several interconnected UX issues that make the experience confusing for users who have already voted and want to change their mind, users who have delegated and want to manage that delegation, and users navigating between the event detail page and the delegation management pages.

This document identifies each issue, explains the underlying cause, and proposes a cohesive redesign that treats delegation as a **fallback mechanism** — not a primary action competing with voting.

### 1.1 Mental model

Delegation is a fallback. When an issue comes up for a vote:

1. **If the participant votes directly**, that vote is recorded. Any delegation is irrelevant for this issue — direct votes always take precedence.
2. **If the participant does not vote**, the system looks for an active delegation: first issue-scoped, then topic-scoped, then global. If one resolves to a terminal voter, the delegation acts as the participant's fallback.
3. **If neither a vote nor a delegation exists**, the participant is absent on this issue.

This means: voting and delegation are not parallel choices presented side-by-side. Voting is the primary action. Delegation is a safety net configured separately. The UI should reflect this hierarchy.

---

## 2. Issues

### 2.1 "Manage" on a delegated issue goes to an empty page

**Current behavior:** When an issue shows "Delegated to [Name]" with a "Manage delegation" link, clicking it navigates to `/assembly/:id/delegations`. That page filters out issue-scoped delegations (`!d.issueScope`), so the user sees "You haven't delegated yet."

**Root cause:** The `/delegations` page only shows topic-scoped and global delegations. Issue-scoped delegations created from the event detail page are not displayed anywhere the user can navigate to.

### 2.2 Voted state offers confusing "Change vote" + "Let delegate decide" options

**Current behavior:** After voting, the collapsed card shows:

```
✓ You voted for    [Change vote]  [Let delegate decide]
```

- "Change vote" expands the card to show vote buttons + "Trust someone else with this vote" link.
- "Let delegate decide" immediately retracts the vote (with no confirmation), then shows the expanded vote buttons.

**Problems:**
- "Change vote" already offers delegation access (via "Trust someone else"), making "Let delegate decide" redundant.
- "Let delegate decide" is misleadingly named — it retracts the vote but does not set up a delegation. The user must then find and click "Trust someone else" as a second step.
- Having both options as sibling links creates confusion about what each does.
- "Change vote" shows a "Trust someone else" option, but this is inappropriate: the user is changing their vote, not setting up delegation. Since direct votes always override delegations, the delegation option within "Change vote" is semantically wrong.

### 2.3 Issue-scoped delegations are invisible in the Delegates tab

**Current behavior:** Both the Delegates tab (`/delegates`) and the `/delegations` page filter delegations with `!d.issueScope`. Once a user creates an issue-scoped delegation from the event detail page, they cannot see or manage it from any navigation-accessible page.

### 2.4 Two separate delegation management pages

**Current behavior:**
- **Delegates tab** (`/delegates`) — multi-step experience: browse candidates, view profiles, configure scope. Shows outgoing topic/global delegations.
- **Delegations page** (`/delegations`) — flat page with inline form + list. Simpler but separate.

The "Manage delegation" link on event detail goes to `/delegations`, but the main navigation tab is "Delegates". Users don't know which page to use.

### 2.5 Abstain is demoted in multi-option votes

**Current behavior:** For standard For/Against/Abstain votes, all three options are equal-weight buttons. For multi-option votes (candidate elections, custom choices), Abstain is rendered as a small underlined text link below the option grid, visually demoted relative to the real choices.

### 2.6 QuickDelegateForm filters candidates by topic for issue-scoped delegations

**Current behavior:** When delegation scope is "issue", the form still filters recommended candidates by the issue's topic IDs. Issue-scoped delegations are bound to one specific issue regardless of topic, so this filtering is semantically misleading.

---

## 3. Proposed Changes

### 3.1 Voted state redesign: "Change vote" and "Retract"

Replace the current `[Change vote] [Let delegate decide]` with `[Change vote] [Retract]`.

**"Change vote"** — simple, focused action. Expands the card to show only vote buttons and a cancel link. No delegation option, because changing a vote is about picking a different choice. The user already has a direct vote, and direct votes override delegations, so offering delegation here is misleading.

```
Change your vote:
  [For]  [Against]  [Abstain]
  Cancel
```

**"Retract"** — removes the vote entirely. When clicked, shows a brief inline confirmation (not a modal):

```
┌─────────────────────────────────────────────────────┐
│  Retract your vote?                                 │
│                                                     │
│  This removes your vote from this issue.            │
│  This is not the same as abstaining — abstaining    │
│  is a recorded choice, retracting is not.           │
│                                                     │
│  [Cancel]  [Retract vote]                           │
└─────────────────────────────────────────────────────┘
```

When confirmed, the state resets completely — as if the vote never happened. The issue card returns to whatever its natural state would be. The existing state machine handles this correctly:

- If a delegation exists that covers this issue, the DelegationCard renders automatically (`isDelegated && !hasVoted`), showing the delegate name with manage options and vote buttons below.
- If no delegation exists, the standard unvoted state appears: "Needs your vote" indicator, vote buttons, and "Trust someone else with this vote" link.

No special explanation about delegation is needed in the confirmation — the normal UI state after retraction already communicates everything. And not all assemblies have delegation, so mentioning it in the confirmation would be confusing in those contexts.

#### State diagram

```
                            ┌──────────────────────┐
                            │     UNVOTED           │
             ┌──────────────│  Vote buttons shown   │◄──────────────┐
             │              │  + "Trust someone"    │               │
             │              └──────────────────────┘               │
             │                         │                            │
       vote directly            delegate (via form)           retract
             │                         │                       (confirmed)
             ▼                         ▼                            │
  ┌──────────────────┐    ┌──────────────────────┐                 │
  │     VOTED         │    │     DELEGATED         │                │
  │  "You voted for"  │    │  "Delegated to [X]"   │                │
  │  [Change] [Retract]│   │  Vote buttons below   │                │
  └────────┬──────────┘    │  [Manage]              │                │
           │               └──────────────────────┘                │
           │                                                       │
     change vote ──► vote buttons only (no delegate option)        │
           │                                                       │
     retract ──► inline confirmation ──────────────────────────────┘
```

### 3.2 Inline delegation management on event detail

Replace the "Manage delegation" link with inline management. The DelegationCard gets a "Manage" button that opens an inline panel (on the same card, similar to how QuickDelegateForm replaces vote buttons).

**For issue-scoped delegations**, the manage panel shows:
- Current delegate name and scope label ("This issue only")
- **Change delegate** — opens the QuickDelegateForm with the current scope pre-selected
- **Remove delegation** — revokes the issue-scoped delegation; card returns to unvoted state

**For topic-scoped or global delegations** covering an issue as a fallback, the manage panel shows:
- Current delegate name and scope label ("All Technical issues" or "All topics")
- Brief explanation: "This delegation applies to all issues in [scope]. Changing it will affect other issues too."
- **Change delegate** — navigates to the Delegates tab with a context hint (e.g., query param `?scope=topic-id`)
- **Remove delegation** — navigates to the Delegates tab where the user can remove it from the full list

The distinction matters: issue-scoped delegations are ephemeral and safe to manage inline. Topic/global delegations are persistent governance choices that affect many issues and deserve the full Delegates tab experience.

### 3.3 Issue-scoped delegations visible in the Delegates tab

Add an "Issue delegations" section to the Delegates tab (`/delegates`), below the topic/global delegations list.

**Display:**
- Section only appears when issue-scoped delegations exist
- Grouped by event (since issues belong to events)
- Each row shows: issue title, delegate name, event name, "Remove" button
- Brief section header: "These delegations apply to specific issues and expire when the vote closes."

**Implementation:**
- Remove the `!d.issueScope` filter from the Delegates tab's delegation list query
- Split delegations into two groups: `topicDelegations` (no issueScope) and `issueDelegations` (has issueScope)
- Render each group in its own section

### 3.4 Consolidate delegation pages

The Delegates tab (`/delegates`) becomes the single place for all delegation management.

**Changes:**
- `/delegations` route redirects to `/delegates` (or is removed entirely)
- "Manage delegation" links from event detail that currently go to `/delegations` are replaced with inline management (Section 3.2) — they no longer navigate away
- The Delegates tab gains the issue-scoped delegations section (Section 3.3)

### 3.5 Abstain as a full button in multi-option votes

For multi-option votes (candidate elections, custom choices), render Abstain as a full-width button below the options grid instead of a text link.

**Current:**
```
  [Candidate A]  [Candidate B]
  [Candidate C]  [Candidate D]
  Abstain ← underlined text link
```

**Proposed:**
```
  [Candidate A]  [Candidate B]
  [Candidate C]  [Candidate D]
  [         Abstain          ] ← full button, neutral/gray style
```

The Abstain button uses a neutral style (gray border, no fill, subdued text) that distinguishes it from the active choices while being clearly clickable. Same border-radius and padding as the option buttons.

### 3.6 QuickDelegateForm: topic filtering for issue scope

When the delegation scope is "issue", the candidate filtering behavior changes:

- **Current:** Filters recommended candidates by the issue's topic IDs, hiding candidates in other topics.
- **Proposed:** Shows all active candidates. Candidates with expertise in the issue's topic are labeled "Recommended" as a relevance hint, but candidates in other topics are also visible and selectable. Add a brief scope label: "This delegate will represent you on this specific issue only."

---

## 4. Files to change

| File | Changes |
|------|---------|
| `platform/web/src/pages/event-detail.tsx` | Redesign VotingSection collapsed state (3.1), inline delegation management (3.2) |
| `platform/web/src/components/quick-delegate-form.tsx` | Candidate filtering for issue scope (3.6) |
| `platform/web/src/pages/delegates/index.tsx` | Add issue-scoped delegations section (3.3) |
| `platform/web/src/pages/delegations.tsx` | Redirect to delegates tab or remove (3.4) |
| `platform/web/src/api/types.ts` | Type updates if needed |
| `platform/web/public/locales/en/governance.json` | New i18n keys for retract confirmation, issue delegation labels |

---

## 5. What does NOT change

- **Vote buttons layout for binary votes** — For/Against/Abstain as three equal buttons. Already correct.
- **Delegation card position** — Delegation card stays below vote buttons. Delegation is a fallback, not the primary action. The card's position reflects this hierarchy.
- **QuickDelegateForm scope selector** — The three-way scope choice (issue/subtopic/broader) remains. Only the candidate filtering changes for issue scope.
- **Engine behavior** — No changes to the VCP or engine. Vote retraction, delegation creation, and chain resolution all work correctly. The changes are purely in the web UI's presentation and flow.
- **"Needs your vote" indicator** — Already correctly gated behind `!issueStatus.loading`. No change needed.
