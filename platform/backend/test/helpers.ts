/**
 * Test helpers — creates an in-process backend for integration testing.
 */

import { Hono } from "hono";
import { SQLiteAdapter } from "../src/adapters/database/sqlite.js";
import { UserService } from "../src/services/user-service.js";
import { SessionService } from "../src/services/session-service.js";
import { MembershipService } from "../src/services/membership-service.js";
import { VCPClient } from "../src/services/vcp-client.js";
import { NotificationService } from "../src/services/notification-service.js";
import { ConsoleNotificationAdapter } from "../src/services/notification-adapter.js";
import { createApp } from "../src/api/server.js";
import type { BackendConfig } from "../src/config/schema.js";

const TEST_JWT_SECRET = "test-secret-for-tests-only";

const TEST_CONFIG: BackendConfig = {
  port: 0,
  dbPath: ":memory:",
  databaseUrl: null,
  jwtSecret: TEST_JWT_SECRET,
  jwtAccessExpiry: "1h",
  jwtRefreshExpiry: "30d",
  vcpBaseUrl: "http://localhost:3000",
  vcpApiKey: "test_key",
  logLevel: "error",
  corsOrigins: ["*"],
  rateLimitRpm: 0,
  maxBodySize: 1024 * 1024,
  notificationAdapter: "console",
  notificationIntervalMs: 60000,
  notificationFileDir: "./test-notifications",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
};

export interface TestBackend {
  app: Hono;
  db: SQLiteAdapter;
  userService: UserService;
  sessionService: SessionService;
  cleanup: () => void;
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: () => Promise<unknown> }>;
  /** Register a user and return the access token. */
  registerAndLogin: (email: string, password: string, name: string) => Promise<{ accessToken: string; refreshToken: string; userId: string }>;
}

export async function createTestBackend(): Promise<TestBackend> {
  const db = new SQLiteAdapter(":memory:");
  await db.initialize();

  const userService = new UserService(db);
  const sessionService = new SessionService(db, TEST_JWT_SECRET, "1h", "30d");
  const vcpClient = new VCPClient(TEST_CONFIG.vcpBaseUrl, TEST_CONFIG.vcpApiKey);
  const membershipService = new MembershipService(db, vcpClient);
  const notificationAdapter = new ConsoleNotificationAdapter();
  const notificationService = new NotificationService(db, notificationAdapter, vcpClient, TEST_CONFIG.vcpBaseUrl);

  const app = createApp({ database: db, userService, sessionService, membershipService, notificationService, config: TEST_CONFIG });

  const cleanup = () => {
    void db.close();
  };

  const request = async (method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const req = new Request(`http://localhost${path}`, init);
    const res = await app.fetch(req);
    return {
      status: res.status,
      json: () => res.json(),
    };
  };

  const registerAndLogin = async (email: string, password: string, name: string) => {
    const res = await request("POST", "/auth/register", { email, password, name });
    const data = await res.json() as { user: { id: string }; accessToken: string; refreshToken: string };
    return { accessToken: data.accessToken, refreshToken: data.refreshToken, userId: data.user.id };
  };

  return { app, db, userService, sessionService, cleanup, request, registerAndLogin };
}
