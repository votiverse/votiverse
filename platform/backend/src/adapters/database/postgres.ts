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
          id                    UUID PRIMARY KEY,
          email                 TEXT UNIQUE NOT NULL,
          password_hash         TEXT NOT NULL,
          name                  TEXT NOT NULL,
          handle                TEXT UNIQUE,
          avatar_url            TEXT,
          bio                   TEXT NOT NULL DEFAULT '',
          created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          status                TEXT NOT NULL DEFAULT 'active',
          failed_login_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until          TIMESTAMPTZ,
          email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
          verification_token    TEXT,
          verification_expires  TIMESTAMPTZ,
          reset_token           TEXT,
          reset_expires         TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

        -- Refresh tokens for session management
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id          UUID PRIMARY KEY,
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          family_id   UUID NOT NULL,
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
          user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assembly_id    UUID NOT NULL,
          participant_id UUID NOT NULL,
          assembly_name  TEXT NOT NULL,
          joined_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, assembly_id)
        );
        CREATE INDEX IF NOT EXISTS idx_memberships_participant
          ON memberships(assembly_id, participant_id);

        -- Events tracked for notification scheduling
        CREATE TABLE IF NOT EXISTS tracked_events (
          id                   UUID PRIMARY KEY,
          assembly_id          UUID NOT NULL,
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
          id                   UUID PRIMARY KEY,
          assembly_id          UUID NOT NULL,
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
          user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key       TEXT NOT NULL,
          value     TEXT NOT NULL,
          PRIMARY KEY (user_id, key)
        );

        -- Invitations (link-based and direct)
        CREATE TABLE IF NOT EXISTS invitations (
          id              UUID PRIMARY KEY,
          assembly_id     UUID NOT NULL,
          type            TEXT NOT NULL,
          token           TEXT UNIQUE,
          invited_by      UUID NOT NULL,
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
          id              UUID PRIMARY KEY,
          invitation_id   UUID NOT NULL,
          user_id         UUID NOT NULL,
          accepted_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- Local assembly cache (immutable after creation — avoids VCP round-trips)
        CREATE TABLE IF NOT EXISTS assemblies_cache (
          id              UUID PRIMARY KEY,
          organization_id TEXT,
          name            TEXT NOT NULL,
          config          JSONB NOT NULL,
          status          TEXT NOT NULL DEFAULT 'active',
          created_at      TIMESTAMPTZ NOT NULL,
          cached_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          admission_mode  TEXT NOT NULL DEFAULT 'approval'
        );

        -- Join requests (for approval admission mode)
        CREATE TABLE IF NOT EXISTS join_requests (
          id              UUID PRIMARY KEY,
          assembly_id     UUID NOT NULL,
          user_id         UUID NOT NULL,
          user_name       TEXT NOT NULL,
          user_handle     TEXT,
          status          TEXT NOT NULL DEFAULT 'pending',
          reviewed_by     UUID,
          reviewed_at     TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_join_requests_assembly_status
          ON join_requests(assembly_id, status);
        CREATE INDEX IF NOT EXISTS idx_join_requests_user
          ON join_requests(user_id);

        -- Local topic cache (immutable after creation — avoids VCP round-trips)
        CREATE TABLE IF NOT EXISTS topics_cache (
          id            UUID NOT NULL,
          assembly_id   UUID NOT NULL,
          name          TEXT NOT NULL,
          parent_id     UUID,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          cached_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assembly_id, id)
        );

        -- Local survey cache (metadata is immutable after creation)
        CREATE TABLE IF NOT EXISTS surveys_cache (
          id            UUID NOT NULL,
          assembly_id   UUID NOT NULL,
          title         TEXT NOT NULL,
          questions     JSONB NOT NULL,
          topic_ids     JSONB NOT NULL DEFAULT '[]',
          schedule      BIGINT NOT NULL,
          closes_at     BIGINT NOT NULL,
          created_by    UUID NOT NULL,
          cached_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assembly_id, id)
        );

        -- In-app notification feed (persistent, independent of email delivery)
        CREATE TABLE IF NOT EXISTS notifications (
          id              UUID PRIMARY KEY,
          user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assembly_id     UUID NOT NULL,
          type            TEXT NOT NULL,
          urgency         TEXT NOT NULL DEFAULT 'info',
          title           TEXT NOT NULL,
          body            TEXT,
          action_url      TEXT,
          read_at         TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
          ON notifications(user_id, read_at);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created
          ON notifications(user_id, created_at DESC);

        -- Survey response tracking (one-way latch: once responded, never reverted)
        CREATE TABLE IF NOT EXISTS survey_responses (
          assembly_id    UUID NOT NULL,
          survey_id      UUID NOT NULL,
          participant_id UUID NOT NULL,
          responded_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assembly_id, survey_id, participant_id)
        );

        -- Push notification device tokens
        CREATE TABLE IF NOT EXISTS device_tokens (
          id         UUID PRIMARY KEY,
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform   TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
          token      TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_user_platform_token
          ON device_tokens(user_id, platform, token);

        -- Proposal drafts (backend-only, mutable, discarded on submit)
        CREATE TABLE IF NOT EXISTS proposal_drafts (
          id            UUID PRIMARY KEY,
          assembly_id   UUID NOT NULL,
          issue_id      UUID NOT NULL,
          choice_key    TEXT,
          author_id     UUID NOT NULL,
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
          proposal_id    UUID NOT NULL,
          assembly_id    UUID NOT NULL,
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
          candidacy_id   UUID NOT NULL,
          assembly_id    UUID NOT NULL,
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
          note_id      UUID NOT NULL,
          assembly_id  UUID NOT NULL,
          markdown     TEXT NOT NULL,
          assets       JSONB NOT NULL DEFAULT '[]',
          content_hash TEXT NOT NULL,
          created_at   BIGINT NOT NULL,
          PRIMARY KEY (assembly_id, note_id)
        );

        -- Binary assets (images, videos, PDFs)
        CREATE TABLE IF NOT EXISTS assets (
          id           UUID PRIMARY KEY,
          assembly_id  UUID NOT NULL,
          filename     TEXT NOT NULL,
          mime_type    TEXT NOT NULL,
          size_bytes   INTEGER NOT NULL,
          hash         TEXT NOT NULL,
          uploaded_by  UUID NOT NULL,
          uploaded_at  BIGINT NOT NULL,
          data         BYTEA
        );
        CREATE INDEX IF NOT EXISTS idx_assets_assembly
          ON assets(assembly_id);

        -- Booklet recommendation content (backend-owned, linked to VCP metadata)
        CREATE TABLE IF NOT EXISTS booklet_recommendation_content (
          assembly_id  UUID NOT NULL,
          event_id     UUID NOT NULL,
          issue_id     UUID NOT NULL,
          markdown     TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at   BIGINT NOT NULL,
          updated_at   BIGINT NOT NULL,
          PRIMARY KEY (assembly_id, event_id, issue_id)
        );
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
