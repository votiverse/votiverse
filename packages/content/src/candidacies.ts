/**
 * @votiverse/content — Candidacy metadata lifecycle
 *
 * Manages delegate candidacy governance state: declare, version, withdraw, reactivate.
 * The VCP stores metadata and content hashes. Rich content lives in the backend.
 */

import type {
  CandidacyId,
  EventStore,
  ParticipantId,
  CandidacyDeclaredEvent,
  CandidacyVersionCreatedEvent,
  CandidacyWithdrawnEvent,
  DomainEvent,
  Timestamp,
  TimeProvider,
  TopicId,
} from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generateCandidacyId,
  NotFoundError,
  InvalidStateError,
} from "@votiverse/core";
import type { CandidacyMetadata, CandidacyStatus, DeclareCandidacyParams, CreateCandidacyVersionParams, VersionRecord } from "./types.js";

/**
 * Service for managing delegate candidacy metadata lifecycle.
 */
export class CandidacyService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly timeProvider: TimeProvider,
  ) {}

  /**
   * Declare a new candidacy. If the participant has a withdrawn candidacy,
   * this creates a fresh candidacy (new ID, new version history).
   */
  async declare(params: DeclareCandidacyParams): Promise<CandidacyMetadata> {
    // Check for existing active candidacy
    const existing = await this.getByParticipant(params.participantId);
    if (existing && existing.status === "active") {
      throw new InvalidStateError("Participant already has an active candidacy — update it with a new version instead");
    }

    const id = existing ? existing.id : generateCandidacyId();
    const ts = this.timeProvider.now();

    if (existing && existing.status === "withdrawn") {
      // Reactivate: create a new version on the existing candidacy
      const newVersion = existing.currentVersion + 1;
      const event = createEvent<CandidacyVersionCreatedEvent>(
        "CandidacyVersionCreated",
        {
          candidacyId: id,
          versionNumber: newVersion,
          contentHash: params.contentHash,
          topicScope: params.topicScope,
          voteTransparencyOptIn: params.voteTransparencyOptIn,
        },
        generateEventId(),
        ts,
      );
      await this.eventStore.append(event);

      return {
        ...existing,
        topicScope: params.topicScope,
        voteTransparencyOptIn: params.voteTransparencyOptIn,
        currentVersion: newVersion,
        versions: [...existing.versions, { versionNumber: newVersion, contentHash: params.contentHash, createdAt: ts }],
        status: "active",
        withdrawnAt: undefined,
      };
    }

    // New candidacy
    const event = createEvent<CandidacyDeclaredEvent>(
      "CandidacyDeclared",
      {
        candidacyId: id,
        participantId: params.participantId,
        topicScope: params.topicScope,
        voteTransparencyOptIn: params.voteTransparencyOptIn,
        contentHash: params.contentHash,
      },
      generateEventId(),
      ts,
    );
    await this.eventStore.append(event);

    return {
      id,
      participantId: params.participantId,
      topicScope: params.topicScope,
      voteTransparencyOptIn: params.voteTransparencyOptIn,
      currentVersion: 1,
      versions: [{ versionNumber: 1, contentHash: params.contentHash, createdAt: ts }],
      status: "active",
      declaredAt: ts,
    };
  }

  /**
   * Create a new version of an active candidacy.
   */
  async createVersion(params: CreateCandidacyVersionParams): Promise<CandidacyMetadata> {
    const candidacy = await this.getById(params.candidacyId);
    if (!candidacy) {
      throw new NotFoundError("candidacy", params.candidacyId);
    }
    if (candidacy.status === "withdrawn") {
      throw new InvalidStateError("Cannot version a withdrawn candidacy — re-declare instead");
    }

    const newVersion = candidacy.currentVersion + 1;
    const ts = this.timeProvider.now();

    const event = createEvent<CandidacyVersionCreatedEvent>(
      "CandidacyVersionCreated",
      {
        candidacyId: params.candidacyId,
        versionNumber: newVersion,
        contentHash: params.contentHash,
        topicScope: params.topicScope,
        voteTransparencyOptIn: params.voteTransparencyOptIn,
      },
      generateEventId(),
      ts,
    );
    await this.eventStore.append(event);

    return {
      ...candidacy,
      topicScope: params.topicScope ?? candidacy.topicScope,
      voteTransparencyOptIn: params.voteTransparencyOptIn ?? candidacy.voteTransparencyOptIn,
      currentVersion: newVersion,
      versions: [...candidacy.versions, { versionNumber: newVersion, contentHash: params.contentHash, createdAt: ts }],
    };
  }

  /**
   * Withdraw a candidacy. Existing delegations to this participant remain active.
   */
  async withdraw(candidacyId: CandidacyId, participantId: ParticipantId): Promise<void> {
    const candidacy = await this.getById(candidacyId);
    if (!candidacy) {
      throw new NotFoundError("candidacy", candidacyId);
    }
    if (candidacy.status === "withdrawn") {
      throw new InvalidStateError("Candidacy is already withdrawn");
    }

    const event = createEvent<CandidacyWithdrawnEvent>(
      "CandidacyWithdrawn",
      { candidacyId, participantId },
      generateEventId(),
      this.timeProvider.now(),
    );
    await this.eventStore.append(event);
  }

  /** Get a candidacy by ID via event replay. */
  async getById(candidacyId: CandidacyId): Promise<CandidacyMetadata | undefined> {
    const events = await this.eventStore.getAll();
    return replayCandidacy(candidacyId, events);
  }

  /** Get a candidacy by participant ID (at most one per participant). */
  async getByParticipant(participantId: ParticipantId): Promise<CandidacyMetadata | undefined> {
    const events = await this.eventStore.getAll();
    return replayCandidacyByParticipant(participantId, events);
  }
}

