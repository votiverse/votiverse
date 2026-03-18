# The Composition Thesis: Why Modern Democracy Is a Cocktail, Not a Menu

**On the complementary mechanisms of democratic governance in the smartphone era**

**Diego Macrini**
**March 2026**

---

## Abstract

A previous paper described a configurable governance platform — a parameter space in which direct democracy, liquid democracy, Swiss-style votations, and representative models are all configurations of the same primitives [Macrini 2026a]. A companion paper showed that such a system must be self-sustaining: generating its own evidence, verifying its own claims, and maintaining its own accountability structures through the actions of its participants [Macrini 2026b].

This paper argues that the most important property of a modern governance system is neither any individual mechanism nor its configurability, but the **composition** of mechanisms into a mutually reinforcing whole. Six mechanisms — liquid delegation with candidate scrutiny, Swiss-style structured deliberation, community notes, participant surveys, prediction tracking, and a governance awareness layer — are each well-understood individually. Their composition has not been attempted. We show that these mechanisms are not merely compatible but **complementary**: each one addresses a specific failure mode that the others leave open, and together they create feedback loops that no subset can produce alone.

We further argue that the conventional wisdom — "direct democracy doesn't scale" — rests on outdated priors. Switzerland operates a functioning direct democracy at the scale of a nation using paper booklets mailed to households. The question is not whether direct participation can scale, but what happens when you equip it with 21st-century information infrastructure.

Finally, we propose that a well-composed governance system is not merely a software product but a **learning vehicle** — an instrument for updating our collective understanding of what democratic governance can be. The platform's own mechanisms — surveys, prediction tracking, community notes — apply reflexively to evaluating itself. The responsible path is to deploy where the evidence is clearest and extend carefully as that evidence accumulates.

---

## 1. Introduction

The mechanisms described in this paper are not new. Liquid democracy has been theorized since the 1960s [Miller 1969; Tullock 1967] and implemented in various forms since the early 2000s [Ford 2002]. Swiss-style voting booklets have structured deliberation for over a century. Community notes — crowd-sourced, bridging-evaluated fact-checking — have been deployed at scale on social media platforms. Prediction markets and forecasting tournaments have demonstrated that prediction accuracy can be measured, tracked, and rewarded. Surveys and structured polling are centuries-old tools for capturing observations.

What is new is the claim that these mechanisms, **composed together**, produce something qualitatively different from any of them alone — and that this composition is the core contribution of a modern governance system.

The analogy is a cocktail, not a menu. A menu offers choices: pick the mechanism you want. A cocktail combines ingredients in specific proportions to produce a flavor that none of them has individually. The composition is the thing.

To ground this argument, we will return throughout the paper to the kind of governance problem that most people actually encounter: a housing co-op, a sports club, a faculty committee — small societies where collective and individual stakes are real and often in conflict. Anyone who has sat through a condo board meeting where one faction wants to invest in the building and another faction will never see a return on that investment knows what governance feels like at the human scale. These are the decisions the composition is designed to serve.

This paper develops three arguments. First, the **composition argument**: why these six mechanisms are complementary, what feedback loops they create together, and what breaks when you remove any one of them (Sections 2–4). Second, the **infrastructure shift**: why the scaling constraints under which previous governance systems were designed no longer hold (Section 5). Third, the **learning vehicle**: why the responsible path forward is not to claim the answer is known but to build the instrument for finding out (Section 6).

---

## 2. How the Mechanisms Compose

Consider a housing co-op — 200 units, a volunteer board, and the kind of decisions that make neighbors into adversaries: whether to fund a major repair through a special assessment, how to allocate reserve funds, whether to renovate common areas that benefit some residents more than others. These are governance problems. They involve competing interests, imperfect information, and consequences that play out over years. And they are currently solved by whoever shows up to the meeting.

This section traces how six mechanisms — each well-understood individually — compose into something none of them achieves alone. The argument is not that each mechanism is novel. It is that each one, deployed in isolation, has a characteristic failure mode that only the others can address.

