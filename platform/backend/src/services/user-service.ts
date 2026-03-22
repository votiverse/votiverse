/**
 * UserService — registration, authentication, user CRUD, profile management.
 */

import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { ValidationError, ConflictError, AuthenticationError, NotFoundError } from "../api/middleware/error-handler.js";

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
}

export interface User {
  id: string;
  email: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string;
  createdAt: string;
  status: string;
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
    if (!password || password.length < 6) {
      throw new ValidationError("Password must be at least 6 characters");
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

    await this.db.run(
      "INSERT INTO users (id, email, password_hash, name, handle, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, email.toLowerCase(), passwordHash, name.trim(), finalHandle, createdAt],
    );

    return { id, email: email.toLowerCase(), name: name.trim(), handle: finalHandle, avatarUrl: null, bio: "", createdAt, status: "active" };
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

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      throw new AuthenticationError();
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
}
