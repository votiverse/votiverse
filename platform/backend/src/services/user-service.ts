/**
 * UserService — registration, authentication, user CRUD.
 */

import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { ValidationError, ConflictError, AuthenticationError, NotFoundError } from "../api/middleware/error-handler.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
  status: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  status: string;
}

export class UserService {
  constructor(private readonly db: DatabaseAdapter) {}

  async register(email: string, password: string, name: string): Promise<User> {
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

    const id = randomUUID();
    const passwordHash = await hashPassword(password);
    const createdAt = new Date().toISOString();

    await this.db.run(
      "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, email.toLowerCase(), passwordHash, name.trim(), createdAt],
    );

    return { id, email: email.toLowerCase(), name: name.trim(), createdAt, status: "active" };
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

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      status: row.status,
    };
  }

  async getById(id: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      [id],
    );
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      status: row.status,
    };
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.getById(id);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }
}