### 2.1 Delegation needs accountability

Liquid delegation solves a real problem. Not every co-op resident can evaluate structural assessments, contractor bids, and financing options. But the alternative — a small board deciding for everyone — discards the preferences of the 190 households not on the board. Topic-specific, revocable delegation [Blum and Zuber 2016; Brill 2018] lets residents who lack expertise on building maintenance delegate to someone they trust on that topic, while voting directly on issues they understand.

The trouble is that delegation without a quality signal degrades into a popularity contest. Residents delegate to the neighbor they chat with, the board member who seems confident, the person who speaks most at meetings. A charismatic resident accumulates delegations without any track record of good judgment. The co-op's existing informal power dynamics are reproduced with more steps.

This is where the composition begins. When delegation is combined with candidate scrutiny — structured profiles subject to community evaluation — a resident choosing a delegate can see that the candidate claims 15 years of property management experience, that this claim has not been disputed by community notes, that the candidate supported two prior capital proposals whose cost predictions proved accurate, and that the awareness layer reports the candidate now carries 17% of the co-op's votes on building topics. This is a qualitatively different delegation decision than "I trust my neighbor."

### 2.2 The booklet needs verification

The Swiss Federal Council's voting booklet is perhaps the most effective mechanism ever designed for informed democratic participation: a structured document presenting the strongest argument for and against each ballot measure, delivered to every household before the vote. In the co-op, this means that instead of chaotic email threads and two-hour meetings dominated by the loudest voices, every resident receives a balanced presentation of the case for and against the special assessment.

But a booklet requires curation — someone must select which arguments to present. In the co-op, that curator is the board president, who may have reasons to favor one option. Without any mechanism to challenge the booklet's claims, it structures the decision but cannot validate its own content.

Community notes solve this. Any resident can attach a note to a proposal — challenging a cost estimate, questioning a timeline, linking to a contractor's actual quote. Other residents evaluate each note, endorsing it as helpful or disputing it as misleading. A note earns prominent visibility only when it is rated helpful across different viewpoints: an annotation endorsed by both supporters and opponents of the proposal is more informative than one that only resonates with one side. This bridging criterion is what distinguishes community notes from a comment section — it surfaces information that informs, not rhetoric that rallies.

Meanwhile, during the deliberation phase, residents endorse or dispute each proposal itself — a simple thumbs-up or thumbs-down that produces a community-generated score. These endorsement scores signal which arguments the community found most compelling, and the booklet uses them to select the featured proposal for each position. If no administrator curates, the system auto-selects the highest-scored proposal per side. If there are no proposals for one side, the booklet simply omits that position rather than fabricating balance. The booklet is now not just structured — it is community-verified, community-scored, and annotated with evidence.

### 2.3 Sensing closes the loop

There is a pattern in co-op governance that will be familiar to anyone who has sat through a board meeting: one side claims "everyone agrees the building is falling apart," the other side claims "it's just a few leaks." Neither has data. Decisions are made on the basis of who sounds more convincing, not on what residents are actually experiencing.

Participant surveys solve this. Conducted on a recurring schedule — quarterly, say — they capture structured observations from residents: how they rate the condition of common areas, whether they feel maintenance has improved or deteriorated, whether the last renovation met their expectations. Individual responses are noisy, but aggregated over time, the signal is clear. A trend line showing satisfaction declining from 3.8 to 2.4 over four quarters speaks for itself in a way that anecdotes at a meeting never can.

But survey data in isolation is descriptive, not actionable. It tells you what residents are experiencing; it does not connect that experience to what was promised. This is where prediction tracking enters. Every proposal in the system carries falsifiable predictions — "this repair will eliminate maintenance costs for five years," "satisfaction will return above 4.0 within a year of completion." After the decision is made, the quarterly surveys test these predictions against lived experience. Community notes link the comparison: "The proposal predicted no maintenance costs for five years; at the two-year mark, the survey data confirms zero unplanned expenditure." Or, less happily: "The proposal predicted completion in six months; actual completion was eleven months."

