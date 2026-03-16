# Votiverse Terminology & UX Guide

**Internal Reference Document — v0.1 Draft**

This document catalogues terminology and UX issues in the Votiverse web client and provides concrete guidance for resolving them. Every agent working on the UI must read this document. The goal is to make the app understandable to someone who has never heard of liquid democracy, delegation graphs, or governance configuration spaces — a 15-year-old choosing a class delegate, a soccer parent voting on jerseys.

---

## 1. Core Principle

**Use the words that normal people use.** If a concept requires explanation, the label is wrong. Technical terms from the engine architecture should never appear in the UI. The user doesn't know what an "event" is in our system, what "weight distribution" means, or why "polls" and "votes" are different things. They know: "there's a vote happening," "I trust Maria on budget stuff," and "the coach asked how practice has been going."

---

## 2. Terminology Fixes

### 2.1 "Events" → "Votes" (or "Voting")

**Problem:** The nav tab says "Events." In the engine, a VotingEvent is an event with issues that people vote on. But "event" means nothing to a user — it could be a calendar event, a social event, anything. Milena (15yo tester) gravitated toward "Polls" instead of "Events" when she wanted to create a vote for her class.

**Fix:** Rename "Events" to "Votes" or "Voting" everywhere in the UI.

| Current | Replace with |
|---------|-------------|
| Events (nav tab) | Votes |
| Create Event | Create a Vote |
| Event Detail | (just show the vote title) |
| Voting Event | Vote |
| "3 of 3 issues need your vote" | "3 questions need your vote" (see 2.3) |

In the engine code, `VotingEvent` can keep its name. The UI label is what changes.

### 2.2 "Polls" → "Surveys"

**Problem:** "Polls" sounds like voting. In everyday English, "take a poll" means "vote." But in Votiverse, polls are the sensing mechanism — quick observations like "How has park maintenance been?" They are explicitly not decisions. This is the #1 terminology collision.

**Fix:** Rename "Polls" to "Surveys." Everyone knows what a survey is. It's clearly not a vote. It correctly implies "someone is asking me something" rather than "I'm deciding something."

| Current | Replace with |
|---------|-------------|
| Polls (nav tab) | Surveys |
| Create Poll | New Survey |
| Poll Results | Survey Results |
| Respond to Poll | Respond |
| "Poll available" (notification) | "New survey available" |

### 2.3 "Issues" → "Questions" or "Proposals"

**Problem:** Inside a voting event, individual items are called "issues." "3 of 3 issues need your vote." But "issue" is vague and slightly negative (like a software bug or a complaint). Users think of these as "questions" or "proposals."

**Fix:** Use "questions" for simple yes/no/for/against items. Use "proposals" for items with substantial descriptions and booklet content.

| Current | Replace with |
|---------|-------------|
| "3 of 3 issues need your vote" | "3 questions need your vote" |
| Issue title | (just show the title, no label needed) |

### 2.4 "Assembly" → needs careful framing

**Problem:** "Assembly" is the correct governance term and it's the engine's core concept. But when someone opens the app for the first time and sees "Assemblies" in the nav, they don't know what it means. Is it a meeting? A group? A building?

**Fix:** Don't rename "Assembly" — it's the right word and it's distinct. But always explain it in context:

- First encounter: "An Assembly is your group's governance space — where your club, co-op, or community makes decisions together."
- Nav label: "My Groups" or "My Assemblies" (with subtitle "Your communities" on first visit)
- When creating: "Create a new group" → then explain it's called an Assembly

The onboarding flow should introduce the concept naturally. After the first use, "Assemblies" becomes familiar.

### 2.5 "Delegations" → "Trusted Voices" or "My Delegates"

**Problem:** "Delegations" is abstract. A user thinks: "I trust Carlos to vote on equipment stuff for me." The word "delegation" doesn't capture that — it sounds bureaucratic. The nav tab "Delegations" doesn't tell a new user what they'll find there.

**Fix:** The nav tab could be "Delegates" (who you trust) or "My Delegates." The action of delegating could be framed as "Trust [person] on [topic]."

| Current | Replace with |
|---------|-------------|
| Delegations (nav tab) | Delegates |
| Create Delegation | Trust someone with your vote |
| Revoke Delegation | Remove |
| "Delegation chain" | "Your vote path" or "How your vote flows" |

### 2.6 "Weight Distribution" → plain language

**Problem:** The vote results show "Weight Distribution" as an expandable section. A normal person has no idea what "weight distribution" means in this context. It's engine terminology that leaked directly into the UI.

**Fix:** Replace with something that explains what the user is seeing:

