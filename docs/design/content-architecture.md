# Content Architecture: Proposals, Candidacies, and Community Notes

**Design Document — v0.2**
**March 2026**

---

## 1. Motivation

Paper II identifies three entity types that share a common "scrutiny infrastructure" — structured, versioned, immutable-once-active content submitted for community evaluation:

1. **Policy Proposals** — rich documents arguing for a position on a voting issue, carrying predictions and subject to community notes.
2. **Delegate Candidacies** — formal profiles published by participants seeking delegations, subject to the same scrutiny infrastructure as proposals.
3. **Community Notes** — annotations attached to proposals, candidacies, survey results, or other notes, evaluated by the community for helpfulness.

All three share a content substrate: **markdown text with file assets** (images, videos, linked files). This document designs the data model, event types, lifecycle rules, and the division of responsibility between the VCP and client backends.

---

## 2. The VCP/Backend Boundary

This design is grounded in a clear separation of concerns between the VCP (governance computation) and the client backend (content and user experience).

### 2.1 What the VCP is

The VCP is a **governance computation and integrity engine**. It answers questions like "who won this vote?", "what's the delegation weight?", "is this action within the voting window?", "does this action violate governance rules?" It records the immutable sequence of governance events. It is meant to be stable, robust, and capable of serving more than one client application.

The VCP does not render content, manage user experiences, or store rich documents. It stores **governance-relevant metadata** — the minimum information needed for computation, enforcement, and integrity verification.

### 2.2 What the backend is

The client backend is the **orchestrator of user experience for a specific community**. It knows its users, manages content, handles the full lifecycle of what participants see and do, and calls the VCP when it needs governance computation or wants to record a governance event.

The backend owns all rich content: markdown documents, binary assets (images, videos, PDFs), draft management, and content serving. It is the source of truth for *what things say*. The VCP is the source of truth for *what things mean* in governance terms.

### 2.3 The content hash bridge

The VCP stores a `contentHash` for every content-bearing entity (proposals, candidacies, notes). The backend stores the actual content. The hash bridges the two: anyone can verify that backend-served content hasn't been tampered with by hashing it and comparing to the VCP's record.

This creates a clean integrity story that aligns with Paper II's immutability thesis. The VCP's event log commits to "this content existed at this time in this state" via hashes. When blockchain anchoring is wired in, it's the VCP's hash chain that gets anchored — not the actual documents.

### 2.4 The line

**If the VCP needs it for computation or governance enforcement, the VCP stores it. If it's display content, the backend stores it.**

The VCP already follows this pattern: `Issue` has a short `title` and `description` (governance metadata), poll questions have text and structure (needed for aggregation). These are computation inputs, not rich content. Proposals, candidacies, and notes extend this pattern — the VCP gets short metadata and a content hash; the backend gets everything else.

---

## 3. Shared Types

### 3.1 Branded IDs (added to `@votiverse/core`)

```typescript
type CandidacyId = string & { readonly __brand: 'CandidacyId' };
type NoteId      = string & { readonly __brand: 'NoteId' };
type AssetId     = string & { readonly __brand: 'AssetId' };

// ProposalId already exists in core (used by prediction package).
```

### 3.2 Content hash

All content-bearing entities carry a hash computed over the canonical form of their content. The hash algorithm is SHA-256 over the UTF-8 encoding of the markdown concatenated with the sorted asset hashes.

```typescript
/** Computed by the backend, recorded by the VCP. */
type ContentHash = string & { readonly __brand: 'ContentHash' };
```

The exact canonicalization procedure is defined once (in a shared utility) so that any party — backend, VCP, external auditor — can independently compute the same hash from the same content.

### 3.3 Version record (VCP side)

The VCP's view of a content version — metadata only, no content.

```typescript
interface VersionRecord {
  versionNumber: number;
  contentHash: ContentHash;
  createdAt: Timestamp;
}
```

### 3.4 Content version (backend side)

The backend's full content representation.

```typescript
interface ContentVersion {
  versionNumber: number;
  markdown: string;
  assets: AssetReference[];
  contentHash: ContentHash;
  createdAt: Timestamp;
  changeSummary?: string;
}

interface AssetReference {
  id: AssetId;
  filename: string;
  mimeType: string;
  storageKey: string;     // opaque key resolved by the backend's asset store
  sizeBytes: number;
  uploadedAt: Timestamp;
}
```

### 3.5 Note target (shared)

Polymorphic reference used by community notes.

```typescript
type NoteTargetType = 'proposal' | 'candidacy' | 'survey' | 'community-note';

interface NoteTarget {
  type: NoteTargetType;
  id: string;                // ProposalId | CandidacyId | PollId | NoteId (as plain string)
  versionNumber?: number;    // pins to specific version for versioned targets
}
```

---

## 4. Proposals

### 4.1 What a proposal is

A **Proposal** is a rich document authored by a participant that argues for a specific position on a voting issue. It carries predictions (via the existing prediction package) and is subject to community notes.

The VCP tracks proposal **metadata**. The backend stores the **content**.

### 4.2 VCP-side type

```typescript
interface ProposalMetadata {
  id: ProposalId;
  issueId: IssueId;
  choiceKey?: string;         // which choice this advocates (e.g., "for", "Option A")
                              // omit for binary issues where the proposal IS the motion
  authorId: ParticipantId;
  title: string;              // short identifier for governance records
  currentVersion: number;
  versions: VersionRecord[];  // hash + timestamp per version, no content
  status: ProposalStatus;
  submittedAt: Timestamp;
  lockedAt?: Timestamp;
  withdrawnAt?: Timestamp;
}

type ProposalStatus = 'submitted' | 'locked' | 'withdrawn';
```

