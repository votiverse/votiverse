# Votiverse Cloud Platform — Service Architecture

**API and Integration Design — v0.1 Draft**

---

## 1. Overview

The Votiverse Cloud Platform (VCP) is a **governance-as-a-service** backend. It provides a REST API for creating and operating democratic governance systems — Assemblies — with configurable delegation, voting, prediction tracking, participant polling, and governance awareness.

The VCP is **open source**, like the engine it imports. Anyone can run their own VCP. Proximify operates one for its own customers, but it is not the only option. An organization with data sovereignty requirements, regulatory constraints, or a preference for self-hosting can run their own VCP on their own infrastructure.

The VCP is also **client-agnostic**. It does not know or care what kind of application is calling its API. A client might be a web application, a mobile app, a CLI tool, a Slack bot, an enterprise integration, or anything else that can make HTTP requests and receive webhooks. The contract is the API. The VCP authenticates clients, not end users.

**Each client connects to exactly one VCP.** This is a configuration setting — the VCP endpoint URL. There can be many VCPs in the world, operated by different parties.

### Architecture Layers

The Votiverse system has three layers:

- **@votiverse/engine** — the open-source governance library (12 npm packages). Pure computation: delegation graphs, vote tallying, prediction evaluation, poll aggregation, awareness metrics. No HTTP, no scheduling, no infrastructure.
- **Votiverse Cloud Platform (VCP)** — the open-source operational service that imports the engine library and wraps it in production infrastructure: an HTTP API, scheduled jobs, asynchronous workers, webhook dispatch, AI-assisted outcome gathering, database management, and blockchain anchoring. Runs as a single Node.js process.
- **Client applications** — any application that consumes the VCP API. Proximify's Uniweb-based web application at votiverse.org is one such client. Others may exist.

### Deployment Model

```
votiverse.org (Uniweb)  ──────→  Proximify's VCP
vote.university.edu (Uniweb) ──→  Proximify's VCP   (or University's own VCP)
participate.city.gov (Uniweb) ─→  City's own VCP
internal.coop.org (Uniweb) ────→  Coop's own VCP    (Proximify-managed)
custom-app.example.com  ───────→  Any VCP
```

**Proximify's VCP** serves the global votiverse.org and any managed white-label instances. This is the default, turnkey option.

**Third-party VCPs** can be operated by any organization. Proximify can offer to manage third-party VCPs as a service, or the organization runs it themselves.

Each VCP is multi-tenant, with **Assemblies as the isolation boundary**. A single VCP can serve multiple clients. Assemblies from different Organizations on different clients share the VCP infrastructure but have no data visibility into each other.

For the VCP's internal design — module structure, adapter pattern, database schema, worker architecture, and AWS deployment — see the [VCP Architecture Document](vcp-architecture.md).

This document focuses on the **API contract** and the **integration boundary**: what the VCP provides, what clients are responsible for, and how they communicate.

It complements:
- The [whitepaper](whitepaper.md) — the governance model.
- The [architecture document](architecture.md) — the engine internals (packages, data model, algorithms).
- The [VCP architecture](vcp-architecture.md) — the Cloud Platform's internal design and deployment.
- The [product workflow](product-workflow.md) — the user-facing experience.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                         │
│                                                         │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│   │  Web app     │ │  Mobile app  │ │  CLI / bot / │    │
│   │  (any        │ │  (any        │ │  enterprise  │    │
│   │   framework) │ │   platform)  │ │  integration │    │
│   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘    │
│          │                │                │            │
└──────────┼────────────────┼────────────────┼────────────┘
           │                │                │
  ════════════════  HTTP API + Webhooks  ════════════════
           │                │                │
┌──────────┼────────────────┼────────────────┼────────────┐
│          ▼                ▼                ▼            │
│         Votiverse Cloud Platform (VCP)                  │
│         Single Node.js process · Open source            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   HTTP API   │  │  Scheduler   │  │   Workers    │   │
│  │   (REST)     │  │ (in-process) │  │ (in-process) │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                  │          │
│  ┌──────▼─────────────────▼──────────────────▼───────┐  │
│  │         @votiverse/engine (imported library)      │  │
│  │  delegation · voting · prediction · polling       │  │
│  │  awareness · integrity · config · identity        │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │          Database (SQLite or PostgreSQL)          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Webhook     │  │  Blockchain  │  │  AI Outcome  │   │
│  │  Dispatcher  │  │  Anchor      │  │  Gathering   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. What the VCP Provides

