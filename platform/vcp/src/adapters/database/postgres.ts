/**
 * PostgreSQL database adapter using node-postgres (pg).
 *
 * Uses AsyncLocalStorage to scope queries to transactional clients
 * when inside a transaction() call.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import type { DatabaseAdapter, RunResult } from "./interface.js";

// PostgreSQL returns BIGINT (OID 20) as strings because JS numbers can't represent
// all 64-bit integers. Our timestamps fit safely in JS numbers, so parse them back.
pg.types.setTypeParser(20, (val: string) => Number(val));

/**
 * Translate `?` placeholders to PostgreSQL `$1, $2, ...` style.
 * Safe for this codebase where `?` never appears in string literals.
 */
function translatePlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = "postgres" as const;
  private readonly pool: pg.Pool;
  private readonly als = new AsyncLocalStorage<pg.PoolClient>();

  constructor(connectionString: string, poolConfig?: { max?: number; idleTimeoutMillis?: number; connectionTimeoutMillis?: number }) {
    this.pool = new pg.Pool({
      connectionString,
      max: poolConfig?.max ?? 20,
      idleTimeoutMillis: poolConfig?.idleTimeoutMillis ?? 30_000,
      connectionTimeoutMillis: poolConfig?.connectionTimeoutMillis ?? 5_000,
    });
  }

  async initialize(): Promise<void> {
    // Schema is managed by migrations. Connection pool is set up in constructor.
  }

  /** Get the active client — transactional if inside transaction(), else pool. */
  private getClient(): pg.Pool | pg.PoolClient {
    return this.als.getStore() ?? this.pool;
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = await this.getClient().query(translatePlaceholders(sql), params);
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: 0,
    };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.getClient().query(translatePlaceholders(sql), params);
    return result.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.getClient().query(translatePlaceholders(sql), params);
    return (result.rows[0] as T) ?? undefined;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.als.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async withConnection<T>(fn: () => Promise<T>): Promise<T> {
    // If already inside a pinned scope, just run — avoid double checkout
    if (this.als.getStore()) return fn();

    const client = await this.pool.connect();
    try {
      return await this.als.run(client, fn);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
