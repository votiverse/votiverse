/**
 * Event phase computation from assembly timeline config.
 *
 * The event lifecycle phases:
 *   deliberation → curation → voting → closed
 *
 * Phase boundaries are derived from the event's deliberationStart
 * and the assembly's TimelineConfig:
 *   - deliberation: [deliberationStart, deliberationStart + deliberationDays)
 *   - curation:     [deliberationEnd, deliberationEnd + curationDays)  — skipped if curationDays=0
 *   - voting:       [votingStart, votingEnd)
 *   - closed:       [votingEnd, ∞)
 *
 * Note: votingStart = deliberationStart + (deliberationDays + curationDays) * DAY_MS
 */

import type { TimelineConfig } from "@votiverse/config";

const DAY_MS = 86_400_000;

export type EventPhase = "deliberation" | "curation" | "voting" | "closed";

export interface ComputedTimeline {
  deliberationStart: number;
  deliberationEnd: number;
  curationStart: number;  // same as deliberationEnd
  curationEnd: number;    // same as votingStart
  votingStart: number;
  votingEnd: number;
}

/**
 * Compute the full timeline from a start date and assembly timeline config.
 * Returns timestamps for all phase boundaries.
 */
export function computeTimeline(deliberationStart: number, config: TimelineConfig): ComputedTimeline {
  const deliberationEnd = deliberationStart + config.deliberationDays * DAY_MS;
  const curationStart = deliberationEnd;
  const curationEnd = curationStart + config.curationDays * DAY_MS;
  const votingStart = curationEnd;
  const votingEnd = votingStart + config.votingDays * DAY_MS;

  return {
    deliberationStart,
    deliberationEnd,
    curationStart,
    curationEnd,
    votingStart,
    votingEnd,
  };
}

/**
 * Determine the current event phase from the event's timeline and assembly config.
 *
 * Uses the event's deliberationStart + assembly timeline config to compute
 * the curation boundary (which sits between deliberation and voting).
 */
export function getEventPhase(
  now: number,
  eventTimeline: { deliberationStart: number; votingStart: number; votingEnd: number },
  timelineConfig: TimelineConfig,
): EventPhase {
  const deliberationEnd = (eventTimeline.deliberationStart as number) + timelineConfig.deliberationDays * DAY_MS;

  if (now < eventTimeline.deliberationStart) return "deliberation"; // before start, treat as deliberation
  if (now < deliberationEnd) return "deliberation";
  if (timelineConfig.curationDays > 0 && now < eventTimeline.votingStart) return "curation";
  if (now < eventTimeline.votingEnd) return "voting";
  return "closed";
}
