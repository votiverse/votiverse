/**
 * VCP proxy routes — forwards governance requests to VCP with identity injection.
 *
 * Routes are now group-centric: /groups/:groupId/...
 * The proxy resolves groupId → vcpAssemblyId before forwarding to VCP.
 * Capability gating is enforced before proxying.
 *
 * Locally served (no VCP round-trip):
 *   GET /groups — list user's groups from GroupService
 *   GET /groups/:id — get group from GroupService + merge VCP config
 *   GET /groups/:id/topics — from topics_cache (falls through to VCP on cache miss)
 *   GET /groups/:id/surveys — from surveys_cache + survey_responses (falls through on miss)
 *
 * Proxied to VCP (all other group-scoped routes):
 *   resolves user → participant, injects X-Participant-Id, intercepts POST responses for caching
 */

import { Hono } from "hono";
import type { GroupService, Capability } from "../../services/group-service.js";
import type { AssemblyCacheService } from "../../services/assembly-cache.js";
import type { TopicCacheService } from "../../services/topic-cache.js";
import type { SurveyCacheService } from "../../services/survey-cache.js";
import type { NotificationService } from "../../services/notification-service.js";
import type { VCPClient } from "../../services/vcp-client.js";
import type { BackendConfig } from "../../config/schema.js";
import { getUser } from "../middleware/auth.js";
import { logger } from "../../lib/logger.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../middleware/error-handler.js";
import { safeWebsiteUrl } from "../../lib/validation.js";
import { isAdminOfGroup } from "../../lib/admin-check.js";