Over time, the co-op develops institutional memory — not of who spoke loudest, but of whose proposals actually predicted outcomes correctly. Prediction tracking is the regularizer [Macrini 2026a, §7.2]: it is to governance what cross-validation is to statistical inference. It penalizes overconfident promises by checking them against reality, and it rewards careful reasoning by making accuracy visible.

### 2.4 The awareness layer integrates everything

Even with all of the above producing data — proposals with endorsement scores, community notes with evaluation ratings, survey trends, prediction records, delegation graphs — a resident who opens the governance platform faces a wall of information. The awareness layer solves the delivery problem. It surfaces the right information to the right person at the right moment.

When a resident opens the booklet for the building repair vote, the awareness layer inserts context: "You've delegated building maintenance to Maria Chen. Maria supports the full repair. Her prediction track record on capital projects: three of four within range." When delegation concentration reaches a configurable threshold: "Maria now carries 34 delegations on building topics — consider reviewing." When a resident who has been passively delegating receives a notification: "The co-op is voting on a special assessment. Your delegate supports the full repair. The majority of residents rated roof condition as poor in the last survey. The booklet is available."

That single notification — assembled from delegation data, survey results, and booklet status — may be the difference between passive delegation and active engagement. The awareness layer is the integration point. Without the other mechanisms producing data, it has nothing to surface. Without the awareness layer delivering that data contextually, the other mechanisms produce information that sits in a database rather than informing a decision.

---

## 3. Three Feedback Loops

The mechanisms described above are not merely compatible — they form feedback loops that create emergent properties no subset can produce.

**The accountability loop.** Proposals make predictions. Surveys capture observations. Community notes link observations to predictions. The comparison reveals whether predictions held. Delegate track records accumulate. Delegators make better-informed trust decisions. Future proposals face higher scrutiny. This is the loop that transforms governance from opinion-driven to evidence-informed. Remove any link and it breaks: without surveys, predictions have no evidence base; without prediction tracking, surveys generate data that nothing consumes; without community notes, the comparison goes unchallenged; without delegation, track records exist but have no mechanism to translate into better governance over time.

**The deliberation loop.** Issues are raised. Proposals present structured arguments. Community endorsements surface the strongest arguments. The booklet curates the best case per side. Community notes challenge claims within the booklet. Informed decisions are made. Outcomes inform future deliberation. This loop ensures that decision quality improves over time — each deliberation cycle leaves the next one richer, because the prediction tracking and survey infrastructure carry the consequences of past decisions forward into the booklet's historical context.

**The trust loop.** Delegate candidates publish structured profiles. Community notes evaluate their claims. Prediction tracking builds their track records over multiple decisions. The awareness layer surfaces those track records at the moment of delegation. Better delegates attract more delegations — not because they are popular, but because they have demonstrated judgment. Opt-in vote transparency lets delegators verify how their delegate voted. Accountability incentivizes continued quality. This is what makes liquid delegation more than a convenience — it is what makes it better than representative democracy, where the quality signal is electoral (vote them in or out every few years) rather than continuous, granular, and evidence-based.

---

## 4. Why Previous Attempts Fell Short

The composition thesis is partly an answer to a documented pattern of failure in liquid democracy implementations. Understanding what went wrong clarifies what the composition adds.

**LiquidFeedback and the German Pirate Party (2010–2013).** The Pirate Party's adoption of LiquidFeedback [Behrens et al. 2014] was one of the most visible experiments in liquid democracy. Empirical analysis documented predictable problems: low participation (often below 10% of eligible members), concentration of delegations in a small number of super-delegates, and the emergence of an informal power elite that resembled a conventional party structure [Kling et al. 2015]. The platform provided delegation and voting but lacked structured deliberation, prediction tracking, community notes, surveys, or an awareness layer. Delegates accumulated power with no quality signal, no accountability mechanism, and no information infrastructure to help delegators evaluate whether their trust was well-placed.

