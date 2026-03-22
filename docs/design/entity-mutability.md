# Entity Mutability Reference

This document is the authoritative reference for entity mutability across the Votiverse platform. It classifies every persisted entity by how it can change after creation. Use this to determine caching safety, replication strategy, and consistency requirements.

---

## Mutability Categories

| Category | Meaning | Cache implications |
|----------|---------|-------------------|
| **IMMUTABLE** | Never changes after creation. No UPDATE or DELETE. | Safe to cache forever. No invalidation needed. |
| **APPEND-ONLY** | New records are added; existing records never change. State changes are expressed as new events, not mutations. | Safe to cache individual records forever. Lists need refresh to pick up new entries. |
| **REVOCABLE** | Created once, never updated, but can be logically or physically deleted. | Cache with event-driven invalidation on revocation. |
| **MUTABLE** | One or more fields can be updated after creation. | Cache with TTL or explicit invalidation. |

---

## VCP Entities

### Event Store (Core Event Log)

| Entity | Category | Notes |
|--------|----------|-------|
| **Events** | IMMUTABLE | Append-only log. Each event is written once with a unique `EventId`. No updates, no deletes. All state changes in the system are derived from replaying this log. |

### Governance Entities

| Entity | Category | Immutable fields | Mutable fields | Notes |
|--------|----------|-----------------|----------------|-------|
| **Assemblies** | MUTABLE (limited) | `id`, `name`, `config`, `created_at`, `organization_id` | `status` | Config is set at creation and never changes. Status transitions (active → archived) are rare. |
| **Participants** | MUTABLE (status) | `id`, `assembly_id`, `name`, `registered_at` | `status` (active → inactive → sunset) | Status change cascades: sunsetting a participant auto-revokes their delegations. Hard delete also supported. |
| **Topics** | IMMUTABLE | All fields | — | Created during assembly setup. Never updated or deleted. |
| **Voting Events** | IMMUTABLE | All fields (`id`, `title`, `description`, `timeline`, `eligibleParticipantIds`) | — | Created once. Closure is recorded as a separate event in the event log, not a mutation on the voting event record. |
| **Issues** | APPEND-ONLY | `id`, `title`, `description`, `topic_id`, `voting_event_id`, `choices` | — | Cancellation is recorded as an `IssueCancelled` event in the event log, not as a field update. The issue record itself never changes. |
| **Votes** | IMMUTABLE | All fields | — | Once cast, a vote cannot be changed or retracted. The engine enforces this: `allowVoteChange` is always false. |
| **Delegations** | REVOCABLE | `id`, `sourceId`, `targetId`, `topicScope`, `issueScope`, `createdAt` | — | Cannot be updated. Can only be revoked (DELETE) or auto-replaced when a new delegation supersedes it. |
| **Surveys** | IMMUTABLE | All fields | — | Immutable after creation. Survey responses are separate records. |
| **Predictions** | IMMUTABLE | All fields including `commitmentHash` | — | Commitment-locked. The original prediction is never modified. Outcome data is recorded as separate `OutcomeRecorded` events. |
| **Assembly Roles** | REVOCABLE | `assembly_id`, `participant_id`, `role`, `granted_by`, `granted_at` | — | Roles are granted and revoked via events. Once granted, the role record itself is immutable — revocation is a DELETE. |

### Content Metadata (VCP side — governance metadata only)

| Entity | Category | Immutable fields | Mutable fields | Notes |
|--------|----------|-----------------|----------------|-------|
| **Proposals** | MUTABLE | `id`, `assembly_id`, `issue_id`, `author_id`, `title`, `submitted_at`, `choice_key` | `current_version`, `endorsement_count`, `dispute_count`, `featured`, `status`, `locked_at`, `withdrawn_at` | Versioned. Endorsement/dispute counts change on evaluation toggle. Status transitions: submitted → locked → withdrawn. |
| **Proposal Versions** | IMMUTABLE | All fields | — | Each version is a new record. Append-only history. |
| **Proposal Endorsements** | MUTABLE | `assembly_id`, `proposal_id`, `participant_id` | `evaluation` (endorse ↔ dispute ↔ null) | Evaluation can be toggled. Upsert pattern. |
| **Candidacies** | MUTABLE | `id`, `assembly_id`, `participant_id`, `declared_at` | `current_version`, `topic_scope`, `vote_transparency_opt_in`, `status`, `withdrawn_at` | Versioned. Topic scope can be updated. |
| **Candidacy Versions** | IMMUTABLE | All fields | — | Append-only version history. |
| **Community Notes** | MUTABLE | `id`, `assembly_id`, `author_id`, `content_hash`, `target_type`, `target_id`, `target_version_number`, `created_at` | `endorsement_count`, `dispute_count`, `status`, `withdrawn_at` | Content itself is immutable (single version). Evaluation counts and status change. |
| **Note Evaluations** | MUTABLE | `assembly_id`, `note_id`, `participant_id` | `evaluation` (endorse ↔ dispute ↔ null) | Same toggle pattern as proposal endorsements. |
| **Booklet Recommendations** | MUTABLE | `assembly_id`, `event_id`, `issue_id`, `created_at` | `content_hash`, `author_id`, `updated_at` | Editorial content that can be revised. Can also be deleted. |

