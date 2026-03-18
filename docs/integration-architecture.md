# Votiverse Cloud Platform — Service Architecture

**API and Integration Design — v0.2**

---

## 1. Overview

The Votiverse Cloud Platform (VCP) is a **governance-as-a-service** backend. It provides a REST API for creating and operating democratic governance systems — Assemblies — with configurable delegation, voting, prediction tracking, participant polling, and governance awareness.

The VCP is **open source**, like the engine it imports. Anyone can run their own VCP. Proximify operates one for its own customers, but it is not the only option. An organization with data sovereignty requirements, regulatory constraints, or a preference for self-hosting can run their own VCP on their own infrastructure.

The VCP is **client-agnostic**. It does not know or care what kind of application is calling its API. The contract is the API. The VCP authenticates backend clients via API keys and trusts the participant identity they inject — it never authenticates end users directly.

**Each client backend connects to exactly one VCP.** This is a configuration setting — the VCP endpoint URL. There can be many VCPs in the world, operated by different parties.

**Web and native clients never talk to the VCP directly.** A client backend sits between end-user applications and the VCP. The client backend owns user authentication (JWT), maps authenticated users to VCP participant identifiers, and proxies governance requests to the VCP with the appropriate identity headers injected.

### Architecture Layers

The Votiverse system has three layers:

- **@votiverse/engine** — the open-source governance library (12 npm packages). Pure computation: delegation graphs, vote tallying, prediction evaluation, poll aggregation, awareness metrics. No HTTP, no scheduling, no infrastructure.
- **Votiverse Cloud Platform (VCP)** — the open-source operational service that imports the engine library and wraps it in production infrastructure: an HTTP API, scheduled jobs, asynchronous workers, webhook dispatch, AI-assisted outcome gathering, database management, and blockchain anchoring. Runs as a single Node.js process. Consumed by client backends, not directly by end-user applications.
- **Client backends** — server-side applications that authenticate end users, manage user accounts, and proxy governance requests to the VCP. The client backend is the trust boundary between end users and the governance system.
- **Client applications** — web apps, native apps (Tauri), mobile apps, CLI tools, or any end-user-facing application. These communicate exclusively with their client backend, never with the VCP directly.

### Deployment Model

```
Web/Tauri Client ──→ Client Backend (port 4000) ──→ VCP (port 3000)
   (browser)           (JWT auth, user mgmt,         (governance engine,
                        proxy + identity injection)    event store, workers)
```

Concrete deployment examples:

```
votiverse.org (web)  ──→  Proximify backend ──→  Proximify's VCP
vote.university.edu  ──→  University backend ──→  Proximify's VCP  (or University's own VCP)
participate.city.gov ──→  City backend ──────→  City's own VCP
internal.coop.org    ──→  Coop backend ──────→  Coop's own VCP   (Proximify-managed)
custom-app.example   ──→  Custom backend ────→  Any VCP
```

**Proximify's VCP** serves the global votiverse.org and any managed white-label instances. This is the default, turnkey option.

**Third-party VCPs** can be operated by any organization. Proximify can offer to manage third-party VCPs as a service, or the organization runs it themselves.

Each VCP is multi-tenant, with **Assemblies as the isolation boundary**. A single VCP can serve multiple clients. Assemblies from different Organizations on different clients share the VCP infrastructure but have no data visibility into each other.

For the VCP's internal design — module structure, adapter pattern, database schema, worker architecture, and AWS deployment — see the [VCP Architecture Document](vcp-architecture.md).

This document focuses on the **API contract** and the **integration boundary**: what the VCP provides, what clients are responsible for, and how they communicate.

It complements:
- The [whitepaper](papers/paper-i-whitepaper.md) — the governance model (Paper I).
- [Paper II](papers/paper-ii-self-sustaining-governance.md) — proposals, candidacies, community notes, self-sustaining governance.
- The [architecture document](architecture.md) — the engine internals (packages, data model, algorithms).
- The [VCP architecture](vcp-architecture.md) — the Cloud Platform's internal design and deployment.
- The [content architecture](design/content-architecture.md) — proposals, candidacies, community notes, and the VCP/backend content boundary.
- The [product workflow](product-workflow.md) — the user-facing experience.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  End-User Applications                   │
│                                                         │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│   │  Web app     │ │  Tauri /     │ │  Mobile app  │    │
│   │  (React)     │ │  Desktop     │ │              │    │
│   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘    │
│          │                │                │            │
└──────────┼────────────────┼────────────────┼────────────┘
           │                │                │
  ════════════════  JWT Auth (user identity)  ═══════════
           │                │                │
