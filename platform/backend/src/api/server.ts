/**
 * HTTP API server — wires all routes and middleware.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { BackendAdapters } from "../adapters/index.js";
import type { BackendConfig } from "../config/schema.js";
import { logger } from "../lib/logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createRequestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { metricsRoutes } from "./routes/metrics.js";

export function createApp(adapters: BackendAdapters, config: BackendConfig): Hono {
  const app = new Hono();

  // Middleware (order matters)
  app.use("*", requestIdMiddleware);
  app.use("*", cors({
    origin: config.corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id"],
  }));
  app.use("*", bodyLimit({
    maxSize: config.maxBodySize,
    onError: (c) => c.json(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds maximum size" } },
      413,
    ),
  }));
  app.use("*", createRequestLogger(logger));
  app.use("*", errorHandler);

  // Fallback error handler
  app.onError((error, c) => {
    logger.error("Unhandled error", { message: error.message, stack: error.stack });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      500,
    );
  });

  // Routes
  app.route("/", healthRoutes(adapters.database));
  app.route("/", metricsRoutes());

  return app;
}
