/**
 * OAuth integration tests — social login flows, account linking, provider management.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestBackend, TEST_PASSWORD, type TestBackend } from "./helpers.js";
import { OAuthService, type OAuthProfile } from "../src/services/oauth-service.js";

let backend: TestBackend;

beforeEach(async () => {
  backend = await createTestBackend();
});

afterEach(() => {
  backend.cleanup();
});

// ── OAuthService unit-level tests ───────────────────────────────────

describe("OAuthService", () => {
  function createOAuthService(): OAuthService {
    return new OAuthService(
      backend.db,
      backend.userService,
      backend.sessionService,
      {
        oauthGoogleClientId: "google-id",
        oauthGoogleClientSecret: "google-secret",
        oauthMicrosoftClientId: "ms-id",
        oauthMicrosoftClientSecret: "ms-secret",
        oauthRedirectBaseUrl: "http://localhost:4000",
        oauthFrontendUrl: "http://localhost:5173",
      } as Parameters<typeof OAuthService.prototype.getEnabledProviders>[0] extends never ? never : unknown as ConstructorParameters<typeof OAuthService>[3],
    );
  }

  describe("getEnabledProviders", () => {
    it("returns providers with credentials configured", () => {
      const service = createOAuthService();
      expect(service.getEnabledProviders()).toEqual(["google", "microsoft"]);
    });

    it("excludes providers without credentials", () => {
      const service = new OAuthService(
        backend.db,
        backend.userService,
        backend.sessionService,
        {
          oauthGoogleClientId: "google-id",
          oauthGoogleClientSecret: "google-secret",
          oauthMicrosoftClientId: "",
          oauthMicrosoftClientSecret: "",
          oauthRedirectBaseUrl: "http://localhost:4000",
          oauthFrontendUrl: "http://localhost:5173",
        } as ConstructorParameters<typeof OAuthService>[3],
      );
      expect(service.getEnabledProviders()).toEqual(["google"]);
    });

    it("returns empty when no providers configured", () => {
      const service = new OAuthService(
        backend.db,
        backend.userService,
        backend.sessionService,
        {
          oauthGoogleClientId: "",
          oauthGoogleClientSecret: "",
          oauthMicrosoftClientId: "",
          oauthMicrosoftClientSecret: "",
          oauthRedirectBaseUrl: "http://localhost:4000",
          oauthFrontendUrl: "http://localhost:5173",
        } as ConstructorParameters<typeof OAuthService>[3],
      );
      expect(service.getEnabledProviders()).toEqual([]);
    });
  });

  describe("state management", () => {
    it("generates and decodes state correctly", () => {
      const service = createOAuthService();
      const { state, csrf } = service.generateState("/invite/abc", "google");
      expect(state).toBeTruthy();
      expect(csrf).toBeTruthy();

      const decoded = service.decodeState(state);
      expect(decoded).not.toBeNull();
      expect(decoded!.csrf).toBe(csrf);
      expect(decoded!.redirect).toBe("/invite/abc");
      expect(decoded!.provider).toBe("google");
    });

    it("returns null for invalid state", () => {
      const service = createOAuthService();
      expect(service.decodeState("not-valid-base64url")).toBeNull();
      expect(service.decodeState("")).toBeNull();
    });
  });

  describe("getAuthorizationUrl", () => {
    it("returns Google auth URL with correct params", () => {
      const service = createOAuthService();
      const url = service.getAuthorizationUrl("google", "test-state");
      expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=google-id");
      expect(url).toContain("state=test-state");
      expect(url).toContain("scope=openid+email+profile");
    });

    it("returns Microsoft auth URL with correct params", () => {
      const service = createOAuthService();
      const url = service.getAuthorizationUrl("microsoft", "test-state");
      expect(url).toContain("login.microsoftonline.com/common/oauth2/v2.0/authorize");
      expect(url).toContain("client_id=ms-id");
      expect(url).toContain("state=test-state");
    });
  });

  describe("authenticateWithOAuth", () => {
    const googleProfile: OAuthProfile = {
      provider: "google",
      providerUserId: "google-123",
      email: "alice@example.com",
      emailVerified: true,
      name: "Alice Johnson",
      avatarUrl: "https://lh3.googleusercontent.com/photo",
      rawProfile: { sub: "google-123" },
    };

    it("creates new user for new email", async () => {
      const service = createOAuthService();
      const result = await service.authenticateWithOAuth(googleProfile);

      expect(result.isNewAccount).toBe(true);
      expect(result.isNewLink).toBe(true);
      expect(result.user.email).toBe("alice@example.com");
      expect(result.user.name).toBe("Alice Johnson");
      expect(result.user.avatarUrl).toBe("https://lh3.googleusercontent.com/photo");
      expect(result.user.emailVerified).toBe(true);
      expect(result.user.handle).toBeTruthy();
      expect(result.tokens.accessToken).toBeTruthy();
      expect(result.tokens.refreshToken).toBeTruthy();
    });

    it("links to existing user with matching email", async () => {
      const service = createOAuthService();
      // Register a user first
      await backend.userService.register("alice@example.com", TEST_PASSWORD, "Alice Johnson");

      const result = await service.authenticateWithOAuth(googleProfile);

      expect(result.isNewAccount).toBe(false);
      expect(result.isNewLink).toBe(true);
      expect(result.user.email).toBe("alice@example.com");
      expect(result.user.emailVerified).toBe(true);
    });

    it("returns existing link without creating a new one", async () => {
      const service = createOAuthService();
      // First login creates user + link
      const first = await service.authenticateWithOAuth(googleProfile);

      // Second login reuses existing link
      const second = await service.authenticateWithOAuth(googleProfile);

      expect(second.isNewAccount).toBe(false);
      expect(second.isNewLink).toBe(false);
      expect(second.user.id).toBe(first.user.id);
    });

    it("allows linking multiple providers to the same user", async () => {
      const service = createOAuthService();
      // Link Google first
      const googleResult = await service.authenticateWithOAuth(googleProfile);

      // Link Microsoft with same email
      const msProfile: OAuthProfile = {
        provider: "microsoft",
        providerUserId: "ms-456",
        email: "alice@example.com",
        emailVerified: true,
        name: "Alice Johnson",
        avatarUrl: null,
        rawProfile: { id: "ms-456" },
      };
      const msResult = await service.authenticateWithOAuth(msProfile);

      expect(msResult.user.id).toBe(googleResult.user.id);
      expect(msResult.isNewAccount).toBe(false);
      expect(msResult.isNewLink).toBe(true);

      // Verify both providers are linked
      const linked = await service.getLinkedProviders(googleResult.user.id);
      expect(linked).toHaveLength(2);
      expect(linked.map((l) => l.provider).sort()).toEqual(["google", "microsoft"]);
    });

    it("rejects unverified email", async () => {
      const service = createOAuthService();
      const unverifiedProfile: OAuthProfile = {
        ...googleProfile,
        emailVerified: false,
      };

      await expect(service.authenticateWithOAuth(unverifiedProfile)).rejects.toThrow("not verified");
    });

    it("sets avatar on existing user if they don't have one", async () => {
      const service = createOAuthService();
      await backend.userService.register("bob@example.com", TEST_PASSWORD, "Bob Smith");

      const profile: OAuthProfile = {
        provider: "google",
        providerUserId: "google-bob",
        email: "bob@example.com",
        emailVerified: true,
        name: "Bob Smith",
        avatarUrl: "https://photo.example.com/bob.jpg",
        rawProfile: {},
      };

      const result = await service.authenticateWithOAuth(profile);
      // Re-fetch to get updated avatar
      const user = await backend.userService.getByIdOrThrow(result.user.id);
      expect(user.avatarUrl).toBe("https://photo.example.com/bob.jpg");
    });

    it("does not overwrite existing avatar", async () => {
      const service = createOAuthService();
      const registered = await backend.userService.register("carol@example.com", TEST_PASSWORD, "Carol Davis");
      await backend.userService.updateProfile(registered.id, { avatarUrl: "https://custom.example.com/carol.jpg" });

      const profile: OAuthProfile = {
        provider: "google",
        providerUserId: "google-carol",
        email: "carol@example.com",
        emailVerified: true,
        name: "Carol Davis",
        avatarUrl: "https://google.example.com/carol.jpg",
        rawProfile: {},
      };

      await service.authenticateWithOAuth(profile);
      const user = await backend.userService.getByIdOrThrow(registered.id);
      expect(user.avatarUrl).toBe("https://custom.example.com/carol.jpg");
    });

    it("generates unique handle for social user", async () => {
      const service = createOAuthService();
      // Create two users with the same name
      const first = await service.authenticateWithOAuth(googleProfile);
      const secondProfile: OAuthProfile = {
        ...googleProfile,
        providerUserId: "google-456",
        email: "alice2@example.com",
      };
      const second = await service.authenticateWithOAuth(secondProfile);

      expect(first.user.handle).toBeTruthy();
      expect(second.user.handle).toBeTruthy();
      expect(first.user.handle).not.toBe(second.user.handle);
    });
  });

  describe("unlinkProvider", () => {
    it("unlinks a provider when user has multiple", async () => {
      const service = createOAuthService();
      // Link both providers
      await service.authenticateWithOAuth({
        provider: "google",
        providerUserId: "g-1",
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
        avatarUrl: null,
        rawProfile: {},
      });
      await service.authenticateWithOAuth({
        provider: "microsoft",
        providerUserId: "ms-1",
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
        avatarUrl: null,
        rawProfile: {},
      });

      const userId = (await backend.userService.getByEmail("test@example.com"))!.id;
      await service.unlinkProvider(userId, "google");

      const linked = await service.getLinkedProviders(userId);
      expect(linked).toHaveLength(1);
      expect(linked[0]!.provider).toBe("microsoft");
    });

    it("rejects unlinking the only provider", async () => {
      const service = createOAuthService();
      const result = await service.authenticateWithOAuth({
        provider: "google",
        providerUserId: "g-only",
        email: "solo@example.com",
        emailVerified: true,
        name: "Solo User",
        avatarUrl: null,
        rawProfile: {},
      });

      await expect(service.unlinkProvider(result.user.id, "google")).rejects.toThrow("Cannot unlink");
    });
  });
});

// ── OAuth API routes ────────────────────────────────────────────────

describe("OAuth API routes", () => {
  it("GET /auth/oauth/providers returns empty when not configured", async () => {
    const res = await backend.request("GET", "/auth/oauth/providers");
    expect(res.status).toBe(200);
    const data = await res.json() as { providers: string[] };
    expect(data.providers).toEqual([]);
  });

  it("GET /auth/oauth/linked requires authentication", async () => {
    const res = await backend.request("GET", "/me/oauth/linked");
    expect(res.status).toBe(401);
  });

  it("GET /auth/oauth/linked returns empty for new user", async () => {
    const { accessToken } = await backend.registerAndLogin("user@test.com", TEST_PASSWORD, "Test User");
    const res = await backend.request("GET", "/me/oauth/linked", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { providers: unknown[] };
    expect(data.providers).toEqual([]);
  });

  it("DELETE /auth/oauth/linked/:provider requires authentication", async () => {
    const res = await backend.request("DELETE", "/me/oauth/linked/google");
    expect(res.status).toBe(401);
  });
});
