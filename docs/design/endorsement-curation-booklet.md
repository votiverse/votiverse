# Proposal Endorsement, Curation & Voting Booklet

**Design Document — v1.0**
**March 2026**

---

## 1. Motivation

The voting booklet modal exists to present structured arguments for each voting position, modeled after the Swiss Federal Council's *Erlaeuterungen des Bundesrates*. The original implementation showed all proposals unsorted with no community signal. A real voting booklet works because it is **curated**: one argument per side, endorsed by the community, with an organizer recommendation.

This feature adds four capabilities:

1. **Proposal endorsements** — community scoring during the deliberation phase
2. **Featured proposals** — admin curation selecting which proposal represents each position in the booklet
3. **Organizer recommendation** — an editorial section written by the event creator
4. **Auto-fallback** — when no proposals are explicitly curated, the booklet selects the highest-scored proposal per position automatically

These capabilities work together to produce a fair, community-informed voting booklet that helps participants make decisions without requiring everyone to read every proposal.

---

## 2. Architecture

### 2.1 Layer responsibilities

The feature follows the established 3-tier boundary:

| Concern | Layer | What it stores |
|---------|-------|---------------|
| Endorsement events | Engine (`@votiverse/core`, `@votiverse/content`) | `ProposalEndorsed` events in the event store |
| Endorsement counts | VCP | Materialized `endorsement_count`, `dispute_count` on the `proposals` table; per-participant tracking in `proposal_endorsements` |
| Featured flag | VCP | `featured` column on `proposals` (operational, not an event) |
| Booklet selection | VCP | Computed at query time — `GET /proposals/booklet` |
| Event creator tracking | VCP | `voting_event_creators` table |
| Recommendation metadata | VCP | `booklet_recommendations` table (content hash, author, timestamps) |
| Recommendation content | Backend | `booklet_recommendation_content` table (markdown text) |
| Endorsement UI | Web | ThumbsUp/Down buttons on proposal cards and booklet |
| Curation panel | Web | Creator-only panel for pinning proposals and writing recommendations |

### 2.2 Key design decisions

**Endorsements reuse the note evaluation pattern exactly.** The `ProposalEndorsed` event mirrors `CommunityNoteEvaluated`. The VCP's materialized count update logic (check previous evaluation, decrement old column, increment new) is identical to the note evaluation route. This consistency reduces cognitive load and ensures both systems handle evaluation changes the same way.

**Featured is a database flag, not an event.** Curation is an operational concern — the event creator deciding which proposals to highlight. It does not affect governance computation (vote tallying, delegation, quorum). Recording it as an event would pollute the governance event log with editorial decisions. The `featured` column on the `proposals` table is the simplest representation.

**Auto-fallback is computed at query time.** The `GET /proposals/booklet` endpoint groups proposals by `choiceKey`, checks for a `featured` flag, and falls back to the highest-scored (endorsements minus disputes) proposal. No background job or materialized view is needed — the query is fast because proposals per issue are few (typically 1-5 per position).