**Google Votes (2015, internal experiment).** Google tested a liquid democracy system internally on its corporate social network [Hardt and Lopes 2015]. The published analysis found that delegation was convenient but did not improve decision quality. Participants delegated readily but rarely revoked — delegation was treated as a "set and forget" action rather than an ongoing trust relationship. Subsequent analysis of delegation mechanisms confirmed that the system faced inherent trade-offs between respecting delegation preferences, ensuring accountability, and limiting power concentration [Brill et al. 2022; Brubach et al. 2022]. Without contextual prompts, track records, or prediction-based accountability, delegation behaved as critics predicted: it made passivity more comfortable without making governance better.

**The common pattern.** These implementations deployed delegation as an isolated mechanism. They answered the participation problem (not everyone can engage with every decision) without addressing the information problem (how to ensure delegates are accountable, deliberation is structured, and the system learns from its own outcomes). Research on delegation mechanisms has since formalized the trade-offs involved: Brill et al. [2022] showed that delegation rules form a spectrum reflecting an inherent tension between short delegation paths and top-ranked (most-trusted) delegations, while Brubach et al. [2022] demonstrated impossibility results — certain desirable properties of fairness, transparency, and accountability cannot all be simultaneously achieved by any single delegation mechanism.

These are fundamental tensions in any liquid democracy system. The composition thesis does not eliminate them. But it reframes the failures: the delegation mechanism was not wrong — it is a sound answer to the participation problem. What was missing was the surrounding infrastructure that makes delegation accountable: prediction tracking that builds quality signals, surveys that generate evidence, community notes that distribute verification, structured booklets that inform both voters and delegators, and an awareness layer that surfaces all of this at the point of decision. Liquid democracy without accountability infrastructure is a car without brakes — the engine works, but you cannot safely drive it.

---

## 5. Compositional Independence

The feedback loops in Section 3 describe the system at full strength. But real deployments are not textbook scenarios. A 30-member soccer club will have zero delegate candidates. A newly created co-op assembly has no historical survey data. A group in its first month has no prediction track records.

A system that requires all mechanisms at full capacity to produce any value is brittle. Votiverse is designed for the opposite property: **compositional independence** — each mechanism adds value when present but does not create a hard dependency when absent. The base of the system is simple: people vote on issues. Everything else enriches that base.

Consider a new group on day one. Nobody has published a delegate candidacy profile — and that is fine: candidacy mode degrades gracefully to open delegation, where any member can be found via search and delegated to. In a small group where everyone knows everyone, this is the natural state, not a degradation. Similarly, if nobody writes proposals, or if proposals exist only for one side of an issue, the booklet simply omits the empty position rather than fabricating balance. No endorsements? The booklet falls back to submission order. No administrator available to curate? The system auto-selects the highest-endorsed proposal per position. At every level, the system does the best it can with what it has, and what it has is never worse than what existed before the platform.

The same principle applies to the accountability infrastructure. Without survey data, prediction tracking has no internal evidence source — but predictions can still be evaluated against external data, or simply left as a record of what was promised. Without prediction tracking, governance proceeds without institutional memory — which is how every existing democratic system operates. Without community notes, proposals and candidate profiles are presented without distributed verification — the default state of every governance system before community notes existed. Each absent mechanism means a feedback loop that does not close, an enrichment that does not occur. None of them means the system breaks.

This matters because it makes the system deployable from day one and appropriate across a wide range of groups. A book club that needs majority voting on the next read does not need prediction tracking. A municipal participatory budget with 5,000 participants benefits from every mechanism at full strength. Both use the same architecture, configured differently. Over time, as participants publish candidacies, write proposals, endorse arguments, respond to surveys, and attach community notes, the system becomes richer. The feedback loops engage gradually, not all at once.

