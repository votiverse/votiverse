/**
 * Database migration runner — applies numbered SQL migrations in order.
 *
 * Migrations are .sql files in a directory, named with a numeric prefix:
 *   001_initial.sql           — common (works on both SQLite and PostgreSQL)
 *   001_initial.sqlite.sql    — SQLite-specific override
 *   001_initial.postgres.sql  — PostgreSQL-specific override
 *
 * When both a dialect-specific file and a common file exist for the same
 * version, the dialect-specific file takes priority.
 *
 * The runner tracks applied migrations in a `schema_migrations` table.
 * On startup, it runs any unapplied migrations in order. Migrations
 * are applied within a transaction (one per file).
 *
 * Multi-instance safety: when `advisoryLockId` is provided, the runner
 * acquires a PostgreSQL advisory lock before scanning for migrations.
 * Only one process can hold the lock at a time — others block until it
 * is released, then see the migrations are already applied and skip them.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseAdapter } from "./interface.js";

export interface MigrationOptions {
  /** PostgreSQL advisory lock ID. When set, prevents concurrent migration runs across instances. */
  advisoryLockId?: number;
  /** Database dialect for selecting dialect-specific migration files. Defaults to db.dialect. */
  dialect?: "sqlite" | "postgres";
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
  const dialect = options?.dialect ?? db.dialect;

  if (lockId != null) {
    // Pin to a single connection so the lock and unlock target the same session
    return db.withConnection(async () => {
      await db.query("SELECT pg_advisory_lock(?)", [lockId]);
      try {
        return await applyMigrations(db, migrationsDir, dialect);
      } finally {
        await db.query("SELECT pg_advisory_unlock(?)", [lockId]);
      }
    });
  }

  return applyMigrations(db, migrationsDir, dialect);
}

/**
 * Split SQL text into individual statements, respecting:
 *
 * 1. `$$` delimited blocks (PostgreSQL function/trigger bodies that contain `;`)
 * 2. `BEGIN...END` blocks (SQLite trigger bodies that contain `;`)
 *
 * Strategy: scan character by character. Track whether we're inside a `$$`
 * block or a `BEGIN...END` block. Only split on `;` when outside both.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let beginDepth = 0;

  while (i < sql.length) {
    // Check for $$ delimiter (PostgreSQL)
    if (sql[i] === "$" && i + 1 < sql.length && sql[i + 1] === "$") {
      current += "$$";
      i += 2;
      // Scan until closing $$
      while (i < sql.length) {
        if (sql[i] === "$" && i + 1 < sql.length && sql[i + 1] === "$") {
          current += "$$";
          i += 2;
          break;
        }
        current += sql[i];
        i++;
      }
      continue;
    }

    // Check for SQL BEGIN keyword (SQLite triggers use BEGIN...END)
    // Match BEGIN only when preceded by a word boundary (whitespace/newline/start)
    if (beginDepth === 0 && matchKeyword(sql, i, "BEGIN")) {
      beginDepth++;
      current += sql.slice(i, i + 5);
      i += 5;
      continue;
    }

    // Check for END keyword to close a BEGIN block
    // END must be followed by ; or whitespace or end-of-string
    if (beginDepth > 0 && matchKeyword(sql, i, "END")) {
      beginDepth--;
      current += sql.slice(i, i + 3);
      i += 3;
      continue;
    }

    if (sql[i] === ";") {
      if (beginDepth > 0) {
        // Inside a BEGIN...END block — keep the semicolon as part of the statement
        current += ";";
        i++;
      } else {
        // End of statement
        const trimmed = current.trim();
        if (trimmed.length > 0 && !trimmed.startsWith("--")) {
          statements.push(trimmed);
        }
        current = "";
        i++;
      }
      continue;
    }

    // Check for single-line comments (-- to end of line) — skip entirely
    if (sql[i] === "-" && i + 1 < sql.length && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        i++;
      }
      continue;
    }

    current += sql[i];
    i++;
  }

  // Handle any trailing content (no final semicolon)
  const trimmed = current.trim();
  if (trimmed.length > 0 && !trimmed.startsWith("--")) {
    statements.push(trimmed);
  }

  return statements;
}

/**
 * Check if the SQL keyword appears at position `i`, bounded by non-word
 * characters on both sides (or start/end of string). Case-insensitive.
 */
function matchKeyword(sql: string, i: number, keyword: string): boolean {
  // Check preceding character is a word boundary
  if (i > 0 && /\w/.test(sql[i - 1]!)) return false;

  // Check the keyword itself matches (case-insensitive)
  const slice = sql.slice(i, i + keyword.length);
  if (slice.toUpperCase() !== keyword) return false;

  // Check following character is a word boundary
  const after = i + keyword.length;
  if (after < sql.length && /\w/.test(sql[after]!)) return false;

  return true;
}

/**
 * Extract the migration version from a filename by stripping the dialect and
 * .sql suffixes. E.g.:
 *   "001_initial.sql"          → "001_initial"
 *   "001_initial.sqlite.sql"   → "001_initial"
 *   "001_initial.postgres.sql" → "001_initial"
 */
function extractVersion(filename: string): string {
  return filename
    .replace(/\.(sqlite|postgres)\.sql$/, "")
    .replace(/\.sql$/, "");
}

/**
 * Determine if a file is dialect-specific and which dialect it targets.
 * Returns "sqlite", "postgres", or null (common).
 */
function fileDialect(filename: string): "sqlite" | "postgres" | null {
  if (filename.endsWith(".sqlite.sql")) return "sqlite";
  if (filename.endsWith(".postgres.sql")) return "postgres";
  return null;
}

async function applyMigrations(
  db: DatabaseAdapter,
  migrationsDir: string,
  dialect: "sqlite" | "postgres",
): Promise<MigrationResult> {
  // Ensure the migrations tracking table exists
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Read all .sql files from the migrations directory, sorted by name
  let allFiles: string[];
  try {
    const entries = await readdir(migrationsDir);
    allFiles = entries
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { applied: [], alreadyApplied: [] };
    }
    throw err;
  }

  if (allFiles.length === 0) {
    return { applied: [], alreadyApplied: [] };
  }

  // Group files by version, pick the most specific file per dialect.
  // Priority: dialect-specific > common
  const versionFileMap = new Map<string, string>();

  for (const file of allFiles) {
    const version = extractVersion(file);
    const fd = fileDialect(file);

    if (fd !== null && fd !== dialect) {
      // This file is for the other dialect — skip it
      continue;
    }

    const existing = versionFileMap.get(version);
    if (existing === undefined) {
      // First file for this version
      versionFileMap.set(version, file);
    } else {
      // If we already have a common file but this is dialect-specific, prefer dialect-specific
      const existingDialect = fileDialect(existing);
      if (existingDialect === null && fd === dialect) {
        versionFileMap.set(version, file);
      }
      // If both are common or both are dialect-specific, keep the first (sorted order)
    }
  }

  // Sort versions in order
  const versions = [...versionFileMap.keys()].sort();

  // Get already-applied migrations
  const appliedRows = await db.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const version of versions) {
    if (appliedSet.has(version)) {
      alreadyApplied.push(version);
      continue;
    }

    const file = versionFileMap.get(version)!;
    // Read and execute the migration
    const sql = await readFile(join(migrationsDir, file), "utf-8");

    await db.transaction(async () => {
      const statements = splitStatements(sql);

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
