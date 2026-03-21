# Votiverse: A Configurable Governance Platform for Democratic Decision-Making

**Diego Macrini**
**Proximify Inc., Ottawa, Canada**
**dmac@cs.toronto.edu**
**March 2026**

---

## Abstract

Democracy is not a single mechanism. It is a space of possible configurations — a spectrum stretching from pure direct participation to full delegation of authority. The systems we live under today occupy a narrow band of that spectrum, chosen centuries ago under constraints that no longer apply, and rarely questioned since.

Votiverse is a platform for exploring the rest of that space. It provides organizations, communities, and institutions of any size with a configurable governance engine. Participants can vote directly, delegate their vote to trusted individuals by topic, or operate under any hybrid arrangement their group defines. Delegations are revocable, topic-specific, and transitive. A direct vote always overrides a delegation. In this model, traditional representative democracy is not the norm — it is an edge case: the configuration you get when delegation is forced, universal, non-specific, and irrevocable for a fixed term.

Votiverse introduces two structural innovations. First, a *governance awareness layer* — a built-in intelligence system that monitors the delegation network and delivers contextual, progressive-disclosure reporting to participants at the point of decision. Concentration patterns, chain anomalies, and delegate track records are not buried in dashboards; they surface when and where a participant needs them. Second, a *prediction-tracking accountability layer*. Proposals carry falsifiable predictions. Outcomes are recorded. Over time, the platform builds a collective memory of what was decided, what was promised, and what actually happened. Together, these layers transform voting from a momentary act into an ongoing process of collective learning.

This document formalizes the governance model, situates it within existing work on liquid democracy and participatory decision-making, addresses known failure modes, and describes the architecture of the platform.

---

## 1. The Problem

Every group that must make collective decisions faces two interrelated problems.

### The Participation Problem

**Direct democracy** asks every participant to engage with every decision. This works for small groups and important issues, but it does not scale. As the number of decisions grows, participation collapses under the weight of its own demands. People disengage — not because they don't care, but because there are not enough hours in the day to form an informed opinion on everything.

**Representative democracy** solves the bandwidth problem by bundling all decisions into a single delegation. You choose one person (or party) to decide on your behalf, on all matters, for a fixed period. This scales well but discards nearly all information about what voters actually want. A citizen who cares deeply about environmental policy, disagrees with their representative on education, and has no opinion on trade must accept the entire package or abandon the representative entirely. The resolution is far too low.

These two systems are typically presented as the only options. They are not. They are extremes of a continuum — and the interesting territory lies between them.

### The Information Problem

There is a second failure, less discussed but arguably more damaging: **existing democratic systems do not close the loop between decisions and outcomes.**

Politicians and parties make proposals. Those proposals contain implicit or explicit predictions — "this policy will create jobs," "this spending will reduce crime," "this reform will lower costs." Voters choose between these competing predictions. The winning proposal is implemented. And then… nothing. There is no structured record connecting the original promise to the actual outcome. No systematic way to ask: was the proposal implemented? Did it perform as predicted? Who predicted accurately, and who didn't?

This information exists, scattered across government reports, academic studies, and journalistic investigations. But it is not connected to the original proposals, not surfaced at the moment of the next decision, and not accessible to the ordinary voter. The result is that political discourse collapses into narrative — who is likeable, who is trustworthy, which team is winning — rather than evidence.

### What Is Needed

What is needed is not just a better voting mechanism. It is a better **information infrastructure for collective decision-making** — one that records proposals, predictions, and outcomes; connects them over time; surfaces them at the point of decision; and identifies, structurally and without bias, who predicts well and who doesn't.

The voting mechanism matters — selective engagement, topic-specific delegation, revocability. But the information layer may matter more. Even in a system where most participants delegate passively, the quality of governance improves if the information environment is honest, structured, and persistent.

That mechanism exists in theory. It has been called *liquid democracy*, *delegative voting*, or *proxy voting*. Votiverse is an attempt to combine it with the missing information infrastructure and make both practical, configurable, and accountable at every scale — from a neighborhood sports club to a national government.

---

## 2. Principles

The design of Votiverse is guided by seven principles.

**Participation without burden.** No one should be forced to have an opinion on everything, and no one should be prevented from having an opinion on anything. The system must make it easy to engage selectively.

**Sensing as participation.** Governance should not only ask people to decide — it should ask them to observe. Every participant, regardless of expertise or engagement level, is a sensor embedded in their local reality. Structured, accountable surveying of lived experience is a form of participation that is as valuable as voting and far more inclusive.

**Expertise without permanent power.** People should be able to channel their vote through those they trust on specific topics. But that trust must be revocable, granular, and never locked into a fixed term. A delegate's influence should last exactly as long as it is deserved.