// ---------------------------------------------------------------------------
// Event replay helpers
// ---------------------------------------------------------------------------

interface MutableCandidacy {
  id: CandidacyId;
  participantId: ParticipantId;
  topicScope: readonly TopicId[];
  voteTransparencyOptIn: boolean;
  currentVersion: number;
  versions: VersionRecord[];
  status: CandidacyStatus;
  declaredAt: Timestamp;
  withdrawnAt?: Timestamp;
}

function replayCandidacy(candidacyId: CandidacyId, events: readonly DomainEvent[]): CandidacyMetadata | undefined {
  let candidacy: MutableCandidacy | undefined;

  for (const event of events) {
    if (event.type === "CandidacyDeclared" && event.payload.candidacyId === candidacyId) {
      candidacy = {
        id: event.payload.candidacyId,
        participantId: event.payload.participantId,
        topicScope: event.payload.topicScope,
        voteTransparencyOptIn: event.payload.voteTransparencyOptIn,
        currentVersion: 1,
        versions: [{ versionNumber: 1, contentHash: event.payload.contentHash, createdAt: event.timestamp }],
        status: "active",
        declaredAt: event.timestamp,
      };
    } else if (event.type === "CandidacyVersionCreated" && event.payload.candidacyId === candidacyId && candidacy) {
      candidacy.currentVersion = event.payload.versionNumber;
      candidacy.versions = [...candidacy.versions, {
        versionNumber: event.payload.versionNumber,
        contentHash: event.payload.contentHash,
        createdAt: event.timestamp,
      }];
      if (event.payload.topicScope) candidacy.topicScope = event.payload.topicScope;
      if (event.payload.voteTransparencyOptIn !== undefined) candidacy.voteTransparencyOptIn = event.payload.voteTransparencyOptIn;
      // A version on a withdrawn candidacy reactivates it
      if (candidacy.status === "withdrawn") {
        candidacy.status = "active";
        candidacy.withdrawnAt = undefined;
      }
    } else if (event.type === "CandidacyWithdrawn" && event.payload.candidacyId === candidacyId && candidacy) {
      candidacy.status = "withdrawn";
      candidacy.withdrawnAt = event.timestamp;
    }
  }

  return candidacy;
}

function replayCandidacyByParticipant(participantId: ParticipantId, events: readonly DomainEvent[]): CandidacyMetadata | undefined {
  let candidacy: MutableCandidacy | undefined;

  for (const event of events) {
    if (event.type === "CandidacyDeclared" && event.payload.participantId === participantId) {
      candidacy = {
        id: event.payload.candidacyId,
        participantId: event.payload.participantId,
        topicScope: event.payload.topicScope,
        voteTransparencyOptIn: event.payload.voteTransparencyOptIn,
        currentVersion: 1,
        versions: [{ versionNumber: 1, contentHash: event.payload.contentHash, createdAt: event.timestamp }],
        status: "active",
        declaredAt: event.timestamp,
      };
    } else if (candidacy && event.type === "CandidacyVersionCreated" && event.payload.candidacyId === candidacy.id) {
      candidacy.currentVersion = event.payload.versionNumber;
      candidacy.versions = [...candidacy.versions, {
        versionNumber: event.payload.versionNumber,
        contentHash: event.payload.contentHash,
        createdAt: event.timestamp,
      }];
      if (event.payload.topicScope) candidacy.topicScope = event.payload.topicScope;
      if (event.payload.voteTransparencyOptIn !== undefined) candidacy.voteTransparencyOptIn = event.payload.voteTransparencyOptIn;
      if (candidacy.status === "withdrawn") {
        candidacy.status = "active";
        candidacy.withdrawnAt = undefined;
      }
    } else if (candidacy && event.type === "CandidacyWithdrawn" && event.payload.candidacyId === candidacy.id) {
      candidacy.status = "withdrawn";
      candidacy.withdrawnAt = event.timestamp;
    }
  }

  return candidacy;
}
