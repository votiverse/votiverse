/**
 * Assembly management routes.
 */

import { Hono } from "hono";
import { v7 as uuidv7 } from "uuid";
import type { GovernanceConfig } from "@votiverse/config";
import { validateConfig, getPreset } from "@votiverse/config";
import type { PresetName } from "@votiverse/config";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
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
    }>();

    if (!body.name) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        400,
      );
    }

    let config: GovernanceConfig | undefined;
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
    }
    // If neither config nor preset is provided, config stays undefined → stored as null

    const id = uuidv7();
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

  return app;
}
