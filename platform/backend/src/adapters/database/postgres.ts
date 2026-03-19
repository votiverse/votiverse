/**
 * PostgreSQL database adapter for the client backend.
 *
 * Uses AsyncLocalStorage to scope queries to transactional clients.
 * Mirrors the VCP PostgresAdapter pattern.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import type { DatabaseAdapter, RunResult } from "./interface.js";

/**
 * Translate `?` placeholders to PostgreSQL `$1, $2, ...` style.
 */
function translatePlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export class PostgresAdapter implements DatabaseAdapter {
  private readonly pool: pg.Pool;
  private readonly als = new AsyncLocalStorage<pg.PoolClient>();

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        -- User accounts
        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          email         TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name          TEXT NOT NULL,
          handle        TEXT UNIQUE,
          avatar_url    TEXT,
          bio           TEXT NOT NULL DEFAULT '',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          status        TEXT NOT NULL DEFAULT 'active'
        );
        CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

        -- Refresh tokens for session management
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash  TEXT NOT NULL UNIQUE,
          expires_at  TIMESTAMPTZ NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at  TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
          ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
          ON refresh_tokens(token_hash);

        -- User-to-participant mapping across assemblies
        CREATE TABLE IF NOT EXISTS memberships (
          user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assembly_id    TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          assembly_name  TEXT NOT NULL,
          joined_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, assembly_id)
        );
        CREATE INDEX IF NOT EXISTS idx_memberships_participant
          ON memberships(assembly_id, participant_id);

        -- Events tracked for notification scheduling
        CREATE TABLE IF NOT EXISTS tracked_events (
          id                   TEXT PRIMARY KEY,
          assembly_id          TEXT NOT NULL,
          title                TEXT NOT NULL,
          voting_start         TEXT NOT NULL,
          voting_end           TEXT NOT NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notified_created     INTEGER NOT NULL DEFAULT 0,
          notified_voting_open INTEGER NOT NULL DEFAULT 0,
          notified_deadline    INTEGER NOT NULL DEFAULT 0,
          notified_closed      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_tracked_events_assembly
          ON tracked_events(assembly_id);

        -- Surveys tracked for notification scheduling
        CREATE TABLE IF NOT EXISTS tracked_surveys (
          id                   TEXT PRIMARY KEY,
          assembly_id          TEXT NOT NULL,
          title                TEXT NOT NULL,
          schedule             TEXT NOT NULL,
          closes_at            TEXT NOT NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notified_created     INTEGER NOT NULL DEFAULT 0,
          notified_deadline    INTEGER NOT NULL DEFAULT 0,
          notified_closed      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_tracked_surveys_assembly
          ON tracked_surveys(assembly_id);

        -- User notification preferences
        CREATE TABLE IF NOT EXISTS notification_preferences (
          user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key       TEXT NOT NULL,
          value     TEXT NOT NULL,
          PRIMARY KEY (user_id, key)
        );

        -- Invitations (link-based and direct)
        CREATE TABLE IF NOT EXISTS invitations (
          id              TEXT PRIMARY KEY,
          assembly_id     TEXT NOT NULL,
          type            TEXT NOT NULL,
          token           TEXT UNIQUE,
          invited_by      TEXT NOT NULL,
          invitee_handle  TEXT,
          max_uses        INTEGER,
          use_count       INTEGER NOT NULL DEFAULT 0,
          expires_at      TIMESTAMPTZ,
          status          TEXT NOT NULL DEFAULT 'active',
          created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
        CREATE INDEX IF NOT EXISTS idx_invitations_assembly ON invitations(assembly_id);

        CREATE TABLE IF NOT EXISTS invitation_acceptances (
          id              TEXT PRIMARY KEY,
          invitation_id   TEXT NOT NULL,
          user_id         TEXT NOT NULL,
          accepted_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- Local assembly cache (immutable after creation — avoids VCP round-trips)
        CREATE TABLE IF NOT EXISTS assemblies_cache (
          id              TEXT PRIMARY KEY,
          organization_id TEXT,
          name            TEXT NOT NULL,
          config          JSONB NOT NULL,
          status          TEXT NOT NULL DEFAULT 'active',
          created_at      TIMESTAMPTZ NOT NULL,
          cached_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- Local topic cache (immutable after creation — avoids VCP round-trips)
        CREATE TABLE IF NOT EXISTS topics_cache (
          id            TEXT NOT NULL,
          assembly_id   TEXT NOT NULL,
          name          TEXT NOT NULL,
          parent_id     TEXT,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          cached_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assembly_id, id)
        );

        -- Local survey cache (metadata is immutable after creation)
        CREATE TABLE IF NOT EXISTS surveys_cache (
          id            TEXT NOT NULL,
          assembly_id   TEXT NOT NULL,
          title         TEXT NOT NULL,
          questions     JSONB NOT NULL,
          topic_ids     JSONB NOT NULL DEFAULT '[]',
          schedule      BIGINT NOT NULL,
          closes_at     BIGINT NOT NULL,
          created_by    TEXT NOT NULL,
          cached_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assembly_id, id)
        );

        -- Survey response tracking (one-way latch: once responded, never reverted)
        CREATE TABLE IF NOT EXISTS survey_responses (
          assembly_id    TEXT NOT NULL,
          survey_id      TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          responded_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assembly_id, survey_id, participant_id)
        );

        -- Proposal drafts (backend-only, mutable, discarded on submit)
        CREATE TABLE IF NOT EXISTS proposal_drafts (
          id            TEXT PRIMARY KEY,
          assembly_id   TEXT NOT NULL,
          issue_id      TEXT NOT NULL,
          choice_key    TEXT,
          author_id     TEXT NOT NULL,
          title         TEXT NOT NULL,
          markdown      TEXT NOT NULL DEFAULT '',
          assets        JSONB NOT NULL DEFAULT '[]',
          created_at    BIGINT NOT NULL,
          updated_at    BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_proposal_drafts_author
          ON proposal_drafts(assembly_id, author_id);

        -- Proposal content (immutable versions, keyed by VCP proposal ID)
        CREATE TABLE IF NOT EXISTS proposal_content (
          proposal_id    TEXT NOT NULL,
          assembly_id    TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          markdown       TEXT NOT NULL,
          assets         JSONB NOT NULL DEFAULT '[]',
          content_hash   TEXT NOT NULL,
          change_summary TEXT,
          created_at     BIGINT NOT NULL,
          PRIMARY KEY (assembly_id, proposal_id, version_number)
        );

        -- Candidacy content (immutable versions, keyed by VCP candidacy ID)
        CREATE TABLE IF NOT EXISTS candidacy_content (
          candidacy_id   TEXT NOT NULL,
          assembly_id    TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          markdown       TEXT NOT NULL,
          assets         JSONB NOT NULL DEFAULT '[]',
          content_hash   TEXT NOT NULL,
          change_summary TEXT,
          created_at     BIGINT NOT NULL,
          PRIMARY KEY (assembly_id, candidacy_id, version_number)
        );

        -- Note content (immutable, keyed by VCP note ID)
        CREATE TABLE IF NOT EXISTS note_content (
          note_id      TEXT NOT NULL,
          assembly_id  TEXT NOT NULL,
          markdown     TEXT NOT NULL,
          assets       JSONB NOT NULL DEFAULT '[]',
          content_hash TEXT NOT NULL,
          created_at   BIGINT NOT NULL,
          PRIMARY KEY (assembly_id, note_id)
        );

        -- Binary assets (images, videos, PDFs)
        CREATE TABLE IF NOT EXISTS assets (
          id           TEXT PRIMARY KEY,
          assembly_id  TEXT NOT NULL,
          filename     TEXT NOT NULL,
          mime_type    TEXT NOT NULL,
          size_bytes   INTEGER NOT NULL,
          hash         TEXT NOT NULL,
          uploaded_by  TEXT NOT NULL,
          uploaded_at  BIGINT NOT NULL,
          data         BYTEA
        );
        CREATE INDEX IF NOT EXISTS idx_assets_assembly
          ON assets(assembly_id);
      `);
    } finally {
      client.release();
    }
  }

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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
