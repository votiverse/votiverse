/**
 * VCP proxy routes — forwards governance requests to VCP with identity injection.
 *
 * Locally served (no VCP round-trip):
 *   GET /assemblies — from assemblies_cache, filtered by user memberships
 *   GET /assemblies/:id — from assemblies_cache
 *   GET /assemblies/:id/topics — from topics_cache (falls through to VCP on cache miss)
 *   GET /assemblies/:id/polls — from polls_cache + poll_responses (falls through on miss)
 *
 * Proxied to VCP (all other assembly-scoped routes):
 *   resolves user → participant, injects X-Participant-Id, intercepts POST responses for caching
 */

import { Hono } from "hono";
import type { MembershipService } from "../../services/membership-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { TopicCacheService } from "../../services/topic-cache.js";
import type { PollCacheService } from "../../services/poll-cache.js";
import type { NotificationService } from "../../services/notification-service.js";
import type { BackendConfig } from "../../config/schema.js";
import { getUser } from "../middleware/auth.js";
import { logger } from "../../lib/logger.js";

export function proxyRoutes(
  membershipService: MembershipService,
  assemblyCacheService: AssemblyCacheService,
  topicCacheService: TopicCacheService,
  pollCacheService: PollCacheService,
  notificationService: NotificationService,
  config: BackendConfig,
) {
  const app = new Hono();

  /**
   * GET /assemblies — list assemblies the user belongs to (served from local cache).
   */
  app.get("/assemblies", async (c) => {
    const user = getUser(c);
    const memberships = await membershipService.getUserMemberships(user.id);
    const memberAssemblyIds = memberships.map((m) => m.assemblyId);

    const assemblies = await assemblyCacheService.listByIds(memberAssemblyIds);

    return c.json({ assemblies });
  });

  /**
   * GET /assemblies/:id — get assembly (served from local cache).
   */
  app.get("/assemblies/:id", async (c) => {
    const id = c.req.param("id");
    const assembly = await assemblyCacheService.get(id);
    if (!assembly) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Assembly "${id}" not found` } },
        404,
      );
    }
    return c.json(assembly);
  });

  /**
   * GET /assemblies/:assemblyId/topics — served from local topic cache.
   * Falls through to VCP proxy if cache is empty (first access).
   */
  app.get("/assemblies/:assemblyId/topics", async (c) => {
    const assemblyId = c.req.param("assemblyId");

    // Check cache first
    const hasCached = await topicCacheService.hasTopics(assemblyId);
    if (hasCached) {
      const topics = await topicCacheService.listByAssembly(assemblyId);
      return c.json({ topics });
    }

    // Cache miss — proxy to VCP, cache the response, and return
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);
    const response = await proxyToVcp(c, config, "GET", `/assemblies/${assemblyId}/topics`, participantId);

    if (response.status === 200) {
      try {
        const body = (response as ResponseWithBody).__bufferedBody;
        if (body) {
          const data = JSON.parse(body) as { topics: Array<{ id: string; name: string; parentId?: string | null; sortOrder?: number }> };
          if (data.topics?.length) {
            await topicCacheService.upsertMany(
              data.topics.map((t) => ({
                id: t.id,
                assemblyId,
                name: t.name,
                parentId: t.parentId ?? null,
                sortOrder: t.sortOrder ?? 0,
              })),
            );
          }
        }
      } catch (err) {
        logger.warn("Failed to cache topics from VCP response", { error: String(err) });
      }
    }

    return response;
  });

  /**
   * GET /assemblies/:assemblyId/polls — served from local poll cache.
   * Falls through to VCP proxy if cache is empty (first access).
   * Enriches with hasResponded from local poll_responses table.
   */
  app.get("/assemblies/:assemblyId/polls", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const hasCached = await pollCacheService.hasPolls(assemblyId);
    if (hasCached) {
      const cachedPolls = await pollCacheService.listByAssembly(assemblyId);
      const respondedIds = await pollCacheService.respondedPollIds(assemblyId, participantId);
      const polls = cachedPolls.map((p) => ({
        id: p.id,
        title: p.title,
        questions: p.questions,
        topicIds: p.topicIds,
        schedule: p.schedule,
        closesAt: p.closesAt,
        createdBy: p.createdBy,
        hasResponded: respondedIds.has(p.id),
      }));
      return c.json({ polls });
    }

    // Cache miss — proxy to VCP, cache the response, and return
    const response = await proxyToVcp(c, config, "GET", `/assemblies/${assemblyId}/polls?participantId=${participantId}`, participantId);

    if (response.status === 200) {
      try {
        const body = (response as ResponseWithBody).__bufferedBody;
        if (body) {
          const data = JSON.parse(body) as { polls: Array<{ id: string; title: string; questions: unknown[]; topicIds: string[]; schedule: number; closesAt: number; createdBy: string; hasResponded?: boolean }> };
          for (const p of data.polls ?? []) {
            await pollCacheService.upsert({
              id: p.id, assemblyId, title: p.title, questions: p.questions,
              topicIds: p.topicIds, schedule: p.schedule, closesAt: p.closesAt, createdBy: p.createdBy,
            });
            if (p.hasResponded) {
              await pollCacheService.recordResponse(assemblyId, p.id, participantId);
            }
          }
        }
      } catch (err) {
        logger.warn("Failed to cache polls from VCP response", { error: String(err) });
      }
    }

    return response;
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

    // Intercept successful POST responses to track events/polls and cache data
    if (c.req.method === "POST" && (response.status === 200 || response.status === 201)) {
      const subpath = url.pathname.replace(`/assemblies/${assemblyId}`, "");
      if (response.status === 201) {
        await interceptForNotifications(response, assemblyId, subpath, notificationService);
        await interceptForTopicCache(response, assemblyId, subpath, topicCacheService);
        await interceptForPollCache(response, assemblyId, subpath, pollCacheService);
      }
      await interceptForPollResponse(response, assemblyId, subpath, participantId, pollCacheService);
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

/**
 * Intercept successful POST /topics responses to populate the topic cache.
 */
async function interceptForTopicCache(
  response: Response,
  assemblyId: string,
  subpath: string,
  topicCacheService: TopicCacheService,
): Promise<void> {
  try {
    if (!/^\/topics\/?$/.test(subpath)) return;

    const body = (response as ResponseWithBody).__bufferedBody;
    if (!body) return;

    const data = JSON.parse(body) as { id: string; name: string; parentId?: string | null; sortOrder?: number };
    if (data.id) {
      await topicCacheService.upsert({
        id: data.id,
        assemblyId,
        name: data.name,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
      });
    }
  } catch (err) {
    logger.warn("Failed to cache topic from POST response", { error: String(err) });
  }
}

/**
 * Intercept successful POST /polls to cache the new poll metadata.
 */
async function interceptForPollCache(
  response: Response,
  assemblyId: string,
  subpath: string,
  pollCacheService: PollCacheService,
): Promise<void> {
  try {
    if (!/^\/polls\/?$/.test(subpath)) return;

    const body = (response as ResponseWithBody).__bufferedBody;
    if (!body) return;

    const data = JSON.parse(body) as { id: string; title: string; questions: unknown[]; topicIds: string[]; schedule: number; closesAt: number; createdBy: string };
    if (data.id) {
      await pollCacheService.upsert({
        id: data.id,
        assemblyId,
        title: data.title,
        questions: data.questions,
        topicIds: data.topicIds ?? [],
        schedule: data.schedule,
        closesAt: data.closesAt,
        createdBy: data.createdBy,
      });
    }
  } catch (err) {
    logger.warn("Failed to cache poll from POST response", { error: String(err) });
  }
}

/**
 * Intercept successful POST /polls/:pid/respond to record the response.
 */
async function interceptForPollResponse(
  _response: Response,
  assemblyId: string,
  subpath: string,
  participantId: string,
  pollCacheService: PollCacheService,
): Promise<void> {
  try {
    const match = /^\/polls\/([^/]+)\/respond\/?$/.exec(subpath);
    if (!match) return;

    const pollId = match[1]!;
    await pollCacheService.recordResponse(assemblyId, pollId, participantId);
  } catch (err) {
    logger.warn("Failed to record poll response in cache", { error: String(err) });
  }
}
