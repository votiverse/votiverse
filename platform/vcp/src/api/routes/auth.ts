/**
 * Auth routes — JWT token issuance for participant identity.
 */

import { Hono } from "hono";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import type { VCPConfig } from "../../config/schema.js";
import { signToken } from "../../lib/jwt.js";

export function authRoutes(manager: AssemblyManager, config: VCPConfig) {
  const app = new Hono();

  /**
   * POST /auth/token — exchange API key auth for a participant JWT.
   *
   * Requires a valid API key (checked by global auth middleware).
   * Returns a JWT scoped to the specified assembly+participant.
   */
  app.post("/auth/token", async (c) => {
    if (!config.jwtSecret) {
      return c.json(
        { error: { code: "NOT_CONFIGURED", message: "JWT authentication is not configured (VCP_JWT_SECRET not set)" } },
        501,
      );
    }

    const body = await c.req.json<{ participantId: string; assemblyId: string }>();

    if (!body.participantId || !body.assemblyId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "participantId and assemblyId are required" } },
        400,
      );
    }

    // Verify participant exists in assembly
    const participant = await manager.getParticipant(body.assemblyId, body.participantId);
    if (!participant) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Participant not found in assembly" } },
        404,
      );
    }

    if (participant.status === "sunset") {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Participant has been sunset" } },
        403,
      );
    }

    const token = await signToken(
      body.participantId,
      body.assemblyId,
      config.jwtSecret,
      config.jwtExpiry,
    );

    return c.json({
      token,
      expiresIn: config.jwtExpiry,
      participantId: body.participantId,
      assemblyId: body.assemblyId,
    });
  });

  return app;
}
