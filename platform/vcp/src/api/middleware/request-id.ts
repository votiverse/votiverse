/**
 * Request ID middleware — generates or accepts X-Request-Id for tracing.
 */

import { v7 as uuidv7 } from "uuid";
import type { Context, Next } from "hono";

export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = c.req.header("X-Request-Id") ?? uuidv7();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
}
