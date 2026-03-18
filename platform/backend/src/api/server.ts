/**
 * HTTP API server — wires all routes and middleware.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { BackendConfig } from "../config/schema.js";
import type { UserService } from "../services/user-service.js";
import type { SessionService } from "../services/session-service.js";
import type { MembershipService } from "../services/membership-service.js";
import type { AssemblyCacheService } from "../services/assembly-cache.js";
import type { TopicCacheService } from "../services/topic-cache.js";
import type { PollCacheService } from "../services/poll-cache.js";
import type { NotificationService } from "../services/notification-service.js";
import { logger } from "../lib/logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createRequestLogger } from "./middleware/request-logger.js";
import { errorHandler, AppError } from "./middleware/error-handler.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { metricsRoutes } from "./routes/metrics.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { proxyRoutes } from "./routes/proxy.js";
import { contentRoutes } from "./routes/content.js";
import type { ContentService } from "../services/content-service.js";
import type { VCPClient } from "../services/vcp-client.js";
import type { DatabaseAdapter } from "../adapters/database/interface.js";

export interface AppDependencies {
  database: DatabaseAdapter;
  userService: UserService;
  sessionService: SessionService;
  membershipService: MembershipService;
  assemblyCacheService: AssemblyCacheService;
  topicCacheService: TopicCacheService;
  pollCacheService: PollCacheService;
  notificationService: NotificationService;
  contentService: ContentService;
  vcpClient: VCPClient;
  config: BackendConfig;
}

export function createApp(deps: AppDependencies): Hono {
  const { database, userService, sessionService, membershipService, assemblyCacheService, topicCacheService, pollCacheService, notificationService, contentService, vcpClient, config } = deps;
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
  app.use("*", createAuthMiddleware(config.jwtSecret));

  // Fallback error handler (catches errors from route handlers)
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.statusCode as 400,
      );
    }
    logger.error("Unhandled error", { message: error.message, stack: error.stack });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      500,
    );
  });

  // Routes
  app.route("/", healthRoutes(database));
  app.route("/", metricsRoutes());
  app.route("/", authRoutes(userService, sessionService));
  app.route("/", meRoutes(userService, membershipService, assemblyCacheService, topicCacheService, pollCacheService, notificationService));
  // Content routes BEFORE proxy — these are backend-owned and must take precedence
  app.route("/", contentRoutes(membershipService, contentService, config));
  app.route("/", proxyRoutes(membershipService, assemblyCacheService, topicCacheService, pollCacheService, notificationService, vcpClient, config));

  return app;
}
