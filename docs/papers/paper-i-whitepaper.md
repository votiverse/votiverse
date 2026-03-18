# Votiverse: A Configurable Governance Platform for Democratic Decision-Making

**Version 0.1 — Draft for Review**
**March 2026**

---

## Abstract

Democracy is not a single mechanism. It is a space of possible configurations — a spectrum stretching from pure direct participation to full delegation of authority. The systems we live under today occupy a narrow band of that spectrum, chosen centuries ago under constraints that no longer apply, and rarely questioned since.

Votiverse is a platform for exploring the rest of that space.

It provides organizations, communities, and institutions of any size with a configurable governance engine. Participants can vote directly, delegate their vote to trusted individuals by topic, or operate under any hybrid arrangement their group defines. Delegations are revocable, topic-specific, and transitive. A direct vote always overrides a delegation. In this model, traditional representative democracy is not the norm — it is a degenerate edge case: the configuration you get when delegation is forced, universal, non-specific, and irrevocable for a fixed term.

Votiverse also introduces two structural innovations. First, a **governance awareness layer** — a built-in intelligence system that monitors the delegation network and delivers contextual, progressive-disclosure reporting to participants at the point of decision. Concentration patterns, chain anomalies, and delegate track records are not buried in dashboards; they surface when and where a participant needs them. Second, a **prediction-tracking accountability layer**. Proposals carry falsifiable predictions. Outcomes are recorded. Over time, the platform builds a collective memory of what was decided, what was promised, and what actually happened. Together, these layers transform voting from a momentary act into an ongoing process of collective learning.

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

Politicians and parties make proposals. Those proposals contain implicit or explicit predictions — "this policy will create jobs," "this spending will reduce crime," "this reform will lower costs." Voters choose between these competing predictions. The winning proposal is implemented. And then... nothing. There is no structured record connecting the original promise to the actual outcome. No systematic way to ask: was the proposal implemented? Did it perform as predicted? Who predicted accurately, and who didn't?

This information exists, scattered across government reports, academic studies, and journalistic investigations. But it is not connected to the original proposals, not surfaced at the moment of the next decision, and not accessible to the ordinary voter. The result is that political discourse collapses into narrative — who is likeable, who is trustworthy, which team is winning — rather than evidence. Voters talk about whether they like a candidate, not whether that candidate's past proposals actually worked. The conversation becomes a soap opera about personalities rather than an evaluation of governance quality.

This is not entirely the voters' fault. The information infrastructure does not exist. In its absence, even engaged citizens cannot easily answer basic questions: what did my representative actually vote for? What was predicted? What happened? And in the further absence of that information, the people who predict best have no structural advantage over the people who narrate best. A politician who makes terrible predictions but tells a compelling story gets re-elected. A policy analyst who predicted outcomes correctly is ignored.

### What Is Needed

What is needed is not just a better voting mechanism. It is a better **information infrastructure for collective decision-making** — one that records proposals, predictions, and outcomes; connects them over time; surfaces them at the point of decision; and identifies, structurally and without bias, who predicts well and who doesn't.

The voting mechanism matters — selective engagement, topic-specific delegation, revocability. But the information layer may matter more. Even in a system where most participants delegate passively, the quality of governance improves if the information environment is honest, structured, and persistent.

That mechanism exists in theory. It has been called *liquid democracy*, *delegative voting*, or *proxy voting*. Votiverse is an attempt to combine it with the missing information infrastructure and make both practical, configurable, and accountable at every scale — from a neighborhood sports club to a national government.

---

## 2. Principles

The design of Votiverse is guided by seven principles.

**Participation without burden.** No one should be forced to have an opinion on everything, and no one should be prevented from having an opinion on anything. The system must make it easy to engage selectively.

**Sensing as participation.** Governance should not only ask people to decide — it should ask them to observe. Every participant, regardless of expertise or engagement level, is a sensor embedded in their local reality. Structured, accountable surveying of lived experience is a form of participation that is as valuable as voting and far more inclusive. It is easier to identify a problem than to know how to solve it, and a system that listens to what people experience will make better decisions than one that only counts what they choose.

**Expertise without permanent power.** People should be able to channel their vote through those they trust on specific topics. But that trust must be revocable, granular, and never locked into a fixed term. A delegate's influence should last exactly as long as it is deserved.

**Accountability through prediction.** A decision is only as good as the reasoning behind it. Proposals should include falsifiable predictions about their expected outcomes. When reality diverges from prediction, the record should be clear and accessible. This transforms governance from opinion-driven to evidence-informed over time.

**Active awareness over passive transparency.** It is not enough to make data available. The system must actively inform participants about what matters, when it matters. Delegation chains, concentration patterns, delegate track records, and prediction outcomes must surface at the point of decision — contextually, progressively, and without overwhelming the voter. A governance system that publishes data but relies on participants to find it is transparent in theory and opaque in practice.

**Configurability over prescription.** Different groups have different needs. A soccer parents' committee, a cooperative, and a nation-state require different governance configurations. Votiverse provides the primitives; organizations compose them to suit their context.

**Scale independence.** The same fundamental mechanisms — voting, delegation, structured proposals, prediction tracking, participant surveys — should work whether the group has twelve members or twelve million. The platform must be designed so that its core model does not break at scale, even as the specific configuration adapts.

---

## 3. The Scale Problem

This section is about honesty.

### 3.1 What We Know About Humans and Group Decisions

Humans evolved to make collective decisions in small groups — roughly 30 to 150 people. At that scale, participants know each other, see the consequences of decisions directly, and feel their individual contribution matters. Governance is personal, concrete, and self-correcting.

As groups grow beyond this range, something breaks. The consequences of decisions become abstract. The individual's influence becomes statistically invisible. The feedback loops that connect a decision to its outcome become slow, diffuse, and hard to attribute. The rational response — genuinely rational — is to disengage and let someone else handle it.

This is not laziness or ignorance. It is a reasonable cognitive adaptation to an environment where your individual contribution is effectively zero. Political scientists call it **rational ignorance**: the cost of becoming informed exceeds the expected benefit of casting a slightly better-informed vote.

### 3.2 The Propaganda Vulnerability

Disengagement creates a vacuum, and that vacuum is filled by whoever controls the narrative. When people process governance through tribal heuristics — party identity, charismatic figures, social media momentum — rather than through deliberation, they become susceptible to manipulation. This is true in every existing democratic system, and a more sophisticated voting platform does not inherently fix it.

A delegation system could even make it worse. "I delegated to an expert" is a more comfortable form of disengagement than "I voted for whichever party my family always votes for," but the cognitive posture is the same: someone else is handling it. If Votiverse simply makes passivity more convenient, it will reproduce the pathologies of existing systems with additional complexity.

### 3.3 What Votiverse Can and Cannot Do

Votiverse does not claim to solve the fundamental disconnect between human cognitive capacity and the scale of modern governance. No platform can. The root cause is not technological — it is the mismatch between the scale at which human cognition works well and the scale at which modern governance operates.

What Votiverse can do is create better conditions at every scale:

**At small scale** — clubs, cooperatives, teams, local associations — the platform provides structure and accountability for decisions that people already care about. Participants are cognitively engaged because they know each other, see the consequences, and feel their stake.

**At medium scale** — organizations, municipalities, institutions — delegation and prediction tracking provide real value. The trust network makes expertise accessible without creating a permanent political class. The prediction record grounds decisions in evidence. The awareness layer keeps power dynamics visible.

**At national scale** — the hardest case — Votiverse may primarily serve as infrastructure that makes existing power dynamics *visible* rather than hidden. Even if most participants delegate passively, the system ensures that the concentration of power is measured, reported, and available for the moments when enough people do re-engage.

This is an honest assessment. We believe the platform helps at every scale, but we do not pretend it turns passive citizens into active deliberators at the scale of a nation. What it does is make the *cost* of disengagement visible and the *path back* to engagement easier.

There is a further honesty required. Votiverse is a system for collective decision-making, and collective decisions create winners and losers. A policy that reduces average commute times may make things worse for specific neighborhoods. A reform that improves aggregate health outcomes may disadvantage specific groups. The system does not guarantee Pareto improvements — outcomes where everyone benefits and no one is harmed. What it provides is better information about what is happening (through surveys and outcome tracking), better accountability for what was promised (through prediction tracking), and better mechanisms for course correction when things go wrong. That is a meaningful improvement over the status quo, but it is not a promise that every individual will be better off after every decision. No honest governance system can make that promise.

### 3.4 Sensing and Deciding: Two Different Asks

The scale problem becomes less daunting once we recognize that governance asks participants to do two fundamentally different things — and only one of them is hard.

**Deciding** asks: "what should we do?" This requires understanding proposals, evaluating trade-offs, predicting consequences, and exercising judgment. It is cognitively demanding. Most people are not good at it for most topics, and the rational response at scale is to disengage or delegate. This is the hard problem, and it may be partially intractable.

