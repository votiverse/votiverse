/**
 * HTTP request logging middleware — replaces Hono's built-in logger()
 * with structured output that respects the configured log level.
 */

import type { Context, Next } from "hono";
import type { Logger } from "../../lib/logger.js";

export function createRequestLogger(log: Logger) {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log[level](`${c.req.method} ${c.req.path}`, {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: duration,
    });
  };
}
