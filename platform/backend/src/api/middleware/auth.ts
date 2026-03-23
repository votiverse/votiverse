/**
 * Authentication middleware — extracts and verifies user JWT access tokens.
 *
 * Token sources (checked in order):
 * 1. httpOnly cookie `votiverse_access` — used by web browsers
 * 2. Authorization: Bearer <token> header — used by mobile apps and API consumers
 */

import type { Context, Next } from "hono";
import { verifyAccessToken } from "../../lib/jwt.js";
import { getAccessTokenFromCookie } from "../../lib/cookies.js";

const PUBLIC_PATHS = new Set(["/health", "/metrics"]);
const PUBLIC_PREFIXES = ["/auth/"];

export function createAuthMiddleware(jwtSecret: string) {
  return async (c: Context, next: Next) => {
    // Skip auth for public paths
    if (PUBLIC_PATHS.has(c.req.path) || PUBLIC_PREFIXES.some((p) => c.req.path.startsWith(p))) {
      return next();
    }

    // GET /invite/:token is public (group preview); POST requires auth (handled below)
    if (c.req.method === "GET" && c.req.path.startsWith("/invite/")) {
      return next();
    }

    // 1. Try httpOnly cookie (web browsers)
    let token = getAccessTokenFromCookie(c);

    // 2. Fall back to Authorization header (mobile / API consumers)
    if (!token) {
      const header = c.req.header("Authorization");
      if (header) {
        const match = /^Bearer\s+(.+)$/i.exec(header);
        token = match?.[1] ?? null;
      }
    }

    if (!token) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        401,
      );
    }

    const payload = await verifyAccessToken(token, jwtSecret);
    if (!payload) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } },
        401,
      );
    }

    c.set("user", { id: payload.sub, email: payload.email, name: payload.name });
    return next();
  };
}

/** Extract authenticated user from context. */
export function getUser(c: Context): { id: string; email: string; name: string } {
  return c.get("user") as { id: string; email: string; name: string };
}
