/**
 * @votiverse/scoring — ScoringService
 *
 * Manages scoring events, scorecards, and ranking computation.
 * Non-delegable — every evaluator scores for themselves.
 */

import type {
  EventStore,
  TimeProvider,
  ParticipantId,
  ScoringEventId,
  EntryId,
  ScoringEventCreatedPayload,
  ScorecardSubmittedPayload,
  ScorecardRevisedPayload,
  ScoringEventClosedPayload,
  ScoringEventCreatedEvent,
  ScorecardSubmittedEvent,
  ScorecardRevisedEvent,
  ScoringEventClosedEvent,
} from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generateScoringEventId,
  generateEntryId,
  generateScorecardId,
  systemTime,
  ValidationError,
  InvalidStateError,
  NotFoundError,
} from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";

import type {
  ScoringEvent,
  ScoringStatus,
  Scorecard,
  ScoringResult,
  CreateScoringEventParams,
  SubmitScorecardParams,
  ReviseScorecardParams,
  Rubric,
  DimensionScore,
} from "./types.js";
import { computeRanking } from "./aggregation.js";

export class ScoringService {
  private readonly timeProvider: TimeProvider;
  private readonly scoringEvents = new Map<ScoringEventId, ScoringEvent>();
  /** Keyed by composite: scoringEventId::evaluatorId::entryId → latest Scorecard */
  private readonly scorecards = new Map<string, Scorecard>();

  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
    timeProvider?: TimeProvider,
  ) {
    this.timeProvider = timeProvider ?? systemTime;
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /** Create a new scoring event. */
  async create(params: CreateScoringEventParams): Promise<ScoringEvent> {
    this.requireScoringEnabled();

    if (!params.title.trim()) {
      throw new ValidationError("title", "Title is required");
    }
    if (params.entries.length === 0) {
      throw new ValidationError("entries", "At least one entry is required");
    }
    this.validateRubric(params.rubric);
    if (params.timeline.opensAt >= params.timeline.closesAt) {
      throw new ValidationError("timeline", "opensAt must be before closesAt");
    }

    const scoringEventId = generateScoringEventId();
    const now = this.timeProvider.now();

    const entries = params.entries.map((e) => ({
      id: generateEntryId(),
      title: e.title,
      ...(e.description !== undefined ? { description: e.description } : {}),
    }));

    const payload: ScoringEventCreatedPayload = {
      scoringEventId,
      title: params.title,
      description: params.description,
      entries,
      rubric: params.rubric,
      panelMemberIds: params.panelMemberIds,
      timeline: params.timeline,
      settings: params.settings,
    };

    const event = createEvent<ScoringEventCreatedEvent>(
      "ScoringEventCreated",
      payload,
      generateEventId(),
      now,
    );
    await this.eventStore.append(event);

    const scoringEvent: ScoringEvent = {
      id: scoringEventId,
      title: params.title,
      description: params.description,
      entries,
      rubric: params.rubric,
      panelMemberIds: params.panelMemberIds,
      timeline: params.timeline,
      settings: params.settings,
      createdAt: now,
      manuallyClosed: false,
    };
    this.scoringEvents.set(scoringEventId, scoringEvent);

    return scoringEvent;
  }

  /** Submit a scorecard for an entry. */
  async submitScorecard(params: SubmitScorecardParams): Promise<Scorecard> {
    this.requireScoringEnabled();

    const scoringEvent = this.getScoringEventOrThrow(params.scoringEventId);
    this.requireOpen(scoringEvent);
    this.requireEligible(scoringEvent, params.evaluatorId);
    this.requireEntryExists(scoringEvent, params.entryId);

    // Check for duplicate
    const compositeKey = this.compositeKey(params.scoringEventId, params.evaluatorId, params.entryId);
    if (this.scorecards.has(compositeKey)) {
      throw new InvalidStateError(
        "Scorecard already submitted for this entry. Use revise to update.",
      );
    }

    this.validateScores(scoringEvent.rubric, params.scores);

    const scorecardId = generateScorecardId();
    const now = this.timeProvider.now();

    const payload: ScorecardSubmittedPayload = {
      scorecardId,
      scoringEventId: params.scoringEventId,
      evaluatorId: params.evaluatorId,
      entryId: params.entryId,
      scores: params.scores,
    };

    const event = createEvent<ScorecardSubmittedEvent>(
      "ScorecardSubmitted",
      payload,
      generateEventId(),
      now,
    );
    await this.eventStore.append(event);

    const scorecard: Scorecard = {
      id: scorecardId,
      scoringEventId: params.scoringEventId,
      evaluatorId: params.evaluatorId,
      entryId: params.entryId,
      scores: params.scores,
      submittedAt: now,
    };
    this.scorecards.set(compositeKey, scorecard);

    return scorecard;
  }

  /** Revise a previously submitted scorecard. */
  async reviseScorecard(params: ReviseScorecardParams): Promise<Scorecard> {
    this.requireScoringEnabled();

    const scoringEvent = this.getScoringEventOrThrow(params.scoringEventId);
    this.requireOpen(scoringEvent);

    if (!scoringEvent.settings.allowRevision) {
      throw new InvalidStateError("Revision is not allowed for this scoring event");
    }

    const compositeKey = this.compositeKey(params.scoringEventId, params.evaluatorId, params.entryId);
    const existing = this.scorecards.get(compositeKey);
    if (!existing) {
      throw new NotFoundError("Scorecard", `${params.evaluatorId}::${params.entryId}`);
    }

    this.validateScores(scoringEvent.rubric, params.scores);

    const now = this.timeProvider.now();

    const payload: ScorecardRevisedPayload = {
      scorecardId: existing.id,
      scoringEventId: params.scoringEventId,
      evaluatorId: params.evaluatorId,
      entryId: params.entryId,
      scores: params.scores,
    };

    const event = createEvent<ScorecardRevisedEvent>(
      "ScorecardRevised",
      payload,
      generateEventId(),
      now,
    );
    await this.eventStore.append(event);

    const revised: Scorecard = {
      ...existing,
      scores: params.scores,
      submittedAt: now,
    };
    this.scorecards.set(compositeKey, revised);

    return revised;
  }

  /** Close a scoring event. */
  async close(scoringEventId: ScoringEventId): Promise<void> {
    this.requireScoringEnabled();

    const scoringEvent = this.getScoringEventOrThrow(scoringEventId);
    if (scoringEvent.manuallyClosed) {
      throw new InvalidStateError("Scoring event is already closed");
    }

    const payload: ScoringEventClosedPayload = { scoringEventId };
    const event = createEvent<ScoringEventClosedEvent>(
      "ScoringEventClosed",
      payload,
      generateEventId(),
      this.timeProvider.now(),
    );
    await this.eventStore.append(event);

    this.scoringEvents.set(scoringEventId, {
      ...scoringEvent,
      manuallyClosed: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Get a scoring event by ID. */
  getScoringEvent(scoringEventId: ScoringEventId): ScoringEvent | undefined {
    return this.scoringEvents.get(scoringEventId);
  }

  /** List all scoring events. */
  getAllScoringEvents(): readonly ScoringEvent[] {
    return [...this.scoringEvents.values()];
  }

  /** Get all scorecards for a scoring event. */
  getScorecards(scoringEventId: ScoringEventId): readonly Scorecard[] {
    const result: Scorecard[] = [];
    for (const [key, sc] of this.scorecards) {
      if (key.startsWith(`${scoringEventId}::`)) {
        result.push(sc);
      }
    }
    return result;
  }

  /** Get a scorecard by its composite key. */
  getScorecard(
    scoringEventId: ScoringEventId,
    evaluatorId: ParticipantId,
    entryId: EntryId,
  ): Scorecard | undefined {
    return this.scorecards.get(this.compositeKey(scoringEventId, evaluatorId, entryId));
  }

  /** Compute the current status of a scoring event. */
  getStatus(scoringEvent: ScoringEvent): ScoringStatus {
    if (scoringEvent.manuallyClosed) return "closed";
    const now = this.timeProvider.now();
    if (now < scoringEvent.timeline.opensAt) return "scheduled";
    if (now >= scoringEvent.timeline.closesAt) return "closed";
    return "open";
  }

  /** Compute ranking for a scoring event. */
  computeResults(scoringEventId: ScoringEventId, eligibleCount: number): ScoringResult {
    const scoringEvent = this.getScoringEventOrThrow(scoringEventId);
    const scorecards = this.getScorecards(scoringEventId);
    return computeRanking(scoringEvent, scorecards, eligibleCount, this.timeProvider.now());
  }

  // ---------------------------------------------------------------------------
  // Rehydration
  // ---------------------------------------------------------------------------

  /** Replay events to rebuild in-memory state. */
  async rehydrate(): Promise<void> {
    const events = await this.eventStore.getAll();
    for (const event of events) {
      switch (event.type) {
        case "ScoringEventCreated": {
          const p = event.payload as ScoringEventCreatedPayload;
          this.scoringEvents.set(p.scoringEventId, {
            id: p.scoringEventId,
            title: p.title,
            description: p.description,
            entries: p.entries,
            rubric: p.rubric,
            panelMemberIds: p.panelMemberIds,
            timeline: p.timeline,
            settings: p.settings,
            createdAt: event.timestamp,
            manuallyClosed: false,
          });
          break;
        }
        case "ScorecardSubmitted": {
          const p = event.payload as ScorecardSubmittedPayload;
          const key = this.compositeKey(p.scoringEventId, p.evaluatorId, p.entryId);
          this.scorecards.set(key, {
            id: p.scorecardId,
            scoringEventId: p.scoringEventId,
            evaluatorId: p.evaluatorId,
            entryId: p.entryId,
            scores: p.scores,
            submittedAt: event.timestamp,
          });
          break;
        }
        case "ScorecardRevised": {
          const p = event.payload as ScorecardRevisedPayload;
          const key = this.compositeKey(p.scoringEventId, p.evaluatorId, p.entryId);
          this.scorecards.set(key, {
            id: p.scorecardId,
            scoringEventId: p.scoringEventId,
            evaluatorId: p.evaluatorId,
            entryId: p.entryId,
            scores: p.scores,
            submittedAt: event.timestamp,
          });
          break;
        }
        case "ScoringEventClosed": {
          const p = event.payload as ScoringEventClosedPayload;
          const se = this.scoringEvents.get(p.scoringEventId);
          if (se) {
            this.scoringEvents.set(p.scoringEventId, { ...se, manuallyClosed: true });
          }
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  private requireScoringEnabled(): void {
    if (!this.config.features.scoring) {
      throw new InvalidStateError("Scoring is not enabled for this group");
    }
  }

  private getScoringEventOrThrow(id: ScoringEventId): ScoringEvent {
    const se = this.scoringEvents.get(id);
    if (!se) throw new NotFoundError("ScoringEvent", id);
    return se;
  }

  private requireOpen(scoringEvent: ScoringEvent): void {
    const status = this.getStatus(scoringEvent);
    if (status === "scheduled") {
      throw new InvalidStateError("Scoring has not started yet");
    }
    if (status === "closed") {
      throw new InvalidStateError("Scoring has closed");
    }
  }

  private requireEligible(scoringEvent: ScoringEvent, evaluatorId: ParticipantId): void {
    if (scoringEvent.panelMemberIds !== null) {
      if (!scoringEvent.panelMemberIds.includes(evaluatorId)) {
        throw new InvalidStateError("Evaluator is not a panel member for this scoring event");
      }
    }
    // When panelMemberIds is null, all active group members are eligible.
    // Membership is checked at the VCP/platform layer.
  }

  private requireEntryExists(scoringEvent: ScoringEvent, entryId: EntryId): void {
    if (!scoringEvent.entries.some((e) => e.id === entryId)) {
      throw new NotFoundError("Entry", entryId);
    }
  }

  private validateRubric(rubric: Rubric): void {
    if (rubric.categories.length === 0) {
      throw new ValidationError("rubric.categories", "At least one category is required");
    }
    const dimIds = new Set<string>();
    const catIds = new Set<string>();
    for (const cat of rubric.categories) {
      if (catIds.has(cat.id)) {
        throw new ValidationError("rubric.categories", `Duplicate category id: ${cat.id}`);
      }
      catIds.add(cat.id);
      if (cat.dimensions.length === 0) {
        throw new ValidationError(
          `rubric.categories[${cat.id}].dimensions`,
          "At least one dimension is required per category",
        );
      }
      for (const dim of cat.dimensions) {
        if (dimIds.has(dim.id)) {
          throw new ValidationError("rubric.dimensions", `Duplicate dimension id: ${dim.id}`);
        }
        dimIds.add(dim.id);
        if (dim.scale.min >= dim.scale.max) {
          throw new ValidationError(
            `rubric.dimensions[${dim.id}].scale`,
            "scale.min must be less than scale.max",
          );
        }
        if (dim.weight <= 0) {
          throw new ValidationError(
            `rubric.dimensions[${dim.id}].weight`,
            "Weight must be positive",
          );
        }
      }
      if (cat.weight <= 0) {
        throw new ValidationError(
          `rubric.categories[${cat.id}].weight`,
          "Category weight must be positive",
        );
      }
    }
  }

  private validateScores(rubric: Rubric, scores: readonly DimensionScore[]): void {
    // Collect all dimension IDs from rubric
    const allDimensions = new Map<string, { min: number; max: number; step?: number }>();
    for (const cat of rubric.categories) {
      for (const dim of cat.dimensions) {
        allDimensions.set(dim.id, dim.scale);
      }
    }

    // Check completeness
    if (scores.length !== allDimensions.size) {
      throw new ValidationError(
        "scores",
        `Expected ${allDimensions.size} dimension scores, got ${scores.length}`,
      );
    }

    for (const ds of scores) {
      const scale = allDimensions.get(ds.dimensionId);
      if (!scale) {
        throw new ValidationError(
          `scores[${ds.dimensionId}]`,
          `Unknown dimension: ${ds.dimensionId}`,
        );
      }
      if (ds.score < scale.min || ds.score > scale.max) {
        throw new ValidationError(
          `scores[${ds.dimensionId}]`,
          `Score ${ds.score} is outside range [${scale.min}, ${scale.max}]`,
        );
      }
      const step = scale.step ?? 1;
      if (step > 0) {
        const offset = ds.score - scale.min;
        // Use epsilon for floating point comparison
        const remainder = offset % step;
        if (remainder > 1e-10 && Math.abs(remainder - step) > 1e-10) {
          throw new ValidationError(
            `scores[${ds.dimensionId}]`,
            `Score ${ds.score} does not respect step size ${step}`,
          );
        }
      }
    }
  }

  private compositeKey(
    scoringEventId: ScoringEventId,
    evaluatorId: ParticipantId,
    entryId: EntryId,
  ): string {
    return `${scoringEventId}::${evaluatorId}::${entryId}`;
  }
}