Note: no `draft` status. Drafts are entirely a backend concern. The VCP only learns about a proposal when it is submitted.

### 4.3 Backend-side type

```typescript
interface Proposal {
  id: ProposalId;             // matches VCP record
  issueId: IssueId;
  choiceKey?: string;
  authorId: string;           // user ID (backend's identity, not participant ID)
  title: string;
  currentVersion: number;
  versions: ContentVersion[]; // full markdown + assets
  status: 'draft' | 'submitted' | 'locked' | 'withdrawn';
  createdAt: Timestamp;       // draft creation time
  submittedAt?: Timestamp;
  lockedAt?: Timestamp;
  withdrawnAt?: Timestamp;
}
```

### 4.4 Proposal lifecycle

```
 Backend only                 VCP + Backend
─────────────                ──────────────

┌──────────┐   submit    ┌──────────────┐   voting starts   ┌──────────┐
│  DRAFT   │────────────→│  SUBMITTED   │──────────────────→│  LOCKED  │
│ (backend │             │  (versioned, │    (automatic)     │(immutable│
│  only)   │             │   public)    │                    │  )       │
└────┬─────┘             └──────┬───────┘                    └──────────┘
     │ withdraw                 │ withdraw
     ▼                          ▼
┌──────────┐             ┌──────────────┐
│DISCARDED │             │  WITHDRAWN   │
│(no trace │             │  (preserved) │
│ in VCP)  │             └──────────────┘
└──────────┘
```

**Draft.** Backend-only. The author edits freely. The VCP knows nothing about it. The backend stores mutable draft state. If the author discards a draft, it disappears without trace in the governance record.

**Submitted.** The backend calls the VCP to record a `ProposalSubmitted` event with metadata (title, issueId, choiceKey, contentHash). The VCP validates the deliberation window (`deliberationStart <= now < votingStart`) and records the event. The backend stores the full content, linked by proposalId. The author can publish new versions: backend computes new contentHash, calls VCP to record `ProposalVersionCreated`, and stores the new content.

**Locked.** When the voting window opens for the linked issue, the VCP locks all submitted proposals. No further versions can be accepted. Community notes can still be created. See Section 4.6 for the locking trigger mechanism.

**Withdrawn.** The author withdraws the proposal (allowed in submitted state only — locked proposals cannot be withdrawn). The VCP records `ProposalWithdrawn`. The record is preserved in both VCP and backend, marked as withdrawn.

### 4.5 Relationship to Issues and Choices

An `Issue` has optional `choices: string[]`. A Proposal links to an Issue and optionally to a specific choice via `choiceKey`.

| Scenario | Issue choices | Proposal.choiceKey | Meaning |
|---|---|---|---|
| Binary motion | `["for", "against"]` | `"for"` | "Here's why we should do this" |
| Binary counter | `["for", "against"]` | `"against"` | "Here's why we should not" |
| Multi-option | `["Pool", "Park", "Save"]` | `"Pool"` | "Here's the case for a pool" |
| General analysis | any | `undefined` | Informational, not advocating a specific choice |

Multiple proposals can exist for the same issue and choice (different authors, different arguments).

### 4.6 Proposal locking trigger

There is no explicit `VotingStarted` event in the engine — the voting window is enforced lazily when `timeProvider.now() >= votingStart`. Proposal locking follows the same pattern:

**The VCP rejects `ProposalVersionCreated` and new `ProposalSubmitted` events for an issue when `now >= votingStart`.** This is enforcement, not a proactive event.

The `ProposalLocked` events are recorded **lazily on first write-attempt after votingStart**, or **eagerly by a periodic materialization pass** (the same pattern used for tally materialization of closed events). The eager path ensures that clients querying proposal status see `locked` without having to trigger a write. The implementation can start with the lazy path and add the eager path later.

### 4.7 Proposals and Predictions

The `@votiverse/prediction` package already has `Prediction.proposalId: ProposalId`. This design formalizes `ProposalId` into an actual entity. The relationship is unidirectional: predictions reference proposals, not the other way around. To find a proposal's predictions, query `predictions.filter(p => p.proposalId === id)`.

### 4.8 Proposal submission deadline

Proposals must be submitted during the **deliberation phase** (`deliberationStart <= now < votingStart`). The VCP rejects `ProposalSubmitted` events outside this window. Draft proposals that aren't submitted before voting simply remain drafts in the backend — they never enter the governance record.

---

## 5. Delegate Candidacies

### 5.1 What a candidacy is

A **DelegateCandidacy** is a public profile published by a participant offering to represent others. The VCP needs candidacy metadata because it affects governance behavior: `delegationMode: 'candidacy'` controls who appears in delegation discovery, and `voteTransparencyOptIn` controls what the voting API reveals to delegators.

### 5.2 VCP-side type

```typescript
interface CandidacyMetadata {
  id: CandidacyId;
  participantId: ParticipantId;
  topicScope: TopicId[];              // topics they offer to represent on
                                      // empty = global delegation
  voteTransparencyOptIn: boolean;
  currentVersion: number;
  versions: VersionRecord[];          // hash + timestamp per version
  status: CandidacyStatus;
  declaredAt: Timestamp;
  withdrawnAt?: Timestamp;
}

type CandidacyStatus = 'active' | 'withdrawn';
```

### 5.3 Backend-side type

