/**
 * Dev-only routes — test clock control.
 *
 * These endpoints are NEVER mounted in production (NODE_ENV=production).
 * They allow advancing, setting, and resetting the server's time source,
 * enabling Stripe-style test clock scenarios for voting lifecycle testing.
 */

import { Hono } from "hono";
import { TestClock } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { logger } from "../../lib/logger.js";

export function devRoutes(manager: AssemblyManager) {
  const app = new Hono();

  function ensureTestClock(): TestClock {
    if (!(manager.timeProvider instanceof TestClock)) {
      const clock = new TestClock();
      manager.timeProvider = clock;
      // Evict all cached engines so they pick up the new time provider
      manager.evictAll();
      logger.info("Switched to TestClock");
    }
    return manager.timeProvider as TestClock;
  }

  /** GET /dev/clock — current clock state. */
  app.get("/dev/clock", (c) => {
    const isTestClock = manager.timeProvider instanceof TestClock;
    return c.json({
      time: manager.timeProvider.now(),
      iso: new Date(manager.timeProvider.now()).toISOString(),
      mode: isTestClock ? "test" : "system",
      systemTime: Date.now(),
    });
  });

  /** POST /dev/clock/advance — advance test clock by ms. */
  app.post("/dev/clock/advance", async (c) => {
    const body = await c.req.json<{ ms: number }>();
    if (!body.ms || body.ms <= 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "ms must be a positive number" } }, 400);
    }
    const clock = ensureTestClock();
    clock.advance(body.ms);
    // Evict cached engines so new requests see the advanced time
    manager.evictAll();
    logger.info(`TestClock advanced by ${body.ms}ms`, { newTime: new Date(clock.now()).toISOString() });
    return c.json({
      time: clock.now(),
      iso: new Date(clock.now()).toISOString(),
      advanced: body.ms,
    });
  });

  /** POST /dev/clock/set — set test clock to a specific time. */
  app.post("/dev/clock/set", async (c) => {
    const body = await c.req.json<{ time: number }>();
    if (!body.time) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "time (epoch ms) is required" } }, 400);
    }
    const clock = ensureTestClock();
    clock.set(body.time);
    manager.evictAll();
    logger.info(`TestClock set to ${new Date(body.time).toISOString()}`);
    return c.json({
      time: clock.now(),
      iso: new Date(clock.now()).toISOString(),
    });
  });

  /** POST /dev/clock/reset — reset to system time. */
  app.post("/dev/clock/reset", async (c) => {
    const clock = ensureTestClock();
    clock.reset();
    manager.evictAll();
    logger.info("TestClock reset to system time");
    return c.json({
      time: clock.now(),
      iso: new Date(clock.now()).toISOString(),
      mode: "test-reset",
    });
  });

  return app;
}
