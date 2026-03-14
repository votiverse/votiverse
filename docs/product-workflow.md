# Votiverse Product Workflow

**Product Design Document — v0.1 Draft**

---

## 1. Overview

This document describes how organizations and individuals use Votiverse — the entities they create, the workflows they follow, and the experience at each step. It complements the [whitepaper](whitepaper.md) (which defines the governance model) and the [architecture document](architecture.md) (which defines the technical implementation).

The whitepaper answers *why*. The architecture answers *how it's built*. This document answers *how it's used*.

---

## 2. Entity Model

Votiverse has four core entities, organized in two layers.

### 2.1 Infrastructure Layer

**Platform Account.** A person's global identity on Votiverse. Holds authentication credentials, email, and a list of Organizations and Assemblies they belong to. A Platform Account carries no governance meaning — it is infrastructure. A person has one Platform Account regardless of how many Organizations or Assemblies they participate in.

**Organization.** An administrative entity that manages a member roster and creates Assemblies. An Organization represents a real-world group — a company, a cooperative, a municipality, an association — but Votiverse does not model or care about the group's external structure. FIFA, AFA, and River Plate would each be separate Organizations. Their hierarchical relationship exists in the real world, not in the platform.

An Organization provides:
- a canonical member roster (the pool of people who belong to the group),
- identity verification baseline (SSO, email domain, verified ID — configured once, applied to all members),
- billing and subscription management,
- the ability to create and manage Assemblies.

### 2.2 Governance Layer

**Assembly.** The governance container. An Assembly is where decisions are made, proposals are debated, predictions are tracked, polls are conducted, and institutional memory accumulates. Each Assembly has an immutable governance configuration set at creation — its rules do not change over the Assembly's lifetime.

An Assembly can be:
- **Organization-backed** — draws participants from an Organization's member roster. The Organization handles identity verification. The Assembly can add participation criteria on top ("only Engineering department" or "opt-in required").
- **Standalone** — manages its own membership directly through invitations and verification. No Organization layer. This is the path for small groups, ad-hoc communities, open-source projects, and any context where a formal Organization wrapper is unnecessary.

**Membership.** The relationship between a person and an Assembly. Membership is where the governance contract applies — the Assembly's rules, the participant's delegations, their voting history, their poll responses, their prediction track record. A person may hold memberships in multiple Assemblies across multiple Organizations. Each membership is independent — delegations, history, and track records are scoped to the Assembly.

### 2.3 Entity Relationships

```
Platform Account (person)
  └── belongs to Organizations (administrative)
  └── holds Memberships in Assemblies (governance)

Organization (administrative)
  └── owns member roster
  └── creates Assemblies

Assembly (governance)
  ├── Organization-backed (draws from org roster)
  │   └── participation criteria filter the roster
  └── Standalone (manages own membership)

Assembly contains:
  ├── Members (with roles)
  ├── Voting Events (with issues, booklets, proposals, predictions)
  ├── Polls (with questions, responses, trends)
  └── Institutional Memory (accumulated history)
```

### 2.4 What Votiverse Does Not Model

Votiverse does not model organizational hierarchy, federation, or cross-organization relationships. If FIFA wants to elect representatives through a Votiverse Assembly, and those representatives then participate in a separate FIFA-level Assembly, that coordination happens in the real world. Votiverse provides independent governance tools at each level. Organizations compose them as they see fit.

This is deliberate. Organizations know their own structure better than any platform. Votiverse provides the governance primitives; organizations compose them into their workflows.

---

## 3. Roles and Permissions

Roles differ between the Organization level and the Assembly level because the purpose of each level is different. Organization roles are administrative. Assembly roles are governance-operational.

### 3.1 Organization Roles

| Role | Purpose | Permissions |
|------|---------|-------------|
| **Owner** | Created the Organization. Ultimate authority. | Everything, including billing, deletion, and designating Admins. |
| **Admin** | Manages the Organization's operations. | Create Assemblies, manage member roster (invite, approve, remove), configure identity providers, designate Assembly admins. |
| **Member** | Belongs to the Organization roster. | Can be assigned to Assemblies. No administrative power over the Organization. |

