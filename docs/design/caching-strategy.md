# Caching Strategy

This document defines what the backend caches, why, and how caching should evolve for production. It is informed by the [Entity Mutability Reference](entity-mutability.md), which classifies every entity by how it can change after creation.

---

## Architecture Context

The platform has three tiers:

```
Web / Mobile → Backend (port 4000) → VCP (port 3000)
```

The backend serves as the user-facing API. For governance operations, it proxies requests to the VCP with participant identity injection (`X-Participant-Id` header). For content and auth, it is the terminating endpoint.

In production, the backend runs in an **Auto Scaling Group** behind a load balancer. Each instance maintains its own in-process cache. The VCP runs as a separate service with its own scaling.

---

## Caching Principles

1. **Only cache what doesn't change.** Immutable entities can be cached forever with no invalidation logic. See [Entity Mutability Reference](entity-mutability.md) for the full classification.

2. **Per-instance caching is sufficient for immutable data.** Each backend instance populates its own cache on first read. Since the data never changes, all instances converge to the same state. No shared cache needed.

3. **Mutable data is not cached.** Requests for mutable entities (proposals with endorsement counts, delegation lists, note evaluations) always go to the VCP. This keeps things simple and avoids stale-data bugs.

4. **Cache misses are cheap.** A cache miss results in one VCP HTTP call. The VCP responds from its own database. For immutable data, this happens once per instance per entity — not once per user request.

---

## Current Backend Caches

### assemblies_cache

| Field | Source | Mutable? |
|-------|--------|----------|
| `id`, `organization_id`, `name`, `config`, `status`, `created_at` | VCP | No |
| `admission_mode` | Backend-owned | Yes (but written locally, not from VCP) |
| `cached_at` | Backend | Metadata |

**Populated:** When an assembly is created via `POST /assemblies` or when a user joins an assembly. The proxy interceptor captures the VCP response and writes it to the cache.

**Invalidation:** None needed. Assembly metadata (name, config) is immutable. The `admission_mode` field is backend-owned and written directly — it does not come from the VCP and is always current.

**Why this works:** Assemblies are created once. Their governance configuration is immutable by design (changing voting rules mid-event would violate formal properties). The only mutable field is `status`, which changes rarely (e.g., archiving an assembly) and is not currently reflected in the cache.

**Gap to address:** If assembly archival becomes a feature, `status` changes need to propagate. Options: (a) VCP webhook → backend cache update, or (b) periodic refresh. Low priority — assemblies are rarely archived.

### topics_cache

| Field | Source | Mutable? |
|-------|--------|----------|
| `id`, `assembly_id`, `name`, `parent_id`, `sort_order` | VCP | No |
| `cached_at` | Backend | Metadata |

**Populated:** On first `GET /assemblies/:id/topics` — the proxy intercepts the VCP response and writes all topics to the cache. Subsequent reads are served from cache.

**Invalidation:** None needed. Topics are IMMUTABLE. They are created during assembly setup and never change.

### surveys_cache

| Field | Source | Mutable? |
|-------|--------|----------|
| `id`, `assembly_id`, `title`, `questions`, `topic_ids`, `schedule`, `closes_at`, `created_by` | VCP | No |
| `cached_at` | Backend | Metadata |

**Populated:** On `POST /assemblies/:id/surveys` — the proxy interceptor captures the VCP response and writes survey metadata to the cache. Also populated on first list read.

**Invalidation:** None needed. Surveys are IMMUTABLE after creation.

---

## Entities Safe to Cache (Not Yet Cached)

These entities are immutable and could be cached per-instance if VCP round-trip latency becomes a concern:

| Entity | VCP endpoint | Volume | Cache benefit |
|--------|-------------|--------|---------------|
| **Materialized Tallies** | `GET /assemblies/:id/events/:eid/tally` | Read on every event detail page view | High — tallies are computed once at event close and never change |
| **Materialized Weights** | Included in tally response | Same as above | High |
| **Materialized Participation** | `GET /assemblies/:id/events/:eid/participation` | Read on results pages | Medium |
| **Materialized Concentration** | Included in awareness responses | Read on awareness pages | Low — less frequently accessed |
| **Proposal Versions** | Embedded in proposal detail | Read on proposal detail pages | Medium — immutable per version |
| **Candidacy Versions** | Embedded in candidacy detail | Read on candidacy pages | Low — fewer candidacies than proposals |
| **Vote records** | Per-issue via tally | Already materialized in tallies | N/A — covered by tally cache |

