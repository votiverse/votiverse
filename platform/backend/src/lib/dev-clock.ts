/**
 * Backend dev clock — mirrors the VCP's dev clock offset so the backend's
 * time-dependent operations (notification scheduling) use the same time
 * as the VCP and the web client.
 *
 * In production, offset is always 0 (real time). In dev, it's synced
 * from the VCP's /dev/clock endpoint.
 */

let offsetMs = 0;

/** Get the current effective time (real time + dev offset). */
export function now(): number {
  return Date.now() + offsetMs;
}

/** Get the current effective time as ISO string. */
export function nowIso(): string {
  return new Date(now()).toISOString();
}

/** Set the dev clock offset in milliseconds. */
export function setOffset(ms: number): void {
  offsetMs = ms;
}

/** Get the current offset. */
export function getOffset(): number {
  return offsetMs;
}

/** Advance the offset by the given milliseconds. */
export function advance(ms: number): void {
  offsetMs += ms;
}

/** Reset the offset to 0 (real time). */
export function reset(): void {
  offsetMs = 0;
}