An Organization typically has one or two Owners and a small number of Admins. Most people are Members.

### 3.2 Assembly Roles

| Role | Purpose | Permissions |
|------|---------|-------------|
| **Creator** | Set up the Assembly. Bootstrapping role. | Initial admin rights. Designates Administrators. Can step back to Member. |
| **Administrator** | Runs the governance process. Procedural, not editorial. | Create voting events, define issues, manage timelines, enforce formatting rules, schedule polls, moderate community notes. Does not rewrite proposals or decide outcomes. |
| **Member** | The default role for every participant. | Vote, delegate, respond to polls, read booklets, contribute community notes, submit proposals (if the Assembly permits), submit predictions. |

**Key principle:** An Organization Admin is not automatically an Assembly Administrator. Creating an Assembly and administering its governance process are separate concerns. The Organization Admin designates the Assembly's initial Administrators, who may be entirely different people.

### 3.3 Proposal Submission

The whitepaper defines a "Proponent" role for submitting proposals. In the product model, Proponent is not a standing role — it is an action any Member can take, subject to the Assembly's configuration:

- **Open proposals:** Any Member can submit a proposal for a voting event. Administrators review for formatting compliance but do not gate content.
- **Moderated proposals:** Any Member can submit a proposal. Administrators approve or reject before the proposal appears in the booklet.
- **Restricted proposals:** Only Administrators can attach proposals to voting events. Members may suggest proposals through a separate channel (community notes, discussion, external communication).

The proposal submission mode is an Assembly configuration parameter.

### 3.4 Invitation and Enrollment

Who can invite new members to an Assembly is configurable per Assembly:

- **Admin-only:** Only Administrators can invite or approve new members.
- **Member-invite:** Existing Members can send invitations, subject to admin approval.
- **Open enrollment:** Anyone meeting the Assembly's identity requirements can join without invitation.
- **Request-based:** Anyone can request to join. Administrators approve or reject.

This is an Assembly configuration parameter, not a role property.

---

## 4. Assembly Lifecycle

### 4.1 Creation

An Assembly is created by an Organization Admin (for Organization-backed Assemblies) or by any Platform Account holder (for standalone Assemblies).

The creation flow:

**Step 1: Name and purpose.** The creator gives the Assembly a name and a brief description of its purpose. The name is the Assembly's display identity — "Ottawa Parents' Assembly," "Engineering Governance," "River Plate Member Decisions."

**Step 2: Select governance preset.** The creator selects a named preset or enters experimental mode. The preset selection is the defining moment — it determines how governance works for the lifetime of this Assembly. The interface should present presets in plain language:

- **Town Hall** — "Everyone votes on everything. No delegation. Simple majority. Good for groups under 30."
- **Swiss Model** — "Direct vote on each issue with a structured booklet. Predictions encouraged. Good for associations and cooperatives that want informed voting."
- **Liquid Standard** — "Delegate by topic. Vote when you care. Delegates are your backup. Good for organizations with diverse expertise."
- **Liquid Accountable** — "Liquid Standard plus mandatory predictions, full awareness layer, and public delegate track records. For organizations that prioritize long-term accountability."
- **Board Proxy** — "Single-delegate proxy voting. Non-transitive. For formal governance bodies."
- **Civic Participatory** — "Liquid delegation with chain depth limits, verified identity, mandatory predictions, community notes, polls, and blockchain integrity. For municipal and civic deployments."
- **Experimental** — "Configure every parameter yourself. For governance researchers and innovators. Untested combinations may produce unexpected behavior."

**Step 3: Configure topics (optional).** For presets that support delegation, the creator defines the initial topic taxonomy — the categories that delegations can be scoped to. Topics can be added later but form the backbone of the delegation system.

**Step 4: Configure identity requirements.** For Organization-backed Assemblies, this may be inherited from the Organization (SSO, email domain). For standalone Assemblies, the creator configures: invitation-only, email verification, or other verification. The Assembly can require stricter verification than the Organization baseline.

**Step 5: Assembly is created.** The governance configuration is locked. The Assembly is ready for members.

### 4.2 Governance Immutability

An Assembly's governance configuration is **immutable after creation**. The rules do not change for the lifetime of the Assembly.

