/**
 * Participation record tests.
 *
 * Tests the materialized participation endpoint that tells each participant
 * how they participated in a vote (direct, delegated, or absent).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Participation records", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };
  let dave: { id: string };
  let eventId: string;
  let issueId: string;

  beforeEach(async () => {
    vcp = createTestVCP();

    // Create assembly
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Participation Test",
      preset: "LIQUID_STANDARD",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    // Add participants
    const participants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      participants.push((await res.json()) as { id: string });
    }
    [alice, bob, carol, dave] = participants as [{ id: string }, { id: string }, { id: string }, { id: string }];

    // Create a voting event with voting already closed (votingEnd in the past)
    const now = Date.now();
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Participation Test Event",
      description: "",
      issues: [{ title: "Issue 1", description: "", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id, dave.id],
      timeline: {
        deliberationStart: now - 86400000 * 2,
        votingStart: now - 86400000,
        votingEnd: now - 3600000, // closed 1 hour ago
      },
    });
    const event = (await eventRes.json()) as { id: string; issueIds: string[] };
    eventId = event.id;
    issueId = event.issueIds[0]!;
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("returns direct participation for direct voters", async () => {
    // Alice votes directly
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: alice.id,
      issueId,
      choice: "for",
    });

    const res = await vcp.request(
      "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${alice.id}`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      participation: Array<{
        participantId: string;
        status: string;
        effectiveChoice: string;
        delegateId: string | null;
        terminalVoterId: string | null;
        chain: string[];
      }>;
    };

    expect(data.participation).toHaveLength(1);
    const record = data.participation[0]!;
    expect(record.status).toBe("direct");
    expect(record.effectiveChoice).toBe("for");
    expect(record.delegateId).toBeNull();
    expect(record.terminalVoterId).toBe(alice.id);
    expect(record.chain).toEqual([]);
  });

  it("returns delegated participation with delegate chain", async () => {
    // Alice delegates to Bob, Bob votes
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: bob.id,
      topicScope: [],
    });
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: bob.id,
      issueId,
      choice: "against",
    });

    const res = await vcp.request(
      "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${alice.id}`,
    );
    const data = (await res.json()) as {
      participation: Array<{
        participantId: string;
        status: string;
        effectiveChoice: string;
        delegateId: string;
        terminalVoterId: string;
        chain: string[];
      }>;
    };

    expect(data.participation).toHaveLength(1);
    const record = data.participation[0]!;
    expect(record.status).toBe("delegated");
    expect(record.effectiveChoice).toBe("against"); // Bob's choice
    expect(record.delegateId).toBe(bob.id);
    expect(record.terminalVoterId).toBe(bob.id);
    expect(record.chain).toEqual([bob.id]);
  });

  it("returns transitive delegation chain", async () => {
    // Alice → Bob → Carol, Carol votes
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: bob.id,
      topicScope: [],
    });
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: carol.id,
      topicScope: [],
    });
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: carol.id,
      issueId,
      choice: "for",
    });

    const res = await vcp.request(
      "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${alice.id}`,
    );
    const data = (await res.json()) as {
      participation: Array<{
        participantId: string;
        status: string;
        effectiveChoice: string;
        delegateId: string;
        terminalVoterId: string;
        chain: string[];
      }>;
    };

    const record = data.participation[0]!;
    expect(record.status).toBe("delegated");
    expect(record.effectiveChoice).toBe("for");
    expect(record.delegateId).toBe(bob.id); // first hop
    expect(record.terminalVoterId).toBe(carol.id);
    expect(record.chain).toEqual([bob.id, carol.id]);
  });

  it("returns absent for non-participating members", async () => {
    // Only Alice votes, Dave does nothing
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: alice.id,
      issueId,
      choice: "for",
    });

    const res = await vcp.request(
      "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${dave.id}`,
    );
    const data = (await res.json()) as {
      participation: Array<{
        participantId: string;
        status: string;
        effectiveChoice: unknown;
        delegateId: unknown;
        terminalVoterId: unknown;
        chain: string[];
      }>;
    };

    const record = data.participation[0]!;
    expect(record.status).toBe("absent");
    expect(record.effectiveChoice).toBeNull();
    expect(record.delegateId).toBeNull();
    expect(record.terminalVoterId).toBeNull();
  });

  it("returns all participants when no participantId filter", async () => {
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: alice.id,
      issueId,
      choice: "for",
    });

    const res = await vcp.request(
      "GET",
      `/assemblies/${asmId}/events/${eventId}/participation`,
    );
    const data = (await res.json()) as {
      participation: Array<{ participantId: string; status: string }>;
    };

    // All 4 eligible participants should have records
    expect(data.participation).toHaveLength(4);
    const statuses = new Map(data.participation.map((r) => [r.participantId, r.status]));
    expect(statuses.get(alice.id)).toBe("direct");
    expect(statuses.get(bob.id)).toBe("absent");
    expect(statuses.get(carol.id)).toBe("absent");
    expect(statuses.get(dave.id)).toBe("absent");
  });

  it("materialization is idempotent — same results on repeated calls", async () => {
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: alice.id,
      issueId,
      choice: "for",
    });

    // Call twice
    const res1 = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/participation`);
    const data1 = (await res1.json()) as { participation: unknown[] };

    const res2 = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/participation`);
    const data2 = (await res2.json()) as { participation: unknown[] };

    expect(data1.participation).toEqual(data2.participation);
  });

  it("tally endpoint triggers materialization for closed events", async () => {
    await vcp.request("POST", `/assemblies/${asmId}/votes`, {
      participantId: alice.id,
      issueId,
      choice: "for",
    });

    // Call tally first (should trigger materialization)
    await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/tally`);

    // Now participation should be available
    const res = await vcp.request(
      "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${alice.id}`,
    );
    const data = (await res.json()) as {
      participation: Array<{ status: string }>;
    };
    expect(data.participation[0]!.status).toBe("direct");
  });
});
