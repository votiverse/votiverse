/**
 * Content routes — backend-owned routes for proposals, candidacies,
 * community notes, and assets.
 *
 * These routes are registered BEFORE the VCP proxy catch-all.
 * They handle content storage locally and register metadata with VCP.
 * VCP-first rule: always call VCP before storing locally.
 */

import { Hono } from "hono";
import type { MembershipService } from "../../services/membership-service.js";
import type { ContentService } from "../../services/content-service.js";
import { computeContentHash } from "../../services/content-service.js";
import type { BackendConfig } from "../../config/schema.js";
import { parseJsonColumn } from "../../adapters/database/interface.js";
import { getUser } from "../middleware/auth.js";
import { NotFoundError, ForbiddenError, ValidationError, AppError } from "../middleware/error-handler.js";
import { safeWebsiteUrl } from "../../lib/validation.js";
import type { AssetStore } from "../../services/asset-store.js";
import { DatabaseAssetStore } from "../../services/asset-store.js";

/** Convert a failed VCP response into an AppError that preserves the VCP status code. */
async function throwVcpError(res: Response, fallbackMessage: string): Promise<never> {
  const body = await res.json().catch(() => ({ error: { message: fallbackMessage } })) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
  const err = body?.error;
  throw new AppError(
    err?.code ?? "VCP_ERROR",
    err?.message ?? fallbackMessage,
    res.status >= 500 ? 502 : res.status,
    err?.details,
  );
}

