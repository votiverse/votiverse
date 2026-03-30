/**
 * Notification hub integration tests — persistent in-app notification feed,
 * admin notifications, feed endpoints, and read/unread management.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createTestBackend, TEST_PASSWORD, type TestBackend } from "./helpers.js";
import type { VCPAssembly, VCPParticipant } from "../src/services/vcp-client.js";

const GROUP_NAME = "Hub Test Assembly";
const VCP_ASSEMBLY_ID = "asm-hub-001";

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Create a group (with VCP assembly link) and add the user as admin/owner. */
async function seedGroup(backend: TestBackend, userId: string, admissionMode: "open" | "approval" | "invite-only" = "approval"): Promise<string> {
  const group = await backend.groupService.create({
    name: GROUP_NAME,
    handle: "hub-test",
    createdBy: userId,
    admissionMode,
  });
  await backend.groupService.setVcpAssemblyId(group.id, VCP_ASSEMBLY_ID);
  // Also cache the VCP assembly config (for surveys/topics resolution)
  await backend.assemblyCacheService.upsert({
    id: VCP_ASSEMBLY_ID, organizationId: null, name: GROUP_NAME,
    config: { preset: "LIQUID_DELEGATION" }, status: "active", createdAt: new Date().toISOString(),
  });
  return group.id;
}

async function seedMembership(backend: TestBackend, groupId: string, userId: string, participantId: string, role: "owner" | "admin" | "member" = "member"): Promise<void> {
  await backend.groupService.addMember(groupId, userId, role, participantId);
}

function mockJoinGroup(backend: TestBackend): void {
  let counter = 0;
  vi.spyOn(backend.vcpClient, "getAssembly").mockResolvedValue({
    id: VCP_ASSEMBLY_ID, name: GROUP_NAME, organizationId: null,
    config: { preset: "LIQUID_DELEGATION" }, status: "active", createdAt: new Date().toISOString(),
  } as VCPAssembly);
  vi.spyOn(backend.vcpClient, "createParticipant").mockImplementation(
    async (_asmId: string, name: string) => ({
      id: `p-${++counter}`, name, registeredAt: new Date().toISOString(), status: "active",
    } as VCPParticipant),
  );
}

