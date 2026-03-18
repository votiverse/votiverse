# Terminology Changes Report

Applied terminology changes from `docs/terminology-ux-guide.md` Section 2 across the web client (`platform/web/`). No API endpoints, VCP route handlers, TypeScript types, engine code, internal variable names, or database columns were renamed.

---

## Summary of Changes

### Navigation (layout.tsx)

| Location | Before | After |
|----------|--------|-------|
| Global bottom tabs | Dashboard, Assemblies, Profile | Home, My Groups, Me |
| Global desktop nav | Dashboard, Assemblies, Profile | Home, My Groups, Me |
| Assembly bottom tabs | Events, Delegate, Polls | Votes, Delegates, Surveys |
| Assembly desktop nav | Events, Delegations, Polls | Votes, Delegates, Surveys |
| Assembly mobile menu | Events, Delegations, Polls | Votes, Delegates, Surveys |
| Identity dropdown | Profile | Me |

### Assembly List (assembly-list.tsx)

| Before | After |
|--------|-------|
| Page title "Assemblies" | "My Groups" |
| Subtitle "Governance assemblies on this VCP instance" | "Your communities and organizations" |
| "Create Assembly" button | "New Group" |
| "No assemblies yet" | "No groups yet" |
| "Create your first assembly to start governing." | "Create your first group to start making decisions together." |
| "{preset} preset" card subtitle | Plain-language descriptions via `presetSubtitle()` |
| "{N} pending" badge | "{N} vote(s) need you" |
| Preset labels in create form | Scenario-driven descriptions per Section 2.11 |
| Form title "New Assembly" | "New Group" |
| Placeholder "Assembly name" | "Group name" |
| "Governance Preset" label | "How should your group make decisions?" |

#### Preset Subtitle Mapping

| Config Name | Displayed As |
|-------------|-------------|
| Town Hall | Everyone votes directly |
| Swiss Model | Discuss, then vote |
| Liquid Standard | Flexible delegation |
| Liquid Accountable | Delegates with accountability |
| Board Proxy | Elected representatives |
| Civic Participatory | Mixed — direct votes and delegates |

#### Preset Selector Descriptions

| Before | After |
|--------|-------|
| Town Hall — Direct democracy, no delegation | Everyone votes directly — Every member votes on every question. Simple and equal. |
| Swiss Model — Secret ballot, optional delegation | Discuss, then vote — A structured discussion period, then a direct vote by all members. |
| Liquid Standard — Topic-specific liquid delegation | Members choose trusted delegates — Members can delegate their vote to someone they trust, by topic. |
| Liquid Accountable — Liquid delegation with predictions | Delegates with full accountability — Delegate votes are visible and predictions are tracked over time. |
| Board Proxy — Corporate proxy voting model | Elected representatives — Members elect or appoint representatives who vote on their behalf. |
| Civic Participatory — Full participatory governance | Mixed approach — Some topics decided by direct vote, others through delegates. |

### Dashboard (dashboard.tsx)

| Before | After |
|--------|-------|
| "Voting Activity" section header | "Pending Votes" |
| "Your Assemblies" section header | "Your Groups" |
| "{preset} preset" in cards | "{preset}" (no "preset" suffix) |
| "{N} active event(s)" | "{N} active vote(s)" |
| "No assemblies found." | "No groups found." |
| "Browse assemblies" | "Browse groups" |
| "No pending votes across your assemblies." | "No pending votes across your groups." |

### Events List (events-list.tsx)

| Before | After |
|--------|-------|
| Page title "Voting Events" | "Votes" |
| "Create Event" button | "Create a Vote" |
| "No voting events yet" | "No votes yet" |
| "Create an event to start voting on issues." | "Create a vote to start making decisions." |
| "{N} issue(s)" badge | "{N} question(s)" |
| Form title "New Voting Event" | "New Vote" |
| Placeholder "Event title" | "Vote title" |
| "Issues" label | "Questions" |
| "Issue {N} title" placeholder | "Question {N}" |
| "+ Add another issue" | "+ Add another question" |
| "Create Event" submit button | "Create Vote" |

### Event Detail (event-detail.tsx)

| Before | After |
|--------|-------|
| "Event not found" error | "Vote not found" |
| Timeline: "Deliberation" | "Discussion" |
| Timeline: "Closed" | "Ended" |
| "You've voted on all {N} issues" | "You've voted on all {N} questions" |
| "{N} of {N} issue(s) need(s) your vote" | "{N} of {N} question(s) need(s) your vote" |
| "Winner: {choice}" badge (always shown) | "Result: Approved/Not approved" (closed votes only) |
| "Cast vote:" label | "Your vote:" |
| "Weight Distribution" collapsible | "Vote breakdown" |
| "Total: {N} weighted votes" | "{N} votes total (including delegated votes)" |
| "Participating: {N}/{N}" | "{N} of {N} members voted" |
| "You haven't voted on this issue" | "You haven't voted on this yet" |
| "review the issue during deliberation" | "review during the discussion period" |
| EventStatusBadge "Deliberation" | "Discussion" |