export function proxyRoutes(
  groupService: GroupService,
  assemblyCacheService: AssemblyCacheService,
  topicCacheService: TopicCacheService,
  surveyCacheService: SurveyCacheService,
  notificationService: NotificationService,
  vcpClient: VCPClient,
  config: BackendConfig,
) {
  const app = new Hono();

  // ── Helper: resolve groupId → vcpAssemblyId (throws if group not found or has no VCP assembly) ──

  async function resolveVcpAssemblyId(groupId: string): Promise<string> {
    const vcpId = await groupService.resolveAssemblyId(groupId);
    if (!vcpId) {
      throw new NotFoundError("Group has no VCP assembly");
    }
    return vcpId;
  }

  // ── Helper: check capability is enabled for a group ──

  async function requireCapability(groupId: string, capability: Capability): Promise<void> {
    const enabled = await groupService.isCapabilityEnabled(groupId, capability);
    if (!enabled) {
      throw new ForbiddenError(`Capability "${capability}" is not enabled for this group`);
    }
  }

  // ── Helper: get participant ID for a user in a group ──

  async function getParticipantIdOrThrow(userId: string, groupId: string): Promise<string> {
    const pid = await groupService.getParticipantId(groupId, userId);
    if (!pid) {
      throw new NotFoundError("Not a member of this group");
    }
    return pid;
  }

  /**
   * GET /groups — list groups the user belongs to.
   */
  app.get("/groups", async (c) => {
    const user = getUser(c);
    const groups = await groupService.getUserGroups(user.id);

    // Enrich with capabilities
    const enriched = await Promise.all(groups.map(async (g) => {
      const capabilities = await groupService.getCapabilities(g.id);
      const enabledCaps = capabilities.filter((c) => c.enabled).map((c) => c.capability);
      return { ...g, capabilities: enabledCaps };
    }));

    return c.json({ groups: enriched });
  });

  /**
   * POST /groups — create a new group.
   * Creates group via GroupService, optionally creates VCP assembly if voting capability is requested,
   * sets up capabilities.
   */
  app.post("/groups", async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{
      name: string;
      handle?: string;
      preset?: string;
      config?: unknown;
      admissionMode?: string;
      websiteUrl?: string;
      voteCreation?: string;
      capabilities?: string[];
      avatarStyle?: string;
    }>();

    if (!body.name?.trim()) {
      throw new ValidationError("Group name is required");
    }
    if (body.websiteUrl) {
      const urlResult = safeWebsiteUrl.safeParse(body.websiteUrl);
      if (!urlResult.success) {
        throw new ValidationError(urlResult.error.issues[0]?.message ?? "Invalid website URL");
      }
    }

    // Generate handle from name if not provided
    const handle = body.handle ?? body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Create group
    const group = await groupService.create({
      name: body.name.trim(),
      handle,
      createdBy: user.id,
      admissionMode: (body.admissionMode as "open" | "approval" | "invite-only") ?? "approval",
      websiteUrl: body.websiteUrl || null,
      voteCreation: (body.voteCreation as "admin" | "members") ?? "admin",
      avatarStyle: body.avatarStyle,
    });

    // Add creator as owner
    await groupService.addMember(group.id, user.id, "owner");

    // Determine requested capabilities (default: voting enabled)
    const requestedCaps = body.capabilities ?? ["voting"];
    const needsVcp = requestedCaps.some((c) => ["voting", "scoring", "surveys", "community_notes"].includes(c));

    let vcpAssemblyId: string | null = null;

    // If VCP-backed capabilities are requested, create VCP assembly
    if (needsVcp) {
      const vcpAssembly = await vcpClient.createAssembly({
        name: body.name.trim(),
        preset: body.preset,
        config: body.config,
      });
      vcpAssemblyId = vcpAssembly.id;

      // Link group to VCP assembly
      await groupService.setVcpAssemblyId(group.id, vcpAssemblyId);

      // Create participant for the creator
      const participant = await vcpClient.createParticipant(vcpAssemblyId, user.name);

      // Set participant ID on group member
      await groupService.setParticipantId(group.id, user.id, participant.id);

      // Cache assembly locally
      await assemblyCacheService.upsert({
        id: vcpAssembly.id,
        organizationId: vcpAssembly.organizationId ?? null,
        name: vcpAssembly.name,
        config: vcpAssembly.config,
        status: vcpAssembly.status,
        createdAt: vcpAssembly.createdAt,
        admissionMode: (body.admissionMode as "open" | "approval" | "invite-only") ?? "approval",
        websiteUrl: body.websiteUrl || null,
        voteCreation: (body.voteCreation as "admin" | "members") ?? "admin",
      });
    }

    // Enable requested capabilities
    for (const cap of requestedCaps) {
      if (["voting", "scoring", "surveys", "community_notes"].includes(cap)) {
        await groupService.enableCapability(group.id, cap as Capability);
      }
    }

    return c.json({
      ...group,
      vcpAssemblyId,
      capabilities: requestedCaps,
    }, 201);
  });

  /**
   * GET /groups/:id — get group details.
   * Merges group metadata from groups table with VCP config from assemblies_cache.
   */
  app.get("/groups/:id", async (c) => {
    const id = c.req.param("id");
    const group = await groupService.get(id);
    if (!group) {
      throw new NotFoundError(`Group "${id}" not found`);
    }

    // Get capabilities
    const capabilities = await groupService.getCapabilities(id);
    const enabledCaps = capabilities.filter((c) => c.enabled).map((c) => c.capability);

    // Merge with VCP config if available
    let vcpConfig: unknown = null;
    if (group.vcpAssemblyId) {
      const cached = await assemblyCacheService.get(group.vcpAssemblyId);
      vcpConfig = cached?.config ?? null;
    }

    return c.json({
      ...group,
      capabilities: enabledCaps,
      config: vcpConfig,
    });
  });

  /**
   * GET /groups/:id/profile — group profile with roles enriched with user names.
   * Must be registered before the /:groupId/* catch-all.
   */
  app.get("/groups/:id/profile", async (c) => {
    const id = c.req.param("id");
    const group = await groupService.get(id);
    if (!group) {
      throw new NotFoundError(`Group "${id}" not found`);
    }

    // Get members with roles from group_members (backend-owned)
    const members = await groupService.getMembers(id);

    // Enrich with user names via participant IDs
    const participantIds = members.filter((m) => m.participantId).map((m) => m.participantId!);
    const nameMap = await groupService.getParticipantNames(id, participantIds);

    const owners = members
      .filter((m) => m.role === "owner")
      .map((m) => ({ participantId: m.participantId, userId: m.userId, role: m.role, name: m.participantId ? (nameMap.get(m.participantId) ?? null) : null }));
    const admins = members
      .filter((m) => m.role === "admin")
      .map((m) => ({ participantId: m.participantId, userId: m.userId, role: m.role, name: m.participantId ? (nameMap.get(m.participantId) ?? null) : null }));

    const memberCount = members.length;

    // Get capabilities
    const capabilities = await groupService.getCapabilities(id);
    const enabledCaps = capabilities.filter((c) => c.enabled).map((c) => c.capability);

    // Merge with VCP config if available
    let vcpConfig: unknown = null;
    if (group.vcpAssemblyId) {
      const cached = await assemblyCacheService.get(group.vcpAssemblyId);
      vcpConfig = cached?.config ?? null;
    }

    return c.json({
      ...group,
      config: vcpConfig,
      capabilities: enabledCaps,
      owners,
      admins,
      memberCount,
    });
  });

  /**
   * POST /groups/:groupId/capabilities/:cap — enable a capability.
   * Admin-only. If this is the first VCP capability and no VCP assembly exists,
   * creates one. If enabling voting, config must be provided in the body.
   */
  app.post("/groups/:groupId/capabilities/:cap", async (c) => {
    const groupId = c.req.param("groupId");
    const cap = c.req.param("cap") as Capability;
    const user = getUser(c);
    if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
      throw new ForbiddenError("Only admins can manage capabilities");
    }
    if (!["voting", "scoring", "surveys", "community_notes"].includes(cap)) {
      throw new ValidationError(`Unknown capability: ${cap}`);
    }

    // If enabling a VCP capability and no VCP assembly exists, create one
    const group = await groupService.get(groupId);
    if (!group) throw new NotFoundError(`Group "${groupId}" not found`);

    const body = await c.req.json<{ config?: unknown; preset?: string }>().catch(() => ({}));

    if (!group.vcpAssemblyId) {
      // No VCP assembly yet — create one
      const vcpAssembly = await vcpClient.createAssembly({
        name: group.name,
        config: cap === "voting" ? body.config : undefined,
        preset: cap === "voting" ? body.preset : undefined,
      });
      await groupService.setVcpAssemblyId(groupId, vcpAssembly.id);

      // Create participant for the admin
      const participant = await vcpClient.createParticipant(vcpAssembly.id, user.name);
      await groupService.setParticipantId(groupId, user.id, participant.id);

      // Cache assembly
      await assemblyCacheService.upsert({
        id: vcpAssembly.id,
        organizationId: vcpAssembly.organizationId ?? null,
        name: vcpAssembly.name,
        config: vcpAssembly.config,
        status: vcpAssembly.status,
        createdAt: vcpAssembly.createdAt,
      });
    } else if (cap === "voting" && body.config) {
      // VCP assembly exists but voting is being enabled — update config
      // TODO: VCP needs a PATCH /assemblies/:id/config endpoint for this.
      // For now, the config is set at assembly creation time. If the assembly
      // was created without voting (for scoring/surveys), we need to set the
      // config now. This is a gap that should be addressed.
      const cached = await assemblyCacheService.get(group.vcpAssemblyId);
      if (cached && !cached.config) {
        await assemblyCacheService.upsert({
          ...cached,
          config: body.config,
        });
      }
    }

    await groupService.enableCapability(groupId, cap);
    const capabilities = await groupService.getCapabilities(groupId);
    return c.json({ capabilities: capabilities.filter((c) => c.enabled).map((c) => c.capability) });
  });

  /**
   * DELETE /groups/:groupId/capabilities/:cap — disable a capability.
   * Admin-only. Does not destroy historical data.
   */
  app.delete("/groups/:groupId/capabilities/:cap", async (c) => {
    const groupId = c.req.param("groupId");
    const cap = c.req.param("cap") as Capability;
    const user = getUser(c);
    if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
      throw new ForbiddenError("Only admins can manage capabilities");
    }

    await groupService.disableCapability(groupId, cap);
    const capabilities = await groupService.getCapabilities(groupId);
    return c.json({ capabilities: capabilities.filter((c) => c.enabled).map((c) => c.capability) });
  });

  /**
   * GET /groups/:groupId/topics — served from local topic cache.
   * Falls through to VCP proxy if cache is empty (first access).
   * Requires voting capability.
   */
  app.get("/groups/:groupId/topics", async (c) => {
    const groupId = c.req.param("groupId");
    await requireCapability(groupId, "voting");
    const vcpAssemblyId = await resolveVcpAssemblyId(groupId);

    // Check cache first
    const hasCached = await topicCacheService.hasTopics(vcpAssemblyId);
    if (hasCached) {
      const topics = await topicCacheService.listByAssembly(vcpAssemblyId);
      return c.json({ topics });
    }

    // Cache miss — proxy to VCP, cache the response, and return
    const user = getUser(c);
    const participantId = await getParticipantIdOrThrow(user.id, groupId);
    const response = await proxyToVcp(c, config, "GET", `/assemblies/${vcpAssemblyId}/topics`, participantId);

    if (response.status === 200) {
      try {
        const body = (response as ResponseWithBody).__bufferedBody;
        if (body) {
          const data = JSON.parse(body) as { topics: Array<{ id: string; name: string; parentId?: string | null; sortOrder?: number }> };
          if (data.topics?.length) {
            await topicCacheService.upsertMany(
              data.topics.map((t) => ({
                id: t.id,
                assemblyId: vcpAssemblyId,
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
   * GET /groups/:groupId/surveys — served from local survey cache.
   * Falls through to VCP proxy if cache is empty (first access).
   * Enriches with hasResponded from local survey_responses table.
   * Requires surveys capability.
   */
  app.get("/groups/:groupId/surveys", async (c) => {
    const groupId = c.req.param("groupId");
    await requireCapability(groupId, "surveys");
    const vcpAssemblyId = await resolveVcpAssemblyId(groupId);
    const user = getUser(c);
    const participantId = await getParticipantIdOrThrow(user.id, groupId);

    const hasCached = await surveyCacheService.hasSurveys(vcpAssemblyId);
    if (hasCached) {
      const cachedSurveys = await surveyCacheService.listByAssembly(vcpAssemblyId);

      // If we've never synced hasResponded for this participant, fetch from VCP and cache
      const checked = await surveyCacheService.hasCheckedParticipant(vcpAssemblyId, participantId);
      if (!checked) {
        try {
          const vcpRes = await proxyToVcp(c, config, "GET", `/assemblies/${vcpAssemblyId}/surveys?participantId=${participantId}`, participantId);
          if (vcpRes.status === 200) {
            const body = (vcpRes as ResponseWithBody).__bufferedBody;
            if (body) {
              const vcpData = JSON.parse(body) as { surveys: Array<{ id: string; hasResponded?: boolean }> };
              for (const s of vcpData.surveys ?? []) {
                if (s.hasResponded) {
                  await surveyCacheService.recordResponse(vcpAssemblyId, s.id, participantId);
                }
              }
            }
          }
        } catch (err) {
          logger.warn("Failed to sync hasResponded from VCP", { error: String(err) });
        }
        await surveyCacheService.markParticipantChecked(vcpAssemblyId, participantId);
      }

      const [respondedIds, dismissedIds] = await Promise.all([
        surveyCacheService.respondedSurveyIds(vcpAssemblyId, participantId),
        surveyCacheService.dismissedSurveyIds(vcpAssemblyId, participantId),
      ]);
      const surveys = cachedSurveys.map((p) => ({
        id: p.id,
        title: p.title,
        questions: p.questions,
        topicIds: p.topicIds,
        schedule: p.schedule,
        closesAt: p.closesAt,
        createdBy: p.createdBy,
        hasResponded: respondedIds.has(p.id),
        dismissed: dismissedIds.has(p.id),
      }));
      return c.json({ surveys });
    }

    // Cache miss — proxy to VCP, cache the response, and return
    const response = await proxyToVcp(c, config, "GET", `/assemblies/${vcpAssemblyId}/surveys?participantId=${participantId}`, participantId);

    if (response.status === 200) {
      try {
        const body = (response as ResponseWithBody).__bufferedBody;
        if (body) {
          const data = JSON.parse(body) as { surveys: Array<{ id: string; title: string; questions: unknown[]; topicIds: string[]; schedule: number; closesAt: number; createdBy: string; hasResponded?: boolean }> };
          for (const p of data.surveys ?? []) {
            await surveyCacheService.upsert({
              id: p.id, assemblyId: vcpAssemblyId, title: p.title, questions: p.questions,
              topicIds: p.topicIds, schedule: p.schedule, closesAt: p.closesAt, createdBy: p.createdBy,
            });
            if (p.hasResponded) {
              await surveyCacheService.recordResponse(vcpAssemblyId, p.id, participantId);
            }
          }
          await surveyCacheService.markParticipantChecked(vcpAssemblyId, participantId);
        }
      } catch (err) {
        logger.warn("Failed to cache surveys from VCP response", { error: String(err) });
      }
    }

    return response;
  });

  /**
   * POST /groups/:groupId/surveys/:surveyId/dismiss — dismiss a survey from pending list.
   * Backend-owned: this is user preference state, not governance data.
   * Requires surveys capability.
   */
  app.post("/groups/:groupId/surveys/:surveyId/dismiss", async (c) => {
    const groupId = c.req.param("groupId");
    await requireCapability(groupId, "surveys");
    const vcpAssemblyId = await resolveVcpAssemblyId(groupId);
    const surveyId = c.req.param("surveyId");
    const user = getUser(c);
    const participantId = await getParticipantIdOrThrow(user.id, groupId);
    await surveyCacheService.recordDismissal(vcpAssemblyId, surveyId, participantId);
    return c.json({ status: "ok" });
  });

  /**
   * GET /groups/:groupId/participants — proxy to VCP + enrich with handles.
   * Handles are user-level data (backend-owned), not VCP data. We enrich the
   * VCP response so the frontend can search members by @handle.
   * No capability check — participants are always available.
   */
  app.get("/groups/:groupId/participants", async (c) => {
    const user = getUser(c);
    const groupId = c.req.param("groupId");
    const vcpAssemblyId = await resolveVcpAssemblyId(groupId);
    const participantId = await getParticipantIdOrThrow(user.id, groupId);

    const url = new URL(c.req.url);
    const vcpPath = `/assemblies/${vcpAssemblyId}/participants${url.search}`;
    const response = await proxyToVcp(c, config, "GET", vcpPath, participantId);

    if (response.status !== 200) return response;

    try {
      const data = await response.json() as { participants: Array<{ id: string; name: string }> };
      const pids = data.participants.map((p) => p.id);
      const handleMap = await groupService.getHandlesForParticipants(groupId, pids);
      const enriched = data.participants.map((p) => ({
        ...p,
        handle: handleMap.get(p.id) ?? null,
      }));
      return c.json({ participants: enriched });
    } catch {
      // Enrichment failed — return original response shape
      return response;
    }
  });

  /**
   * Group-scoped routes — resolve groupId → vcpAssemblyId, then proxy.
   * Catches all methods and paths under /groups/:groupId/
   *
   * Applies capability gating before forwarding to VCP.
   * Intercepts POST responses for events and surveys to track them for notifications.
   */
  app.all("/groups/:groupId/*", async (c) => {
    const user = getUser(c);
    const groupId = c.req.param("groupId");

    // Resolve group → VCP assembly
    const vcpAssemblyId = await resolveVcpAssemblyId(groupId);

    // Content routes handle POST/PUT/DELETE for candidacies, proposals, and notes
    // (they compute contentHash before calling VCP). The proxy must not intercept
    // these writes, but GET requests can fall through safely — the proxy serves as
    // fallback for list/detail endpoints not explicitly handled by content routes.
    const url = new URL(c.req.url);
    const subpath = url.pathname.replace(`/groups/${groupId}`, "");
    if (c.req.method !== "GET" && /^\/(candidacies|proposals|notes)(\/|$)/.test(subpath)) {
      return c.notFound();
    }

    // ── Capability gating ──
    if (/^\/(events|votes|delegations)(\/|$)/.test(subpath)) {
      await requireCapability(groupId, "voting");
    }
    if (/^\/scoring(\/|$)/.test(subpath)) {
      await requireCapability(groupId, "scoring");
    }
    if (/^\/surveys(\/|$)/.test(subpath)) {
      await requireCapability(groupId, "surveys");
    }
    if (/^\/notes(\/|$)/.test(subpath)) {
      await requireCapability(groupId, "community_notes");
    }
    // predictions, awareness, participants — always allowed (no capability check)

    // Resolve user's participant ID for this group
    const participantId = await getParticipantIdOrThrow(user.id, groupId);

    // Enforce admin-only operations server-side (not just a frontend gate)
    if (c.req.method === "POST") {
      // Event creation: gated by voteCreation group setting
      if (/^\/events\/?$/.test(subpath)) {
        const group = await groupService.get(groupId);
        if (group?.voteCreation !== "members") {
          if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
            throw new ForbiddenError("Only admins can create votes in this group");
          }
        }
      }
      // Topic creation: always admin-only
      if (/^\/topics\/?$/.test(subpath)) {
        if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
          throw new ForbiddenError("Only admins can create topics");
        }
      }
      // Scoring event creation: admin-only
      if (/^\/scoring\/?$/.test(subpath)) {
        if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
          throw new ForbiddenError("Only admins can create scoring events");
        }
      }
      // Scoring event close: admin-only
      if (/^\/scoring\/[^/]+\/close\/?$/.test(subpath)) {
        if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
          throw new ForbiddenError("Only admins can close scoring events");
        }
      }
      // Scoring event open: admin-only
      if (/^\/scoring\/[^/]+\/open\/?$/.test(subpath)) {
        if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
          throw new ForbiddenError("Only admins can open scoring events");
        }
      }
      // Scoring event extend deadline: admin-only
      if (/^\/scoring\/[^/]+\/extend\/?$/.test(subpath)) {
        if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
          throw new ForbiddenError("Only admins can extend scoring event deadlines");
        }
      }
    }

    // PUT admin-only operations
    if (c.req.method === "PUT") {
      // Scoring event draft update: admin-only
      if (/^\/scoring\/[^/]+\/?$/.test(subpath) && !/\/scorecards\//.test(subpath)) {
        if (!(await isAdminOfGroup(user.id, groupId, groupService))) {
          throw new ForbiddenError("Only admins can edit scoring event drafts");
        }
      }
    }

    // Rewrite the URL path from /groups/:groupId/... to /assemblies/:vcpAssemblyId/...
    const vcpPath = `/assemblies/${vcpAssemblyId}${subpath}${url.search}`;

    const response = await proxyToVcp(c, config, c.req.method, vcpPath, participantId);

    // Intercept successful POST responses to track events/surveys and cache data
    if (c.req.method === "POST" && (response.status === 200 || response.status === 201)) {
      if (response.status === 201) {
        await interceptForNotifications(response, vcpAssemblyId, subpath, notificationService);
        await interceptForTopicCache(response, vcpAssemblyId, subpath, topicCacheService);
        await interceptForSurveyCache(response, vcpAssemblyId, subpath, surveyCacheService);
      }
      await interceptForSurveyResponse(response, vcpAssemblyId, subpath, participantId, surveyCacheService);
    }

    // If VCP rejects a survey response with "already responded", record it in cache
    if (c.req.method === "POST" && response.status === 400) {
      const match = /^\/surveys\/([^/]+)\/respond\/?$/.exec(subpath);
      if (match) {
        try {
          const body = (response as ResponseWithBody).__bufferedBody;
          if (body && body.includes("already responded")) {
            const surveyId = match[1]!;
            await surveyCacheService.recordResponse(vcpAssemblyId, surveyId, participantId);
          }
        } catch {
          // ignore
        }
      }
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

  const controller = new AbortController();
  const timeoutMs = 30_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const init: RequestInit = { method, headers, signal: controller.signal };

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

  let vcpRes: Response;
  try {
    vcpRes = await fetch(vcpUrl, init);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      logger.error(`VCP request timed out after ${timeoutMs}ms`, { method, path });
      return new Response(
        JSON.stringify({ error: { code: "VCP_TIMEOUT", message: "VCP request timed out" } }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    }
    logger.error("VCP request failed", { method, path, error: String(err) });
    return new Response(
      JSON.stringify({ error: { code: "VCP_ERROR", message: "Failed to reach VCP" } }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Buffer response body so it can be read by interceptors and returned to client
  const responseBody = await vcpRes.text();

  const responseHeaders = new Headers();
  vcpRes.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection", "content-length"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // Normalize VCP 5xx to 502 Bad Gateway
  let finalStatus = vcpRes.status;
  let finalBody = responseBody;
  if (vcpRes.status >= 500) {
    finalStatus = 502;
    try {
      const parsed = JSON.parse(responseBody) as { error?: { message?: string } };
      finalBody = JSON.stringify({
        error: { code: "VCP_ERROR", message: parsed?.error?.message ?? "VCP internal error" },
      });
    } catch {
      finalBody = JSON.stringify({
        error: { code: "VCP_ERROR", message: "VCP internal error" },
      });
    }
    logger.error("VCP returned 5xx", { vcpStatus: vcpRes.status, path });
  }

  // 204 No Content must not have a body
  const response = new Response(
    finalStatus === 204 ? null : finalBody,
    { status: finalStatus, headers: responseHeaders },
  );
  // Stash the buffered body for interceptors to read without consuming the stream
  (response as ResponseWithBody).__bufferedBody = responseBody;
  return response;
}

interface ResponseWithBody extends Response {
  __bufferedBody?: string;
}

/**
 * Intercept successful POST responses to track events and surveys for notifications.
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

    // POST .../events → track for notification
    if (/^\/events\/?$/.test(subpath) && data.id) {
      await notificationService.trackEvent({
        id: data.id,
        assemblyId,
        title: data.title ?? "Untitled Event",
        votingStart: data.timeline?.votingStart ?? data.votingStart ?? "",
        votingEnd: data.timeline?.votingEnd ?? data.votingEnd ?? "",
      });
    }

    // POST .../surveys → track for notification
    if (/^\/surveys\/?$/.test(subpath) && data.id) {
      await notificationService.trackSurvey({
        id: data.id,
        assemblyId,
        title: data.title ?? "Untitled Survey",
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
 * Intercept successful POST /surveys to cache the new survey metadata.
 */
async function interceptForSurveyCache(
  response: Response,
  assemblyId: string,
  subpath: string,
  surveyCacheService: SurveyCacheService,
): Promise<void> {
  try {
    if (!/^\/surveys\/?$/.test(subpath)) return;

    const body = (response as ResponseWithBody).__bufferedBody;
    if (!body) return;

    const data = JSON.parse(body) as { id: string; title: string; questions: unknown[]; topicIds: string[]; schedule: number; closesAt: number; createdBy: string };
    if (data.id) {
      await surveyCacheService.upsert({
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
    logger.warn("Failed to cache survey from POST response", { error: String(err) });
  }
}

/**
 * Intercept successful POST /surveys/:sid/respond to record the response.
 */
async function interceptForSurveyResponse(
  _response: Response,
  assemblyId: string,
  subpath: string,
  participantId: string,
  surveyCacheService: SurveyCacheService,
): Promise<void> {
  try {
    const match = /^\/surveys\/([^/]+)\/respond\/?$/.exec(subpath);
    if (!match) return;

    const surveyId = match[1]!;
    await surveyCacheService.recordResponse(assemblyId, surveyId, participantId);
  } catch (err) {
    logger.warn("Failed to record survey response in cache", { error: String(err) });
  }
}