| Current | Replace with |
|---------|-------------|
| "Weight Distribution" | "Vote breakdown" or "How votes counted" |
| "Total: 10 weighted votes" | "10 votes total (including delegated votes)" |
| "9 votes (90%)" | "9 votes (90%) — includes 4 delegated votes" |
| "Participating: 10/18" | "10 of 18 members voted" |
| "Quorum: Met (10%)" | "Enough members voted to count ✓" or just a green checkmark |

The concept of delegation weight is important but should be explained through the numbers, not through jargon. Show who voted, show that some people's votes carried extra weight because others delegated to them, and let the user understand through the data.

### 2.7 "Cast vote" → "Vote"

**Problem:** "Cast vote:" with a colon before the For/Against/Abstain buttons is unnecessarily formal and slightly confusing (is "Cast vote" a label or a button?).

**Fix:** Either remove the label entirely (the buttons speak for themselves) or use "Your vote:" if a label is needed.

### 2.8 "Winner: for" → should not appear during open votes

**Problem:** The screenshot shows "Winner: for" on an issue where voting is still open. This is a bug — there's no winner until voting closes. Even after closing, "Winner: for" is confusing. "For" is not a winner — it's a position.

**Fix:**
- **During open voting:** Show "Leading: For (90%)" or nothing at all if you don't want to influence voters.
- **After voting closes:** Show "Result: Approved" or "Result: Not approved" (for yes/no votes). Or "Decided: For" if the vote has more than two options.
- Never show "Winner" — governance decisions aren't competitions.

### 2.9 "Participant" → "Member"

**Problem:** The engine uses "Participant" and "ParticipantId" internally. If this surfaces in the UI, it's robotic. People in a soccer club are "members." People in a community group are "members."

**Fix:** Always use "member" in the UI.

| Current | Replace with |
|---------|-------------|
| Participants | Members |
| Add Participant | Add a Member |
| Participant selector | (see Section 3) |

### 2.10 "Awareness" → "Insights" or just integrate it

**Problem:** The nav tab "Awareness" is the governance awareness layer from the whitepaper. It's a great concept, but the word "awareness" as a nav label is vague. Awareness of what?

**Fix:** Rename to "Insights" — it implies "here's useful information about how your community's governance is working."

| Current | Replace with |
|---------|-------------|
| Awareness (nav tab) | Insights |
| Awareness panel | Governance insights |
| Concentration metrics | "Voting power balance" or "Power distribution" |

### 2.11 Governance Presets — scenario-driven, not jargon-driven

**Problem:** The engine has six governance presets: Town Hall, Swiss Model, Liquid Standard, Liquid Accountable, Board Proxy, Civic Participatory. These names are meaningful to governance theorists but not to a soccer club president creating their first Assembly. "Liquid Standard" means nothing. "Liquid Accountable" sounds financial. Even "Town Hall" is ambiguous — is it a meeting format or a voting system?

**Fix:** The preset selection experience should be **scenario-driven**. The user answers a question about how their group works, not which governance model they want. The formal preset names can appear as small text for people who recognize them, and in admin settings after creation.

**Selection screen: "How should your group make decisions?"**

| What the user sees | Description shown | Engine preset |
|---|---|---|
| **Everyone votes directly** | Every member votes on every question. Simple and equal. Best for small groups where everyone is engaged. | Town Hall |
| **Discuss, then vote** | A structured discussion period, then a direct vote by all members. Best for important decisions that benefit from community debate. | Swiss Model |
| **Members choose trusted delegates** | Members can delegate their vote to someone they trust, by topic. Delegates vote on their behalf but members can always override. Best for groups where not everyone can follow every issue. | Liquid Standard |
| **Delegates with full accountability** | Same as above, but all delegate votes are visible and predictions are tracked over time. Best for groups that want accountability built in. | Liquid Accountable |
| **Elected representatives** | Members elect or appoint representatives who vote on their behalf. Traditional model. Best for organizations with existing board structures. | Board Proxy |
| **Mixed approach** | Some topics decided by direct vote, others through delegates. Configurable per topic. Best for larger organizations with diverse decision types. | Civic Participatory |

**After creation,** the Assembly settings can show the formal preset name for reference: "Your group uses the Liquid Standard governance model. [What does this mean? →]"

**Key principle:** The user picks based on "what will this feel like for my members?" not "which governance theory do I subscribe to?"

### 2.12 "Trust" — Action Phrase Only, Never Describe Relationships

**Problem:** The delegation UI uses "trust" to describe the relationship between people: "People who trust you," "X members trust you with their vote." This frames delegation as an emotional/interpersonal judgment. But delegation is functional — someone delegates because they believe the other person is better informed or more qualified on a topic, not because they "trust" them in a personal sense.