┌──────────┼────────────────┼────────────────┼────────────┐
│          ▼                ▼                ▼            │
│        Client Backend (port 4000)                       │
│        Authentication · User management · Proxy         │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Auth (JWT)  │  │  User/Org    │  │  Governance   │   │
│  │  register    │  │  profiles    │  │  proxy (adds  │   │
│  │  login       │  │  memberships │  │  X-Participant │   │
│  │  refresh     │  │              │  │  -Id header)  │   │
│  └──────────────┘  └──────────────┘  └──────┬───────┘   │
│                                              │          │
│  ┌──────────────────────────────────────┐    │          │
│  │  Backend DB (users, refresh_tokens,  │    │          │
│  │  memberships, assemblies_cache,      │    │          │
│  │  topics_cache, notifications)        │    │          │
│  └──────────────────────────────────────┘    │          │
│                                              │          │
└──────────────────────────────────────────────┼──────────┘
                                               │
  ═══════  API Key + X-Participant-Id  ══════════════════
                                               │
┌──────────────────────────────────────────────┼──────────┐
│                                              ▼          │
│         Votiverse Cloud Platform (VCP) (port 3000)      │
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

The VCP is consumed by client backends, not directly by end-user applications. All of the following capabilities are exposed through the VCP's REST API (see Section 5.2) and accessed by client backends on behalf of authenticated users.

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

The VCP does not deliver notifications to end users. It delivers events to client backends. How the client backend notifies the user (email, push, in-app, SMS) is the client's responsibility.

---

## 4. What Client Backends Are Responsible For

The VCP handles governance computation. Everything else is the responsibility of the client backend and the end-user application.

### 4.1 User identity and authentication
The VCP does not authenticate end users. The **client backend** authenticates users through its own system (JWT-based registration and login) and maps authenticated users to VCP participant identifiers. When calling the VCP API, the client backend injects the `X-Participant-Id` header with the appropriate participant ID. The VCP trusts that the client backend has verified the user's identity. The VCP holds no personally identifiable information — all PII (email, name) lives in the client backend's database.

### 4.2 User-to-participant mapping
The client backend maintains a mapping between its own user accounts and VCP participant IDs. When a user joins an Assembly, the client backend creates the participant in the VCP and stores the association. This mapping is the client backend's responsibility — the VCP only knows about opaque `ParticipantId` values.

### 4.3 User interface
All user-facing presentation — dashboards, booklet displays, delegation chain visualizations, poll response forms, trend charts, track record displays — is built by the end-user application (web, Tauri, mobile). The client backend proxies governance data from the VCP; how it is rendered is entirely up to the front-end application.

### 4.4 Content management and the content hash bridge

The VCP stores **governance metadata** — the minimum information needed for computation, enforcement, and integrity verification. The client backend stores **rich content** — markdown documents, binary assets, draft state. This separation keeps the VCP lean and capable of serving multiple client backends.

Specifically:
- **Proposals** — The VCP tracks: id, issueId, choiceKey, authorId, title, status, version, `contentHash`. The backend stores: full markdown document, assets, draft state, version history.
- **Delegate candidacies** — The VCP tracks: id, participantId, topicScope, voteTransparencyOptIn, status, version, `contentHash`. The backend stores: full profile document, assets, version history.
- **Community notes** — The VCP tracks: id, authorId, target reference, `contentHash`, status, evaluation events (endorse/dispute). The backend stores: full note text, assets.
- **Assets** (images, videos, PDFs) — entirely a backend concern. The VCP never handles binary files.

The **`contentHash`** in the VCP provides the integrity bridge: anyone can hash backend-served content and compare it to the VCP's record to verify it hasn't been tampered with. When blockchain anchoring is applied, these content hashes are what gets anchored — the VCP provides verifiable commitments to "this content existed at this time in this state" without storing the content itself.

**Draft management** is entirely backend-owned. The VCP learns about content only when it is submitted (proposals during the deliberation phase) or declared (candidacies). Pre-submission editing leaves no trace in the VCP's event log.