**Recommendation:** Add tally caching first. It's the highest-volume immutable read and the data is guaranteed frozen once the voting event closes.

---

## Entities That Must NOT Be Cached

These entities are mutable. Always fetch from VCP on each request:

| Entity | Why it changes |
|--------|---------------|
| **Proposals (metadata)** | Endorsement/dispute counts change on every evaluation toggle. Status transitions (submitted → locked → withdrawn). Featured flag. |
| **Candidacies (metadata)** | Topic scope updates. Status transitions. |
| **Community Notes** | Endorsement/dispute counts. Status. |
| **Delegations** | Can be revoked or auto-replaced at any time. |
| **Participants** | Status can change (active → inactive → sunset). |
| **Predictions** | Outcome data added via events. |
| **Active voting events** | While the event is open, new votes arrive continuously. Only the closed/tallied state is immutable. |

---

## Production Scaling Considerations

### Per-Instance Caching (Current Approach)

Each backend EC2 instance in the ASG builds its own cache:

**Pros:**
- Zero infrastructure cost (no Redis/ElastiCache)
- Zero network latency for cached reads
- No cache coherence protocol needed for immutable data
- Cold start cost is low: one VCP call per entity type per assembly

**Cons:**
- Each new instance makes its own VCP calls to warm up
- Memory usage scales linearly with instance count (but immutable data is small)
- Not suitable for mutable data

**Verdict:** This is the right approach for launch. The immutable entities (topics, surveys, tallies) are small and infrequently created. The warm-up cost is negligible.

### Shared Cache (ElastiCache / Redis)

Consider adding only if:

1. **VCP latency becomes a bottleneck.** If the VCP is in a different AZ or region, every proxied request adds network latency. A shared cache would reduce this for read-heavy mutable data.

2. **Mutable entity reads dominate traffic.** If proposal endorsement counts or delegation lists are read far more often than they change, a short-TTL cache (30-60s) would reduce VCP load.

3. **Instance churn is high.** If the ASG scales aggressively and instances are short-lived, cold-start cache misses could spike VCP load during scale-out events.

**If added, the pattern would be:**

| Data type | Cache strategy |
|-----------|---------------|
| Immutable entities | Cache forever (same as per-instance, but shared) |
| Mutable entities with low write rate | Cache with 30-60s TTL |
| Mutable entities with high write rate (endorsements during active voting) | No cache — always hit VCP |
| User-specific data (notifications, preferences) | No cache — per-user, low reuse |

**Invalidation mechanism:** The VCP already has webhook infrastructure (`webhook_subscriptions` table). Webhooks could notify the backend of state changes, which would invalidate specific cache entries. This is more precise than TTL-based expiry but adds complexity.

---

## Cache Warm-Up on Instance Start

When a new backend instance starts (e.g., ASG scale-out), its caches are empty. The warm-up sequence:

1. **Assemblies:** Populated on first `GET /assemblies` request (user's assembly list).
2. **Topics:** Populated on first access to any assembly's topic tree.
3. **Surveys:** Populated on first access to any assembly's survey list.

This is lazy (on-demand), not eager. The first request to each assembly pays the VCP round-trip cost; subsequent requests are served from cache.

**Alternative: eager warm-up.** On startup, the backend could proactively fetch all assemblies and their topics/surveys from the VCP. This would eliminate cold-start latency spikes but adds startup time and complexity. Not recommended for launch — lazy warm-up is simpler and the cold-start penalty is a single VCP call per assembly.

---

## Decision Log

| Decision | Rationale | Revisit when |
|----------|-----------|-------------|
| Per-instance caching for immutable data | Zero infrastructure cost; immutable data has no coherence issues | VCP latency > 50ms p95 or ASG instance churn > 10/hour |
| No caching for mutable data | Avoids stale-data bugs; mutable reads are not yet a bottleneck | Proposal/note endorsement reads > 100 rps |
| Lazy cache warm-up | Simpler than eager; cold-start cost is one VCP call per assembly | If cold-start latency causes user-visible delays |
| No shared cache (ElastiCache) for launch | Adds infrastructure cost and complexity for minimal benefit at current scale | When any of the above thresholds are crossed |
