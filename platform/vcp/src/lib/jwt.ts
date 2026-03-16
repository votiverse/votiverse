/**
 * JWT utilities — sign and verify participant tokens.
 *
 * Uses Hono's built-in JWT support (no extra dependency).
 * Tokens are scoped to a single assembly (aligns with assembly isolation).
 */

import { sign, verify } from "hono/jwt";

export interface JWTPayload {
  /** Participant ID (subject). */
  sub: string;
  /** Assembly ID (audience). */
  aud: string;
  /** Issued at (seconds since epoch). */
  iat: number;
  /** Expiration (seconds since epoch). */
  exp: number;
}

export async function signToken(
  participantId: string,
  assemblyId: string,
  secret: string,
  expiresIn: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const duration = parseDuration(expiresIn);
  const payload: JWTPayload = {
    sub: participantId,
    aud: assemblyId,
    iat: now,
    exp: now + duration,
  };
  return sign(payload, secret);
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<JWTPayload | null> {
  try {
    const payload = await verify(token, secret);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

function parseDuration(dur: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(dur);
  if (!match) return 86400; // default 24h
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return 86400;
  }
}