See `docs/design/content-architecture.md` for the full design.

### 4.5 Access control
Access control operates at two levels:

**VCP-level (client isolation).** The VCP enforces client-assembly access: each API key carries an `assemblyAccess` list (explicit assembly IDs, or `"*"` for unrestricted). Requests to assemblies outside a client's access list are rejected with `403 Forbidden`. Admin write operations (creating participants, events, polls, topics) require the `"operational"` scope; participant-scoped keys can only perform governance actions (voting, delegating, responding to polls). This prevents a compromised or misconfigured client from affecting assemblies it doesn't own.

**Client-level (organizational RBAC).** Who within an organization can create Assemblies, manage participants, or submit proposals are access control decisions enforced by the client backend before proxying to the VCP. The VCP trusts the client backend's authorization decisions.

### 4.6 Communication delivery
When the VCP emits a webhook event, the client backend receives it and decides how to deliver it to the user — or whether to deliver it at all (email, push notification, in-app alert, etc.).

---

## 5. API

### 5.1 Two-Tier Authentication Model

Authentication is split across two boundaries:

**Tier 1: End user to Client Backend (JWT)**

End users authenticate with the client backend using JWT access tokens. The client backend issues tokens on login and validates them on every request.

- **Token format:** JWT with claims `sub` (userId), `email`, `name`.
- **Token lifecycle:** Short-lived access tokens (e.g., 15 minutes) + long-lived refresh tokens stored server-side.
- **Client backend auth endpoints:**
  - `POST /auth/register` — create a new user account
  - `POST /auth/login` — authenticate and receive access + refresh tokens
  - `POST /auth/refresh` — exchange a refresh token for a new access token
  - `POST /auth/logout` — revoke the refresh token

**Tier 2: Client Backend to VCP (API key + participant identity)**

The client backend authenticates with the VCP using an API key and injects participant identity on each request:

```
Authorization: Bearer vcp_key_xxxxxxxxxxxxxxxxxx
X-Participant-Id: p_456
```

API keys are issued when a client backend registers with the VCP. Each key is associated with:
- a **client identity** (`clientId`, `clientName`),
- an **assembly access list** (`assemblyAccess`: explicit assembly IDs, or `"*"` for unrestricted access),
- **auth scopes** (`"participant"` for governance actions, `"operational"` for admin writes like creating participants/events/polls/topics),
- a usage tier that determines rate limits and feature access.

The `X-Participant-Id` header is set by the client backend after resolving the authenticated user's participant ID for the target Assembly. The VCP trusts this header — it does not verify end-user identity.

**Assembly access enforcement.** Every request to `/assemblies/:id` or `/assemblies/:id/*` is checked against the client's `assemblyAccess` list. A request to an Assembly the client doesn't have access to returns `403 Forbidden`. When a client creates a new assembly via `POST /assemblies`, it is automatically granted access to that assembly. `GET /assemblies` returns only assemblies the client has access to.

**Scope enforcement.** Admin write operations require the `"operational"` scope:
- `POST /assemblies/:id/participants` and `DELETE /assemblies/:id/participants/:pid`
- `POST /assemblies/:id/events`
- `POST /assemblies/:id/polls`
- `POST /assemblies/:id/topics`

Participant governance actions (voting, delegating, responding to polls) require only the `"participant"` scope. A client with only `"participant"` scope cannot create events or manage participants.

The VCP also exposes `POST /auth/token` for JWT-based token exchange, allowing client backends to obtain short-lived VCP session tokens instead of passing the API key on every request. Token exchange validates that the client has access to the requested assembly before minting the JWT.

### 5.2 VCP REST Endpoints

These endpoints are consumed by client backends, not directly by end-user applications. All governance endpoints are scoped to an Assembly. The Assembly ID appears in the URL path.

**Health and metrics:**

```
GET    /health                                      # health check
GET    /metrics                                     # server metrics
```

**Authentication (backend-to-VCP):**

```
POST   /auth/token                                  # JWT token exchange
```

**Assembly management:**

```
POST   /assemblies                                  # register a new assembly
GET    /assemblies                                  # list assemblies
GET    /assemblies/:id                              # get assembly state and config
```

**Participants:**