The question is whether compositional independence holds at all scales. At 30 members, the absence of candidate scrutiny is not a problem — everyone knows everyone. At 5,000, it might create information asymmetries that are exploitable. Whether certain mechanisms become structurally necessary beyond a threshold group size is an open question (see Section 8).

---

## 6. The Infrastructure Shift

### 6.1 The Swiss evidence

The claim that direct democracy cannot scale at the national level has an inconvenient counterexample: Switzerland.

Switzerland's 8.8 million citizens vote on federal ballot measures three to four times per year. Each voting cycle includes multiple measures — constitutional amendments, federal laws, and popular initiatives. Before each vote, the Federal Council produces the *Erläuterungen des Bundesrates*: a structured booklet presenting arguments for and against each measure, mailed to every registered voter. Participation rates typically range from 40% to 55%, varying by the salience of the measures.

This system has functioned for over 170 years. It operates at the scale of a nation — not a city-state, not a canton, but a multilingual federal republic. And it operates with an information infrastructure that is, by modern standards, primitive: printed booklets, postal mail, physical ballot boxes. There is no digital deliberation, no community notes, no prediction tracking, no awareness layer. The booklet is curated by the executive branch with no distributed verification mechanism. Delegate trust networks do not exist — every citizen votes directly or abstains.

The Swiss model is proof of concept for two claims often assumed to be impossible. First, direct participation at the scale of a nation is operationally feasible. Second, structured deliberation materials (the booklet) are sufficient to sustain meaningful participation rates — not universal participation, but far above the threshold where the results are representatively meaningful.

### 6.2 What modern infrastructure adds

If direct democracy functions at national scale with paper booklets, what happens when you add the composition described in this paper?

The booklet becomes interactive, annotated by community notes, and scored by community endorsement — not a static document curated by the executive branch, but a living deliberation artifact verified by the participants themselves. This addresses the Swiss model's most commonly criticized weakness: the Federal Council's editorial control over the booklet's framing.

Delegation becomes available for participants who cannot engage with every measure — and unlike permanent representative delegation, it is topic-specific, revocable, and grounded in candidate scrutiny and track records. Switzerland has no delegation mechanism; if you cannot engage with a ballot measure, your only option is to abstain. The composition adds a middle path between full engagement and absence.

Surveys capture participant experience on a structured cadence, creating an evidence base that the Swiss system lacks entirely. Swiss voters evaluate ballot measures prospectively (will this policy work?) but the system has no structured mechanism for retrospective evaluation (did this policy work?). Prediction tracking, fed by survey data, closes this gap.

The awareness layer delivers contextual intelligence at the point of decision — delegation concentration patterns, delegate track records, historical context from past decisions. The Swiss system delivers a booklet; the composition delivers a booklet embedded in an information ecosystem that connects past decisions to present choices.

None of this requires the Swiss system to be broken. It requires only the observation that the Swiss system succeeds under severe infrastructure constraints, and that relaxing those constraints — by adding digital delivery, distributed verification, delegation with accountability, structured sensing, and institutional memory — should improve outcomes, not degrade them.

### 6.3 Scaling is not a fixed property

The conventional objection to extending direct participation is that human cognition limits engagement: people cannot form informed opinions on dozens of complex issues per year. This is true. Smartphones do not change human cognitive limits.

What smartphones change is the **cost of re-engagement**. In a paper-based system, moving from passive absence to active participation requires finding the booklet, reading it, forming an opinion, and traveling to a polling station. In a smartphone-based system — where the booklet is on your device, annotated with community notes, and the vote is a tap away — the logistical barriers are nearly eliminated. The cognitive challenge remains, but the friction cost drops by an order of magnitude.

