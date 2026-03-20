# Topic Navigation: Topics as First-Class Entities

**Design Document — v0.1**
**March 2026**

---

## 1. Motivation

Topics in Votiverse started as metadata — labels attached to issues to scope delegations. The formal model defines a topic taxonomy, the engine resolves delegation precedence against it, and the UI renders a small eyebrow label on each issue card. But topics have no presence of their own. You can't click one to see what it contains. You can't browse the topic tree to understand the governance landscape. Topics exist only in the shadow of the entities they classify.

This became visible during the topic reform of March 2026, which introduced:

- **Single topic per issue** — every vote belongs to exactly one topic (or none)
- **Max topic depth of 2** — root topics and one level of children
- **Issue-scoped delegation** — delegate a specific vote without committing to a topic
- **Issue cancellation** — correct misclassification by cancelling and reclassifying

The Riverside Community Center case study illustrated why topic classification is a governance decision, not an organizational convenience. When an issue is classified under "Budget › Fees," it activates different delegations than when the same question is classified under "Programs › Youth." The people who carry weight change. The proposals that lead the conversation change. The outcome may change.

This raised a question: if topics determine who decides, shouldn't voters be able to see what a topic contains, who carries weight in it, and how it's been used over time? The answer is yes — topics deserve to be navigable, explorable, first-class entities in the UI.

---

## 2. Design Principles

**Passive transparency, not active notification.** Topic pages surface governance information for those who look. They don't push alerts. Voter fatigue is the worst enemy — when you notify too much, people start ignoring the important things. Community notes and transparent records are the right tools, not notification badges.

**Facts, not judgments.** The system shows "Sam Okonkwo carries 4 delegated votes on Budget topics." It does not say "warning: high concentration." The voter interprets the number. The system provides the data.

**Natural navigation.** Topics connect to each other (parent ↔ child), to issues (classified under the topic), and to delegations (scoped to the topic). Clicking through these connections should feel like browsing a map, not querying a database.

**Minimal new infrastructure.** Topics already exist in the engine and VCP. The work is primarily UI — a new page, a new nav item, making the eyebrow clickable — plus a couple of API queries.

---

## 3. Topic Page

The topic page is the core new artifact. It shows everything relevant to a single topic in one place.

### 3.1 URL structure

```
/assembly/:assemblyId/topics/:topicId
```

### 3.2 Page layout

#### Header

- **Topic name** as the page title (e.g., "Maintenance")
- **Breadcrumb** to parent topic if this is a child: "Facilities › Maintenance" where "Facilities" is a link
- If this is a root topic with children, show **child topic cards** below the header — each linking to the child's topic page, with a count of active issues

#### Issues section

All voting events that have issues classified under this topic, grouped by status:

- **Active** (deliberation or voting) — shown first, with timeline progress
- **Closed** — shown below, most recent first

For a parent topic (e.g., "Programs"), this section includes issues from all child topics (Youth, Adult). Each issue shows its specific child topic in the eyebrow as usual, so the grouping is clear.

This answers: "What has this community decided about Facilities?" — a question that's currently unanswerable without manually browsing every event.

#### Delegation section

Who carries delegated weight on this topic:

- List of delegates with their delegated vote count, sorted by weight descending
- Each entry shows: delegate name, number of delegators, total weight (self + delegated)
- Example: "Sam Okonkwo — 3 members delegate Budget to Sam (carries 4 votes total)"

For a parent topic, this includes delegations scoped to the parent or any child. A delegation to "Facilities" activates for both Maintenance and Improvements issues.

No Gini coefficients or abstract metrics. No warning colors. Just the numbers.

#### Topic statistics

Simple facts at the top or in a sidebar:

- Total issues classified under this topic (all time)
- Active issues count
- Number of members who delegate this topic
- Number of distinct delegates who receive delegations on this topic

These numbers provide a sense of the topic's governance weight. A topic with 15 closed issues and 5 active delegations is structurally different from one with 2 closed issues and no delegations.

### 3.3 What the topic page does NOT include

- **Topic editing UI** — topic creation and configuration is admin-only and rare; it stays at the API level or in a future admin panel
- **Discussion threads** — topics are not forums
- **Classification suggestions** — no automated "this issue might belong here" recommendations
- **Alert thresholds or warning styling** — numbers only, no judgment

---

## 4. Topics List Page

The entry point for browsing the full topic taxonomy.

### 4.1 URL structure

```
/assembly/:assemblyId/topics
```

### 4.2 Layout

A card-based layout showing root topics, each with:

- Topic name
- List of child topics (as links)
- Count of active issues under this topic (including children)
- Count of active delegations scoped to this topic (including children)

The page gives a bird's-eye view of the governance landscape: where the issues are, where the delegations flow.

---

## 5. Navigation Entry Points

### 5.1 Assembly navbar

Add **"Topics"** to the assembly navigation bar, alongside Votes, Surveys, Delegates, Notes, Group. Topics are a structural concept like Votes and Delegates — they're the map of the decision space. They don't belong under Group/Settings because they're an exploration feature, not a configuration feature.

