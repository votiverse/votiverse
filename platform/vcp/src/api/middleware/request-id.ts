/**
 * Request ID middleware — generates or accepts X-Request-Id for tracing.
 */

import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";

export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = c.req.header("X-Request-Id") ?? randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
}
