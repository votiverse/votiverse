/**
 * @votiverse/prediction — PredictionService
 *
 * High-level service for prediction CRUD, outcome recording,
 * evaluation, and track records.
 */

import type {
  EventStore,
  ParticipantId,
  PredictionId,
  PredictionCommittedEvent,
  OutcomeRecordedEvent,
  OutcomeId,
} from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generatePredictionId,
  generateOutcomeId,
  now,
  NotFoundError,
  ValidationError,
} from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import type {
  Prediction,
  OutcomeRecord,
  PredictionEvaluation,
  TrackRecord,
  CommitPredictionParams,
  RecordOutcomeParams,
  OutcomeSource,
  PredictionClaim,
  EvaluationStatus,
} from "./types.js";
import { computeCommitmentHash } from "./commitment.js";
import { evaluate } from "./evaluation.js";

/**
 * Service for managing predictions and their lifecycle.
 */
export class PredictionService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
  ) {}

  /**
   * Commit a new prediction. Computes the commitment hash and records
   * a PredictionCommitted event. The prediction is immutable after this.
   */
  async commit(params: CommitPredictionParams): Promise<Prediction> {
    if (this.config.features.predictions === "disabled") {
      throw new ValidationError(
        "predictions",
        "Predictions are disabled in the current configuration",
      );
    }

    validateClaim(params.claim);

    const id = generatePredictionId();
    const commitmentHash = computeCommitmentHash(params.claim);
    const timestamp = now();

    const event = createEvent<PredictionCommittedEvent>(
      "PredictionCommitted",
      {
        predictionId: id,
        proposalId: params.proposalId,
        participantId: params.participantId,
        predictionData: params.claim as unknown as Readonly<Record<string, unknown>>,
        commitmentHash,
      },
      generateEventId(),
      timestamp,
    );

    await this.eventStore.append(event);

    return {
      id,
      proposalId: params.proposalId,
      participantId: params.participantId,
      claim: params.claim,
      commitmentHash,
      committedAt: timestamp,
    };
  }

  /**
   * Record an outcome data point for a prediction. Outcomes are
   * append-only — each recording is a new event, preserving the
   * full history of how outcomes were assessed over time.
   */
  async recordOutcome(params: RecordOutcomeParams): Promise<OutcomeRecord> {
    const prediction = await this.getPrediction(params.predictionId);
    if (!prediction) {
      throw new NotFoundError("Prediction", params.predictionId);
    }

    const id = generateOutcomeId();
    const timestamp = now();

    const event = createEvent<OutcomeRecordedEvent>(
      "OutcomeRecorded",
      {
        predictionId: params.predictionId,
        outcomeData: {
          outcomeId: id,
          source: params.source,
          measuredValue: params.measuredValue,
          comparisonValue: params.comparisonValue,
          notes: params.notes,
        } as unknown as Readonly<Record<string, unknown>>,
        source: params.source.type,
      },
      generateEventId(),
      timestamp,
    );

    await this.eventStore.append(event);

    return {
      id,
      predictionId: params.predictionId,
      recordedAt: timestamp,
      source: params.source,
      measuredValue: params.measuredValue,
      comparisonValue: params.comparisonValue,
      notes: params.notes,
    };
  }

  /**
   * Creates an outcome record from poll trend data.
   * This is the explicit bridge between sensing (polls) and
   * accountability (predictions).
   *
   * @param predictionId - The prediction to evaluate.
   * @param trendScore - Normalized trend score from polling data (-1 to +1).
   * @param pollId - The poll that produced the trend data.
   * @param notes - Description of how the trend score was derived.
   */
  async evaluateFromTrend(
    predictionId: PredictionId,
    trendScore: number,
    pollId: string,
    notes?: string,
  ): Promise<OutcomeRecord> {
    const prediction = await this.getPrediction(predictionId);
    if (!prediction) {
      throw new NotFoundError("Prediction", predictionId);
    }

    // Map the normalized trend score (-1 to +1) to a measured value
    // that makes sense for the prediction's pattern
    const measuredValue = mapTrendToMeasuredValue(prediction, trendScore);

    return this.recordOutcome({
      predictionId,
      source: {
        type: "poll-derived",
        pollId: pollId as unknown as import("@votiverse/core").PollId,
      },
      measuredValue,
      notes:
        notes ??
        `Derived from poll trend data. Normalized score: ${trendScore.toFixed(3)}`,
    });
  }

  /**
   * Evaluate a prediction against all its recorded outcomes.
   */
  async evaluate(predictionId: PredictionId): Promise<PredictionEvaluation> {
    const prediction = await this.getPrediction(predictionId);
    if (!prediction) {
      throw new NotFoundError("Prediction", predictionId);
    }
    const outcomes = await this.getOutcomes(predictionId);
    return evaluate(prediction, outcomes);
  }

  /**
   * Compute the track record for a participant.
   */
  async trackRecord(
    participantId: ParticipantId,
  ): Promise<TrackRecord> {
    const predictions = await this.getPredictionsByParticipant(participantId);
    const evaluations: PredictionEvaluation[] = [];

    for (const prediction of predictions) {
      const outcomes = await this.getOutcomes(prediction.id);
      evaluations.push(evaluate(prediction, outcomes));
    }

    const evaluated = evaluations.filter(
      (e) =>
        e.status !== "pending" && e.status !== "insufficient",
    );

    const byStatus: Partial<Record<EvaluationStatus, number>> = {};
    for (const e of evaluations) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    }

    const averageAccuracy =
      evaluated.length > 0
        ? evaluated.reduce((sum, e) => sum + e.accuracy, 0) / evaluated.length
        : 0;

    return {
      participantId,
      totalPredictions: predictions.length,
      evaluatedPredictions: evaluated.length,
      averageAccuracy,
      byStatus,
    };
  }

  /**
   * Get a prediction by ID, reconstructed from the event store.
   */
  async getPrediction(
    predictionId: PredictionId,
  ): Promise<Prediction | undefined> {
    const events = await this.eventStore.query({
      types: ["PredictionCommitted"],
    });

    for (const event of events) {
      const e = event as PredictionCommittedEvent;
      if (e.payload.predictionId === predictionId) {
        return {
          id: e.payload.predictionId,
          proposalId: e.payload.proposalId,
          participantId: e.payload.participantId,
          claim: e.payload.predictionData as unknown as PredictionClaim,
          commitmentHash: e.payload.commitmentHash,
          committedAt: e.timestamp,
        };
      }
    }

    return undefined;
  }

  /**
   * Get all predictions by a participant.
   */
  async getPredictionsByParticipant(
    participantId: ParticipantId,
  ): Promise<readonly Prediction[]> {
    const events = await this.eventStore.query({
      types: ["PredictionCommitted"],
    });

    const predictions: Prediction[] = [];
    for (const event of events) {
      const e = event as PredictionCommittedEvent;
      if (e.payload.participantId === participantId) {
        predictions.push({
          id: e.payload.predictionId,
          proposalId: e.payload.proposalId,
          participantId: e.payload.participantId,
          claim: e.payload.predictionData as unknown as PredictionClaim,
          commitmentHash: e.payload.commitmentHash,
          committedAt: e.timestamp,
        });
      }
    }

    return predictions;
  }

  /**
   * Get all outcome records for a prediction.
   */
  async getOutcomes(
    predictionId: PredictionId,
  ): Promise<readonly OutcomeRecord[]> {
    const events = await this.eventStore.query({
      types: ["OutcomeRecorded"],
    });

    const outcomes: OutcomeRecord[] = [];
    for (const event of events) {
      const e = event as OutcomeRecordedEvent;
      if (e.payload.predictionId === predictionId) {
        const data = e.payload.outcomeData as unknown as {
          outcomeId: OutcomeId;
          source: OutcomeSource;
          measuredValue: number | boolean | null;
          comparisonValue?: number;
          notes?: string;
        };
        outcomes.push({
          id: data.outcomeId,
          predictionId,
          recordedAt: e.timestamp,
          source: data.source,
          measuredValue: data.measuredValue,
          comparisonValue: data.comparisonValue,
          notes: data.notes,
        });
      }
    }

    return outcomes;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateClaim(claim: PredictionClaim): void {
  if (!claim.variable || claim.variable.trim().length === 0) {
    throw new ValidationError("variable", "Prediction variable must not be empty");
  }
  if (claim.timeframe.deadline <= claim.timeframe.start) {
    throw new ValidationError(
      "timeframe",
      "Deadline must be after start",
    );
  }
  if (claim.pattern.type === "range" && claim.pattern.min > claim.pattern.max) {
    throw new ValidationError(
      "pattern.range",
      "Range min must be <= max",
    );
  }
}

/**
 * Maps a normalized trend score (-1 to +1) to a measured value appropriate
 * for the prediction's pattern type. This is a heuristic bridge — poll
 * trends are qualitative observations, not precise measurements.
 */
function mapTrendToMeasuredValue(
  prediction: Prediction,
  trendScore: number,
): number {
  const { pattern, baselineValue } = prediction.claim;
  const baseline = baselineValue ?? 0;

  switch (pattern.type) {
    case "absolute-change": {
      // Scale trend score by the expected change magnitude
      return baseline + pattern.expected * trendScore;
    }
    case "percentage-change": {
      const expectedAbsolute = baseline * (pattern.expected / 100);
      return baseline + expectedAbsolute * trendScore;
    }
    case "threshold": {
      // Map trend score to a value between baseline and target
      const distance = pattern.target - baseline;
      return baseline + distance * ((trendScore + 1) / 2);
    }
    case "range": {
      const mid = (pattern.min + pattern.max) / 2;
      const halfRange = (pattern.max - pattern.min) / 2;
      return mid + halfRange * trendScore;
    }
    case "binary": {
      // Positive trend → true (1), negative → false (0)
      return trendScore > 0 ? 1 : 0;
    }
    case "comparative": {
      // Can't meaningfully derive a comparative value from a trend score
      // Return the trend score directly; accuracy will be low but recorded
      return trendScore;
    }
  }
}
