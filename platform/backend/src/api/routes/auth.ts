/**
 * Auth routes — registration, login, token refresh, logout.
 *
 * Tokens are delivered via httpOnly cookies (for web browsers) AND in the
 * response body (for mobile apps that use Authorization headers).
 */

import { Hono } from "hono";
import type { UserService } from "../../services/user-service.js";
import type { SessionService } from "../../services/session-service.js";
import type { BackendConfig } from "../../config/schema.js";
import { setAuthCookies, clearAuthCookies, getRefreshTokenFromCookie } from "../../lib/cookies.js";

export function authRoutes(userService: UserService, sessionService: SessionService, config: BackendConfig) {
  const app = new Hono();

  /** POST /auth/register — create account. */
  app.post("/auth/register", async (c) => {
    const body = await c.req.json<{ email: string; password: string; name: string; handle?: string }>();
    const user = await userService.register(body.email, body.password, body.name, body.handle);
    const tokens = await sessionService.createSession(user);

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken, config.jwtAccessExpiry, config.jwtRefreshExpiry);

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle, avatarUrl: user.avatarUrl, bio: user.bio },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }, 201);
  });

  /** POST /auth/login — authenticate. */
  app.post("/auth/login", async (c) => {
    const body = await c.req.json<{ email: string; password: string }>();
    const user = await userService.authenticate(body.email, body.password);
    const tokens = await sessionService.createSession(user);

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken, config.jwtAccessExpiry, config.jwtRefreshExpiry);

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle, avatarUrl: user.avatarUrl, bio: user.bio },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  /** POST /auth/refresh — rotate refresh token, get new access token. */
  app.post("/auth/refresh", async (c) => {
    // Read refresh token from cookie first, fall back to request body
    let refreshToken = getRefreshTokenFromCookie(c);
    if (!refreshToken) {
      const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({}));
      refreshToken = body.refreshToken ?? null;
    }

    if (!refreshToken) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "refreshToken is required" } },
        400,
      );
    }

    const tokens = await sessionService.refreshSession(
      refreshToken,
      (id) => userService.getById(id),
    );

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken, config.jwtAccessExpiry, config.jwtRefreshExpiry);

    return c.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  /** POST /auth/logout — revoke refresh token. */
  app.post("/auth/logout", async (c) => {
    // Read refresh token from cookie first, fall back to body
    let refreshToken = getRefreshTokenFromCookie(c);
    if (!refreshToken) {
      const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({}));
      refreshToken = body.refreshToken ?? null;
    }

    if (refreshToken) {
      await sessionService.revokeSession(refreshToken);
    }

    clearAuthCookies(c);
    return c.body(null, 204);
  });

  /** GET /auth/check-handle/:handle — handle availability (pre-auth, for signup). */
  app.get("/auth/check-handle/:handle", async (c) => {
    const handle = c.req.param("handle").toLowerCase();
    const available = await userService.isHandleAvailable(handle);
    return c.json({ handle, available });
  });

  return app;
}
