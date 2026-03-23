/**
 * VCP entry point — reads config, wires adapters, starts services.
 */

import { serve } from "@hono/node-server";
import { loadConfig, validateProductionConfig } from "./config/schema.js";
import { configureLogger, logger } from "./lib/logger.js";
import type { DatabaseAdapter } from "./adapters/database/interface.js";
import { SQLiteAdapter } from "./adapters/database/sqlite.js";
import { MemoryQueueAdapter } from "./adapters/queue/memory.js";
import { LocalSchedulerAdapter } from "./adapters/scheduler/local.js";
import { ConsoleWebhookAdapter } from "./adapters/webhook/console.js";
import { SimpleAuthAdapter } from "./adapters/auth/simple.js";
import type { VCPAdapters } from "./adapters/index.js";
import { AssemblyManager } from "./engine/assembly-manager.js";
import { createApp } from "./api/server.js";
import { runMigrations } from "./adapters/database/migrator.js";

async function main() {
  const config = loadConfig();
  configureLogger(config.logLevel);

  if (process.env["NODE_ENV"] === "production") {
    validateProductionConfig(config);
  }

  // Wire database adapter — PostgreSQL if configured, SQLite otherwise
  let database: DatabaseAdapter;
  if (config.databaseUrl) {
    const { PostgresAdapter } = await import("./adapters/database/postgres.js");
    database = new PostgresAdapter(config.databaseUrl);
    logger.info("Using PostgreSQL database");
  } else {
    database = new SQLiteAdapter(config.dbPath);
    logger.info(`Using SQLite database: ${config.dbPath}`);
  }
  await database.initialize();

  // Run pending migrations (if any).
  // Advisory lock prevents concurrent migration runs across auto-scaled instances.
  const migrationsDir = new URL("../migrations", import.meta.url).pathname;
  const migrationResult = await runMigrations(database, migrationsDir, {
    advisoryLockId: config.databaseUrl ? 739184_63 : undefined,
    dialect: database.dialect,
  });
  if (migrationResult.applied.length > 0) {
    logger.info(`Applied ${migrationResult.applied.length} migration(s): ${migrationResult.applied.join(", ")}`);
  }

  const queue = new MemoryQueueAdapter();
  const scheduler = new LocalSchedulerAdapter();
  const webhook = new ConsoleWebhookAdapter();
  const auth = new SimpleAuthAdapter(config.apiKeys, database);

  const adapters: VCPAdapters = { database, queue, scheduler, webhook, auth };

  // Create assembly manager
  const manager = new AssemblyManager(database, queue);

  // Create HTTP app
  const app = createApp(adapters, manager, config);

  // Start queue processor
  queue.start();

  // Start HTTP server
  const server = serve({
    fetch: app.fetch,
    port: config.port,
  });

  logger.info(`Votiverse Cloud Platform started on http://localhost:${config.port}`);
  logger.info(`API key: ${config.apiKeys[0]?.key.slice(0, 12) ?? "(none)"}...`);

  // Graceful shutdown
  function shutdown() {
    logger.info("Shutting down...");
    queue.stop();
    scheduler.stopAll();
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
  logger.error("Failed to start VCP", { error: String(err) });
  process.exit(1);
});
