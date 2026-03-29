/**
 * @votiverse/scoring — Type definitions
 *
 * Rubric-based multi-criteria scoring. Non-delegable.
 * See docs/design/scoring-events.md for the full design rationale.
 */

import type {
  EntryId,
  ParticipantId,
  ScorecardId,
  ScoringEventId,
  Timestamp,
  EvaluatorAggregation,
  DimensionAggregation,
} from "@votiverse/core";

// Re-export aggregation method types from core for convenience
export type { EvaluatorAggregation, DimensionAggregation } from "@votiverse/core";

// ---------------------------------------------------------------------------
// Rubric
// ---------------------------------------------------------------------------

/** A single scoring dimension within a rubric category. */
export interface RubricDimension {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly scale: {
    readonly min: number;
    readonly max: number;
    /** Step size. Default 1 (integer scores). Use 0.5 for half-point scales. */
    readonly step?: number;
  };
  /** Relative weight within its category. Default 1. */
  readonly weight: number;
  readonly labels?: readonly string[];
}

/** A category grouping related dimensions. */
export interface RubricCategory {
  readonly id: string;
  readonly name: string;
  /** Relative weight of this category in the final score. */
  readonly weight: number;
  readonly dimensions: readonly RubricDimension[];
}

/** The complete rubric for a scoring event. */
export interface Rubric {
  readonly categories: readonly RubricCategory[];
  readonly evaluatorAggregation: EvaluatorAggregation;
  readonly dimensionAggregation: DimensionAggregation;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

/** An entry in a scoring event. Parallel to Issue in a voting event. */
export interface ScoringEntry {
  readonly id: EntryId;
  readonly title: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

/** A single dimension score within a scorecard. */
export interface DimensionScore {
  readonly dimensionId: string;
  readonly score: number;
}

/** An evaluator's scoring of one entry. */
export interface Scorecard {
  readonly id: ScorecardId;
  readonly scoringEventId: ScoringEventId;
  readonly evaluatorId: ParticipantId;
  readonly entryId: EntryId;
  readonly scores: readonly DimensionScore[];
  readonly submittedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Scoring event
// ---------------------------------------------------------------------------

/** Timeline for a scoring event. */
export interface ScoringTimeline {
  readonly opensAt: Timestamp;
  readonly closesAt: Timestamp;
}

/** Scoring event status. Effective status is derived from commanded status + timestamps + now. */
export type ScoringStatus = "draft" | "open" | "closed";

/** Per-scoring-event settings. */
export interface ScoringSettings {
  readonly allowRevision: boolean;
  readonly secretScores: boolean;
  readonly normalizeScores: boolean;
}

/** The container for a scoring session. */
export interface ScoringEvent {
  readonly id: ScoringEventId;
  readonly title: string;
  readonly description: string;
  readonly entries: readonly ScoringEntry[];
  readonly rubric: Rubric;
  readonly panelMemberIds: readonly ParticipantId[] | null;
  readonly timeline: ScoringTimeline;
  readonly settings: ScoringSettings;
  readonly createdAt: Timestamp;
  /** Commanded status — the status last set by a command (create/open/close). */
  readonly status: "draft" | "open" | "closed";
  /** When true, the event stays in draft until explicitly opened via open(). */
  readonly startAsDraft: boolean;
  /** Original closesAt before the first deadline extension (audit trail). */
  readonly originalClosesAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Ranking result
// ---------------------------------------------------------------------------

/** Per-dimension aggregate for one entry. */
export interface DimensionResult {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly aggregatedScore: number;
  readonly mean: number;
  readonly median: number;
  readonly standardDeviation: number;
  readonly evaluatorCount: number;
}

/** Per-category aggregate for one entry. */
export interface CategoryResult {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryScore: number;
  readonly dimensions: readonly DimensionResult[];
}

/** Complete result for one entry. */
export interface EntryResult {
  readonly entryId: EntryId;
  readonly entryTitle: string;
  readonly finalScore: number;
  /** Rank position (1-based). Ties share the same rank. */
  readonly rank: number;
  readonly categories: readonly CategoryResult[];
}

/** Complete scoring result. Parallel to TallyResult. */
export interface ScoringResult {
  readonly scoringEventId: ScoringEventId;
  readonly entries: readonly EntryResult[];
  readonly eligibleCount: number;
  readonly participatingCount: number;
  readonly participationRate: number;
  readonly computedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Service parameter types
// ---------------------------------------------------------------------------

/** Parameters for creating a scoring event. */
export interface CreateScoringEventParams {
  readonly title: string;
  readonly description: string;
  readonly entries: readonly Omit<ScoringEntry, "id">[];
  readonly rubric: Rubric;
  readonly panelMemberIds: readonly ParticipantId[] | null;
  readonly timeline: ScoringTimeline;
  readonly settings: ScoringSettings;
  /** When true, the event stays in draft until explicitly opened. Default: false. */
  readonly startAsDraft?: boolean;
}

/** Parameters for updating a draft scoring event. All fields optional — merged with current state. */
export interface UpdateDraftParams {
  readonly title?: string;
  readonly description?: string;
  readonly entries?: readonly Omit<ScoringEntry, "id">[];
  readonly rubric?: Rubric;
  readonly panelMemberIds?: readonly ParticipantId[] | null;
  readonly timeline?: ScoringTimeline;
  readonly settings?: ScoringSettings;
}

/** Parameters for submitting a scorecard. */
export interface SubmitScorecardParams {
  readonly scoringEventId: ScoringEventId;
  readonly evaluatorId: ParticipantId;
  readonly entryId: EntryId;
  readonly scores: readonly DimensionScore[];
}

/** Parameters for revising a scorecard. */
export interface ReviseScorecardParams {
  readonly scorecardId: ScorecardId;
  readonly scoringEventId: ScoringEventId;
  readonly evaluatorId: ParticipantId;
  readonly entryId: EntryId;
  readonly scores: readonly DimensionScore[];
}