**Fix:** "Trust someone with your vote" is a valid **action phrase** for the act of delegating — it describes what the user is doing, not the relationship. But never use "trust" to describe the relationship itself or to label other people's actions.

| Wrong (never use) | Correct |
|---|---|
| "People who trust you" | "People who delegate to you" |
| "X members trust you with their vote" | "X members delegate to you" |
| "People you trust" | "Your delegates" |
| "Trust You" (profile stat) | "Delegate to you" |
| "When other members trust you..." | "When other members delegate to you..." |
| "Trusted delegate" (form label) | "Delegate" |
| "All topics (trust on everything)" | "All topics" |

The action phrase remains valid:
- "Trust someone with your vote" (CTA button) — OK
- "Delegate your vote" (alternative CTA) — also OK

The relationship is always described functionally, not emotionally.

---

## 3. UX Issues

### 3.1 The Assemblies List Screen

**Problem (from screenshot):** The page title is "Assemblies" with subtext "Governance assemblies on this VCP instance." This is developer-speak. It exposes internal architecture ("VCP instance"), uses jargon ("governance assemblies"), and tells the user nothing useful. A soccer parent seeing this would not know what to do.

Additional issues on this screen:
- Each card shows the preset name in technical form: "Board Proxy preset", "Liquid Accountable preset", "Liquid Standard preset." These mean nothing to users (see Section 2.11).
- "X pending" badges are good but could be more specific — pending what? Votes? Surveys?
- The date (3/15/2026) appears to be a creation date but isn't labeled.
- "Create Assembly" is correct for now but should eventually become "Create a Group" or "Start a new group."

**Fix:**

Page title and subtext:
| Current | Replace with |
|---------|-------------|
| "Assemblies" | "My Groups" |
| "Governance assemblies on this VCP instance" | "Your communities and organizations" (or no subtext at all — the list speaks for itself) |

Card subtitles — replace preset jargon with plain descriptions:
| Current | Replace with |
|---------|-------------|
| "Board Proxy preset" | "Elected representatives" |
| "Liquid Accountable preset" | "Delegates with accountability" |
| "Civic Participatory preset" | "Mixed — direct votes and delegates" |
| "Liquid Standard preset" | "Flexible delegation" |
| "Town Hall preset" | "Everyone votes directly" |

Pending badges — be specific:
| Current | Replace with |
|---------|-------------|
| "1 pending" | "1 vote needs you" |
| "3 pending" | "3 votes need you" |
| "10 pending" | "10 votes need you" |

If pending items include both votes and surveys, show: "3 votes, 2 surveys need you" or just the total: "5 items need you."

The date should either be labeled ("Created Mar 15") or removed if it's not useful to the user. Most users don't care when the Assembly was created.

**General rule for every screen:** No subtext should ever reference VCP, engine, instance, configuration, preset, or any other implementation term. If a subtext would only make sense to a developer, delete it or rewrite it for a human.

### 3.2 Opening a group should be obvious

**Problem:** When a user first lands in the app, it's not clear what an Assembly is or how to enter one. The path from "I opened the app" to "I'm looking at my community's votes" should be two taps maximum.

**Fix:** 
- If the user belongs to one group, go directly to its dashboard.
- If the user belongs to multiple, show the list above with pending action counts.
- The first-visit experience should include a one-sentence explanation: "These are the groups you're part of. Tap one to see what needs your attention."

### 3.3 The participant selector needs context

**Problem:** In the dev client, the participant selector in the header lets you switch identities. This is a developer tool. In the real app, it becomes the user's identity — their name and avatar in the header. But even in the dev client, it should be labeled clearly: "Viewing as: Victoria Harrington" rather than just showing the name with no context.

### 3.3 "Deliberation → Voting → Closed" timeline

**Problem:** The timeline in the vote detail view (Image 2) shows "Deliberation → Voting → Closed" which is good, but "Deliberation" may not be understood by all users.

**Fix:** Consider "Discussion → Voting → Ended" or "Review → Voting → Closed."

### 3.4 Vote results during open voting

**Problem:** The vote results are fully visible while voting is still open (Image 2 shows results with voting still open). This can influence voters — seeing that "For" has 90% might discourage "Against" voters from participating.

**Fix:** This is a governance configuration choice, not a UX bug. Some Assemblies want transparent live results; others want sealed results until voting closes. The UI should respect the Assembly's configuration. But the default should probably be to hide results until voting closes, showing only "X of Y members have voted" during the open period.

### 3.5 Dashboard voting activity cards

**Problem:** In Image 1, the "Voting Activity" cards each show the event name ("Emergency Infrastructure Measures") and the issue name ("Approve Emergency Bridge Repair Funding"). But the event name repeats on every card because all issues belong to the same event. This is redundant.