**Accountability through prediction.** A decision is only as good as the reasoning behind it. Proposals should include falsifiable predictions about their expected outcomes. When reality diverges from prediction, the record should be clear and accessible.

**Active awareness over passive transparency.** It is not enough to make data available. The system must actively inform participants about what matters, when it matters. Delegation chains, concentration patterns, delegate track records, and prediction outcomes must surface at the point of decision — contextually, progressively, and without overwhelming the voter.

**Configurability over prescription.** Different groups have different needs. A soccer parents' committee, a cooperative, and a nation-state require different governance configurations. Votiverse provides the primitives; organizations compose them to suit their context.

**Scale independence.** The same fundamental mechanisms — voting, delegation, structured proposals, prediction tracking, participant surveys — should work whether the group has twelve members or twelve million.

---

## 3. The Scale Problem

### 3.1 What We Know About Humans and Group Decisions

Humans evolved to make collective decisions in small groups — roughly 30 to 150 people. At that scale, participants know each other, see the consequences of decisions directly, and feel their individual contribution matters. Governance is personal, concrete, and self-correcting.

As groups grow beyond this range, something breaks. The consequences of decisions become abstract. The individual's influence becomes statistically invisible. The feedback loops that connect a decision to its outcome become slow, diffuse, and hard to attribute. The rational response — genuinely rational — is to disengage and let someone else handle it. Political scientists call it *rational ignorance*: the cost of becoming informed exceeds the expected benefit of casting a slightly better-informed vote.

### 3.2 The Propaganda Vulnerability

Disengagement creates a vacuum, and that vacuum is filled by whoever controls the narrative. When people process governance through tribal heuristics — party identity, charismatic figures, social media momentum — rather than through deliberation, they become susceptible to manipulation. This is true in every existing democratic system, and a more sophisticated voting platform does not inherently fix it.

A delegation system could even make it worse. "I delegated to an expert" is a more comfortable form of disengagement than "I voted for whichever party my family always votes for," but the cognitive posture is the same: someone else is handling it.

### 3.3 What Votiverse Can and Cannot Do

Votiverse does not claim to solve the fundamental disconnect between human cognitive capacity and the scale of modern governance. No platform can. The root cause is not technological — it is the mismatch between the scale at which human cognition works well and the scale at which modern governance operates.

What Votiverse can do is create better conditions at every scale:

**At small scale** — clubs, cooperatives, teams, local associations — the platform provides structure and accountability for decisions that people already care about. Participants are cognitively engaged because they know each other, see the consequences, and feel their stake.

**At medium scale** — organizations, municipalities, institutions — delegation and prediction tracking provide real value. The trust network makes expertise accessible without creating a permanent political class. The prediction record grounds decisions in evidence. The awareness layer keeps power dynamics visible.

**At national scale** — the hardest case — Votiverse may primarily serve as infrastructure that makes existing power dynamics *visible* rather than hidden. Even if most participants delegate passively, the system ensures that the concentration of power is measured, reported, and available for the moments when enough people do re-engage.

### 3.4 Sensing and Deciding: Two Different Asks

The scale problem becomes less daunting once we recognize that governance asks participants to do two fundamentally different things — and only one of them is hard.

**Deciding** asks: "what should we do?" This requires understanding proposals, evaluating trade-offs, predicting consequences, and exercising judgment. It is cognitively demanding. Most people are not good at it for most topics, and the rational response at scale is to disengage or delegate.

**Sensing** asks: "what is happening?" Is your neighborhood safer? Has traffic improved? Are prices higher? Is the school better than last year? This is observation — raw, local, personal. It requires no expertise, no policy knowledge, no deliberation. It requires only that you report what you experience in your daily life.

This distinction is fundamental to Votiverse's design. The platform separates sensing from deciding. Votes and delegations handle deciding. Participant surveys handle sensing. And critically, sensing feeds deciding: survey data — community observations, trend lines, ground-level feedback — flows into the awareness layer and is surfaced at the point of decision when new proposals are introduced.

### 3.5 Working With the Grain: Topic Communities

Topic-specific delegation effectively creates **virtual communities of interest** within any large-scale deployment. The person who cares about education policy is part of an implicit group of people who also care about education — delegates, delegators, and direct voters on education issues. That group is small enough to be cognitively manageable, even within a municipality of fifty thousand.

The awareness layer can lean into this. Instead of asking a participant to comprehend the entire governance system — every delegation, every issue, every outcome — it can surface the dynamics of their topic communities.

### 3.6 Open Questions

Several questions remain unresolved:

**Does delegation reduce deliberation?** If delegation is too easy, do participants stop reading the booklet entirely? Does the system converge toward a small number of super-delegates who function as de facto representatives?

**Does prediction tracking change behavior?** The hypothesis is that visible, falsifiable predictions create a feedback loop that makes governance quality tangible. This is plausible but unproven at scale.

