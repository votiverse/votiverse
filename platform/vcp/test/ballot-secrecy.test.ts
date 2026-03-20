/**
 * Ballot secrecy enforcement tests.
 *
 * Verifies that under secret/anonymous-auditable ballot configurations,
 * individual vote choices and per-participant data do not leak through
 * any API endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPreset, deriveConfig } from "@votiverse/config";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Ballot secrecy enforcement", () => {
  let vcp: TestVCP;

  // Assembly with secret ballot + public delegation visibility
  // (isolates secrecy from delegation visibility concerns)
  let secretAsmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };
  let eventId: string;
  let issueId: string;

  // Assembly with public ballot for comparison
  let publicAsmId: string;
  let pAlice: { id: string };
  let pBob: { id: string };
  let publicEventId: string;
  let publicIssueId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // --- Secret ballot assembly ---
    const secretConfig = deriveConfig(getPreset("LIQUID_STANDARD"), {
      ballot: { secrecy: "secret", delegateVoteVisibility: "private" },
    });
    const secretAsmRes = await vcp.request("POST", "/assemblies", {
      name: "Secret Assembly",
      config: secretConfig,
    });
    const secretAsm = (await secretAsmRes.json()) as { id: string };
    secretAsmId = secretAsm.id;

    const secretParticipants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol"]) {
      const res = await vcp.request("POST", `/assemblies/${secretAsmId}/participants`, { name });
      secretParticipants.push((await res.json()) as { id: string });
    }
    [alice, bob, carol] = secretParticipants as [{ id: string }, { id: string }, { id: string }];

    const now = Date.now();
    const secretEventRes = await vcp.request("POST", `/assemblies/${secretAsmId}/events`, {
      title: "Secret Vote",
      description: "",
      issues: [{ title: "Issue 1", description: "", topicId: null }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id],
      timeline: {
        deliberationStart: now - 86400000 * 2,
        votingStart: now - 86400000,
        votingEnd: now + 3600000,
      },
    });
    const secretEvent = (await secretEventRes.json()) as { id: string; issueIds: string[] };
    eventId = secretEvent.id;
    issueId = secretEvent.issueIds[0]!;

    // Cast votes (voting window is open)
    await vcp.requestAs(alice.id, "POST", `/assemblies/${secretAsmId}/votes`, {
      issueId, choice: "for",
    });
    await vcp.requestAs(bob.id, "POST", `/assemblies/${secretAsmId}/votes`, {
      issueId, choice: "against",
    });

    // --- Public ballot assembly ---
    const publicAsmRes = await vcp.request("POST", "/assemblies", {
      name: "Public Assembly",
      preset: "LIQUID_STANDARD",
    });
    const publicAsm = (await publicAsmRes.json()) as { id: string };
    publicAsmId = publicAsm.id;

    const publicParticipants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob"]) {
      const res = await vcp.request("POST", `/assemblies/${publicAsmId}/participants`, { name });
      publicParticipants.push((await res.json()) as { id: string });
    }
    [pAlice, pBob] = publicParticipants as [{ id: string }, { id: string }];

    const publicEventRes = await vcp.request("POST", `/assemblies/${publicAsmId}/events`, {
      title: "Public Vote",
      description: "",
      issues: [{ title: "Issue 1", description: "", topicId: null }],
      eligibleParticipantIds: [pAlice.id, pBob.id],
      timeline: {
        deliberationStart: now - 86400000 * 2,
        votingStart: now - 86400000,
        votingEnd: now + 3600000,
      },
    });
    const publicEvent = (await publicEventRes.json()) as { id: string; issueIds: string[] };
    publicEventId = publicEvent.id;
    publicIssueId = publicEvent.issueIds[0]!;

    await vcp.requestAs(pAlice.id, "POST", `/assemblies/${publicAsmId}/votes`, {
      issueId: publicIssueId, choice: "for",
    });
    await vcp.requestAs(pBob.id, "POST", `/assemblies/${publicAsmId}/votes`, {
      issueId: publicIssueId, choice: "against",
    });

    // Advance clock past votingEnd so events appear closed for queries
    vcp.clock.advance(7200000);
  });

  afterEach(() => {
    vcp.cleanup();
  });

  describe("voting history endpoint", () => {
    it("secret ballot: own history includes choices", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/awareness/history/${alice.id}`,
        undefined,
        { "X-Participant-Id": alice.id },
      );
      const data = (await res.json()) as {
        history: Array<{ issueId: string; choice?: string; votedAt: string }>;
      };

      expect(data.history).toHaveLength(1);
      expect(data.history[0]!.choice).toBe("for"); // own vote is visible
    });

    it("secret ballot: other's history returns 403", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/awareness/history/${alice.id}`,
        undefined,
        { "X-Participant-Id": bob.id }, // Bob asking about Alice
      );
      expect(res.status).toBe(403);
    });

    it("secret ballot: no caller ID returns 403", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/awareness/history/${alice.id}`,
      );
      expect(res.status).toBe(403);
    });

    it("public ballot: choices always visible", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${publicAsmId}/awareness/history/${pAlice.id}`,
        undefined,
        { "X-Participant-Id": pBob.id }, // Bob asking about Alice — public, so fine
      );
      const data = (await res.json()) as {
        history: Array<{ choice?: string }>;
      };

      expect(data.history[0]!.choice).toBe("for");
    });
  });

  describe("weights endpoint", () => {
    it("secret ballot: returns 403", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/events/${eventId}/weights`,
      );
      expect(res.status).toBe(403);
    });

    it("public ballot: returns per-participant weights", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${publicAsmId}/events/${publicEventId}/weights`,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        weights: Array<{ weights: Record<string, number> }>;
      };
      expect(Object.keys(data.weights[0]!.weights).length).toBeGreaterThan(0);
    });
  });

  describe("concentration endpoint", () => {
    it("secret ballot: hides maxWeightHolder", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/awareness/concentration?issueId=${issueId}`,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        maxWeightHolder: string | null;
        giniCoefficient: number;
        maxWeight: number;
      };

      expect(data.maxWeightHolder).toBeNull(); // hidden under secret ballot
      expect(data.giniCoefficient).toBeDefined(); // aggregate stats still available
      expect(data.maxWeight).toBeDefined();
    });

    it("public ballot: shows maxWeightHolder", async () => {
      // pBob's vote is cast in beforeEach (before clock advance)
      const res = await vcp.request(
        "GET",
        `/assemblies/${publicAsmId}/awareness/concentration?issueId=${publicIssueId}`,
      );
      const data = (await res.json()) as {
        maxWeightHolder: string | null;
      };

      expect(data.maxWeightHolder).not.toBeNull();
    });
  });

  describe("tally endpoint (aggregate counts remain available)", () => {
    it("secret ballot: still returns aggregate counts and winner", async () => {
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/events/${eventId}/tally`,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        tallies: Array<{
          counts: Record<string, number>;
          winner: string | null;
          totalVotes: number;
          participatingCount: number;
        }>;
      };

      const tally = data.tallies[0]!;
      expect(tally.counts).toBeDefined();
      expect(tally.counts["for"]).toBe(1);
      expect(tally.counts["against"]).toBe(1);
      expect(tally.totalVotes).toBe(2);
      expect(tally.participatingCount).toBe(2);
    });
  });
});
