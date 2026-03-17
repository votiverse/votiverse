# Governance as a Self-Sustaining System

**Theoretical Extensions from the Votiverse Implementation — Paper II**

---

## Abstract

The Votiverse whitepaper (Paper I) described a configurable governance platform guided by seven principles — participation without burden, sensing as participation, expertise without permanent power, accountability through prediction, active awareness over passive transparency, configurability over prescription, and scale independence. It proposed mechanisms for addressing two fundamental problems of collective decision-making: participation (through delegation and structured sensing) and information (through prediction tracking and governance awareness).

This paper extends the theoretical model based on what emerged from building a working platform — a governance engine, cloud platform, and web client with 335 tests across 12 packages. The central finding is that a governance system operating at community scale cannot depend on external administrators, fact-checkers, or oracles for its integrity. It must be **self-sustaining**: generating its own evidence, verifying its own claims, and maintaining its own accountability structures through the actions of its participants.

We develop this thesis through four themes. First, we show that delegate candidacies and policy proposals share a common structure — both are scrutinizable claims submitted for community evaluation — and that this unification enables a single accountability infrastructure. Second, we argue that participant-generated surveys (called "polls" in Paper I) are the primary evidence base for prediction verification, formalizing the sensing mechanism as the system's feedback loop. Third, we identify the immutability guarantees a governance platform must offer as preconditions for self-maintenance, not merely desirable properties. Fourth, we introduce new configuration parameters — delegation mode, result visibility, vote mutability, note thresholds, and survey anonymity — that emerged from the interaction between these themes.

---

## 1. Introduction

Paper I described Votiverse as a governance factory — a parameter space in which direct democracy, liquid democracy, Swiss-style votations, and representative models are all configurations of the same primitives. The paper proposed mechanisms for addressing two fundamental problems: participation (through delegation and sensing) and information (through prediction tracking and governance awareness).

Building the system revealed a third problem that Paper I acknowledged but underestimated: **self-maintenance**. A governance platform for community organizations — soccer clubs, housing co-ops, faculty senates, municipal committees — cannot assume the existence of neutral administrators who curate content, verify claims, or adjudicate disputes. The participants are the administrators. The system must sustain itself through the collective actions of the people who use it.

This is not merely an operational concern. It is a design principle with implications for every mechanism in the system. If the platform cannot verify its own claims, then prediction tracking is performative. If delegates cannot be scrutinized by the same standards as policy proposals, then accountability is asymmetric. If the system's data can be silently modified, then transparency is theater.

Self-maintenance also clarifies a conceptual thread that ran through Paper I without being fully named. Paper I's seven principles — from "participation without burden" through "scale independence" — share an implicit eighth commitment: that the platform itself must not become a new locus of concentrated, unaccountable power. Every mechanism described in this paper can be read as an elaboration of that commitment: a system where evidence, scrutiny, verification, and record-keeping are distributed among participants rather than delegated to an operator.

This paper explores these implications.

---

## 2. Delegate Candidacies as Proposals

### 2.1 Two kinds of governance proposals

Paper I treated proposals as structured claims about policy: "If we allocate $2,000 to field maintenance, conditions will improve by Q4." Implementation revealed that the concept of a proposal — a structured, scrutinizable document submitted for community evaluation — applies to more than policy alone.

We identify two kinds of proposals in the system:

1. **Policy proposals.** "We should do X because Y will result." Carries predictions, subject to community notes, evaluated against outcomes over time. This is what Paper I described.

2. **Delegate candidacies.** "I'm offering to represent you on budget topics. Here's why you should trust me." A participant voluntarily declares themselves as a delegate candidate by publishing a structured profile — qualifications, stated positions, relevant experience, and any supporting materials (documents, links, media). This candidacy functions as a proposal: it is published, community-notable, versioned, and immutable once active.

What these two share is the scrutiny infrastructure: community notes, immutability, version history, and linkable survey evidence. Both are claims submitted to the community for evaluation. Both benefit from the same accountability mechanisms.

There is a third form of delegation in the system — **informal delegation** — but it is not a proposal. When a participant delegates to someone they know personally ("I trust Maria on education topics"), that is an exercise of a right, not a claim submitted for scrutiny. Maria may not have sought delegations and may not even know she is receiving one (though the system notifies her). The delegator is making a private trust decision based on personal knowledge, not evaluating a public profile. The system facilitates this act but does not evaluate it — no community notes, no version history, no scrutiny infrastructure. Informal delegation is closer to casting a vote than to publishing a proposal.

