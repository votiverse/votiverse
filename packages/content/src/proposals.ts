/**
 * @votiverse/content — Proposal metadata lifecycle
 *
 * Manages proposal governance state: submit, version, lock, withdraw.
 * The VCP stores metadata and content hashes. Rich content lives in the backend.
 */

import type {
  EventStore,
  ProposalId,
  IssueId,
  ProposalSubmittedEvent,
  ProposalVersionCreatedEvent,
  ProposalLockedEvent,
  ProposalWithdrawnEvent,
  Timestamp,
  TimeProvider,
} from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generateProposalId,
  NotFoundError,
  InvalidStateError,
} from "@votiverse/core";
import type { ProposalMetadata, SubmitProposalParams, CreateProposalVersionParams, VersionRecord } from "./types.js";

/**
 * Service for managing proposal metadata lifecycle.
 */
export class ProposalService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly timeProvider: TimeProvider,
  ) {}

  /**
   * Submit a new proposal. Records a ProposalSubmitted event.
   *
   * The caller (VCP route) is responsible for validating the deliberation
   * window before calling this method.
   */
  async submit(params: SubmitProposalParams): Promise<ProposalMetadata> {
    const id = generateProposalId();
    const ts = this.timeProvider.now();

    const event = createEvent<ProposalSubmittedEvent>(
      "ProposalSubmitted",
      {
        proposalId: id,
        issueId: params.issueId,
        choiceKey: params.choiceKey,
        authorId: params.authorId,
        title: params.title,
        contentHash: params.contentHash,
      },
      generateEventId(),
      ts,
    );
    await this.eventStore.append(event);

    return {
      id,
      issueId: params.issueId,
      choiceKey: params.choiceKey,
      authorId: params.authorId,
      title: params.title,
      currentVersion: 1,
      versions: [{ versionNumber: 1, contentHash: params.contentHash, createdAt: ts }],
      status: "submitted",
      submittedAt: ts,
    };
  }

  /**
   * Create a new version of a submitted proposal.
   * Rejected if the proposal is locked or withdrawn.
   */
  async createVersion(params: CreateProposalVersionParams): Promise<ProposalMetadata> {
    const proposal = await this.getById(params.proposalId);
    if (!proposal) {
      throw new NotFoundError("proposal", params.proposalId);
    }
    if (proposal.status === "locked") {
      throw new InvalidStateError("Cannot version a locked proposal");
    }
    if (proposal.status === "withdrawn") {
      throw new InvalidStateError("Cannot version a withdrawn proposal");
    }

    const newVersion = proposal.currentVersion + 1;
    const ts = this.timeProvider.now();

    const event = createEvent<ProposalVersionCreatedEvent>(
      "ProposalVersionCreated",
      {
        proposalId: params.proposalId,
        versionNumber: newVersion,
        contentHash: params.contentHash,
      },
      generateEventId(),
      ts,
    );
    await this.eventStore.append(event);

    return {
      ...proposal,
      currentVersion: newVersion,
      versions: [...proposal.versions, { versionNumber: newVersion, contentHash: params.contentHash, createdAt: ts }],
    };
  }

  /**
   * Lock all submitted proposals for an issue. Called when the voting window opens.
   * Returns the number of proposals locked.
   */
  async lockForIssue(issueId: IssueId): Promise<number> {
    const proposals = await this.listByIssue(issueId);
    const submitted = proposals.filter((p) => p.status === "submitted");
    const ts = this.timeProvider.now();

    for (const proposal of submitted) {
      const event = createEvent<ProposalLockedEvent>(
        "ProposalLocked",
        { proposalId: proposal.id, issueId },
        generateEventId(),
        ts,
      );
      await this.eventStore.append(event);
    }

    return submitted.length;
  }

  /**
   * Withdraw a submitted proposal. Locked proposals cannot be withdrawn.
   */
  async withdraw(proposalId: ProposalId, authorId: string): Promise<void> {
    const proposal = await this.getById(proposalId);
    if (!proposal) {
      throw new NotFoundError("proposal", proposalId);
    }
    if (proposal.status === "locked") {
      throw new InvalidStateError("Cannot withdraw a locked proposal — voting is in progress");
    }
    if (proposal.status === "withdrawn") {
      throw new InvalidStateError("Proposal is already withdrawn");
    }

    const event = createEvent<ProposalWithdrawnEvent>(
      "ProposalWithdrawn",
      { proposalId, authorId: authorId as import("@votiverse/core").ParticipantId },
      generateEventId(),
      this.timeProvider.now(),
    );
    await this.eventStore.append(event);
  }

  /**
   * Replay events to reconstruct a proposal's current state.
   */
  async getById(proposalId: ProposalId): Promise<ProposalMetadata | undefined> {
    const events = await this.eventStore.getAll();
    return replayProposal(proposalId, events);
  }

  /**
   * List all proposals for a given issue.
   */
  async listByIssue(issueId: IssueId): Promise<ProposalMetadata[]> {
    const events = await this.eventStore.getAll();
    return replayProposalsByIssue(issueId, events);
  }
}