**Sensing** asks: "what is happening?" Is your neighborhood safer? Has traffic improved? Are prices higher? Is the school better than last year? This is observation — raw, local, personal. It requires no expertise, no policy knowledge, no deliberation. It requires only that you report what you experience in your daily life. Almost anyone can do this. A participant who is fully disengaged from the deliberative process — the purest "NPC" — is still a perfectly good sensor. In fact, they may be a *better* sensor than an engaged policy expert, because they are not filtering observations through a theoretical framework. They report what they see.

This distinction is fundamental to Votiverse's design. The platform separates sensing from deciding. Votes and delegations handle deciding. Participant surveys (detailed in Section 9) handle sensing. And critically, sensing feeds deciding: survey data — community observations, trend lines, ground-level feedback — flows into the awareness layer and is surfaced at the point of decision when new proposals are introduced.

**Why this matters for the scale problem.** Even at the scales where most participants disengage from decision-making, their sensory contribution remains valuable. A system where millions of people report whether their lived experience is improving or deteriorating — on a predictable schedule, through structured surveys, with accountable and transparent methodology — produces an information signal that is already vastly superior to what exists today. Currently, the feedback channels between citizens and governance are opinion surveys controlled by agencies that choose the sample and frame the questions, news media with editorial agendas, and unstructured social media noise. None of these are accountable, open, or longitudinal. Votiverse surveys are all three.

The sensing layer also creates a natural feedback loop for evaluating governance quality. When a proposal predicted crime reduction and quarterly surveys show rising insecurity, that signal does not require anyone to perform policy analysis. The trend speaks for itself. It is available to delegates making decisions, to participants considering whether to override a delegation, and to the awareness layer compiling institutional memory. Even if most people never look at the data directly, it shapes the information environment in which delegates and proponents operate — and that alone produces better outcomes than a system with no structured feedback at all.

This is perhaps the strongest response to the NPC critique. The question is not "can we make everyone an active deliberator?" — we probably cannot, at scale. The question is "can we extract useful information from everyone, including the disengaged, and feed it back into the system in a way that improves decision quality?" That is a much more tractable problem, and the answer is yes.

### 3.5 Working With the Grain: Topic Communities

There is, however, a structural response to the scale problem built into the design.

Topic-specific delegation effectively creates **virtual communities of interest** within any large-scale deployment. The person who cares about education policy is part of an implicit group of people who also care about education — delegates, delegators, and direct voters on education issues. That group is small enough to be cognitively manageable, even within a municipality of fifty thousand.

The awareness layer can lean into this. Instead of asking a participant to comprehend the entire governance system — every delegation, every issue, every outcome — it can surface the dynamics of their topic communities. "Among the 340 participants active on Education topics in your municipality, here's how delegation flows. Here's what past predictions looked like. Here's who the most active delegates are and what their track records show."

You do not need to be a protagonist in the entire governance story. You need to be a protagonist in the chapters you care about, and delegate the rest honestly. This does not fight human nature. It works with the grain of it — the grain that says humans are good at small-group cognition, care about things that are concrete and personal, and disengage from what feels abstract and distant.

Topic communities make the abstract concrete and the distant personal — at least within the domains a participant cares about. That is not a full solution to rational ignorance, but it is a meaningful reduction of its scope.

### 3.6 Open Questions

Several questions remain unresolved at this stage of the project:

**Does delegation reduce deliberation?** If delegation is too easy, do participants stop reading the booklet entirely? Does the system converge toward a small number of super-delegates who function as de facto representatives? The governance awareness layer and personal voting history are designed to counteract this, but whether they succeed is an empirical question.

**Does prediction tracking change behavior?** The hypothesis is that visible, falsifiable predictions create a feedback loop that makes governance quality tangible. This is plausible but unproven at scale. Forecasting tournaments show that prediction accuracy can be measured and rewarded, but it is unclear whether embedding this into a governance system changes how ordinary participants engage.

**Is national-scale liquid democracy meaningfully better than representative democracy?** It might simply reproduce the same power dynamics with more steps. The honest answer is that we do not know, and the project does not depend on the answer being yes. Votiverse is valuable if it improves decision-making at *any* scale — and at the scale of communities and organizations, we believe it can.

These questions are not reasons to abandon the project. They are reasons to be honest about what it is: an attempt to expand the space of possible governance configurations, tested first at the scales where improvement is most likely, and extended carefully toward larger scales as evidence accumulates.

---

## 4. The Governance Configuration Space

### 4.1 Primitives

Votiverse defines governance as a composition of five configurable primitives:

| Primitive | Description |
|-----------|-------------|
| **Direct Vote** | A participant casts a vote on a specific issue. |
| **Delegation** | A participant assigns their voting power on some scope to another participant. |
| **Topic Scope** | A hierarchical taxonomy that determines the domain of a delegation. |
| **Revocability** | The ability of a participant to withdraw a delegation or override it with a direct vote at any time before the vote closes. |
| **Transitivity** | The property that if A delegates to B, and B delegates to C, then C exercises the voting power of both A and B. |

These five primitives, when configured with different constraints, produce a wide range of governance systems.

### 4.2 Ballot and Visibility Parameters

The delegation primitives determine how voting power flows through the network. But the voting mechanism itself has a separate set of parameters that are orthogonal to delegation and equally important:

