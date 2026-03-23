/**
 * SQLite database adapter using better-sqlite3.
 *
 * All methods are async to satisfy the DatabaseAdapter interface,
 * but better-sqlite3 is synchronous — Promises resolve immediately.
 */

import Database from "better-sqlite3";
import type { DatabaseAdapter, RunResult } from "./interface.js";

/**
 * Convert params for better-sqlite3 which cannot bind JavaScript booleans.
 * Maps `true` → 1, `false` → 0. All other types pass through unchanged.
 */
function sqliteParams(params: unknown[]): unknown[] {
  return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
}

export class SQLiteAdapter implements DatabaseAdapter {
  readonly dialect = "sqlite" as const;
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async initialize(): Promise<void> {
    // Pragmas are set in the constructor. Schema is managed by migrations.
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...sqliteParams(params));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...sqliteParams(params)) as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...sqliteParams(params)) as T | undefined;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // better-sqlite3 is synchronous, but our interface is async.
    // Use manual BEGIN/COMMIT so we can await the async callback.
    this.db.exec("BEGIN");
    try {
      const result = await fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async withConnection<T>(fn: () => Promise<T>): Promise<T> {
    return fn(); // SQLite uses a single connection — no pinning needed
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
