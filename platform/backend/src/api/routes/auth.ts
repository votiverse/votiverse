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
import type { NotificationAdapter } from "../../services/notification-adapter.js";
import { setAuthCookies, clearAuthCookies, getRefreshTokenFromCookie } from "../../lib/cookies.js";
import { RegisterBody, LoginBody, RefreshBody, parseBody } from "../../lib/validation.js";
import { renderTemplate } from "../../services/notification-templates.js";
import { getUser } from "../middleware/auth.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ component: "auth" });

export function authRoutes(
  userService: UserService,
  sessionService: SessionService,
  config: BackendConfig,
  notificationAdapter?: NotificationAdapter,
) {
  const app = new Hono();

  /** POST /auth/register — create account. */
  app.post("/auth/register", async (c) => {
    const body = parseBody(RegisterBody, await c.req.json());
    const user = await userService.register(body.email, body.password, body.name, body.handle);
    const tokens = await sessionService.createSession(user);

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken, config.jwtAccessExpiry, config.jwtRefreshExpiry);

    // Send verification email (fire-and-forget)
    if (notificationAdapter) {
      const verificationToken = await userService.createVerificationToken(user.id);
      void sendVerificationEmail(notificationAdapter, user.email, verificationToken, config).catch((err) => {
        log.error("Failed to send verification email", { error: String(err) });
      });
    }

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle, avatarUrl: user.avatarUrl, bio: user.bio, emailVerified: user.emailVerified },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }, 201);
  });

  /** POST /auth/login — authenticate. */
  app.post("/auth/login", async (c) => {
    const body = parseBody(LoginBody, await c.req.json());
    const user = await userService.authenticate(body.email, body.password);
    const tokens = await sessionService.createSession(user);

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken, config.jwtAccessExpiry, config.jwtRefreshExpiry);

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle, avatarUrl: user.avatarUrl, bio: user.bio, emailVerified: user.emailVerified },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  /** POST /auth/refresh — rotate refresh token, get new access token. */
  app.post("/auth/refresh", async (c) => {
    // Read refresh token from cookie first, fall back to request body
    let refreshToken = getRefreshTokenFromCookie(c);
    if (!refreshToken) {
      const body = parseBody(RefreshBody, await c.req.json().catch(() => ({})));
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
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : null;
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

  /** POST /auth/verify — verify email address with token. */
  app.post("/auth/verify", async (c) => {
    const body = await c.req.json() as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : null;
    if (!token) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "token is required" } },
        400,
      );
    }
    const user = await userService.verifyEmail(token);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle, emailVerified: user.emailVerified },
    });
  });

  /** POST /auth/resend-verification — resend verification email (authenticated). */
  app.post("/auth/resend-verification", async (c) => {
    const authUser = getUser(c);
    const user = await userService.getById(authUser.id);
    if (!user) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }
    if (user.emailVerified) {
      return c.json({ status: "already_verified" });
    }

    if (notificationAdapter) {
      const verificationToken = await userService.createVerificationToken(user.id);
      void sendVerificationEmail(notificationAdapter, user.email, verificationToken, config).catch((err) => {
        log.error("Failed to send verification email", { error: String(err) });
      });
    }

    return c.json({ status: "sent" });
  });

  /** POST /auth/forgot-password — request a password reset email. */
  app.post("/auth/forgot-password", async (c) => {
    const body = await c.req.json() as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email : null;
    if (!email) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "email is required" } },
        400,
      );
    }

    const result = await userService.createResetToken(email);

    // Always return success to prevent email enumeration
    if (result && notificationAdapter) {
      void sendPasswordResetEmail(notificationAdapter, email, result.token, config).catch((err) => {
        log.error("Failed to send password reset email", { error: String(err) });
      });
    }

    return c.json({ status: "sent" });
  });

  /** POST /auth/reset-password — reset password with token. */
  app.post("/auth/reset-password", async (c) => {
    const body = await c.req.json() as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : null;
    const newPassword = typeof body.password === "string" ? body.password : null;
    if (!token || !newPassword) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "token and password are required" } },
        400,
      );
    }

    const user = await userService.resetPassword(token, newPassword);

    // Revoke all existing sessions — forces re-login with new password
    await sessionService.revokeAllSessions(user.id);

    return c.json({ status: "reset" });
  });

  return app;
}

async function sendVerificationEmail(
  adapter: NotificationAdapter,
  email: string,
  token: string,
  config: BackendConfig,
): Promise<void> {
  const baseUrl = config.corsOrigins[0] ?? "http://localhost:5173";
  const verifyUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
  const { subject, body, bodyHtml } = renderTemplate("email_verification", {
    assemblyName: "Votiverse",
    title: "Verify your email",
    baseUrl: verifyUrl,
  });
  await adapter.send({ to: email, subject, body, bodyHtml });
}

async function sendPasswordResetEmail(
  adapter: NotificationAdapter,
  email: string,
  token: string,
  config: BackendConfig,
): Promise<void> {
  const baseUrl = config.corsOrigins[0] ?? "http://localhost:5173";
  const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const { subject, body, bodyHtml } = renderTemplate("password_reset", {
    assemblyName: "Votiverse",
    title: "Reset your password",
    baseUrl: resetUrl,
  });
  await adapter.send({ to: email, subject, body, bodyHtml });
}
