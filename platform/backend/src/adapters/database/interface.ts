/**
 * DatabaseAdapter — abstraction over the persistence layer.
 *
 * All methods are async to support both synchronous (SQLite) and
 * asynchronous (PostgreSQL) backends.
 */

export interface DatabaseAdapter {
  /** The SQL dialect of the underlying database. */
  readonly dialect: "sqlite" | "postgres";

  initialize(): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Pin all operations within `fn` to a single underlying connection.
   *
   * On PostgreSQL (pooled), this checks out a client for the duration of `fn`
   * so that session-scoped state (advisory locks, temp tables, SET commands)
   * is preserved across multiple queries. On SQLite (single-connection), this
   * is a pass-through.
   */
  withConnection<T>(fn: () => Promise<T>): Promise<T>;
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
