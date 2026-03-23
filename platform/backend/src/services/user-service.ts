/**
 * UserService — registration, authentication, user CRUD, profile management.
 */

import { randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { ValidationError, ConflictError, AuthenticationError, NotFoundError } from "../api/middleware/error-handler.js";

/** Verification token expiry: 24 hours. */
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Password reset token expiry: 1 hour. */
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  status: string;
  failed_login_attempts: number;
  locked_until: string | null;
  email_verified: number | boolean;
  verification_token: string | null;
  verification_expires: string | null;
  reset_token: string | null;
  reset_expires: string | null;
}

/** Maximum failed login attempts before account is locked. */
const MAX_FAILED_ATTEMPTS = 5;

/** Account lockout duration in milliseconds (15 minutes). */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface User {
  id: string;
  email: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string;
  createdAt: string;
  status: string;
  emailVerified: boolean;
}

/** Public profile — no email, no internal IDs. */
export interface PublicProfile {
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  createdAt: string;
}

// ── Handle utilities ────────────────────────────────────────────────

const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Generate a handle from a display name. */
export function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Validate handle format. */
export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle) && handle.length >= 3 && handle.length <= 30;
}

// ── Service ─────────────────────────────────────────────────────────

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    bio: row.bio ?? "",
    createdAt: row.created_at,
    status: row.status,
    emailVerified: !!row.email_verified,
  };
}

export class UserService {
  constructor(private readonly db: DatabaseAdapter) {}

  /** Find a unique handle, appending -2, -3, etc. if the base is taken. */
  private async findUniqueHandle(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (true) {
      const existing = await this.db.queryOne<{ handle: string }>(
        "SELECT handle FROM users WHERE handle = ?",
        [candidate],
      );
      if (!existing) return candidate;
      candidate = `${base}-${suffix}`;
      suffix++;
    }
  }

  async register(email: string, password: string, name: string, handle?: string): Promise<User> {
    if (!email || !email.includes("@")) {
      throw new ValidationError("Valid email is required");
    }
    if (!password || password.length < 12) {
      throw new ValidationError("Password must be at least 12 characters");
    }
    if (!name || name.trim().length === 0) {
      throw new ValidationError("Name is required");
    }

    const existing = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE email = ?",
      [email.toLowerCase()],
    );
    if (existing) {
      throw new ConflictError("Email already registered");
    }

    // Resolve handle
    let finalHandle: string;
    if (handle) {
      if (!isValidHandle(handle)) {
        throw new ValidationError("Handle must be 3-30 characters, lowercase alphanumeric and hyphens");
      }
      const handleTaken = await this.db.queryOne<{ id: string }>(
        "SELECT id FROM users WHERE handle = ?",
        [handle],
      );
      if (handleTaken) {
        throw new ConflictError("Handle already taken");
      }
      finalHandle = handle;
    } else {
      const base = generateHandle(name.trim());
      finalHandle = base.length >= 3 ? await this.findUniqueHandle(base) : await this.findUniqueHandle(`user-${uuidv7().slice(0, 8)}`);
    }

    const id = uuidv7();
    const passwordHash = await hashPassword(password);
    const createdAt = new Date().toISOString();