### Materialized Views (Computed, Read-Only)

| Entity | Category | Notes |
|--------|----------|-------|
| **Issue Participation** | IMMUTABLE (after computation) | Computed at tally time when a voting event closes. Never updated afterward. |
| **Issue Tallies** | IMMUTABLE (after computation) | Computed once when a voting event closes. Winner, counts, quorum — all frozen. |
| **Issue Weights** | IMMUTABLE (after computation) | Delegation weight distribution, frozen at close time. |
| **Issue Concentration** | IMMUTABLE (after computation) | Gini coefficient, max weight, chain length distribution — frozen at close time. |
| **Voting Event Creators** | IMMUTABLE | Historical attribution record. Written once. |

### Infrastructure

| Entity | Category | Notes |
|--------|----------|-------|
| **Clients** | MUTABLE | `assembly_access` and `rate_limits` can be updated. |
| **Webhook Subscriptions** | MUTABLE | `status` can toggle between active/inactive. |

---

## Backend Entities

### Identity & Auth

| Entity | Category | Immutable fields | Mutable fields | Notes |
|--------|----------|-----------------|----------------|-------|
| **Users** | MUTABLE | `id`, `email`, `created_at` | `name`, `handle`, `avatar_url`, `bio`, `status`, `password_hash` | Profile fields are user-editable. Password updated separately. |
| **Refresh Tokens** | REVOCABLE | `id`, `user_id`, `token_hash`, `expires_at`, `created_at` | `revoked_at` | Revocation is one-way: once set, never unset. |
| **Memberships** | IMMUTABLE | All fields | — | Permanent record of user → participant mapping. Cascade-deleted only if user is deleted. |

### Caches (VCP data replicated locally)

| Entity | Category | Notes |
|--------|----------|-------|
| **Assemblies Cache** | MOSTLY IMMUTABLE | `admission_mode` is backend-owned and mutable. All other fields are copied from VCP and never change. |
| **Topics Cache** | IMMUTABLE | Exact copy of VCP topic data. Topics never change. |
| **Surveys Cache** | IMMUTABLE | Exact copy of VCP survey metadata. Surveys never change. |

### Content (Backend-owned rich content)

| Entity | Category | Notes |
|--------|----------|-------|
| **Proposal Drafts** | MUTABLE + DELETABLE | Temporary. Title, markdown, assets updated while drafting. Deleted on submission to VCP. |
| **Proposal Content** | IMMUTABLE | Versioned. Each version is a new record with its own `version_number`. Content hashes link to VCP metadata. |
| **Candidacy Content** | IMMUTABLE | Same versioned pattern as proposals. |
| **Note Content** | IMMUTABLE | Single record per note (no versioning). Written once. |
| **Booklet Recommendation Content** | MUTABLE | Markdown and content hash can be updated. Can be deleted. |
| **Assets** | IMMUTABLE | Binary blobs (images, PDFs). Written once, never modified. |

### Notifications & Scheduling

| Entity | Category | Immutable fields | Mutable fields | Notes |
|--------|----------|-----------------|----------------|-------|
| **Tracked Events** | MUTABLE (flags) | `id`, `assembly_id`, `title`, `voting_start`, `voting_end` | `notified_created`, `notified_voting_open`, `notified_deadline`, `notified_closed` | Boolean flags toggled as notifications are sent. Event metadata is immutable. |
| **Tracked Surveys** | MUTABLE (flags) | `id`, `assembly_id`, `title`, `schedule`, `closes_at` | `notified_created`, `notified_deadline`, `notified_closed` | Same pattern as tracked events. |
| **Notifications** | MUTABLE (read status) | All content fields | `read_at` | Notification content is immutable. Only the read timestamp changes. |
| **Notification Preferences** | MUTABLE | — | All (key-value upsert) | Arbitrary user preferences. |
| **Survey Responses** | IMMUTABLE | All fields | — | One-way latch. Once recorded, never reverted. Enforces non-delegable survey constraint. |

### Invitations & Admission

| Entity | Category | Immutable fields | Mutable fields | Notes |
|--------|----------|-----------------|----------------|-------|
| **Invitations** | MUTABLE | `id`, `assembly_id`, `type`, `token`, `invited_by`, `created_at` | `use_count`, `status` | Use count increments on acceptance. Status transitions: active → used/revoked. |
| **Invitation Acceptances** | IMMUTABLE | All fields | — | Audit trail. Append-only. |
| **Join Requests** | MUTABLE | `id`, `assembly_id`, `user_id`, `created_at` | `status`, `reviewed_by`, `reviewed_at` | Status transitions: pending → approved/rejected. |

### Devices

| Entity | Category | Notes |
|--------|----------|-------|
| **Device Tokens** | MUTABLE + DELETABLE | `updated_at` refreshed on re-registration. Can be deleted (unregister). |
