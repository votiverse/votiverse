/**
 * @votiverse/scoring — Aggregation pipeline
 *
 * Two-stage aggregation with optional normalization:
 * 1. (optional) Normalize scores across evaluators
 * 2. Aggregate across evaluators per (entry, dimension)
 * 3. Aggregate across dimensions per entry, respecting weights
 * 4. Rank entries by final score
 */

import type { Timestamp } from "@votiverse/core";
import type {
  DimensionScore,
  Rubric,
  RubricDimension,
  Scorecard,
  ScoringEvent,
  ScoringResult,
  EntryResult,
  CategoryResult,
  DimensionResult,
  EvaluatorAggregation,
  DimensionAggregation,
} from "./types.js";

// ---------------------------------------------------------------------------
// Normalization (optional pre-processing)
// ---------------------------------------------------------------------------

/**
 * Z-score normalize an evaluator's scores across all entries.
 * Falls back to raw scores when fewer than 3 entries scored.
 */
export function normalizeEvaluatorScores(
  scorecards: readonly Scorecard[],
  rubric: Rubric,
): Map<string, readonly DimensionScore[]> {
  const result = new Map<string, readonly DimensionScore[]>();

  if (scorecards.length < 3) {
    for (const sc of scorecards) {
      result.set(`${sc.evaluatorId}::${sc.entryId}`, sc.scores);
    }
    return result;
  }

  // Collect all scores from this evaluator
  const allScores: number[] = [];
  for (const sc of scorecards) {
    for (const ds of sc.scores) {
      allScores.push(ds.score);
    }
  }

  const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const variance = allScores.reduce((a, b) => a + (b - mean) ** 2, 0) / allScores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    for (const sc of scorecards) {
      result.set(`${sc.evaluatorId}::${sc.entryId}`, sc.scores);
    }
    return result;
  }

  // Build dimension lookup for scale ranges
  const dimLookup = buildDimensionLookup(rubric);

  for (const sc of scorecards) {
    const normalized: DimensionScore[] = sc.scores.map((ds) => {
      const dim = dimLookup.get(ds.dimensionId);
      if (!dim) return ds;

      const z = (ds.score - mean) / stdDev;
      const range = dim.scale.max - dim.scale.min;
      const midpoint = (dim.scale.max + dim.scale.min) / 2;
      const rescaled = z * (range / 4) + midpoint;
      const clamped = Math.max(dim.scale.min, Math.min(dim.scale.max, rescaled));

      return { dimensionId: ds.dimensionId, score: clamped };
    });
    result.set(`${sc.evaluatorId}::${sc.entryId}`, normalized);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stage 1: Evaluator aggregation
// ---------------------------------------------------------------------------

/** Aggregate scores from multiple evaluators for a single dimension. */
export function aggregateEvaluators(
  scores: readonly number[],
  method: EvaluatorAggregation,
): number {
  if (scores.length === 0) return 0;

  switch (method) {
    case "mean":
      return arithmeticMean(scores);
    case "median":
      return median(scores);
    case "trimmed-mean":
      return trimmedMean(scores);
    default:
      return method satisfies never;
  }
}

// ---------------------------------------------------------------------------
// Stage 2: Dimension aggregation
// ---------------------------------------------------------------------------

/** Aggregate dimensional scores into a single score per entry. */
export function aggregateDimensions(
  categoryScores: readonly { score: number; weight: number }[],
  method: DimensionAggregation,
): number {
  if (categoryScores.length === 0) return 0;

  switch (method) {
    case "weighted-sum":
      return weightedSum(categoryScores);
    case "geometric-mean":
      return weightedGeometricMean(categoryScores);
    default:
      return method satisfies never;
  }
}

/**
 * Compute the weighted score for a single category from its dimension scores.
 * Uses weighted-sum within a category (dimensions are always summed, not geometric-meaned).
 */
export function computeCategoryScore(
  dimensionScores: readonly { score: number; weight: number }[],
): number {
  return weightedSum(dimensionScores);
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/**
 * Run the complete aggregation pipeline on scorecards for a scoring event.
 * Produces ranked EntryResults.
 */
export function computeRanking(
  scoringEvent: ScoringEvent,
  scorecards: readonly Scorecard[],
  eligibleCount: number,
  computedAt: Timestamp,
): ScoringResult {
  const { rubric, entries } = scoringEvent;

  // Group scorecards by evaluator for normalization
  const byEvaluator = groupBy(scorecards, (sc) => sc.evaluatorId);

  // Optionally normalize
  let scoresByKey: Map<string, readonly DimensionScore[]>;
  if (scoringEvent.settings.normalizeScores) {
    scoresByKey = new Map<string, readonly DimensionScore[]>();
    for (const [, evalCards] of byEvaluator) {
      const normalized = normalizeEvaluatorScores(evalCards, rubric);
      for (const [key, scores] of normalized) {
        scoresByKey.set(key, scores);
      }
    }
  } else {
    scoresByKey = new Map<string, readonly DimensionScore[]>();
    for (const sc of scorecards) {
      scoresByKey.set(`${sc.evaluatorId}::${sc.entryId}`, sc.scores);
    }
  }

  // Group scorecards by entry
  const byEntry = groupBy(scorecards, (sc) => sc.entryId);

  // Compute results per entry
  const entryResults: UnrankedEntry[] = [];

  for (const entry of entries) {
    const entryCards = byEntry.get(entry.id) ?? [];

    const categoryResults: CategoryResult[] = rubric.categories.map((cat) => {
      const dimensionResults: DimensionResult[] = cat.dimensions.map((dim) => {
        // Collect all evaluator scores for this (entry, dimension)
        const rawScores: number[] = [];
        for (const sc of entryCards) {
          const key = `${sc.evaluatorId}::${sc.entryId}`;
          const scores = scoresByKey.get(key) ?? sc.scores;
          const ds = scores.find((s) => s.dimensionId === dim.id);
          if (ds) rawScores.push(ds.score);
        }

        const aggregatedScore = rawScores.length > 0
          ? aggregateEvaluators(rawScores, rubric.evaluatorAggregation)
          : 0;

        return {
          dimensionId: dim.id,
          dimensionName: dim.name,
          aggregatedScore,
          mean: rawScores.length > 0 ? arithmeticMean(rawScores) : 0,
          median: rawScores.length > 0 ? median(rawScores) : 0,
          standardDeviation: rawScores.length > 0 ? stdDev(rawScores) : 0,
          evaluatorCount: rawScores.length,
        };
      });

      // Category score = weighted sum of dimensions within category
      const dimInputs = dimensionResults.map((dr, i) => {
        const dim = cat.dimensions[i];
        return { score: dr.aggregatedScore, weight: dim?.weight ?? 1 };
      });
      const categoryScore = computeCategoryScore(dimInputs);

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryScore,
        dimensions: dimensionResults,
      };
    });

    // Final score = aggregate across categories
    const catInputs = categoryResults.map((cr, i) => {
      const cat = rubric.categories[i];
      return { score: cr.categoryScore, weight: cat?.weight ?? 1 };
    });
    const finalScore = aggregateDimensions(catInputs, rubric.dimensionAggregation);

    entryResults.push({
      entryId: entry.id,
      entryTitle: entry.title,
      finalScore,
      categories: categoryResults,
    });
  }

  // Sort by final score descending
  entryResults.sort((a, b) => b.finalScore - a.finalScore);

  // Assign ranks (competition ranking: ties share rank, next rank skips)
  const ranked = assignRanks(entryResults);

  // Compute participation stats
  const participatingEvaluators = new Set(scorecards.map((sc) => sc.evaluatorId));
  const participatingCount = participatingEvaluators.size;

  return {
    scoringEventId: scoringEvent.id,
    entries: ranked,
    eligibleCount,
    participatingCount,
    participationRate: eligibleCount > 0 ? participatingCount / eligibleCount : 0,
    computedAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arithmeticMean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid]!;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function trimmedMean(values: readonly number[]): number {
  if (values.length < 3) return arithmeticMean(values);
  const sorted = [...values].sort((a, b) => a - b);
  // Drop highest and lowest
  const trimmed = sorted.slice(1, -1);
  return arithmeticMean(trimmed);
}

function stdDev(values: readonly number[]): number {
  const mean = arithmeticMean(values);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function weightedSum(items: readonly { score: number; weight: number }[]): number {
  const totalWeight = items.reduce((a, b) => a + b.weight, 0);
  if (totalWeight === 0) return 0;
  return items.reduce((a, b) => a + b.weight * b.score, 0) / totalWeight;
}

function weightedGeometricMean(items: readonly { score: number; weight: number }[]): number {
  const totalWeight = items.reduce((a, b) => a + b.weight, 0);
  if (totalWeight === 0) return 0;

  // Product of (score ^ (weight / totalWeight))
  let logSum = 0;
  for (const item of items) {
    if (item.score <= 0) return 0; // Geometric mean with zero → zero
    logSum += (item.weight / totalWeight) * Math.log(item.score);
  }
  return Math.exp(logSum);
}

function buildDimensionLookup(rubric: Rubric): Map<string, RubricDimension> {
  const lookup = new Map<string, RubricDimension>();
  for (const cat of rubric.categories) {
    for (const dim of cat.dimensions) {
      lookup.set(dim.id, dim);
    }
  }
  return lookup;
}

function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = result.get(key);
    if (group) {
      group.push(item);
    } else {
      result.set(key, [item]);
    }
  }
  return result;
}

interface UnrankedEntry {
  readonly entryId: EntryResult["entryId"];
  readonly entryTitle: string;
  readonly finalScore: number;
  readonly categories: readonly CategoryResult[];
}

function assignRanks(sorted: readonly UnrankedEntry[]): EntryResult[] {
  const ranked: EntryResult[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const prev = sorted[i - 1];
    if (i > 0 && prev && current.finalScore < prev.finalScore) {
      currentRank = i + 1;
    }
    ranked.push({ ...current, rank: currentRank });
  }

  return ranked;
}