```typescript
interface DelegateCandidacy {
  id: CandidacyId;
  participantId: string;              // user ID
  topicScope: TopicId[];
  voteTransparencyOptIn: boolean;
  currentVersion: number;
  versions: ContentVersion[];         // full markdown + assets
  status: 'active' | 'withdrawn';
  declaredAt: Timestamp;
  withdrawnAt?: Timestamp;
}
```

### 5.4 Candidacy lifecycle

```
┌──────────────────────────────┐
│          ACTIVE              │
│  (versioned, public,         │
│   community-notable)         │
└──────┬───────────────────────┘
       │ withdraw
       ▼
┌──────────────────────────────┐
│        WITHDRAWN             │
│  (record preserved,          │
│   can be reactivated)        │
└──────────────────────────────┘
```

Unlike proposals, candidacies have no draft phase — declaring a candidacy is a public act — and no locking phase — candidacies persist across many voting events and can always be updated.

**Active.** New versions can be added at any time. The backend computes contentHash, calls VCP to record `CandidacyVersionCreated`. Previous versions are preserved — community notes pin to a specific version.

**Withdrawn.** The candidate withdraws. Existing delegations to this participant remain active (withdrawal removes the public profile, not the trust relationship). The candidate can later reactivate by declaring a new version, which transitions back to active.

**Re-declaration after withdrawal:** Reactivates the same candidacy ID. The version history continues from where it left off. Community notes on previous versions remain attached. This is implemented as a `CandidacyVersionCreated` event on a withdrawn candidacy, which implicitly reactivates it.

### 5.5 Vote transparency opt-in

Per Paper II Section 2.3, candidates can opt into making their votes visible to their delegators. This is per-candidacy, not assembly-wide.

When `voteTransparencyOptIn` is `true`, the VCP's voting API returns the candidate's `effectiveChoice` to participants who have an active delegation to this candidate. The VCP enforces this at query time by checking delegation state.

Interaction with ballot secrecy:
- `secret` ballot: only delegators of an opted-in candidate see the candidate's votes.
- `public` ballot: everyone sees everyone's votes — opt-in is irrelevant.
- `anonymous-auditable`: opt-in overrides anonymity for the delegator-delegate relationship.

### 5.6 Delegation mode (config extension)

Paper II proposes three delegation modes, replacing `DelegationConfig.enabled: boolean`:

```typescript
delegationMode: 'open' | 'candidacy' | 'none';
```

| Mode | Discovery interface | Direct search/nomination |
|---|---|---|
| `open` | Shows all members | Yes |
| `candidacy` | Shows only declared candidates | Yes (any member) |
| `none` | N/A (delegation disabled) | N/A |

**Migration:** Replace `enabled` with `delegationMode` in all presets, configs, and tests in a single pass. Add a migration function for persisted configs: `enabled: true` → `delegationMode: 'open'`, `enabled: false` → `delegationMode: 'none'`. Drop `enabled` entirely — no transition period with dual-format validation.

Updated presets:

| Preset | delegationMode |
|---|---|
| `TOWN_HALL` | `none` |
| `LIQUID_STANDARD` | `open` |
| `CIVIC_PARTICIPATORY` | `open` |
| `LIQUID_ACCOUNTABLE` | `candidacy` |
| `BOARD_PROXY` | `open` |

---

## 6. Community Notes

### 6.1 What a community note is

A **CommunityNote** is a short annotation attached to any notable entity. Notes enable distributed verification without administrators. The VCP tracks note metadata and evaluations (because note visibility is a governance policy). The backend stores the note content.

### 6.2 VCP-side type

```typescript
interface NoteMetadata {
  id: NoteId;
  authorId: ParticipantId;
  contentHash: ContentHash;
  target: NoteTarget;
  status: NoteStatus;
  createdAt: Timestamp;
  withdrawnAt?: Timestamp;
}

type NoteStatus = 'proposed' | 'withdrawn';
```

Endorsement and dispute counts are **computed** by the VCP from `CommunityNoteEvaluated` events — not stored on the note. Visibility is derived:

```
visible = evaluationCount >= minEvaluations
          AND endorsements / (endorsements + disputes) >= threshold
```

### 6.3 Backend-side type

```typescript
interface CommunityNote {
  id: NoteId;
  authorId: string;               // user ID
  markdown: string;
  assets: AssetReference[];
  contentHash: ContentHash;
  target: NoteTarget;
  endorsementCount: number;       // cached from VCP for display
  disputeCount: number;
  status: 'proposed' | 'withdrawn';
  createdAt: Timestamp;
  withdrawnAt?: Timestamp;
}
```

### 6.4 Notable targets

| Target type | Example |
|---|---|
| `proposal` | "This cost estimate is understated — the contractor quoted $67k, not $50k" |
| `candidacy` | "This delegate voted against the policy they publicly supported" |
| `survey` | "This survey was conducted during construction — low scores reflect disruption" |
| `community-note` | "The above note cites an outdated quote — here's the current one" |

### 6.5 Note lifecycle

```
┌──────────────────────────────┐
│         PROPOSED             │
│  (immutable, being evaluated)│
└──────┬───────────────────────┘
       │ author withdraws
       ▼
┌──────────────────────────────┐
│        WITHDRAWN             │
│  (record preserved)          │
└──────────────────────────────┘
```

**Proposed.** Content is immutable from creation — no editing. Participants evaluate it (endorse or dispute). If the note needs correction, the author withdraws and creates a new note.

**Withdrawn.** Record preserved, deprioritized in UI. Notes on withdrawn entities (withdrawn proposals, withdrawn candidacies) remain accessible but the UI can indicate the target's status.