**Why:** When a participant joins an Assembly, they enter a social contract. "These are the rules. Your vote works this way. Delegation works this way. Predictions are required (or optional). Ballots are secret (or public)." That contract is the basis for trust. If the rules can change — especially by administrative decision — the trust foundation shifts. Participants who delegated under one set of rules might find their delegation means something different under new rules. Rule changes can be used strategically — change the rules right before a contentious vote.

**If the organization needs different rules:** Create a new Assembly. Participants are invited to the new Assembly with a clear explanation of what changed. They choose to join (or not) with full knowledge of the new contract. The new Assembly can import historical context (prediction track records, poll trends) from the predecessor as read-only reference material. The data transfers; the governance contract does not.

This also creates natural historical boundaries. "Assembly v1 ran from 2026–2028 with Town Hall rules. Assembly v2 started in 2028 with Liquid Standard rules." Each era has its own clean record.

### 4.3 The Joining Moment

When a participant joins an Assembly, they see a **governance contract summary** — a human-readable explanation of what membership means, generated from the Assembly's governance configuration. This is not a legal document. It is a clear, plain-language description of the rules:

*Example for a Liquid Accountable Assembly:*

> **Welcome to the Engineering Governance Assembly.**
>
> Here's how decisions work in this Assembly:
>
> **Voting.** When a voting event is created, you'll receive a booklet with proposals, arguments, and predictions. You can vote directly on any issue.
>
> **Delegation.** You can delegate your vote on specific topics to someone you trust. Your delegate is your backup — they vote on your behalf only if you don't vote yourself. You can change or revoke delegations at any time and override any delegation by voting directly.
>
> **Predictions.** Every proposal must include predictions about expected outcomes. After the timeframe elapses, outcomes are recorded and prediction accuracy is tracked. This builds a record of who predicts well.
>
> **Polls.** You'll receive periodic polls asking about your observations and experiences. Poll responses are personal — they cannot be delegated. Your responses are anonymous in aggregate.
>
> **Transparency.** Delegate voting records and prediction track records are visible to all members. Delegation chains are visible to you. Concentration of voting weight is monitored and reported.

The content of this summary varies with the governance configuration. A Town Hall Assembly produces a shorter, simpler explanation. A Civic Participatory Assembly produces a more detailed one. The summary is generated, not hand-written — ensuring it always matches the actual configuration.

---

## 5. Core Workflows

### 5.1 Voting Event Workflow

A voting event is the operational unit of governance — analogous to a Swiss votation day.

**1. Creation.** An Administrator creates a voting event with a title, a timeline (deliberation period → voting period → close), and one or more issues.

**2. Issue definition.** For each issue, the Administrator provides an official neutral description. The issue is tagged with topics from the Assembly's taxonomy.

**3. Proposal submission.** Proponents submit proposals for each issue, along with supporting arguments and predictions (if required by the configuration). Opponents submit counter-arguments. The Administrator reviews for formatting compliance (not content) and assembles the digital booklet.

**4. Deliberation period.** The booklet is published. Members read proposals, arguments, predictions. Community notes may be submitted and evaluated. Members set or adjust their delegations. The awareness layer surfaces relevant context: past decisions on related topics, poll trends, delegate track records.

**5. Voting period.** Members vote directly or let their delegations stand. Delegates cast votes that carry the weight of those who delegated to them. Members can override delegations by voting directly at any time before close.

**6. Close and tally.** Voting closes. The engine computes final weights (applying the override rule, resolving transitive chains, handling cycles), tallies results using the configured ballot method, and checks quorum. Results are published.

**7. Outcome tracking (later).** After the proposal's prediction timeframe elapses, outcomes are recorded from various sources (official data, polls, community-submitted, AI-gathered). Predictions are evaluated. Track records are updated. The institutional memory grows.

### 5.2 Poll Workflow

Polls are the sensing mechanism — non-delegable observations from participants about their lived experience.

**1. Scheduling.** An Administrator schedules a poll, defining questions, topic tags, and the open/close window. The Assembly's configuration may specify a cadence (quarterly, biannual) and frequency limits.

