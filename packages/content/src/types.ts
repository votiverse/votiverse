/**
 * @votiverse/content — Type definitions
 *
 * Governance metadata types for proposals, delegate candidacies,
 * and community notes. These represent the VCP-side view — metadata
 * and content hashes only, no rich content.
 */

import type {
  CandidacyId,
  ContentHash,
  IssueId,
  NoteId,
  NoteTargetType,
  ParticipantId,
  ProposalId,
  Timestamp,
  TopicId,
} from "@votiverse/core";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** A version record as tracked by the VCP — hash and timestamp, no content. */
export interface VersionRecord {
  readonly versionNumber: number;
  readonly contentHash: ContentHash;
  readonly createdAt: Timestamp;
}

/** Polymorphic reference used by community notes to target any notable entity. */
export interface NoteTarget {
  readonly type: NoteTargetType;
  readonly id: string;
  readonly versionNumber?: number;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export type ProposalStatus = "submitted" | "locked" | "withdrawn";

/** VCP-side proposal metadata. Rich content lives in the client backend. */
export interface ProposalMetadata {
  readonly id: ProposalId;
  readonly issueId: IssueId;
  readonly choiceKey?: string;
  readonly authorId: ParticipantId;
  readonly title: string;
  readonly currentVersion: number;
  readonly versions: readonly VersionRecord[];
  readonly status: ProposalStatus;
  readonly endorsementCount: number;
  readonly disputeCount: number;
  readonly featured: boolean;
  readonly submittedAt: Timestamp;
  readonly lockedAt?: Timestamp;
  readonly withdrawnAt?: Timestamp;
}

/** Parameters for submitting a new proposal. */
export interface SubmitProposalParams {
  readonly issueId: IssueId;
  readonly choiceKey?: string;
  readonly authorId: ParticipantId;
  readonly title: string;
  readonly contentHash: ContentHash;
}

/** Parameters for creating a new proposal version. */
export interface CreateProposalVersionParams {
  readonly proposalId: ProposalId;
  readonly contentHash: ContentHash;
}

// ---------------------------------------------------------------------------
// Candidacies
// ---------------------------------------------------------------------------

export type CandidacyStatus = "active" | "withdrawn";

/** VCP-side candidacy metadata. Rich content lives in the client backend. */
export interface CandidacyMetadata {
  readonly id: CandidacyId;
  readonly participantId: ParticipantId;
  readonly topicScope: readonly TopicId[];
  readonly voteTransparencyOptIn: boolean;
  readonly currentVersion: number;
  readonly versions: readonly VersionRecord[];
  readonly status: CandidacyStatus;
  readonly declaredAt: Timestamp;
  readonly withdrawnAt?: Timestamp;
}

/** Parameters for declaring a new candidacy. */
export interface DeclareCandidacyParams {
  readonly participantId: ParticipantId;
  readonly topicScope: readonly TopicId[];
  readonly voteTransparencyOptIn: boolean;
  readonly contentHash: ContentHash;
}

/** Parameters for creating a new candidacy version. */
export interface CreateCandidacyVersionParams {
  readonly candidacyId: CandidacyId;
  readonly contentHash: ContentHash;
  readonly topicScope?: readonly TopicId[];
  readonly voteTransparencyOptIn?: boolean;
}

// ---------------------------------------------------------------------------
// Community Notes
// ---------------------------------------------------------------------------

export type NoteStatus = "proposed" | "withdrawn";

/** VCP-side community note metadata. Note text lives in the client backend. */
export interface NoteMetadata {
  readonly id: NoteId;
  readonly authorId: ParticipantId;
  readonly contentHash: ContentHash;
  readonly target: NoteTarget;
  readonly endorsementCount: number;
  readonly disputeCount: number;
  readonly status: NoteStatus;
  readonly createdAt: Timestamp;
  readonly withdrawnAt?: Timestamp;
}

/** Parameters for creating a community note. */
export interface CreateNoteParams {
  readonly authorId: ParticipantId;
  readonly contentHash: ContentHash;
  readonly targetType: NoteTargetType;
  readonly targetId: string;
  readonly targetVersionNumber?: number;
}

/** Result of computing note visibility against the configured threshold. */
export interface NoteVisibility {
  readonly visible: boolean;
  readonly endorsementCount: number;
  readonly disputeCount: number;
  readonly totalEvaluations: number;
  readonly ratio: number;
  readonly belowMinEvaluations: boolean;
}
