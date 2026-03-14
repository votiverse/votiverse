/**
 * DatabaseAdapter — abstraction over the persistence layer.
 *
 * Application code uses this interface exclusively. The concrete
 * implementation (SQLite for local dev, PostgreSQL for production)
 * is injected at startup.
 */

export interface DatabaseAdapter {
  /** Initialize the database schema (create tables if needed). */
  initialize(): void;

  /** Execute a write statement. Returns number of rows affected. */
  run(sql: string, params?: unknown[]): RunResult;

  /** Query rows. Returns an array of objects. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];

  /** Query a single row. Returns undefined if no match. */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;

  /** Begin a transaction, execute fn, commit on success, rollback on failure. */
  transaction<T>(fn: () => T): T;

  /** Close the database connection. */
  close(): void;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}