**Is national-scale liquid democracy meaningfully better than representative democracy?** The honest answer is that we do not know, and the project does not depend on the answer being yes. Votiverse is valuable if it improves decision-making at *any* scale.

These questions are not reasons to abandon the project. They are reasons to be honest about what it is: an attempt to expand the space of possible governance configurations, tested first at the scales where improvement is most likely, and extended carefully toward larger scales as evidence accumulates.

---

## 4. The Governance Configuration Space

### 4.1 Primitives

Every participant can cast a **direct vote** on any issue. This is the irreducible primitive — the act of governance itself. When delegation is available, three structural properties hold unconditionally and are not configurable: *revocability* (any delegation can be withdrawn at any time before the vote closes), *sovereignty* (a direct vote always overrides any delegation), and *scope* (delegations can be scoped to a topic or a single issue, and this granularity is always available). These are not design parameters — they are rights that the platform guarantees.

What *is* configurable is how delegation works. The delegation model is defined by two independent boolean axes.

### 4.2 The Two Axes of Delegation

**Candidacy.** Is there a formal system for declaring "I am willing to represent others"? When enabled, participants can publish structured profiles, state their positions, and appear in the delegate discovery interface. This is an accountability mechanism: people accumulating delegated voting power have explicitly opted in and made their positions visible. When disabled, delegation (if it exists) is informal — you delegate to someone you know personally, without institutional infrastructure for discovering or evaluating potential delegates.

**Transferability.** Can delegated voting power flow through chains? When enabled, if Alice delegates to Bob and Bob delegates to Carol, then Carol carries Alice's weight. Voting power is transferable — it flows through the delegation graph. This is the core mechanism of liquid democracy. When disabled, delegated power cannot be transferred beyond one hop.

These two axes produce four governance families:

|  | No transfers | Transfers |
|---|---|---|
| **No candidates** | *Direct democracy.* Everyone votes on everything. No delegation mechanism exists. | *Informal liquid.* Anyone can delegate to anyone. Chains flow freely. No formal candidate system. Delegators rely on personal knowledge to choose delegates. |
| **Candidates** | *Representative.* Appoint a declared candidate as your proxy. They vote for you but cannot pass your vote further. Classic proxy voting. | *Liquid delegation.* Candidates exist for discoverability and accountability. Anyone can still delegate to anyone. Chains are transitive. |

Delegation exists when either axis is enabled. When both are off, the system is pure direct democracy. This 2×2 is not a simplification of a richer space — it *is* the space. The familiar governance models map naturally to this grid. Traditional representative democracy is the bottom-left: candidates exist, but your vote stops with them. Liquid democracy as theorized by Tullock [1], Miller [2], and Ford [3] is the top-right: delegation is transitive and revocable, but there is no formal candidacy system. The bottom-right adds the candidacy profiles that make transitive delegation possible where delegators do not personally know their delegates.

### 4.3 Beyond Delegation: Ballot, Features, and Timeline

The delegation axes determine how voting power flows. Orthogonal to this, three further dimensions complete the governance configuration: *ballot rules* (secret vs. public ballot, sealed vs. live results, vote mutability, quorum, voting method), *feature toggles* (community notes, prediction tracking, surveys), and *timeline* (deliberation, curation, and voting periods). Together with the two delegation axes, these produce the full parameter space — small enough for any group creator to configure, expressive enough for meaningful governance research.

### 4.4 Named Presets

Presets are named points in the parameter space, each representing a distinct governance philosophy — not a parameter tweak. The platform currently provides six presets: *Direct Democracy* (no delegation, minimal infrastructure), *Swiss Votation* (direct democracy with structured booklets, community notes, and predictions), *Informal Liquid* (informal liquid delegation without candidates, public ballots, short timelines), *Representative* (declared candidates, non-transitive proxy voting, high quorum), *Liquid Delegation* (the full composition: candidates with transitive delegation, structured booklets, community notes, predictions, surveys, and awareness), and *Civic Participatory* (liquid delegation at municipal scale with longer timelines). Presets are starting points; organizations customize from there.

### 4.5 The Continuum

The key insight is that representative democracy and direct democracy are not opposites. They are two of four quadrants in a 2×2 defined by candidacy and transferability. Most real governance needs fall in the quadrants that existing systems leave unexplored — particularly the bottom-right, where delegation is transitive, revocable, and supported by accountability infrastructure. Votiverse makes these quadrants accessible.

---

## 5. How Voting and Delegation Work

This section describes how Votiverse resolves votes in the presence of delegations. A full formal specification is provided in Appendix A.

### 5.1 The Basic Mechanism

Every participant in a Votiverse instance can do one of three things for any given issue: vote directly, delegate, or abstain.

