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
 * Multi-instance safety: when `advisoryLockId` is provided, the runner
 * acquires a PostgreSQL advisory lock before scanning for migrations.
 * Only one process can hold the lock at a time — others block until it
 * is released, then see the migrations are already applied and skip them.
 * This is safe for auto-scaling groups where multiple instances start
 * simultaneously after a deploy.
 *
 * For the initial deployment, the existing CREATE TABLE IF NOT EXISTS
 * schema in initialize() handles table creation. The migrator is for
 * subsequent schema changes (ALTER TABLE, new indexes, etc.) after
 * production data exists.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseAdapter } from "./interface.js";

export interface MigrationOptions {
  /** PostgreSQL advisory lock ID. When set, prevents concurrent migration runs across instances. */
  advisoryLockId?: number;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export async function runMigrations(
  db: DatabaseAdapter,
  migrationsDir: string,
  options?: MigrationOptions,
): Promise<MigrationResult> {
  const lockId = options?.advisoryLockId;

  if (lockId != null) {
    return db.withConnection(async () => {
      await db.query(`SELECT pg_advisory_lock(${lockId})`);
      try {
        return await applyMigrations(db, migrationsDir);
      } finally {
        await db.query(`SELECT pg_advisory_unlock(${lockId})`);
      }
    });
  }

  return applyMigrations(db, migrationsDir);
}

async function applyMigrations(
  db: DatabaseAdapter,
  migrationsDir: string,
): Promise<MigrationResult> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let files: string[];
  try {
    const entries = await readdir(migrationsDir);
    files = entries
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { applied: [], alreadyApplied: [] };
    }
    throw err;
  }

  if (files.length === 0) {
    return { applied: [], alreadyApplied: [] };
  }

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

    const sql = await readFile(join(migrationsDir, file), "utf-8");

    await db.transaction(async () => {
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        await db.run(stmt);
      }

      await db.run(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [version],
      );
    });

    applied.push(version);
  }

  return { applied, alreadyApplied };
}
