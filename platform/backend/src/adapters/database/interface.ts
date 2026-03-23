/**
 * DatabaseAdapter — abstraction over the persistence layer.
 *
 * All methods are async to support both synchronous (SQLite) and
 * asynchronous (PostgreSQL) backends.
 */

export interface DatabaseAdapter {
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
