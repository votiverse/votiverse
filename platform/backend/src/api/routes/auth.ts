/**
 * Auth routes — registration, login, token refresh, logout.
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { SessionService } from "../../services/session-service.js";

export function authRoutes(userService: UserService, sessionService: SessionService) {
  const app = new Hono();

  /** POST /auth/register — create account. */
  app.post("/auth/register", async (c) => {
    const body = await c.req.json<{ email: string; password: string; name: string }>();
    const user = await userService.register(body.email, body.password, body.name);
    const tokens = await sessionService.createSession(user);

    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }, 201);
  });

  /** POST /auth/login — authenticate. */
  app.post("/auth/login", async (c) => {
    const body = await c.req.json<{ email: string; password: string }>();
    const user = await userService.authenticate(body.email, body.password);
    const tokens = await sessionService.createSession(user);

    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  /** POST /auth/refresh — rotate refresh token, get new access token. */
  app.post("/auth/refresh", async (c) => {
    const body = await c.req.json<{ refreshToken: string }>();
    if (!body.refreshToken) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "refreshToken is required" } },
        400,
      );
    }

    const tokens = await sessionService.refreshSession(
      body.refreshToken,
      (id) => userService.getById(id),
    );

    return c.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  /** POST /auth/logout — revoke refresh token. */
  app.post("/auth/logout", async (c) => {
    const body = await c.req.json<{ refreshToken: string }>();
    if (body.refreshToken) {
      await sessionService.revokeSession(body.refreshToken);
    }
    return c.body(null, 204);
  });

  return app;
}
