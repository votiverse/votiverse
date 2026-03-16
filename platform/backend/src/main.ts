/**
 * Backend entry point — reads config, wires adapters, starts services.
 */

import { serve } from "@hono/node-server";
import { loadConfig, validateProductionConfig } from "./config/schema.js";
import { configureLogger, logger } from "./lib/logger.js";
import { SQLiteAdapter } from "./adapters/database/sqlite.js";
import type { BackendAdapters } from "./adapters/index.js";
import { createApp } from "./api/server.js";

async function main() {
  const config = loadConfig();
  configureLogger(config.logLevel);

  if (process.env["NODE_ENV"] === "production") {
    validateProductionConfig(config);
  }

  // Wire database adapter
  const database = new SQLiteAdapter(config.dbPath);
  await database.initialize();
  logger.info(`Using SQLite database: ${config.dbPath}`);

  const adapters: BackendAdapters = { database };

  // Create HTTP app
  const app = createApp(adapters, config);

  // Start HTTP server
  const server = serve({
    fetch: app.fetch,
    port: config.port,
  });

  logger.info(`Votiverse Backend started on http://localhost:${config.port}`);
  logger.info(`VCP: ${config.vcpBaseUrl}`);

  // Graceful shutdown
  function shutdown() {
    logger.info("Shutting down...");
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
