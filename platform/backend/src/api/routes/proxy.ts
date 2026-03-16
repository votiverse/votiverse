/**
 * VCP proxy routes — forwards governance requests to VCP with identity injection.
 *
 * Public routes (no participant needed): GET /assemblies, GET /assemblies/:id
 * Assembly-scoped routes: resolves user → participant, injects X-Participant-Id
 */

import { Hono } from "hono";
import type { MembershipService } from "../../services/membership-service.js";
import type { BackendConfig } from "../../config/schema.js";
import { getUser } from "../middleware/auth.js";
import { logger } from "../../lib/logger.js";

export function proxyRoutes(membershipService: MembershipService, config: BackendConfig) {
  const app = new Hono();

  /**
   * Public VCP routes — proxy with API key only, no participant resolution.
   * GET /assemblies and GET /assemblies/:id
   */
  app.get("/assemblies", async (c) => {
    return proxyToVcp(c, config, "GET", "/assemblies" + (c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""));
  });

  app.get("/assemblies/:id", async (c) => {
    const id = c.req.param("id");
    // Avoid matching /assemblies/:id/* — only exact match
    return proxyToVcp(c, config, "GET", `/assemblies/${id}`);
  });

  /**
   * Assembly-scoped routes — resolve user → participant, then proxy.
   * Catches all methods and paths under /assemblies/:assemblyId/
   */
  app.all("/assemblies/:assemblyId/*", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");

    // Resolve user's participant ID for this assembly
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // Reconstruct the original path
    const url = new URL(c.req.url);
    const path = url.pathname + url.search;

    return proxyToVcp(c, config, c.req.method, path, participantId);
  });

  return app;
}

async function proxyToVcp(
  c: import("hono").Context,
  config: BackendConfig,
  method: string,
  path: string,
  participantId?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.vcpApiKey}`,
  };
  if (participantId) {
    headers["X-Participant-Id"] = participantId;
  }

  const init: RequestInit = { method, headers };

  // Forward request body for non-GET methods
  if (method !== "GET" && method !== "HEAD") {
    try {
      const body = await c.req.text();
      if (body) init.body = body;
    } catch {
      // No body
    }
  }

  const vcpUrl = `${config.vcpBaseUrl}${path}`;
  logger.debug(`Proxying ${method} ${path}`, { vcpUrl, participantId });

  const vcpRes = await fetch(vcpUrl, init);

  // Stream VCP response back to client
  const responseHeaders = new Headers();
  vcpRes.headers.forEach((value, key) => {
    // Forward content-type and other relevant headers
    if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(vcpRes.body, {
    status: vcpRes.status,
    headers: responseHeaders,
  });
}