**Event creator tracking uses a dedicated table.** The `voting_event_creators` table maps `(assembly_id, event_id)` to the `participant_id` that created the event. This is cleaner than adding a column to an engine-level entity (the engine doesn't track HTTP-level concerns) and simpler than re-deriving creator identity from event headers at query time.

**`choiceKey` remains optional on the API** but is now required by the web UI's draft form. Proposals without a `choiceKey` go into the "general" bucket, which the booklet displays but does not use for for/against structure. The UI nudges users to pick a position (for/against) but doesn't block general analysis proposals.

**No new timeline phases.** Curation happens during the existing deliberation phase. The booklet renders differently based on the event's current phase (deliberation vs. voting vs. closed) but the timeline model is unchanged.

---

## 3. Data Model

### 3.1 New event type

```typescript
// @votiverse/core — events.ts

type ProposalEvaluation = "endorse" | "dispute";

interface ProposalEndorsedPayload {
  readonly proposalId: ProposalId;
  readonly participantId: ParticipantId;
  readonly evaluation: ProposalEvaluation;
}

type ProposalEndorsedEvent = BaseEvent<"ProposalEndorsed", ProposalEndorsedPayload>;
```

### 3.2 Extended proposal metadata

```typescript
// @votiverse/content — types.ts

interface ProposalMetadata {
  // ... existing fields ...
  readonly endorsementCount: number;   // materialized from events
  readonly disputeCount: number;       // materialized from events
  readonly featured: boolean;          // operational flag, not an event
}
```

### 3.3 VCP database schema additions

```sql
-- Materialized endorsement counts on proposals
ALTER TABLE proposals ADD COLUMN endorsement_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN dispute_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

-- Per-participant endorsement tracking (for evaluation change)
CREATE TABLE proposal_endorsements (
  assembly_id    TEXT NOT NULL,
  proposal_id    TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  evaluation     TEXT NOT NULL,       -- 'endorse' | 'dispute'
  evaluated_at   INTEGER NOT NULL,
  PRIMARY KEY (assembly_id, proposal_id, participant_id)
);

-- Who created each voting event (for curation authorization)
CREATE TABLE voting_event_creators (
  assembly_id    TEXT NOT NULL,
  event_id       TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  PRIMARY KEY (assembly_id, event_id)
);

-- Organizer recommendation metadata (content hash only)
CREATE TABLE booklet_recommendations (
  assembly_id  TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  issue_id     TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (assembly_id, event_id, issue_id)
);
```

### 3.4 Backend database schema addition

```sql
-- Rich recommendation content (markdown)
CREATE TABLE booklet_recommendation_content (
  assembly_id  TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  issue_id     TEXT NOT NULL,
  markdown     TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (assembly_id, event_id, issue_id)
);
```

---

## 4. API Endpoints

### 4.1 Proposal endorsement

```
POST /assemblies/:id/proposals/:pid/evaluate
Body: { "evaluation": "endorse" | "dispute" }
Auth: Requires participant identity (X-Participant-Id)

Rules:
  - One evaluation per participant per proposal
  - New evaluation supersedes previous (materialized counts adjusted)
  - Self-endorsement rejected (author cannot evaluate own proposal)
  - Withdrawn proposals cannot be evaluated
```

### 4.2 Proposal curation (event creator only)

```
POST /assemblies/:id/proposals/:pid/feature
POST /assemblies/:id/proposals/:pid/unfeature
Auth: Requires participant identity matching event creator

The creator is determined by looking up the issue's voting event
in the voting_event_creators table.
```

### 4.3 Voting booklet

```
GET /assemblies/:id/proposals/booklet?issueId=...
Response: {
  issueId: string,
  positions: {
    [choiceKey: string]: {
      featured: Proposal | null,    // featured if pinned, else highest-scored
      all: Proposal[]               // all non-withdrawn proposals, score-sorted
    }
  },
  recommendation: {
    authorId: string,
    contentHash: string,
    createdAt: number,
    updatedAt: number
  } | null
}

Selection logic per position:
  1. If any proposal has featured=true, select it
  2. Otherwise, select the proposal with the highest score
     (endorsement_count - dispute_count), breaking ties by submission time
```

### 4.4 Organizer recommendation

```
POST   /assemblies/:id/events/:eid/issues/:iid/recommendation
GET    /assemblies/:id/events/:eid/issues/:iid/recommendation
DELETE /assemblies/:id/events/:eid/issues/:iid/recommendation
Auth: POST and DELETE require event creator identity

VCP stores metadata (content hash). Backend stores content (markdown).
Backend route follows VCP-first pattern: register hash with VCP,
then store markdown locally.
```

---

## 5. Engine Integration

### 5.1 ProposalService

The `ProposalService` in `@votiverse/content` gains an `evaluate()` method that follows the same pattern as `NoteService.evaluate()`:

```typescript
async evaluate(
  proposalId: ProposalId,
  participantId: ParticipantId,
  evaluation: ProposalEvaluation,
): Promise<void>
```

Validation rules:
- Proposal must exist
- Proposal must not be withdrawn
- Participant cannot evaluate their own proposal

The method records a `ProposalEndorsed` event. Replay functions (`replayProposal`, `replayProposalsByIssue`) track evaluations in a `Map<ParticipantId, ProposalEvaluation>` and materialize counts when constructing `ProposalMetadata`.

### 5.2 Engine API

The `VotiverseEngine.proposals` object exposes `evaluate()`:

```typescript
engine.proposals.evaluate(proposalId, participantId, evaluation)
```

No timeline enforcement is applied at the engine level for endorsements — endorsements are community signals, not governance-critical actions. The VCP route can optionally restrict endorsements to the deliberation window, but the engine does not enforce this.

---

## 6. Web UI

### 6.1 Phase-aware voting booklet

The `VotingBooklet` component accepts an `eventPhase` prop ("deliberation" | "voting" | "closed") and renders differently:

**Deliberation phase:**
- All proposals shown per position, ranked by endorsement score (highest first)
- ThumbsUp/ThumbsDown buttons on each proposal for community endorsement
- Community notes expandable per proposal
- Event creator sees a star icon toggle that reveals the curation panel

**Voting/closed phase:**
- Featured (or auto-selected) proposal shown per position
- "See all N proposals" expander to view additional proposals
- Organizer recommendation section at the bottom (blue card with markdown)
- No endorsement buttons (deliberation is over)

### 6.2 Curation panel

Only visible to the event creator during the deliberation phase. Activated by the star icon in the booklet header. Contains:

1. **Proposal list per position** — each proposal shows its score and a "Pin as featured" / "Unpin" toggle button
2. **Fairness guidance** — amber info box reminding the creator to present the strongest argument from each side
3. **Recommendation editor** — textarea for writing the organizer recommendation, with save/update/delete actions

### 6.3 Proposal endorsement on cards

The `ProposalCard` component on the proposals page shows:
- Endorsement score (net: endorsements minus disputes) next to the status badge
- "Featured" badge if the proposal is pinned
- ThumbsUp/ThumbsDown buttons during deliberation (hidden for proposal author)

### 6.4 Draft form enhancement

The `DraftForm` now requires a `choiceKey` selection (for/against/general) as a dropdown before the title field. This ensures new proposals are positioned for booklet inclusion.

---

## 7. Seed Data

The seed script creates realistic endorsement data for demonstration:

- **18 proposal endorsements** across OSC (14) and Youth (3) assemblies
- **2 featured proposals** on the OSC Dependency Policy Review (one "for", one "against")
- **Event creator tracking** for all events (first participant in each assembly)
- **Organizer recommendation** for the OSC Dependency Policy Review, seeded via the backend seed script

This allows a fresh install to demonstrate the full booklet experience:
1. Log in as Sofia Reyes (OSC event creator)
2. Navigate to OSC Dependency Policy Review (active voting)
3. Click "Voting booklet" — see featured for/against proposals with endorsement scores and the organizer recommendation
4. Navigate to OSC Roadmap (deliberation phase) — see all proposals ranked by score with active endorse buttons

---

## 8. Formal Properties

Endorsements do not affect the formal governance properties defined in the whitepaper:

- **Sovereignty**: Endorsements are signals, not votes. They do not modify vote weights or tallies.
- **One person, one vote**: The tally is computed from votes alone. Endorsements are a separate domain.
- **Immutability**: `ProposalEndorsed` events are appended to the event log and never modified. A new evaluation supersedes the previous one by recording a new event, not by editing the old one.

The `featured` flag is operational and does not appear in the event log. It affects only the booklet presentation, not governance outcomes.

---

## 9. Test Coverage

| Layer | New tests | Total |
|-------|-----------|-------|
| Engine (`@votiverse/content`) | 6 endorsement tests | 73 |
| VCP | 8 tests (endorsement, curation, booklet, recommendation) | 115 |
| Backend | (existing tests still pass) | 63 |
| Web | (existing tests still pass) | 16 |

Engine tests verify: endorsement/dispute counts, self-endorsement rejection, withdrawn proposal rejection, evaluation change correctness, counts in listByIssue, zero initialization.

VCP tests verify: materialized count updates, self-endorsement HTTP 400, evaluation change, feature/unfeature authorization, booklet auto-fallback selection, recommendation CRUD with creator authorization.
