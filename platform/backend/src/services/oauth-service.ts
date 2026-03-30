/**
 * OAuthService — OAuth2/OIDC integration for Google and Microsoft.
 *
 * Handles authorization URL generation, code exchange, user profile extraction,
 * account creation/linking, and provider management.
 */

import { randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { UserService, User } from "./user-service.js";
import { generateHandle } from "./user-service.js";
import type { SessionService, SessionTokens } from "./session-service.js";
import type { BackendConfig } from "../config/schema.js";
import { hashPassword } from "../lib/password.js";
import { ValidationError } from "../api/middleware/error-handler.js";
import { logger } from "../lib/logger.js";

// ── Types ───────────────────────────────────────────────────────────

export type OAuthProvider = "google" | "microsoft";

export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
  rawProfile: Record<string, unknown>;
}

export interface OAuthResult {
  user: User;
  tokens: SessionTokens;
  isNewAccount: boolean;
  isNewLink: boolean;
}

export interface LinkedProvider {
  provider: string;
  providerEmail: string | null;
  createdAt: string;
}

export interface OAuthState {
  csrf: string;
  redirect: string;
  provider: string;
}

interface OAuthAccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  provider_email: string | null;
  avatar_url: string | null;
  raw_profile: string | null;
  created_at: string;
  updated_at: string;
}

// ── Provider constants ──────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";
const MICROSOFT_GRAPH_PHOTO_URL = "https://graph.microsoft.com/v1.0/me/photo/$value";

// ── Service ─────────────────────────────────────────────────────────

export class OAuthService {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly config: BackendConfig,
    /** Injectable fetch for testing. */
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  /** Returns the list of OAuth providers that have credentials configured. */
  getEnabledProviders(): OAuthProvider[] {
    const providers: OAuthProvider[] = [];
    if (this.config.oauthGoogleClientId && this.config.oauthGoogleClientSecret) {
      providers.push("google");
    }
    if (this.config.oauthMicrosoftClientId && this.config.oauthMicrosoftClientSecret) {
      providers.push("microsoft");
    }
    return providers;
  }

  /** Generate a cryptographically random state value for CSRF protection. */
  generateState(redirect: string, provider: OAuthProvider): { state: string; csrf: string } {
    const csrf = randomBytes(32).toString("base64url");
    const stateObj: OAuthState = { csrf, redirect, provider };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");
    return { state, csrf };
  }