A **delegation** is an instruction: "If I don't vote on this issue, let this person's vote count for me too." It has three components: the person delegating, the person receiving the delegation, and the **scope** — which topics or issues the delegation covers.

Delegations can be broad ("delegate all Finance topics to Alice") or narrow ("delegate this specific budget proposal to Alice"). Delegations operate at three levels of scope: **global** (all issues), **topic** (issues classified under a specific topic or its descendants), and **issue** (a single specific issue). When multiple delegations from the same person are active for the same issue, the most specific one wins: issue-scoped overrides topic-scoped, child-topic overrides parent-topic, and any topic-scoped delegation overrides a global one. All three scope types are transitive. Issue-scoped delegations are ephemeral — they apply to one decision and do not persist. A participant can hold at most one delegation per scope: delegating Education to Carol after having delegated Education to Bob simply replaces the earlier delegation.

### 5.2 The Override Rule

The most important rule in the system: **a direct vote always wins.**

If you have delegated Climate Policy to Maria, but a particular climate proposal matters to you, you simply vote. Your vote counts as your own, with weight one, and Maria's vote does not include yours. You do not need to revoke the delegation — your direct participation automatically overrides it for that issue.

This is the "backup" semantics at the heart of the system. A delegate is not your representative in the traditional sense. They are your fallback — the person who votes on your behalf only if you choose not to.

### 5.3 Transitive Delegation

Delegations can flow through chains. Suppose Alex delegates Finance to Beth, and Beth delegates Finance to Carlos. If none of them vote directly, Carlos casts one vote that carries the weight of all three: his own, Beth's, and Alex's. This is **transitive delegation**: trust flows through the network.

There is no limit on chain length. Rather than imposing artificial depth caps — which can silently lose votes when downstream delegations change — Votiverse relies on the awareness layer's chain-resolution display to keep participants informed about who ultimately casts their vote.

### 5.4 How Overrides Interact with Chains

Overrides break chains cleanly. Consider the chain Alex → Beth → Carlos on a Finance issue:

If Beth votes directly, Beth's vote counts with weight two (her own plus Alex's delegation). Carlos carries weight one. If Alex votes directly, Alex's vote counts with weight one, and Carlos carries weight two (his own plus Beth's). If all three vote directly, each carries weight one — pure direct democracy.

The principle is consistent: a direct vote severs the chain at that point.

### 5.5 Cycles

Transitive delegation can create cycles. Votiverse resolves cycles simply: if participants form a cycle and none of them vote directly, all participants in the cycle are treated as abstaining. If any participant in the cycle votes directly, that breaks the cycle at their position, and the rest of the chain resolves normally.

### 5.6 Guarantees

The model guarantees four properties that hold regardless of how delegations are configured:

**Sovereignty.** Every participant can always vote directly. No delegation can prevent someone from casting their own vote.

**One person, one vote.** Every participant contributes exactly one unit of voting weight to the final tally. Delegation moves weight through the network — it never creates or destroys it.

**Monotonicity.** Voting directly never makes you worse off. Casting a vote can only increase your influence on the outcome compared to delegating.

**Revocability.** Any delegation can be withdrawn at any time before the vote closes. The system recomputes weights immediately.

---

## 6. Voting Events and the Digital Booklet

### 6.1 Voting Events

A voting event is a structured period during which one or more issues are put to a vote. It is the operational unit of governance in Votiverse, analogous to a Swiss *votation day*. During deliberation, individual issues may be **cancelled** — for example, to correct a topic misclassification or withdraw an issue that is no longer relevant. Cancelled issues cannot receive votes, and any active proposals associated with them are automatically withdrawn. Cancellation is permanent and recorded; a cancelled issue cannot be reopened.

### 6.2 The Digital Voting Booklet

Inspired by the Swiss Federal Council's practice of mailing a physical booklet to every citizen before a vote, Votiverse provides a **digital voting booklet** for each issue. The booklet is not optional decoration — it is a structural requirement. No issue can proceed to vote without a complete booklet.

For each issue, the booklet contains: (1) an official description — a neutral summary prepared by the event administrators; (2) proposal text — the specific proposal being voted on; (3) supporting arguments submitted by the proponents; (4) opposing arguments submitted by opponents or administrators; (5) falsifiable predictions about expected outcomes; and (6) current state of affairs — relevant metrics and context at the time of voting.

### 6.3 Roles

Three roles govern the lifecycle of a voting event. **Administrators** create voting events, define issues, manage timelines, and enforce formatting and fairness rules. **Proponents** submit proposals, provide supporting arguments and predictions. **Members** read the booklet, participate in deliberation, and vote.

---

## 7. Prediction Tracking and Accountability

### 7.1 The Accountability Gap

Traditional democratic systems record what was decided but not what was expected. A proposal wins, a policy is implemented, and years later, no one systematically compares the outcome to the promises that secured the votes. This is the accountability gap.

