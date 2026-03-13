# Backgound: Liquid Democracy vs Delegative Democracy 

In contemporary digital-governance discussions, **liquid democracy** usually means a system where each person can either vote directly on an issue or **delegate** their vote to someone else, often with the ability to do that **by topic**, **change it at any time**, and let delegations flow transitively through a network. That is the family of ideas closest to what you described earlier. ([Wikipedia][1])

In political science, **Delegative Democracy** with capital D usually refers to Guillermo O’Donnell’s 1994 concept: a democracy where citizens elect a strong executive and then institutions such as the legislature and judiciary are too weak to effectively constrain that executive. In that usage, “delegative democracy” is mostly a **critique of executive-heavy regimes**, not a proposal for networked vote delegation. ([Journal of Democracy][2])

So these are really **two different concepts**:

1. **Liquid / delegative voting**: a design for decision-making.
2. **O’Donnell’s delegative democracy**: a diagnosis of weak-institution democracies. ([Journal of Democracy][2])

### What liquid democracy is

Liquid democracy tries to combine the strengths of **direct democracy** and **representative democracy**. You do not have to choose one mode forever. On one issue, you vote yourself. On another, you delegate to a person you trust. In many formulations, that delegation can be **issue-specific**, **revocable**, and **overridden by your direct vote whenever you choose**. Some implementations also allow delegations at different levels such as organization-wide, subject-area, or issue-level, with more specific delegations taking precedence. ([Wikipedia][1])

A simple example:

* You vote directly on urban planning.
* You delegate climate policy to a scientist you trust.
* You delegate education to a teacher.
* If a particular education proposal matters deeply to you, you can reclaim that vote and cast it yourself.
  That is the “liquid” part: representation can **flow** and be **reconfigured** instead of being locked into a fixed election cycle. ([Wikipedia][1])

### What exists today

What exists today is mostly **partial implementations**, not full national political systems.

There are established **software platforms** built around these ideas. **LiquidFeedback** is one of the best-known examples; it was designed for political self-organization and participatory decision-making, and it explicitly supports the kind of proxy/delegation logic associated with liquid democracy. ([liquidfeedback.com][3])

There are also civic-tech organizations and platforms using related participatory models in municipalities and public consultation. For example, the Berlin-based organization **Liquid Democracy e.V.** develops participation software such as **Adhocracy**, and EU public-sector materials describe it as being used by the **City of Berlin** and other municipalities and organizations. That is real-world deployment, though usually for consultation and participation processes rather than replacing parliamentary democracy. ([liqd.net][4])

A different area where the model is quite active today is **blockchain and DAO governance**. Research and practice in that space often describe token holders either voting directly or delegating to visible delegates, which is structurally close to liquid democracy. Recent academic work notes that liquid-democracy-style delegation has been adopted in **Delegated Proof of Stake** and related on-chain governance systems with large user bases. ([arXiv][5])

So the practical state of play is:

* **software exists**
* **pilots and organizational use exist**
* **municipal participation tools exist**
* **DAO / blockchain governance uses closely related mechanisms**
* but there is **no major country currently run as a full liquid democracy at national scale**, at least not from the sources I found. ([liquidfeedback.com][3])

### Why people like the idea

The attraction is fairly intuitive. Liquid democracy promises:

* broader participation than classic representative systems,
* less burden than asking everyone to vote on everything,
* a way for **expertise** and **trust networks** to matter without creating a permanent political class,
* and more flexibility than electing someone every few years and hoping they stay aligned. ([Wikipedia][1])

It is especially appealing in domains where issues are numerous and specialized. Your original formulation — delegating by **specific issue or category of issues** — is one of the central reasons people find it compelling. ([arXiv][6])

### Why critics are cautious

The biggest criticism is that the elegant idea can behave badly in practice.

Experimental research has found that delegation can be **overused**, and in some settings liquid-democracy-style delegation performed worse than either ordinary majority voting or even simple abstention. The concern is that people may overestimate who is “better informed,” causing power to cluster too quickly. ([arXiv][7])

Other recurring concerns are:

* concentration of influence in a few visible delegates,
* long delegation chains that become hard to understand,
* strategic behavior,
* low transparency for ordinary participants,
* and the digital-platform problem: the governance layer may become too dependent on software design choices. ([arXiv][7])

### Clean distinction between the two terms

A clean way to remember it:

* **Liquid democracy** = “I can vote myself or temporarily pass my vote to someone I trust, perhaps by topic.”
* **Delegative democracy** in O’Donnell = “citizens delegate broad authority to a leader, and institutions fail to constrain that leader afterward.” ([Wikipedia][1])

That second one is not really about networked delegation at all. It is about **weak accountability after elections**. ([Journal of Democracy][2])

### The version closest to your idea

The model closest to Votiverse may be:

**revocable, topic-specific proxy voting inside a network, with optional transitive delegation.** ([arXiv][6])

That is basically the canonical liquid-democracy vision.

[1]: https://en.wikipedia.org/wiki/Liquid_Democracy?utm_source=chatgpt.com "Liquid democracy - Wikipedia"
[2]: https://www.journalofdemocracy.org/articles/delegative-democracy/?utm_source=chatgpt.com "Delegative Democracy - Journal of Democracy"
[3]: https://liquidfeedback.com/en/?utm_source=chatgpt.com "LiquidFeedback - The Democracy Software"
[4]: https://liqd.net/en/projects/?utm_source=chatgpt.com "Projects | Liquid Democracy - liqd.net"
[5]: https://arxiv.org/pdf/2309.01090?utm_source=chatgpt.com "Liquid Democracy in DPoS Blockchains - arXiv.org"
[6]: https://arxiv.org/html/2506.09789v1?utm_source=chatgpt.com "Delegations as Adaptive Representation Patterns: Rethinking Influence ..."
[7]: https://arxiv.org/abs/2212.09715?utm_source=chatgpt.com "Liquid Democracy. Two Experiments on Delegation in Voting"
