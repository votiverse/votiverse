/**
 * Delegation sovereignty, visibility, and lifecycle tests.
 *
 * Tests the VCP-layer enforcement of:
 * - Participant identity on delegation mutations
 * - Sovereignty (only delegator can revoke)
 * - Visibility filtering by config mode
 * - Participant sunset cascade
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Delegation sovereignty & visibility", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly with LIQUID_STANDARD (public visibility, revocableAnytime)
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Sovereignty Test",
      preset: "LIQUID_STANDARD",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    // Add participants
    const participants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      participants.push((await res.json()) as { id: string });
    }
    [alice, bob, carol] = participants as [{ id: string }, { id: string }, { id: string }];
  });

  afterEach(() => {
    vcp.cleanup();
  });

  describe("delegation creation sovereignty", () => {
    it("requires X-Participant-Id header", async () => {
      const res = await vcp.request("POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });
      expect(res.status).toBe(403);
    });

    it("creates delegation with source from header, ignoring body sourceId", async () => {
      const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        sourceId: bob.id, // should be ignored
        targetId: carol.id,
        topicScope: [],
      });
      expect(res.status).toBe(201);
      const delegation = (await res.json()) as { sourceId: string };
      expect(delegation.sourceId).toBe(alice.id); // from header, not body
    });

    it("rejects creation with invalid participant ID", async () => {
      const res = await vcp.requestAs("nonexistent-id", "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });
      expect(res.status).toBe(403);
    });
  });

  describe("delegation revocation sovereignty", () => {
    let delegationId: string;

    beforeEach(async () => {
      const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });
      const delegation = (await res.json()) as { id: string };
      delegationId = delegation.id;
    });

    it("allows source to revoke own delegation", async () => {
      const res = await vcp.requestAs(alice.id, "DELETE", `/assemblies/${asmId}/delegations/${delegationId}`);
      expect(res.status).toBe(204);
    });

    it("rejects revocation by another participant (403)", async () => {
      const res = await vcp.requestAs(bob.id, "DELETE", `/assemblies/${asmId}/delegations/${delegationId}`);
      expect(res.status).toBe(403);
    });

    it("rejects revocation without participant header (403)", async () => {
      const res = await vcp.request("DELETE", `/assemblies/${asmId}/delegations/${delegationId}`);
      expect(res.status).toBe(403);
    });
  });

  describe("visibility filtering", () => {
    beforeEach(async () => {
      // Alice → Bob delegation
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });
    });

    it("public mode: all delegations visible to anyone", async () => {
      // LIQUID_STANDARD has public visibility
      const res = await vcp.request("GET", `/assemblies/${asmId}/delegations`, undefined, {
        "X-Participant-Id": carol.id,
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { delegations: unknown[] };
      expect(data.delegations.length).toBeGreaterThan(0);
    });

    it("public mode: chain resolver works for any participant", async () => {
      // Create voting event so we can resolve chains
      const now = Date.now();
      const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
        title: "Chain Test",
        description: "",
        issues: [{ title: "Issue", description: "", topicId: null }],
        eligibleParticipantIds: [alice.id, bob.id, carol.id],
        timeline: {
          deliberationStart: now - 86400000,
          votingStart: now - 3600000,
          votingEnd: now + 86400000,
        },
      });
      const event = (await eventRes.json()) as { issueIds: string[] };

      // Carol resolves Alice's chain — allowed in public mode
      const chainRes = await vcp.request(
        "GET",
        `/assemblies/${asmId}/delegations/chain?participantId=${alice.id}&issueId=${event.issueIds[0]}`,
        undefined,
        { "X-Participant-Id": carol.id },
      );
      expect(chainRes.status).toBe(200);
    });
  });

  describe("private visibility mode", () => {
    let privateAsmId: string;
    let pAlice: { id: string };
    let pBob: { id: string };
    let pCarol: { id: string };

    beforeEach(async () => {
      // Create assembly with CIVIC_PARTICIPATORY (private visibility)
      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "Private Visibility Test",
        preset: "CIVIC_PARTICIPATORY",
      });
      const assembly = (await asmRes.json()) as { id: string };
      privateAsmId = assembly.id;

      const participants: Array<{ id: string }> = [];
      for (const name of ["Alice", "Bob", "Carol"]) {
        const res = await vcp.request("POST", `/assemblies/${privateAsmId}/participants`, { name });
        participants.push((await res.json()) as { id: string });
      }
      [pAlice, pBob, pCarol] = participants as [{ id: string }, { id: string }, { id: string }];

      // Alice → Bob
      await vcp.requestAs(pAlice.id, "POST", `/assemblies/${privateAsmId}/delegations`, {
        targetId: pBob.id,
        topicScope: [],
      });
    });

    it("returns empty list when no participant ID provided", async () => {
      const res = await vcp.request("GET", `/assemblies/${privateAsmId}/delegations`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { delegations: unknown[] };
      expect(data.delegations).toHaveLength(0);
    });

    it("shows only own delegations to participant", async () => {
      // Alice sees her outgoing delegation
      const aliceRes = await vcp.request("GET", `/assemblies/${privateAsmId}/delegations`, undefined, {
        "X-Participant-Id": pAlice.id,
      });
      const aliceData = (await aliceRes.json()) as { delegations: Array<{ sourceId: string }> };
      expect(aliceData.delegations.length).toBeGreaterThan(0);
      expect(aliceData.delegations.every((d) => d.sourceId === pAlice.id || aliceData.delegations.some((dd) => dd.sourceId === pAlice.id))).toBe(true);

      // Carol sees nothing (not involved in any delegation)
      const carolRes = await vcp.request("GET", `/assemblies/${privateAsmId}/delegations`, undefined, {
        "X-Participant-Id": pCarol.id,
      });
      const carolData = (await carolRes.json()) as { delegations: unknown[] };
      expect(carolData.delegations).toHaveLength(0);
    });

    it("chain resolver rejects resolving another participant's chain", async () => {
      const now = Date.now();
      const eventRes = await vcp.request("POST", `/assemblies/${privateAsmId}/events`, {
        title: "Private Chain Test",
        description: "",
        issues: [{ title: "Issue", description: "", topicId: null }],
        eligibleParticipantIds: [pAlice.id, pBob.id, pCarol.id],
        timeline: {
          deliberationStart: now - 86400000,
          votingStart: now - 3600000,
          votingEnd: now + 86400000,
        },
      });
      const event = (await eventRes.json()) as { issueIds: string[] };

      // Carol tries to resolve Alice's chain — should be 403 in private mode
      const chainRes = await vcp.request(
        "GET",
        `/assemblies/${privateAsmId}/delegations/chain?participantId=${pAlice.id}&issueId=${event.issueIds[0]}`,
        undefined,
        { "X-Participant-Id": pCarol.id },
      );
      expect(chainRes.status).toBe(403);
    });
  });

  describe("participant sunset cascade", () => {
    let delegationId: string;

    beforeEach(async () => {
      // Alice → Bob delegation
      const delRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });
      const delegation = (await delRes.json()) as { id: string };
      delegationId = delegation.id;

      // Carol → Alice delegation (Alice is target)
      await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: alice.id,
        topicScope: [],
      });
    });

    it("revoking sunset cascades all delegations from and to participant", async () => {
      // Verify 2 delegations exist
      const beforeRes = await vcp.request("GET", `/assemblies/${asmId}/delegations`);
      const before = (await beforeRes.json()) as { delegations: unknown[] };
      expect(before.delegations).toHaveLength(2);

      // Sunset Alice
      const sunsetRes = await vcp.request("PATCH", `/assemblies/${asmId}/participants/${alice.id}/status`, {
        status: "sunset",
        reason: "Test sunset",
      });
      expect(sunsetRes.status).toBe(200);
      const sunsetData = (await sunsetRes.json()) as { delegationsRevoked: number };
      expect(sunsetData.delegationsRevoked).toBe(2); // both from and to Alice

      // Verify no delegations remain
      const afterRes = await vcp.request("GET", `/assemblies/${asmId}/delegations`);
      const after = (await afterRes.json()) as { delegations: unknown[] };
      expect(after.delegations).toHaveLength(0);
    });

    it("sunset participant cannot create new delegations", async () => {
      // Sunset Alice
      await vcp.request("PATCH", `/assemblies/${asmId}/participants/${alice.id}/status`, {
        status: "sunset",
        reason: "Test sunset",
      });

      // Alice tries to create a delegation — should be rejected
      const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: carol.id,
        topicScope: [],
      });
      expect(res.status).toBe(403);
    });

    it("emits ParticipantStatusChanged event", async () => {
      await vcp.request("PATCH", `/assemblies/${asmId}/participants/${alice.id}/status`, {
        status: "inactive",
        reason: "Going on vacation",
      });

      const { store } = await vcp.manager.getEngine(asmId);
      const events = await store.query({ types: ["ParticipantStatusChanged"] });
      expect(events).toHaveLength(1);
      const payload = events[0]!.payload as { participantId: string; previousStatus: string; newStatus: string };
      expect(payload.participantId).toBe(alice.id);
      expect(payload.previousStatus).toBe("active");
      expect(payload.newStatus).toBe("inactive");
    });
  });

  describe("revocableAnytime enforcement", () => {
    it("BOARD_PROXY rejects revocation (revocableAnytime=false)", async () => {
      // Create assembly with BOARD_PROXY
      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "Board Test",
        preset: "BOARD_PROXY",
      });
      const boardAsm = (await asmRes.json()) as { id: string };

      const participants: Array<{ id: string }> = [];
      for (const name of ["Alice", "Bob"]) {
        const res = await vcp.request("POST", `/assemblies/${boardAsm.id}/participants`, { name });
        participants.push((await res.json()) as { id: string });
      }
      const [bAlice, bBob] = participants;

      // Create delegation
      const delRes = await vcp.requestAs(bAlice!.id, "POST", `/assemblies/${boardAsm.id}/delegations`, {
        targetId: bBob!.id,
        topicScope: [],
      });
      expect(delRes.status).toBe(201);
      const delegation = (await delRes.json()) as { id: string };

      // Try to revoke — should fail with governance rule violation
      const revokeRes = await vcp.requestAs(bAlice!.id, "DELETE", `/assemblies/${boardAsm.id}/delegations/${delegation.id}`);
      expect(revokeRes.status).toBe(409); // GovernanceRuleViolation returns 409
    });
  });
});
