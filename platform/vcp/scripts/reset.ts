/**
 * Reset script — wipes the database, starts the VCP server, runs seed, stops the server.
 *
 * Usage: pnpm reset
 */

import { unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VCP_ROOT = resolve(__dirname, "..");
const DB_FILES = ["vcp-dev.db", "vcp-dev.db-shm", "vcp-dev.db-wal"];

const BASE_URL = process.env["VCP_URL"] ?? "http://localhost:3000";

// ── Step 1: Delete database files ────────────────────────────────────

console.log("\n🗑  Wiping database...\n");
for (const file of DB_FILES) {
  const path = resolve(VCP_ROOT, file);
  try {
    unlinkSync(path);
    console.log(`  Deleted ${file}`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.log(`  ${file} (not found, skipping)`);
  }
}

// ── Step 2: Start VCP server ─────────────────────────────────────────

console.log("\n🚀 Starting VCP server...\n");

const server = spawn("npx", ["tsx", "src/main.ts"], {
  cwd: VCP_ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env },
});

let serverOutput = "";
server.stdout?.on("data", (data: Buffer) => {
  serverOutput += data.toString();
});
server.stderr?.on("data", (data: Buffer) => {
  serverOutput += data.toString();
});

// ── Step 3: Wait for health check ────────────────────────────────────

async function waitForHealth(maxRetries = 60, intervalMs = 500): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        console.log("  Server is ready.\n");
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error("  Server output:\n", serverOutput);
  throw new Error(`Server did not start within ${(maxRetries * intervalMs) / 1000}s`);
}

await waitForHealth();

// ── Step 4: Run seed ─────────────────────────────────────────────────

try {
  const { main } = await import("./seed.js");
  await main();
} catch (err) {
  console.error("\nSeed failed:", err);
  server.kill("SIGTERM");
  process.exit(1);
}

// ── Step 5: Stop server ──────────────────────────────────────────────

console.log("🛑 Stopping server...\n");
server.kill("SIGTERM");

// Give it a moment to shut down gracefully
await new Promise((r) => setTimeout(r, 500));

console.log("✅ Reset complete. Run `pnpm dev` to start the server with fresh data.\n");
