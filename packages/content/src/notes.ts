/**
 * @votiverse/content — Community note lifecycle and evaluation
 *
 * Manages community note creation, evaluation (endorse/dispute),
 * withdrawal, and visibility computation.
 */

import type {
  EventStore,
  NoteId,
  ParticipantId,
  NoteEvaluation,
  NoteTargetType,
  CommunityNoteCreatedEvent,
  CommunityNoteEvaluatedEvent,
  CommunityNoteWithdrawnEvent,
  DomainEvent,
  ContentHash,
  TimeProvider,
} from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generateNoteId,
  NotFoundError,
  InvalidStateError,
  ValidationError,
} from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import type { NoteMetadata, NoteStatus, NoteTarget, NoteVisibility, CreateNoteParams } from "./types.js";

/**
 * Service for managing community notes and their evaluations.
 */
export class NoteService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
    private readonly timeProvider: TimeProvider,
  ) {}

  /**
   * Create a new community note attached to a target.
   */
  async create(params: CreateNoteParams): Promise<NoteMetadata> {
    if (!this.config.features.communityNotes) {
      throw new ValidationError("communityNotes", "Community notes are disabled in this assembly");
    }

    const id = generateNoteId();
    const ts = this.timeProvider.now();

    const event = createEvent<CommunityNoteCreatedEvent>(
      "CommunityNoteCreated",
      {
        noteId: id,
        authorId: params.authorId,
        contentHash: params.contentHash,
        targetType: params.targetType,
        targetId: params.targetId,
        targetVersionNumber: params.targetVersionNumber,
      },
      generateEventId(),
      ts,
    );
    await this.eventStore.append(event);

    return {
      id,
      authorId: params.authorId,
      contentHash: params.contentHash,
      target: {
        type: params.targetType,
        id: params.targetId,
        versionNumber: params.targetVersionNumber,
      },
      endorsementCount: 0,
      disputeCount: 0,
      status: "proposed",
      createdAt: ts,
    };
  }

  /**
   * Evaluate a note (endorse or dispute). One evaluation per participant per note.
   * A new evaluation supersedes any previous evaluation by the same participant.
   */
  async evaluate(noteId: NoteId, participantId: ParticipantId, evaluation: NoteEvaluation): Promise<void> {
    const note = await this.getById(noteId);
    if (!note) {
      throw new NotFoundError("community-note", noteId);
    }
    if (note.status === "withdrawn") {
      throw new InvalidStateError("Cannot evaluate a withdrawn note");
    }
    if (note.authorId === participantId) {
      throw new ValidationError("participantId", "Cannot evaluate your own note");
    }

    const event = createEvent<CommunityNoteEvaluatedEvent>(
      "CommunityNoteEvaluated",
      { noteId, participantId, evaluation },
      generateEventId(),
      this.timeProvider.now(),
    );
    await this.eventStore.append(event);
  }

  /**
   * Withdraw a note. Only the author can withdraw. The record is preserved.
   */
  async withdraw(noteId: NoteId, authorId: ParticipantId): Promise<void> {
    const note = await this.getById(noteId);
    if (!note) {
      throw new NotFoundError("community-note", noteId);
    }
    if (note.status === "withdrawn") {
      throw new InvalidStateError("Note is already withdrawn");
    }

    const event = createEvent<CommunityNoteWithdrawnEvent>(
      "CommunityNoteWithdrawn",
      { noteId, authorId },
      generateEventId(),
      this.timeProvider.now(),
    );
    await this.eventStore.append(event);
  }

  /** Get a note by ID via event replay. */
  async getById(noteId: NoteId): Promise<NoteMetadata | undefined> {
    const events = await this.eventStore.getAll();
    return replayNote(noteId, events);
  }

  /** List all notes for a given target. */
  async listByTarget(targetType: NoteTargetType, targetId: string): Promise<NoteMetadata[]> {
    const events = await this.eventStore.getAll();
    return replayNotesByTarget(targetType, targetId, events);
  }

  /**
   * Compute the visibility of a note based on the assembly's configured thresholds.
   */
  computeVisibility(note: NoteMetadata): NoteVisibility {
    const NOTE_MIN_EVALUATIONS = 3;
    const NOTE_VISIBILITY_THRESHOLD = 0.3;

    const total = note.endorsementCount + note.disputeCount;
    const belowMin = total < NOTE_MIN_EVALUATIONS;
    const ratio = total === 0 ? 0 : note.endorsementCount / total;
    const visible = !belowMin && ratio >= NOTE_VISIBILITY_THRESHOLD;

    return {
      visible,
      endorsementCount: note.endorsementCount,
      disputeCount: note.disputeCount,
      totalEvaluations: total,
      ratio,
      belowMinEvaluations: belowMin,
    };
  }
}

