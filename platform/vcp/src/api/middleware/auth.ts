/**
 * Authentication middleware — validates API key in Authorization header.
 * Also provides participant identity and scope-based authorization helpers.
 */

import type { Context, Next } from "hono";
import type { AuthAdapter, AuthScope, ClientInfo } from "../../adapters/auth/interface.js";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

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

/**
 * Extract participant ID from X-Participant-Id header.
 * Returns undefined if not present.
 */
export function getParticipantId(c: Context): string | undefined {
  return c.req.header("X-Participant-Id") ?? undefined;
}

/**
 * Middleware factory that requires a valid X-Participant-Id header
 * and validates the participant exists in the given assembly.
 *
 * Sets `participantId` on the context for downstream use.
 */
export function requireParticipant(manager: AssemblyManager) {
  return async (c: Context, next: Next) => {
    const participantId = c.req.header("X-Participant-Id");
    if (!participantId) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "X-Participant-Id header is required" } },
        403,
      );
    }

    // Extract assembly ID from route params
    const assemblyId = c.req.param("id");
    if (assemblyId) {
      let participant = manager.getParticipant(assemblyId, participantId);

      // Cross-assembly identity resolution: the client stores a single participant ID
      // but each assembly assigns different UUIDs to the same person.
      // Fall back to name-based lookup using X-Participant-Name header.
      if (!participant) {
        const participantName = c.req.header("X-Participant-Name");
        if (participantName) {
          participant = manager.getParticipantByName(assemblyId, participantName);
        }
      }

      if (!participant) {
        return c.json(
          { error: { code: "FORBIDDEN", message: `Participant "${participantId}" not found in assembly` } },
          403,
        );
      }
      if (participant.status === "sunset") {
        return c.json(
          { error: { code: "FORBIDDEN", message: "Participant has been sunset and cannot perform actions" } },
          403,
        );
      }

      // Use the resolved assembly-specific participant ID
      c.set("participantId", participant.id);
      return next();
    }

    c.set("participantId", participantId);
    return next();
  };
}

/**
 * Check if the authenticated client has the required auth scope.
 * Returns a 403 response if the scope is missing.
 */
export function requireScope(c: Context, scope: AuthScope): Response | null {
  const client = getClient(c);
  if (!client.scopes.includes(scope)) {
    return c.json(
      { error: { code: "FORBIDDEN", message: `Missing required scope: ${scope}` } },
      403,
    ) as unknown as Response;
  }
  return null;
}