### 6.6 Note evaluation

Any participant except the note's author can evaluate a note. One evaluation per participant per note, recorded as a `CommunityNoteEvaluated` event. A participant can change their evaluation (new event supersedes previous).

```typescript
type NoteEvaluation = 'endorse' | 'dispute';
```

### 6.7 Visibility computation

Note visibility uses **two thresholds**: a minimum evaluation count and a ratio threshold.

```typescript
// In GovernanceConfig.features
communityNotes: boolean;                  // enables/disables (already exists)
noteVisibilityThreshold: number;          // 0.0–1.0, default: 0.3
noteMinEvaluations: number;               // minimum evaluations before threshold applies, default: 3
```

Visibility logic:
- **Fewer than `noteMinEvaluations` evaluations:** Note is displayed with a "not yet evaluated" indicator. Neither prominently featured nor hidden — it needs exposure to be evaluated.
- **At or above minimum:** `endorsements / (endorsements + disputes) >= noteVisibilityThreshold`. Notes meeting the threshold are prominently displayed alongside their target. Notes below it are accessible but not featured.

This prevents a single endorsement from making a note "prominently displayed."

### 6.8 Version pinning

Notes pin to the current version of their target at creation time. The VCP records the `targetVersionNumber` in the event. The UI can indicate: "This note was written about version 3. The candidate has since updated to version 5."

---

## 7. Asset Storage

Assets are **entirely a backend concern**. The VCP never touches binary files.

### 7.1 Backend asset store

The backend uses a pluggable asset store adapter:

```typescript
interface AssetStore {
  store(upload: AssetUpload): Promise<AssetReference>;
  getReadUrl(storageKey: string): Promise<string>;
  delete(storageKey: string): Promise<void>;
}
```

| Environment | Implementation | Notes |
|---|---|---|
| Development | `PostgresAssetStore` | BLOBs in `assets` table |
| Development (alt) | `FilesystemAssetStore` | Local directory |
| Production | `S3AssetStore` | S3 with signed URLs |

Start with the direct upload path only. Signed URL upload (for S3) is added when production deployment requires it — the `AssetStore` interface accommodates it without changing the content model.

### 7.2 Asset garbage collection

Assets uploaded during draft editing may never be referenced by submitted content. The backend runs a periodic GC: assets not referenced by any submitted content after a configurable period (default: 7 days) are eligible for cleanup.

### 7.3 Content size limits

The backend enforces limits at the API layer:

| Limit | Default | Configurable |
|---|---|---|
| Max markdown size per version | 100 KB | Yes |
| Max assets per entity | 20 | Yes |
| Max asset file size | 50 MB | Yes |
| Max total assets per entity | 200 MB | Yes |

These are operational guardrails. The VCP is unaffected — it only receives content hashes.

---

## 8. New Event Types (VCP)

These events are added to the core event type union. Note: **no markdown or asset data in any payload** — only governance metadata and content hashes.

```typescript
// ── Proposal Events ─────────────────────────────────────────────

interface ProposalSubmittedPayload {
  proposalId: ProposalId;
  issueId: IssueId;
  choiceKey?: string;
  authorId: ParticipantId;
  title: string;
  contentHash: ContentHash;
}

interface ProposalVersionCreatedPayload {
  proposalId: ProposalId;
  versionNumber: number;
  contentHash: ContentHash;
}

interface ProposalLockedPayload {
  proposalId: ProposalId;
  issueId: IssueId;
}

interface ProposalWithdrawnPayload {
  proposalId: ProposalId;
  authorId: ParticipantId;
}


// ── Candidacy Events ────────────────────────────────────────────

interface CandidacyDeclaredPayload {
  candidacyId: CandidacyId;
  participantId: ParticipantId;
  topicScope: TopicId[];
  voteTransparencyOptIn: boolean;
  contentHash: ContentHash;
}

interface CandidacyVersionCreatedPayload {
  candidacyId: CandidacyId;
  versionNumber: number;
  contentHash: ContentHash;
  topicScope?: TopicId[];             // if scope changed
  voteTransparencyOptIn?: boolean;    // if changed
}

interface CandidacyWithdrawnPayload {
  candidacyId: CandidacyId;
  participantId: ParticipantId;
}


// ── Community Note Events ───────────────────────────────────────

interface CommunityNoteCreatedPayload {
  noteId: NoteId;
  authorId: ParticipantId;
  contentHash: ContentHash;
  targetType: NoteTargetType;
  targetId: string;
  targetVersionNumber?: number;
}

interface CommunityNoteEvaluatedPayload {
  noteId: NoteId;
  participantId: ParticipantId;
  evaluation: NoteEvaluation;       // 'endorse' | 'dispute'
}

interface CommunityNoteWithdrawnPayload {
  noteId: NoteId;
  authorId: ParticipantId;
}
```

Updated event type union:

```typescript
type GovernanceEventType =
  | 'ParticipantRegistered'
  | 'ParticipantStatusChanged'
  | 'TopicCreated'
  | 'VotingEventCreated'
  | 'VotingEventClosed'
  | 'DelegationCreated'
  | 'DelegationRevoked'
  | 'VoteCast'
  | 'PredictionCommitted'
  | 'OutcomeRecorded'
  | 'PollCreated'
  | 'PollResponseSubmitted'
  | 'IntegrityCommitment'
  // ── New ───────────────
  | 'ProposalSubmitted'
  | 'ProposalVersionCreated'
  | 'ProposalLocked'
  | 'ProposalWithdrawn'
  | 'CandidacyDeclared'
  | 'CandidacyVersionCreated'
  | 'CandidacyWithdrawn'
  | 'CommunityNoteCreated'
  | 'CommunityNoteEvaluated'
  | 'CommunityNoteWithdrawn'
```