### 3.1 Governance computation
Everything the engine library provides: configurable governance presets, delegation graph resolution with transitive weight computation, vote tallying with multiple ballot methods, prediction lifecycle and accuracy evaluation, poll aggregation and topic-level trend computation, awareness metrics and alerts.

### 3.2 Persistent state
An append-only event store that records all governance events. Current state (delegation graphs, tallies, prediction evaluations, poll trends) is derived from events and kept up to date. The event store is the governance audit trail — blockchain-anchorable and portable.

### 3.3 Autonomous processes
The VCP operates independently of client requests:

- **Poll cadence management.** Opens and closes polls according to each Assembly's configured schedule.
- **Prediction timeframe monitoring.** Detects when prediction evaluation windows arrive and triggers outcome data gathering.
- **AI-assisted outcome gathering.** Queries AI providers for evidence that confirms or contradicts predictions.
- **Trend recomputation.** Periodically recomputes poll trend lines and awareness metrics.
- **Integrity commitment batching.** Periodically anchors governance events to blockchain.
- **Reminder generation.** Generates reminders for upcoming votes, open polls, and expiring deliberation periods.
- **Anomaly detection.** Monitors delegation patterns for concentration spikes, harvesting behavior, and other awareness triggers.

### 3.4 Webhook notifications
The VCP pushes events to registered client endpoints:

- Reminders (voting event opening, poll available, deliberation closing)
- Awareness alerts (concentration threshold exceeded, delegation chain changed)
- Engagement prompts (close vote, prediction mismatch, delegate behavior anomaly)
- Prediction evaluation results
- Poll results available

The VCP does not deliver notifications to end users. It delivers events to client applications. How the client notifies the user (email, push, in-app, SMS) is the client's responsibility.

---

## 4. What Clients Are Responsible For

The VCP handles governance computation. Everything else is the client's concern:

### 4.1 User identity and authentication
The VCP does not authenticate end users. Clients authenticate users through their own systems (passwords, SSO, OAuth, biometrics, whatever their context requires). When calling the VCP API, clients pass opaque `ParticipantId` values. The VCP trusts that the client has verified the user's identity according to the Assembly's requirements. The VCP holds no personally identifiable information.

### 4.2 User interface
All user-facing presentation — dashboards, booklet displays, delegation chain visualizations, poll response forms, trend charts, track record displays — is built by the client. The VCP provides data through API responses; how it's rendered is entirely up to the client.

### 4.3 Content management
Proposals, booklets, and arguments may contain rich content — formatted text, media, attachments. The VCP stores only the structured governance data it needs to compute (prediction claims, poll questions, issue identifiers, vote choices). Rich content management is the client's domain.

### 4.4 Access control
Who can create Assemblies, who can manage participants, who can submit proposals — these are access control decisions. The VCP trusts that the client has authorized the action before the API request arrives. The VCP enforces governance rules (non-delegable polls, override rule, quorum requirements) but not organizational RBAC.

### 4.5 Communication delivery
When the VCP emits a webhook event, the client receives it and decides how to deliver it to the user — or whether to deliver it at all.

---

## 5. API

### 5.1 Authentication

Every API request must include a valid API key in the `Authorization` header:

```
Authorization: Bearer vcp_key_xxxxxxxxxxxxxxxxxx
```

API keys are issued when a client registers with the VCP. Each key is associated with:
- a client identity,
- a set of Assemblies the client has access to,
- a usage tier that determines rate limits and feature access.

A request to an Assembly the client doesn't have access to returns `403 Forbidden`.

### 5.2 REST Endpoints

All governance endpoints are scoped to an Assembly. The Assembly ID appears in the URL path.

**Assembly management:**

```
POST   /assemblies                          # register a new assembly
GET    /assemblies/:id                      # get assembly state and config
```

**Participants:**

```
POST   /assemblies/:id/participants         # add participant
DELETE /assemblies/:id/participants/:pid    # remove participant
GET    /assemblies/:id/participants         # list participants
```

**Voting events:**

```
POST   /assemblies/:id/events              # create voting event
GET    /assemblies/:id/events              # list events
GET    /assemblies/:id/events/:eid         # get event status
```

**Delegations:**

