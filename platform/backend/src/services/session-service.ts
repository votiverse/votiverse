/**
 * SessionService — JWT access token + opaque refresh token management.
 *
 * Refresh tokens are random strings, stored hashed in the DB.
 * On refresh, the old token is revoked and a new one is issued (rotation).
 *
 * Token family tracking: each login creates a family. Refreshed tokens
 * inherit the family. If a revoked token is reused (replay attack),
 * the entire family is revoked — all sessions from that login are killed.
 */

import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { signAccessToken, generateRefreshToken, parseDurationMs } from "../lib/jwt.js";
import { AuthenticationError } from "../api/middleware/error-handler.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "session" });

interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export class SessionService {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly jwtSecret: string,
    private readonly accessExpiry: string,
    private readonly refreshExpiry: string,
  ) {}

  /** Create a new session (new token family). Called on login/register. */
  async createSession(user: { id: string; email: string; name: string }): Promise<SessionTokens> {
    const familyId = uuidv7();
    return this.issueTokens(user, familyId);
  }

  async refreshSession(
    refreshToken: string,
    getUser: (id: string) => Promise<{ id: string; email: string; name: string } | null>,
  ): Promise<SessionTokens> {
    const tokenHash = hashToken(refreshToken);

    // First check: is this token in the database at all?
    const row = await this.db.queryOne<RefreshTokenRow>(
      "SELECT * FROM refresh_tokens WHERE token_hash = ?",
      [tokenHash],
    );

    if (!row) {
      throw new AuthenticationError("Invalid refresh token");
    }

    // Replay detection: if this token was already revoked, someone is reusing
    // a stolen token. Revoke the entire family to protect the user.
    if (row.revoked_at) {
      log.warn("Refresh token replay detected — revoking token family", {
        familyId: row.family_id,
        userId: row.user_id,
      });
      await this.db.run(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL",
        [new Date().toISOString(), row.family_id],
      );
      throw new AuthenticationError("Token reuse detected. All sessions have been revoked. Please log in again.");
    }

    if (new Date(row.expires_at) < new Date()) {
      // Expired — revoke and reject
      await this.db.run(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
        [new Date().toISOString(), row.id],
      );
      throw new AuthenticationError("Refresh token expired");
    }

    // Rotate: revoke old token
    await this.db.run(
      "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
      [new Date().toISOString(), row.id],
    );

    // Fetch user to build new access token
    const user = await getUser(row.user_id);
    if (!user) {
      throw new AuthenticationError("User not found");
    }

    // Issue new tokens in the same family
    return this.issueTokens(user, row.family_id);
  }

  async revokeSession(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.db.run(
      "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
      [new Date().toISOString(), tokenHash],
    );
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db.run(
      "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
      [new Date().toISOString(), userId],
    );
  }

  private async issueTokens(
    user: { id: string; email: string; name: string },
    familyId: string,
  ): Promise<SessionTokens> {
    const accessToken = await signAccessToken(user, this.jwtSecret, this.accessExpiry);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseDurationMs(this.refreshExpiry)).toISOString();

    await this.db.run(
      "INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
      [uuidv7(), user.id, familyId, tokenHash, expiresAt],
    );

    return { accessToken, refreshToken };
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
