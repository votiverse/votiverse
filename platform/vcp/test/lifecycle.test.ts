/**
 * Full lifecycle integration test.
 *
 * create assembly → add participants → create voting event →
 * set delegations → cast votes → get tally
 *
 * Verifies the engine's formal properties hold through the HTTP API.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Full governance lifecycle", () => {
  let vcp: TestVCP;

  beforeEach(() => {
    vcp = createTestVCP();
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("health check returns ok", async () => {
    // Health check doesn't require auth
    const req = new Request("http://localhost/health");
    const res = await vcp.app.fetch(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("ok");
  });

  it("complete governance lifecycle with delegations and override", async () => {
    // 1. Create Assembly
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Test Assembly",
      preset: "LIQUID_STANDARD",
    });
    expect(asmRes.status).toBe(201);
    const assembly = (await asmRes.json()) as { id: string };
    const asmId = assembly.id;

    // 2. Add participants
    const participants: Array<{ id: string; name: string }> = [];
    for (const name of ["Alice", "Bob", "Carol"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      expect(res.status).toBe(201);
      participants.push((await res.json()) as { id: string; name: string });
    }
    const [alice, bob, carol] = participants;

    // 3. Create voting event
    const now = Date.now();
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Test Vote",
      description: "A test voting event",
      issues: [
        { title: "Issue 1", description: "First issue", topicIds: [] },
      ],
      eligibleParticipantIds: participants.map((p) => p.id),
      timeline: {
        deliberationStart: now - 86400000,
        votingStart: now - 3600000,
        votingEnd: now + 86400000,
      },
    });
    expect(eventRes.status).toBe(201);
    const votingEvent = (await eventRes.json()) as { id: string; issueIds: string[] };
    const issueId = votingEvent.issueIds[0]!;

    // 4. Create delegation: Alice → Carol (using Alice's identity)
    const delRes = await vcp.requestAs(alice!.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: carol!.id,
      topicScope: [],
    });
    expect(delRes.status).toBe(201);

    // 5. Cast votes: Bob votes "for", Carol votes "against"
    let voteRes = await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: bob!.id,
      issueId,
      choice: "for",
    });
    expect(voteRes.status).toBe(200);

    voteRes = await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: carol!.id,
      issueId,
      choice: "against",
    });
    expect(voteRes.status).toBe(200);

    // 6. Get tally — Carol should have weight 2 (own + Alice's delegation)
    const tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${votingEvent.id}/tally`);
    expect(tallyRes.status).toBe(200);
    const tallyData = (await tallyRes.json()) as {
      tallies: Array<{
        issueId: string;
        winner: string | null;
        counts: Record<string, number>;
        totalVotes: number;
        quorumMet: boolean;
        participatingCount: number;
      }>;
    };
    const tally = tallyData.tallies[0]!;

    // Carol (weight 2) voted "against", Bob (weight 1) voted "for"
    // "against" should win with 2 vs 1
    expect(tally.counts["against"]).toBe(2);
    expect(tally.counts["for"]).toBe(1);
    expect(tally.totalVotes).toBe(3);
    expect(tally.winner).toBe("against");
  });

  it("sovereignty: direct vote overrides delegation", async () => {
    // Create assembly + participants
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Override Test",
      preset: "LIQUID_STANDARD",
    });
    const assembly = (await asmRes.json()) as { id: string };
    const asmId = assembly.id;

    const names = ["Alice", "Bob"];
    const participants: Array<{ id: string }> = [];
    for (const name of names) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      participants.push((await res.json()) as { id: string });
    }
    const [alice, bob] = participants;

    // Create voting event
    const now = Date.now();
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Override Test Event",
      description: "",
      issues: [{ title: "Issue", description: "", topicIds: [] }],
      eligibleParticipantIds: participants.map((p) => p.id),
      timeline: {
        deliberationStart: now - 86400000,
        votingStart: now - 3600000,
        votingEnd: now + 86400000,
      },
    });
    const votingEvent = (await eventRes.json()) as { id: string; issueIds: string[] };
    const issueId = votingEvent.issueIds[0]!;

    // Alice delegates to Bob
    await vcp.requestAs(alice!.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: bob!.id,
      topicScope: [],
    });

    // Both vote directly — Alice's direct vote overrides delegation
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: alice!.id,
      issueId,
      choice: "for",
    });
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: bob!.id,
      issueId,
      choice: "against",
    });

    // Tally should show each with weight 1 (override rule)
    const tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${votingEvent.id}/tally`);
    const tallyData = (await tallyRes.json()) as {
      tallies: Array<{ counts: Record<string, number>; totalVotes: number }>;
    };
    const tally = tallyData.tallies[0]!;

    expect(tally.counts["for"]).toBe(1); // Alice's own weight
    expect(tally.counts["against"]).toBe(1); // Bob's own weight (no longer carries Alice)
    expect(tally.totalVotes).toBe(2);
  });

  it("one-person-one-vote: total weight equals participating voters", async () => {
    // Setup: 5 participants, various delegations, 3 vote directly
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "OPOV Test",
      preset: "LIQUID_STANDARD",
    });
    const assembly = (await asmRes.json()) as { id: string };
    const asmId = assembly.id;

    const names = ["A", "B", "C", "D", "E"];
    const ps: Array<{ id: string }> = [];
    for (const name of names) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      ps.push((await res.json()) as { id: string });
    }

    const now = Date.now();
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "OPOV",
      description: "",
      issues: [{ title: "Issue", description: "", topicIds: [] }],
      eligibleParticipantIds: ps.map((p) => p.id),
      timeline: {
        deliberationStart: now - 86400000,
        votingStart: now - 3600000,
        votingEnd: now + 86400000,
      },
    });
    const votingEvent = (await eventRes.json()) as { id: string; issueIds: string[] };
    const issueId = votingEvent.issueIds[0]!;

    // Delegations: A→C, B→C, D→E
    await vcp.requestAs(ps[0]!.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: ps[2]!.id, topicScope: [],
    });
    await vcp.requestAs(ps[1]!.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: ps[2]!.id, topicScope: [],
    });
    await vcp.requestAs(ps[3]!.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: ps[4]!.id, topicScope: [],
    });

    // C and E vote (they carry delegations)
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: ps[2]!.id, issueId, choice: "for",
    });
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: ps[4]!.id, issueId, choice: "against",
    });

    const tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${votingEvent.id}/tally`);
    const tallyData = (await tallyRes.json()) as {
      tallies: Array<{ counts: Record<string, number>; totalVotes: number; participatingCount: number }>;
    };
    const tally = tallyData.tallies[0]!;

    // C has weight 3 (self + A + B), E has weight 2 (self + D) = total 5
    // All 5 participants are "participating" through voting or delegation
    expect(tally.counts["for"]).toBe(3); // C's weight
    expect(tally.counts["against"]).toBe(2); // E's weight
    expect(tally.totalVotes).toBe(5);
    expect(tally.participatingCount).toBe(5);
  });
});
