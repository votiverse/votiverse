/**
 * Admission control integration tests — admissionMode enforcement,
 * join requests, and assembly settings.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createTestBackend, type TestBackend } from "./helpers.js";
import type { VCPRole, VCPAssembly, VCPParticipant } from "../src/services/vcp-client.js";
import type { AdmissionMode } from "../src/services/assembly-cache.js";

const ASSEMBLY_ID = "asm-admission-001";
const ASSEMBLY_NAME = "Admission Test Assembly";
const ASSEMBLY_CONFIG = { preset: "LIQUID_DELEGATION" };

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function seedAssembly(
  backend: TestBackend,
  admissionMode: AdmissionMode,
  id = ASSEMBLY_ID,
  name = ASSEMBLY_NAME,
): Promise<void> {
  await backend.assemblyCacheService.upsert({
    id, organizationId: null, name, config: ASSEMBLY_CONFIG,
    status: "active", createdAt: new Date().toISOString(), admissionMode,
  });
}

async function seedMembership(
  backend: TestBackend, userId: string, assemblyId: string, participantId: string,
): Promise<void> {
  await backend.membershipService.createMembership(userId, assemblyId, participantId, ASSEMBLY_NAME);
}

function mockAdminRole(backend: TestBackend, participantId: string): MockInstance {
  return vi.spyOn(backend.vcpClient, "listRoles").mockResolvedValue([
    { participantId, role: "owner", grantedBy: "system", grantedAt: Date.now() },
  ] as VCPRole[]);
}

function mockJoinAssembly(backend: TestBackend): void {
  let counter = 0;
  vi.spyOn(backend.vcpClient, "getAssembly").mockResolvedValue({
    id: ASSEMBLY_ID, name: ASSEMBLY_NAME, organizationId: null,
    config: ASSEMBLY_CONFIG, status: "active", createdAt: new Date().toISOString(),
  } as VCPAssembly);
  vi.spyOn(backend.vcpClient, "createParticipant").mockImplementation(
    async (_asmId: string, name: string) => ({
      id: `p-${++counter}`, name, registeredAt: new Date().toISOString(), status: "active",
    } as VCPParticipant),
  );
}

describe("Admission control", () => {
  let backend: TestBackend;

  beforeEach(async () => {
    backend = await createTestBackend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    backend.cleanup();
  });

  // ── Assembly settings ────────────────────────────────────────────

  describe("GET /assemblies/:id/settings", () => {
    it("returns admission mode (default 'approval')", async () => {
      const { accessToken } = await backend.registerAndLogin("user@example.com", "password123", "User");
      await seedAssembly(backend, "approval");

      const res = await backend.request("GET", `/assemblies/${ASSEMBLY_ID}/settings`, undefined, authHeader(accessToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { admissionMode: string };
      expect(data.admissionMode).toBe("approval");
    });
  });

  describe("PUT /assemblies/:id/settings", () => {
    it("updates admission mode when admin", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "approval");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const res = await backend.request(
        "PUT", `/assemblies/${ASSEMBLY_ID}/settings`,
        { admissionMode: "open" },
        authHeader(accessToken),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { admissionMode: string };
      expect(data.admissionMode).toBe("open");

      // Verify it persisted
      const getRes = await backend.request("GET", `/assemblies/${ASSEMBLY_ID}/settings`, undefined, authHeader(accessToken));
      const getData = (await getRes.json()) as { admissionMode: string };
      expect(getData.admissionMode).toBe("open");
    });

    it("returns 403 for non-admin", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("member@example.com", "password123", "Member");
      await seedAssembly(backend, "approval");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-member");
      vi.spyOn(backend.vcpClient, "listRoles").mockResolvedValue([]);

      const res = await backend.request(
        "PUT", `/assemblies/${ASSEMBLY_ID}/settings`,
        { admissionMode: "open" },
        authHeader(accessToken),
      );
      expect(res.status).toBe(403);
    });

    it("validates admission mode value", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "approval");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const res = await backend.request(
        "PUT", `/assemblies/${ASSEMBLY_ID}/settings`,
        { admissionMode: "invalid" },
        authHeader(accessToken),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Open mode ────────────────────────────────────────────────────

  describe("Open mode", () => {
    it("link invite auto-joins immediately (201)", async () => {
      const { accessToken: adminToken, userId: adminUserId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "open");
      await seedMembership(backend, adminUserId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      // Create invite
      const createRes = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "link" }, authHeader(adminToken),
      );
      const { token } = (await createRes.json()) as { token: string };

      // Accept as new user
      const { accessToken: joinerToken } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");
      mockJoinAssembly(backend);

      const res = await backend.request("POST", `/invite/${token}/accept`, undefined, authHeader(joinerToken));
      expect(res.status).toBe(201);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe("joined");
    });
  });

  // ── Approval mode ────────────────────────────────────────────────

  describe("Approval mode", () => {
    let adminToken: string;
    let adminUserId: string;
    let inviteToken: string;

    beforeEach(async () => {
      const admin = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      adminToken = admin.accessToken;
      adminUserId = admin.userId;
      await seedAssembly(backend, "approval");
      await seedMembership(backend, adminUserId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const createRes = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "link" }, authHeader(adminToken),
      );
      const data = (await createRes.json()) as { token: string };
      inviteToken = data.token;
    });

    it("link invite creates join request (202) instead of membership", async () => {
      const { accessToken } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");

      const res = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(accessToken));
      expect(res.status).toBe(202);
      const data = (await res.json()) as { status: string; assemblyId: string; joinRequestId: string };
      expect(data.status).toBe("pending");
      expect(data.assemblyId).toBe(ASSEMBLY_ID);
      expect(data.joinRequestId).toBeTruthy();
    });

    it("admin can approve a join request and create membership", async () => {
      // Joiner requests
      const { accessToken: joinerToken, userId: joinerUserId } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");
      const reqRes = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(joinerToken));
      const { joinRequestId } = (await reqRes.json()) as { joinRequestId: string };

      // Admin approves
      mockJoinAssembly(backend);
      const approveRes = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/join-requests/${joinRequestId}/approve`,
        undefined, authHeader(adminToken),
      );
      expect(approveRes.status).toBe(201);
      const data = (await approveRes.json()) as { status: string };
      expect(data.status).toBe("approved");
    });

    it("admin can reject a join request", async () => {
      const { accessToken: joinerToken } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");
      const reqRes = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(joinerToken));
      const { joinRequestId } = (await reqRes.json()) as { joinRequestId: string };

      const rejectRes = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/join-requests/${joinRequestId}/reject`,
        undefined, authHeader(adminToken),
      );
      expect(rejectRes.status).toBe(200);
      const data = (await rejectRes.json()) as { status: string };
      expect(data.status).toBe("rejected");
    });

    it("admin can list pending join requests", async () => {
      const { accessToken: joinerToken } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");
      await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(joinerToken));

      const res = await backend.request(
        "GET", `/assemblies/${ASSEMBLY_ID}/join-requests`,
        undefined, authHeader(adminToken),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { joinRequests: unknown[] };
      expect(data.joinRequests).toHaveLength(1);
    });

    it("non-admin cannot list join requests", async () => {
      const { accessToken: memberToken, userId: memberUserId } = await backend.registerAndLogin("member@example.com", "password123", "Member");
      await seedMembership(backend, memberUserId, ASSEMBLY_ID, "p-member");
      vi.spyOn(backend.vcpClient, "listRoles").mockResolvedValue([]);

      const res = await backend.request(
        "GET", `/assemblies/${ASSEMBLY_ID}/join-requests`,
        undefined, authHeader(memberToken),
      );
      expect(res.status).toBe(403);
    });

    it("direct invitations bypass approval (instant join)", async () => {
      // Create target user
      const targetRes = await backend.request("POST", "/auth/register", {
        email: "target@example.com", password: "password123", name: "Target User", handle: "target-user",
      });
      const targetData = (await targetRes.json()) as { accessToken: string };

      // Admin sends direct invite
      const inviteRes = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "direct", inviteeHandle: "target-user" },
        authHeader(adminToken),
      );
      const invite = (await inviteRes.json()) as { id: string };

      // Target accepts — should be instant join (201), not pending (202)
      mockJoinAssembly(backend);
      const acceptRes = await backend.request(
        "POST", `/me/invitations/${invite.id}/accept`,
        undefined, authHeader(targetData.accessToken),
      );
      expect(acceptRes.status).toBe(201);
      const data = (await acceptRes.json()) as { status: string };
      expect(data.status).toBe("joined");
    });

    it("duplicate join request returns 409", async () => {
      const { accessToken } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");

      const res1 = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(accessToken));
      expect(res1.status).toBe(202);

      const res2 = await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(accessToken));
      expect(res2.status).toBe(409);
    });

    it("user can list their pending join requests", async () => {
      const { accessToken } = await backend.registerAndLogin("joiner@example.com", "password123", "Joiner");
      await backend.request("POST", `/invite/${inviteToken}/accept`, undefined, authHeader(accessToken));

      const res = await backend.request("GET", "/me/join-requests", undefined, authHeader(accessToken));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { joinRequests: Array<{ assemblyId: string; assemblyName: string | null }> };
      expect(data.joinRequests).toHaveLength(1);
      expect(data.joinRequests[0].assemblyId).toBe(ASSEMBLY_ID);
      expect(data.joinRequests[0].assemblyName).toBe(ASSEMBLY_NAME);
    });
  });

  // ── Invite-only mode ─────────────────────────────────────────────

  describe("Invite-only mode", () => {
    it("blocks link invite creation (403)", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "invite-only");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const res = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "link" }, authHeader(accessToken),
      );
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: { message: string } };
      expect(data.error.message).toMatch(/invite-only/i);
    });

    it("allows direct invite creation", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "invite-only");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const res = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "direct", inviteeHandle: "someone" },
        authHeader(accessToken),
      );
      expect(res.status).toBe(201);
    });
  });

  // ── Default link expiration ──────────────────────────────────────

  describe("Default link expiration", () => {
    it("link invites get 7-day default expiry when none specified", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "open");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const res = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "link" },
        authHeader(accessToken),
      );
      expect(res.status).toBe(201);
      const data = (await res.json()) as { expiresAt: string };
      expect(data.expiresAt).toBeTruthy();

      const expiry = new Date(data.expiresAt);
      const now = new Date();
      const diffDays = (expiry.getTime() - now.getTime()) / 86400000;
      expect(diffDays).toBeGreaterThan(6.5);
      expect(diffDays).toBeLessThan(7.5);
    });

    it("explicit expiresAt overrides default", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "open");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const customExpiry = new Date(Date.now() + 3 * 86400000).toISOString();
      const res = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "link", expiresAt: customExpiry },
        authHeader(accessToken),
      );
      expect(res.status).toBe(201);
      const data = (await res.json()) as { expiresAt: string };
      expect(data.expiresAt).toBe(customExpiry);
    });
  });

  // ── Invite preview includes admissionMode ────────────────────────

  describe("Invite preview", () => {
    it("includes admissionMode in group preview", async () => {
      const { accessToken, userId } = await backend.registerAndLogin("admin@example.com", "password123", "Admin");
      await seedAssembly(backend, "approval");
      await seedMembership(backend, userId, ASSEMBLY_ID, "p-admin");
      mockAdminRole(backend, "p-admin");

      const createRes = await backend.request(
        "POST", `/assemblies/${ASSEMBLY_ID}/invitations`,
        { type: "link" }, authHeader(accessToken),
      );
      const { token } = (await createRes.json()) as { token: string };

      // Preview (no auth)
      const previewRes = await backend.request("GET", `/invite/${token}`);
      expect(previewRes.status).toBe(200);
      const data = (await previewRes.json()) as { group: { admissionMode: string } };
      expect(data.group.admissionMode).toBe("approval");
    });
  });
});