### Delegations (delegations.tsx)

| Before | After |
|--------|-------|
| Page title "Delegations" | "Delegates" |
| "Set Delegation" button | "Trust someone with your vote" |
| "Active Delegations" heading | "Your Trusted Delegates" |
| "No delegations" empty state | "No delegates" / "You haven't trusted anyone with your vote yet." |
| "Delegation Chain" heading | "How your vote flows" |
| "Trace how a participant's vote flows through the delegation chain." | "Trace how a member's vote flows through their trusted delegates." |
| "Participant" label | "Member" |
| "Issue" label | "Question" |
| "Resolve Chain" button | "Trace vote path" |
| "Revoke" button | "Remove" |
| Form title "New Delegation" | "Trust someone with your vote" |
| "From (Delegator)" label | "From" |
| "To (Delegate)" label | "To (Trusted delegate)" |
| "Select participant..." | "Select member..." |
| "All topics (global delegation)" | "All topics (trust on everything)" |

### Polls (polls.tsx)

| Before | After |
|--------|-------|
| Page title "Polls" | "Surveys" |
| "Polls not enabled" | "Surveys not enabled" |
| Description references governance config/presets | Plain language about group settings |
| "Create Poll" button | "New Survey" |
| "No polls yet" | "No surveys yet" |
| "Create a poll to gather participant sentiment" | "Create a survey to gather member feedback" |
| Form title "New Poll" | "New Survey" |
| Placeholder "Poll title" | "Survey title" |
| "Create Poll" submit button | "Create Survey" |

### Members (members.tsx)

| Before | After |
|--------|-------|
| Placeholder "Participant name" | "Member name" |
| "Add members to start governing." | "Add members to start making decisions together." |

### Profile (profile.tsx)

| Before | After |
|--------|-------|
| Page title "Profile" | "Me" |
| "Delegators" stat label | "Trust You" |
| "Delegations" stat label | "My Delegates" |
| "{N} participant(s) delegate to you" | "{N} member(s) trust you with their vote" |
| "Your outbound delegations" | "People you trust" |
| "Delegates to {id}" | "Trusts {id}" |
| "No delegations in this assembly." | "No delegates in this group." |
| "No votes recorded in this assembly." | "No votes recorded in this group." |
| "Go to the Dashboard to pick who you are." | "Go to Home to pick who you are." |

### Assembly Dashboard (assembly-dashboard.tsx)

| Before | After |
|--------|-------|
| "Events" stat card | "Votes" |
| "Your Delegations" stat card | "Your Delegates" |
| "Preset" config row label | "Decision Model" |
| "Polls" config row | "Surveys" |
| "Awareness" config row | "Insights" |
| "Recent Events" heading | "Recent Votes" |
| "{N} issues" badge | "{N} questions" |

### Identity Picker (identity-picker.tsx)

| Before | After |
|--------|-------|
| "Loading participants..." | "Loading members..." |
| "No participants found. Create an assembly first." | "No members found. Create a group first." |

### UI Components (ui.tsx)

| Before | After |
|--------|-------|
| StatusBadge "Deliberation" | "Discussion" |

---

## Files Modified

### platform/web/src/
- `components/layout.tsx` — navigation labels (global + assembly tabs, desktop nav, mobile menu, identity dropdown)
- `components/identity-picker.tsx` — loading text, empty state
- `components/ui.tsx` — StatusBadge deliberation label
- `pages/assembly-list.tsx` — page title, subtitle, presets, create form, card subtitles, pending badges
- `pages/dashboard.tsx` — section headers, card labels, empty states
- `pages/events-list.tsx` — page title, buttons, empty state, issue→question, create form
- `pages/event-detail.tsx` — timeline labels, issue→question summary, Winner→Result, Cast vote→Your vote, Weight Distribution→Vote breakdown, tally stats, status text
- `pages/delegations.tsx` — page title, buttons, headings, empty state, form labels, chain resolver
- `pages/polls.tsx` — page title, buttons, empty states, create form
- `pages/members.tsx` — placeholder text, empty state
- `pages/profile.tsx` — page title, stat labels, delegation text, empty states
- `pages/assembly-dashboard.tsx` — stat labels, config labels, recent events heading, issue badge

## What Was NOT Changed

- API endpoints (`/assemblies`, `/events`, `/participants`, `/delegations`, `/polls`)
- VCP route handlers and middleware
- TypeScript types and interfaces (`VotingEvent`, `ParticipantId`, `DelegationChain`, etc.)
- Engine package code (anything under `packages/`)
- Internal variable names and function names
- Database column names
- Non-user-facing strings (console logs, error codes)

## Test Results

- VCP tests: **16 passed** (3 test files)
- Web TypeScript: **compiles cleanly** (no errors)
- Engine tests: **all passing** (unchanged)
