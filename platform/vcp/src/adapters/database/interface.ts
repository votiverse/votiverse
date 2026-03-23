/**
 * DatabaseAdapter — abstraction over the persistence layer.
 *
 * Application code uses this interface exclusively. The concrete
 * implementation (SQLite for local dev, PostgreSQL for production)
 * is injected at startup.
 *
 * All methods are async to support both synchronous (SQLite) and
 * asynchronous (PostgreSQL) backends.
 */

export interface DatabaseAdapter {
  /** Initialize the database schema (create tables if needed). */
  initialize(): Promise<void>;

  /** Execute a write statement. Returns number of rows affected. */
  run(sql: string, params?: unknown[]): Promise<RunResult>;

  /** Query rows. Returns an array of objects. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Query a single row. Returns undefined if no match. */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /** Begin a transaction, execute fn, commit on success, rollback on failure. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Pin all operations within `fn` to a single underlying connection.
   *
   * On PostgreSQL (pooled), this checks out a client for the duration of `fn`
   * so that session-scoped state (advisory locks, temp tables, SET commands)
   * is preserved across multiple queries. On SQLite (single-connection), this
   * is a pass-through.
   *
   * Note: `transaction()` calls inside `fn` may still use separate connections
   * from the pool — `withConnection` only pins non-transactional operations.
   */
  withConnection<T>(fn: () => Promise<T>): Promise<T>;

  /** Close the database connection. */
  close(): Promise<void>;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Parse a value that may be a JSON string (SQLite TEXT) or an already-parsed
 * object (PostgreSQL JSONB). Use this for every column that is JSONB in
 * PostgreSQL / TEXT-with-JSON in SQLite.
 *
 * Passing `null` or `undefined` returns the value as-is (typed as T) so
 * callers can handle nullable columns naturally.
 */
export function parseJsonColumn<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}
