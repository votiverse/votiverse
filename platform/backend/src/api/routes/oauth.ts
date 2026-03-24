/**
 * OAuth routes — social login with Google and Microsoft.
 *
 * Flow: frontend link → GET /auth/oauth/:provider → redirect to provider →
 * provider callback → GET /auth/oauth/:provider/callback → set cookies → redirect to frontend
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { OAuthService, OAuthProvider } from "../../services/oauth-service.js";
import type { BackendConfig } from "../../config/schema.js";
import { setAuthCookies } from "../../lib/cookies.js";
import { getUser } from "../middleware/auth.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ component: "oauth" });

/** Cookie name for OAuth CSRF state. */
const OAUTH_STATE_COOKIE = "oauth_state";

/** State cookie max age in seconds (10 minutes). */
const STATE_COOKIE_MAX_AGE = 600;

export function oauthRoutes(oauthService: OAuthService, config: BackendConfig) {
  const app = new Hono();
  const frontendUrl = config.oauthFrontendUrl;

  /** GET /auth/oauth/providers — list enabled OAuth providers. */
  app.get("/auth/oauth/providers", (c) => {
    return c.json({ providers: oauthService.getEnabledProviders() });
  });

  /** GET /auth/oauth/google — initiate Google OAuth flow. */
  app.get("/auth/oauth/google", (c) => {
    return initiateOAuth(c, oauthService, config, "google");
  });

  /** GET /auth/oauth/google/callback — handle Google OAuth callback. */
  app.get("/auth/oauth/google/callback", async (c) => {
    return handleOAuthCallback(c, oauthService, config, frontendUrl, "google");
  });

  /** GET /auth/oauth/microsoft — initiate Microsoft OAuth flow. */
  app.get("/auth/oauth/microsoft", (c) => {
    return initiateOAuth(c, oauthService, config, "microsoft");
  });

  /** GET /auth/oauth/microsoft/callback — handle Microsoft OAuth callback. */
  app.get("/auth/oauth/microsoft/callback", async (c) => {
    return handleOAuthCallback(c, oauthService, config, frontendUrl, "microsoft");
  });

  /** GET /me/oauth/linked — list providers linked to current user (requires auth). */
  app.get("/me/oauth/linked", async (c) => {
    const user = getUser(c);
    const linked = await oauthService.getLinkedProviders(user.id);
    return c.json({ providers: linked });
  });

  /** DELETE /me/oauth/linked/:provider — unlink a provider (requires auth). */
  app.delete("/me/oauth/linked/:provider", async (c) => {
    const user = getUser(c);
    const provider = c.req.param("provider");
    await oauthService.unlinkProvider(user.id, provider);
    return c.body(null, 204);
  });

  return app;
}

// ── Helpers ─────────────────────────────────────────────────────────

function setStateCookie(c: Context, csrf: string): void {
  const secure = process.env["NODE_ENV"] === "production";
  const parts = [
    `${OAUTH_STATE_COOKIE}=${csrf}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/oauth",
    `Max-Age=${STATE_COOKIE_MAX_AGE}`,
  ];
  if (secure) parts.push("Secure");
  c.header("Set-Cookie", parts.join("; "), { append: true });
}

function clearStateCookie(c: Context): void {
  const secure = process.env["NODE_ENV"] === "production";
  const parts = [
    `${OAUTH_STATE_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/oauth",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  c.header("Set-Cookie", parts.join("; "), { append: true });
}

function initiateOAuth(
  c: Context,
  oauthService: OAuthService,
  _config: BackendConfig,
  provider: OAuthProvider,
): Response {
  // Validate redirect URL — must be relative (starts with /) to prevent open redirect
  const redirect = c.req.query("redirect") || "/";
  const safeRedirect = redirect.startsWith("/") ? redirect : "/";

  const { state, csrf } = oauthService.generateState(safeRedirect, provider);
  setStateCookie(c, csrf);

  const authUrl = oauthService.getAuthorizationUrl(provider, state);
  return c.redirect(authUrl, 302);
}

async function handleOAuthCallback(
  c: Context,
  oauthService: OAuthService,
  config: BackendConfig,
  frontendUrl: string,
  provider: OAuthProvider,
): Promise<Response> {
  try {
    // Check for provider error (user cancelled, etc.)
    const error = c.req.query("error");
    if (error) {
      const errorDesc = c.req.query("error_description") || error;
      log.warn("OAuth provider returned error", { provider, error, errorDesc });
      return c.redirect(`${frontendUrl}/login?oauth_error=${encodeURIComponent(errorDesc)}`, 302);
    }

    const code = c.req.query("code");
    const stateParam = c.req.query("state");

    if (!code || !stateParam) {
      return c.redirect(`${frontendUrl}/login?oauth_error=${encodeURIComponent("Missing authorization code")}`, 302);
    }

    // Decode state and validate CSRF
    const state = oauthService.decodeState(stateParam);
    if (!state) {
      return c.redirect(`${frontendUrl}/login?oauth_error=${encodeURIComponent("Invalid state parameter")}`, 302);
    }

    // Validate CSRF token against cookie
    const csrfCookie = parseCookie(c.req.header("Cookie"), OAUTH_STATE_COOKIE);
    if (!csrfCookie || csrfCookie !== state.csrf) {
      log.warn("OAuth CSRF mismatch", { provider, hasCookie: !!csrfCookie });
      return c.redirect(`${frontendUrl}/login?oauth_error=${encodeURIComponent("Session expired. Please try again.")}`, 302);
    }

    // Clear state cookie
    clearStateCookie(c);

    // Exchange code for profile
    const profile = await oauthService.exchangeCode(provider, code);

    // Authenticate or create user
    const result = await oauthService.authenticateWithOAuth(profile);

    // Set auth cookies
    setAuthCookies(c, result.tokens.accessToken, result.tokens.refreshToken, config.jwtAccessExpiry, config.jwtRefreshExpiry);

    // Redirect to frontend
    const safeRedirect = state.redirect.startsWith("/") ? state.redirect : "/";
    const separator = safeRedirect.includes("?") ? "&" : "?";
    const redirectUrl = result.isNewAccount
      ? `${frontendUrl}${safeRedirect}${separator}oauth_new=true`
      : `${frontendUrl}${safeRedirect}`;

    return c.redirect(redirectUrl, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth login failed";
    log.error("OAuth callback error", { provider, error: message });
    return c.redirect(`${frontendUrl}/login?oauth_error=${encodeURIComponent(message)}`, 302);
  }
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}