```
POST   /assemblies/:id/participants                 # add participant
GET    /assemblies/:id/participants                 # list participants
DELETE /assemblies/:id/participants/:pid            # remove participant
PATCH  /assemblies/:id/participants/:pid/status     # update participant status
```

**Voting events:**

```
POST   /assemblies/:id/events                       # create voting event
GET    /assemblies/:id/events                       # list events
GET    /assemblies/:id/events/:eid                  # get event status
```

**Voting:**

```
POST   /assemblies/:id/votes                        # cast vote (timeline-enforced)
GET    /assemblies/:id/events/:eid/tally            # get tally results
GET    /assemblies/:id/events/:eid/participation    # get participation data
GET    /assemblies/:id/events/:eid/weights          # get weight distribution
```

Vote casting is enforced by the engine's timeline validation. Votes are only accepted when the server's clock is between `votingStart` and `votingEnd`. Attempting to vote outside this window returns a 409 `GOVERNANCE_RULE_VIOLATION` with rule `VOTING_NOT_OPEN` or `VOTING_CLOSED`.

**Delegations:**

```
POST   /assemblies/:id/delegations                  # create delegation
DELETE /assemblies/:id/delegations/:did             # revoke delegation
GET    /assemblies/:id/delegations                  # list delegations for participant
GET    /assemblies/:id/delegations/chain            # resolve full delegation chain
GET    /assemblies/:id/delegations/my-weight        # get current participant's weight
```

**Polls:**

```
POST   /assemblies/:id/polls                        # create poll
GET    /assemblies/:id/polls                        # list polls
POST   /assemblies/:id/polls/:pid/respond           # submit poll response
GET    /assemblies/:id/polls/:pid/results           # get poll results
GET    /assemblies/:id/trends/:topic                # get topic trend data
```

**Predictions:**

```
POST   /assemblies/:id/predictions                  # commit prediction
GET    /assemblies/:id/predictions                  # list predictions
POST   /assemblies/:id/outcomes                     # record outcome data
GET    /assemblies/:id/predictions/:pid/eval        # evaluate prediction
GET    /assemblies/:id/track-record/:pid            # participant's prediction track record
```

**Awareness:**

```
GET    /assemblies/:id/awareness/concentration      # concentration metrics
GET    /assemblies/:id/awareness/history/:pid       # personal voting history
GET    /assemblies/:id/awareness/profile/:pid       # delegate profile and track record
```

**Topics:**

```
GET    /assemblies/:id/topics                       # list topics
POST   /assemblies/:id/topics                       # create topic
```

**Dev-only (not available in production):**

```
GET    /dev/clock                                    # current clock time + mode (system or test)
POST   /dev/clock/advance                            # advance test clock by {ms} milliseconds
POST   /dev/clock/set                                # set test clock to {time} (epoch ms)
POST   /dev/clock/reset                              # reset to system time
```

Dev clock endpoints enable Stripe-style test clock scenarios: advance time to trigger voting window transitions, test vote rejection after deadline, verify auto-materialization. Double-gated: not mounted when `NODE_ENV=production`, and a middleware guard blocks even if misconfigured. No authentication required (dev-only).

**Stubs (not yet implemented):**