The distinction matters because it clarifies what the scrutiny infrastructure is for: evaluating claims made to strangers. When someone publishes a candidacy profile seeking delegations from people who don't know them, they are making a public claim that warrants public evaluation. When someone delegates to a friend, they are exercising judgment that warrants no one's evaluation but their own.

### 2.2 Why candidacies matter

In small, high-trust groups — a soccer club with 30 members — everyone knows everyone. Delegation is naturally informal: you trust the coach on equipment decisions because you've watched him select gear for three seasons. No candidacy profile is needed.

As groups grow, informal trust breaks down. In a municipal participatory budget with 5,000 participants, most people delegating to a community leader have never met them. The delegation decision is as consequential as any policy vote — perhaps more so, because it persists across many future decisions — yet without candidacies, the information supporting it is thin: a name, perhaps a reputation, perhaps nothing.

Delegate candidacies solve this by giving aspiring representatives a structured way to make their case and giving delegators a structured way to evaluate it. A candidacy profile might include:

- A bio and relevant qualifications
- Stated positions on the Assembly's topic areas
- Links to external profiles, publications, or credentials
- A statement of what the candidate believes and how they intend to vote

Once published, this profile is subject to the same scrutiny as any policy proposal. Community notes can support, dispute, or contextualize the candidate's claims. The candidate's voting record and prediction accuracy (if they have prior history in the Assembly) are visible through the governance awareness layer.

### 2.3 Vote transparency as a candidacy feature

In many Assemblies, ballots are secret — no participant can see how any other participant voted. This protects voters from coercion and social pressure, and it is the right default. But it creates a tension for delegation: a delegator has entrusted their vote to someone, and under a secret ballot they have no way to verify how that trust was exercised. They can see their delegate's prediction track record over time, but not their actual vote on a specific issue.

For informal delegates — a friend, a partner, someone you know and trust personally — this is acceptable. The trust is personal, and the delegate never asked for scrutiny. Their vote is protected by the same secrecy guarantee as any other participant's.

But a formal delegate candidate is in a different position. They have published a profile, sought delegations from people who may not know them, and submitted themselves to the scrutiny infrastructure. They are making a public case for trust. In this context, offering to reveal their votes to their delegators is a natural extension of that case — a way to sweeten the proposal.

Votiverse allows delegate candidates to **opt into vote transparency with their delegators**. A candidate who enables this feature is saying: "If you delegate to me, you will be able to see how I voted on every issue within your delegation scope." This is a per-candidate choice, not an Assembly-wide setting. It operates within whatever ballot secrecy the Assembly has configured — it does not make the candidate's votes public, only visible to the people whose votes the candidate is exercising.

The opt-in framing matters for three reasons:

**It is a signal of trustworthiness.** A candidate who offers vote transparency is signaling confidence in their own judgment and willingness to be held accountable at the most granular level. A candidate who does not offer it may have good reasons — the desire to vote without social pressure, or simply a preference for privacy — but the contrast is informative. Delegators can factor it into their choice.

**It creates competitive pressure.** When two candidates have similar qualifications on a topic, but one offers vote transparency and the other doesn't, the transparent candidate has an advantage. Over time, this may push the delegate ecosystem toward greater accountability without requiring it by mandate.

**It respects the asymmetry between voters and delegates.** Secret ballot protections exist to shield *voters* from coercion. A delegate who has voluntarily entered a public role and is exercising other people's votes is in a categorically different position. The opt-in does not weaken the secrecy guarantee for ordinary voters — it allows delegates to voluntarily waive it for the specific audience that has a legitimate accountability interest.

This feature is only available in candidacy mode and only to declared candidates. Informal delegates — people who receive delegations through nomination without having published a profile — are never asked and never exposed.

### 2.4 Delegation modes

Delegation is configurable along the axis of **who appears in the delegate discovery interface:**

- **Open delegation.** Anyone can receive delegations. The delegate selection interface shows all members, with no distinction between declared candidates and others. Appropriate for small, informal groups.
- **Candidacy mode.** Self-declared candidates with structured profiles, track records, and community notes are featured in the discovery interface. But any member can still be found and delegated to through direct search (see Section 2.6). Appropriate for larger groups where structured accountability helps delegators make informed choices.
- **No delegation.** Direct democracy only. Every participant votes on every question.

