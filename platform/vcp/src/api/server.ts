/**
 * HTTP API server — wires all routes together.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { VCPAdapters } from "../adapters/index.js";
import type { VCPConfig } from "../config/schema.js";
import { logger } from "../lib/logger.js";
import { createRequestLogger } from "./middleware/request-logger.js";
import type { AssemblyManager } from "../engine/assembly-manager.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { assemblyRoutes } from "./routes/assemblies.js";
import { participantRoutes } from "./routes/participants.js";
import { eventRoutes } from "./routes/events.js";
import { delegationRoutes } from "./routes/delegations.js";
import { votingRoutes } from "./routes/voting.js";
import { predictionRoutes } from "./routes/predictions.js";
import { pollRoutes } from "./routes/polls.js";
import { awarenessRoutes } from "./routes/awareness.js";
import { topicRoutes } from "./routes/topics.js";
import { stubRoutes } from "./routes/stubs.js";

export function createApp(adapters: VCPAdapters, manager: AssemblyManager, config?: VCPConfig): Hono {
  const app = new Hono();

  // Middleware
  app.use("*", cors({
    origin: config?.corsOrigins ?? ["http://localhost:5173", "http://localhost:5174"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Participant-Id"],
  }));
  app.use("*", createRequestLogger(logger));
  app.use("*", errorHandler);
  app.use("*", createAuthMiddleware(adapters.auth));

  // Fallback error handler — ensures all unhandled errors return JSON
  app.onError((error, c) => {
    // Routes that skip explicit assembly checks throw errors from getEngine().
    // Map them to 404 for consistency with routes that do explicit checks.
    if (error.message?.includes("not found") && error.message?.includes("Assembly")) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: error.message } },
        404,
      );
    }
    logger.error("Unhandled error", { message: error.message, stack: error.stack });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      500,
    );
  });

  // Routes
  app.route("/", healthRoutes(adapters.database));
  app.route("/", assemblyRoutes(manager));
  app.route("/", participantRoutes(manager));
  app.route("/", eventRoutes(manager));
  app.route("/", delegationRoutes(manager));
  app.route("/", votingRoutes(manager));
  app.route("/", predictionRoutes(manager));
  app.route("/", pollRoutes(manager));
  app.route("/", topicRoutes(manager));
  app.route("/", awarenessRoutes(manager));
  app.route("/", stubRoutes());

  return app;
}
