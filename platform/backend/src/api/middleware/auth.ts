/**
 * Authentication middleware — verifies user JWT access tokens.
 */

import type { Context, Next } from "hono";
import { verifyAccessToken } from "../../lib/jwt.js";

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

    const header = c.req.header("Authorization");
    if (!header) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } },
        401,
      );
    }

    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match?.[1]) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid Authorization header format" } },
        401,
      );
    }

    const payload = await verifyAccessToken(match[1], jwtSecret);
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