The key distinction: **candidacy mode governs who is featured in discovery, not who can receive delegations.** Even in candidacy mode, a participant can delegate to their partner, their neighbor, or anyone else in the Assembly — they just need to find them through search rather than browsing the candidate list.

This is a configuration parameter:

| Parameter | Values | Default |
|-----------|--------|---------|
| `delegationMode` | `open` · `candidacy` · `none` | `open` |

### 2.4 Discovery vs. nomination

There are two distinct paths to delegation, and both must work regardless of delegation mode:

**Discovery.** "I don't know who to trust on education topics — show me who's available." The participant browses declared delegate candidates, reads their profiles, checks their track records and community notes, and chooses. This is the formal, deliberative path. In candidacy mode, only self-declared candidates with profiles appear here.

**Nomination.** "I know exactly who I want — my partner Maria, who understands this topic better than I do." The participant searches for a specific person and delegates to them. Maria may not be a declared candidate. She may not have a profile. But it is the participant's right to give their vote to anyone they trust.

The distinction maps directly to the two kinds of delegation: discovery produces informed delegation based on scrutinized candidacies (proposals), while nomination produces informal delegation based on personal trust (an act of confidence, not a claim requiring evaluation).

### 2.6 Finding a person: the member search problem

Nomination requires finding a specific member. This raises a practical question with privacy implications: **how do you find someone in a large Assembly without exposing the entire member list?**

In a soccer club with 30 members, displaying the full list is natural — everyone knows everyone. In a municipal Assembly with 5,000 members, exposing all names to all participants is a privacy concern.

The appropriate model is **typeahead search**, not a browsable directory. The participant begins typing a name, the system suggests matches from the Assembly's membership, showing enough to identify the person (name, avatar) but not sensitive data (email, internal IDs). This is the pattern used by GitHub for adding collaborators and by most messaging apps for starting a conversation. The key properties:

- Any member can be found, but the searcher must know approximately who they're looking for.
- The complete member list is never exposed unprompted.
- The search returns identity information sufficient for recognition (name, avatar) but nothing more.

Critically, **member search is a client-side operation**, not a governance engine operation. The client application (web app, mobile app) owns the user identity database and performs the search. When the participant selects Maria, the client translates "Maria García" into the opaque participant ID that the governance engine knows, and sends the delegation request using only that ID. The engine never needs to know that participant `p_47` is Maria García — it receives a delegation from one opaque ID to another and processes it according to the governance rules.

This reinforces a separation of concerns that matters for privacy: the client owns identity and discovery, the governance engine owns computation. The engine's database contains no personally identifiable information — only opaque participant IDs — and this guarantee is preserved even when the user experience requires name-based search.

### 2.7 Immutability of delegate candidacies

If a delegate candidacy is community-notable, the profile must be stable at the moment of notation. A community note that says "Candidate X claimed position Y" loses its meaning if Candidate X can silently edit position Y after the note is posted.

The solution follows the same pattern as proposal immutability: **each version of a candidacy profile is an event in the event store.** When a candidate updates their profile, the old version is preserved. Community notes reference a specific version. The governance awareness layer can surface when a candidate has changed their stated positions, and how recently.

A candidacy profile is, in this model, a living document with an immutable history — not unlike a Wikipedia article, where the current state is editable but every prior state is preserved and viewable.

---

## 3. Surveys as Evidence

### 3.1 A note on terminology

Paper I used the term "polls" for the sensing mechanism — structured questions that capture participant observations on a recurring basis. In the implementation, we renamed this to **surveys** to avoid confusion with voting. "Poll" is ambiguous: it can mean an opinion poll, an informal vote, or the act of polling a data source. "Survey" is unambiguous — it denotes a structured instrument for gathering observations. This paper uses "surveys" throughout; the mechanism is identical to what Paper I described as "participant polls."

### 3.2 The evidence problem

Paper I proposed prediction tracking as the mechanism for institutional learning: proposals carry predictions, predictions are evaluated against outcomes, and accurate predictors earn credibility over time. The paper described AI-assisted outcome gathering as the primary means of evaluation — multiple AI providers querying external data to determine whether a prediction held.

