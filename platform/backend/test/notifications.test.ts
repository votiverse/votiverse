/**
 * Notification system tests — service, preferences, scheduler, proxy interception.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SQLiteAdapter } from "../src/adapters/database/sqlite.js";
import { runMigrations } from "../src/adapters/database/migrator.js";
import { NotificationService } from "../src/services/notification-service.js";
import { GroupService } from "../src/services/group-service.js";
import { VCPClient } from "../src/services/vcp-client.js";
import type { NotificationAdapter, NotificationParams } from "../src/services/notification-adapter.js";
import { createTestBackend, TEST_PASSWORD, type TestBackend } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// ─── Spy adapter for capturing sent notifications ─────────────────

class SpyNotificationAdapter implements NotificationAdapter {
  sent: NotificationParams[] = [];

  async send(params: NotificationParams): Promise<void> {
    this.sent.push(params);
  }

  clear(): void {
    this.sent = [];
  }
}

// ─── Unit tests for NotificationService ───────────────────────────

describe("NotificationService", () => {
  let db: SQLiteAdapter;
  let spy: SpyNotificationAdapter;
  let vcpClient: VCPClient;
  let groupService: GroupService;
  let service: NotificationService;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await runMigrations(db, MIGRATIONS_DIR);
    spy = new SpyNotificationAdapter();
    vcpClient = new VCPClient("http://localhost:3000", "test_key");
    groupService = new GroupService(db);
    service = new NotificationService(db, spy, vcpClient, "http://localhost:5173", groupService);

    // Seed a user
    await db.run(
      "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
      ["u1", "alice@example.com", "hash", "Alice"],
    );

    // Seed a group and membership for recipient resolution
    await groupService.create({
      name: "Test Assembly",
      handle: "test-assembly",
      createdBy: "u1",
    });
    const group = await groupService.getByHandle("test-assembly");
    // Link the group to VCP assembly ID "asm-1"
    await groupService.setVcpAssemblyId(group!.id, "asm-1");
    // Add user as member
    await groupService.addMember(group!.id, "u1", "member", "p1");
  });

  afterEach(async () => {
    await db.close();
  });

  describe("trackEvent", () => {
    it("inserts a tracked event", async () => {
      await service.trackEvent({
        id: "evt-1",
        assemblyId: "asm-1",
        title: "Budget Vote",
        votingStart: "2026-03-20T00:00:00Z",
        votingEnd: "2026-03-25T00:00:00Z",
      });

      const row = await db.queryOne<{ id: string; title: string }>(
        "SELECT id, title FROM tracked_events WHERE id = ?",
        ["evt-1"],
      );
      expect(row).toBeDefined();
      expect(row!.title).toBe("Budget Vote");
    });

    it("is idempotent (duplicate inserts are ignored)", async () => {
      const event = {
        id: "evt-1",
        assemblyId: "asm-1",
        title: "Budget Vote",
        votingStart: "2026-03-20T00:00:00Z",
        votingEnd: "2026-03-25T00:00:00Z",
      };
      await service.trackEvent(event);
      await service.trackEvent(event);

      const rows = await db.query("SELECT * FROM tracked_events WHERE id = ?", ["evt-1"]);
      expect(rows).toHaveLength(1);
    });
  });

  describe("trackSurvey", () => {
    it("inserts a tracked survey", async () => {
      await service.trackSurvey({
        id: "survey-1",
        assemblyId: "asm-1",
        title: "Community Survey",
        schedule: "2026-03-18T00:00:00Z",
        closesAt: "2026-03-22T00:00:00Z",
      });

      const row = await db.queryOne<{ id: string; title: string }>(
        "SELECT id, title FROM tracked_surveys WHERE id = ?",
        ["survey-1"],
      );
      expect(row).toBeDefined();
      expect(row!.title).toBe("Community Survey");
    });
  });

  describe("preferences", () => {
    it("returns defaults when no preferences are set", async () => {
      const prefs = await service.getPreferences("u1");
      expect(prefs.notify_new_votes).toBe("always");
      expect(prefs.notify_new_surveys).toBe("true");
      expect(prefs.notify_deadlines).toBe("true");
      expect(prefs.notify_results).toBe("false");
      expect(prefs.notify_channel).toBe("email");
    });

    it("sets and retrieves a preference", async () => {
      await service.setPreference("u1", "notify_new_votes", "never");
      const prefs = await service.getPreferences("u1");
      expect(prefs.notify_new_votes).toBe("never");
    });

    it("overwrites an existing preference", async () => {
      await service.setPreference("u1", "notify_deadlines", "false");
      await service.setPreference("u1", "notify_deadlines", "true");
      const prefs = await service.getPreferences("u1");
      expect(prefs.notify_deadlines).toBe("true");
    });

    it("rejects unknown preference keys", async () => {
      await expect(service.setPreference("u1", "unknown_key", "foo")).rejects.toThrow("Unknown preference key");
    });

    it("rejects invalid preference values", async () => {
      await expect(service.setPreference("u1", "notify_new_votes", "invalid")).rejects.toThrow("Invalid value");
    });
  });

  describe("processScheduledNotifications", () => {
    it("sends 'event created' notification and marks flag", async () => {
      await service.trackEvent({
        id: "evt-1",
        assemblyId: "asm-1",
        title: "Budget Vote",
        votingStart: "2099-01-01T00:00:00Z",
        votingEnd: "2099-01-10T00:00:00Z",
      });

      await service.processScheduledNotifications();

      expect(spy.sent).toHaveLength(1);
      expect(spy.sent[0].to).toBe("alice@example.com");
      expect(spy.sent[0].subject).toContain("Budget Vote");

      // Second run should not resend
      spy.clear();
      await service.processScheduledNotifications();
      expect(spy.sent).toHaveLength(0);
    });

    it("sends 'voting open' notification when voting_start is in the past", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 86_400_000 * 7).toISOString();

      await service.trackEvent({
        id: "evt-2",
        assemblyId: "asm-1",
        title: "Open Vote",
        votingStart: past,
        votingEnd: future,
      });

      await service.processScheduledNotifications();

      // Should get both "created" and "voting open" notifications
      const subjects = spy.sent.map((s) => s.subject);
      expect(subjects.some((s) => s.includes("New vote"))).toBe(true);
      expect(subjects.some((s) => s.includes("Voting is open"))).toBe(true);
    });

    it("sends 'deadline approaching' notification when voting_end is within 24h", async () => {
      const past = new Date(Date.now() - 86_400_000 * 2).toISOString();
      const soonEnd = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h from now

      await service.trackEvent({
        id: "evt-3",
        assemblyId: "asm-1",
        title: "Urgent Vote",
        votingStart: past,
        votingEnd: soonEnd,
      });

      await service.processScheduledNotifications();

      const subjects = spy.sent.map((s) => s.subject);
      expect(subjects.some((s) => s.includes("closes tomorrow"))).toBe(true);
    });

    it("sends 'results available' notification when voting_end is in the past", async () => {
      const past = new Date(Date.now() - 86_400_000 * 5).toISOString();
      const pastEnd = new Date(Date.now() - 60_000).toISOString();

      // Set notify_results to true for this test
      await service.setPreference("u1", "notify_results", "true");

      await service.trackEvent({
        id: "evt-4",
        assemblyId: "asm-1",
        title: "Completed Vote",
        votingStart: past,
        votingEnd: pastEnd,
      });

      await service.processScheduledNotifications();

      const subjects = spy.sent.map((s) => s.subject);
      expect(subjects.some((s) => s.includes("Results are in"))).toBe(true);
    });

    it("sends 'survey created' notification for new surveys", async () => {
      await service.trackSurvey({
        id: "survey-1",
        assemblyId: "asm-1",
        title: "Housing Survey",
        schedule: "2099-01-01T00:00:00Z",
        closesAt: "2099-01-10T00:00:00Z",
      });

      await service.processScheduledNotifications();

      expect(spy.sent).toHaveLength(1);
      expect(spy.sent[0].subject).toContain("Housing Survey");
    });

    it("respects notify_channel=none preference (sends nothing)", async () => {
      await service.setPreference("u1", "notify_channel", "none");

      await service.trackEvent({
        id: "evt-5",
        assemblyId: "asm-1",
        title: "Silenced Vote",
        votingStart: "2099-01-01T00:00:00Z",
        votingEnd: "2099-01-10T00:00:00Z",
      });

      await service.processScheduledNotifications();
      expect(spy.sent).toHaveLength(0);
    });

    it("respects notify_new_votes=never preference", async () => {
      await service.setPreference("u1", "notify_new_votes", "never");

      await service.trackEvent({
        id: "evt-6",
        assemblyId: "asm-1",
        title: "Ignored Vote",
        votingStart: "2099-01-01T00:00:00Z",
        votingEnd: "2099-01-10T00:00:00Z",
      });

      await service.processScheduledNotifications();
      expect(spy.sent).toHaveLength(0);
    });

    it("respects notify_new_surveys=false preference", async () => {
      await service.setPreference("u1", "notify_new_surveys", "false");

      await service.trackSurvey({
        id: "survey-2",
        assemblyId: "asm-1",
        title: "Ignored Survey",
        schedule: "2099-01-01T00:00:00Z",
        closesAt: "2099-01-10T00:00:00Z",
      });

      await service.processScheduledNotifications();
      expect(spy.sent).toHaveLength(0);
    });
  });
});

// ─── API endpoint tests (preferences) ────────────────────────────

describe("Notification preference API", () => {
  let backend: TestBackend;
  let accessToken: string;

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("alice@example.com", TEST_PASSWORD, "Alice");
    accessToken = auth.accessToken;
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /me/notifications returns defaults", async () => {
    const res = await backend.request("GET", "/me/notifications", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { preferences: Record<string, string> };
    expect(data.preferences.notify_new_votes).toBe("always");
    expect(data.preferences.notify_channel).toBe("email");
  });

  it("PUT /me/notifications updates a preference", async () => {
    const res = await backend.request(
      "PUT",
      "/me/notifications",
      { key: "notify_new_votes", value: "undelegated_only" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { preferences: Record<string, string> };
    expect(data.preferences.notify_new_votes).toBe("undelegated_only");
  });

  it("PUT /me/notifications rejects invalid key", async () => {
    const res = await backend.request(
      "PUT",
      "/me/notifications",
      { key: "bad_key", value: "true" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(res.status).toBe(400);
  });

  it("PUT /me/notifications rejects invalid value", async () => {
    const res = await backend.request(
      "PUT",
      "/me/notifications",
      { key: "notify_new_votes", value: "bogus" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(res.status).toBe(400);
  });

  it("PUT /me/notifications rejects missing fields", async () => {
    const res = await backend.request(
      "PUT",
      "/me/notifications",
      { key: "notify_new_votes" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(res.status).toBe(400);
  });

  it("GET /me/notifications requires auth", async () => {
    const res = await backend.request("GET", "/me/notifications");
    expect(res.status).toBe(401);
  });
});
