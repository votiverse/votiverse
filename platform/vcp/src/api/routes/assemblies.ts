/**
 * Assembly management routes.
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { GovernanceConfig } from "@votiverse/config";
import { validateConfig, getPreset } from "@votiverse/config";
import type { PresetName } from "@votiverse/config";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function assemblyRoutes(manager: AssemblyManager) {
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

    return c.json(assembly, 201);
  });

  /** GET /assemblies — list all assemblies. */
  app.get("/assemblies", async (c) => {
    const assemblies = await manager.listAssemblies();
    return c.json({ assemblies });
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