```
POST   /assemblies/:id/integrity/commit             # anchor artifacts to blockchain (501)
GET    /assemblies/:id/integrity/verify/:cid        # verify a commitment (501)
POST   /webhooks                                    # register webhook endpoint (501)
GET    /webhooks                                    # list registered webhooks (501)
DELETE /webhooks/:id                                # unregister webhook (501)
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

1. End-user application sends `POST /assemblies/:id/votes` with JWT access token and payload to the **client backend**.
2. Client backend validates the JWT, resolves the user's participant ID for the target Assembly.
3. Client backend forwards `POST /assemblies/:id/votes` to the **VCP** with API key in `Authorization` and `X-Participant-Id` header injected.
4. VCP authenticates the client backend and validates the request payload.
5. VCP loads the Assembly's governance configuration.
6. VCP calls the engine: `engine.voting.cast({ participantId, issueId, choice })`.
7. Engine validates governance rules (is voting open? is participant eligible? does this override a delegation?), appends a `VoteCast` event to the event store, and returns a result.
8. VCP enqueues async tasks triggered by the event (awareness recomputation, webhook notifications) to the in-process worker queue.
9. VCP returns `200 OK` to the client backend, which forwards it to the end-user application.

A typical read request (e.g., fetching a tally):

1. End-user application sends `GET /assemblies/:id/events/:eid/tally` with JWT to the **client backend**.
2. Client backend validates the JWT.
3. Client backend forwards the request to the **VCP** with API key and participant identity.
4. VCP authenticates the client backend.
5. VCP queries the materialized tally view from the database.
6. VCP returns the tally result through the client backend to the end-user application.

### 5.5 Webhook Delivery

When a governance event occurs that a client backend has subscribed to, the VCP delivers a webhook to the client backend's registered endpoint:

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

## 6. Client Backend

The client backend is the server-side application that sits between end-user applications and the VCP. It is responsible for user authentication, user-to-participant mapping, and proxying governance requests to the VCP with identity injection.

### 6.1 Auth Endpoints

The client backend exposes authentication endpoints to end-user applications:

```
POST   /auth/register    # create user account (email, password, name)
POST   /auth/login       # authenticate, returns { accessToken, refreshToken }
POST   /auth/refresh     # exchange refresh token for new access token
POST   /auth/logout      # revoke refresh token
```

Access tokens are short-lived JWTs. Refresh tokens are opaque strings stored server-side.

**JWT access token claims:**

```json
{
  "sub": "usr_abc123",
  "email": "alice@example.com",
  "name": "Alice Chen",
  "iat": 1710600000,
  "exp": 1710601800
}
```

### 6.2 Profile Endpoints

```
GET    /me                           # get current user profile
POST   /me/assemblies/:id/join      # join an Assembly (creates participant in VCP, stores mapping)
```

The `/me/assemblies/:id/join` endpoint is where the user-to-participant mapping is established. The client backend:
1. Calls `POST /assemblies/:id/participants` on the VCP to create the participant.
2. Stores the returned `participantId` in its own database, associated with the user's account.
3. Returns the assembly membership to the end-user application.

### 6.3 Governance Proxy and Local Cache

The client backend serves some read-heavy endpoints locally and proxies the rest to the VCP with identity injection.

**Locally served (no VCP round-trip):**

| Endpoint | Data source |
|---|---|
| `GET /assemblies` | Local cache, filtered by user's memberships |
| `GET /assemblies/:id` | Local assembly cache |
| `GET /assemblies/:id/topics` | Local topic cache |

Assembly and topic data are immutable after creation, so the local cache never goes stale. The cache is populated when: (a) a user joins an assembly, (b) the seed script runs, or (c) a POST response is intercepted (e.g., creating a topic populates the topic cache).

**Proxied to VCP (governance computation):**

All other `/assemblies/:id/*` routes are forwarded to the VCP with identity injection:

```
Client app request:
  GET /assemblies/asm_xyz/events
  Authorization: Bearer <JWT access token>

Client backend forwards to VCP:
  GET /assemblies/asm_xyz/events
  Authorization: Bearer vcp_key_xxxxxxxxxxxxxxxxxx
  X-Participant-Id: p_456
```

The proxy logic:
1. Validates the JWT access token.
2. Looks up the user's participant ID for the target Assembly.
3. Forwards the request to the VCP, replacing the `Authorization` header with the VCP API key and adding the `X-Participant-Id` header.
4. Returns the VCP response to the end-user application.
5. Intercepts successful POST responses for events and polls to track them for the notification scheduler.

If the user is not a member of the target Assembly, the proxy returns `403 Forbidden` without contacting the VCP.

### 6.4 Client Backend Database

The client backend maintains its own database (separate from the VCP's database, SQLite or PostgreSQL) with these tables:

| Table | Purpose |
|---|---|
| `users` | User accounts: id, email, password hash, name, created_at |
| `refresh_tokens` | Active refresh tokens: token, user_id, expires_at |
| `memberships` | User-to-Assembly mappings: user_id, assembly_id, participant_id |
| `assemblies_cache` | Local cache of immutable assembly data (id, name, config, status) |
| `topics_cache` | Local cache of immutable topic data (id, assembly_id, name, parent_id) |
| `tracked_events` | Voting events tracked for notification scheduling |
| `tracked_polls` | Polls tracked for notification scheduling |
| `notification_preferences` | Per-user notification settings (key-value) |

The client backend database contains PII (email, name). The VCP database does not — it only stores opaque participant IDs.

The cache tables (`assemblies_cache`, `topics_cache`) store immutable data that doesn't change after creation. This eliminates VCP round-trips for the most frequently accessed read endpoints (assembly listing, topic listing) and makes the backend resilient to brief VCP unavailability for cached reads.

---

## 7. Multi-Tenancy

The VCP is inherently multi-tenant. All clients, all Organizations, and all Assemblies share a single VCP deployment. The isolation boundary is the **Assembly**.

Tenancy guarantees:

- An Assembly's event store, delegation graph, predictions, poll data, and awareness metrics are invisible to other Assemblies.
- API requests are scoped to an Assembly ID. No API call can access data across Assemblies.
- **Client-assembly access enforcement** gates every assembly-scoped request. Each API key carries an `assemblyAccess` list — the VCP rejects requests to assemblies outside the client's access list with `403 Forbidden`. `GET /assemblies` returns only assemblies the client has access to. Creating a new assembly automatically grants the creating client access to it.
- **Scope enforcement** prevents participant-scoped clients from performing admin operations (creating events, managing participants). This separates the governance plane (voting, delegating) from the management plane (assembly administration).
- Webhook subscriptions are per-client, per-Assembly. A client receives events only for Assemblies it has access to.
- The engine library processes each request in the context of a single Assembly. There is no cross-Assembly computation.

Different clients may manage different Assemblies on the same VCP. Client A's Assemblies are invisible to Client B, and vice versa.

---

## 8. Uniweb Integration (Proximify-Specific)

This section describes how Proximify's own Uniweb-based web application integrates with the VCP. This is one specific client implementation — not a requirement for other clients.

### 8.1 Uniweb with a client backend

The Uniweb instance at votiverse.org (and any managed white-label instances) communicates with the VCP through a client backend. The Uniweb front-end authenticates users via JWT, and the client backend proxies governance requests to the VCP with participant identity injection — exactly like any other client in the 3-tier architecture.

The client backend adds the application layer that the VCP does not provide: user authentication, user-to-participant mapping, RBAC enforcement, and organizational structure. The Uniweb front-end adds UI rendering and content management.

### 8.2 Entity mapping

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

### 8.3 Data ownership boundary

The VCP stores the minimum governance data it needs to compute: prediction claims, poll questions and responses, vote choices, delegation relationships, issue identifiers. Everything else — display names, formatted text, media, organizational structure — lives in Uniweb and is not duplicated in the VCP.

The VCP is authoritative for governance state (tallies, delegation weights, prediction evaluations). Uniweb is authoritative for content (proposal text, booklet formatting, user profiles).

### 8.4 Managed white-label instances

Proximify may deploy additional managed Uniweb instances for organizations that want their own branded experience (vote.university.edu, participate.city.gov). Each managed instance connects to a VCP as a separate client with its own API key. By default, managed instances connect to Proximify's VCP. Organizations that require data sovereignty can have their Uniweb instance pointed at their own VCP — either self-operated or Proximify-managed on the organization's infrastructure.

---

## 9. Open Questions

### 9.1 Event store isolation
Should Assemblies from different clients share a single database, or should high-security clients receive isolated storage? For launch, a single database with Assembly-scoped queries is sufficient. Schema-level or database-level isolation can be offered as a premium tier if regulatory requirements demand it.

### 9.2 Client state vs. VCP state
A proposal's rich content lives in the client. The structured prediction claims live in the VCP. If these go out of sync, the VCP is authoritative for governance state and the client is authoritative for content. The practical rule: the VCP stores only what it needs to compute. Everything else stays in the client.

### 9.3 Offline resilience
If the VCP is temporarily unavailable, client applications should fail-fast with a clear error message ("governance service temporarily unavailable") rather than queuing commands. Queuing introduces consistency risks that are unacceptable for governance operations.

### 9.4 Webhook reliability
At-least-once delivery with exponential backoff. After repeated failures, subscriptions are marked degraded and an alert is generated. Clients must implement idempotent event processing.

### 9.5 API versioning
As the VCP evolves, the API will need versioning. URL-prefix versioning (`/v1/assemblies/...`) is the simplest and most explicit approach. Breaking changes require a new version. Non-breaking additions (new fields, new endpoints) are added to the current version.

---

*This document is a living draft and will evolve as the VCP moves from development to production.*