Implementation revealed a limitation of this approach: **AI-gathered evidence is external to the governance system.** It depends on the availability and quality of external data, on the AI providers' ability to interpret it, and on the participants' trust in AI systems. For many community governance decisions, external data doesn't exist. Whether park maintenance improved, whether communication got better, whether the new scheduling system works — these are observations that only participants can make.

### 3.3 Participant-generated evidence

Votiverse already has a mechanism for capturing participant observations: surveys. Surveys ask questions like "How has park maintenance been this quarter?" and aggregate responses into trend data over time.

The key observation is that **completed surveys are the primary evidence base for prediction verification**, not AI-gathered external data. AI is a supplement — useful for predictions about publicly measurable variables (GDP growth, temperature change, market prices) — but for the internal, qualitative outcomes that matter most in community governance, the community itself is the oracle.

This means surveys are not a secondary feature. They are the feedback loop that makes prediction tracking functional. Without surveys, predictions are claims that are never checked. With surveys, the system generates its own evidence and can evaluate its own proposals retrospectively.

### 3.4 The epistemological status of survey evidence

This claim deserves scrutiny. Participant-reported experience is subjective, locally biased, and susceptible to framing effects. A survey asking "Has park maintenance improved?" may elicit different responses depending on when it is asked, how the question is worded, and what mood the respondent is in. Individual survey responses are noisy. They are not measurements in the scientific sense.

But the relevant comparison is not between surveys and perfect measurement. It is between surveys and the alternative — which, for most community governance decisions, is no structured feedback at all.

Aggregated subjective observation has three properties that compensate for individual noise. First, **scale**: when enough people report the same observation, random noise cancels and signal emerges. A single person saying "the park is worse" is anecdote; 70% of respondents saying so is a trend. Second, **longitudinal structure**: because surveys recur on a schedule, the signal is not a snapshot but a trajectory. A single survey captures mood; a series of surveys captures change. Third, **accountability**: unlike anonymous online complaints or unstructured town hall feedback, survey methodology is transparent — who was asked, what was asked, how many responded, and what the distribution looked like. Participants can evaluate whether the signal is trustworthy.

None of this makes survey evidence equivalent to controlled measurement. But it makes survey evidence *far superior* to the current default in community governance: no evidence, or evidence that is anecdotal, unsystematic, and unfalsifiable. The system does not need perfect data to be useful. It needs structured data that is better than what existed before and honest about its limitations.

### 3.5 Linkable surveys

For the feedback loop to close, completed surveys must be **linkable artifacts** — referenceable from proposals, community notes, and delegate profiles. A proposal for field maintenance can cite the survey showing that 72% of members rated current conditions as poor. A community note on a delegate can reference the survey trend showing that the delegate's prediction about budget outcomes did not align with members' observed experience.

This creates a closed evidential loop:

```
Proposals make predictions
  → Surveys capture observations
    → Community notes link surveys to proposals
      → Participants see whether predictions held
        → Future proposals carry more or less credibility
```

The system generates, stores, evaluates, and surfaces its own evidence without requiring external data sources, AI providers, or human fact-checkers. It is self-sustaining.

### 3.6 Surveys as the mechanism of sensing

Paper I drew a fundamental distinction between **sensing** and **deciding** — two different things governance asks of participants. Deciding (what should we do?) is cognitively demanding, scales poorly, and is the legitimate domain of delegation. Sensing (what is happening?) is observational, requires no expertise, and cannot be delegated because the whole point is each participant's local experience.

Surveys are the operational mechanism through which sensing is implemented. This paper's argument — that surveys are the primary evidence base for prediction verification — has a consequence that Paper I did not fully articulate: **sensing is not merely a secondary form of participation. It is the feedback loop that makes the entire accountability system functional.** Without sensing, prediction tracking has no evidence. Without evidence, proposals are claims that are never checked. Without checking, the system is performing accountability rather than practicing it.

The flow is: deciding generates predictions → sensing generates observations → the comparison between predictions and observations generates accountability. Each link is necessary. Removing sensing from the chain breaks accountability as surely as removing prediction tracking would.

This elevates sensing from a "nice to have for engagement" — one possible reading of Paper I — to a structural requirement for self-sustaining governance.

### 3.7 Survey integrity and anonymity

