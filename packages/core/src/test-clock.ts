/**
 * TestClock — a controllable TimeProvider for testing.
 *
 * Allows tests to advance time, set specific timestamps, and verify
 * time-dependent behavior without waiting for real time to pass.
 * Inspired by Stripe's test clocks for subscription billing.
 */

import type { TimeProvider, Timestamp } from "./types.js";

export class TestClock implements TimeProvider {
  private current: number;

  constructor(initialTime: number = Date.now()) {
    this.current = initialTime;
  }

  now(): Timestamp {
    return this.current as Timestamp;
  }

  /** Advance the clock by the given number of milliseconds. */
  advance(ms: number): void {
    if (ms < 0) throw new Error("Cannot advance time backwards");
    this.current += ms;
  }

  /** Set the clock to a specific timestamp (milliseconds since epoch). */
  set(ms: number): void {
    this.current = ms;
  }

  /** Reset to the current system time. */
  reset(): void {
    this.current = Date.now();
  }
}
