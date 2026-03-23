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

**A governance factory.** Votiverse defines a parameter space of governance primitives — delegation, topic scoping, ballot methods, visibility rules, prediction requirements, surveying — that can be configured to produce any governance model. Named presets (Town Hall, Swiss Model, Liquid Standard, Civic Participatory, and others) provide ready-to-use configurations. An experimental mode exposes the full parameter space for governance innovation.

**Sensing as participation.** Governance should not only ask people to decide — it should ask them to observe. Every participant is a sensor embedded in their local reality. Structured, non-delegable participant surveys capture what people experience and feed that signal back into the system. It is easier to identify a problem than to know how to solve it, and even a fully disengaged participant is a valuable sensor.

**Delegation as backup.** A delegate votes on your behalf only if you don't vote yourself. Delegations are topic-specific, revocable at any time, and transitive. You can always override by voting directly, up to the last second.

**Proposals as models.** Drawing on principles from Bayesian model selection, Votiverse treats proposals as predictive models of reality. Each proposal carries falsifiable predictions about outcomes. After the timeframe elapses, reality is compared to prediction. The model that predicts best deserves the most trust — not the one that narrates most compellingly. Prediction tracking is the regularizer that penalizes overconfident, unfalsifiable claims.

**The digital voting booklet.** Inspired by Switzerland's practice of mailing a physical booklet to every citizen before a vote, every issue comes with structured proposals, arguments, counter-arguments, and predictions. Informed participation is a structural requirement, not an afterthought.

**Governance awareness.** A built-in intelligence layer monitors the delegation network and delivers contextual information at the point of decision — concentration alerts, delegation chain resolution, delegate track records, personal voting history, survey trend lines, and prediction accuracy. Progressive disclosure ensures participants see what matters without being overwhelmed.

**Community notes.** Distributed fact-checking inspired by X/Twitter's community notes system. Participants annotate proposals; the community evaluates the annotations; high-quality notes become visible context in the voting booklet.

**Platform integrity.** Optional blockchain anchoring provides tamper-evident records for critical governance artifacts. Multiple oracle sources (AI-assisted monitoring, trusted data providers, participant surveys, community verification) ensure no single source controls outcome evaluation.

---

## Quick Start

```bash
git clone https://github.com/votiverse/votiverse.git
cd votiverse
pnpm install
pnpm build

# Seed fresh data
cd platform/vcp && pnpm reset       # wipes + seeds VCP
cd platform/backend && pnpm reset   # wipes + seeds backend from VCP

# Terminal 1: Governance server
cd platform/vcp && pnpm dev          # port 3000

# Terminal 2: Client backend
cd platform/backend && pnpm dev      # port 4000

# Terminal 3: Web client
cd platform/web && pnpm dev          # port 5173
```

Open **http://localhost:5173**. Sign in with any seeded user (email: `{slug}@example.com`, password: `password1234`). The dashboard shows pending votes across all your assemblies with nearest deadlines.

### Sample Data

The seed script creates a rich, diverse dataset across 5 organizations and 6 assemblies (each using a different governance preset): 69 participants, 17 voting events in all lifecycle states, 50 issues, 27 delegations with chains, 186 pre-cast votes, 6 surveys, proposals with community notes, and candidacies. Try these cross-assembly participants for the best evaluation experience: **Elena Vasquez** (Greenfield + Maple Heights), **Marcus Chen** (OSC + Municipal + Maple Heights), **Sofia Reyes** (OSC + Youth + Maple Heights).

To reset the database to fresh seed data: `cd platform/vcp && pnpm reset`.

---

## Architecture

Votiverse has four layers:

```
┌───────────────────────────────────────────────────────┐
│  Web Client  (platform/web)                           │
│  React SPA — visual interface for governance          │
└──────────────────────┬────────────────────────────────┘
                       │  HTTP / REST
┌──────────────────────▼────────────────────────────────┐
│  Client Backend  (platform/backend)                   │
│  Auth, identity, content storage, VCP proxy           │
└──────────────────────┬────────────────────────────────┘
                       │  HTTP / REST
┌──────────────────────▼────────────────────────────────┐
│  Governance Cloud Platform  (platform/vcp)            │
│  Governance computation, metadata, event store        │
└──────────────────────┬────────────────────────────────┘
                       │  library import
┌──────────────────────▼────────────────────────────────┐
│  Engine  (packages/*)                                 │
│  13 TypeScript packages — pure governance computation │
└───────────────────────────────────────────────────────┘
```

**Engine** — 13 composable TypeScript packages that implement the governance model. Pure computation: delegation graphs, vote tallying, prediction evaluation, survey aggregation, awareness metrics, content lifecycle. No HTTP, no database, no infrastructure. See [Architecture](docs/architecture.md).

**Governance Cloud Platform (VCP)** — Stores governance metadata and events; performs all governance computation. Holds no PII, no rich content. Serves multiple client backends. See [VCP README](platform/vcp/README.md).

**Client Backend** — Owns user identity (JWT auth), rich content (proposal documents, candidacy profiles, community notes, assets), invitation system with admission control, and proxies governance requests to the VCP. See [Integration Architecture](docs/integration-architecture.md).

**Web Client** — A voter-centric React SPA. Identity-aware dashboard, delegation chain visualization, TipTap proposal editor, community notes with evaluations, onboarding dialog, and notification hub. See [Web Client README](platform/web/README.md).

---

## Engine Packages

