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
import type { SurveyCacheService } from "../services/survey-cache.js";
import type { NotificationService } from "../services/notification-service.js";
import { logger } from "../lib/logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { createRequestLogger } from "./middleware/request-logger.js";
import { errorHandler, AppError } from "./middleware/error-handler.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { metricsRoutes } from "./routes/metrics.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { proxyRoutes } from "./routes/proxy.js";
import { contentRoutes } from "./routes/content.js";
import { invitationRoutes } from "./routes/invitations.js";
import { InvitationService } from "../services/invitation-service.js";
import { InvitationNotifier } from "../services/invitation-notifier.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { JoinRequestService } from "../services/join-request-service.js";
import { NotificationHubService } from "../services/notification-hub.js";
import type { NotificationAdapter } from "../services/notification-adapter.js";
import type { ContentService } from "../services/content-service.js";
import type { VCPClient } from "../services/vcp-client.js";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { PushDeliveryService } from "../services/push-delivery.js";
import type { AssetStore } from "../services/asset-store.js";
import { DatabaseAssetStore } from "../services/asset-store.js";

export interface AppDependencies {
  database: DatabaseAdapter;
  userService: UserService;
  sessionService: SessionService;
  membershipService: MembershipService;
  assemblyCacheService: AssemblyCacheService;
  topicCacheService: TopicCacheService;
  surveyCacheService: SurveyCacheService;
  notificationService: NotificationService;
  notificationAdapter?: NotificationAdapter;
  pushService?: PushDeliveryService;
  contentService: ContentService;
  vcpClient: VCPClient;
  assetStore?: AssetStore;
  config: BackendConfig;
}

export function createApp(deps: AppDependencies): Hono {
  const { database, userService, sessionService, membershipService, assemblyCacheService, topicCacheService, surveyCacheService, notificationService, contentService, vcpClient, config } = deps;
  const app = new Hono();

  // Middleware (order matters)
  app.use("*", requestIdMiddleware);
  app.use("*", securityHeaders);
  app.use("*", cors({
    origin: config.corsOrigins,
    credentials: true,
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

  // Block dev/internal endpoints in production — fail closed
  const isProduction = process.env["NODE_ENV"] === "production";
  if (isProduction) {
    app.use("/dev/*", (c) =>
      c.json({ error: { code: "FORBIDDEN", message: "Dev routes are disabled in production" } }, 403),
    );
    app.use("/internal/*", (c) =>
      c.json({ error: { code: "FORBIDDEN", message: "Internal routes are disabled in production" } }, 403),
    );
  }

  // Rate limiting (can be disabled when AWS WAF handles it)
  if (config.rateLimitEnabled) {
    // Stricter limit on auth endpoints (10 req/min per IP)
    app.use("/auth/*", rateLimiter(10, 60_000, "auth"));
    // Global baseline (100 req/min per IP)
    app.use("*", rateLimiter(100, 60_000, "global"));
  }

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
    const isProduction = process.env["NODE_ENV"] === "production";
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: isProduction ? "An internal error occurred" : error.message } },
      500,
    );
  });

  // Services (must be created before routes)
  const notificationHub = new NotificationHubService(
    database, membershipService, assemblyCacheService,
    deps.notificationAdapter ?? null, notificationService, vcpClient,
  );
  // Wire hub into notification service so scheduled notifications also create hub records
  notificationService.setHub(notificationHub);
  // Wire push delivery into hub
  if (deps.pushService) {
    notificationHub.setPushService(deps.pushService);
  }
  const invitationService = new InvitationService(database, membershipService);
  const joinRequestService = new JoinRequestService(database);
  const frontendUrl = config.corsOrigins.find((o) => o !== "*") ?? "http://localhost:5174";
  const invitationNotifier = deps.notificationAdapter
    ? new InvitationNotifier(deps.notificationAdapter, userService, assemblyCacheService, frontendUrl)
    : null;

  // Routes
  app.route("/", healthRoutes(database));
  app.route("/", metricsRoutes());
  app.route("/", authRoutes(userService, sessionService, config, deps.notificationAdapter));
  app.route("/", meRoutes(userService, membershipService, assemblyCacheService, topicCacheService, surveyCacheService, notificationService, notificationHub, database));
  app.route("/", invitationRoutes(invitationService, joinRequestService, membershipService, assemblyCacheService, vcpClient, userService, invitationNotifier, notificationHub));
  // Content routes BEFORE proxy — these are backend-owned and must take precedence
  const assetStore = deps.assetStore ?? new DatabaseAssetStore(database, frontendUrl);
  app.route("/", contentRoutes(membershipService, contentService, config, assetStore));
  app.route("/", proxyRoutes(membershipService, assemblyCacheService, topicCacheService, surveyCacheService, notificationService, vcpClient, config));

  return app;
}