describe("Notification hub", () => {
  let backend: TestBackend;

  beforeEach(async () => {
    backend = await createTestBackend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    backend.cleanup();
  });

  // ── Feed endpoints ───────────────────────────────────────────────

  describe("GET /me/notifications/feed", () => {
    it("returns empty feed for new user", async () => {
      const { accessToken } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");
      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(accessToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { notifications: unknown[]; unreadCount: number; total: number };
      expect(data.notifications).toHaveLength(0);
      expect(data.unreadCount).toBe(0);
      expect(data.total).toBe(0);
    });
  });

  describe("GET /me/notifications/unread-count", () => {
    it("returns 0 for new user", async () => {
      const { accessToken } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");
      const res = await backend.request("GET", "/me/notifications/unread-count", undefined, authHeader(accessToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { unreadCount: number };
      expect(data.unreadCount).toBe(0);
    });
  });

  // ── Admin notifications via join requests ────────────────────────

  describe("Admin notifications", () => {
    let adminToken: string;
    let adminUserId: string;
    let groupId: string;
    let inviteToken: string;

    beforeEach(async () => {
      const admin = await backend.registerAndLogin("admin@example.com", TEST_PASSWORD, "Admin");
      adminToken = admin.accessToken;
      adminUserId = admin.userId;
      groupId = await seedGroup(backend, adminUserId, "approval");
      await seedMembership(backend, groupId, adminUserId, "p-admin", "owner");

      // Create invite link
      const createRes = await backend.request(
        "POST", `/groups/${groupId}/invitations`,
        { type: "link" }, authHeader(adminToken),
      );
      const data = (await createRes.json()) as { token: string };
      inviteToken = data.token;
    });

    it("creates join_request notification for admins when someone requests to join", async () => {
      const { accessToken: joinerToken } = await backend.registerAndLogin("joiner@example.com", TEST_PASSWORD, "Joiner");
      await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(joinerToken));

      // Give async notification a tick
      await new Promise((r) => setTimeout(r, 50));

      // Admin should have a notification
      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(adminToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { notifications: Array<{ type: string; urgency: string; title: string }>; unreadCount: number };
      expect(data.unreadCount).toBeGreaterThanOrEqual(1);

      const joinNotif = data.notifications.find((n) => n.type === "join_request");
      expect(joinNotif).toBeDefined();
      expect(joinNotif!.urgency).toBe("action");
      expect(joinNotif!.title).toContain("Joiner");
      expect(joinNotif!.title).toContain(GROUP_NAME);
    });

    it("notifies requester when join request is approved", async () => {
      const { accessToken: joinerToken } = await backend.registerAndLogin("joiner@example.com", TEST_PASSWORD, "Joiner");
      const reqRes = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(joinerToken));
      const { joinRequestId } = (await reqRes.json()) as { joinRequestId: string };

      mockJoinGroup(backend);
      await backend.request(
        "POST", `/groups/${groupId}/join-requests/${joinRequestId}/approve`,
        undefined, authHeader(adminToken),
      );

      await new Promise((r) => setTimeout(r, 50));

      // Joiner should have an approved notification
      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(joinerToken));
      const data = (await res.json()) as { notifications: Array<{ type: string; urgency: string; title: string }> };
      const approvedNotif = data.notifications.find((n) => n.type === "join_request_approved");
      expect(approvedNotif).toBeDefined();
      expect(approvedNotif!.urgency).toBe("info");
      expect(approvedNotif!.title).toContain(GROUP_NAME);
    });

    it("notifies requester when join request is rejected", async () => {
      const { accessToken: joinerToken } = await backend.registerAndLogin("joiner@example.com", TEST_PASSWORD, "Joiner");
      const reqRes = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(joinerToken));
      const { joinRequestId } = (await reqRes.json()) as { joinRequestId: string };

      await backend.request(
        "POST", `/groups/${groupId}/join-requests/${joinRequestId}/reject`,
        undefined, authHeader(adminToken),
      );

      await new Promise((r) => setTimeout(r, 50));

      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(joinerToken));
      const data = (await res.json()) as { notifications: Array<{ type: string; title: string }> };
      const rejectedNotif = data.notifications.find((n) => n.type === "join_request_rejected");
      expect(rejectedNotif).toBeDefined();
      expect(rejectedNotif!.title).toContain("not approved");
    });
  });

  // ── Read/unread management ───────────────────────────────────────

  describe("Mark read", () => {
    it("marks a single notification as read", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");

      // Create a group for the FK
      const groupId = await seedGroup(backend, userId);

      // Insert a notification directly via the DB
      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
         VALUES ('ntf-1', ?, ?, 'vote_created', 'timely', 'Test notification', ?)`,
        [userId, groupId, new Date().toISOString()],
      );

      // Verify unread
      let countRes = await backend.request("GET", "/me/notifications/unread-count", undefined, authHeader(accessToken));
      let countData = (await countRes.json()) as { unreadCount: number };
      expect(countData.unreadCount).toBe(1);

      // Mark read
      const readRes = await backend.request("POST", "/me/notifications/ntf-1/read", undefined, authHeader(accessToken));
      expect(readRes.status).toBe(200);

      // Verify read
      countRes = await backend.request("GET", "/me/notifications/unread-count", undefined, authHeader(accessToken));
      countData = (await countRes.json()) as { unreadCount: number };
      expect(countData.unreadCount).toBe(0);
    });

    it("marks all notifications as read", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");

      // Create a group for the FK
      const groupId = await seedGroup(backend, userId);

      // Insert multiple notifications
      for (let i = 0; i < 3; i++) {
        await backend.db.run(
          `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
           VALUES (?, ?, ?, 'vote_created', 'timely', ?, ?)`,
          [`ntf-${i}`, userId, groupId, `Notification ${i}`, new Date().toISOString()],
        );
      }

      let countRes = await backend.request("GET", "/me/notifications/unread-count", undefined, authHeader(accessToken));
      let countData = (await countRes.json()) as { unreadCount: number };
      expect(countData.unreadCount).toBe(3);

      // Mark all read
      await backend.request("POST", "/me/notifications/read-all", undefined, authHeader(accessToken));

      countRes = await backend.request("GET", "/me/notifications/unread-count", undefined, authHeader(accessToken));
      countData = (await countRes.json()) as { unreadCount: number };
      expect(countData.unreadCount).toBe(0);
    });
  });

  // ── Feed sorting and filtering ───────────────────────────────────

  describe("Feed sorting", () => {
    it("returns unread action items first, then timely, then info", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");

      // Create a group for the FK
      const groupId = await seedGroup(backend, userId);

      // Insert in reverse urgency order
      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
         VALUES ('ntf-info', ?, ?, 'results_available', 'info', 'Info', ?)`,
        [userId, groupId, new Date().toISOString()],
      );
      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
         VALUES ('ntf-action', ?, ?, 'voting_open', 'action', 'Action', ?)`,
        [userId, groupId, new Date().toISOString()],
      );
      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
         VALUES ('ntf-timely', ?, ?, 'vote_created', 'timely', 'Timely', ?)`,
        [userId, groupId, new Date().toISOString()],
      );

      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(accessToken));
      const data = (await res.json()) as { notifications: Array<{ id: string; urgency: string }> };
      expect(data.notifications[0].urgency).toBe("action");
      expect(data.notifications[1].urgency).toBe("timely");
      expect(data.notifications[2].urgency).toBe("info");
    });

    it("filters by unreadOnly", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");

      // Create a group for the FK
      const groupId = await seedGroup(backend, userId);

      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
         VALUES ('ntf-unread', ?, ?, 'vote_created', 'timely', 'Unread', ?)`,
        [userId, groupId, new Date().toISOString()],
      );
      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, read_at, created_at)
         VALUES ('ntf-read', ?, ?, 'results_available', 'info', 'Read', ?, ?)`,
        [userId, groupId, new Date().toISOString(), new Date().toISOString()],
      );

      const res = await backend.request("GET", "/me/notifications/feed?unreadOnly=true", undefined, authHeader(accessToken));
      const data = (await res.json()) as { notifications: Array<{ id: string }> };
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].id).toBe("ntf-unread");
    });

    it("enriches notifications with group names", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");

      // Create a group for the FK
      const groupId = await seedGroup(backend, userId);

      await backend.db.run(
        `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, created_at)
         VALUES ('ntf-1', ?, ?, 'vote_created', 'timely', 'Test', ?)`,
        [userId, groupId, new Date().toISOString()],
      );

      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(accessToken));
      const data = (await res.json()) as { notifications: Array<{ groupName: string }> };
      expect(data.notifications[0].groupName).toBe(GROUP_NAME);
    });
  });

  // ── Scheduler → hub integration ───────────────────────────────────

  describe("Scheduler creates hub records", () => {
    it("processScheduledNotifications creates notification records for tracked events", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("member@example.com", TEST_PASSWORD, "Member");
      const groupId = await seedGroup(backend, userId, "open");
      await seedMembership(backend, groupId, userId, "p-member");

      // Track an event with voting already open (votingStart in past)
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
      await backend.db.run(
        `INSERT INTO tracked_events (id, assembly_id, title, voting_start, voting_end)
         VALUES ('evt-1', ?, 'Budget Vote', ?, ?)`,
        [VCP_ASSEMBLY_ID, pastDate, futureDate],
      );

      // Mock VCP for delegation check (needed by resolveRecipients)
      vi.spyOn(backend.vcpClient, "request").mockResolvedValue({ status: 200, body: { delegations: [] } });

      // Create a NotificationService and hub for this test
      const { NotificationService } = await import("../src/services/notification-service.js");
      const { NotificationHubService } = await import("../src/services/notification-hub.js");
      const { ConsoleNotificationAdapter } = await import("../src/services/notification-adapter.js");

      const adapter = new ConsoleNotificationAdapter();
      const notifService = new NotificationService(backend.db, adapter, backend.vcpClient, "http://localhost:3000", backend.groupService);
      const hub = new NotificationHubService(
        backend.db, backend.groupService,
        adapter, notifService,
      );
      notifService.setHub(hub);

      // Run scheduler
      await notifService.processScheduledNotifications();

      // Check the hub — member should have notifications
      const res = await backend.request("GET", "/me/notifications/feed", undefined, authHeader(accessToken));
      const data = (await res.json()) as { notifications: Array<{ type: string; title: string }> };

      // Should have at least vote_created and voting_open (since votingStart is in the past)
      const types = data.notifications.map((n) => n.type);
      expect(types).toContain("vote_created");
      expect(types).toContain("voting_open");
    });
  });

  // ── Preference endpoint rename ───────────────────────────────────

  describe("Preference endpoints", () => {
    it("GET /me/notification-preferences returns defaults", async () => {
      const { accessToken } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");
      const res = await backend.request("GET", "/me/notification-preferences", undefined, authHeader(accessToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { preferences: Record<string, string> };
      expect(data.preferences.notify_new_votes).toBe("always");
    });

    it("old /me/notifications path still works (backward compat)", async () => {
      const { accessToken } = await backend.registerAndLogin("user@example.com", TEST_PASSWORD, "User");
      const res = await backend.request("GET", "/me/notifications", undefined, authHeader(accessToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { preferences: Record<string, string> };
      expect(data.preferences).toBeDefined();
    });
  });
});