---

## 9. GovernanceConfig Extensions

### 9.1 New parameters

```typescript
// DelegationConfig — replaces `enabled: boolean`
delegationMode: 'open' | 'candidacy' | 'none';

// BallotConfig
allowVoteChange: boolean;                 // default: true (Paper II §5.3)

// FeatureConfig
communityNotes: boolean;                  // already exists
noteVisibilityThreshold: number;          // 0.0–1.0, default: 0.3
noteMinEvaluations: number;               // default: 3

// PollConfig
surveyResponseAnonymity: 'anonymous' | 'visible';  // default: 'anonymous'
```

---

## 10. Package Structure

### 10.1 Engine package: `@votiverse/content`

This package handles **governance metadata and lifecycle rules** — not content storage.

```
packages/content/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              ← public API re-exports
│   ├── types.ts              ← ProposalMetadata, CandidacyMetadata, NoteMetadata,
│   │                            VersionRecord, NoteTarget, ContentHash
│   ├── events.ts             ← event type definitions and payload types
│   ├── proposals.ts          ← lifecycle: submit, version, lock, withdraw
│   │                            validation: deliberation window, status transitions
│   ├── candidacies.ts        ← lifecycle: declare, version, withdraw, reactivate
│   │                            validation: status transitions
│   ├── notes.ts              ← lifecycle: create, evaluate, withdraw
│   │                            visibility computation (threshold + min evaluations)
│   └── content-hash.ts       ← canonical hash computation utility
└── tests/
    ├── unit/
    │   ├── proposals.test.ts
    │   ├── candidacies.test.ts
    │   ├── notes.test.ts
    │   └── content-hash.test.ts
    └── integration/
```

### 10.2 Updated dependency graph

```
cli → engine → [awareness, voting, polling, prediction, integrity, content]
                awareness → [delegation, voting, prediction, polling, config, core, content]
                content → [config, core]
                voting → [delegation, config, core]
                polling → [identity, config, core]
                prediction → [config, core]
                delegation → [identity, config, core]
                integrity → [config, core]
                identity → [core]
                config → [core]
                simulate → [engine]
                core → (nothing)
```

`content` depends only on `core` and `config`. It does not depend on `voting`, `delegation`, or any other domain package. The engine orchestrates cross-package interactions (e.g., locking proposals when voting starts).

### 10.3 Why a separate package?

The content package is thin — it handles governance metadata, not rich content — but it earns its existence:

1. **Lifecycle logic is non-trivial.** State machine transitions with validation (deliberation window enforcement, status preconditions, candidacy reactivation).
2. **Note evaluation and visibility computation** is governance logic that belongs in the engine, not the platform.
3. **Notes target entities across packages** — proposals (voting), candidacies (delegation), surveys (polling). A single package avoids cross-dependencies.
4. **Awareness is read-only** — notes involve write operations (evaluations). A separate package preserves the awareness invariant.

---

## 11. VCP Schema and API

### 11.1 Database tables

```sql
-- ── Proposals ────────────────────────────────────────────────────

CREATE TABLE proposals (
  id              TEXT PRIMARY KEY,
  assembly_id     TEXT NOT NULL REFERENCES assemblies(id),
  issue_id        TEXT NOT NULL,
  choice_key      TEXT,
  author_id       TEXT NOT NULL,
  title           TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'submitted',
  submitted_at    INTEGER NOT NULL,
  locked_at       INTEGER,
  withdrawn_at    INTEGER
);

CREATE TABLE proposal_versions (
  proposal_id     TEXT NOT NULL REFERENCES proposals(id),
  version_number  INTEGER NOT NULL,
  content_hash    TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, version_number)
);

CREATE INDEX idx_proposals_issue ON proposals(issue_id);
CREATE INDEX idx_proposals_assembly ON proposals(assembly_id);


-- ── Candidacies ──────────────────────────────────────────────────

CREATE TABLE candidacies (
  id                       TEXT PRIMARY KEY,
  assembly_id              TEXT NOT NULL REFERENCES assemblies(id),
  participant_id           TEXT NOT NULL,
  topic_scope              TEXT NOT NULL DEFAULT '[]',
  vote_transparency_opt_in INTEGER NOT NULL DEFAULT 0,
  current_version          INTEGER NOT NULL DEFAULT 1,
  status                   TEXT NOT NULL DEFAULT 'active',
  declared_at              INTEGER NOT NULL,
  withdrawn_at             INTEGER
);

-- Partial unique index: one ACTIVE candidacy per participant per assembly.
-- Withdrawn candidacies don't block re-declaration (reactivation reuses same row).
CREATE UNIQUE INDEX idx_candidacies_active
  ON candidacies(assembly_id, participant_id)
  WHERE status = 'active';

CREATE TABLE candidacy_versions (
  candidacy_id    TEXT NOT NULL REFERENCES candidacies(id),
  version_number  INTEGER NOT NULL,
  content_hash    TEXT NOT NULL,
  topic_scope     TEXT,
  vote_transparency_opt_in INTEGER,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (candidacy_id, version_number)
);

CREATE INDEX idx_candidacies_assembly ON candidacies(assembly_id);
CREATE INDEX idx_candidacies_participant ON candidacies(participant_id);


-- ── Community Notes ──────────────────────────────────────────────

CREATE TABLE community_notes (
  id                    TEXT PRIMARY KEY,
  assembly_id           TEXT NOT NULL REFERENCES assemblies(id),
  author_id             TEXT NOT NULL,
  content_hash          TEXT NOT NULL,
  target_type           TEXT NOT NULL,
  target_id             TEXT NOT NULL,
  target_version_number INTEGER,
  status                TEXT NOT NULL DEFAULT 'proposed',
  created_at            INTEGER NOT NULL,
  withdrawn_at          INTEGER
);

CREATE TABLE note_evaluations (
  note_id         TEXT NOT NULL REFERENCES community_notes(id),
  participant_id  TEXT NOT NULL,
  evaluation      TEXT NOT NULL,    -- 'endorse' | 'dispute'
  evaluated_at    INTEGER NOT NULL,
  PRIMARY KEY (note_id, participant_id)
);

CREATE INDEX idx_notes_target ON community_notes(target_type, target_id);
CREATE INDEX idx_notes_assembly ON community_notes(assembly_id);
```