export function contentRoutes(
  membershipService: MembershipService,
  contentService: ContentService,
  config: BackendConfig,
  assetStore?: AssetStore,
) {
  const app = new Hono();

  // -----------------------------------------------------------------------
  // Proposal Drafts (backend-only, no VCP involvement)
  // -----------------------------------------------------------------------

  app.post("/assemblies/:assemblyId/proposals/drafts", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const body = await c.req.json<{
      issueId: string;
      choiceKey?: string;
      title: string;
      markdown?: string;
    }>();

    const draft = await contentService.createDraft({
      assemblyId,
      issueId: body.issueId,
      choiceKey: body.choiceKey,
      authorId: user.id,
      title: body.title,
      markdown: body.markdown,
    });

    return c.json(draft, 201);
  });

  app.get("/assemblies/:assemblyId/proposals/drafts", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const drafts = await contentService.listDrafts(assemblyId, user.id);
    return c.json({ drafts });
  });

  app.get("/assemblies/:assemblyId/proposals/drafts/:draftId", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");
    const draft = await contentService.getDraft(assemblyId, draftId);
    if (!draft) {
      throw new NotFoundError("Draft not found");
    }
    if (draft.authorId !== user.id) {
      throw new ForbiddenError("You can only view your own drafts");
    }
    return c.json(draft);
  });

  app.put("/assemblies/:assemblyId/proposals/drafts/:draftId", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");
    const draft = await contentService.getDraft(assemblyId, draftId);
    if (!draft) {
      throw new NotFoundError("Draft not found");
    }
    if (draft.authorId !== user.id) {
      throw new ForbiddenError("You can only edit your own drafts");
    }
    const body = await c.req.json<{
      title?: string;
      markdown?: string;
      choiceKey?: string;
      assets?: string[];
    }>();

    await contentService.updateDraft(assemblyId, draftId, body);
    const updated = await contentService.getDraft(assemblyId, draftId);
    return c.json(updated);
  });

  app.delete("/assemblies/:assemblyId/proposals/drafts/:draftId", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");
    const draft = await contentService.getDraft(assemblyId, draftId);
    if (!draft) {
      throw new NotFoundError("Draft not found");
    }
    if (draft.authorId !== user.id) {
      throw new ForbiddenError("You can only delete your own drafts");
    }
    await contentService.deleteDraft(assemblyId, draftId);
    return c.json({ status: "deleted" });
  });

  /** Submit draft → VCP first, then store content locally. */
  app.post("/assemblies/:assemblyId/proposals/drafts/:draftId/submit", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");

    const draft = await contentService.getDraft(assemblyId, draftId);
    if (!draft) {
      throw new NotFoundError("Draft not found");
    }
    if (draft.authorId !== user.id) {
      throw new ForbiddenError("You can only submit your own drafts");
    }

    // Compute content hash
    const contentHash = computeContentHash(draft.markdown, draft.assets);

    // Resolve participant ID
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // VCP-first: register metadata with VCP
    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/proposals`, {
      issueId: draft.issueId,
      choiceKey: draft.choiceKey,
      title: draft.title,
      contentHash,
    }, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to register proposal with VCP");
    }

    const vcpData = await vcpRes.json() as { id: string; submittedAt: number };

    // On VCP success: store content locally
    await contentService.storeProposalContent({
      proposalId: vcpData.id,
      assemblyId,
      versionNumber: 1,
      markdown: draft.markdown,
      assets: draft.assets,
      contentHash,
      createdAt: vcpData.submittedAt,
    });

    // Delete draft
    await contentService.deleteDraft(assemblyId, draftId);

    return c.json({
      id: vcpData.id,
      issueId: draft.issueId,
      choiceKey: draft.choiceKey,
      title: draft.title,
      status: "submitted",
      currentVersion: 1,
      contentHash,
    }, 201);
  });

  // -----------------------------------------------------------------------
  // Proposal content (read)
  // -----------------------------------------------------------------------

  /** GET proposal with full content. */
  app.get("/assemblies/:assemblyId/proposals/:proposalId", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const proposalId = c.req.param("proposalId");
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // Get metadata from VCP
    const vcpRes = await callVcp(config, "GET", `/assemblies/${assemblyId}/proposals/${proposalId}`, undefined, participantId);
    if (!vcpRes.ok) {
      return new Response(await vcpRes.text(), { status: vcpRes.status, headers: vcpRes.headers });
    }
    const metadata = await vcpRes.json() as Record<string, unknown>;

    // Get latest content
    const content = await contentService.getProposalContent(assemblyId, proposalId);

    return c.json({ ...metadata, content: content ? mapContentRow(content) : null });
  });

  /** GET proposal version with full content. */
  app.get("/assemblies/:assemblyId/proposals/:proposalId/versions/:version", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const proposalId = c.req.param("proposalId");
    const version = parseInt(c.req.param("version"));

    const content = await contentService.getProposalContent(assemblyId, proposalId, version);
    if (!content) {
      throw new NotFoundError("Version not found");
    }
    return c.json(mapContentRow(content));
  });

  /** POST new proposal version. */
  app.post("/assemblies/:assemblyId/proposals/:proposalId/version", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const proposalId = c.req.param("proposalId");
    const body = await c.req.json<{
      markdown: string;
      assets?: string[];
      changeSummary?: string;
    }>();
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const contentHash = computeContentHash(body.markdown, body.assets ?? []);

    // VCP-first
    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/proposals/${proposalId}/version`, {
      contentHash,
    }, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to register version with VCP");
    }

    const vcpData = await vcpRes.json() as { currentVersion: number };

    await contentService.storeProposalContent({
      proposalId,
      assemblyId,
      versionNumber: vcpData.currentVersion,
      markdown: body.markdown,
      assets: body.assets ?? [],
      contentHash,
      changeSummary: body.changeSummary,
      createdAt: Date.now(),
    });

    return c.json({ currentVersion: vcpData.currentVersion, contentHash });
  });

  // -----------------------------------------------------------------------
  // Candidacy content
  // -----------------------------------------------------------------------

  /** Declare candidacy with content. */
  app.post("/assemblies/:assemblyId/candidacies", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const body = await c.req.json<{
      topicScope: string[];
      voteTransparencyOptIn: boolean;
      markdown: string;
      assets?: string[];
      websiteUrl?: string;
    }>();
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    if (body.websiteUrl) {
      const urlResult = safeWebsiteUrl.safeParse(body.websiteUrl);
      if (!urlResult.success) {
        throw new ValidationError(urlResult.error.issues[0]?.message ?? "Invalid website URL");
      }
    }

    const contentHash = computeContentHash(body.markdown, body.assets ?? []);

    // VCP-first
    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/candidacies`, {
      topicScope: body.topicScope,
      voteTransparencyOptIn: body.voteTransparencyOptIn,
      contentHash,
    }, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to register candidacy");
    }

    const vcpData = await vcpRes.json() as { id: string; declaredAt: number; currentVersion: number };

    await contentService.storeCandidacyContent({
      candidacyId: vcpData.id,
      assemblyId,
      versionNumber: vcpData.currentVersion,
      markdown: body.markdown,
      assets: body.assets ?? [],
      contentHash,
      websiteUrl: body.websiteUrl || null,
      createdAt: vcpData.declaredAt,
    });

    return c.json({ ...vcpData, contentHash }, 201);
  });

  /** GET candidacy list — enriched with websiteUrl from backend content. */
  app.get("/assemblies/:assemblyId/candidacies", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const url = new URL(c.req.url);
    const vcpPath = `/assemblies/${assemblyId}/candidacies${url.search}`;
    const vcpRes = await callVcp(config, "GET", vcpPath, undefined, participantId);
    if (!vcpRes.ok) {
      return new Response(await vcpRes.text(), { status: vcpRes.status, headers: vcpRes.headers });
    }
    const data = await vcpRes.json() as { candidacies: Array<Record<string, unknown>> };

    const websiteUrls = await contentService.getCandidacyWebsiteUrls(assemblyId);
    const participantIds = data.candidacies.map((c) => c["participantId"] as string);
    const titles = await membershipService.getMembershipTitles(assemblyId, participantIds);
    for (const c of data.candidacies) {
      const url = websiteUrls.get(c["id"] as string);
      if (url) (c as Record<string, unknown>)["websiteUrl"] = url;
      const title = titles.get(c["participantId"] as string);
      if (title) (c as Record<string, unknown>)["title"] = title;
    }

    return c.json(data);
  });

  /** GET candidacy with full content. */
  app.get("/assemblies/:assemblyId/candidacies/:candidacyId", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const candidacyId = c.req.param("candidacyId");
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const vcpRes = await callVcp(config, "GET", `/assemblies/${assemblyId}/candidacies/${candidacyId}`, undefined, participantId);
    if (!vcpRes.ok) {
      return new Response(await vcpRes.text(), { status: vcpRes.status, headers: vcpRes.headers });
    }
    const metadata = await vcpRes.json() as Record<string, unknown>;

    const content = await contentService.getCandidacyContent(assemblyId, candidacyId);
    const pId = metadata["participantId"] as string;
    const titleMap = await membershipService.getMembershipTitles(assemblyId, [pId]);
    const title = titleMap.get(pId) ?? null;

    return c.json({ ...metadata, title, content: content ? mapContentRow(content) : null });
  });

  /** POST candidacy version — update profile with new version. */
  app.post("/assemblies/:assemblyId/candidacies/:candidacyId/version", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const candidacyId = c.req.param("candidacyId");
    const body = await c.req.json<{
      markdown: string;
      assets?: string[];
      topicScope?: string[];
      voteTransparencyOptIn?: boolean;
      websiteUrl?: string;
    }>();
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    if (body.websiteUrl) {
      const urlResult = safeWebsiteUrl.safeParse(body.websiteUrl);
      if (!urlResult.success) {
        throw new ValidationError(urlResult.error.issues[0]?.message ?? "Invalid website URL");
      }
    }

    const contentHash = computeContentHash(body.markdown, body.assets ?? []);

    // VCP-first: register version metadata
    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/candidacies/${candidacyId}/version`, {
      contentHash,
      topicScope: body.topicScope,
      voteTransparencyOptIn: body.voteTransparencyOptIn,
    }, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to create candidacy version");
    }

    const vcpData = await vcpRes.json() as { currentVersion: number; status: string };

    // Store content locally
    await contentService.storeCandidacyContent({
      candidacyId,
      assemblyId,
      versionNumber: vcpData.currentVersion,
      markdown: body.markdown,
      assets: body.assets ?? [],
      contentHash,
      websiteUrl: body.websiteUrl || null,
      createdAt: Date.now(),
    });

    return c.json({ currentVersion: vcpData.currentVersion, contentHash });
  });

  /** POST candidacy withdraw. */
  app.post("/assemblies/:assemblyId/candidacies/:candidacyId/withdraw", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const candidacyId = c.req.param("candidacyId");
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/candidacies/${candidacyId}/withdraw`, {}, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to withdraw candidacy");
    }

    return c.json({ status: "withdrawn" });
  });

  // -----------------------------------------------------------------------
  // Community notes content
  // -----------------------------------------------------------------------

  /** Create note with content. */
  app.post("/assemblies/:assemblyId/notes", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const body = await c.req.json<{
      markdown: string;
      assets?: string[];
      targetType: string;
      targetId: string;
      targetVersionNumber?: number;
    }>();
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const contentHash = computeContentHash(body.markdown, body.assets ?? []);

    // VCP-first
    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/notes`, {
      contentHash,
      targetType: body.targetType,
      targetId: body.targetId,
      targetVersionNumber: body.targetVersionNumber,
    }, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to register note");
    }

    const vcpData = await vcpRes.json() as { id: string; createdAt: number };

    await contentService.storeNoteContent({
      noteId: vcpData.id,
      assemblyId,
      markdown: body.markdown,
      assets: body.assets ?? [],
      contentHash,
      createdAt: vcpData.createdAt,
    });

    return c.json({ ...vcpData, contentHash }, 201);
  });

  /** GET notes list with content joined from backend. */
  app.get("/assemblies/:assemblyId/notes", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // Forward query params (targetType, targetId) to VCP
    const qs = c.req.url.includes("?") ? c.req.url.slice(c.req.url.indexOf("?")) : "";
    const vcpRes = await callVcp(config, "GET", `/assemblies/${assemblyId}/notes${qs}`, undefined, participantId);
    if (!vcpRes.ok) {
      return new Response(await vcpRes.text(), { status: vcpRes.status, headers: vcpRes.headers });
    }
    const { notes } = await vcpRes.json() as { notes: Array<Record<string, unknown>> };

    // Join content for each note
    const enriched = await Promise.all(
      notes.map(async (note) => {
        const content = await contentService.getNoteContent(assemblyId, note["id"] as string);
        return { ...note, content: content ? mapContentRow(content) : null };
      }),
    );

    return c.json({ notes: enriched });
  });

  /** GET note with full content. */
  app.get("/assemblies/:assemblyId/notes/:noteId", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const noteId = c.req.param("noteId");
    const user = getUser(c);
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const vcpRes = await callVcp(config, "GET", `/assemblies/${assemblyId}/notes/${noteId}`, undefined, participantId);
    if (!vcpRes.ok) {
      return new Response(await vcpRes.text(), { status: vcpRes.status, headers: vcpRes.headers });
    }
    const metadata = await vcpRes.json() as Record<string, unknown>;

    const content = await contentService.getNoteContent(assemblyId, noteId);

    return c.json({ ...metadata, content: content ? mapContentRow(content) : null });
  });

  /** POST note withdraw. */
  app.post("/assemblies/:assemblyId/notes/:noteId/withdraw", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const noteId = c.req.param("noteId");
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/notes/${noteId}/withdraw`, {}, participantId);

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to withdraw note");
    }

    return c.json({ status: "withdrawn" });
  });

  // -----------------------------------------------------------------------
  // Booklet recommendations (VCP-first for metadata, backend stores content)
  // -----------------------------------------------------------------------

  /** POST recommendation — VCP-first, then store markdown locally. */
  app.post("/assemblies/:assemblyId/events/:eventId/issues/:issueId/recommendation", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const eventId = c.req.param("eventId");
    const issueId = c.req.param("issueId");
    const body = await c.req.json<{ markdown: string }>();
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // Compute content hash
    const contentHash = computeContentHash(body.markdown);

    // VCP-first: register metadata
    const vcpRes = await callVcp(config, "POST",
      `/assemblies/${assemblyId}/events/${eventId}/issues/${issueId}/recommendation`,
      { contentHash },
      participantId,
    );

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to register recommendation");
    }

    // Store content locally
    await contentService.storeRecommendation({
      assemblyId,
      eventId,
      issueId,
      markdown: body.markdown,
    });

    return c.json({ status: "ok", contentHash }, 201);
  });

  /** GET recommendation with content. */
  app.get("/assemblies/:assemblyId/events/:eventId/issues/:issueId/recommendation", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const eventId = c.req.param("eventId");
    const issueId = c.req.param("issueId");

    const content = await contentService.getRecommendation(assemblyId, eventId, issueId);
    if (!content) {
      return c.json({ recommendation: null });
    }

    return c.json({
      recommendation: {
        markdown: content.markdown,
        contentHash: content.contentHash,
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
      },
    });
  });

  /** DELETE recommendation. */
  app.delete("/assemblies/:assemblyId/events/:eventId/issues/:issueId/recommendation", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const eventId = c.req.param("eventId");
    const issueId = c.req.param("issueId");
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    // VCP-first
    const vcpRes = await callVcp(config, "DELETE",
      `/assemblies/${assemblyId}/events/${eventId}/issues/${issueId}/recommendation`,
      undefined,
      participantId,
    );

    if (!vcpRes.ok) {
      await throwVcpError(vcpRes, "Failed to delete recommendation");
    }

    // Delete local content
    await contentService.deleteRecommendation(assemblyId, eventId, issueId);

    return c.json({ status: "deleted" });
  });

  // -----------------------------------------------------------------------
  // Assets
  // -----------------------------------------------------------------------

  /** POST /assemblies/:assemblyId/assets/upload-url — request a presigned upload URL. */
  app.post("/assemblies/:assemblyId/assets/upload-url", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const body = await c.req.json() as { filename: string; mimeType: string };

    if (!body.filename || !body.mimeType) {
      throw new ValidationError("filename and mimeType are required");
    }

    if (!assetStore) throw new ValidationError("Asset storage not configured");
    const upload = await assetStore.requestUpload({
      assemblyId,
      filename: body.filename,
      mimeType: body.mimeType,
      uploadedBy: user.id,
    });

    return c.json({
      assetId: upload.assetId,
      uploadUrl: upload.uploadUrl,
    }, 201);
  });

  /** POST /assemblies/:assemblyId/assets/:assetId/confirm — confirm upload completed. */
  app.post("/assemblies/:assemblyId/assets/:assetId/confirm", async (c) => {
    const assetId = c.req.param("assetId");
    const body = await c.req.json() as { sizeBytes: number; hash: string };

    if (!assetStore) throw new ValidationError("Asset storage not configured");
    const metadata = await assetStore.confirmUpload(assetId, body.sizeBytes ?? 0, body.hash ?? "");

    return c.json({
      id: metadata.id,
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      hash: metadata.hash,
      url: metadata.url,
    });
  });

  /** POST /assemblies/:assemblyId/assets — direct upload (dev/compat, multipart form). */
  app.post("/assemblies/:assemblyId/assets", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");

    const formData = await c.req.parseBody();
    const file = formData["file"];
    if (!file || typeof file === "string") {
      throw new ValidationError("File upload required");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!assetStore) throw new ValidationError("Asset storage not configured");
    const metadata = await assetStore.storeDirect({
      assemblyId,
      filename: file.name || "unnamed",
      mimeType: file.type || "application/octet-stream",
      data: buffer,
      uploadedBy: user.id,
    });

    return c.json({
      id: metadata.id,
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      hash: metadata.hash,
      url: metadata.url,
    }, 201);
  });

  /** GET /assemblies/:assemblyId/assets/:assetId — serve asset (DB mode) or redirect (S3 mode). */
  app.get("/assemblies/:assemblyId/assets/:assetId", async (c) => {
    const assetId = c.req.param("assetId");

    if (!assetStore) throw new NotFoundError("Asset not found");

    // If using DatabaseAssetStore, serve binary directly
    if (assetStore instanceof DatabaseAssetStore) {
      const asset = await (assetStore as DatabaseAssetStore).getData(assetId);
      if (!asset) throw new NotFoundError("Asset not found");
      return new Response(asset.data, {
        headers: {
          "Content-Type": asset.mimeType,
          "Content-Disposition": `inline; filename="${asset.filename}"`,
          "Content-Length": String(asset.sizeBytes),
        },
      });
    }

    // S3 mode: redirect to CDN URL
    const url = await assetStore.getUrl(assetId);
    if (!url) throw new NotFoundError("Asset not found");
    return c.redirect(url);
  });

  // -----------------------------------------------------------------------
  // Internal seed endpoint — bulk content storage (bypasses VCP)
  // Only available in development/test environments.
  // -----------------------------------------------------------------------

  app.use("/internal/*", async (c, next) => {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    return next();
  });

  /**
   * POST /internal/content-seed — store content directly (seed only).
   * Expects an array of content items with type, id, assemblyId, markdown, etc.
   */
  app.post("/internal/content-seed", async (c) => {
    const body = await c.req.json<{
      items: Array<{
        type: "proposal" | "candidacy" | "note";
        id: string;
        assemblyId: string;
        versionNumber?: number;
        markdown: string;
        assets?: string[];
      }>;
    }>();

    let stored = 0;
    for (const item of body.items) {
      const contentHash = computeContentHash(item.markdown, item.assets ?? []);
      const now = Date.now();

      if (item.type === "proposal") {
        await contentService.storeProposalContent({
          proposalId: item.id,
          assemblyId: item.assemblyId,
          versionNumber: item.versionNumber ?? 1,
          markdown: item.markdown,
          assets: item.assets ?? [],
          contentHash,
          createdAt: now,
        });
      } else if (item.type === "candidacy") {
        await contentService.storeCandidacyContent({
          candidacyId: item.id,
          assemblyId: item.assemblyId,
          versionNumber: item.versionNumber ?? 1,
          markdown: item.markdown,
          assets: item.assets ?? [],
          contentHash,
          createdAt: now,
        });
      } else if (item.type === "note") {
        await contentService.storeNoteContent({
          noteId: item.id,
          assemblyId: item.assemblyId,
          markdown: item.markdown,
          assets: item.assets ?? [],
          contentHash,
          createdAt: now,
        });
      }
      stored++;
    }

    return c.json({ status: "ok", stored }, 201);
  });

  // ── Entity Endorsements (proxy to VCP) ──────────────────────────────

  /** PUT /assemblies/:assemblyId/endorsements — upsert endorsement. */
  app.put("/assemblies/:assemblyId/endorsements", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);
    const body = await c.req.json();

    const vcpRes = await callVcp(config, "PUT", `/assemblies/${assemblyId}/endorsements`, body, participantId);
    return new Response(await vcpRes.text(), { status: vcpRes.status, headers: { "Content-Type": "application/json" } });
  });

  /** DELETE /assemblies/:assemblyId/endorsements — retract endorsement. */
  app.delete("/assemblies/:assemblyId/endorsements", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);
    const body = await c.req.json();

    const vcpRes = await callVcp(config, "DELETE", `/assemblies/${assemblyId}/endorsements`, body, participantId);
    return new Response(await vcpRes.text(), { status: vcpRes.status, headers: { "Content-Type": "application/json" } });
  });

  /** GET /assemblies/:assemblyId/endorsements — get endorsement counts + caller's state. */
  app.get("/assemblies/:assemblyId/endorsements", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const url = new URL(c.req.url);
    const vcpRes = await callVcp(config, "GET", `/assemblies/${assemblyId}/endorsements${url.search}`, undefined, participantId);
    return new Response(await vcpRes.text(), { status: vcpRes.status, headers: { "Content-Type": "application/json" } });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callVcp(
  config: BackendConfig,
  method: string,
  path: string,
  body?: unknown,
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
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  const init: RequestInit = { method, headers, signal: controller.signal };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  try {
    return await fetch(`${config.vcpBaseUrl}${path}`, init);
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapContentRow(row: Record<string, unknown>) {
  return {
    markdown: row["markdown"],
    assets: parseJsonColumn<unknown[]>(row["assets"] ?? "[]"),
    contentHash: row["content_hash"],
    changeSummary: row["change_summary"] ?? undefined,
    websiteUrl: row["website_url"] ?? null,
    versionNumber: row["version_number"],
    createdAt: row["created_at"],
  };
}
