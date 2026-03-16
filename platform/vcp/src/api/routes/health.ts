/**
 * Health check endpoint — reports per-component status.
 */

import { Hono } from "hono";
import type { DatabaseAdapter } from "../../adapters/database/interface.js";
import type { QueueAdapter } from "../../adapters/queue/interface.js";

export function healthRoutes(db: DatabaseAdapter, queue: QueueAdapter) {
  const app = new Hono();

  app.get("/health", async (c) => {
    const components: Record<string, { status: string; details?: Record<string, unknown> }> = {};

    // Database
    try {
      await db.queryOne("SELECT 1 as ok");
      components.database = { status: "ok" };
    } catch {
      components.database = { status: "error", details: { message: "unreachable" } };
    }

    // Queue
    components.queue = {
      status: "ok",
      details: { depth: queue.depth() },
    };

    const overallStatus = Object.values(components).every((comp) => comp.status === "ok")
      ? "ok"
      : "degraded";

    const statusCode = overallStatus === "ok" ? 200 : 503;
    return c.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components,
    }, statusCode);
  });

  return app;
}
