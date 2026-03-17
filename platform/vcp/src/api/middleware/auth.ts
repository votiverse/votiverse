/**
 * Authentication middleware — dual-mode: JWT tokens and API keys.
 *
 * JWT mode: If VCP_JWT_SECRET is configured, Bearer tokens are first tried
 * as JWTs. Valid JWTs set participantId and assemblyId on context directly.
 *
 * API key mode: Falls back to API key validation via the AuthAdapter.
 * Participant identity comes from the X-Participant-Id header.
 */

import type { Context, Next } from "hono";
import type { AuthAdapter, AuthScope, ClientInfo } from "../../adapters/auth/interface.js";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { verifyToken } from "../../lib/jwt.js";

const PUBLIC_PATHS = new Set(["/health", "/metrics"]);
const PUBLIC_PREFIXES_LIST = ["/dev/"];  // Dev routes have their own guard

export function createAuthMiddleware(auth: AuthAdapter, jwtSecret?: string | null) {
  return async (c: Context, next: Next) => {
    if (PUBLIC_PATHS.has(c.req.path) || PUBLIC_PREFIXES_LIST.some((p) => c.req.path.startsWith(p))) {
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

    const token = match[1];

    // Try JWT verification first (if configured)
    if (jwtSecret) {
      const payload = await verifyToken(token, jwtSecret);
      if (payload) {
        // JWT-authenticated request — participant identity is in the token
        c.set("participantId", payload.sub);
        c.set("jwtAssemblyId", payload.aud);
        c.set("authMode", "jwt");
        // Set a synthetic client for scope checks — JWT is scoped to exactly one assembly
        c.set("client", { id: "jwt-participant", name: "JWT Participant", scopes: ["participant"], assemblyAccess: [payload.aud] } satisfies ClientInfo);
        return next();
      }
      // JWT verification failed — fall through to API key validation
    }

    // API key validation
    const client = await auth.validate(token);
    if (!client) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid credentials" } },
        401,
      );
    }

    c.set("client", client);
    c.set("authMode", "apikey");
    return next();
  };
}

/** Helper to extract authenticated client from context. */
export function getClient(c: Context): ClientInfo {
  return c.get("client") as ClientInfo;
}

/**
 * Extract the resolved participant ID.
 * Prefers JWT-provided participantId, then context value set by requireParticipant,
 * falls back to raw X-Participant-Id header.
 */
export function getParticipantId(c: Context): string | undefined {
  return (c.get("participantId") as string | undefined) ?? c.req.header("X-Participant-Id") ?? undefined;
}

/**
 * Middleware factory that requires a valid participant identity.
 *
 * In JWT mode: participantId is already set from the token claims.
 * In API key mode: reads X-Participant-Id header and validates against assembly.
 *
 * Sets `participantId` on the context for downstream use.
 */
export function requireParticipant(manager: AssemblyManager) {
  return async (c: Context, next: Next) => {
    const authMode = c.get("authMode") as string | undefined;

    if (authMode === "jwt") {
      // JWT already carries participant identity — validated at token issuance time.
      // The participantId is already on context from createAuthMiddleware.
      return next();
    }

    // API key mode — require X-Participant-Id header
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
      const participant = await manager.getParticipant(assemblyId, participantId);

      if (!participant) {
        return c.json(
          { error: { code: "FORBIDDEN", message: `Participant not found in assembly` } },
          403,
        );
      }
      if (participant.status === "sunset") {
        return c.json(
          { error: { code: "FORBIDDEN", message: "Participant has been sunset and cannot perform actions" } },
          403,
        );
      }

      // Use the validated participant ID
      c.set("participantId", participant.id);
      return next();
    }

    // No assembly context — pass through raw participant ID
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

/**
 * Middleware factory that enforces client-assembly access.
 *
 * - For JWT auth: verifies jwtAssemblyId matches the route's :id param.
 * - For API key auth: checks assemblyAccess === "*" or includes the assembly ID.
 *
 * Returns 403 if the client does not have access to the assembly.
 */
export function requireAssemblyAccess() {
  return async (c: Context, next: Next) => {
    const assemblyId = c.req.param("id");
    if (!assemblyId) return next();

    const authMode = c.get("authMode") as string | undefined;
    const client = getClient(c);

    if (authMode === "jwt") {
      // JWT is scoped to exactly one assembly
      const jwtAssemblyId = c.get("jwtAssemblyId") as string | undefined;
      if (jwtAssemblyId !== assemblyId) {
        return c.json(
          { error: { code: "FORBIDDEN", message: "JWT token is not scoped to this assembly" } },
          403,
        );
      }
      return next();
    }

    // API key mode — check assemblyAccess
    if (client.assemblyAccess === "*") return next();
    if (client.assemblyAccess.includes(assemblyId)) return next();

    return c.json(
      { error: { code: "FORBIDDEN", message: "Client does not have access to this assembly" } },
      403,
    );
  };
}