// ---------------------------------------------------------------------------
// Event replay helpers
// ---------------------------------------------------------------------------

interface MutableProposal {
  id: ProposalId;
  issueId: IssueId;
  choiceKey?: string;
  authorId: import("@votiverse/core").ParticipantId;
  title: string;
  currentVersion: number;
  versions: VersionRecord[];
  status: import("./types.js").ProposalStatus;
  submittedAt: Timestamp;
  lockedAt?: Timestamp;
  withdrawnAt?: Timestamp;
}

function replayProposal(proposalId: ProposalId, events: readonly import("@votiverse/core").DomainEvent[]): ProposalMetadata | undefined {
  let proposal: MutableProposal | undefined;

  for (const event of events) {
    if (event.type === "ProposalSubmitted" && event.payload.proposalId === proposalId) {
      proposal = {
        id: event.payload.proposalId,
        issueId: event.payload.issueId,
        choiceKey: event.payload.choiceKey,
        authorId: event.payload.authorId,
        title: event.payload.title,
        currentVersion: 1,
        versions: [{ versionNumber: 1, contentHash: event.payload.contentHash, createdAt: event.timestamp }],
        status: "submitted",
        submittedAt: event.timestamp,
      };
    } else if (event.type === "ProposalVersionCreated" && event.payload.proposalId === proposalId && proposal) {
      proposal.currentVersion = event.payload.versionNumber;
      proposal.versions = [...proposal.versions, {
        versionNumber: event.payload.versionNumber,
        contentHash: event.payload.contentHash,
        createdAt: event.timestamp,
      }];
    } else if (event.type === "ProposalLocked" && event.payload.proposalId === proposalId && proposal) {
      proposal.status = "locked";
      proposal.lockedAt = event.timestamp;
    } else if (event.type === "ProposalWithdrawn" && event.payload.proposalId === proposalId && proposal) {
      proposal.status = "withdrawn";
      proposal.withdrawnAt = event.timestamp;
    }
  }

  return proposal;
}

function replayProposalsByIssue(issueId: IssueId, events: readonly import("@votiverse/core").DomainEvent[]): ProposalMetadata[] {
  const proposals = new Map<string, MutableProposal>();

  for (const event of events) {
    if (event.type === "ProposalSubmitted" && event.payload.issueId === issueId) {
      proposals.set(event.payload.proposalId, {
        id: event.payload.proposalId,
        issueId: event.payload.issueId,
        choiceKey: event.payload.choiceKey,
        authorId: event.payload.authorId,
        title: event.payload.title,
        currentVersion: 1,
        versions: [{ versionNumber: 1, contentHash: event.payload.contentHash, createdAt: event.timestamp }],
        status: "submitted",
        submittedAt: event.timestamp,
      });
    } else if (event.type === "ProposalVersionCreated") {
      const p = proposals.get(event.payload.proposalId);
      if (p) {
        p.currentVersion = event.payload.versionNumber;
        p.versions = [...p.versions, {
          versionNumber: event.payload.versionNumber,
          contentHash: event.payload.contentHash,
          createdAt: event.timestamp,
        }];
      }
    } else if (event.type === "ProposalLocked") {
      const p = proposals.get(event.payload.proposalId);
      if (p) {
        p.status = "locked";
        p.lockedAt = event.timestamp;
      }
    } else if (event.type === "ProposalWithdrawn") {
      const p = proposals.get(event.payload.proposalId);
      if (p) {
        p.status = "withdrawn";
        p.withdrawnAt = event.timestamp;
      }
    }
  }

  return [...proposals.values()];
}