    const verificationToken = randomBytes(32).toString("base64url");
    const verificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS).toISOString();

    await this.db.run(
      "INSERT INTO users (id, email, password_hash, name, handle, created_at, verification_token, verification_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, email.toLowerCase(), passwordHash, name.trim(), finalHandle, createdAt, verificationToken, verificationExpires],
    );

    return { id, email: email.toLowerCase(), name: name.trim(), handle: finalHandle, avatarUrl: null, bio: "", createdAt, status: "active", emailVerified: false };
  }

  /** Verify an email address using the verification token. */
  async verifyEmail(token: string): Promise<User> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE verification_token = ?",
      [token],
    );
    if (!row) {
      throw new ValidationError("Invalid verification token");
    }
    if (row.verification_expires && new Date(row.verification_expires) < new Date()) {
      throw new ValidationError("Verification token has expired. Request a new one.");
    }
    if (row.email_verified) {
      return rowToUser(row);
    }

    await this.db.run(
      "UPDATE users SET email_verified = ?, verification_token = NULL, verification_expires = NULL WHERE id = ?",
      [true, row.id],
    );

    return { ...rowToUser(row), emailVerified: true };
  }

  /** Generate a new verification token for an existing user. Returns the token for email sending. */
  async createVerificationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS).toISOString();

    await this.db.run(
      "UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?",
      [token, expires, userId],
    );
    return token;
  }

  async authenticate(email: string, password: string): Promise<User> {
    if (!email || !password) {
      throw new AuthenticationError("Email and password are required");
    }

    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE email = ? AND status = 'active'",
      [email.toLowerCase()],
    );
    if (!row) {
      throw new AuthenticationError();
    }

    // Check if account is locked
    if (row.locked_until) {
      const lockExpiry = new Date(row.locked_until).getTime();
      if (Date.now() < lockExpiry) {
        throw new AuthenticationError("Account is temporarily locked. Try again later.");
      }
      // Lock has expired — clear it
      await this.db.run(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
        [row.id],
      );
    }

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      const attempts = row.failed_login_attempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        // Lock the account
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
        await this.db.run(
          "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
          [attempts, lockedUntil, row.id],
        );
      } else {
        await this.db.run(
          "UPDATE users SET failed_login_attempts = ? WHERE id = ?",
          [attempts, row.id],
        );
      }
      throw new AuthenticationError();
    }

    // Successful login — clear failed attempts
    if (row.failed_login_attempts > 0) {
      await this.db.run(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
        [row.id],
      );
    }

    return rowToUser(row);
  }

  async getById(id: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      [id],
    );
    if (!row) return null;
    return rowToUser(row);
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.getById(id);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  /** Get public profile by handle. */
  async getByHandle(handle: string): Promise<PublicProfile | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE handle = ?",
      [handle.toLowerCase()],
    );
    if (!row) return null;
    return {
      handle: row.handle!,
      name: row.name,
      avatarUrl: row.avatar_url,
      bio: row.bio ?? "",
      createdAt: row.created_at,
    };
  }

  /**
   * Get email by handle — internal use only (e.g., sending invitation notifications).
   * Not exposed via any API route.
   */
  async getEmailByHandle(handle: string): Promise<string | null> {
    const row = await this.db.queryOne<{ email: string }>(
      "SELECT email FROM users WHERE handle = ?",
      [handle.toLowerCase()],
    );
    return row?.email ?? null;
  }

  /**
   * Get user ID by handle — internal use only (e.g., bulk invitation membership check).
   * Not exposed via any API route.
   */
  async getIdByHandle(handle: string): Promise<string | null> {
    const row = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE handle = ?",
      [handle.toLowerCase()],
    );
    return row?.id ?? null;
  }

  /** Check if a handle is available. */
  async isHandleAvailable(handle: string): Promise<boolean> {
    if (!isValidHandle(handle)) return false;
    const existing = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE handle = ?",
      [handle],
    );
    return !existing;
  }

  /** Update profile fields. */
  async updateProfile(userId: string, updates: { handle?: string; name?: string; bio?: string; avatarUrl?: string | null }): Promise<User> {
    const user = await this.getByIdOrThrow(userId);

    if (updates.handle !== undefined) {
      if (!isValidHandle(updates.handle)) {
        throw new ValidationError("Handle must be 3-30 characters, lowercase alphanumeric and hyphens");
      }
      const taken = await this.db.queryOne<{ id: string }>(
        "SELECT id FROM users WHERE handle = ? AND id != ?",
        [updates.handle, userId],
      );
      if (taken) {
        throw new ConflictError("Handle already taken");
      }
    }

    if (updates.name !== undefined && (!updates.name || updates.name.trim().length === 0)) {
      throw new ValidationError("Name cannot be empty");
    }

    if (updates.bio !== undefined && updates.bio.length > 280) {
      throw new ValidationError("Bio must be 280 characters or less");
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.handle !== undefined) { sets.push("handle = ?"); params.push(updates.handle); }
    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name.trim()); }
    if (updates.bio !== undefined) { sets.push("bio = ?"); params.push(updates.bio); }
    if (updates.avatarUrl !== undefined) { sets.push("avatar_url = ?"); params.push(updates.avatarUrl); }

    if (sets.length > 0) {
      params.push(userId);
      await this.db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
    }

    return this.getByIdOrThrow(userId);
  }

  /** Create a password reset token. Returns the token for email sending, or null if email not found. */
  async createResetToken(email: string): Promise<{ token: string; userId: string } | null> {
    const row = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE email = ? AND status = 'active'",
      [email.toLowerCase()],
    );
    if (!row) return null;

    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();

    await this.db.run(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?",
      [token, expires, row.id],
    );
    return { token, userId: row.id };
  }

  /** Reset password using a reset token. Returns the user on success. */
  async resetPassword(token: string, newPassword: string): Promise<User> {
    if (!newPassword || newPassword.length < 12) {
      throw new ValidationError("Password must be at least 12 characters");
    }

    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE reset_token = ?",
      [token],
    );
    if (!row) {
      throw new ValidationError("Invalid or expired reset token");
    }
    if (row.reset_expires && new Date(row.reset_expires) < new Date()) {
      throw new ValidationError("Reset token has expired. Request a new one.");
    }

    const passwordHash = await hashPassword(newPassword);
    await this.db.run(
      "UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
      [passwordHash, row.id],
    );

    return rowToUser(row);
  }
}
