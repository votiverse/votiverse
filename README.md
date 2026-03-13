# Votiverse

### Decisions, Democratically Delivered

**[votiverse.org](https://votiverse.org)**

---

## Why This Exists

Democracy is a technology. Like all technologies, it can be improved.

The systems we have inherited suffer from two failures. The **participation problem**: direct democracy doesn't scale, and representative democracy discards almost everything voters actually think. The **information problem**: existing systems don't close the loop between decisions and outcomes. Politicians make promises, policies are implemented, and there is no structured record connecting the original predictions to what actually happened. Political discourse collapses into narrative about personalities rather than evaluation of governance quality.

**Votiverse** addresses both. It is a configurable governance engine — a factory for democratic decision-making systems — where organizations define their own governance model from a space of composable primitives. Participants can vote directly, delegate by topic, or operate under any hybrid arrangement. But more fundamentally, Votiverse is an **information infrastructure** that records proposals, predictions, and outcomes; asks participants to report what they observe in their daily lives; identifies who predicts well and who doesn't; and feeds all of this back into the system at the point of decision.

In this model, traditional representative democracy is not the default. It is a degenerate edge case: the configuration you get when delegation is forced, universal, non-specific, and irrevocable for a fixed term.

---

## Core Concepts

**A governance factory.** Votiverse defines a parameter space of governance primitives — delegation, topic scoping, ballot methods, visibility rules, prediction requirements, polling — that can be configured to produce any governance model. Named presets (Town Hall, Swiss Model, Liquid Standard, Civic Participatory, and others) provide ready-to-use configurations. An experimental mode exposes the full parameter space for governance innovation.

**Sensing as participation.** Governance should not only ask people to decide — it should ask them to observe. Every participant is a sensor embedded in their local reality. Structured, non-delegable participant polls capture what people experience and feed that signal back into the system. It is easier to identify a problem than to know how to solve it, and even a fully disengaged participant is a valuable sensor.

**Delegation as backup.** A delegate votes on your behalf only if you don't vote yourself. Delegations are topic-specific, revocable at any time, and transitive. You can always override by voting directly, up to the last second.

**Proposals as models.** Drawing on principles from Bayesian model selection, Votiverse treats proposals as predictive models of reality. Each proposal carries falsifiable predictions about outcomes. After the timeframe elapses, reality is compared to prediction. The model that predicts best deserves the most trust — not the one that narrates most compellingly. Prediction tracking is the regularizer that penalizes overconfident, unfalsifiable claims.

**The digital voting booklet.** Inspired by Switzerland's practice of mailing a physical booklet to every citizen before a vote, every issue comes with structured proposals, arguments, counter-arguments, and predictions. Informed participation is a structural requirement, not an afterthought.

**Governance awareness.** A built-in intelligence layer monitors the delegation network and delivers contextual information at the point of decision — concentration alerts, delegation chain resolution, delegate track records, personal voting history, poll trend lines, and prediction accuracy. Progressive disclosure ensures participants see what matters without being overwhelmed.

**Community notes.** Distributed fact-checking inspired by X/Twitter's community notes system. Participants annotate proposals; the community evaluates the annotations; high-quality notes become visible context in the voting booklet.

**Platform integrity.** Optional blockchain anchoring provides tamper-evident records for critical governance artifacts. Multiple oracle sources (AI-assisted monitoring, trusted data providers, participant polls, community verification) ensure no single source controls outcome evaluation.

---

## Architecture

Votiverse is implemented as a **headless TypeScript monorepo** — a set of composable packages published under the `@votiverse` npm scope. The engine has no opinion about presentation. It exposes a programmatic API that any client can drive.

The CLI operates in four modes: local simulation (in-memory, no auth), local persistent (SQLite), authenticated client to a remote engine (browser-based OAuth), and self-hosted server.

An AI-driven simulation framework enables stress-testing governance configurations with rule-based and LLM-driven agents at any scale.

See the [Architecture Document](docs/architecture.md) for full details.

---

## Documents

| Document | Description |
|----------|-------------|
| [Whitepaper](docs/whitepaper.md) | Foundational document. Governance model, formal properties, the scale problem, prediction tracking, participant polling, awareness layer, risks and mitigations, platform architecture. |
| [Architecture](docs/architecture.md) | Technical architecture. 12 packages, dependency graph, event-sourced data model, API design, CLI modes, simulation framework, research pipeline, development phases. |
| [Liquid Democracy Research](docs/research/liquid-democracy.md) | Background research on liquid democracy, delegative democracy, and existing implementations. |

---

## Status

Votiverse is entering **Phase 1: Foundation** — implementing the core governance engine (types, configuration, delegation, voting). The whitepaper and architecture document are living drafts that will evolve alongside the implementation.

---

## Get Involved

Votiverse is an open project. Contributions are welcome at every level:

- **Read the whitepaper** and open an issue with questions, critiques, or suggestions.
- **Propose extensions** to the governance model — new primitives, new configurations, new accountability mechanisms.
- **Challenge the assumptions** — the best way to strengthen the design is to find where it breaks.
- **Run simulations** (once the framework is built) and publish findings.
- **Share the project** with people who care about how groups make decisions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Origin

Votiverse was started by **Diego Serrano** (Montreal, Canada) as an attempt to build what has been missing from collective decision-making: a system where participation is flexible, delegation is transparent, sensing is valued, prediction is accountable, and the information infrastructure is honest.

The project builds on the **Uniweb Platform** developed by [Proximify Inc.](https://proximify.com)

---

## License

This work is licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit and distribute contributions under the same license.
