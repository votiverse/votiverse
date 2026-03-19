/**
 * Status derivation — computes event/poll status from immutable timestamps.
 *
 * Status is not stored or returned by the API. It is derived client-side
 * from the timestamps and the current time, making all API responses
 * fully cacheable.
 *
 * When the dev clock is active, devClockOffsetMs is added to Date.now()
 * so the UI reflects the VCP's advanced time.
 */

/** Global dev clock offset in milliseconds. Set by DevClock component. */
export let devClockOffsetMs = 0;

export function setDevClockOffset(ms: number): void {
  devClockOffsetMs = ms;
}

/** Get the current effective time (browser time + dev clock offset). */
export function effectiveNow(): number {
  return Date.now() + devClockOffsetMs;
}

export type EventStatus = "upcoming" | "deliberation" | "curation" | "voting" | "closed";
export type SurveyStatus = "scheduled" | "open" | "closed";

/**
 * Derive voting event status from its timeline and optional assembly timeline config.
 * If timelineConfig is provided and has curationDays > 0, the curation phase
 * is computed as the window between deliberation end and voting start.
 */
export function deriveEventStatus(
  timeline: { deliberationStart: string; votingStart: string; votingEnd: string },
  timelineConfig?: { deliberationDays: number; curationDays: number; votingDays: number },
): EventStatus {
  const now = effectiveNow();
  const deliberationStart = new Date(timeline.deliberationStart).getTime();
  const votingStart = new Date(timeline.votingStart).getTime();
  const votingEnd = new Date(timeline.votingEnd).getTime();

  if (now < deliberationStart) return "upcoming";

  // If we have timeline config with curation days, compute the curation boundary
  if (timelineConfig && timelineConfig.curationDays > 0) {
    const DAY_MS = 86_400_000;
    const deliberationEnd = deliberationStart + timelineConfig.deliberationDays * DAY_MS;
    if (now < deliberationEnd) return "deliberation";
    if (now < votingStart) return "curation";
  } else {
    if (now < votingStart) return "deliberation";
  }

  if (now < votingEnd) return "voting";
  return "closed";
}

/** Derive survey status from its schedule and close time. */
export function deriveSurveyStatus(schedule: number | string, closesAt: number | string): SurveyStatus {
  const now = effectiveNow();
  const open = typeof schedule === "number" ? schedule : new Date(schedule).getTime();
  const close = typeof closesAt === "number" ? closesAt : new Date(closesAt).getTime();

  if (now < open) return "scheduled";
  if (now < close) return "open";
  return "closed";
}
