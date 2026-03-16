/**
 * Rate limiting middleware — in-memory sliding window per client.
 *
 * Keyed by authenticated client ID (from auth middleware).
 * Disabled when rpm = 0 (default in dev).
 */

import type { Context, Next } from "hono";
import type { ClientInfo } from "../../adapters/auth/interface.js";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export function createRateLimiter(options: { rpm: number }) {
  const { rpm } = options;
  const buckets = new Map<string, Bucket>();
  const refillIntervalMs = 60_000;

  return async (c: Context, next: Next) => {
    if (c.req.path === "/health" || c.req.path === "/metrics") return next();

    const client = c.get("client") as ClientInfo | undefined;
    const key = client?.id ?? c.req.header("x-forwarded-for") ?? "unknown";

    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: rpm, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= refillIntervalMs) {
      bucket.tokens = rpm;
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      const retryAfter = Math.ceil((refillIntervalMs - elapsed) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }

    bucket.tokens--;
    return next();
  };
}