### 11.2 VCP API endpoints

The VCP exposes **metadata-only** endpoints. No markdown or assets flow through the VCP.

**Proposals:**
```
POST   /assemblies/:id/proposals                  Register proposal (metadata + contentHash)
GET    /assemblies/:id/proposals                   List proposal metadata (filter: issueId, status)
GET    /assemblies/:id/proposals/:pid              Get proposal metadata
POST   /assemblies/:id/proposals/:pid/version      Register new version (contentHash)
POST   /assemblies/:id/proposals/:pid/withdraw     Withdraw proposal
```

**Candidacies:**
```
POST   /assemblies/:id/candidacies                 Declare candidacy (metadata + contentHash)
GET    /assemblies/:id/candidacies                  List candidacy metadata (filter: topicScope, status)
GET    /assemblies/:id/candidacies/:cid             Get candidacy metadata
POST   /assemblies/:id/candidacies/:cid/version     Register new version (contentHash)
POST   /assemblies/:id/candidacies/:cid/withdraw    Withdraw candidacy
```

**Community Notes:**
```
POST   /assemblies/:id/notes                       Register note (contentHash + target)
GET    /assemblies/:id/notes                        List note metadata (filter: targetType, targetId)
GET    /assemblies/:id/notes/:nid                   Get note metadata + evaluation counts
POST   /assemblies/:id/notes/:nid/evaluate          Endorse or dispute
POST   /assemblies/:id/notes/:nid/withdraw          Withdraw note (author only)
```

---

## 12. Backend Schema and API

### 12.1 Database tables

```sql
-- ── Proposal Content ─────────────────────────────────────────────

CREATE TABLE proposal_drafts (
  id              TEXT PRIMARY KEY,
  assembly_id     TEXT NOT NULL,
  issue_id        TEXT NOT NULL,
  choice_key      TEXT,
  author_id       TEXT NOT NULL,     -- user ID
  title           TEXT NOT NULL,
  markdown        TEXT NOT NULL DEFAULT '',
  assets          TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE proposal_content (
  proposal_id     TEXT NOT NULL,      -- matches VCP proposal ID
  version_number  INTEGER NOT NULL,
  markdown        TEXT NOT NULL,
  assets          TEXT NOT NULL DEFAULT '[]',
  content_hash    TEXT NOT NULL,
  change_summary  TEXT,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, version_number)
);


-- ── Candidacy Content ────────────────────────────────────────────

CREATE TABLE candidacy_content (
  candidacy_id    TEXT NOT NULL,      -- matches VCP candidacy ID
  version_number  INTEGER NOT NULL,
  markdown        TEXT NOT NULL,
  assets          TEXT NOT NULL DEFAULT '[]',
  content_hash    TEXT NOT NULL,
  change_summary  TEXT,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (candidacy_id, version_number)
);


-- ── Note Content ─────────────────────────────────────────────────

CREATE TABLE note_content (
  note_id         TEXT NOT NULL,      -- matches VCP note ID
  markdown        TEXT NOT NULL,
  assets          TEXT NOT NULL DEFAULT '[]',
  content_hash    TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (note_id)
);


-- ── Assets ───────────────────────────────────────────────────────

CREATE TABLE assets (
  id              TEXT PRIMARY KEY,
  assembly_id     TEXT NOT NULL,
  storage_key     TEXT NOT NULL UNIQUE,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  uploaded_by     TEXT NOT NULL,      -- user ID
  uploaded_at     INTEGER NOT NULL,
  data            BLOB               -- for PostgreSQL/SQLite; NULL when using S3
);
```

### 12.2 Backend API endpoints

The backend serves **full content** and manages **drafts and assets**.

**Proposals:**
```
POST   /assemblies/:id/proposals/drafts            Create draft
GET    /assemblies/:id/proposals/drafts             List my drafts
GET    /assemblies/:id/proposals/drafts/:did        Get draft
PUT    /assemblies/:id/proposals/drafts/:did        Update draft
DELETE /assemblies/:id/proposals/drafts/:did        Discard draft
POST   /assemblies/:id/proposals/drafts/:did/submit Submit (→ registers with VCP, stores content)

GET    /assemblies/:id/proposals                    List proposals (metadata from VCP + content)
GET    /assemblies/:id/proposals/:pid               Get proposal with full content
GET    /assemblies/:id/proposals/:pid/versions      List versions with content
GET    /assemblies/:id/proposals/:pid/versions/:v   Get specific version
POST   /assemblies/:id/proposals/:pid/version       Create new version (stores content, registers with VCP)
POST   /assemblies/:id/proposals/:pid/withdraw      Withdraw (→ calls VCP)
```