| Package | Description |
|---------|-------------|
| `@votiverse/core` | Branded ID types, event definitions, EventStore, Result type, error hierarchy |
| `@votiverse/config` | GovernanceConfig schema, validation, 6 named presets, diffing, derivation |
| `@votiverse/identity` | IdentityProvider interface, InvitationProvider for small groups |
| `@votiverse/delegation` | Delegation graph, scope resolution, weight computation, cycle detection |
| `@votiverse/voting` | 4 ballot methods (SimpleMajority, Supermajority, RankedChoice, Approval), quorum |
| `@votiverse/prediction` | Prediction lifecycle, 6 evaluation patterns, commitment hashing, track records |
| `@votiverse/survey` | Non-delegable surveys, 5 question types, topic-level trend computation |
| `@votiverse/awareness` | Read-only monitoring: concentration alerts, chain resolution, delegate profiles, prompts |
| `@votiverse/content` | Proposals, candidacies, community notes — metadata lifecycle, evaluations, visibility |
| `@votiverse/integrity` | Blockchain-agnostic commitment hashing, anchoring, verification |
| `@votiverse/engine` | Orchestration layer, domain-organized API surface |
| `@votiverse/simulate` | Two-phase rule-based simulation framework |
| `@votiverse/cli` | Command-line interface with JSON state persistence |

---

## For Developers

### Programmatic API

The engine is a headless TypeScript library — no HTTP required:

```typescript
import { createEngine, getPreset, InMemoryEventStore, timestamp } from "@votiverse/engine";
import { InvitationProvider } from "@votiverse/identity";

const store = new InMemoryEventStore();
const provider = new InvitationProvider(store);
const engine = createEngine({
  config: getPreset("LIQUID_STANDARD"),
  eventStore: store,
  identityProvider: provider,
});

// Register participants
const alice = (await provider.invite("Alice")).value;
const bob = (await provider.invite("Bob")).value;
const carol = (await provider.invite("Carol")).value;

// Create a voting event
const now = Date.now();
const event = await engine.events.create({
  title: "Q1 Budget",
  description: "Approve the quarterly budget",
  issues: [{ title: "Approve Budget", description: "", topicIds: [] }],
  eligibleParticipantIds: [alice.id, bob.id, carol.id],
  timeline: {
    deliberationStart: timestamp(now - 86400000),
    votingStart: timestamp(now),
    votingEnd: timestamp(now + 86400000),
  },
});

// Alice delegates to Carol
await engine.delegation.create({
  sourceId: alice.id,
  targetId: carol.id,
  topicScope: [],
});

// Bob and Carol vote
await engine.voting.cast(bob.id, event.issueIds[0], "for");
await engine.voting.cast(carol.id, event.issueIds[0], "against");

// Carol carries Alice's delegation weight — "against" wins 2-1
const tally = await engine.voting.tally(event.issueIds[0]);
console.log(tally.winner);  // "against"
console.log(tally.counts);  // Map { "for" => 1, "against" => 2 }
```

### Simulation

Run governance simulations with configurable agent populations:

```bash
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
"
```

---

## Documents

| Document | Description |
|----------|-------------|
| [Paper I — Whitepaper](docs/papers/paper-i-whitepaper.md) | Governance model, formal properties, prediction tracking, participant surveying, awareness layer |
| [Paper II — Self-Sustaining Governance](docs/papers/paper-ii-self-sustaining-governance.md) | Proposals, delegate candidacies, community notes, surveys as evidence, immutability |
| [Architecture](docs/architecture.md) | Engine internals: 13 packages, dependency graph, event-sourced data model |
| [Integration Architecture](docs/integration-architecture.md) | 3-tier system architecture, VCP/backend boundary, API contract |
| [VCP Architecture](docs/vcp-architecture.md) | VCP internal design: adapter pattern, database schema, workers, scheduler |
| [Content Architecture](docs/design/content-architecture.md) | Proposals, candidacies, community notes — VCP metadata vs. backend content |
| [Product Workflow](docs/product-workflow.md) | How organizations use Votiverse: entity model, workflows, user experience |
| [Research Background](docs/research/background.md) | Liquid democracy and delegative democracy literature |
| [Testing Guide](docs/testing.md) | Seed data, dev clock, unit/integration tests, manual scenarios |
| [Case Studies & Screenshots](https://github.com/votiverse/docs) | Separate repo: narrative walkthroughs with Playwright-captured screenshots from live instances |

---

## Status

Votiverse is a complete, locally runnable governance platform:

- **Engine** — 13 packages, 471 tests, all formal properties verified (sovereignty, one-person-one-vote, monotonicity, revocability, override rule, cycle resolution, scope precedence, survey non-transferability)
- **Cloud Platform (VCP)** — REST API with SQLite/PostgreSQL persistence, 134 integration tests
- **Client Backend** — JWT auth, invitation system with admission control (open/approval/invite-only), email notifications, content storage, VCP proxy — 146 integration tests
- **Web Client** — React 19 with voting, delegations, surveys, predictions, awareness, proposals (TipTap editor), candidacies, community notes, member search, onboarding dialog, bulk invite — 16 tests
- **Config** — 85 tests (presets, validation, derivation, diffing)
- **Total: 800+ tests passing**

The system is fully functional for local development, evaluation, and governance research. PostgreSQL is supported alongside SQLite. Future exploration includes an AI-assisted help layer for participants.

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

**Code** (engine, VCP, web client) is licensed under the 
[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html) 
(AGPL-3.0). You are free to use, modify, and distribute this software, 
including commercially, as long as you make your modifications available 
under the same license — including when running it as a network service.

**Documentation** (whitepaper, architecture documents, papers) is licensed 
under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/) 
(CC BY-SA 4.0).