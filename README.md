# Votiverse

### Decisions, Democratically Delivered

**[votiverse.org](https://votiverse.org)** (coming soon)

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

## Quick Start

```bash
# Install
git clone https://github.com/votiverse/votiverse.git
cd votiverse
pnpm install
pnpm build

# Run a simulation
node -e "
import { runSimulation } from '@votiverse/simulate';
const result = await runSimulation({
  name: 'Quick test', description: '', seed: 42,
  config: 'LIQUID_STANDARD',
  topics: [{ name: 'Finance' }],
  population: {
    count: 20,
    engagementDistribution: { 'active-deliberator': 0.4, 'selective-engager': 0.3, 'pure-delegator': 0.2, 'pure-sensor': 0.1 },
    forecastingDistribution: { good: 0.3, average: 0.4, poor: 0.3 },
    adversarialFraction: 0
  },
  votingEvents: [{ title: 'Budget', issues: [{ title: 'Q1 Budget', topics: ['Finance'], groundTruthOutcome: true }] }],
  groundTruth: { topics: { Finance: { baseValue: 100, trajectory: 'improving', changeRate: 10 } } }
});
console.log('Agents:', result.results.agentCount);
console.log('Concentration:', result.results.concentrationOverTime);
console.log('Prediction accuracy:', result.results.predictionAccuracies.slice(0, 5));
"
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@votiverse/core` | Branded ID types, event definitions, EventStore, Result type, error hierarchy |
| `@votiverse/config` | GovernanceConfig schema, validation, 6 named presets, diffing, derivation |
| `@votiverse/identity` | IdentityProvider interface, InvitationProvider for small groups |
| `@votiverse/delegation` | Delegation graph, scope resolution, weight computation, cycle detection |
| `@votiverse/voting` | 4 ballot methods (SimpleMajority, Supermajority, RankedChoice, Approval), quorum |
| `@votiverse/prediction` | Prediction lifecycle, 6 evaluation patterns, commitment hashing, track records |
| `@votiverse/polling` | Non-delegable polls, 5 question types, topic-level trend computation |
| `@votiverse/awareness` | Read-only monitoring: concentration alerts, chain resolution, delegate profiles, prompts |
| `@votiverse/integrity` | Blockchain-agnostic commitment hashing, anchoring, verification |
| `@votiverse/engine` | Orchestration layer, domain-organized API surface |
| `@votiverse/simulate` | Two-phase rule-based simulation framework |
| `@votiverse/cli` | Command-line interface with JSON state persistence |

---

## Architecture

Votiverse is implemented as a **headless TypeScript monorepo** — 12 composable packages published under the `@votiverse` npm scope. The engine has no opinion about presentation. It exposes a programmatic API that any client can drive.

See the [Architecture Document](docs/architecture.md) for full details, including the implemented API, the decisions log, and open technical questions.

---

## Documents

| Document | Description |
|----------|-------------|
| [Whitepaper](docs/whitepaper.md) | Governance model, formal properties, prediction tracking, participant polling, awareness layer. |
| [Architecture](docs/architecture.md) | 12 packages, dependency graph, event-sourced data model, API design, decisions log. |
| [Phase 2 Report](docs/phase2-report.md) | Prediction and polling implementation decisions. |
| [Phase 3 Report](docs/phase3-report.md) | Awareness layer implementation and integration review. |
| [Phase 4 Report](docs/phase4-report.md) | Simulation framework design and testing. |
| [Phase 5 Report](docs/phase5-report.md) | Integrity package and blockchain anchoring. |
| [Phase 6 Report](docs/phase6-report.md) | Production hardening: documentation, tooling, code quality. |
| [Research Background](docs/research/background.md) | Liquid democracy and delegative democracy literature. |

---

## Status

Votiverse has completed **Phases 1–6** — all 12 packages are implemented with **319 tests passing**. The governance engine is functional for local simulation and development. Production deployment requires PostgreSQL storage adapter and performance profiling (future work).

---

## Get Involved

Votiverse is an open project. Contributions are welcome:

- **Read the whitepaper** and open an issue with questions or critiques.
- **Run simulations** against different governance presets and report findings.
- **Challenge the assumptions** — the best way to strengthen the design is to find where it breaks.
- **Propose extensions** to the governance model.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Origin

Votiverse was started by **Diego Macrini** (Ottawa, Canada) as an attempt to build what has been missing from collective decision-making: a system where participation is flexible, delegation is transparent, sensing is valued, prediction is accountable, and the information infrastructure is honest.

---

## License

This work is licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit and distribute contributions under the same license.