This matters because participation is not binary. People oscillate — engaged on issues they care about, passive on the rest. The question is: when attention is triggered — by a topic that touches their life, a delegation alert, a survey result that surprises them — how easily can they move from passive to active? Topic-specific delegation [Macrini 2026a, §3.5] creates virtual communities of interest that reduce cognitive load. The smartphone makes the transition between passive sensor and active voter nearly frictionless.

There is a deeper point. "Scaling" is not a fixed property of a governance model. It is a relationship between the model and the infrastructure on which it operates. Representative democracy scaled better than direct democracy in the 18th century because the infrastructure favored centralized deliberation. The infrastructure has since changed by orders of magnitude. The scaling relationship has changed with it. We do not claim that the new infrastructure makes national-scale direct participation trivially easy. We claim that the prior — formed under 18th-century constraints — needs re-examination with modern tools, not perpetuation by inertia.

---

## 7. The Learning Vehicle

### 7.1 What we don't know

This paper has argued that the composition of known mechanisms creates emergent properties that no subset produces alone, and that the infrastructure shift makes previously impossible configurations practically feasible. Honesty requires acknowledging how much of this remains theoretical.

We do not know whether prediction tracking changes participant behavior at scale or becomes background noise. We do not know whether community notes function in small, homogeneous groups where social pressure suppresses dissent. We do not know whether the accountability loop actually closes in practice or breaks at the weakest human link: the willingness to engage with evidence that contradicts prior beliefs. We do not know whether liquid delegation converges toward super-delegates who function as de facto representatives, reproducing the old system with more complexity — a pattern documented empirically in the German Pirate Party's LiquidFeedback deployment [Kling et al. 2015] and analyzed formally in terms of delegation mechanism trade-offs [Brill et al. 2022; Kahng et al. 2021].

The earlier Votiverse papers raised these as open questions [Macrini 2026a, §3.6; Macrini 2026b, §7]. They remain open.

### 7.2 The platform as instrument

What distinguishes Votiverse from a thought experiment is that it is a **measurement instrument**. The same mechanisms that enable governance also enable the evaluation of governance.

This reflexivity is not accidental. It follows from the self-sustaining thesis developed in [Macrini 2026b]: a governance system that generates its own evidence applies that evidence-generation capability to itself. Concretely:

**Meta-governance surveys.** The same survey infrastructure that asks "How has park maintenance been this quarter?" can ask "How well did the booklet help you understand the issues?" or "Did you feel you had enough information to decide whether to delegate or vote directly?" or "Was the deliberation period long enough?" These are not hypothetical — they are surveys that an assembly can conduct about its own governance process, using the same structured, longitudinal, accountable methodology that it uses for policy questions. Over time, the trend data reveals whether participants feel the system is working, whether engagement is increasing or declining, and which mechanisms are valued versus ignored.

**Prediction tracking applied to governance design.** The Modern Democracy default includes specific parameters: 7 days of deliberation, 2 days of curation, 7 days of voting. These are implicit predictions — "7 days is enough for meaningful deliberation." If survey data consistently shows that participants feel rushed, or that most proposals are submitted in the final 48 hours, the prediction is falsified. The system's own accountability mechanism flags its own configuration choices for revision.

**Community notes on governance decisions.** When an assembly chooses a governance configuration, that choice is itself a claim: "candidacy mode is better for our group than open delegation." Participants can annotate this claim with notes — "Since we enabled candidacy mode, delegate diversity has increased" or "Nobody has published a profile in six months; we should have used open mode." The distributed verification mechanism applies to the system's own design.

**Awareness layer self-reporting.** The awareness layer can report on its own effectiveness: delegation concentration trends over time, participation rate trajectories, survey response rates. If delegation is concentrating despite concentration alerts, the awareness layer's intervention is not working — and the data to identify this failure is produced by the layer itself.

This reflexive capability transforms the platform from a static governance tool into a learning system. Each deployment generates evidence about what works. Across many deployments — different group sizes, different cultural contexts, different governance configurations — the evidence base grows. The open questions in Section 7.1 become empirically addressable, not through controlled experiments (which are difficult in governance), but through structured observation at scale.