  /** Decode and validate a state parameter. Returns null if invalid. */
  decodeState(stateParam: string): OAuthState | null {
    try {
      const json = Buffer.from(stateParam, "base64url").toString("utf-8");
      const parsed = JSON.parse(json) as OAuthState;
      if (!parsed.csrf || !parsed.provider) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Build the authorization redirect URL for a provider. */
  getAuthorizationUrl(provider: OAuthProvider, state: string): string {
    if (provider === "google") {
      const params = new URLSearchParams({
        client_id: this.config.oauthGoogleClientId,
        redirect_uri: `${this.config.oauthRedirectBaseUrl}/auth/oauth/google/callback`,
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "offline",
        prompt: "select_account",
      });
      return `${GOOGLE_AUTH_URL}?${params}`;
    }

    // Microsoft
    const params = new URLSearchParams({
      client_id: this.config.oauthMicrosoftClientId,
      redirect_uri: `${this.config.oauthRedirectBaseUrl}/auth/oauth/microsoft/callback`,
      response_type: "code",
      scope: "openid email profile User.Read",
      state,
      prompt: "select_account",
    });
    return `${MICROSOFT_AUTH_URL}?${params}`;
  }

  /**
   * Exchange an authorization code for an OAuth profile.
   * Makes HTTP calls to the provider's token and userinfo endpoints.
   */
  async exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
    if (provider === "google") {
      return this.exchangeGoogleCode(code);
    }
    return this.exchangeMicrosoftCode(code);
  }

  /**
   * Find or create a user from an OAuth profile, link accounts, and create a session.
   */
  async authenticateWithOAuth(profile: OAuthProfile): Promise<OAuthResult> {
    // 1. Check if this provider+providerUserId is already linked
    const existingLink = await this.db.queryOne<OAuthAccountRow>(
      "SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?",
      [profile.provider, profile.providerUserId],
    );

    if (existingLink) {
      // Already linked — just log in
      const user = await this.userService.getByIdOrThrow(existingLink.user_id);
      const tokens = await this.sessionService.createSession(user);
      // Update avatar if provider has one and user doesn't
      if (profile.avatarUrl && !user.avatarUrl) {
        await this.userService.updateProfile(user.id, { avatarUrl: profile.avatarUrl });
      }
      return { user, tokens, isNewAccount: false, isNewLink: false };
    }

    // 2. No existing link — require verified email
    if (!profile.emailVerified) {
      throw new ValidationError("Email from OAuth provider is not verified. Cannot proceed.");
    }

    // 3. Check if email matches an existing user
    const existingUser = await this.userService.getByEmail(profile.email);

    if (existingUser) {
      // Link to existing account
      await this.createOAuthAccount(existingUser.id, profile);
      // Mark email as verified (provider confirmed it)
      await this.db.run(
        "UPDATE users SET email_verified = ? WHERE id = ?",
        [true, existingUser.id],
      );
      // Set avatar if user doesn't have one
      if (profile.avatarUrl && !existingUser.avatarUrl) {
        await this.userService.updateProfile(existingUser.id, { avatarUrl: profile.avatarUrl });
      }
      const user = await this.userService.getByIdOrThrow(existingUser.id);
      const tokens = await this.sessionService.createSession(user);
      return { user, tokens, isNewAccount: false, isNewLink: true };
    }

    // 4. Brand new user — create account
    const user = await this.createSocialUser(profile);
    await this.createOAuthAccount(user.id, profile);
    const tokens = await this.sessionService.createSession(user);
    return { user, tokens, isNewAccount: true, isNewLink: true };
  }

  /** List OAuth providers linked to a user. */
  async getLinkedProviders(userId: string): Promise<LinkedProvider[]> {
    const rows = await this.db.query<OAuthAccountRow>(
      "SELECT * FROM oauth_accounts WHERE user_id = ? ORDER BY created_at",
      [userId],
    );
    return rows.map((row) => ({
      provider: row.provider,
      providerEmail: row.provider_email,
      createdAt: row.created_at,
    }));
  }

  /**
   * Unlink an OAuth provider from a user.
   * Only allowed if the user has another auth method (password or another provider).
   */
  async unlinkProvider(userId: string, provider: string): Promise<void> {
    const links = await this.getLinkedProviders(userId);
    const hasOtherProvider = links.some((l) => l.provider !== provider);

    // Check if user has a password (non-empty hash that isn't a social placeholder)
    // We can't easily distinguish, so check if they have other providers
    if (!hasOtherProvider && links.length <= 1) {
      throw new ValidationError("Cannot unlink the only authentication method. Add a password or link another provider first.");
    }

    await this.db.run(
      "DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?",
      [userId, provider],
    );
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async exchangeGoogleCode(code: string): Promise<OAuthProfile> {
    const tokenRes = await this.fetchFn(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.oauthGoogleClientId,
        client_secret: this.config.oauthGoogleClientSecret,
        redirect_uri: `${this.config.oauthRedirectBaseUrl}/auth/oauth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      logger.error("Google token exchange failed", { status: tokenRes.status, body: text });
      throw new ValidationError("Failed to exchange authorization code with Google");
    }

    const tokenData = await tokenRes.json() as { id_token?: string; access_token?: string };
    if (!tokenData.id_token) {
      throw new ValidationError("Google did not return an ID token");
    }

    // Decode the JWT payload (no verification needed — we just received it over HTTPS from Google)
    const payload = decodeJwtPayload(tokenData.id_token);

    return {
      provider: "google",
      providerUserId: payload.sub as string,
      email: payload.email as string,
      emailVerified: payload.email_verified === true,
      name: (payload.name as string) || (payload.email as string),
      avatarUrl: (payload.picture as string) || null,
      rawProfile: payload,
    };
  }

  private async exchangeMicrosoftCode(code: string): Promise<OAuthProfile> {
    // Exchange code for tokens
    const tokenRes = await this.fetchFn(MICROSOFT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.oauthMicrosoftClientId,
        client_secret: this.config.oauthMicrosoftClientSecret,
        redirect_uri: `${this.config.oauthRedirectBaseUrl}/auth/oauth/microsoft/callback`,
        grant_type: "authorization_code",
        scope: "openid email profile User.Read",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      logger.error("Microsoft token exchange failed", { status: tokenRes.status, body: text });
      throw new ValidationError("Failed to exchange authorization code with Microsoft");
    }

    const tokenData = await tokenRes.json() as { access_token: string; id_token?: string };

    // Fetch user profile from Microsoft Graph
    const profileRes = await this.fetchFn(MICROSOFT_GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      throw new ValidationError("Failed to fetch Microsoft user profile");
    }

    const profile = await profileRes.json() as {
      id: string;
      displayName: string;
      mail: string | null;
      userPrincipalName: string;
    };

    // Try to get avatar (may 404)
    let avatarUrl: string | null = null;
    try {
      const photoRes = await this.fetchFn(MICROSOFT_GRAPH_PHOTO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (photoRes.ok) {
        const blob = await photoRes.arrayBuffer();
        const contentType = photoRes.headers.get("Content-Type") ?? "image/jpeg";
        avatarUrl = `data:${contentType};base64,${Buffer.from(blob).toString("base64")}`;
      }
    } catch {
      // Photo not available — not an error
    }

    // Determine email — prefer mail, fallback to userPrincipalName
    const email = profile.mail || profile.userPrincipalName;

    // Determine email verification from the id_token's explicit claim only.
    // Do NOT assume email is verified just because Microsoft Graph returns it —
    // the mail field presence does not guarantee verification. If no id_token
    // or the claim is absent/false, the user goes through our own verification.
    let emailVerified = false;
    if (tokenData.id_token) {
      try {
        const idPayload = decodeJwtPayload(tokenData.id_token);
        if (idPayload.email_verified === true || idPayload.email_verified === "true") {
          emailVerified = true;
        }
      } catch {
        // id_token decode failure — email remains unverified
      }
    }

    return {
      provider: "microsoft",
      providerUserId: profile.id,
      email,
      emailVerified,
      name: profile.displayName || email,
      avatarUrl,
      rawProfile: profile as unknown as Record<string, unknown>,
    };
  }

  /** Create a new user from a social login profile (no password). */
  private async createSocialUser(profile: OAuthProfile): Promise<User> {
    const id = uuidv7();
    // Generate an unrecoverable password hash — social-only users cannot log in with password
    const randomPassword = randomBytes(64).toString("base64url");
    const passwordHash = await hashPassword(randomPassword);
    const handleBase = generateHandle(profile.name);
    const handle = handleBase.length >= 3
      ? await this.userService.findUniqueHandle(handleBase)
      : await this.userService.findUniqueHandle(`user-${uuidv7().slice(0, 8)}`);
    const createdAt = new Date().toISOString();

    await this.db.run(
      "INSERT INTO users (id, email, password_hash, name, handle, avatar_url, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, profile.email.toLowerCase(), passwordHash, profile.name, handle, profile.avatarUrl, true, createdAt],
    );

    return {
      id,
      email: profile.email.toLowerCase(),
      name: profile.name,
      handle,
      avatarUrl: profile.avatarUrl,
      bio: "",
      locale: "en",
      createdAt,
      status: "active",
      emailVerified: true,
    };
  }

  /** Create an oauth_accounts row linking a provider to a user. */
  private async createOAuthAccount(userId: string, profile: OAuthProfile): Promise<void> {
    const id = uuidv7();
    await this.db.run(
      "INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, provider_email, avatar_url, raw_profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        userId,
        profile.provider,
        profile.providerUserId,
        profile.email,
        profile.avatarUrl,
        JSON.stringify(profile.rawProfile),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
  }
}

// ── JWT decode utility (no verification — used for provider-issued tokens) ──

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const payload = Buffer.from(parts[1]!, "base64url").toString("utf-8");
  return JSON.parse(payload) as Record<string, unknown>;
}
