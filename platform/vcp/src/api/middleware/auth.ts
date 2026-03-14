/**
 * Authentication middleware — validates API key in Authorization header.
 */

import type { Context, Next } from "hono";
import type { AuthAdapter, ClientInfo } from "../../adapters/auth/interface.js";

const PUBLIC_PATHS = new Set(["/health"]);

export function createAuthMiddleware(auth: AuthAdapter) {
  return async (c: Context, next: Next) => {
    if (PUBLIC_PATHS.has(c.req.path)) {
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
        { error: { code: "UNAUTHORIZED", message: "Invalid Authorization header format. Expected: Bearer <key>" } },
        401,
      );
    }

    const client = auth.validate(match[1]);
    if (!client) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
        401,
      );
    }

    c.set("client", client);
    return next();
  };
}

/** Helper to extract authenticated client from context. */
export function getClient(c: Context): ClientInfo {
  return c.get("client") as ClientInfo;
}