### 7.3 Start where the evidence is clearest

The case for composed governance is strongest at the scale of communities and organizations: a housing co-op with 200 units, a soccer club with 80 members, a faculty senate with 50 professors, a neighborhood association with 500 households. At these scales, participants can know each other, decisions are concrete and consequential, outcomes are directly observable, the stakes are manageable, and the composition is clearly superior to the status quo of email threads, chaotic meetings, and unilateral decisions by whoever shows up.

The responsible path is to deploy at these scales, observe outcomes with the system's own instruments, and let evidence accumulate. The extension to municipal scale is not a leap but a gradient — a municipality of 5,000 is not categorically different from a neighborhood of 500. The mechanisms are the same; what changes is that candidate scrutiny substitutes for personal knowledge, the awareness layer's concentration monitoring becomes more critical, and the booklet becomes the difference between engagement and overwhelm.

Whether the gradient extends to the national scale is a question the project does not need to answer today. It is a question the project is designed to eventually answer, through accumulated evidence rather than theoretical argument.

---

## 8. Open Questions

### 8.1 Is the composition optimal?

The six mechanisms were not derived from first principles. They emerged from theoretical analysis and implementation experience. A different composition might perform better. The system's own measurement instruments (Section 7.2) can help answer this over time, but the initial composition is a design choice, not a theorem.

### 8.2 Does compositional independence hold at all scales?

Graceful degradation is clearly true at small scales. At larger scales, the absence of a specific mechanism might create exploitable asymmetries. Whether certain mechanisms become structurally necessary beyond a threshold group size is an open question.

### 8.3 Can the feedback loops be gamed?

Strategic actors could make easy, conservative predictions that are likely to come true rather than ambitious predictions that would actually inform governance. The system would reward caution rather than insight. Whether community notes provide sufficient counterpressure ("this proposal's predictions are trivially easy") is an empirical question.

### 8.4 What is the minimum viable composition?

Compositional independence means the system works with any subset. But is there a minimum subset below which the feedback loops cannot form — where the system is merely a collection of features rather than an integrated whole? Identifying this threshold would help groups understand which mechanisms are essential for their scale.

### 8.5 Does the infrastructure shift actually change behavior?

The fact that infrastructure has changed does not guarantee that human behavior changes with it. People might have smartphones capable of delivering governance booklets and still not read them. The infrastructure shift is necessary but may not be sufficient. Whether lower re-engagement costs plus the sensing mechanism (which extracts value even from disengaged participants) is enough to produce meaningfully better outcomes is the central empirical question.

---

## 9. Conclusion

The mechanisms of modern democracy are known. Liquid delegation, Swiss-style deliberation, community notes, structured sensing, prediction tracking, and governance awareness — each has been theorized, implemented, or deployed in some form. Previous attempts to deploy liquid democracy in isolation failed not because the mechanism was wrong, but because it was incomplete — delegation without accountability infrastructure is a car without brakes.

This paper has argued that the composition is the contribution. The mechanisms are complementary: each addresses a failure mode the others leave open. Together they create feedback loops — accountability, deliberation, trust — that no subset produces alone. The system degrades gracefully when mechanisms are underutilized, making it deployable from day one and increasingly powerful as engagement grows.

The infrastructure to support this composition now exists. Switzerland demonstrates that direct participation functions at national scale with paper booklets and postal mail. The smartphone — a trusted, ubiquitous, always-connected device — changes the cost structure of participation by an order of magnitude. The prior that direct democracy cannot scale was formed under constraints that no longer hold. It may still be correct, but it deserves re-examination rather than repetition.

