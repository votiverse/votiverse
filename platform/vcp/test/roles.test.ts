/**
 * Assembly roles tests — owner/admin role model, invariants, and authorization.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Assembly roles", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Roles Test",
      preset: "MODERN_DEMOCRACY",
    });
    asmId = ((await asmRes.json()) as { id: string }).id;

    // Add participants
    const aliceRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Alice" });
    alice = (await aliceRes.json()) as { id: string };
    const bobRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Bob" });
    bob = (await bobRes.json()) as { id: string };
    const carolRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Carol" });
    carol = (await carolRes.json()) as { id: string };

    // Grant Alice owner role (makes her admin too)
    await vcp.manager.grantRole(asmId, alice.id, "owner", alice.id);
  });

  afterEach(() => { vcp.cleanup(); });

  it("lists roles for an assembly", async () => {
    const res = await vcp.request("GET", `/assemblies/${asmId}/roles`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { roles: Array<{ participantId: string; role: string }> };
    expect(body.roles).toHaveLength(2); // owner + admin for Alice
    expect(body.roles.some((r) => r.participantId === alice.id && r.role === "owner")).toBe(true);
    expect(body.roles.some((r) => r.participantId === alice.id && r.role === "admin")).toBe(true);
  });

  it("owner can grant admin role to another participant", async () => {
    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/roles`, {
      participantId: bob.id,
      role: "admin",
    });
    expect(res.status).toBe(200);

    const isAdmin = await vcp.manager.isAdmin(asmId, bob.id);
    expect(isAdmin).toBe(true);
  });

  it("owner can promote admin to owner", async () => {
    // First make Bob admin
    await vcp.manager.grantRole(asmId, bob.id, "admin", alice.id);

    // Then promote to owner
    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/roles`, {
      participantId: bob.id,
      role: "owner",
    });
    expect(res.status).toBe(200);

    const isOwner = await vcp.manager.hasRole(asmId, bob.id, "owner");
    expect(isOwner).toBe(true);
  });

  it("non-owner cannot grant roles", async () => {
    const res = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/roles`, {
      participantId: carol.id,
      role: "admin",
    });
    expect(res.status).toBe(403);
  });

  it("owner can revoke admin role", async () => {
    await vcp.manager.grantRole(asmId, bob.id, "admin", alice.id);

    const res = await vcp.requestAs(alice.id, "DELETE", `/assemblies/${asmId}/roles`, {
      participantId: bob.id,
      role: "admin",
    });
    expect(res.status).toBe(200);

    const isAdmin = await vcp.manager.isAdmin(asmId, bob.id);
    expect(isAdmin).toBe(false);
  });

  it("cannot remove admin role from an owner", async () => {
    // Alice is owner+admin. Try to remove her admin role.
    const res = await vcp.requestAs(alice.id, "DELETE", `/assemblies/${asmId}/roles`, {
      participantId: alice.id,
      role: "admin",
    });
    expect(res.status).toBe(409);
  });

  it("cannot revoke the last owner", async () => {
    // Alice is the only owner. Try to revoke her ownership.
    const res = await vcp.requestAs(alice.id, "DELETE", `/assemblies/${asmId}/roles`, {
      participantId: alice.id,
      role: "owner",
    });
    expect(res.status).toBe(409);
  });

  it("can revoke owner when another owner exists", async () => {
    // Promote Bob to owner
    await vcp.manager.grantRole(asmId, bob.id, "owner", alice.id);

    // Now Alice can revoke her own ownership
    const res = await vcp.requestAs(alice.id, "DELETE", `/assemblies/${asmId}/roles`, {
      participantId: alice.id,
      role: "owner",
    });
    expect(res.status).toBe(200);

    const aliceIsOwner = await vcp.manager.hasRole(asmId, alice.id, "owner");
    expect(aliceIsOwner).toBe(false);
    // Alice should still be admin
    const aliceIsAdmin = await vcp.manager.isAdmin(asmId, alice.id);
    expect(aliceIsAdmin).toBe(true);
  });

  it("granting owner automatically grants admin", async () => {
    // Grant Bob owner directly (not admin first)
    await vcp.manager.grantRole(asmId, bob.id, "owner", alice.id);

    const isAdmin = await vcp.manager.isAdmin(asmId, bob.id);
    expect(isAdmin).toBe(true);
    const isOwner = await vcp.manager.hasRole(asmId, bob.id, "owner");
    expect(isOwner).toBe(true);
  });

  it("creatorParticipantId at assembly creation grants owner+admin", async () => {
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Auto-Role Test",
      preset: "MODERN_DEMOCRACY",
      creatorParticipantId: "creator-p1",
    });
    const asm = (await asmRes.json()) as { id: string };

    const roles = await vcp.manager.listRoles(asm.id);
    expect(roles.some((r) => r.participantId === "creator-p1" && r.role === "owner")).toBe(true);
    expect(roles.some((r) => r.participantId === "creator-p1" && r.role === "admin")).toBe(true);
  });

  it("admin can feature proposals but non-admin cannot", async () => {
    await vcp.manager.grantRole(asmId, bob.id, "admin", alice.id);

    // Create event and proposal
    const now = vcp.clock.now() as number;
    const DAY = 86_400_000;
    const eventRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/events`, {
      title: "Test",
      description: "Test",
      issues: [{ title: "Issue", description: "Test", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id],
      timeline: {
        deliberationStart: now - 3 * DAY,
        votingStart: now + 7 * DAY,
        votingEnd: now + 14 * DAY,
      },
    });
    const event = (await eventRes.json()) as { issueIds: string[] };
    const issueId = event.issueIds[0]!;

    const propRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId,
      choiceKey: "for",
      title: "Test Proposal",
      contentHash: "hash1",
    });
    const proposalId = ((await propRes.json()) as { id: string }).id;

    // Bob (admin) can feature
    const featureRes = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/feature`);
    expect(featureRes.status).toBe(200);

    // Carol (not admin) cannot feature
    const carolRes = await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/feature`);
    expect(carolRes.status).toBe(403);
  });

  it("exclusive featuring: featuring one proposal unfeatures another for same position", async () => {
    // Create event and two proposals for the same position
    const now = vcp.clock.now() as number;
    const DAY = 86_400_000;
    const eventRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/events`, {
      title: "Exclusive Feature Test",
      description: "Test",
      issues: [{ title: "Issue", description: "Test", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id],
      timeline: {
        deliberationStart: now - 3 * DAY,
        votingStart: now + 7 * DAY,
        votingEnd: now + 14 * DAY,
      },
    });
    const event = (await eventRes.json()) as { issueIds: string[] };
    const issueId = event.issueIds[0]!;

    const prop1Res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, choiceKey: "for", title: "Proposal A", contentHash: "hashA",
    });
    const prop1Id = ((await prop1Res.json()) as { id: string }).id;

    const prop2Res = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, choiceKey: "for", title: "Proposal B", contentHash: "hashB",
    });
    const prop2Id = ((await prop2Res.json()) as { id: string }).id;

    // Feature proposal A
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${prop1Id}/feature`);
    let getA = await vcp.request("GET", `/assemblies/${asmId}/proposals/${prop1Id}`);
    expect(((await getA.json()) as { featured: boolean }).featured).toBe(true);

    // Feature proposal B — should auto-unfeature A
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${prop2Id}/feature`);

    getA = await vcp.request("GET", `/assemblies/${asmId}/proposals/${prop1Id}`);
    expect(((await getA.json()) as { featured: boolean }).featured).toBe(false);

    const getB = await vcp.request("GET", `/assemblies/${asmId}/proposals/${prop2Id}`);
    expect(((await getB.json()) as { featured: boolean }).featured).toBe(true);
  });
});