If surveys serve as evidence, their integrity becomes critical. Survey responses must be:

- **Immutable once submitted.** A participant's response to a survey cannot be changed after submission. (Unlike votes, which may be changeable during an open period — see Section 5.)
- **Anonymous in aggregate.** Individual survey responses should not be attributable to specific participants in the public results. This encourages honest observations without social pressure. (Individual responses may be visible to the respondent for their own records.)
- **Temporally anchored.** Each survey captures observations at a specific point in time. The trend across multiple surveys is more meaningful than any single survey. Temporal anchoring prevents retroactive reinterpretation.

Survey anonymity is configurable:

| Parameter | Values | Default |
|-----------|--------|---------|
| `surveyResponseAnonymity` | `anonymous` · `visible` | `anonymous` |

- **Anonymous:** Individual survey responses are not attributable in aggregate results.
- **Visible:** Individual responses are visible (appropriate for small, high-trust groups).

---

## 4. Community Notes as Distributed Verification

### 4.1 No administrators

Paper I described the governance awareness layer as "active, contextual intelligence" that surfaces information at the point of decision. The implementation reinforced a stronger claim: **the system must assume that there are no administrators.**

In community governance, the "administrator" is typically a volunteer — the club president, the co-op board secretary, the faculty committee chair. They are participants with additional responsibilities, not neutral third parties. They have opinions, preferences, and biases. The system cannot rely on them for content curation or claim verification without introducing the same concentration-of-power problem that the system is designed to solve.

Community notes are the mechanism for distributed verification. Any participant can attach a note to any proposal, delegate profile, or survey result. Notes are themselves subject to community evaluation — participants can endorse or dispute notes, creating a layered consensus around contested claims.

### 4.2 What can be community-noted

The unification of delegates and proposals (Section 2) means that the community notes system applies uniformly to:

- **Policy proposals.** Notes can support, dispute, or contextualize a proposal's claims. "This proposal cites a cost estimate of $50,000, but the contractor's actual quote was $67,000" is a note with linked evidence (the quote, a survey result, or an external reference).
- **Delegate profiles.** Notes can address a delegate's track record, stated positions, or behavior. "This delegate voted against the maintenance budget they publicly supported in their profile" is a note that references the voting record (available through the awareness layer) and the profile version (immutable per Section 2.7).
- **Survey results.** Notes can contextualize survey data. "This survey was conducted during the construction period, which may explain the low maintenance ratings" is a note that helps participants interpret evidence correctly.
- **Community notes themselves.** Notes on notes enable dispute resolution without administrative intervention. If a note contains a factual error, other participants can note the note. Consensus emerges through layered evaluation.

### 4.3 Note lifecycle

Community notes follow a lifecycle:

1. **Proposed.** A participant writes a note and attaches it to a target (proposal, delegate profile, or survey result).
2. **Evaluated.** Other participants can endorse the note ("this is helpful") or dispute it ("this is misleading"). The evaluation threshold for visibility is configurable per Assembly.
3. **Visible.** Notes that pass the evaluation threshold are displayed alongside their target. Notes that don't pass the threshold remain accessible but are not prominently displayed.
4. **Immutable.** Once proposed, a note's content cannot be edited. The author can withdraw it, but the withdrawal is recorded. If the note needs correction, the author proposes a new note and withdraws the old one.

This lifecycle prevents editorial control by any single participant while ensuring that low-quality or malicious notes don't dominate the information environment.

The visibility threshold is configurable:

| Parameter | Values | Default |
|-----------|--------|---------|
| `noteVisibilityThreshold` | `0.0` to `1.0` | `0.3` |

The fraction of evaluating participants who must endorse a community note for it to be prominently displayed. At `0.0`, all notes are visible. At `1.0`, unanimous endorsement is required. The default of `0.3` means roughly one-third of people who evaluate the note must find it helpful.

---

## 5. Immutability as a Precondition for Self-Maintenance

### 5.1 Why immutability is structural, not optional

The previous sections describe a system that generates its own evidence (surveys), scrutinizes its own leaders (delegate candidacies as proposals), and verifies its own claims (community notes with layered evaluation). But this entire self-maintenance apparatus depends on a single precondition: **the record cannot be altered after the fact.**