### 7.2 Proposals as Models

There is a foundational principle from probabilistic reasoning that applies directly to governance: **the model that predicts best is the one you should trust.**

In Bayesian model selection, competing models each tell a story about how the world works. The test of a model's quality is not how well it explains the past but how well it predicts data it has not yet seen. Governance proposals are models. Each proposal is an implicit claim about how the world works: "if we adopt this policy, these outcomes will follow."

The current political system has no holdout set. It never systematically checks predictions against outcomes. It evaluates proposals entirely on narrative fit. This is the equivalent of selecting a statistical model based on its training error alone, with no cross-validation. It is a system optimized for overfitting.

Prediction tracking is the regularizer. It introduces a cost for overconfident, unfalsifiable, or inaccurate claims by checking them against outcomes. Over time, it builds the equivalent of a cross-validation record for governance.

### 7.3 Predictions as First-Class Objects

In Votiverse, predictions are a core feature of the platform, configurable per organization. When enabled, every proposal is encouraged — or, at the organization's discretion, required — to include one or more falsifiable predictions.

A prediction is a structured claim containing: a measurable variable, a direction and magnitude, a timeframe, and an optional methodology.

### 7.4 Evaluation

At the end of the prediction's timeframe, an evaluation is triggered. The evaluation may be automated (AI-assisted monitoring of public data sources), community-driven (participants assess the outcome through structured surveys), or external (official statistics, audits). Predictions are scored on a structured scale from "clearly met" through "partially met" to "clearly not met" and "unfalsifiable."

---

## 8. Community Notes

Community notes are participant-submitted annotations attached to proposals, arguments, predictions, or any other element in the voting booklet. They are inspired by the community notes feature on social media platforms, adapted for a governance context.

A community note provides context, correction, or additional evidence. It is not a comment or opinion — it is a factual annotation. Notes are evaluated by other participants: endorsed as helpful or disputed as misleading. The evaluation mechanism uses a bridging criterion: a note earns prominent visibility only when it is rated helpful by participants across different viewpoints.

This bridging requirement is critical. It filters out partisan cheerleading and surfaces information that is genuinely informative — claims endorsed by both supporters and opponents of the proposal.

---

## 9. Participant Surveys

### 9.1 Sensing as a Primitive

Surveys are a fundamental governance primitive in Votiverse. They are the mechanism through which the platform captures participant observations — the sensing layer that complements the deciding layer of votes and delegations.

### 9.2 Surveys Are Not Votes

The distinction is fundamental. A **vote** expresses a decision. It can be delegated, because someone you trust can exercise judgment on your behalf. A **survey** expresses an observation. It cannot be delegated, because the entire point is *your* experience from *your* position. Survey responses are therefore **non-transferable**.

### 9.3 Accountable and Open

Votiverse surveys are structurally different from conventional polling: open participation (every eligible participant can respond), visible questions (publicly inspectable framing), transparent results (raw data available to all), and accountable provenance (who proposed what is recorded).

### 9.4 Surveys as Ground Truth for Predictions

Participant surveys connect directly to the prediction tracking system. When a proposal predicted "15% improvement in youth sports participation," the outcome can be measured through official statistics. But it can also be sensed through structured surveys. These two signals — official metrics and distributed observation — serve different purposes and complement each other.

### 9.5 Surveys as Trend Lines

Because surveys recur on a predictable schedule, they produce longitudinal trends. A recurring survey yields a time series of community observation that runs in parallel with the governance timeline. This transforms surveys from snapshots into a monitoring system.

---

## 10. The Governance Awareness Layer

### 10.1 From Passive Transparency to Active Awareness

Votiverse includes a **governance awareness layer**: a built-in system that continuously monitors the state of the delegation network, the history of decisions and outcomes, and the behavior of delegates — and delivers relevant findings to participants contextually, at the moment they are making decisions. The analogy is not a transparency dashboard. It is a built-in newsroom that reports on the health of the governance system itself.

### 10.2 Design Principles

The awareness layer is governed by four principles: *contextual delivery* (information surfaces at the point of decision), *progressive disclosure* (summary first, detail on demand), *personal relevance* (personalized notifications based on what affects your vote), and *signal over completeness* (anomalies and high-signal findings prioritized over routine data).

### 10.3 What the Awareness Layer Surfaces

The layer draws on three sources — the delegation network, the decision history, and the prediction record — and surfaces findings including: delegation chain resolution, concentration alerts, delegation harvesting detection, delegate track records, engagement prompts, and historical context.

### 10.4 Personal Voting History

The awareness layer maintains a personal voting history — a retrospective record of every decision a participant was involved in. Over time, this accumulates into a voting footprint that enables self-correction: a participant can see whether their delegates' backed proposals actually delivered on their predictions.