We close with a reflection on responsibility. When a governance platform recommends a default configuration — liquid delegation with candidate scrutiny, structured booklets, community notes, surveys, and prediction tracking — it is making a normative claim about how groups should govern themselves. This is not a neutral engineering decision. It is the digital equivalent of writing a model constitution: a set of rules that will shape how thousands of small democracies operate. The name "Modern Democracy" is a strong claim. It is earned not by any single mechanism but by their composition — the integration of mechanisms from Swiss direct democracy, liquid democracy, social media verification, prediction markets, and structured sensing into a coherent system designed for the smartphone era. It is the platform's best current understanding of what governance should look like. And like any good model, it is subject to revision when the evidence demands it.

The platform is not a claim that the answer is known. It is an instrument for finding out.

---

## References

Behrens, J., Kistner, A., Nitsche, A., and Swierczek, B. (2014). *The Principles of LiquidFeedback*. Interaktive Demokratie e. V., Berlin.

Blum, C. and Zuber, C. I. (2016). Liquid democracy: Potentials, problems, and perspectives. *Journal of Political Philosophy*, 24(2):162–182.

Brill, M. (2018). Interactive democracy. In *Proceedings of the 17th International Conference on Autonomous Agents and Multiagent Systems (AAMAS)*, pages 1183–1187.

Brill, M., Delemazure, T., George, A.-M., Lackner, M., and Schmidt-Kraepelin, U. (2022). Liquid democracy with ranked delegations. In *Proceedings of the 36th AAAI Conference on Artificial Intelligence (AAAI-22)*, pages 4884–4891.

Brubach, B., Ballarin, A., and Nazeer, H. (2022). Characterizing properties and trade-offs of centralized delegation mechanisms in liquid democracy. In *Proceedings of the 2022 ACM Conference on Fairness, Accountability, and Transparency (FAccT '22)*, pages 1–10.

Ford, B. (2002). Delegative democracy. Unpublished manuscript. Available at: http://www.brynosaurus.com/deleg/deleg.pdf.

Gölz, P., Kahng, A., Mackenzie, S., and Procaccia, A. D. (2018). The fluid mechanics of liquid democracy. In *Proceedings of the 14th International Workshop on Internet and Network Economics (WINE)*, pages 188–202. Springer.

Hardt, S. and Lopes, L. C. R. (2015). Google Votes: A liquid democracy experiment on a corporate social network. Technical report, Technical Disclosure Commons.

Kahng, A., Mackenzie, S., and Procaccia, A. (2021). Liquid democracy: An algorithmic perspective. *Journal of Artificial Intelligence Research*, 70:1223–1252.

Kling, C. C., Kunegis, J., Hartmann, H., Strohmaier, M., and Staab, S. (2015). Voting behaviour and power in online democracy: A study of LiquidFeedback in Germany's Pirate Party. In *Proceedings of the 9th International AAAI Conference on Web and Social Media (ICWSM)*, pages 208–217.

Kotsialou, G. and Riley, L. (2020). Incentivising participation in liquid democracy with breadth-first delegation. In *Proceedings of the 19th International Conference on Autonomous Agents and Multiagent Systems (AAMAS)*, pages 638–644.

Macrini, D. (2026a). Votiverse: A configurable governance platform for democratic decision-making. Working paper, Proximify Inc., Ottawa, Canada.

Macrini, D. (2026b). Governance as a self-sustaining system: Theoretical extensions from the Votiverse implementation. Working paper, Proximify Inc., Ottawa, Canada.

Miller, J. C. (1969). A program for direct and proxy voting in the legislative process. *Public Choice*, 7(1):107–113.

Paulin, A. (2020). An overview of ten years of liquid democracy research. In *Proceedings of the 21st Annual International Conference on Digital Government Research (DGO)*, pages 116–121. ACM.

Tullock, G. (1967). *Towards a Mathematics of Politics*. University of Michigan Press.

---

*This paper is a living document. It will be revised as deployment experience accumulates and as the open questions are addressed through observation and evidence.*

*Votiverse is an open-source project — [github.com/votiverse/votiverse](https://github.com/votiverse/votiverse) — by Proximify Inc. (Ottawa, Canada).*