If a proposal can be silently edited after community notes reference it, the notes become incoherent — they dispute claims that no longer exist. If survey responses can be retroactively changed, the evidence base is unreliable. If delegate profiles can be rewritten without version history, accountability is impossible — a delegate can simply erase the positions they were held accountable for.

Immutability is not merely a "nice to have" for auditability. It is the foundation that makes every other self-maintenance mechanism trustworthy. A self-sustaining governance system without immutability is a contradiction: the participants cannot verify claims against records if the records can shift beneath them.

### 5.2 What the platform must never change

A governance platform's credibility depends on participants trusting that the record is authentic. The following immutability guarantees must hold:

**The event store is append-only.** Events (votes cast, delegations created, survey responses submitted, proposals published, community notes attached) are never modified or deleted. The event log is the canonical record of governance activity. Materialized views (tallies, delegation graphs, trend data) are derived from events and can be recomputed at any time.

**Assembly governance configuration is immutable.** The rules under which an Assembly operates — delegation mode, ballot methods, quorum thresholds, survey cadence — are set at creation and cannot be changed. To change governance rules, create a new Assembly. This prevents mid-stream rule changes that could benefit incumbents or undermine ongoing votes.

**Proposals are immutable once submitted for voting.** A proposal can be drafted and edited freely. Once it enters a voting period, its content is locked. Community notes reference the locked version. The author cannot silently revise claims after scrutiny begins.

**Delegate profile versions are immutable once active.** A delegate can update their profile, but each version is preserved. Community notes reference specific versions. The history of changes is visible through the awareness layer.

**Survey responses are immutable once submitted.** A participant's observation at a point in time is a historical fact. It cannot be retroactively changed, even by the participant.

**Community notes are immutable once proposed.** A note can be withdrawn but not edited. The withdrawal is recorded.

### 5.3 What the platform allows to change

**Votes may be changed during an open voting period** (configurable). A participant who votes early may receive new information, read a community note, or reconsider their position. Allowing vote changes during the open period respects this. However, each vote change is recorded as a new event — the history of the participant's voting behavior is preserved even if only the final vote counts for the tally.

This parameter interacts with result visibility:

| Live results | Vote changing | Implications |
|-------------|--------------|--------------|
| Hidden (sealed ballot) | Allowed | Safe. No strategic behavior possible since results aren't visible. Allows participants to reconsider based on deliberation. |
| Hidden | Disallowed | Most restrictive. First vote is final. Appropriate for high-stakes, formal governance. |
| Visible (open ballot) | Allowed | Risky. Enables strategic vote-changing based on live results. Should be avoided or flagged. |
| Visible | Disallowed | Transparent but final. Participants see the tally build in real time and cannot change their own contribution. |

The recommended default is **sealed ballot with vote changing allowed** — this maximizes deliberation freedom while minimizing strategic behavior. Assemblies that want live transparency can enable visible results with vote changing disabled.

The relevant configuration parameters:

| Parameter | Values | Default |
|-----------|--------|---------|
| `resultVisibility` | `sealed` · `live` | `sealed` |
| `allowVoteChange` | `true` · `false` | `true` |

**Delegations may be created and revoked at any time.** Trust is inherently mutable. A participant who loses confidence in their delegate should be able to revoke immediately, not wait for a governance cycle. Each delegation change is recorded as an event.

**Assembly membership may change.** Participants can be added or removed. This is an administrative action recorded in the event store.

### 5.4 Blockchain anchoring revisited

Paper I proposed optional blockchain anchoring as a tamper-evident seal on critical artifacts. The implementation observation is that blockchain anchoring is most valuable for the immutable artifacts listed in Section 5.2 — the event store, locked proposals, and survey results. Anchoring mutable state (current delegation graphs, live tallies) is less useful because the state changes between anchoring intervals.

The anchoring strategy should be: periodically compute a Merkle root of all events since the last anchor, and commit it to a public blockchain. Any participant can independently verify that the event store has not been tampered with by recomputing the Merkle root from the events they can see. This is a verification mechanism, not a consensus mechanism — the platform is not a blockchain, it uses blockchain for integrity verification.

---

## 6. Toward Self-Sustaining Governance

The observations in this paper converge on a single theme: a governance platform for real communities must be **self-sustaining**. It cannot depend on external administrators for content curation, on external data sources for prediction verification, or on external authority for dispute resolution. Every mechanism in the system must be operable by the participants themselves.

