/**
 * HTTP API server — wires all routes together.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { VCPAdapters } from "../adapters/index.js";
import type { VCPConfig } from "../config/schema.js";
import { logger } from "../lib/logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createRequestLogger } from "./middleware/request-logger.js";
import type { AssemblyManager } from "../engine/assembly-manager.js";
import { createAuthMiddleware, requireAssemblyAccess } from "./middleware/auth.js";
import { createRateLimiter } from "./middleware/rate-limiter.js";
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
import { authRoutes } from "./routes/auth.js";
import { metricsRoutes } from "./routes/metrics.js";
import { devRoutes } from "./routes/dev.js";
import { stubRoutes } from "./routes/stubs.js";

export function createApp(adapters: VCPAdapters, manager: AssemblyManager, config?: VCPConfig): Hono {
  const app = new Hono();

  // Middleware (order matters)
  app.use("*", requestIdMiddleware);
  app.use("*", cors({
    origin: config?.corsOrigins ?? ["http://localhost:5173", "http://localhost:5174"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Participant-Id", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id"],
  }));
  app.use("*", bodyLimit({
    maxSize: config?.maxBodySize ?? 1024 * 1024,
    onError: (c) => {
      return c.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds maximum size" } },
        413,
      );
    },
  }));
  app.use("*", createRequestLogger(logger));
  app.use("*", errorHandler);
  app.use("*", createAuthMiddleware(adapters.auth, config?.jwtSecret));

  // Client-assembly access enforcement (after auth, before routes)
  app.use("/assemblies/:id/*", requireAssemblyAccess());
  app.use("/assemblies/:id", requireAssemblyAccess());

  // Rate limiting (after auth so we can key by client ID)
  if (config?.rateLimitRpm && config.rateLimitRpm > 0) {
    app.use("*", createRateLimiter({ rpm: config.rateLimitRpm }));
  }

  // Global error handler — Hono's compose routes errors here, bypassing
  // middleware try/catch blocks. All domain error classification lives here.
  app.onError((error, c) => {
    // Use error.name for cross-module resilience (instanceof fails when
    // vitest loads engine source alongside VCP source, creating separate
    // class instances for the same error type).
    if (error.name === "AssemblyNotFoundError" || (error.message?.includes("not found") && error.message?.includes("Assembly"))) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: error.message } },
        404,
      );
    }

    if (error.name === "NotFoundError") {
      return c.json(
        { error: { code: "NOT_FOUND", message: error.message } },
        404,
      );
    }

    if (error.name === "ValidationError") {
      const e = error as Error & { field?: string };
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: error.message, details: { field: e.field } } },
        400,
      );
    }

    if (error.name === "GovernanceRuleViolation") {
      const e = error as Error & { rule?: string };
      return c.json(
        { error: { code: "GOVERNANCE_RULE_VIOLATION", message: error.message, details: { rule: e.rule } } },
        409,
      );
    }

    if (error.name === "InvalidStateError") {
      return c.json(
        { error: { code: "ENGINE_ERROR", message: error.message } },
        400,
      );
    }

    if (error.name === "VotiverseError") {
      return c.json(
        { error: { code: "ENGINE_ERROR", message: error.message } },
        400,
      );
    }

    logger.error("Unhandled error", { message: error.message, stack: error.stack });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      500,
    );
  });

  // Routes
  app.route("/", healthRoutes(adapters.database, adapters.queue));
  if (config) {
    app.route("/", authRoutes(manager, config));
  }
  app.route("/", assemblyRoutes(manager, adapters.auth));
  app.route("/", participantRoutes(manager));
  app.route("/", eventRoutes(manager));
  app.route("/", delegationRoutes(manager));
  app.route("/", votingRoutes(manager));
  app.route("/", predictionRoutes(manager));
  app.route("/", pollRoutes(manager));
  app.route("/", topicRoutes(manager));
  app.route("/", awarenessRoutes(manager));
  app.route("/", metricsRoutes());
  // Dev-only routes (test clock) — never in production
  if (process.env["NODE_ENV"] !== "production") {
    app.route("/", devRoutes(manager));
  }
  app.route("/", stubRoutes());

  return app;
}
