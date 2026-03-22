/**
 * SessionService — JWT access token + opaque refresh token management.
 *
 * Refresh tokens are random strings, stored hashed in the DB.
 * On refresh, the old token is revoked and a new one is issued (rotation).
 */

import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { signAccessToken, generateRefreshToken, parseDurationMs } from "../lib/jwt.js";
import { AuthenticationError } from "../api/middleware/error-handler.js";

interface RefreshTokenRow {
  id: string;
  user_id: string;
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

  async createSession(user: { id: string; email: string; name: string }): Promise<SessionTokens> {
    const accessToken = await signAccessToken(user, this.jwtSecret, this.accessExpiry);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseDurationMs(this.refreshExpiry)).toISOString();

    await this.db.run(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
      [uuidv7(), user.id, tokenHash, expiresAt],
    );

    return { accessToken, refreshToken };
  }

  async refreshSession(
    refreshToken: string,
    getUser: (id: string) => Promise<{ id: string; email: string; name: string } | null>,
  ): Promise<SessionTokens> {
    const tokenHash = hashToken(refreshToken);
    const row = await this.db.queryOne<RefreshTokenRow>(
      "SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL",
      [tokenHash],
    );

    if (!row) {
      throw new AuthenticationError("Invalid refresh token");
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

    // Issue new tokens
    return this.createSession(user);
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
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
