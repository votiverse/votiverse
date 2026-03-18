/**
 * @votiverse/survey — Aggregation and trend computation
 *
 * Computes aggregate results for individual surveys and longitudinal
 * trends across surveys by topic.
 */

import type { TopicId, Timestamp } from "@votiverse/core";
import type {
  Survey,
  SurveyResponse,
  SurveyResults,
  QuestionResult,
  SurveyQuestion,
  TrendPoint,
  TrendData,
  TrendDirection,
} from "./types.js";

// ---------------------------------------------------------------------------
// Single-survey aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate survey responses into results.
 */
export function aggregateResults(
  survey: Survey,
  responses: readonly SurveyResponse[],
  eligibleCount: number,
): SurveyResults {
  const questionResults = survey.questions.map((q) => aggregateQuestion(q, responses));

  return {
    surveyId: survey.id,
    responseCount: responses.length,
    responseRate: eligibleCount > 0 ? responses.length / eligibleCount : 0,
    questionResults,
  };
}

function aggregateQuestion(
  question: SurveyQuestion,
  responses: readonly SurveyResponse[],
): QuestionResult {
  const answers = responses.flatMap((r) => r.answers).filter((a) => a.questionId === question.id);

  const distribution = new Map<string, number>();
  const numericValues: number[] = [];

  for (const answer of answers) {
    const key = String(answer.value);
    distribution.set(key, (distribution.get(key) ?? 0) + 1);

    const numVal = toNumeric(answer.value, question.questionType);
    if (numVal !== null) {
      numericValues.push(numVal);
    }
  }

  const result: QuestionResult = {
    questionId: question.id,
    responseCount: answers.length,
    distribution,
  };

  if (numericValues.length > 0) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const sum = numericValues.reduce((s, v) => s + v, 0);
    const mean = sum / numericValues.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
    const variance = numericValues.reduce((s, v) => s + (v - mean) ** 2, 0) / numericValues.length;

    return {
      ...result,
      mean,
      median,
      standardDeviation: Math.sqrt(variance),
    };
  }

  return result;
}

/**
 * Convert an answer value to a numeric representation.
 */
function toNumeric(
  value: number | string | boolean,
  questionType: SurveyQuestion["questionType"],
): number | null {
  switch (questionType.type) {
    case "likert":
      return typeof value === "number" ? value : null;
    case "numeric":
      return typeof value === "number" ? value : null;
    case "direction":
      if (typeof value === "string") {
        if (value === "improved") return 1;
        if (value === "same") return 0;
        if (value === "worsened") return -1;
      }
      return typeof value === "number" ? value : null;
    case "yes-no":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value === "string") return value === "yes" ? 1 : 0;
      return null;
    case "multiple-choice":
      return null; // No single numeric representation
  }
}

// ---------------------------------------------------------------------------
// Trend computation
// ---------------------------------------------------------------------------

/**
 * Computes a trend line for a specific topic across multiple surveys.
 *
 * Each survey's questions tagged with the topic are normalized to a
 * [-1, +1] sentiment scale. The trend is the time series of these
 * normalized scores.
 */
export function computeTrend(
  topicId: TopicId,
  surveys: readonly Survey[],
  responsesBySurvey: ReadonlyMap<string, readonly SurveyResponse[]>,
  eligibleCount: number,
): TrendData {
  const points: TrendPoint[] = [];

  for (const survey of surveys) {
    if (survey.status !== "closed") continue;

    const relevantQuestions = survey.questions.filter((q) => q.topicIds.includes(topicId));
    if (relevantQuestions.length === 0) continue;

    const responses = responsesBySurvey.get(survey.id) ?? [];
    if (responses.length === 0) continue;

    // Compute normalized score for each relevant question
    const scores: number[] = [];
    for (const question of relevantQuestions) {
      const qResult = aggregateQuestion(question, responses);
      const normalized = normalizeScore(qResult, question.questionType);
      if (normalized !== null) {
        scores.push(normalized);
      }
    }

    if (scores.length === 0) continue;

    const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
    const responseRate = eligibleCount > 0 ? responses.length / eligibleCount : 0;

    // Confidence: based on response rate and question count
    const rateConfidence = Math.min(responseRate * 2, 1); // saturates at 50% response rate
    const questionConfidence = Math.min(scores.length / 3, 1); // saturates at 3 questions
    const confidence = rateConfidence * questionConfidence;

    points.push({
      timestamp: survey.closesAt,
      score: avgScore,
      responseRate,
      questionCount: scores.length,
      confidence,
    });
  }

  // Sort chronologically
  points.sort((a, b) => a.timestamp - b.timestamp);

  const timeRange = {
    start: points.length > 0 ? points[0]!.timestamp : (0 as Timestamp),
    end: points.length > 0 ? points[points.length - 1]!.timestamp : (0 as Timestamp),
  };

  const slope = computeSlope(points);
  const direction = classifyDirection(slope, points.length);

  return {
    topicId,
    timeRange,
    points,
    direction,
    slope,
  };
}

/**
 * Normalize a question result to the [-1, +1] sentiment scale.
 */
function normalizeScore(
  result: QuestionResult,
  questionType: SurveyQuestion["questionType"],
): number | null {
  if (result.mean === undefined) return null;

  switch (questionType.type) {
    case "likert": {
      // Map 1..scale to -1..+1
      const mid = (questionType.scale + 1) / 2;
      const halfRange = (questionType.scale - 1) / 2;
      return (result.mean - mid) / halfRange;
    }
    case "numeric": {
      // Map min..max to -1..+1
      const mid = (questionType.min + questionType.max) / 2;
      const halfRange = (questionType.max - questionType.min) / 2;
      if (halfRange === 0) return 0;
      return (result.mean - mid) / halfRange;
    }
    case "direction":
      // Already in -1..+1 range (worsened=-1, same=0, improved=+1)
      return result.mean;
    case "yes-no":
      // Map 0..1 to -1..+1
      return result.mean * 2 - 1;
    case "multiple-choice":
      return null;
  }
}

/**
 * Compute the slope of a linear regression through trend points.
 */
function computeSlope(points: readonly TrendPoint[]): number {
  if (points.length < 2) return 0;

  const n = points.length;
  // Use indices as x-values for simplicity (evenly spaced assumption)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i]!.score;
    sumXY += i * points[i]!.score;
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

function classifyDirection(slope: number, pointCount: number): TrendDirection {
  if (pointCount < 2) return "insufficient";
  if (Math.abs(slope) < 0.02) return "stable";
  return slope > 0 ? "improving" : "worsening";
}