**Candidacies:**
```
POST   /assemblies/:id/candidacies                  Declare (stores content, registers with VCP)
GET    /assemblies/:id/candidacies                   List with content
GET    /assemblies/:id/candidacies/:cid              Get with full content
GET    /assemblies/:id/candidacies/:cid/versions     List versions with content
POST   /assemblies/:id/candidacies/:cid/version      New version (stores content, registers with VCP)
POST   /assemblies/:id/candidacies/:cid/withdraw     Withdraw (→ calls VCP)
```

**Community Notes:**
```
POST   /assemblies/:id/notes                        Create note (stores content, registers with VCP)
GET    /assemblies/:id/notes                         List notes (content + evaluation data from VCP)
GET    /assemblies/:id/notes/:nid                    Get note with content + evaluations
POST   /assemblies/:id/notes/:nid/evaluate           Evaluate (→ proxied to VCP)
POST   /assemblies/:id/notes/:nid/withdraw           Withdraw (stores, → calls VCP)
```

**Assets:**
```
POST   /assemblies/:id/assets                       Upload asset (direct)
GET    /assemblies/:id/assets/:aid                   Get asset metadata + read URL
```

### 12.3 Submit flow (detailed)

When a participant submits a proposal:

```
1. Client:  POST /assemblies/:id/proposals/drafts/:did/submit

2. Backend:
   a. Reads draft from proposal_drafts table
   b. Computes contentHash = sha256(canonical(markdown, assets))
   c. Resolves user → participantId for assembly
   d. Calls VCP: POST /assemblies/:id/proposals
      { proposalId, issueId, choiceKey, authorId: participantId, title, contentHash }
   e. VCP validates deliberation window, records ProposalSubmitted event
   f. On VCP success:
      - Stores content in proposal_content (version 1)
      - Deletes draft from proposal_drafts
      - Returns proposal to client

3. If VCP rejects (e.g., voting already started):
   - Backend returns the error to client
   - Draft is preserved (user can still edit)
```

---

## 13. Awareness Layer Integration

The `@votiverse/awareness` package gains new read-only query capabilities.

### 13.1 Delegate Profile enrichment

```typescript
interface DelegateProfile {
  // ... existing fields ...

  candidacy?: {
    id: CandidacyId;
    currentVersion: number;
    topicScope: TopicId[];
    voteTransparencyOptIn: boolean;
    declaredAt: Timestamp;
    noteCount: number;
    endorsedNoteCount: number;    // notes meeting visibility threshold
  };
}
```

### 13.2 Proposal context for voting decisions

```typescript
interface HistoricalContext {
  // ... existing fields ...

  proposals: {
    id: ProposalId;
    authorId: ParticipantId;
    title: string;
    choiceKey?: string;
    version: number;
    noteCount: number;
    endorsedNoteCount: number;
    predictionCount: number;
  }[];
}
```

### 13.3 Engagement prompts

New reasons:

```typescript
type EngagementReason =
  | 'close-vote'
  | 'prediction-mismatch'
  | 'delegate-behavior-anomaly'
  | 'concentration-alert'
  | 'chain-changed'
  // ── New ──
  | 'delegate-position-changed'     // delegate updated candidacy profile
  | 'new-community-note'            // notable note on a proposal you're tracking
  | 'proposal-updated'              // proposal you're tracking has a new version
  | 'delegate-vote-mismatch';       // delegate voted against their stated position
```

---

## 14. Cross-Referencing

### 14.1 Structural references (VCP)

Typed relationships enforced by the governance engine:

```
Proposal  ──→ Issue (issueId, choiceKey)
Candidacy ──→ Participant (participantId)
Candidacy ──→ Topics (topicScope[])
Note      ──→ Target ({ type, id, versionNumber })
Prediction ──→ Proposal (proposalId)
```

### 14.2 Content references (backend)

Within markdown content, authors can link to other entities. These are **backend/client rendering concerns** — the VCP never sees them. The client resolves them to in-app navigation.

Markdown links use whatever scheme the client app supports. The simplest approach is relative URLs that match the app's route structure:

```markdown
See the [transit priority survey results](/assemblies/a_123/polls/poll_456/results).
Compare with the [competing proposal](/assemblies/a_123/proposals/prop_789).
```

Asset references within markdown use `asset://<AssetId>` URIs, resolved by the backend to actual storage URLs before serving to the client:

```markdown
![Site photo](asset://a_83a1d)
[Budget spreadsheet](asset://a_47f2c)
```

### 14.3 The closed evidential loop (Paper II)

```
Proposals carry predictions
  → Surveys capture participant observations
    → Community notes link surveys to proposals
      → Participants see whether predictions held
        → Future proposals carry more or less credibility
```

- Proposals → Predictions: structural (VCP, `Prediction.proposalId`)
- Surveys → Notes: structural (VCP, `NoteTarget.type = 'survey'`)
- Notes → Proposals: structural (VCP, `NoteTarget.type = 'proposal'`)
- Credibility: computed (awareness layer, `DelegateProfile.predictionAccuracy`)

---

## 15. Deferred Items

1. **Proposal-generated choices.** In participatory budgeting, proposals themselves become choices. This design assumes choices are predefined on the Issue. Proposal-as-choice is a future extension.

2. **Note abuse protection.** Paper II §7.2 raises harassment through notes. This design provides withdrawal and note-on-note dispute, but no explicit abuse flagging. Deferred.