**2. Question design.** Questions use structured types (likert scale, numeric, direction, yes/no, multiple choice) to ensure responses are aggregable and trend-compatible. Questions are tagged with topics for trend computation. The Administrator ensures neutral framing.

**3. Response collection.** When the poll opens, all Members are notified. Responses are non-delegable — each Member responds for themselves or not at all. Duplicate responses are rejected. Responses are linked to verified participants for deduplication but can be aggregated anonymously.

**4. Aggregation.** When the poll closes, results are computed: response rates, means, medians, distributions per question. Results are available to all Members.

**5. Trend computation.** The system normalizes responses to a [-1, +1] sentiment scale per topic and adds the data point to the topic's trend line. Over time, trend lines show how community sentiment evolves.

**6. Integration.** Poll results and trends feed into the awareness layer. When a new voting event introduces issues on topics that have been polled, the awareness layer surfaces the relevant trend data at the point of decision.

### 5.3 Delegation Workflow

Delegation is always initiated by the participant — never assigned by an administrator or by the system.

**1. Browse delegates.** A Member exploring delegation can view other Members' public profiles (configurable per Assembly): their topic areas of activity, their prediction track record, their participation rate. The awareness layer surfaces this information to support informed delegation choices.

**2. Set delegation.** The Member selects a delegate and a scope (specific topics, or global). The system confirms: "You are delegating [topics] to [delegate]. They will vote on your behalf on these topics only if you don't vote yourself. You can change or revoke this at any time."

**3. Chain visibility.** After setting a delegation, the Member can see the full resolved chain — not just their immediate delegate, but the terminal voter (the person who will ultimately cast the vote, accounting for transitive delegation). If the terminal voter changes (because the delegate re-delegated), the awareness layer notifies the Member.

**4. Override.** At any time during a voting period, the Member can vote directly. This automatically overrides the delegation for that specific issue. No revocation needed.

**5. Revocation.** The Member can revoke a delegation at any time. The system recomputes weights immediately.

---

## 6. First Five Minutes

The onboarding experience should be guided by the Assembly's governance preset. Different presets lead to different first actions.

### 6.1 Small Group (Town Hall)

The goal is to resolve a real decision quickly.

1. Admin creates a standalone Assembly with Town Hall preset.
2. Admin invites 10–20 members by email or link.
3. Members join, read the governance summary (brief — "everyone votes, simple majority").
4. Admin creates a voting event with one or two real issues the group needs to decide.
5. Members vote. Results appear. The group has made its first structured decision.

**Time from creation to first result: under 15 minutes.** The value at this scale is not the information infrastructure — it is structure. A clean process replacing messy group chats and whoever-talks-loudest meetings.

### 6.2 Medium Organization (Liquid Standard)

The goal is to demonstrate delegation.

1. Organization Admin creates an Organization and adds employees to the roster.
2. Admin creates an Assembly with Liquid Standard preset and 3–4 topics.
3. Members join, read the governance summary (explains delegation, overrides, topic scoping).
4. Admin creates a voting event with 3–5 issues across multiple topics.
5. Members discover delegation: "I don't know enough about Finance, but I trust Maria. I'll delegate Finance to her and vote directly on the Community issue."
6. Results show how delegation affected the outcome. Members see their chain.

**The first delegation is the product's "aha" moment** at this scale. The system should make it feel natural and safe.

### 6.3 Civic Deployment (Civic Participatory)

The goal is to start with sensing, not deciding.

1. Organization (municipality) creates an Assembly with Civic Participatory preset and verified identity enrollment.
2. Residents enroll, identity verified.
3. The first action is a **poll**, not a vote: "What are the biggest issues facing our neighborhood? Rate your satisfaction with transit / schools / safety / parks."
4. Poll results are published. The community sees its own collective sentiment for the first time.
5. The first voting event references poll results: "67% of participants rated park maintenance as poor. Here is a proposal to address it."

**Starting with sensing establishes the listening posture** before asking anyone to decide. It generates the first data point for trend lines and signals that the platform values observation.

---

## 7. Open Workflow Questions

The following questions are identified but not yet resolved. They will be addressed as the product design matures.

### 7.1 Assembly Configuration Boundaries

