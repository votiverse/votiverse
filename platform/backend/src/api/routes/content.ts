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
import { getUser } from "../middleware/auth.js";

export function contentRoutes(
  membershipService: MembershipService,
  contentService: ContentService,
  config: BackendConfig,
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
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");
    const draft = await contentService.getDraft(assemblyId, draftId);
    if (!draft) {
      return c.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, 404);
    }
    return c.json(draft);
  });

  app.put("/assemblies/:assemblyId/proposals/drafts/:draftId", async (c) => {
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");
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
    const assemblyId = c.req.param("assemblyId");
    const draftId = c.req.param("draftId");
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
      return c.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, 404);
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
      const err = await vcpRes.json().catch(() => ({ error: { message: "VCP error" } })) as { error: { message: string } };
      return c.json(
        { error: { code: "VCP_ERROR", message: err.error?.message ?? "Failed to register proposal with VCP" } },
        vcpRes.status as 400 | 409 | 500,
      );
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
      return c.json({ error: { code: "NOT_FOUND", message: "Version not found" } }, 404);
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
      const err = await vcpRes.json().catch(() => ({ error: { message: "VCP error" } })) as { error: { message: string } };
      return c.json(
        { error: { code: "VCP_ERROR", message: err.error?.message ?? "Failed to register version with VCP" } },
        vcpRes.status as 400 | 409 | 500,
      );
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
    }>();
    const participantId = await membershipService.getParticipantIdOrThrow(user.id, assemblyId);

    const contentHash = computeContentHash(body.markdown, body.assets ?? []);

    // VCP-first
    const vcpRes = await callVcp(config, "POST", `/assemblies/${assemblyId}/candidacies`, {
      topicScope: body.topicScope,
      voteTransparencyOptIn: body.voteTransparencyOptIn,
      contentHash,
    }, participantId);

    if (!vcpRes.ok) {
      const err = await vcpRes.json().catch(() => ({ error: { message: "VCP error" } })) as { error: { message: string } };
      return c.json(
        { error: { code: "VCP_ERROR", message: err.error?.message ?? "Failed to register candidacy" } },
        vcpRes.status as 400 | 409 | 500,
      );
    }

    const vcpData = await vcpRes.json() as { id: string; declaredAt: number; currentVersion: number };

    await contentService.storeCandidacyContent({
      candidacyId: vcpData.id,
      assemblyId,
      versionNumber: vcpData.currentVersion,
      markdown: body.markdown,
      assets: body.assets ?? [],
      contentHash,
      createdAt: vcpData.declaredAt,
    });

    return c.json({ ...vcpData, contentHash }, 201);
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

    return c.json({ ...metadata, content: content ? mapContentRow(content) : null });
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
      const err = await vcpRes.json().catch(() => ({ error: { message: "VCP error" } })) as { error: { message: string } };
      return c.json(
        { error: { code: "VCP_ERROR", message: err.error?.message ?? "Failed to register note" } },
        vcpRes.status as 400 | 409 | 500,
      );
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

  // -----------------------------------------------------------------------
  // Assets
  // -----------------------------------------------------------------------

  app.post("/assemblies/:assemblyId/assets", async (c) => {
    const user = getUser(c);
    const assemblyId = c.req.param("assemblyId");

    const formData = await c.req.parseBody();
    const file = formData["file"];
    if (!file || typeof file === "string") {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "File upload required" } }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await contentService.storeAsset({
      assemblyId,
      filename: file.name || "unnamed",
      mimeType: file.type || "application/octet-stream",
      data: buffer,
      uploadedBy: user.id,
    });

    return c.json({
      id: asset.id,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: asset.sizeBytes,
      hash: asset.hash,
    }, 201);
  });

  app.get("/assemblies/:assemblyId/assets/:assetId", async (c) => {
    const assetId = c.req.param("assetId");
    const asset = await contentService.getAsset(assetId);
    if (!asset) {
      return c.json({ error: { code: "NOT_FOUND", message: "Asset not found" } }, 404);
    }

    return new Response(asset.data, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${asset.filename}"`,
        "Content-Length": String(asset.sizeBytes),
      },
    });
  });

  // -----------------------------------------------------------------------
  // Internal seed endpoint — bulk content storage (bypasses VCP)
  // -----------------------------------------------------------------------

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

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return fetch(`${config.vcpBaseUrl}${path}`, init);
}

function mapContentRow(row: Record<string, unknown>) {
  return {
    markdown: row["markdown"],
    assets: JSON.parse((row["assets"] as string) || "[]"),
    contentHash: row["content_hash"],
    changeSummary: row["change_summary"] ?? undefined,
    versionNumber: row["version_number"],
    createdAt: row["created_at"],
  };
}