Updated navbar order:

```
Votes  |  Surveys  |  Delegates  |  Topics  |  Notes  |  Group
```

### 5.2 Topic eyebrow as link

The topic eyebrow on issue cards (e.g., "FACILITIES › MAINTENANCE") becomes a clickable link to the topic page. Clicking "MAINTENANCE" navigates to the Maintenance topic page. Clicking "FACILITIES" navigates to the Facilities topic page.

This is the most natural discovery path: a voter sees a label on their vote, wonders what else falls under that topic, and clicks through. Zero-cost entry point — the eyebrow already exists and already draws the eye.

### 5.3 Delegation page links

On the Delegates page, where delegations show their topic scope (e.g., "Budget · Since Mar 19"), the topic name becomes a link to the topic page. Same natural discovery: "I delegate Budget to Sam — what does Budget actually cover?"

---

## 6. API Requirements

### 6.1 Existing endpoints (sufficient)

- `GET /assemblies/:id/topics` — returns the full topic tree (already exists)
- `GET /assemblies/:id/events` — returns all events with issues (already exists, issues include `topicId`)
- `GET /assemblies/:id/delegations` — returns all delegations with `topicScope` (already exists)

### 6.2 New endpoints (nice to have)

These queries can be done client-side by filtering existing API responses. But dedicated endpoints would be more efficient for assemblies with many events:

- `GET /assemblies/:id/topics/:topicId/issues` — returns issues classified under this topic (including child topics), with their event context and status
- `GET /assemblies/:id/topics/:topicId/delegations` — returns delegations scoped to this topic, with aggregated weight counts

Whether to add these depends on scale. For assemblies with <100 events, client-side filtering is fine. For larger deployments, dedicated endpoints avoid over-fetching.

---

## 7. Awareness Layer for Topics

The topic page provides a natural home for governance awareness information that's specific to a topic. This is not a new awareness system — it's presenting existing data (delegations, issue counts) in a topic-scoped view.

### 7.1 Delegation concentration per topic

The delegation section on the topic page inherently shows concentration. When one delegate carries 4 out of 12 votes on a topic, that's a third of the community's voice flowing through one person. The number is the awareness.

To add comparative context without judgment, the topics list page could show a simple bar for each root topic:

```
Budget      ████████░░░░  4 delegated votes
Programs    ████░░░░░░░░  2 delegated votes
Facilities  ██░░░░░░░░░░  1 delegated vote
```

This lets a voter see at a glance where delegation is concentrated across the governance landscape. No warnings, no colors — just proportional bars and numbers.

### 7.2 Topic activity

The topic page shows issue counts over time. A topic that suddenly starts receiving many more issues than usual could indicate scope creep or strategic classification. The numbers are visible to anyone who visits the topic page.

This connects to the governance attack vector identified during the topic reform: if a delegate accumulates power in a topic, there's an incentive to classify new issues under that topic. Transparent topic activity — visible to anyone who looks — is the passive defense.

### 7.3 What we don't build

- **Alerts or notifications** about topic concentration changes — per the voter fatigue principle
- **Thresholds or warnings** — the system doesn't judge; it shows facts
- **Automated suggestions** like "you might want to review your Budget delegation" — patronizing

---

## 8. Implementation Phases

### Phase 1: Topic page and navigation

1. Create `TopicPage` component (`/assembly/:assemblyId/topics/:topicId`)
2. Create `TopicsList` component (`/assembly/:assemblyId/topics`)
3. Add "Topics" to assembly navbar
4. Make topic eyebrow on issue cards clickable (link to topic page)
5. Make topic names on delegation page clickable
6. Query issues and delegations client-side, filtered by topic

### Phase 2: Topic-scoped awareness data

7. Add delegation weight aggregation to topic page (count delegates, sum weights per delegate)
8. Add delegation concentration bars to topics list page
9. Add issue count statistics to topic page

### Phase 3: Dedicated API endpoints (if needed)

10. `GET /assemblies/:id/topics/:topicId/issues` — server-side topic filtering
11. `GET /assemblies/:id/topics/:topicId/delegations` — server-side delegation aggregation

---

## 9. Decisions Log

| Decision | Rationale |
|----------|-----------|
| Topics in navbar, not under Group | Topics are an exploration feature (like Votes), not a configuration feature (like Group settings) |
| Eyebrow becomes a link | Zero-cost entry point — the element already exists and draws attention |
| Facts, not warnings | Voter fatigue principle — passive transparency over active notifications |
| No topic editing UI | Topic creation is rare and admin-only; API-level is sufficient for now |
| Client-side filtering first | Most assemblies have <100 events; dedicated endpoints can come later if needed |
| Parent topic pages include child issues | "What has this community decided about Programs?" should include both Youth and Adult issues |
| No forums or discussions on topics | Topics are a governance map, not a communication channel; scope creep risk |