- **What exactly is immutable?** The core governance parameters (delegation model, ballot method, transitivity, prediction requirements) are clearly immutable. But what about operational parameters like poll cadence, community notes enablement, or awareness layer thresholds? Should there be a distinction between "constitutional" parameters (immutable) and "operational" parameters (adjustable by Administrators)?
- **Assembly succession workflow.** When an organization creates a new Assembly to replace an old one, what is the migration experience? How is historical data imported? How are members notified and transferred?

### 7.2 Identity and Verification

- **Verification upgrade paths.** Can an Assembly that started with invitation-only later require stricter verification for existing members? Or does this require a new Assembly?
- **Cross-Assembly identity.** A user belongs to multiple Assemblies. Should any information flow between them? Currently the answer is no — each Assembly is fully independent. But there might be cases where a user wants to present their track record from one Assembly as a credential in another.
- **Pseudonymous participation.** Some governance contexts want participants verified as unique but not publicly identified. How does this interact with delegation (where you need to choose a delegate by some identifier) and awareness (where track records are public)?

### 7.3 Voting Events

- **Proposal editing.** Can a proposal be edited after submission but before the voting period? What about predictions — can they be refined before the commitment hash is generated?
- **Minimum deliberation period.** Should the platform enforce a minimum time between booklet publication and voting start, to prevent snap votes that bypass deliberation?
- **Tie-breaking.** How are ties handled for each ballot method? The engine implements tally computation, but the product workflow needs to define what happens when a vote is tied.

### 7.4 Delegation

- **Delegation discovery.** How do members find good delegates? In a small group, everyone knows everyone. In a 500-person organization, the awareness layer needs to surface useful signals — but without creating a popularity contest. What information is shown when browsing potential delegates?
- **Delegation expiration.** Should delegations have a configurable expiration? "I trust Maria on Finance right now, but I want the system to remind me to re-evaluate in 6 months."
- **Delegation during voting.** Can a member create a new delegation after a voting event has started but before it closes? What about revoking a delegation mid-event?

### 7.5 Polls

- **Question proposal process.** In larger deployments, who proposes poll questions? Administrator-only, or can members suggest questions? What is the review process?
- **Response editing.** Can a participant change their poll response before the poll closes?
- **Poll result visibility timing.** Should results be visible while the poll is still open (potentially influencing later responses), or only after close?

### 7.6 Moderation

- **Community notes moderation.** Who can flag or remove inappropriate community notes? Is this Administrator-only, or can the community self-moderate through the rating system?
- **Participant misconduct.** What happens when a participant acts in bad faith — submitting spam proposals, abusing community notes, or conducting coordinated manipulation? What enforcement mechanisms exist?
- **Appeal processes.** If an Administrator rejects a proposal or removes a member, is there an appeal mechanism?

### 7.7 Data and Privacy

- **Data portability.** Can a participant export their personal data (voting history, delegation history, poll responses) from an Assembly?
- **Right to be forgotten.** Can a participant request deletion of their data from an Assembly? How does this interact with the institutional memory (their votes affected outcomes that are part of the historical record)?
- **Public vs. private Assemblies.** Can the existence of an Assembly be public while its membership and activity are private? Can poll results be made public to non-members?

---

## 8. Glossary Additions

| Term | Definition |
|------|------------|
| **Platform Account** | A person's global identity on Votiverse. Infrastructure, not governance. |
| **Organization** | An administrative entity that manages a member roster and creates Assemblies. |
| **Assembly** | The governance container. Has an immutable configuration, members, voting events, polls, and accumulated institutional memory. |
| **Standalone Assembly** | An Assembly without an Organization. Manages its own membership directly. |
| **Organization-backed Assembly** | An Assembly that draws participants from an Organization's member roster. |
| **Governance contract** | The human-readable summary of an Assembly's rules, presented to participants when they join. |
| **Preset** | A curated, ready-to-use governance configuration with sensible defaults and plain-language description. |
| **Membership** | The relationship between a person and an Assembly. Scoped — delegations, history, and track records are per-Assembly. |

---

*This document is a living draft. It captures decisions made and questions identified as of March 2026. Open questions (Section 7) will be resolved as the product design matures.*