---

## 11. Risks and Mitigations

### 11.1 Power Concentration

**Risk.** Transitive delegation can create super-delegates who accumulate enormous voting weight. **Mitigation.** The governance awareness layer provides real-time concentration metrics, personalized alerts, delegation harvesting detection, and full chain-resolution visibility. Delegations are revocable at any time.

### 11.2 Delegation Overuse

**Risk.** People may delegate too readily, deferring to perceived experts even when they would make better decisions themselves. **Mitigation.** Delegation is not the default. The platform encourages direct voting by presenting the booklet and making direct participation easy. The awareness layer's engagement prompts provide contextual nudges.

### 11.3 Strategic Behavior

**Risk.** Delegates may act strategically — accumulating delegations on a popular stance and then switching positions. **Mitigation.** The awareness layer makes delegate behavior visible through track records, voting history, and prediction accuracy.

### 11.4 Long Delegation Chains

**Risk.** Unlimited transitivity can produce chains where source participants have no idea who ultimately casts their vote. **Mitigation.** Chain-resolution display ensures participants always know the terminal voter. Organizations can configure maximum chain depth.

### 11.5 Digital Divide and Accessibility

**Risk.** A digital governance platform inherently excludes people without reliable internet access or digital literacy. **Mitigation.** Offline booklets, assisted voting, and progressive deployment starting where digital access is already the norm.

---

## 12. Identity, Trust, and Scale

Votiverse supports a spectrum of identity models: invitation-based (small groups), organizational authentication (medium groups), verified identity (large civic deployments), and cryptographic identity (decentralized deployments). At every scale, the platform must resist Sybil attacks — the creation of fake participants to multiply voting power — with defenses that vary by identity model.

Delegation graphs contain sensitive information. The platform balances transparency (necessary for accountability) with privacy (necessary for free participation without coercion), with configurable visibility per organization.

---

## 13. Platform Architecture

Votiverse is not a single application. It is a **configurable governance engine** that organizations instantiate with their own settings. Each instance defines the set of governance primitives in use, the topic taxonomy, the identity model, the voting rules, prediction tracking configuration, delegation constraints, booklet requirements, and the visibility model for delegations and votes.

The architecture is designed for real-time delegation graph computation, configurable access control, audit logging of all governance actions, and data portability.

### 13.1 The Role of AI — and Its Limits

AI can play a valuable role in the information layer — particularly in gathering evidence that confirms or contradicts predictions. However, **AI systems are not neutral.** Votiverse's approach follows the platform's own principles: transparency (which AI system is used), auditability (sources inspectable), replaceability (organizations can switch providers), separation of roles (AI gathers information, humans judge), and ensemble verification (multiple AI providers operating in parallel).

### 13.2 Platform Integrity: Blockchain and Oracles

Blockchain technology provides an optional **integrity layer** — not as the foundation of the platform, but as a tamper-evident seal on critical integrity artifacts: vote tallies, prediction commitments, outcome recordings, survey results, and delegation graph snapshots. The combination of multiple oracle sources — AI, official data providers, surveys, and community challenge — provides resilience through mutual verification.

---

## 14. Deployment Strategy

The deployment strategy follows a natural progression from small voluntary groups (Stage 1) through organizations and institutions (Stage 2) to municipal and civic deployments (Stage 3) and larger civic use (Stage 4). Each stage informs the next. The lessons from early deployments shape the platform's development before it reaches larger scales.

If the platform is not good enough for its own contributors to use, it is not ready for anyone else.

---

## 15. Governance of Votiverse Itself

A platform for democratic governance should, eventually, govern itself democratically. The long-term aspiration is for Votiverse to be governed through its own mechanisms — a Votiverse instance managing the platform's roadmap, policies, and evolution. The platform is an open-source project by Diego Macrini, sponsored by Proximify Inc. (Ottawa, Canada), and operated through the Votiverse Foundation as an open initiative.

---

## 16. Related Work

Votiverse builds on a substantial body of prior work. **Liquid democracy:** The concept of revocable, transitive, topic-specific delegation has been explored theoretically [1, 2, 3] and in software platforms such as LiquidFeedback [4]. Theoretical and empirical analyses have examined liquid democracy from epistemic, equality, and formal perspectives [5, 6, 7]. Votiverse extends this work by embedding liquid delegation as one configuration within a broader governance space, and by adding the prediction-tracking accountability layer that liquid democracy literature has not addressed.

**Swiss direct democracy:** Switzerland's system of regular referenda with mandatory voter booklets is the operational inspiration for Votiverse's voting events. Votiverse digitizes and extends the Swiss model with delegation, predictions, and community notes.

**DAO governance:** Decentralized autonomous organizations have implemented delegation mechanisms similar to liquid democracy. Votiverse draws on this experience but is not limited to blockchain-based identity or token-weighted voting.

