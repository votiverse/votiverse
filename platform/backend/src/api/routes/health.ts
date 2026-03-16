/**
 * Health check endpoint.
 */

import { Hono } from "hono";
import type { DatabaseAdapter } from "../../adapters/database/interface.js";

export function healthRoutes(db: DatabaseAdapter) {
  const app = new Hono();

  app.get("/health", async (c) => {
    try {
      await db.queryOne("SELECT 1 as ok");
      return c.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch {
      return c.json({ status: "error", message: "Database unreachable" }, 503);
    }
  });

  return app;
}
