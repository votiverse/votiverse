/**
 * Assembly management routes.
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { GovernanceConfig } from "@votiverse/config";
import { validateConfig, getPreset } from "@votiverse/config";
import type { PresetName } from "@votiverse/config";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { RoleInvariantError } from "../../engine/assembly-manager.js";
import type { AuthAdapter } from "../../adapters/auth/interface.js";
import { getClient } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function assemblyRoutes(manager: AssemblyManager, auth?: AuthAdapter) {
  const app = new Hono();

  /** POST /assemblies — register a new assembly. */
  app.post("/assemblies", async (c) => {
    const body = await c.req.json<{
      name: string;
      organizationId?: string;
      config?: GovernanceConfig;
      preset?: string;
      creatorParticipantId?: string;
    }>();

    if (!body.name) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        400,
      );
    }

    let config: GovernanceConfig;
    if (body.config) {
      const validation = validateConfig(body.config);
      if (!validation.valid) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Invalid governance config", details: { errors: validation.errors } } },
          400,
        );
      }
      config = body.config;
    } else if (body.preset) {
      try {
        config = getPreset(body.preset as PresetName);
      } catch {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: `Unknown preset: ${body.preset}` } },
          400,
        );
      }
      if (!config) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: `Unknown preset: ${body.preset}` } },
          400,
        );
      }
    } else {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Either config or preset is required" } },
        400,
      );
    }

    const id = randomUUID();
    const assembly = await manager.createAssembly(id, {
      name: body.name,
      organizationId: body.organizationId,
      config,
    });

    // Auto-link: grant the creating client access to the new assembly
    const client = getClient(c);
    if (auth?.grantAssemblyAccess) {
      await auth.grantAssemblyAccess(client.id, id);
    }

    // If a creator participant is specified, register them and grant owner + admin roles
    if (body.creatorParticipantId) {
      await manager.grantRole(id, body.creatorParticipantId, "owner", body.creatorParticipantId);
    }

    return c.json(assembly, 201);
  });

  /** GET /assemblies — list all assemblies (paginated, filtered by client access). */
  app.get("/assemblies", async (c) => {
    const client = getClient(c);
    let all = await manager.listAssemblies();

    // Filter by client assembly access
    if (client.assemblyAccess !== "*") {
      const allowed = new Set(client.assemblyAccess);
      all = all.filter((a) => allowed.has(a.id));
    }

    const { data, pagination } = paginate(all, parsePagination(c));
    return c.json({ assemblies: data, pagination });
  });

  /** GET /assemblies/:id — get assembly state. */
  app.get("/assemblies/:id", async (c) => {
    const info = await manager.getAssemblyInfo(c.req.param("id"));
    if (!info) {
      return c.json(
        { error: { code: "ASSEMBLY_NOT_FOUND", message: `Assembly "${c.req.param("id")}" not found` } },
        404,
      );
    }
    return c.json(info);
  });

  /** GET /assemblies/:id/roles — list all roles for an assembly. */
  app.get("/assemblies/:id/roles", async (c) => {
    const assemblyId = c.req.param("id");
    const roles = await manager.listRoles(assemblyId);
    return c.json({ roles });
  });

  /** POST /assemblies/:id/roles — grant a role. Requires owner. */
  app.post("/assemblies/:id/roles", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<{
      participantId: string;
      role: "owner" | "admin";
    }>();

    if (!body.participantId || !body.role) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId and role are required" } },
        400,
      );
    }
    if (body.role !== "owner" && body.role !== "admin") {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "role must be 'owner' or 'admin'" } },
        400,
      );
    }

    // Only owners can manage roles
    const callerId = c.req.header("X-Participant-Id") ?? (c.get("participantId") as string | undefined);
    if (!callerId) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Participant identity required" } },
        401,
      );
    }
    const isOwner = await manager.hasRole(assemblyId, callerId, "owner");
    if (!isOwner) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Only owners can manage roles" } },
        403,
      );
    }

    try {
      await manager.grantRole(assemblyId, body.participantId, body.role, callerId);
    } catch (e) {
      if (e instanceof RoleInvariantError) {
        return c.json(
          { error: { code: "ROLE_INVARIANT", message: (e as Error).message } },
          409,
        );
      }
      throw e;
    }
    return c.json({ ok: true }, 200);
  });

  /** DELETE /assemblies/:id/roles — revoke a role. Requires owner. */
  app.delete("/assemblies/:id/roles", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<{
      participantId: string;
      role: "owner" | "admin";
    }>();

    if (!body.participantId || !body.role) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId and role are required" } },
        400,
      );
    }

    const callerId = c.req.header("X-Participant-Id") ?? (c.get("participantId") as string | undefined);
    if (!callerId) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Participant identity required" } },
        401,
      );
    }
    const isOwner = await manager.hasRole(assemblyId, callerId, "owner");
    if (!isOwner) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Only owners can manage roles" } },
        403,
      );
    }

    try {
      await manager.revokeRole(assemblyId, body.participantId, body.role, callerId);
    } catch (e) {
      if (e instanceof RoleInvariantError) {
        return c.json(
          { error: { code: "ROLE_INVARIANT", message: (e as Error).message } },
          409,
        );
      }
      throw e;
    }
    return c.json({ ok: true }, 200);
  });

  return app;
}
