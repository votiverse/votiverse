/**
 * Backend entry point — reads config, wires services, starts server.
 */

import { serve } from "@hono/node-server";
import { loadConfig, validateProductionConfig } from "./config/schema.js";
import { configureLogger, logger } from "./lib/logger.js";
import { SQLiteAdapter } from "./adapters/database/sqlite.js";
import { PostgresAdapter } from "./adapters/database/postgres.js";
import type { DatabaseAdapter } from "./adapters/database/interface.js";
import { UserService } from "./services/user-service.js";
import { SessionService } from "./services/session-service.js";
import { MembershipService } from "./services/membership-service.js";
import { AssemblyCacheService } from "./services/assembly-cache.js";
import { VCPClient } from "./services/vcp-client.js";
import { NotificationService } from "./services/notification-service.js";
import { ConsoleNotificationAdapter, FileNotificationAdapter, SmtpNotificationAdapter } from "./services/notification-adapter.js";
import type { NotificationAdapter } from "./services/notification-adapter.js";
import { createApp } from "./api/server.js";

async function main() {
  const config = loadConfig();
  configureLogger(config.logLevel);

  if (process.env["NODE_ENV"] === "production") {
    validateProductionConfig(config);
  }

  // Wire database
  let database: DatabaseAdapter;
  if (config.databaseUrl) {
    database = new PostgresAdapter(config.databaseUrl);
    await database.initialize();
    logger.info("Using PostgreSQL database");
  } else {
    database = new SQLiteAdapter(config.dbPath);
    await database.initialize();
    logger.info(`Using SQLite database: ${config.dbPath}`);
  }

  // Wire services
  const userService = new UserService(database);
  const sessionService = new SessionService(
    database,
    config.jwtSecret,
    config.jwtAccessExpiry,
    config.jwtRefreshExpiry,
  );
  const vcpClient = new VCPClient(config.vcpBaseUrl, config.vcpApiKey);
  const assemblyCacheService = new AssemblyCacheService(database);
  const membershipService = new MembershipService(database, vcpClient, assemblyCacheService);

  // Wire notification service
  const isProduction = process.env["NODE_ENV"] === "production";
  let adapterChoice = config.notificationAdapter;

  // Safety guard: block real email delivery in dev unless explicitly opted in
  if (!isProduction && (adapterChoice === "smtp" || adapterChoice === "ses" || adapterChoice === "twilio")) {
    logger.warn(
      `Notification adapter "${adapterChoice}" requested but NODE_ENV is not "production". ` +
      `Falling back to "file" adapter to prevent accidental email delivery. ` +
      `Set NODE_ENV=production to send real emails.`,
    );
    adapterChoice = "file";
  }

  let notificationAdapter: NotificationAdapter;
  switch (adapterChoice) {
    case "smtp":
      notificationAdapter = new SmtpNotificationAdapter({
        host: config.smtpHost,
        port: config.smtpPort,
        user: config.smtpUser,
        pass: config.smtpPass,
        from: config.smtpFrom,
      });
      break;
    case "file":
      notificationAdapter = new FileNotificationAdapter(config.notificationFileDir);
      break;
    default:
      notificationAdapter = new ConsoleNotificationAdapter();
      break;
  }
  logger.info(`Notification adapter: ${adapterChoice}`);
  const notificationService = new NotificationService(
    database,
    notificationAdapter,
    vcpClient,
    config.vcpBaseUrl,
  );

  // Create HTTP app
  const app = createApp({ database, userService, sessionService, membershipService, assemblyCacheService, notificationService, config });

  // Start HTTP server
  const server = serve({
    fetch: app.fetch,
    port: config.port,
  });

  // Start notification scheduler
  const schedulerInterval = setInterval(() => {
    notificationService.processScheduledNotifications().catch((err) =>
      logger.error("Notification scheduler failed", { error: String(err) }),
    );
  }, config.notificationIntervalMs);
  logger.info(`Notification scheduler started (interval: ${config.notificationIntervalMs}ms)`);

  logger.info(`Votiverse Backend started on http://localhost:${config.port}`);
  logger.info(`VCP: ${config.vcpBaseUrl}`);

  // Graceful shutdown
  function shutdown() {
    logger.info("Shutting down...");
    clearInterval(schedulerInterval);
    void database.close();
    if (server && "close" in server) {
      (server as { close: () => void }).close();
    }
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Failed to start backend", { error: String(err) });
  process.exit(1);
});
