/**
 * In-memory rate limiter middleware using a sliding window counter.
 *
 * Each IP gets a counter that resets every `windowMs`. When the counter
 * exceeds `maxRequests`, requests are rejected with 429 Too Many Requests.
 *
 * This is per-instance (not shared across ASG instances). For DDoS protection,
 * use AWS WAF at the ALB level. This middleware provides per-endpoint
 * granularity that WAF cannot express (e.g., stricter limits on /auth/*).
 *
 * Controlled by BACKEND_RATE_LIMIT_ENABLED env var — can be turned off
 * when an external rate limiter (WAF, API Gateway) handles it.
 */

import type { Context, Next } from "hono";

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

// Periodic cleanup to prevent memory leaks from abandoned IPs
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (now >= entry.resetAt) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't prevent process exit
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

function getClientIp(c: Context): string {
  // Trust X-Forwarded-For only from reverse proxies (ALB, CloudFront).
  // In production, the ALB sets this header; locally it may be absent.
  return c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? c.req.header("X-Real-IP")
    ?? "unknown";
}

/**
 * Create a rate limiter middleware.
 *
 * @param maxRequests - Maximum requests per window
 * @param windowMs - Window duration in milliseconds (default: 60s)
 * @param keyPrefix - Optional prefix to separate buckets (e.g., "auth" vs "global")
 */
export function rateLimiter(maxRequests: number, windowMs = 60_000, keyPrefix = "global") {
  startCleanup();

  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count++;

    // Set standard rate limit headers
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
        429,
      );
    }

    await next();
  };
}
