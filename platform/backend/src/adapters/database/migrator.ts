/**
 * Database migration runner — applies numbered SQL migrations in order.
 *
 * Migrations are .sql files in a directory, named with a numeric prefix:
 *   001_initial_schema.sql
 *   002_add_email_verification.sql
 *   003_add_reset_tokens.sql
 *
 * The runner tracks applied migrations in a `schema_migrations` table.
 * On startup, it runs any unapplied migrations in order. Migrations
 * are applied within a transaction (one per file).
 *
 * For the initial deployment, the existing CREATE TABLE IF NOT EXISTS
 * schema in initialize() handles table creation. The migrator is for
 * subsequent schema changes (ALTER TABLE, new indexes, etc.) after
 * production data exists.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseAdapter } from "./interface.js";

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export async function runMigrations(
  db: DatabaseAdapter,
  migrationsDir: string,
): Promise<MigrationResult> {
  // Ensure the migrations tracking table exists
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  // Read all .sql files from the migrations directory, sorted by name
  let files: string[];
  try {
    const entries = await readdir(migrationsDir);
    files = entries
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // No migrations directory — nothing to do
      return { applied: [], alreadyApplied: [] };
    }
    throw err;
  }

  if (files.length === 0) {
    return { applied: [], alreadyApplied: [] };
  }

  // Get already-applied migrations
  const appliedRows = await db.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");

    if (appliedSet.has(version)) {
      alreadyApplied.push(version);
      continue;
    }

    // Read and execute the migration
    const sql = await readFile(join(migrationsDir, file), "utf-8");

    await db.transaction(async () => {
      // Split on semicolons and execute each statement
      // (PostgreSQL can handle multi-statement strings, but SQLite sometimes can't in prepared statements)
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        await db.run(stmt);
      }

      // Record the migration
      await db.run(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [version],
      );
    });

    applied.push(version);
  }

  return { applied, alreadyApplied };
}
