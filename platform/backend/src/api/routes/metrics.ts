/**
 * Metrics endpoint.
 */

import { Hono } from "hono";
import { metrics } from "../../lib/metrics.js";

export function metricsRoutes() {
  const app = new Hono();

  app.get("/metrics", (c) => {
    return c.json(metrics.snapshot());
  });

  return app;
}