| Parameter | Options |
|-----------|---------|
| **Ballot secrecy** | Secret ballot, public ballot, or anonymous-but-auditable (verifiable by the voter, anonymous to others). |
| **Delegate vote visibility** | Public (everyone sees how delegates voted), visible to delegators only (you see how your delegate voted, others don't), or private (no one sees). |
| **Voting method** | Simple majority, supermajority (configurable threshold), ranked choice, approval voting, or other methods. |
| **Quorum** | Minimum participation required for a vote to be valid, expressed as a percentage of eligible participants. |
| **Participation mode** | Voluntary (default), mandatory (all participants must vote or explicitly abstain), or mandatory-with-delegation (delegation counts as participation). |
| **Survey transferability** | Always non-transferable (surveys cannot be delegated, as described in Section 9). |
| **Prediction requirements** | Predictions optional, encouraged, or mandatory on proposals. |
| **Community notes** | Enabled or disabled. |
| **Awareness layer intensity** | Minimal, standard, or aggressive anomaly detection. |

These parameters combine with the delegation primitives to define the complete governance configuration. The total parameter space is large, but most organizations will use a small, well-understood region of it.

### 4.3 Familiar Systems as Configurations

| System | Direct Vote | Delegation | Topic Scope | Revocability | Transitivity |
|--------|:-----------:|:----------:|:-----------:|:------------:|:------------:|
| **Pure direct democracy** | Required | None | N/A | N/A | N/A |
| **Representative democracy** | None (between elections) | Mandatory, single delegate | All topics | Only at election | Typically none |
| **Liquid democracy** | Optional | Optional, multiple delegates | Per-topic | Anytime | Yes |
| **Swiss direct democracy** | Required per issue | None | Per-issue | N/A | N/A |
| **Corporate board proxy** | Optional | Optional, single delegate | All topics | Before meeting | No |

Votiverse does not privilege any single configuration. It provides the infrastructure to implement any of them — and the configurations in between.

### 4.4 The Platform as a Governance Factory

Votiverse is, in operational terms, a **factory for governance systems**. The parameter space defined by the delegation primitives, ballot parameters, and feature toggles is the set of possible governance systems the factory can produce. An organization selects a point in this space — either by choosing a named preset or by configuring parameters directly — and the platform instantiates the corresponding governance system.

This factory model has two modes of use:

**Named presets.** Most organizations do not want to configure a governance system from scratch. They want to select something recognizable, well-understood, and ready to use. Votiverse provides a library of **named presets** — curated configurations with sensible defaults, documentation, and precedent.

Examples of named presets:

| Preset | Description | Typical Use |
|--------|-------------|-------------|
| **Town Hall** | Direct democracy, secret ballot, simple majority, no delegation. | Small clubs, parent committees, informal groups. |
| **Swiss Model** | Direct democracy per issue, structured booklet required, predictions encouraged, community notes enabled. | Associations, cooperatives, civic groups that want informed voting. |
| **Liquid Standard** | Topic-specific delegation, transitive, revocable anytime, delegate votes visible to delegators, predictions optional. | Medium organizations, tech communities, professional associations. |
| **Liquid Accountable** | Liquid Standard plus mandatory predictions, full awareness layer, delegate track records public. | Organizations that prioritize long-term accountability. |
| **Board Proxy** | Single-delegate proxy, non-transitive, revocable before meeting, secret ballot. | Corporate boards, formal governance bodies. |
| **Civic Participatory** | Liquid delegation with chain depth cap, verified identity, mandatory predictions, community notes, surveys enabled, blockchain integrity. | Municipal deployments, participatory budgeting, citizen assemblies. |

Presets are starting points, not straitjackets. An organization can select a preset and then adjust individual parameters — for example, starting with "Swiss Model" but enabling delegation for specific topic categories.

**Experimental mode.** For organizations that want to explore the configuration space freely — governance researchers, communities that want to innovate, projects testing novel mechanisms — the platform exposes the full parameter space. In experimental mode, an organization can compose any combination of parameters, including combinations that have no precedent.

Some experimental configurations may produce surprising or dysfunctional behavior. The platform should clearly label untested configurations and, where possible, warn about known interactions ("secret ballots with public delegate votes may create coercion risks in small groups"). But the platform does not prevent experimentation. The governance configuration space is not fully explored, and some of the most valuable configurations may be ones no one has tried yet.

### 4.5 The Continuum

The key insight is that representative democracy and direct democracy are not opposites. They are extreme values in a multi-dimensional configuration space. Most real governance needs fall somewhere in the interior of that space, where participants vote directly on issues they care about and delegate the rest to people they trust.

Votiverse makes the interior accessible — and explorable.

---

## 5. How Voting and Delegation Work

This section describes how Votiverse resolves votes in the presence of delegations. The concepts are precise but presented through examples rather than notation. A full formal specification using graph theory and set notation is provided in Appendix C.

### 5.1 The Basic Mechanism

Every participant in a Votiverse instance can do one of three things for any given issue: vote directly, delegate, or abstain.

A **delegation** is an instruction: "If I don't vote on this issue, let this person's vote count for me too." It has three components: the person delegating, the person receiving the delegation, and the **scope** — which topics or issues the delegation covers.

Delegations can be broad ("delegate all Finance topics to Alice") or narrow ("delegate this specific budget proposal to Alice"). When a narrow delegation and a broad one overlap, the narrow one wins. This means you can delegate an entire category to one person but carve out specific issues for yourself or someone else.

### 5.2 The Override Rule

The most important rule in the system: **a direct vote always wins.**

If you have delegated Climate Policy to Maria, but a particular climate proposal matters to you, you simply vote. Your vote counts as your own, with weight one, and Maria's vote does not include yours. You do not need to revoke the delegation — your direct participation automatically overrides it for that issue.

This is the "backup" semantics at the heart of the system. A delegate is not your representative in the traditional sense. They are your fallback — the person who votes on your behalf only if you choose not to.

### 5.3 Transitive Delegation

Delegations can flow through chains. Suppose:

- Alex delegates Finance to Beth.
- Beth delegates Finance to Carlos.

If none of them vote directly, Carlos casts one vote that carries the weight of all three: his own, Beth's, and Alex's. Carlos's vote effectively counts three times — once for himself, once for Beth, and once for Alex.

This is **transitive delegation**: trust flows through the network. Alex trusts Beth. Beth trusts Carlos. The system respects both links.

There is no limit on chain length in the default configuration (though organizations can impose one). A chain of ten people all delegating to the same terminal voter means that voter carries the weight of eleven — their own plus ten delegators.

### 5.4 How Overrides Interact with Chains

Overrides break chains cleanly. Consider the same chain — Alex → Beth → Carlos — on a Finance issue:

**If Beth votes directly:** Beth's vote counts with weight one (her own). Alex's delegation still flows, but it stops at Beth — not Carlos. Beth now carries weight two (her own vote plus Alex's delegation). Carlos carries weight one (his own).

**If Alex votes directly:** Alex's vote counts with weight one. The delegation to Beth is overridden for this issue. Beth's delegation to Carlos still holds, so Carlos carries weight two (his own plus Beth's). Alex carries one.

**If all three vote directly:** Each carries weight one. No delegations are exercised. The system behaves as pure direct democracy.

The principle is consistent: a direct vote severs the chain at that point. Everything upstream of the direct voter is unaffected; everything downstream of them loses the delegated weight.

### 5.5 Delegation Scope and Precedence

Topics in Votiverse are organized hierarchically. A topic like "Education" might contain subtopics like "K-12," "Higher Education," and "Vocational Training." A delegation scoped to "Education" covers all subtopics. A delegation scoped to "K-12" covers only that subtopic.

When multiple delegations from the same person are active for the same issue, the most specific one wins. If you delegate all of Education to David but delegate K-12 specifically to Elena, then for a K-12 issue, Elena is your delegate, not David.

If two delegations have the same specificity, the most recently created one takes precedence.

### 5.6 Cycles

Transitive delegation can create cycles. If Alice delegates to Bob, Bob delegates to Carol, and Carol delegates to Alice, no one in the cycle can resolve — each is waiting for the other.

Votiverse resolves cycles simply: if participants form a cycle and none of them vote directly, all participants in the cycle are treated as abstaining. Their votes are not lost — they are simply not exercised, because no one in the loop stepped forward to cast them.

If any participant in the cycle votes directly, that breaks the cycle at their position, and the rest of the chain resolves normally.

### 5.7 Guarantees

The model guarantees four properties that hold regardless of how delegations are configured:

**Sovereignty.** Every participant can always vote directly. No delegation, no matter how many layers deep, can prevent someone from casting their own vote.

**One person, one vote.** Every participant contributes exactly one unit of voting weight to the final tally. Delegation moves weight through the network — it never creates or destroys it.

**Monotonicity.** Voting directly never makes you worse off. Casting a vote can only increase your influence on the outcome compared to delegating.

**Revocability.** Any delegation can be withdrawn at any time before the vote closes. The system recomputes weights immediately.

---

## 6. Voting Events and the Digital Booklet

### 6.1 Voting Events

A voting event is a structured period during which one or more issues are put to a vote. It is the operational unit of governance in Votiverse, analogous to a Swiss *votation day*.

A voting event has:

- a defined **timeline** (deliberation period, voting period, closing),
- one or more **issues**, each independently votable,
- a set of **eligible participants**,
- a **governance configuration** that determines which primitives are active.

### 6.2 The Digital Voting Booklet

Inspired by the Swiss Federal Council's practice of mailing a physical booklet to every citizen before a vote, Votiverse provides a **digital voting booklet** for each issue. The booklet is not optional decoration — it is a structural requirement. No issue can proceed to vote without a complete booklet.

For each issue, the booklet contains:

1. **Official description.** A neutral summary of the issue, prepared by the event administrators.
2. **Proposal text.** The specific proposal being voted on, submitted by the proponents.
3. **Supporting arguments.** The case for the proposal, submitted by the proponents.
4. **Opposing arguments.** The case against the proposal, submitted by opponents or the administrators.
5. **Predictions.** Falsifiable predictions about the expected outcomes if the proposal passes (see Section 7).
6. **Current state of affairs.** Relevant metrics and context as they stand at the time of voting.

The booklet ensures that every voter — whether voting directly or evaluating whether to override a delegation — has access to structured, balanced information.

### 6.3 Roles

Three roles govern the lifecycle of a voting event:

**Administrators** create voting events, define issues, manage timelines, and enforce formatting and fairness rules. They do not rewrite proposals but may reject submissions that violate guidelines. Their role is analogous to the Swiss Federal Council in the votation process: procedural, not editorial.

**Proponents** submit proposals for issues. They provide the proposal text, supporting arguments, and predictions. Opponents — who may be other proponents, administrators, or any participant — submit counter-arguments.

**Members** read the booklet, participate in community deliberation, and vote. They may also contribute community notes (see Section 8).

---

## 7. Prediction Tracking and Accountability

### 7.1 The Accountability Gap

Traditional democratic systems record what was decided but not what was expected. A proposal wins, a policy is implemented, and years later, no one systematically compares the outcome to the promises that secured the votes. This is the accountability gap: decisions are made on the basis of predictions that are never checked.

Votiverse closes this gap.

### 7.2 Proposals as Models

There is a foundational principle from probabilistic reasoning that applies directly to governance: **the model that predicts best is the one you should trust.**

In Bayesian model selection, competing models each tell a story about how the world works. Any model can be made to fit past data — you can construct a narrative that perfectly explains everything that has already happened. The test of a model's quality is not how well it explains the past but how well it predicts data it has not yet seen. You hold out part of the data, you check the model's predictions against it, and the model that generalizes — not the one that tells the most compelling retrospective story — is the one that deserves trust.

Governance proposals are models. Each proposal is an implicit claim about how the world works: "if we adopt this policy, these outcomes will follow." Competing proposals are competing models of reality. And just as in statistical inference, the proposal that narrates most compellingly — the one that resonates emotionally, that fits the audience's prior beliefs — is not necessarily the one that predicts accurately.

The current political system has no holdout set. It never systematically checks predictions against outcomes. It evaluates proposals entirely on narrative fit — how well the story resonates at the moment of decision — rather than predictive accuracy. This is the equivalent of selecting a statistical model based on its training error alone, with no cross-validation. It is a system optimized for overfitting.

And overfitting in governance has a familiar name: populism. A proposal (or a leader) that perfectly explains everything that has already happened, that tells you exactly what you want to hear about the past, but that has no real predictive power going forward. The more specific the promises, the more emotionally calibrated the narrative, the better the fit to current sentiment — and the worse the predictions tend to be when checked against reality.

Prediction tracking is the regularizer. It introduces a cost for overconfident, unfalsifiable, or inaccurate claims by checking them against outcomes. Over time, it builds the equivalent of a cross-validation record for governance: which proposals (and which people) actually predict well, and which ones merely narrate well.

### 7.3 Predictions as First-Class Objects

In Votiverse, predictions are a core feature of the platform, configurable per organization. When enabled, every proposal is encouraged — or, at the organization's discretion, required — to include one or more falsifiable predictions about its expected outcomes.

A prediction is a structured claim containing:

- a **measurable variable** (what is being predicted),
- a **direction and magnitude** (what change is expected),
- a **timeframe** (when the outcome will be evaluable),
- an optional **methodology** (how the variable will be measured).

### 7.4 Prediction Patterns

Predictions follow standardized patterns to ensure comparability:

| Pattern | Example |
|---------|---------|
| Absolute change | "Youth sports participation will increase by 200 participants within 3 years." |
| Percentage change | "Operational costs will decrease by 15% within 2 years." |
| Threshold | "Renewable energy usage will reach 80% by 2030." |
| Binary outcome | "The new facility will be operational within 18 months." |
| Range | "Membership will be between 500 and 700 by end of year." |
| Comparative | "Option A will reduce wait times more than Option B." |

### 7.5 Outcome Recording and Comparison

After the specified timeframe elapses, outcomes are recorded against predictions. This creates a feedback loop:

$$\text{Proposal} \xrightarrow{\text{includes}} \text{Predictions} \xrightarrow{\text{time passes}} \text{Outcomes} \xrightarrow{\text{compared to}} \text{Predictions}$$

Over time, this builds a knowledge archive. New proposals on the same topic include a "Current State of Affairs" section, and participants can browse past predictions and their accuracy. The platform accumulates institutional memory — not just of what was decided, but of what was believed and how reality responded.

### 7.6 The Embedded Record: Votiverse as Information Infrastructure

The prediction-outcome loop is not merely an accountability mechanism. It is the foundation of an **unbiased, embedded information channel** within the governance system.

In existing democratic systems, the record of what was proposed, what was promised, and what happened is scattered across legislative archives, government reports, news articles, and academic studies. No single system connects a proposal to its predictions to its outcomes and makes that chain accessible to ordinary participants at the moment they need it. The result is that voters operate in an environment where narrative displaces evidence. Political discourse becomes a discussion of personalities and affiliations rather than an evaluation of governance quality.

Votiverse embeds the record directly into the governance process. Every proposal that passes through the system carries its predictions forward in time. When outcomes are recorded, they are linked back to the original proposal. When a new proposal is introduced on the same topic, the system surfaces the history: what was tried before, what was predicted, and what actually happened.

This does not require participants to be policy analysts. The information is delivered contextually and progressively — a summary by default, detail on demand. But its mere presence changes the information environment. A participant who is about to vote on a transportation proposal sees, without searching for it: "A similar proposal was adopted in 2024. It predicted a 20% reduction in commute times within two years. The measured reduction was 4%." That single data point, delivered at the point of decision, does more to inform the vote than a year's worth of editorial commentary.

### 7.7 Who Predicts Best

The prediction record enables something that no current democratic system provides: a **structural signal of forecasting quality**.

Over time, the system accumulates data on who supports proposals with accurate predictions and who supports proposals whose predictions fail. This applies to both individual participants and delegates. A delegate who consistently backs proposals whose predictions prove accurate develops a visible track record — not of rhetoric or charisma, but of judgment. A delegate whose supported proposals consistently miss their predictions develops the opposite record.

This is not a reputation system based on popularity. It is a quality signal based on outcomes. It inverts a fundamental asymmetry in existing governance: in current systems, the people who predict best have no structural advantage over the people who narrate best. A leader who makes terrible predictions but tells a compelling story continues to attract support. A careful analyst who predicted outcomes correctly has no platform-level mechanism to surface that accuracy. Votiverse creates that mechanism.

The signal does not need to be complex to be useful. Even a simplified indicator — "this delegate has been active on Finance topics for 3 years; of the 14 proposals they supported that included predictions, 9 have been evaluated, and 6 were within the predicted range" — conveys information that simply does not exist in any current governance system. It is a credit score for governance judgment. Most people will not inspect the underlying data, just as most people do not audit their credit score methodology. But the signal itself influences trust decisions.

### 7.8 Raising the Floor

The prediction tracking system is not designed to convert passive participants into policy experts. It is designed to **raise the floor** of the information environment.

Even in a system where most participants delegate passively, the quality of governance improves if the information infrastructure is honest, structured, and persistent. When delegates know their prediction track record is visible, they face incentives to be more careful about what they support. When proposals must include falsifiable predictions, proponents face incentives to be realistic rather than promotional. When outcomes are recorded against predictions, the community accumulates evidence about what works and what doesn't — evidence that is available to anyone who looks, and surfaced by the awareness layer to anyone who needs it.

This is not a complete solution to the problem of disengagement (see Section 3). But it changes the character of the system even for participants who never examine a prediction directly. The information exists. It shapes the behavior of delegates and proponents. And it is there for the moments — elections, crises, controversies — when enough people do pay attention.

### 7.9 Delegate Accountability

Prediction tracking connects directly to the delegation system. Participants who act as delegates accumulate a track record. When a delegate consistently supports proposals whose predictions prove accurate, their trustworthiness is grounded in evidence. When they don't, delegators have concrete reasons to revoke.

This creates a natural quality signal within the delegation network — one based on outcomes, not rhetoric.

---

## 8. Community Notes and Distributed Fact-Checking

### 8.1 The Problem with Centralized Fact-Checking

Determining what is true is hard. Centralizing that determination in a single authority creates a bottleneck, a single point of failure, and — inevitably — accusations of bias. Votiverse does not attempt to be the arbiter of truth. Instead, it distributes the fact-checking process across the community.

### 8.2 Community Notes

Inspired by the community notes system pioneered on X (formerly Twitter), Votiverse allows participants to attach notes to proposals, arguments, and predictions. A note might:

- provide additional context,
- correct a factual error,
- link to a relevant source,
- flag a misleading statistic.

### 8.3 Note Evaluation

Notes are evaluated by the community through a rating system designed to surface notes that are found helpful by people across different viewpoints. A note that is rated as helpful only by people who already agree with the proposal it annotates is less valuable than a note rated as helpful by people on both sides. The evaluation algorithm should reward bridging — notes that inform across partisan lines.

Notes that achieve sufficient positive evaluation from a diverse set of raters become **visible context**, displayed alongside the content they annotate in the voting booklet.

---

## 9. Participant Surveys: Voters as Distributed Sensors

### 9.1 The Sensing Mechanism

Section 3.4 established that sensing and deciding are fundamentally different tasks, and that even disengaged participants are valuable sensors. This section describes the operational mechanism through which sensing is implemented: **participant surveys**.

Surveys are the channel through which observations flow upward from participants to the system. Everything else in Votiverse — proposals, booklets, arguments, predictions — flows downward: here is an issue, here is the information, now decide. Surveys reverse the direction: what are you experiencing? What are you observing? What does reality look like from where you stand?

Participants are **distributed sensors** embedded in their local realities — personal, familial, communal. A parent knows whether the school has improved. A commuter knows whether traffic has changed. A small business owner knows whether the regulatory reform helped or hurt. No centralized data-gathering system captures this as efficiently as structured, accountable surveying of the people who live inside the reality being governed.

### 9.2 Surveys Are Not Votes

Surveys are a separate primitive from votes. The distinction is fundamental:

A **vote** expresses a decision. It can be delegated, because someone you trust can exercise judgment on your behalf. A **survey** expresses an observation. It cannot be delegated, because the entire point is *your* experience from *your* position. If you delegate a survey response, you have destroyed the information. No one else can report what you are seeing.

Survey responses are therefore **non-transferable**. Every participant responds for themselves or not at all. This is the one place in the system where delegation is structurally excluded.

### 9.3 Accountable and Open

Existing opinion surveys suffer from three forms of gating. The surveying agency decides who to ask. The agency decides how to frame the questions. The agency decides what to publish. The sample is opaque, the methodology is debatable, and the results are easily weaponized — "62% of people think X" becomes a rhetorical tool whose provenance cannot be inspected.

Votiverse surveys are the structural opposite:

**Open participation.** Every eligible participant can respond. There is no selected sample. The "sample" is the entire community, and the response rate is itself a data point.

**Visible questions.** The survey questions are public. Anyone can see what is being asked, how it is framed, and who proposed it.

**Transparent results.** Raw results are available to all participants, not filtered through editorial interpretation. Aggregate breakdowns (by topic, by delegation cluster, by participation history) are available for analysis.

**Accountable provenance.** Who proposed the survey questions, and under what process, is part of the record. Questions are not injected anonymously into the information environment.

### 9.4 Structured Cadence

If surveys are reactive and ad-hoc — triggered by controversy, available at any time — they will be dominated by the angry and the motivated. This is the selection bias that plagues online comment sections, town halls, and voluntary questionnaires: the people who show up are not representative of the people who are affected.

Votiverse addresses this through **predictable scheduling**. Surveys occur on a regular cadence — tied to voting events, or at fixed intervals defined by the organization. Participants know in advance when surveys will happen, just as Swiss citizens know when votation days are coming. The ritual of scheduled participation draws a broader cross-section than spontaneous engagement.

Additional design constraints to limit noise and manipulation:

**Frequency limits.** Organizations configure how often surveys occur. Too many surveys cause fatigue and reduce response rates. Too few miss important signals. The right cadence depends on the organization's scale and decision frequency.

**Question governance.** Who can propose survey questions, and how they are reviewed, is configurable. Options range from administrator-only (simple organizations) to community-proposed with review (larger deployments). The key constraint is that questions must be neutral in framing — the system is gathering observations, not manufacturing consensus.

**Brevity.** Surveys should be short. A handful of well-chosen questions yields better data than a lengthy questionnaire that most participants abandon. The goal is a lightweight signal, not a comprehensive study.

### 9.5 Surveys as Ground Truth for Predictions

Participant polls connect directly to the prediction tracking system. When a proposal predicted "15% improvement in youth sports participation," the outcome can be measured through official statistics. But it can also be sensed through structured polls: "Has youth sports participation in your area increased, decreased, or stayed the same since the facility was built?"

These two signals — official metrics and distributed observation — serve different purposes. Official metrics are precise but slow, often arriving months or years after the fact. Distributed observation is imprecise but fast, and it captures qualitative realities that statistics miss. When the two signals agree, confidence in the outcome assessment is high. When they diverge — the statistics say improvement, but participants on the ground report no change — that divergence is itself valuable information. It may indicate that the statistics are misleading, that the improvement is unevenly distributed, or that the metric being measured does not capture what people actually experience.

Polls therefore give the prediction tracking system a second channel of evidence — one that comes from the people the governance decisions are supposed to serve.

### 9.6 Polls as Trend Lines

Because polls recur on a predictable schedule, they produce something that one-time outcome evaluations cannot: **a longitudinal trend.**

A single outcome check, performed when a prediction's timeframe expires, yields a binary judgment — the prediction was met or it wasn't. A recurring poll yields a time series of community observation that runs in parallel with the governance timeline. This time series is far more informative.

Consider a proposal that predicts a reduction in crime within three years. Official crime statistics will eventually confirm or deny the prediction — but they arrive slowly, often with methodological caveats, and always after the fact. Meanwhile, quarterly polls asking residents "do you feel safer in your neighborhood compared to a year ago?" create a continuous signal. If that signal shows a steady increase in perceived insecurity — quarter after quarter, starting six months after the proposal was implemented — the community does not need to wait three years for the official verdict. The trend is the early warning.

This transforms polls from snapshots into a monitoring system. The awareness layer can surface trend data at the point of decision: "This proposal predicted reduced crime within 3 years. We are 18 months in. Over the last four polls, the percentage of residents reporting increased insecurity has risen from 22% to 41%." That is actionable information. Participants can use it to demand course correction, override delegations, or weigh the track record of whoever championed the proposal.

Over time, poll trend lines accumulate into a historical record of community experience — how things felt before a decision, how they changed afterward, and whether the trajectory matched what was promised. This is governance memory built from lived experience, not just from official statistics.

### 9.7 Polls and the Awareness Layer

Poll results feed into the governance awareness layer (Section 10). When a new proposal is introduced on a topic that has been polled, the awareness layer can surface the most recent poll data: "In the last community poll, 68% of respondents reported that traffic congestion has worsened since the bypass was built." This contextual information, delivered at the point of decision, connects the lived experience of participants to the next round of governance.

Over time, the polling record — like the prediction record — becomes part of the platform's institutional memory. It is a structured, longitudinal account of what participants observed, reported alongside what was proposed, what was predicted, and what official metrics showed. This is the kind of information infrastructure that no existing governance system provides.

---

## 10. The Governance Awareness Layer

### 10.1 From Passive Transparency to Active Awareness

Most governance systems treat transparency as a property of data: the information is published, and citizens are free to consult it. In practice, this means the information is available to journalists, researchers, and the unusually motivated — and invisible to everyone else.

Votiverse takes a different approach. The platform includes a **governance awareness layer**: a built-in system that continuously monitors the state of the delegation network, the history of decisions and outcomes, and the behavior of delegates — and delivers relevant findings to participants contextually, at the moment they are making decisions.

The analogy is not a transparency dashboard. It is a built-in newsroom that reports on the health of the governance system itself.

### 10.2 Design Principles

The awareness layer is governed by four principles:

**Contextual delivery.** Information surfaces at the point of decision, not in a separate analytics panel. When you are about to delegate, you see where your vote will actually land. When you are about to vote, you see relevant history. When your delegation is affected by a structural anomaly, you are informed.

**Progressive disclosure.** The default view is a summary. One level down is an explanation. Below that is the full data. A participant who wants a quick sanity check gets a green light or a yellow flag. A participant who wants to investigate gets the tools to do so. No one is buried in data they did not ask for.

**Personal relevance.** The system does not broadcast system-wide alarms. It delivers personalized notifications based on what affects *your* vote. If your delegate has re-delegated to someone who now holds 20% of all voting weight on this topic, *you* are informed — because it is *your* vote that is part of that concentration.

**Signal over completeness.** The awareness layer is not an audit log. It prioritizes high-signal findings: anomalies, concentration spikes, prediction mismatches, chain-length outliers. The goal is to make the important visible without making the routine noisy.

### 10.3 What the Awareness Layer Surfaces

The layer draws on three sources of information — the delegation network, the decision history, and the prediction record — and surfaces findings in several categories:

**Delegation chain resolution.** When a participant sets or reviews a delegation, the system shows the full resolved chain: not just the immediate delegate, but the terminal voter — the person who will ultimately cast the vote on their behalf. If that terminal voter has changed since the delegation was set (because the delegate re-delegated), this is flagged.

**Concentration alerts.** When a single delegate accumulates voting weight beyond a configurable threshold, participants whose votes flow through that delegate receive a contextual notification. The notification includes the delegate's current weight, the number of participants in their subtree, and a comparison to typical weight distributions in the organization.

**Delegation harvesting detection.** The system monitors for patterns consistent with vote harvesting — participants who accumulate delegations and then transfer them in bulk to a downstream delegate. When such patterns are detected, affected participants are notified with a plain-language explanation: "Your delegate, X, has re-delegated your vote along with 47 others to Y. You may want to review."

**Delegate track records.** When a participant is considering a delegation, the system provides a summary of the prospective delegate's history: how many delegations they hold, how they voted on past issues in the relevant topic, and — critically — how accurate the predictions were in the proposals they supported. This is where prediction tracking feeds directly into delegation decisions.

**Engagement prompts.** When a vote is open and a participant has delegated, the system may surface decision-relevant information: "Your delegate voted Yes on this issue. The proposal predicts a 15% cost reduction. A similar proposal in 2023 predicted 20% and achieved 8%. Would you like to review the booklet and vote directly?" These prompts are not nagging. They are triggered by specific conditions — close votes, prediction mismatches, unusual delegate behavior — and respect the participant's choice to delegate.

**Historical context.** When reviewing a proposal, the system links to past decisions on related topics — including their predictions and outcomes. This turns the decision moment into a window onto institutional memory, without requiring the participant to search for it.

### 10.4 Relationship to Other Layers

The governance awareness layer is not a standalone feature. It is the connective tissue between the other structural components of Votiverse:

- It draws on the **delegation graph** (Section 5) for real-time network analysis.
- It draws on the **prediction tracking system** (Section 7) for delegate accountability signals.
- It draws on the **community notes** (Section 8) for crowd-sourced context.
- It delivers its findings through the **digital booklet** (Section 6) and through contextual notifications in the voting interface.

In this sense, the awareness layer is what makes the rest of the system coherent. Without it, delegations are opaque, predictions are an archive, and community notes are annotations. With it, all three become inputs to an informed decision at the moment it matters — and the personal voting history (Section 10.5) ensures that what happened in the past feeds forward into better decisions in the future.

### 10.5 Personal Voting History

The awareness layer is not only forward-looking. It also maintains a **personal voting history** — a retrospective record of every decision a participant was involved in, whether through direct vote or delegation.

The analogy is a fitness tracker. A fitness app does not only tell you to run today; it shows you every run you have done, your trends, where you improved, and where you slipped. Votiverse provides the governance equivalent: a continuous personal record of your participation and its consequences.

For each past voting event, a participant's history shows:

- Whether they voted directly or delegated.
- If delegated: who their immediate delegate was, who the terminal voter was (the end of the chain), and how that person voted.
- Whether the proposal passed or failed.
- What predictions were attached to the proposal.
- Whether those predictions have since been evaluated, and how reality compared.

Over time, this history accumulates into a **voting footprint** — a personal narrative of governance decisions and their outcomes.

**Why this matters for self-correction.** A delegate who harvests votes through obscure re-delegation may succeed once or twice. But the retrospective record makes the pattern visible. A participant opens their voting history and sees: "March 2026 — you delegated Finance to X. X re-delegated to Y. Y voted Yes on Proposal 47. Proposal 47 predicted 12% cost savings. Actual outcome: 2%." Repeated across several events, the story is unmistakable. The participant does not need to catch the behavior in real time. The record catches it for them, and the next time they are about to delegate to the same person, the awareness layer surfaces the pattern.

**Why this matters for engagement.** Just as fitness apps create a natural reason to return — curiosity about progress, satisfaction in streaks, awareness of lapses — the voting history gives participants a reason to revisit their governance choices. Did the proposals I supported (or my delegate supported on my behalf) actually deliver what they promised? Am I delegating effectively, or am I consistently ending up on the wrong side of outcomes? This transforms governance participation from a periodic obligation into an ongoing, self-reinforcing loop.

**Why this matters for institutional learning.** In aggregate (and with appropriate anonymization), voting histories reveal system-level patterns: which topics see the most delegation, which delegates have the best prediction track records, where the community consistently overestimates or underestimates outcomes. The personal record feeds the collective intelligence.

### 10.6 Configurability

Like all Votiverse features, the awareness layer is configurable per organization:

- **Notification intensity.** Organizations can set thresholds for when alerts fire — a twelve-person committee may want minimal alerts, while a municipal deployment may want aggressive anomaly detection.
- **Concentration thresholds.** The weight percentage that triggers a concentration alert is configurable.
- **Engagement prompt triggers.** Organizations decide which conditions warrant prompting delegators to reconsider: close votes, prediction mismatches, delegate behavior changes, or all of the above.
- **Visibility of delegate track records.** Full history, summary only, or disabled.
- **Voting history depth.** How far back the personal history extends, and whether outcome tracking is enabled.

---

## 11. Risks and Mitigations

Any honest proposal must confront the ways it can fail. Liquid-democracy-style systems have known failure modes, and Votiverse inherits them. This section addresses each directly.

### 11.1 Power Concentration

**Risk.** Transitive delegation can create *super-delegates* — individuals who accumulate enormous voting weight through chains of delegation. Research has documented this tendency in both theoretical models and practical implementations.

**Mitigations.** The governance awareness layer (Section 10) is the primary defense. Concentration is not merely measurable — it is actively reported to the participants whose votes contribute to it. Specific mechanisms include real-time concentration metrics (Gini coefficient, maximum individual weight), personalized alerts when a participant's vote flows into a concentrated node, delegation harvesting detection, and full chain-resolution visibility. Because delegations are revocable at any time, informed participants can act immediately. The awareness layer ensures they are informed.

### 11.2 Delegation Overuse

**Risk.** Experimental research has found that people may delegate too readily, deferring to perceived experts even when they would make better decisions themselves. In some experimental settings, delegation produced worse outcomes than simple majority voting.

**Mitigations.** Delegation is not the default. The platform gently encourages direct voting by presenting the booklet and making direct participation easy. The awareness layer's engagement prompts provide contextual nudges — not generic reminders to participate, but specific, decision-relevant information that gives participants a reason to engage directly. Organizations can also configure delegation limits per voting event.

### 11.3 Strategic Behavior

**Risk.** Delegates may act strategically — for example, accumulating delegations on a popular stance and then switching positions. Participants may delegate strategically to amplify their influence.

**Mitigations.** The awareness layer makes delegate behavior visible through track records, voting history, and prediction accuracy. Strategic surprise is limited by last-second revocation rights and by the system's detection of behavioral anomalies (e.g., a delegate whose voting pattern shifts abruptly after accumulating delegations).

### 11.4 Long Delegation Chains

**Risk.** With unlimited transitivity, a chain $A \to B \to C \to D \to \ldots$ can become long enough that participants at the source have no idea who is ultimately casting their vote.

**Mitigations.** The awareness layer's chain-resolution display ensures participants always know who is ultimately voting on their behalf — not just their immediate delegate. Chain-length warnings are delivered contextually. Organizations can configure maximum chain depth if they prefer bounded transitivity.

### 11.5 Digital Divide and Accessibility

**Risk.** A digital governance platform inherently excludes people without reliable internet access, digital literacy, or the devices needed to participate.

**Mitigations.**

- **Offline booklets.** The digital voting booklet can be rendered as a printable document for offline distribution.
- **Assisted voting.** Organizations can designate trusted assistants who help participants submit votes in person, analogous to accessible polling stations.
- **Progressive deployment.** Votiverse is not proposed as a replacement for existing systems overnight. It is a tool for organizations that choose to adopt it, starting where digital access is already the norm.

### 11.6 Sybil Attacks and Identity

**Risk.** In any system where each participant gets one vote, identity verification is critical. A single actor creating multiple fake accounts can subvert the entire model.

**Mitigations.** See Section 12.

---

## 12. Identity, Trust, and Scale

### 12.1 The Identity Spectrum

Votiverse must operate across a wide range of scales. A twelve-person committee and a twelve-million-person municipality have fundamentally different identity requirements. The platform supports a spectrum of identity models:

**Invitation-based (small groups).** An administrator invites participants by name or email. Identity is established by personal knowledge. Appropriate for clubs, teams, committees.

**Organizational authentication (medium groups).** Participants authenticate through an existing identity provider — a company directory, a university SSO, a membership database. Appropriate for organizations, cooperatives, institutions.

**Verified identity (large civic deployments).** Participants are verified through government-issued identity, biometric verification, or other high-assurance mechanisms. Appropriate for municipal or national-scale deployment.

**Cryptographic identity (decentralized deployments).** Participants hold cryptographic keys, potentially linked to on-chain identities or verifiable credentials. Appropriate for DAOs, cross-border communities, or contexts where trust in a central identity authority is low.

### 12.2 Sybil Resistance

At every scale, the platform must resist Sybil attacks — the creation of fake participants to multiply voting power. The defenses vary by identity model:

- Invitation-based: social verification by the administrator.
- Organizational: the identity provider vouches for uniqueness.
- Verified identity: government documents or biometrics.
- Cryptographic: proof-of-personhood protocols, reputation systems, or stake-based mechanisms.

Votiverse does not mandate a single identity solution. It provides an identity layer that organizations configure according to their needs and trust model.

### 12.3 Privacy Considerations

Delegation graphs contain sensitive information — who trusts whom, on what topics. The platform must balance transparency (necessary for accountability) with privacy (necessary for free participation without coercion).

At minimum:

- Individual delegations should be visible to the delegating participant and their delegate.
- Aggregate statistics (weight distributions, concentration metrics) should be visible to all participants.
- Whether specific delegation edges are publicly visible should be configurable by the organization.
- Vote choices must be secret where the organization requires it, even as delegation structures may be partially visible.

---

## 13. Platform Architecture

### 13.1 Votiverse as a Governance Engine

Votiverse is not a single application. It is a **configurable governance engine** that organizations instantiate with their own settings. Each instance defines:

- the set of governance primitives in use,
- the topic taxonomy,
- the identity model,
- the voting rules (quorum, majority type, approval threshold),
- whether prediction tracking is enabled and to what extent,
- delegation constraints (maximum chain depth, concentration caps),
- booklet requirements (which sections are mandatory),
- the visibility model for delegations and votes.

This configurability is what allows the same platform to serve a sports club and a city.

### 13.2 Technical Foundation

Votiverse is supported by Proximify Inc.’s 13 years of experience in platform development, including the creation of the Uniweb Platform. That experience informs Votiverse’s technical foundation, which includes:

- flexible data models for structured content,
- customizable interfaces,
- white-label deployment capability,
- support for both hosted and self-hosted operation.

Organizations can run Votiverse as a hosted service or deploy their own instance. The architecture is designed for:

- real-time delegation graph computation,
- configurable access control,
- audit logging of all governance actions,
- data portability (organizations own their data).

### 13.3 Open Standards

Votiverse aspires to define open standards for:

- governance configuration schemas,
- voting event interchange formats,
- delegation graph representations,
- prediction and outcome recording formats.

Open standards allow interoperability between Votiverse instances and with other governance tools. They also prevent platform lock-in: if Votiverse the platform disappears, the governance data and configurations remain usable.

### 13.4 The Role of AI — and Its Limits

Artificial intelligence can play a valuable role in the Votiverse information layer — particularly in the labor-intensive work of gathering evidence that confirms or contradicts predictions, linking proposals to outcome data, summarizing decision histories, and helping participants navigate complex delegation networks.

An AI system that monitors public data sources, identifies relevant outcome metrics, and presents them alongside original predictions — with links to sources — could dramatically reduce the cost of closing the prediction-outcome loop. Without automation, someone has to manually check whether a proposal's predictions came true. That manual effort is the bottleneck that has prevented any existing governance system from implementing systematic accountability.

However, the whitepaper must be honest about a fundamental limitation: **AI systems are not neutral.** Every major AI system today is developed and operated by a private company with its own incentives, biases, commercial pressures, and content policies. An AI that helps evaluate governance outcomes is only as trustworthy as its operator. If participants cannot inspect, audit, or replace the AI layer, it becomes a new source of unaccountable influence — precisely the kind of opacity that Votiverse is designed to resist.

Votiverse's approach to AI must therefore follow the same principles as the rest of the platform:

**Transparency.** Participants should know which AI system is being used, who operates it, and what constraints it operates under. The AI's outputs — sources found, data gathered, summaries produced — should be clearly distinguished from editorial conclusions.

**Auditability.** The sources and reasoning behind AI-generated information should be inspectable. Links to primary sources are essential. Participants must be able to verify what the AI presents, not simply trust it.

**Replaceability.** Organizations should be able to choose their AI provider and switch providers if trust breaks down. The platform must not create a hard dependency on any single AI system.

**Separation of roles.** AI in Votiverse is part of the information layer, not a decision-maker. It gathers, organizes, and surfaces information. It does not vote, delegate, or evaluate proposals. The judgment remains human.

**Ensemble verification.** The strongest defense against AI bias is not to trust any single AI system but to use multiple systems from different providers. If several independent AI systems — built by different companies, trained on different data, operating under different commercial incentives — evaluate the same prediction against the same outcome data and converge on the same conclusion, that convergence carries weight. If they diverge, the divergence is itself informative: it signals genuine ambiguity in the outcome, or a bias in at least one system worth examining. This is the same logic that underlies community notes — you don't trust one fact-checker, you look for convergence across independently motivated sources. Applied to AI, it means the platform should support multiple AI providers operating in parallel, with their assessments presented side by side rather than blended into a single authoritative answer.

AI is a powerful tool for making the information infrastructure practical at scale. But it is a tool with a corporate provenance, and the system must treat it accordingly.

### 13.5 Platform Integrity: Blockchain and Oracles

Votiverse demands accountability from proposals, delegates, and information sources. But a system that holds others accountable must itself be accountable. If the organization operating a Votiverse instance can quietly alter vote tallies, modify prediction records, edit poll results, or tamper with the delegation graph after the fact, then the entire accountability infrastructure is built on a foundation that cannot be trusted.

This is the **meta-accountability problem**: who watches the system itself?

**Blockchain as an integrity layer.** Blockchain technology provides the properties that meta-accountability requires: immutability (records cannot be altered after they are written), transparency (the ledger is publicly inspectable), and decentralization (no single party controls the record). Votiverse can use blockchain not as the foundation of the entire platform — that would be impractical for a small club and unnecessary for many deployments — but as an optional **integrity layer** that organizations enable when the stakes justify it.

What goes on-chain is not the entire platform state. It is the **critical integrity artifacts** — the records that, if tampered with, would undermine the system's credibility:

- Vote tallies and outcome counts.
- Prediction commitments — cryptographic hashes of the prediction text and parameters, anchored at the time of proposal submission so that predictions cannot be retroactively edited to match outcomes.
- Outcome recordings — the data used to evaluate whether predictions were met.
- Poll results — aggregate responses, timestamped and committed.
- Delegation graph snapshots at the time of each vote — so the weight distribution is verifiable.

A cryptographic commitment anchored to a public blockchain means that any later alteration of these records is detectable. Participants, auditors, or independent observers can verify that the records have not been changed since they were committed. This is not about running the platform on a blockchain. It is about using the blockchain as a tamper-evident seal on the records that matter most.

**Oracles for outcome verification.** The prediction tracking system requires real-world outcome data to be brought into the platform. When a prediction claims "crime will decrease by 15% within two years," something must bridge the gap between external reality and the platform's record. This is the classic **oracle problem** in blockchain systems: how do you get trustworthy off-chain data on-chain?

Several approaches apply, and they are not mutually exclusive:

- **AI-assisted gathering** (Section 13.4) monitors public data sources and presents findings with links. This is fast and scalable but inherits the biases of the AI provider.
- **Trusted data provider oracles** — government statistics agencies, independent monitors, academic institutions — can serve as formally recognized sources for specific prediction types. Their data feeds can be cryptographically signed and committed alongside predictions.
- **Participant polls** (Section 9) provide distributed, ground-level observation that complements official data.
- **Community verification** — participants can challenge outcome recordings by providing counter-evidence, with disputes resolved through a structured process.

The combination of multiple oracle sources — AI, official data providers, polls, and community challenge — provides resilience. No single source needs to be fully trusted because the sources check each other.

**Configurability.** Like everything in Votiverse, the integrity layer is configurable. A small club may need no blockchain integration — internal trust and social accountability suffice. A municipal deployment handling public funds should probably commit all critical records to a public chain. A national-scale deployment may require the full integrity stack: on-chain commitments, multiple oracle sources, independent audit capability, and cryptographic verification tools accessible to any participant.

The principle is consistent with the rest of the platform: transparency and accountability scale with stakes.

---

## 14. Deployment Strategy: Learning by Doing

### 14.1 No Teleportation

Votiverse does not assume it will begin by solving national-scale governance. The project's strategy is empirical and incremental: deploy at small scale, observe what actually happens, revise the model based on evidence, and expand carefully.

This is consistent with the project's own principles. If Votiverse asks proposals to include falsifiable predictions, then Votiverse itself should operate the same way. The project's implicit prediction is: "configurable governance with prediction tracking and an awareness layer will improve collective decision-making." The way to test that prediction is not to theorize about it but to deploy, measure, and learn.

### 14.2 The Scale Ladder

The deployment strategy follows a natural progression:

**Stage 1: Small voluntary groups.** Clubs, parent committees, small associations, hobby organizations. At this scale, identity is trivial (everyone knows each other), stakes are concrete, and the feedback loop between decisions and outcomes is fast. This is the proving ground. If Votiverse doesn't improve decision-making for a 30-person cooperative, it won't improve it for a city.

**Stage 2: Organizations and institutions.** Companies, cooperatives, professional associations, academic governance. The participant count grows to hundreds or low thousands. Delegation becomes genuinely useful — not everyone can engage with every decision. Prediction tracking begins to accumulate meaningful data. The governance awareness layer starts to earn its complexity.

**Stage 3: Municipal and civic deployments.** Participatory budgeting, citizen assemblies, local referenda. Verified identity becomes necessary. The information layer — community notes, prediction tracking, AI-assisted outcome monitoring — becomes essential for managing complexity. The scale problem (Section 3) becomes real, and the topic-community approach is tested.

**Stage 4: Larger civic and cross-organizational use.** Regional governance, multi-organization federations, large-scale public consultation. This is the frontier where the project's open questions (Section 3.6) are answered empirically.

Each stage informs the next. The lessons from Stage 1 deployments — which configurations work, which failure modes manifest, how participants actually behave — shape the platform's development before it reaches Stage 2. This is not a waterfall; it is governance R&D.

### 14.3 Eating Our Own Cooking

The Votiverse project itself should be an early deployment. As the community of contributors grows, the project's own decisions — roadmap priorities, governance model revisions, policy choices — can be made using Votiverse. This creates a tight feedback loop: the people building the platform are also its users, and every friction point they encounter is a friction point they can fix.

If the platform is not good enough for its own contributors to use, it is not ready for anyone else.

---

## 15. Governance of Votiverse Itself

A platform for democratic governance should, eventually, govern itself democratically. Several models are under consideration:

**Option 1: Operated by Proximify.** Proximify Inc. develops and operates the platform directly. This provides simplicity and accountability during the early phase.

**Option 2: Independent Foundation.** A non-profit foundation governs Votiverse. Proximify contributes the technology and may maintain development, but governance decisions are made by the foundation.

**Option 3: Hybrid.** A non-profit oversees governance while Proximify maintains the technology under a development agreement.

The long-term aspiration is for Votiverse to be governed through its own mechanisms — a Votiverse instance managing the platform's roadmap, policies, and evolution. This creates a powerful alignment of incentives: the platform must be good enough that its own stewards want to use it.

---

## 16. Sustainability

Votiverse is designed for sustainable impact, not profit extraction. Revenue funds infrastructure, development, moderation tools, research, and global scaling.

**Possible funding sources:**

- **Organizational subscriptions.** Private organizations pay for hosted instances with advanced features.
- **Civic subsidy.** Civic and non-profit use is free or low-cost, subsidized by organizational revenue.
- **Grants.** Democracy innovation, civic technology, and open-governance grants.
- **Donations.** Individual and institutional supporters.

The economic model is designed so that Votiverse's success as a business is directly correlated with its success as a governance tool. If it doesn't improve decision-making, organizations won't pay for it.

---

## 17. Related Work

Votiverse builds on a substantial body of prior work.

**Liquid democracy.** The concept of revocable, transitive, topic-specific delegation has been explored theoretically and in software platforms such as LiquidFeedback. Votiverse extends this work by embedding liquid delegation as one configuration within a broader governance space, and by adding the prediction-tracking accountability layer that liquid democracy literature has not addressed.

**Swiss direct democracy.** Switzerland's system of regular referenda with mandatory voter booklets is the operational inspiration for Votiverse's voting events. Votiverse digitizes and extends the Swiss model with delegation, predictions, and community notes.

**DAO governance.** Blockchain-based decentralized autonomous organizations have implemented delegation mechanisms similar to liquid democracy, particularly in Delegated Proof of Stake systems. Votiverse draws on this experience but is not limited to blockchain-based identity or token-weighted voting.

**O'Donnell's delegative democracy.** Guillermo O'Donnell's concept of delegative democracy (1994) describes regimes where citizens elect a strong executive with weak institutional constraints. This is a diagnosis of a pathology, not a design proposal. Votiverse's model is the structural opposite: delegation is granular, revocable, and transparent, and the platform itself provides the institutional constraints that O'Donnell found lacking.

**Participatory budgeting.** Municipal participatory budgeting programs worldwide have demonstrated that citizens can meaningfully engage with specific policy decisions when given structured information and accessible tools. Votiverse generalizes this approach beyond budgets.

**Prediction markets and forecasting.** The use of predictions to evaluate decision quality draws on the logic of forecasting tournaments and prediction markets, adapted to a governance context where the "predictions" are attached to specific proposals rather than traded as financial instruments.

---

## 18. Conclusion

Democracy is a technology. Like all technologies, it can be improved.

The systems we have inherited were designed for a world of limited communication, slow information flow, and geographically constrained communities. In that world, electing a single representative to decide everything on your behalf for four years was a reasonable engineering trade-off. It is no longer the only one available.

Votiverse does not claim to have solved democracy. It claims that the configuration space of democratic governance is far larger than what any single country currently explores, and that a platform enabling organizations to navigate that space — with accountability, transparency, and adaptability — is worth building.

The invitation is open. If you believe collective decision-making can be better than what we have today, and you are willing to do the work of making it so, Votiverse is a place to start.

**Decisions, democratically delivered.**

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Participant** | Any individual eligible to vote within a Votiverse instance. |
| **Delegation** | The assignment of one's voting power to another participant, scoped to a topic or set of topics. |
| **Delegate** | A participant who holds delegated voting power from others. |
| **Topic taxonomy** | A hierarchical classification of subjects used to scope delegations. |
| **Voting event** | A structured period during which one or more issues are put to a vote. |
| **Digital booklet** | The structured information package accompanying each issue in a voting event. |
| **Override** | The act of casting a direct vote, which nullifies any active delegation for that issue. |
| **Transitive delegation** | A delegation that flows through intermediaries: if A delegates to B and B delegates to C, then C votes on behalf of A. |
| **Super-delegate** | A participant who accumulates unusually high voting weight through transitive delegation chains. |
| **Prediction** | A structured, falsifiable claim about the expected outcome of a proposal, attached to the proposal at the time of voting. |
| **Community note** | A participant-submitted annotation on a proposal, argument, or prediction, subject to community evaluation. |
| **Governance configuration** | The specific combination of primitives, constraints, and rules that define how a Votiverse instance operates. |
| **Named preset** | A curated, ready-to-use governance configuration with sensible defaults, documentation, and precedent. |
| **Participant poll** | A non-delegable, structured survey of participant observations about local conditions and lived experience. |
| **Governance awareness layer** | The built-in system that monitors the delegation network, decision history, and prediction record, and delivers contextual findings to participants at the point of decision. |

---

## Appendix B: Configuration Examples

The following examples illustrate how named presets can be used as starting points and customized for specific organizational needs. Each example references the closest named preset (Section 4.4) and notes the customizations applied.

### B.1 Soccer Parents' Committee

- **Base preset:** Town Hall.
- **Participants:** 20 parents, invitation-based identity.
- **Delegation:** Disabled. All decisions are direct votes.
- **Prediction tracking:** Disabled.
- **Polls:** Disabled (group is small enough for direct conversation).
- **Booklet:** Simplified — proposal and brief arguments only.
- **Governance:** Simple majority, no quorum.
- **Effect:** Pure direct democracy with structured proposals.

### B.2 Technology Cooperative (200 members)

- **Base preset:** Liquid Accountable.
- **Participants:** 200 members, organizational SSO.
- **Delegation:** Enabled, topic-specific, transitive.
- **Topic taxonomy:** Technology, Finance, HR, Strategy.
- **Prediction tracking:** Enabled, mandatory on proposals.
- **Polls:** Enabled, quarterly cadence.
- **Booklet:** Full format with community notes.
- **Governance:** 60% supermajority, 30% quorum.
- **Customization:** Delegate votes visible to delegators only (privacy within a professional community).
- **Effect:** Full liquid democracy with accountability layer and distributed sensing.

### B.3 Municipal Participatory Budgeting

- **Base preset:** Civic Participatory.
- **Participants:** 50,000 residents, verified identity.
- **Delegation:** Enabled, topic-specific, transitive, chain depth capped at 3.
- **Topic taxonomy:** Infrastructure, Education, Parks, Safety, Transit.
- **Prediction tracking:** Required on all proposals.
- **Polls:** Enabled, biannual cadence, administrator-proposed questions with community review.
- **Booklet:** Full format with community notes.
- **Delegation visibility:** Aggregate only (individual edges private).
- **Delegate vote visibility:** Visible to delegators only.
- **Blockchain integrity:** Enabled — vote tallies, prediction commitments, and poll results committed to public chain.
- **AI assistance:** Enabled, dual-provider ensemble for outcome verification.
- **Governance:** Simple majority, 10% quorum.
- **Effect:** Bounded liquid democracy with strong accountability, Swiss-style booklets, distributed fact-checking and sensing, tamper-evident records.

---

## Appendix C: Formal Model

This appendix provides a mathematical specification of the governance model described in Section 5. It uses standard graph theory and set notation for precision and to support future implementation and formal analysis.

### C.1 Participants and Issues

Let $P = \{p_1, p_2, \ldots, p_n\}$ be the set of participants and $I = \{i_1, i_2, \ldots, i_m\}$ the set of issues to be decided. Each issue $i$ belongs to a set of topics $T(i) \subseteq \mathcal{T}$, where $\mathcal{T}$ is a hierarchical topic taxonomy.

### C.2 Delegations

A delegation is a tuple $d = (p_s, p_t, \sigma)$ where:

- $p_s \in P$ is the delegating participant (source),
- $p_t \in P$ is the delegate (target), $p_t \neq p_s$,
- $\sigma \subseteq \mathcal{T}$ is the scope (a set of topics the delegation covers).

Let $D$ be the set of all active delegations. A delegation is *active* for issue $i$ if $T(i) \cap \sigma \neq \emptyset$ — that is, if the issue falls within the delegation's topic scope.

When multiple delegations from the same source are active for the same issue, precedence is resolved by specificity: a delegation scoped to a more specific topic (lower in the hierarchy) overrides one scoped to a more general topic. If two delegations have equal specificity for an issue, the most recently created delegation takes precedence.

### C.3 The Delegation Graph

For a given issue $i$, the active delegations form a directed graph $G_i = (P, E_i)$ where:

$$E_i = \{(p_s, p_t) \mid \exists\, d = (p_s, p_t, \sigma) \in D \text{ such that } T(i) \cap \sigma \neq \emptyset\}$$

Each participant has at most one outgoing edge per issue (the highest-precedence active delegation). The graph $G_i$ is therefore a collection of directed trees (a forest), with delegates at the roots.

### C.4 Vote Resolution

Let $V_i \subseteq P$ be the set of participants who cast a direct vote on issue $i$. The effective voting weight of a participant $p$ on issue $i$ is computed as follows:

**Definition (Override Rule).** A direct vote always overrides a delegation. If $p_s \in V_i$, then the edge $(p_s, p_t) \in E_i$ is removed before weight computation. The participant $p_s$ votes with weight 1, and no downstream delegation carries their vote.

**Definition (Transitive Weight).** After applying the override rule, let $G_i'$ be the resulting graph. The effective weight $w(p, i)$ of participant $p$ on issue $i$ is:

$$w(p, i) = 1 + \sum_{q \in \text{sources}(p, G_i')} w(q, i)$$

where $\text{sources}(p, G_i') = \{q \mid (q, p) \in E_i'\}$ — the set of participants directly delegating to $p$ in the pruned graph.

Equivalently, $w(p, i)$ equals the number of participants in the subtree rooted at $p$ in $G_i'$ (including $p$ itself, if $p$ votes).

**Definition (Non-Participation).** A participant $p$ who neither votes directly nor is reachable from a voting participant through delegations has $w(p, i) = 0$. Their vote is effectively abstained.

### C.5 Delegation Cycles

Transitive delegation introduces the possibility of cycles: $p_1 \to p_2 \to \cdots \to p_k \to p_1$. Cycles must be handled because they create an unresolvable loop of delegation.

Votiverse resolves cycles by treating them as mutual non-delegation for the affected issue. If participants form a cycle and none of them cast a direct vote, all participants in the cycle are treated as abstaining. If any participant in the cycle casts a direct vote, that breaks the cycle from their position, and the remaining chain is resolved normally.

### C.6 Properties

The model satisfies several desirable properties:

1. **Sovereignty.** $\forall p \in P, \forall i \in I$: $p$ can cast a direct vote, which sets $w(p, i) = 1$ independently of any delegation.
2. **One person, one vote.** $\sum_{p \in V_i'} w(p, i) \leq |P|$, where $V_i'$ is the set of participants whose votes are counted. Equality holds when all participants either vote or are reached by a delegation chain ending in a voter.
3. **Monotonicity.** Casting a direct vote never reduces a participant's influence on the outcome.
4. **Revocability.** Any delegation $d \in D$ can be removed at any time $t < t_{\text{close}}$, and the system recomputes all weights.

---

*This document is a living draft. Contributions, critiques, and collaboration are welcome.*

*Votiverse is a project of Proximify Inc. — votiverse.org*