**Participatory budgeting:** Municipal programs worldwide have demonstrated that citizens can meaningfully engage with specific policy decisions when given structured information and accessible tools.

**Prediction markets and forecasting:** The use of predictions to evaluate decision quality draws on the logic of forecasting tournaments and prediction markets, adapted to a governance context.

**Governance experimentation platforms:** VoteLab [15] is an open-source platform for experimenting with different voting input formats (majority, approval, range, Borda count) on smartphones, with a proof-of-concept studying voting outcome consistency. It addresses the experimentation gap for *voting methods*; Votiverse addresses the gap for *governance configurations* — compositions of delegation, deliberation, accountability, and awareness mechanisms.

**Grassroots digital democracy:** Shapiro [16] proposes a grassroots architecture for local digital communities that federate into a global digital democracy, operating solely on members' smartphones without centralized servers. The architecture addresses infrastructure — consensus, social networking, currencies — while Votiverse addresses governance mechanisms within whatever infrastructure hosts it. The two approaches are complementary.

**Digital democracy as a research program:** Grossi et al. [17] present a multi-methods research vision for digital democracy technology, co-authored by 29 researchers across computational social choice, political science, and AI. Their call for empirically and computationally informed development of digital democracy aligns with Votiverse's emphasis on configurable, measurable governance.

---

## 17. Conclusion

Democracy is a technology. Like all technologies, it can be improved. The systems we have inherited were designed for a world of limited communication, slow information flow, and geographically constrained communities. Votiverse does not claim to have solved democracy. It claims that the configuration space of democratic governance is far larger than what any single country currently explores, and that a platform enabling organizations to navigate that space — with accountability, transparency, and adaptability — is worth building.

---

## Appendix A: Formal Model

This appendix provides a mathematical specification of the governance model.

### A.1 Participants and Issues

Let $P = \{p_1, p_2, \ldots, p_n\}$ be the set of participants and $I = \{i_1, i_2, \ldots, i_m\}$ the set of issues to be decided. Each issue $i$ has at most one topic: $T(i) \in \mathcal{T} \cup \{\bot\}$, where $\mathcal{T}$ is a finite hierarchical topic taxonomy and $\bot$ denotes an unclassified issue.

### A.2 Delegations

A delegation is a tuple $d = (p_s, p_t, \sigma)$ where $p_s \in P$ is the delegating participant (source), $p_t \in P$ is the delegate (target) with $p_t \neq p_s$, and $\sigma$ is the scope, which takes one of three forms: $\text{issue}(i)$ for a specific issue $i$ (highest precedence), $\text{topic}(t)$ for $t \in \mathcal{T}$ covering issues classified under topic $t$ or any of its descendants, or $\text{global}$ covering all issues (lowest precedence). All three scope types are transitive.

Let $D$ be the set of all active delegations. $D$ satisfies a *uniqueness invariant*: for any participant $p_s$ and scope $\sigma$, there is at most one delegation $(p_s, \cdot, \sigma) \in D$. Creating a new delegation with the same source and scope replaces any existing one.

A delegation is *active* for issue $i$ according to its scope: an issue-scoped delegation $\text{issue}(i)$ is active only for issue $i$; a topic-scoped delegation $\text{topic}(t)$ is active if $T(i) \neq \bot$ and $T(i)$ is equal to or a descendant of $t$; a global delegation is active for all issues.

When multiple delegations from the same source are active for the same issue, they necessarily differ in specificity (by the uniqueness invariant). Precedence is resolved by specificity: $\text{issue} > \text{child topic} > \text{parent topic} > \text{global}$.

### A.3 The Delegation Graph

For a given issue $i$, define the *effective delegation* of participant $p_s$ as the highest-precedence active delegation from $p_s$ for issue $i$, if any. Let $\text{eff}(p_s, i)$ denote the target of this delegation. The delegation graph is $G_i = (P, E_i)$ where:

$$E_i = \{(p_s, \text{eff}(p_s, i)) \mid p_s \text{ has at least one active delegation for issue } i\}$$

Each participant has at most one outgoing edge per issue (the highest-precedence active delegation). The graph $G_i$ is therefore a collection of directed trees (a forest), with delegates at the roots.

### A.4 Vote Resolution

Let $V_i \subseteq P$ be the set of participants who cast a direct vote on issue $i$.

**Override Rule.** A direct vote always overrides a delegation. If $p_s \in V_i$, then the edge $(p_s, p_t) \in E_i$ is removed before weight computation.

**Transitive Weight.** After applying the override rule, let $G_i'$ be the resulting graph. The effective weight $w(p, i)$ of participant $p$ on issue $i$ is:

