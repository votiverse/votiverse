/**
 * Reset script — wipes backend DB, starts server, seeds, stops server.
 *
 * Assumes VCP is running with seeded data.
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = resolve(ROOT, "backend-dev.db");
const BASE_URL = "http://localhost:4000";

async function main() {
  // 1. Wipe database
  console.log("\n🗑  Wiping database...\n");
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = DB_PATH + suffix;
    if (existsSync(path)) {
      unlinkSync(path);
      console.log(`  Deleted ${path.split("/").pop()}`);
    } else {
      console.log(`  ${(path.split("/").pop())} (not found, skipping)`);
    }
  }

  // 2. Start server
  console.log("\n🚀 Starting backend server...\n");
  const server = spawn("npx", ["tsx", "src/main.ts"], {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, BACKEND_LOG_LEVEL: "warn" },
  });

  // Wait for health check
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!ready) {
    console.error("  Server did not start within 30 seconds");
    server.kill("SIGTERM");
    process.exit(1);
  }
  console.log("  Server is ready.\n");

  // 3. Run seed
  try {
    const { main: seedMain } = await import("./seed.js");
    await seedMain();
  } catch (err) {
    console.error("\nSeed failed:", err);
    server.kill("SIGTERM");
    process.exit(1);
  }

  // 4. Stop server
  console.log("🛑 Stopping server...\n");
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    server.on("close", () => resolve());
    setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 5000);
  });

  console.log("✅ Backend reset complete.\n");
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