```
POST   /assemblies/:id/delegations         # create delegation
DELETE /assemblies/:id/delegations/:did    # revoke delegation
GET    /assemblies/:id/delegations         # list delegations for participant
GET    /assemblies/:id/delegations/chain   # resolve full delegation chain
```

**Voting:**

```
POST   /assemblies/:id/votes               # cast vote
GET    /assemblies/:id/events/:eid/tally   # get tally results
GET    /assemblies/:id/events/:eid/weights # get weight distribution
```

**Predictions:**

```
POST   /assemblies/:id/predictions            # commit prediction
GET    /assemblies/:id/predictions/:pid       # get prediction state
POST   /assemblies/:id/outcomes               # record outcome data
GET    /assemblies/:id/predictions/:pid/eval  # evaluate prediction
GET    /assemblies/:id/track-record/:pid      # participant's prediction track record
```

**Polls:**

```
POST   /assemblies/:id/polls               # create poll
GET    /assemblies/:id/polls/:pid          # get poll state
POST   /assemblies/:id/polls/:pid/respond  # submit poll response
GET    /assemblies/:id/polls/:pid/results  # get poll results
GET    /assemblies/:id/trends/:topic       # get topic trend data
```

**Awareness:**

```
GET    /assemblies/:id/awareness/concentration  # concentration metrics
GET    /assemblies/:id/awareness/history/:pid   # personal voting history
GET    /assemblies/:id/awareness/profile/:pid   # delegate profile and track record
GET    /assemblies/:id/awareness/context/:eid   # historical context for an issue
GET    /assemblies/:id/awareness/prompts/:pid   # engagement prompts for participant
```

**Integrity:**

```
POST   /assemblies/:id/integrity/commit        # anchor artifacts to blockchain
GET    /assemblies/:id/integrity/verify/:cid   # verify a commitment
```

**Webhooks:**

```
POST   /webhooks       # register webhook endpoint
GET    /webhooks       # list registered webhooks
DELETE /webhooks/:id   # unregister webhook
```

**System:**

```
GET    /health   # health check
```

### 5.3 Request and Response Format

All requests and responses use JSON. Content type: `application/json`.

**Successful responses** return the appropriate HTTP status code (200, 201, 204) with a JSON body where applicable.

**Error responses** return a JSON body with a consistent structure:

```json
{
  "error": {
    "code": "VOTING_CLOSED",
    "message": "Voting on this issue has closed.",
    "details": {
      "issueId": "iss_123",
      "closedAt": "2026-03-14T18:00:00Z"
    }
  }
}
```

Error codes are stable identifiers that clients can programmatically handle. Messages are human-readable and may change.

### 5.4 Request Lifecycle

A typical write request (e.g., casting a vote):

1. Client sends `POST /assemblies/:id/votes` with API key and payload.
2. VCP authenticates the client and validates the request payload.
3. VCP loads the Assembly's governance configuration.
4. VCP calls the engine: `engine.voting.cast({ participantId, issueId, choice })`.
5. Engine validates governance rules (is voting open? is participant eligible? does this override a delegation?), appends a `VoteCast` event to the event store, and returns a result.
6. VCP enqueues async tasks triggered by the event (awareness recomputation, webhook notifications) to the in-process worker queue.
7. VCP returns `200 OK` to the client.

A typical read request (e.g., fetching a tally):

1. Client sends `GET /assemblies/:id/events/:eid/tally` with API key.
2. VCP authenticates the client.
3. VCP queries the materialized tally view from the database.
4. VCP returns the tally result.

### 5.5 Webhook Delivery

When a governance event occurs that a client has subscribed to, the VCP delivers a webhook:

```json
{
  "id": "whk_abc123",
  "type": "vote.cast",
  "assemblyId": "asm_xyz",
  "timestamp": "2026-03-14T18:30:00Z",
  "data": {
    "participantId": "p_456",
    "issueId": "iss_789"
  }
}
```

Each delivery includes an `X-Votiverse-Signature` header — HMAC-SHA256 of the payload body using the webhook's shared secret. Clients should verify the signature to ensure authenticity.

Delivery guarantees:
- **At-least-once.** A webhook may be delivered more than once. Clients must handle idempotent processing.
- **No ordering guarantee.** Webhooks may arrive out of order relative to the events that triggered them.
- **Retry with backoff.** Failed deliveries are retried with exponential backoff. After repeated failures, the subscription is marked degraded and an alert is generated.

---

## 6. Multi-Tenancy