$$w(p, i) = 1 + \sum_{q \in \text{sources}(p, G_i')} w(q, i)$$

where $\text{sources}(p, G_i') = \{q \mid (q, p) \in E_i'\}$.

**Non-Participation.** A participant $p$ who neither votes directly nor is reachable from a voting participant through delegations has $w(p, i) = 0$.

### A.5 Delegation Cycles

Cycles are resolved by treating them as mutual non-delegation. If participants form a cycle and none cast a direct vote, all are treated as abstaining. If any participant in the cycle votes directly, that breaks the cycle.

### A.6 Properties

The model satisfies:

1. **Sovereignty.** $\forall p \in P, \forall i \in I$: $p$ can cast a direct vote, setting $w(p, i) = 1$ independently of any delegation.
2. **One person, one vote.** $\sum_{p \in V_i'} w(p, i) \leq |P|$, with equality when all participants either vote or are reached by a delegation chain ending in a voter.
3. **Monotonicity.** Casting a direct vote never reduces a participant's influence.
4. **Revocability.** Any delegation $d \in D$ can be removed at any time $t < t_{\text{close}}$, and the system recomputes all weights.

---

## References

[1] G. Tullock. *Towards a Mathematics of Politics*. University of Michigan Press, 1967.

[2] J. C. Miller. A program for direct and proxy voting in the legislative process. *Public Choice*, 7(1):107–113, 1969.

[3] B. Ford. Delegative democracy. Unpublished manuscript, 2002.

[4] J. Behrens, A. Kistner, A. Nitsche, and B. Swierczek. *The Principles of LiquidFeedback*. Interaktive Demokratie e. V., Berlin, 2014.

[5] C. Blum and C. I. Zuber. Liquid democracy: Potentials, problems, and perspectives. *Journal of Political Philosophy*, 24(2):162–182, 2016.

[6] C. C. Kling, J. Kunegis, H. Hartmann, M. Strohmaier, and S. Staab. Voting behaviour and power in online democracy: A study of LiquidFeedback in Germany's pirate party. In *Proc. 9th Int. AAAI Conf. Web and Social Media (ICWSM)*, pages 208–217, 2015.

[7] A. Paulin. An overview of ten years of liquid democracy research. In *Proc. 21st Annual Int. Conf. Digital Government Research (DGO)*, pages 116–121. ACM, 2020.

[8] M. Brill. Interactive democracy. In *Proc. 17th Int. Conf. Autonomous Agents and Multiagent Systems (AAMAS)*, pages 1183–1187, 2018.

[9] M. Brill, T. Delemazure, A.-M. George, M. Lackner, and U. Schmidt-Kraepelin. Liquid democracy with ranked delegations. In *Proc. 36th AAAI Conf. Artificial Intelligence (AAAI-22)*, pages 4884–4891, 2022.

[10] B. Brubach, A. Ballarin, and H. Nazeer. Characterizing properties and trade-offs of centralized delegation mechanisms in liquid democracy. In *Proc. 2022 ACM Conf. Fairness, Accountability, and Transparency (FAccT '22)*, pages 1–10, 2022.

[11] P. Gölz, A. Kahng, S. Mackenzie, and A. D. Procaccia. The fluid mechanics of liquid democracy. In *Proc. 14th Int. Workshop on Internet and Network Economics (WINE)*, pages 188–202. Springer, 2018.

[12] S. Hardt and L. C. R. Lopes. Google Votes: A liquid democracy experiment on a corporate social network. Technical report, Technical Disclosure Commons, 2015.

[13] A. Kahng, S. Mackenzie, and A. Procaccia. Liquid democracy: An algorithmic perspective. *Journal of Artificial Intelligence Research*, 70:1223–1252, 2021.

[14] G. Kotsialou and L. Riley. Incentivising participation in liquid democracy with breadth-first delegation. In *Proc. 19th Int. Conf. Autonomous Agents and Multiagent Systems (AAMAS)*, pages 638–644, 2020.

[15] R. Kunz, F. Banaie, A. Sharma, C. I. Hausladen, D. Helbing, and E. Pournaras. VoteLab: A modular and adaptive experimentation platform for online collective decision making. arXiv preprint arXiv:2307.10903, 2023.

[16] E. Shapiro. A grassroots architecture to supplant global digital platforms by a global digital democracy. arXiv preprint arXiv:2404.13468, 2024.

[17] D. Grossi, U. Hahn, M. Mäs, A. Nitsche, et al. Enabling the digital democratic revival: A research program for digital democracy. arXiv preprint arXiv:2401.16863, 2024.

---

*Votiverse is an open-source project by Diego Macrini, sponsored by Proximify Inc. (Ottawa, Canada).*
*Repository: [github.com/votiverse/votiverse](https://github.com/votiverse/votiverse) — Website: [votiverse.org](https://votiverse.org)*