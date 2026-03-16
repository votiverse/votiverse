/**
 * HTTP request logging middleware with metrics integration.
 */

import type { Context, Next } from "hono";
import type { Logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";

export function createRequestLogger(log: Logger) {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    metrics.record(status, duration);
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const requestId = c.get("requestId") as string | undefined;
    log[level](`${c.req.method} ${c.req.path}`, {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: duration,
      ...(requestId ? { requestId } : {}),
    });
  };
}