**Fix:** Group by vote (event), then list the questions (issues) within it:

```
Emergency Infrastructure Measures — Vote needed, closes in 2d 23h
  • Approve Emergency Bridge Repair Funding
  • Temporary Traffic Management Plan
  • Resident Relocation Assistance Program
```

### 3.7 "Vote needed" vs "Vote now"

The dashboard banner says "Vote Now" (prominent blue CTA) and the cards say "Vote needed" (orange text). These should be consistent. "Vote now" on the banner is good. The cards could say "Not yet voted" or simply show no badge if the user hasn't voted, and a checkmark if they have.

### 3.8 Participant vs Organizer — two different experiences

**Problem:** The app mixes participation and organization on every screen. The "Create Assembly" button sits next to the list that most users are just browsing. Creation actions are scattered across different sections. But most users (90%+) are participants — they open the app, see what needs attention, vote, respond, done. A smaller group are organizers — the club president, the board chair — who create votes, write surveys, add members.

**Fix:** Separate these paths without complicating navigation:

**For participants (the default experience):**
- The home dashboard shows what needs attention: pending votes, open surveys, recent results.
- Tapping a group shows its activity: active votes, surveys, delegate info, insights.
- No creation buttons visible in the primary flow. The experience is: read, decide, respond.

**For organizers (accessible but not prominent):**
- A persistent **"+"** button (floating action button or header icon) available on relevant screens. Tapping it shows contextual creation options:
  - On the home/groups screen: "New group"
  - Inside a group: "New vote," "New survey," "Add member"
- Within each section, a subtle creation link at the top: "Create a vote →" in the Votes tab, "New survey →" in the Surveys tab. Visually quiet — a text link, not a prominent button.
- A dedicated **"Manage"** or **"Settings"** area within each group for administrative tasks: member management, governance configuration, delegation rules.

**The principle:** Participation is the default. Organization is available but doesn't clutter the participant experience. A soccer parent voting on jerseys should never feel like they're looking at an admin panel.

**Creation action naming:**

| Action | User-facing label |
|--------|------------------|
| Create a voting event | "New vote" or "Create a vote" |
| Create a poll | "New survey" |
| Create an Assembly | "New group" or "Start a new group" |
| Add a participant | "Add a member" or "Invite someone" |
| Create a delegation | "Trust someone with your vote" |
| Create an Organization | "Set up an organization" (this is rare and admin-only) |

---

## 4. Navigation Structure

### 4.1 Top-level navigation

Current: Dashboard | Assemblies | Profile

Recommended: **Home | My Groups | Me**

"Home" is the personal dashboard — what needs your attention across all your groups. "My Groups" is the list of Assemblies. "Me" is profile and settings.

### 4.2 Inside a group (Assembly)

Current: Overview | Events | Delegations | Polls | Members

Recommended: **Overview | Votes | Delegates | Surveys | Members | Insights**

"Overview" is the group dashboard — activity summary, pending items, quick stats. The other tabs drill into each domain.

### 4.3 Creation actions

A "+" icon in the header or a floating action button, contextual to the current screen:

- **On Home:** + → "New group"
- **On a group's Overview:** + → "New vote" / "New survey" / "Invite member"
- **On Votes tab:** + → "New vote"
- **On Surveys tab:** + → "New survey"
- **On Members tab:** + → "Invite member"

The "+" is only visible to users with organizer permissions for that group. Participants don't see it.

---

## 5. Rules for Agents

When working on the Votiverse UI:

1. **Never use engine terminology in user-facing text.** VotingEvent, ParticipantId, DelegationGraph, TopicScope, BallotMethod, ConcentrationMetric — none of these should appear anywhere a user can see them.

2. **Test every label with the question: "Would a 15-year-old understand this?"** If the answer is no, rewrite it.

3. **Prefer verbs over nouns.** "Vote" over "Voting Event." "Trust someone" over "Create Delegation." "Check in" over "Submit Poll Response."

4. **Explain through context, not labels.** Instead of labeling something "Weight Distribution," show the data in a way that makes the concept self-evident: "Carol voted For (her vote + 2 delegated votes = weight of 3)."

5. **When in doubt, use fewer words.** "For" and "Against" buttons don't need a "Cast vote:" label in front of them.

6. **Respect the distinction between voting and sensing.** Votes are decisions. Surveys are observations. The UI should make this feel different — votes are serious (booklets, deadlines, results), surveys are casual (quick, lightweight, trend-building). Different visual treatment, different language, different energy.

---

*This document should be referenced by every agent working on the Votiverse UI. It should be updated as new terminology issues are discovered.*