/**
 * Pure function to compute note visibility. Useful outside the service context.
 */
export function computeNoteVisibility(
  endorsementCount: number,
  disputeCount: number,
  threshold: number,
  minEvaluations: number,
): NoteVisibility {
  const total = endorsementCount + disputeCount;
  const belowMin = total < minEvaluations;
  const ratio = total === 0 ? 0 : endorsementCount / total;
  const visible = !belowMin && ratio >= threshold;

  return {
    visible,
    endorsementCount,
    disputeCount,
    totalEvaluations: total,
    ratio,
    belowMinEvaluations: belowMin,
  };
}

// ---------------------------------------------------------------------------
// Event replay helpers
// ---------------------------------------------------------------------------

interface MutableNote {
  id: NoteId;
  authorId: ParticipantId;
  contentHash: ContentHash;
  target: NoteTarget;
  evaluations: Map<string, NoteEvaluation>; // participantId → latest evaluation
  status: NoteStatus;
  createdAt: import("@votiverse/core").Timestamp;
  withdrawnAt?: import("@votiverse/core").Timestamp;
}

function materializeNote(note: MutableNote): NoteMetadata {
  let endorsements = 0;
  let disputes = 0;
  for (const eval_ of note.evaluations.values()) {
    if (eval_ === "endorse") endorsements++;
    else disputes++;
  }
  return {
    id: note.id,
    authorId: note.authorId,
    contentHash: note.contentHash,
    target: note.target,
    endorsementCount: endorsements,
    disputeCount: disputes,
    status: note.status,
    createdAt: note.createdAt,
    withdrawnAt: note.withdrawnAt,
  };
}

function replayNote(noteId: NoteId, events: readonly DomainEvent[]): NoteMetadata | undefined {
  let note: MutableNote | undefined;

  for (const event of events) {
    if (event.type === "CommunityNoteCreated" && event.payload.noteId === noteId) {
      note = {
        id: event.payload.noteId,
        authorId: event.payload.authorId,
        contentHash: event.payload.contentHash,
        target: {
          type: event.payload.targetType,
          id: event.payload.targetId,
          versionNumber: event.payload.targetVersionNumber,
        },
        evaluations: new Map(),
        status: "proposed",
        createdAt: event.timestamp,
      };
    } else if (event.type === "CommunityNoteEvaluated" && event.payload.noteId === noteId && note) {
      note.evaluations.set(event.payload.participantId, event.payload.evaluation);
    } else if (event.type === "CommunityNoteWithdrawn" && event.payload.noteId === noteId && note) {
      note.status = "withdrawn";
      note.withdrawnAt = event.timestamp;
    }
  }

  return note ? materializeNote(note) : undefined;
}

function replayNotesByTarget(targetType: NoteTargetType, targetId: string, events: readonly DomainEvent[]): NoteMetadata[] {
  const notes = new Map<string, MutableNote>();

  for (const event of events) {
    if (event.type === "CommunityNoteCreated" && event.payload.targetType === targetType && event.payload.targetId === targetId) {
      notes.set(event.payload.noteId, {
        id: event.payload.noteId,
        authorId: event.payload.authorId,
        contentHash: event.payload.contentHash,
        target: {
          type: event.payload.targetType,
          id: event.payload.targetId,
          versionNumber: event.payload.targetVersionNumber,
        },
        evaluations: new Map(),
        status: "proposed",
        createdAt: event.timestamp,
      });
    } else if (event.type === "CommunityNoteEvaluated") {
      const n = notes.get(event.payload.noteId);
      if (n) n.evaluations.set(event.payload.participantId, event.payload.evaluation);
    } else if (event.type === "CommunityNoteWithdrawn") {
      const n = notes.get(event.payload.noteId);
      if (n) {
        n.status = "withdrawn";
        n.withdrawnAt = event.timestamp;
      }
    }
  }

  return [...notes.values()].map(materializeNote);
}
