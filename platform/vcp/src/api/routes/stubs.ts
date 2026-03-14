/**
 * Stub routes — endpoints that return 501 Not Implemented.
 */

import { Hono } from "hono";

export function stubRoutes() {
  const app = new Hono();

  const stub = (c: import("hono").Context) =>
    c.json(
      { error: { code: "NOT_IMPLEMENTED", message: "This endpoint is not yet implemented" } },
      501,
    );

  // Integrity endpoints
  app.post("/assemblies/:id/integrity/commit", stub);
  app.get("/assemblies/:id/integrity/verify/:cid", stub);

  // Webhook management
  app.post("/webhooks", stub);
  app.get("/webhooks", stub);
  app.delete("/webhooks/:id", stub);

  return app;
}
