/**
 * Auth flow integration tests — register, login, refresh, logout.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestBackend, TEST_PASSWORD, type TestBackend } from "./helpers.js";

describe("Auth flow", () => {
  let backend: TestBackend;

  beforeEach(async () => {
    backend = await createTestBackend();
  });

  afterEach(() => {
    backend.cleanup();
  });

  describe("POST /auth/register", () => {
    it("creates a user and returns tokens", async () => {
      const res = await backend.request("POST", "/auth/register", {
        email: "alice@example.com",
        password: TEST_PASSWORD,
        name: "Alice",
      });
      expect(res.status).toBe(201);
      const data = await res.json() as Record<string, unknown>;
      expect(data).toHaveProperty("accessToken");
      expect(data).toHaveProperty("refreshToken");
      expect(data).toHaveProperty("user");
      const user = data.user as Record<string, unknown>;
      expect(user.email).toBe("alice@example.com");
      expect(user.name).toBe("Alice");
      expect(user).toHaveProperty("id");
    });

    it("rejects duplicate email", async () => {
      await backend.request("POST", "/auth/register", {
        email: "alice@example.com",
        password: TEST_PASSWORD,
        name: "Alice",
      });
      const res = await backend.request("POST", "/auth/register", {
        email: "alice@example.com",
        password: TEST_PASSWORD,
        name: "Alice 2",
      });
      expect(res.status).toBe(409);
    });

    it("normalizes email to lowercase", async () => {
      const res = await backend.request("POST", "/auth/register", {
        email: "Alice@Example.COM",
        password: TEST_PASSWORD,
        name: "Alice",
      });
      expect(res.status).toBe(201);
      const data = await res.json() as { user: { email: string } };
      expect(data.user.email).toBe("alice@example.com");
    });

    it("rejects short password", async () => {
      const res = await backend.request("POST", "/auth/register", {
        email: "alice@example.com",
        password: "12345",
        name: "Alice",
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing name", async () => {
      const res = await backend.request("POST", "/auth/register", {
        email: "alice@example.com",
        password: TEST_PASSWORD,
        name: "",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /auth/login", () => {
    beforeEach(async () => {
      await backend.request("POST", "/auth/register", {
        email: "alice@example.com",
        password: TEST_PASSWORD,
        name: "Alice",
      });
    });

    it("authenticates with correct credentials", async () => {
      const res = await backend.request("POST", "/auth/login", {
        email: "alice@example.com",
        password: TEST_PASSWORD,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data).toHaveProperty("accessToken");
      expect(data).toHaveProperty("refreshToken");
    });

    it("rejects wrong password", async () => {
      const res = await backend.request("POST", "/auth/login", {
        email: "alice@example.com",
        password: "wrong",
      });
      expect(res.status).toBe(401);
    });

    it("rejects unknown email", async () => {
      const res = await backend.request("POST", "/auth/login", {
        email: "nobody@example.com",
        password: TEST_PASSWORD,
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    it("rotates refresh token and returns new access token", async () => {
      const { refreshToken } = await backend.registerAndLogin("alice@example.com", TEST_PASSWORD, "Alice");

      const res = await backend.request("POST", "/auth/refresh", { refreshToken });
      expect(res.status).toBe(200);
      const data = await res.json() as { accessToken: string; refreshToken: string };
      expect(data.accessToken).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();
      // New refresh token should be different (rotation)
      expect(data.refreshToken).not.toBe(refreshToken);
    });

    it("rejects reused (rotated) refresh token", async () => {
      const { refreshToken } = await backend.registerAndLogin("alice@example.com", TEST_PASSWORD, "Alice");

      // First refresh succeeds
      const res1 = await backend.request("POST", "/auth/refresh", { refreshToken });
      expect(res1.status).toBe(200);

      // Second refresh with same token fails (it was rotated)
      const res2 = await backend.request("POST", "/auth/refresh", { refreshToken });
      expect(res2.status).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("revokes refresh token", async () => {
      const { refreshToken } = await backend.registerAndLogin("alice@example.com", TEST_PASSWORD, "Alice");

      const res = await backend.request("POST", "/auth/logout", { refreshToken });
      expect(res.status).toBe(204);

      // Refresh with revoked token should fail
      const refreshRes = await backend.request("POST", "/auth/refresh", { refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });

  describe("Protected routes", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await backend.request("GET", "/me");
      expect(res.status).toBe(401);
    });

    it("accepts valid access token", async () => {
      const { accessToken } = await backend.registerAndLogin("alice@example.com", TEST_PASSWORD, "Alice");
      const res = await backend.request("GET", "/me", undefined, {
        Authorization: `Bearer ${accessToken}`,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { email: string };
      expect(data.email).toBe("alice@example.com");
    });
  });
});
