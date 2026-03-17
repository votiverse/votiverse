/**
 * VCP proxy routes — forwards governance requests to VCP with identity injection.
 *
 * User-scoped routes (no participant needed): GET /assemblies (filtered by membership), GET /assemblies/:id
 * Assembly-scoped routes: resolves user → participant, injects X-Participant-Id
 */

import { Hono } from "hono";
import type { MembershipService } from "../../services/membership-service.js";
import type { NotificationService } from "../../services/notification-service.js";
import type { BackendConfig } from "../../config/schema.js";
import { getUser } from "../middleware/auth.js";
import { logger } from "../../lib/logger.js";

export function proxyRoutes(
  membershipService: MembershipService,
  notificationService: NotificationService,
  config: BackendConfig,
) {
  const app = new Hono();

  /**
   * GET /assemblies — list assemblies filtered to those the user belongs to.
   * Fetches all assemblies from VCP, then filters by user's memberships.
   */
  app.get("/assemblies", async (c) => {
    const user = getUser(c);
    const memberships = await membershipService.getUserMemberships(user.id);
    const memberAssemblyIds = new Set(memberships.map((m) => m.assemblyId));

    // Proxy to VCP to get all assemblies
    const vcpRes = await proxyToVcp(c, config, "GET", "/assemblies" + (c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""));

    // If VCP returned an error, pass it through
    if (!vcpRes.ok) return vcpRes;

    // Filter assemblies to only those the user is a member of
    const data = await vcpRes.json() as { assemblies: Array<{ id: string; [key: string]: unknown }>; pagination?: unknown };
    const filtered = data.assemblies.filter((asm) => memberAssemblyIds.has(asm.id));

    return c.json({ assemblies: filtered, pagination: data.pagination });
  });

  app.get("/assemblies/:id", async (c) => {
    const id = c.req.param("id");
    // Avoid matching /assemblies/:id/* — only exact match
    return proxyToVcp(c, config, "GET", `/assemblies/${id}`);
  });

  /**
   * Assembly-scoped routes — resolve user → participant, then proxy.
   * Catches all methods and paths under /assemblies/:assemblyId/
   *
   * Intercepts POST responses for events and polls to track them for notifications.
   */
  app.all("/assemblies/:assemblyId/*", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");

    // Resolve user's participant ID for this assembly
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // Reconstruct the original path
    const url = new URL(c.req.url);
    const path = url.pathname + url.search;

    const response = await proxyToVcp(c, config, c.req.method, path, participantId);

    // Intercept successful POST responses to track events and polls
    if (c.req.method === "POST" && response.status === 201) {
      const subpath = url.pathname.replace(`/assemblies/${assemblyId}`, "");
      await interceptForNotifications(response, assemblyId, subpath, notificationService);
    }

    return response;
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

  // Buffer response body so it can be read by interceptors and returned to client
  const responseBody = await vcpRes.text();

  const responseHeaders = new Headers();
  vcpRes.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection", "content-length"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  const response = new Response(responseBody, {
    status: vcpRes.status,
    headers: responseHeaders,
  });
  // Stash the buffered body for interceptors to read without consuming the stream
  (response as ResponseWithBody).__bufferedBody = responseBody;
  return response;
}

interface ResponseWithBody extends Response {
  __bufferedBody?: string;
}

/**
 * Intercept successful POST responses to track events and polls for notifications.
 */
async function interceptForNotifications(
  response: Response,
  assemblyId: string,
  subpath: string,
  notificationService: NotificationService,
): Promise<void> {
  try {
    const body = (response as ResponseWithBody).__bufferedBody;
    if (!body) return;

    const data = JSON.parse(body);

    // POST /assemblies/:id/events → track for notification
    if (/^\/events\/?$/.test(subpath) && data.id) {
      await notificationService.trackEvent({
        id: data.id,
        assemblyId,
        title: data.title ?? "Untitled Event",
        votingStart: data.timeline?.votingStart ?? data.votingStart ?? "",
        votingEnd: data.timeline?.votingEnd ?? data.votingEnd ?? "",
      });
    }

    // POST /assemblies/:id/polls → track for notification
    if (/^\/polls\/?$/.test(subpath) && data.id) {
      await notificationService.trackPoll({
        id: data.id,
        assemblyId,
        title: data.title ?? "Untitled Poll",
        schedule: data.schedule ?? "",
        closesAt: data.closesAt ?? "",
      });
    }
  } catch (err) {
    // Interception failures should not break the proxy response
    logger.warn("Failed to intercept response for notifications", { error: String(err) });
  }
}