This is not a purely technical requirement. It is a philosophical position about where authority resides in a governance system. If the platform depends on Proximify (or any operator) to curate content, verify claims, or resolve disputes, then the platform has merely moved the concentration-of-power problem from elected representatives to a technology company. The whole point is to avoid that.

The mechanisms described in this paper — delegates as proposals, surveys as evidence, community notes as distributed verification, immutability as trust infrastructure — are the building blocks of a self-sustaining governance ecosystem. None of them is sufficient alone. Together, they compose because each mechanism serves a dual role: it is both a governance tool and a self-verification tool.

- Surveys serve participants by capturing their observations — and serve the system by generating the evidence that makes prediction tracking functional.
- Community notes serve participants by contextualizing proposals — and serve the system by distributing the verification work that would otherwise require an administrator.
- Delegate candidacies serve participants by informing delegation decisions — and serve the system by subjecting leadership claims to the same scrutiny infrastructure as policy claims.
- Immutability serves participants by guaranteeing the record is authentic — and serves the system by making all other self-maintenance mechanisms trustworthy.

This dual-role pattern is what distinguishes a self-sustaining governance system from one that merely publishes tools. In a self-sustaining system, the act of participation is simultaneously an act of system maintenance. The participants do not maintain the system as a separate chore; they maintain it by using it.

This is governance without governors. Not in the utopian sense of a system that needs no maintenance, but in the practical sense of a system where the maintenance is distributed among the participants rather than concentrated in an operator. The platform provides the infrastructure. The participants provide the judgment.

---

## 7. Open Questions

### 7.1 Community note quality
The community notes mechanism assumes that the crowd can distinguish helpful notes from misleading ones. This assumption holds in large, diverse groups (cf. Wikipedia, Twitter/X Community Notes) but may fail in small, homogeneous groups where social pressure suppresses dissent. What is the minimum group size for community notes to function well? Should small Assemblies disable community notes and use a simpler mechanism?

### 7.2 Delegate accountability without surveillance
Opt-in delegation with public profiles and community notes creates accountability, but it also creates exposure. A delegate in a contentious community may face harassment through the notes system. How do we balance accountability with protection? Should delegates be able to flag abusive notes? Who evaluates the flags — the community again?

### 7.3 Survey fatigue
If surveys are the primary evidence base, they must be conducted regularly. But frequent surveys produce fatigue — participants stop responding, and the evidence base degrades. What is the optimal survey cadence? Can the system adapt cadence based on response rates? Can it identify which topics need fresh survey data and target accordingly?

### 7.4 The limits of self-generated evidence
Section 3.4 acknowledged that survey evidence is subjective and noisy. But there is a deeper question: can a community accurately assess outcomes that affect it? Cognitive biases — anchoring, availability, confirmation — may systematically distort participant observations. A community that was promised crime reduction may perceive crime reduction whether or not it occurred. The longitudinal structure of surveys mitigates this (it is harder to sustain a collective illusion across many time points), but it does not eliminate it. Under what conditions does self-generated evidence fail, and what supplementary mechanisms (external audits, AI-assisted verification, independent data) should the system recommend?

### 7.5 Strategic delegation
In the opt-in delegation model, a bad actor could create an appealing delegate profile, accumulate delegations, and then vote against the interests of their delegators. The override mechanism provides a safety valve (any delegator can override at any time), but only if the delegator is paying attention. The governance awareness layer's engagement prompts ("your delegate voted differently from how you've been voting — review?") partially address this, but the problem deserves formal analysis.

### 7.6 Immutability and the right to be forgotten
The immutable event store preserves all governance activity permanently. This may conflict with privacy regulations (GDPR's right to erasure, for example) if participant IDs can be linked to real identities through the client application. The governance engine stores only opaque IDs, but the client maintains the mapping to real identities. If a participant requests deletion, the client can delete the mapping, rendering the engine's records pseudonymous — but the records themselves persist. Is this sufficient? The legal analysis depends on jurisdiction and has not been fully explored.

---

*This paper is a living document. It will be revised as the implementation matures and as the open questions are addressed through research, simulation, and real-world deployment.*

*Votiverse is an open-source project — [github.com/votiverse/votiverse](https://github.com/votiverse/votiverse) — by Proximify Inc. (Ottawa, Canada).*