3. **Survey rename (polls → surveys).** Paper II renames the concept. The codebase uses "polls." A cross-cutting rename is deferred to a dedicated refactoring.

4. **Assembly config immutability enforcement.** Paper II §5.2 says config is immutable after creation. Not yet enforced. Deferred to hardening.

5. **Member search / typeahead.** Paper II §2.6. A backend + web UI feature. Deferred.

6. **Blockchain anchoring of content hashes.** The `@votiverse/integrity` package has infrastructure. Wiring in content hashes is deferred but architecturally straightforward — the VCP's content hashes are exactly what gets anchored.

7. **Election/candidacy overlap.** Election platforms (proposals for candidate choices) and delegate candidacies (general profiles) may overlap for the same person. The design allows both to coexist. Unification or cross-referencing between them is deferred.

8. **Proposal display ordering.** When multiple proposals exist for an issue, display order affects attention. Ordering strategy (chronological, weighted by note endorsements, randomized) is a UI-layer decision deferred to web implementation.

9. **Signed URL uploads for S3.** Start with direct upload. Add signed URL flow when production deployment requires it.

---

## 16. Implementation Sequence

### Phase A: Foundation types and events
1. Add `CandidacyId`, `NoteId`, `AssetId`, `ContentHash` branded types to `@votiverse/core`
2. Add new event types and payload interfaces to `@votiverse/core/events.ts`
3. Add `delegationMode`, `allowVoteChange`, `noteVisibilityThreshold`, `noteMinEvaluations`, `surveyResponseAnonymity` to `@votiverse/config`
4. Replace `enabled: boolean` with `delegationMode` in all presets and tests
5. Update config validation

### Phase B: Content package
6. Create `@votiverse/content` package scaffold
7. Implement content hash utility (with tests)
8. Implement proposal metadata lifecycle (with tests)
9. Implement candidacy metadata lifecycle (with tests)
10. Implement community note lifecycle + evaluation + visibility (with tests)
11. Property-based tests for immutability guarantees

### Phase C: Engine integration
12. Wire content into `@votiverse/engine` API
13. Implement proposal locking on voting window open
14. Implement vote transparency for opted-in candidates
15. Integration tests across engine + content

### Phase D: Awareness integration
16. Extend `DelegateProfile` with candidacy data
17. Extend `HistoricalContext` with proposal data
18. Add new engagement prompt reasons
19. Awareness integration tests

### Phase E: VCP layer
20. VCP database schema additions
21. VCP API routes for proposals, candidacies, notes (metadata only)
22. VCP integration tests

### Phase F: Backend layer
23. Backend database schema additions (content + drafts + assets)
24. Asset store adapter (PostgreSQL initially)
25. Backend API routes for proposals (drafts + content)
26. Backend API routes for candidacies (content)
27. Backend API routes for community notes (content + VCP proxy for evaluations)
28. Backend integration tests

### Phase G: Web UI
29. Markdown editor component (with asset upload)
30. Proposal creation/viewing pages
31. Candidacy profile pages
32. Community notes display + evaluation UI
33. Updated delegation discovery (candidacy mode)

---

## Appendix A: Entity Relationship Diagram

```
                         VCP (governance metadata)
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌────────────┐     ┌────────────┐     ┌─────────────────────┐  │
│  │VotingEvent  │───→│  Issue      │←────│ ProposalMetadata    │  │
│  │  timeline   │    │  choices[]  │     │  title, contentHash │  │
│  └────────────┘    └────────────┘     │  status, versions   │  │
│                                        └──────┬──────────────┘  │
│                                               │                  │
│                                        ┌──────┴──────┐          │
│  ┌─────────────────────┐    targets    │             │ targets  │
│  │ CandidacyMetadata   │←─────────────│ NoteMetadata │          │
│  │  topicScope         │              │  target      │          │
│  │  voteTransparency   │              │  contentHash │          │
│  │  contentHash        │    targets   │  evaluations │          │
│  │  status, versions   │              │              │──→Poll   │
│  └─────────────────────┘              │  (self-ref)  │          │
│                                        └─────────────┘          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

                      Backend (content + UX)
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐       │
│  │ProposalDraft │  │ProposalContent  │  │CandidacyConten│       │
│  │  markdown    │  │  markdown       │  │  markdown     │       │
│  │  assets      │  │  assets         │  │  assets       │       │
│  │  (mutable)   │  │  contentHash    │  │  contentHash  │       │
│  └──────────────┘  │  (immutable)    │  │  (immutable)  │       │
│                     └─────────────────┘  └──────────────┘       │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐                          │
│  │ NoteContent  │  │    Assets       │                          │
│  │  markdown    │  │  storage_key    │                          │
│  │  contentHash │  │  data / S3 ref  │                          │
│  └──────────────┘  └─────────────────┘                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

          contentHash bridges VCP ↔ Backend for integrity
```

---

## Appendix B: Configuration Matrix (Updated)

| Parameter | Values | Default | Introduced |
|---|---|---|---|
| `delegationMode` | `open` · `candidacy` · `none` | `open` | Paper II |
| `allowVoteChange` | `true` · `false` | `true` | Paper II |
| `noteVisibilityThreshold` | `0.0` – `1.0` | `0.3` | Paper II |
| `noteMinEvaluations` | integer ≥ 0 | `3` | Paper II |
| `surveyResponseAnonymity` | `anonymous` · `visible` | `anonymous` | Paper II |
| `voteTransparencyOptIn` | per-candidate, not config | N/A | Paper II |