The VCP is inherently multi-tenant. All clients, all Organizations, and all Assemblies share a single VCP deployment. The isolation boundary is the **Assembly**.

Tenancy guarantees:

- An Assembly's event store, delegation graph, predictions, poll data, and awareness metrics are invisible to other Assemblies.
- API requests are scoped to an Assembly ID. No API call can access data across Assemblies.
- Webhook subscriptions are per-client, per-Assembly. A client receives events only for Assemblies it has access to.
- The engine library processes each request in the context of a single Assembly. There is no cross-Assembly computation.

Different clients may manage different Assemblies on the same VCP. Client A's Assemblies are invisible to Client B, and vice versa.

---

## 7. Uniweb Integration (Proximify-Specific)

This section describes how Proximify's own Uniweb-based web application integrates with the VCP. This is one specific client implementation — not a requirement for other clients.

### 7.1 Uniweb as a VCP client

The Uniweb instance at votiverse.org (and any managed white-label instances) is a VCP client. It authenticates with an API key, makes REST requests, and receives webhooks — exactly like any other client.

Uniweb adds the application layer that the VCP doesn't provide: user authentication, UI rendering, content management, RBAC, and organizational structure.

### 7.2 Entity mapping

Uniweb's data model maps to the VCP's domain types:

| Uniweb Concept | VCP Concept | Notes |
|---|---|---|
| Hierarchical unit | Organization | Uniweb handles hierarchy; VCP sees flat org. |
| Unit with Assembly entity type | Assembly | Assembly config stored in VCP. Content in Uniweb. |
| Member entity/profile | ParticipantId | VCP receives an opaque ID. Uniweb owns the profile. |
| Entity with proposal schema | Proposal + PredictionClaim | Uniweb stores rich content. VCP stores structured governance data. |
| Entity with booklet schema | VotingEvent + Issues | Uniweb renders the booklet. VCP manages the lifecycle. |
| Entity with poll schema | Poll + Questions | Uniweb renders the form. VCP stores responses and computes trends. |
| RBAC roles | Organization/Assembly roles | Uniweb enforces access. VCP trusts the authorization. |
| Entity views (profile, CV, etc.) | Not mapped | VCP doesn't need Uniweb's view system. |

### 7.3 Data ownership boundary

The VCP stores the minimum governance data it needs to compute: prediction claims, poll questions and responses, vote choices, delegation relationships, issue identifiers. Everything else — display names, formatted text, media, organizational structure — lives in Uniweb and is not duplicated in the VCP.

The VCP is authoritative for governance state (tallies, delegation weights, prediction evaluations). Uniweb is authoritative for content (proposal text, booklet formatting, user profiles).

### 7.4 Managed white-label instances

Proximify may deploy additional managed Uniweb instances for organizations that want their own branded experience (vote.university.edu, participate.city.gov). Each managed instance connects to a VCP as a separate client with its own API key. By default, managed instances connect to Proximify's VCP. Organizations that require data sovereignty can have their Uniweb instance pointed at their own VCP — either self-operated or Proximify-managed on the organization's infrastructure.

---

## 8. Open Questions

### 8.1 Event store isolation
Should Assemblies from different clients share a single database, or should high-security clients receive isolated storage? For launch, a single database with Assembly-scoped queries is sufficient. Schema-level or database-level isolation can be offered as a premium tier if regulatory requirements demand it.

### 8.2 Client state vs. VCP state
A proposal's rich content lives in the client. The structured prediction claims live in the VCP. If these go out of sync, the VCP is authoritative for governance state and the client is authoritative for content. The practical rule: the VCP stores only what it needs to compute. Everything else stays in the client.

### 8.3 Offline resilience
If the VCP is temporarily unavailable, client applications should fail-fast with a clear error message ("governance service temporarily unavailable") rather than queuing commands. Queuing introduces consistency risks that are unacceptable for governance operations.

### 8.4 Webhook reliability
At-least-once delivery with exponential backoff. After repeated failures, subscriptions are marked degraded and an alert is generated. Clients must implement idempotent event processing.

### 8.5 API versioning
As the VCP evolves, the API will need versioning. URL-prefix versioning (`/v1/assemblies/...`) is the simplest and most explicit approach. Breaking changes require a new version. Non-breaking additions (new fields, new endpoints) are added to the current version.

---

*This document is a living draft and will evolve as the VCP moves from development to production.*
