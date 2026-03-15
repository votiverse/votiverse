/**
 * HTTP API server — wires all routes together.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { VCPAdapters } from "../adapters/index.js";
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

export function createApp(adapters: VCPAdapters, manager: AssemblyManager): Hono {
  const app = new Hono();

  // Middleware
  app.use("*", cors({
    origin: (origin) => origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Participant-Id"],
  }));
  app.use("*", logger());
  app.use("*", errorHandler);
  app.use("*", createAuthMiddleware(adapters.auth));

  // Fallback error handler — ensures all unhandled errors return JSON
  app.onError((error, c) => {
    console.error("[error] unhandled:", error.message, error.stack);
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
