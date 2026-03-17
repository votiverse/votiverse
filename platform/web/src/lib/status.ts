/**
 * Status derivation — computes event/poll status from immutable timestamps.
 *
 * Status is not stored or returned by the API. It is derived client-side
 * from the timestamps and the current time, making all API responses
 * fully cacheable.
 */

export type EventStatus = "upcoming" | "deliberation" | "voting" | "closed";
export type PollStatus = "scheduled" | "open" | "closed";

/** Derive voting event status from its timeline. */
export function deriveEventStatus(timeline: { deliberationStart: string; votingStart: string; votingEnd: string }): EventStatus {
  const now = Date.now();
  const deliberationStart = new Date(timeline.deliberationStart).getTime();
  const votingStart = new Date(timeline.votingStart).getTime();
  const votingEnd = new Date(timeline.votingEnd).getTime();

  if (now < deliberationStart) return "upcoming";
  if (now < votingStart) return "deliberation";
  if (now < votingEnd) return "voting";
  return "closed";
}

/** Derive poll status from its schedule and close time. */
export function derivePollStatus(schedule: number | string, closesAt: number | string): PollStatus {
  const now = Date.now();
  const open = typeof schedule === "number" ? schedule : new Date(schedule).getTime();
  const close = typeof closesAt === "number" ? closesAt : new Date(closesAt).getTime();

  if (now < open) return "scheduled";
  if (now < close) return "open";
  return "closed";
}
