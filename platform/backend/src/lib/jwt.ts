/**
 * JWT utilities for user-level authentication.
 *
 * Access tokens carry user identity (sub, email, name).
 * Refresh tokens are opaque random strings (NOT JWTs) — stored hashed in DB.
 */

import { randomBytes } from "node:crypto";
import { sign, verify } from "hono/jwt";

export interface UserJWTPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

export async function signAccessToken(
  user: { id: string; email: string; name: string },
  secret: string,
  expiresIn: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: UserJWTPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + parseDurationSeconds(expiresIn),
  };
  return sign(payload, secret);
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<UserJWTPayload | null> {
  try {
    const payload = await verify(token, secret, "HS256");
    return payload as unknown as UserJWTPayload;
  } catch {
    return null;
  }
}

/** Generate an opaque refresh token (not a JWT). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseDurationSeconds(dur: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(dur);
  if (!match) return 3600; // default 1h
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return 3600;
  }
}

/** Parse a duration string to milliseconds. */
export function parseDurationMs(dur: string): number {
  return parseDurationSeconds(dur) * 1000;
}
