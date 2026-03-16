/**
 * Multi-tenancy test — operations on one assembly are invisible to another.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Multi-tenancy isolation", () => {
  let vcp: TestVCP;

  beforeEach(() => {
    vcp = createTestVCP();
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("assemblies are isolated from each other", async () => {
    // Create two assemblies
    const asm1Res = await vcp.request("POST", "/assemblies", {
      name: "Assembly One",
      preset: "LIQUID_STANDARD",
    });
    const asm1 = (await asm1Res.json()) as { id: string };

    const asm2Res = await vcp.request("POST", "/assemblies", {
      name: "Assembly Two",
      preset: "LIQUID_STANDARD",
    });
    const asm2 = (await asm2Res.json()) as { id: string };

    // Add participants to assembly 1
    const p1Res = await vcp.request("POST", `/assemblies/${asm1.id}/participants`, { name: "Alice" });
    expect(p1Res.status).toBe(201);
    const alice = (await p1Res.json()) as { id: string };

    // Add different participant to assembly 2
    const p2Res = await vcp.request("POST", `/assemblies/${asm2.id}/participants`, { name: "Zara" });
    expect(p2Res.status).toBe(201);

    // Verify assembly 1 participants don't appear in assembly 2
    const list1 = await vcp.request("GET", `/assemblies/${asm1.id}/participants`);
    const data1 = (await list1.json()) as { participants: Array<{ name: string }> };
    expect(data1.participants).toHaveLength(1);
    expect(data1.participants[0]!.name).toBe("Alice");

    const list2 = await vcp.request("GET", `/assemblies/${asm2.id}/participants`);
    const data2 = (await list2.json()) as { participants: Array<{ name: string }> };
    expect(data2.participants).toHaveLength(1);
    expect(data2.participants[0]!.name).toBe("Zara");

    // Create a voting event in assembly 1
    const now = Date.now();
    const evtRes = await vcp.request("POST", `/assemblies/${asm1.id}/events`, {
      title: "Assembly 1 Event",
      description: "",
      issues: [{ title: "Issue", description: "", topicIds: [] }],
      eligibleParticipantIds: [alice.id],
      timeline: {
        deliberationStart: now - 86400000,
        votingStart: now - 3600000,
        votingEnd: now + 86400000,
      },
    });
    expect(evtRes.status).toBe(201);
    const evt = (await evtRes.json()) as { id: string };

    // Verify the event exists in assembly 1
    const getEvt1 = await vcp.request("GET", `/assemblies/${asm1.id}/events/${evt.id}`);
    expect(getEvt1.status).toBe(200);

    // Verify the event does NOT exist in assembly 2
    const getEvt2 = await vcp.request("GET", `/assemblies/${asm2.id}/events/${evt.id}`);
    expect(getEvt2.status).toBe(404);
  });

  it("events in one assembly don't affect tallies in another", async () => {
    // Create two assemblies with same participant names
    const asm1Res = await vcp.request("POST", "/assemblies", {
      name: "Assembly A",
      preset: "LIQUID_STANDARD",
    });
    const asm1 = (await asm1Res.json()) as { id: string };

    const asm2Res = await vcp.request("POST", "/assemblies", {
      name: "Assembly B",
      preset: "LIQUID_STANDARD",
    });
    const asm2 = (await asm2Res.json()) as { id: string };

    // Add Alice to both
    const alice1 = (await (await vcp.request("POST", `/assemblies/${asm1.id}/participants`, { name: "Alice" })).json()) as { id: string };
    const alice2 = (await (await vcp.request("POST", `/assemblies/${asm2.id}/participants`, { name: "Alice" })).json()) as { id: string };

    // Create events in both
    const now = Date.now();
    const timeline = {
      deliberationStart: now - 86400000,
      votingStart: now - 3600000,
      votingEnd: now + 86400000,
    };

    const evt1 = (await (await vcp.request("POST", `/assemblies/${asm1.id}/events`, {
      title: "Event A",
      description: "",
      issues: [{ title: "Issue A", description: "", topicIds: [] }],
      eligibleParticipantIds: [alice1.id],
      timeline,
    })).json()) as { id: string; issueIds: string[] };

    const evt2 = (await (await vcp.request("POST", `/assemblies/${asm2.id}/events`, {
      title: "Event B",
      description: "",
      issues: [{ title: "Issue B", description: "", topicIds: [] }],
      eligibleParticipantIds: [alice2.id],
      timeline,
    })).json()) as { id: string; issueIds: string[] };

    // Vote "for" in assembly 1
    await vcp.requestAs(alice1.id, "POST", `/assemblies/${asm1.id}/votes`, {
      issueId: evt1.issueIds[0],
      choice: "for",
    });

    // Vote "against" in assembly 2
    await vcp.requestAs(alice2.id, "POST", `/assemblies/${asm2.id}/votes`, {
      issueId: evt2.issueIds[0],
      choice: "against",
    });

    // Verify tallies are independent
    const tally1 = (await (await vcp.request("GET", `/assemblies/${asm1.id}/events/${evt1.id}/tally`)).json()) as {
      tallies: Array<{ counts: Record<string, number> }>;
    };
    expect(tally1.tallies[0]!.counts["for"]).toBe(1);
    expect(tally1.tallies[0]!.counts["against"]).toBeUndefined();

    const tally2 = (await (await vcp.request("GET", `/assemblies/${asm2.id}/events/${evt2.id}/tally`)).json()) as {
      tallies: Array<{ counts: Record<string, number> }>;
    };
    expect(tally2.tallies[0]!.counts["against"]).toBe(1);
    expect(tally2.tallies[0]!.counts["for"]).toBeUndefined();
  });
});
