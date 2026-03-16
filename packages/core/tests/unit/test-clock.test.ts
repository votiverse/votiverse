import { describe, it, expect } from "vitest";
import { TestClock } from "../../src/test-clock.js";

describe("TestClock", () => {
  it("starts at the given initial time", () => {
    const clock = new TestClock(1000);
    expect(clock.now()).toBe(1000);
  });

  it("defaults to approximately Date.now()", () => {
    const before = Date.now();
    const clock = new TestClock();
    const after = Date.now();
    expect(clock.now()).toBeGreaterThanOrEqual(before);
    expect(clock.now()).toBeLessThanOrEqual(after);
  });

  it("advances by the given milliseconds", () => {
    const clock = new TestClock(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
    clock.advance(1000);
    expect(clock.now()).toBe(2500);
  });

  it("rejects negative advance", () => {
    const clock = new TestClock(1000);
    expect(() => clock.advance(-100)).toThrow("Cannot advance time backwards");
  });

  it("sets to a specific time", () => {
    const clock = new TestClock(1000);
    clock.set(5000);
    expect(clock.now()).toBe(5000);
  });

  it("resets to system time", () => {
    const clock = new TestClock(0);
    clock.reset();
    // Should be close to current time (within 100ms)
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(100);
  });

  it("satisfies TimeProvider interface", () => {
    const clock = new TestClock(1000);
    // TypeScript would catch this at compile time, but verify at runtime too
    expect(typeof clock.now).toBe("function");
    expect(typeof clock.now()).toBe("number");
  });
});
