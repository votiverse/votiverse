/**
 * Participation record tests.
 *
 * Tests the materialized participation endpoint that tells each participant
 * how they participated in a vote (direct, delegated, or absent).
 * Also tests secrecy and visibility filtering.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPreset, deriveConfig } from "@votiverse/config";
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

    // Create assembly with LIQUID_STANDARD (public secrecy, public delegation visibility)
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

  describe("public secrecy (LIQUID_STANDARD)", () => {
    it("returns direct participation with choice visible to anyone", async () => {
      await vcp.request("POST", `/assemblies/${asmId}/votes`, {
        participantId: alice.id,
        issueId,
        choice: "for",
      });

      // Carol asking about Alice — public secrecy + public delegation visibility = visible
      const res = await vcp.request(
        "GET",
        `/assemblies/${asmId}/events/${eventId}/participation?participantId=${alice.id}`,
        undefined,
        { "X-Participant-Id": carol.id },
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

    it("returns delegated participation with delegate chain and choice", async () => {
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
        undefined,
        { "X-Participant-Id": alice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{
          status: string;
          effectiveChoice: string;
          delegateId: string;
          terminalVoterId: string;
          chain: string[];
        }>;
      };

      const record = data.participation[0]!;
      expect(record.status).toBe("delegated");
      expect(record.effectiveChoice).toBe("against");
      expect(record.delegateId).toBe(bob.id);
      expect(record.terminalVoterId).toBe(bob.id);
      expect(record.chain).toEqual([bob.id]);
    });

    it("returns transitive delegation chain", async () => {
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
        undefined,
        { "X-Participant-Id": alice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{
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
      expect(record.delegateId).toBe(bob.id);
      expect(record.terminalVoterId).toBe(carol.id);
      expect(record.chain).toEqual([bob.id, carol.id]);
    });

    it("returns absent for non-participating members", async () => {
      await vcp.request("POST", `/assemblies/${asmId}/votes`, {
        participantId: alice.id,
        issueId,
        choice: "for",
      });

      const res = await vcp.request(
        "GET",
        `/assemblies/${asmId}/events/${eventId}/participation?participantId=${dave.id}`,
        undefined,
        { "X-Participant-Id": dave.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown }>;
      };

      expect(data.participation[0]!.status).toBe("absent");
      expect(data.participation[0]!.effectiveChoice).toBeNull();
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

      expect(data.participation).toHaveLength(4);
      const statuses = new Map(data.participation.map((r) => [r.participantId, r.status]));
      expect(statuses.get(alice.id)).toBe("direct");
      expect(statuses.get(bob.id)).toBe("absent");
    });

    it("materialization is idempotent", async () => {
      await vcp.request("POST", `/assemblies/${asmId}/votes`, {
        participantId: alice.id,
        issueId,
        choice: "for",
      });

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

      await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/tally`);

      const res = await vcp.request(
        "GET",
        `/assemblies/${asmId}/events/${eventId}/participation?participantId=${alice.id}`,
        undefined,
        { "X-Participant-Id": alice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string }>;
      };
      expect(data.participation[0]!.status).toBe("direct");
    });
  });

  describe("secret ballot secrecy filtering", () => {
    // Use a custom config: secret secrecy + public delegation visibility
    // This isolates secrecy filtering from delegation visibility restrictions.
    let secretAsmId: string;
    let sAlice: { id: string };
    let sBob: { id: string };
    let sCarol: { id: string };
    let secretEventId: string;
    let secretIssueId: string;

    beforeEach(async () => {
      // Derive from LIQUID_STANDARD: keep public delegation visibility, override ballot to secret
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { secrecy: "secret", delegateVoteVisibility: "private" },
      });

      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "Secret Ballot Test",
        config,
      });
      const assembly = (await asmRes.json()) as { id: string };
      secretAsmId = assembly.id;

      const participants: Array<{ id: string }> = [];
      for (const name of ["Alice", "Bob", "Carol"]) {
        const res = await vcp.request("POST", `/assemblies/${secretAsmId}/participants`, { name });
        participants.push((await res.json()) as { id: string });
      }
      [sAlice, sBob, sCarol] = participants as [{ id: string }, { id: string }, { id: string }];

      const now = Date.now();
      const eventRes = await vcp.request("POST", `/assemblies/${secretAsmId}/events`, {
        title: "Secret Vote",
        description: "",
        issues: [{ title: "Secret Issue", description: "", topicIds: [] }],
        eligibleParticipantIds: [sAlice.id, sBob.id, sCarol.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now - 3600000,
        },
      });
      const event = (await eventRes.json()) as { id: string; issueIds: string[] };
      secretEventId = event.id;
      secretIssueId = event.issueIds[0]!;
    });

    it("own direct vote: choice IS visible to self", async () => {
      await vcp.request("POST", `/assemblies/${secretAsmId}/votes`, {
        participantId: sAlice.id,
        issueId: secretIssueId,
        choice: "for",
      });

      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/events/${secretEventId}/participation?participantId=${sAlice.id}`,
        undefined,
        { "X-Participant-Id": sAlice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown }>;
      };

      expect(data.participation[0]!.status).toBe("direct");
      expect(data.participation[0]!.effectiveChoice).toBe("for");
    });

    it("other's direct vote: choice is HIDDEN from others", async () => {
      await vcp.request("POST", `/assemblies/${secretAsmId}/votes`, {
        participantId: sAlice.id,
        issueId: secretIssueId,
        choice: "for",
      });

      // Bob asks about Alice — secret ballot, choice should be hidden
      // (delegation visibility is public so structural info is visible)
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/events/${secretEventId}/participation?participantId=${sAlice.id}`,
        undefined,
        { "X-Participant-Id": sBob.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown }>;
      };

      expect(data.participation[0]!.status).toBe("direct");
      expect(data.participation[0]!.effectiveChoice).toBeNull(); // secret = hidden from others
    });

    it("delegated vote: choice HIDDEN when delegateVoteVisibility is private", async () => {
      await vcp.requestAs(sAlice.id, "POST", `/assemblies/${secretAsmId}/delegations`, {
        targetId: sBob.id,
        topicScope: [],
      });
      await vcp.request("POST", `/assemblies/${secretAsmId}/votes`, {
        participantId: sBob.id,
        issueId: secretIssueId,
        choice: "against",
      });

      // Alice asks about herself — delegated, but delegateVoteVisibility=private
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/events/${secretEventId}/participation?participantId=${sAlice.id}`,
        undefined,
        { "X-Participant-Id": sAlice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown; delegateId: unknown }>;
      };

      const record = data.participation[0]!;
      expect(record.status).toBe("delegated");
      expect(record.effectiveChoice).toBeNull(); // private = can't see delegate's choice
      expect(record.delegateId).toBe(sBob.id); // structural info is visible
    });

    it("spy prevention: delegating to learn someone's secret vote fails", async () => {
      // Carol delegates to Alice just to try to learn Alice's vote
      await vcp.requestAs(sCarol.id, "POST", `/assemblies/${secretAsmId}/delegations`, {
        targetId: sAlice.id,
        topicScope: [],
      });
      await vcp.request("POST", `/assemblies/${secretAsmId}/votes`, {
        participantId: sAlice.id,
        issueId: secretIssueId,
        choice: "for",
      });

      // Carol checks her own participation — she delegated to Alice
      const res = await vcp.request(
        "GET",
        `/assemblies/${secretAsmId}/events/${secretEventId}/participation?participantId=${sCarol.id}`,
        undefined,
        { "X-Participant-Id": sCarol.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown }>;
      };

      // Carol sees she delegated, but NOT what Alice voted (secret + private)
      expect(data.participation[0]!.status).toBe("delegated");
      expect(data.participation[0]!.effectiveChoice).toBeNull();
    });
  });

  describe("delegators-only delegate vote visibility", () => {
    // Custom config: secret secrecy + delegators-only + public delegation visibility
    let civicAsmId: string;
    let cAlice: { id: string };
    let cBob: { id: string };
    let cCarol: { id: string };
    let civicEventId: string;
    let civicIssueId: string;

    beforeEach(async () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { secrecy: "secret", delegateVoteVisibility: "delegators-only" },
      });

      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "Delegators-Only Test",
        config,
      });
      const assembly = (await asmRes.json()) as { id: string };
      civicAsmId = assembly.id;

      const participants: Array<{ id: string }> = [];
      for (const name of ["Alice", "Bob", "Carol"]) {
        const res = await vcp.request("POST", `/assemblies/${civicAsmId}/participants`, { name });
        participants.push((await res.json()) as { id: string });
      }
      [cAlice, cBob, cCarol] = participants as [{ id: string }, { id: string }, { id: string }];

      const now = Date.now();
      const eventRes = await vcp.request("POST", `/assemblies/${civicAsmId}/events`, {
        title: "Civic Vote",
        description: "",
        issues: [{ title: "Civic Issue", description: "", topicIds: [] }],
        eligibleParticipantIds: [cAlice.id, cBob.id, cCarol.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now - 3600000,
        },
      });
      const event = (await eventRes.json()) as { id: string; issueIds: string[] };
      civicEventId = event.id;
      civicIssueId = event.issueIds[0]!;
    });

    it("delegator CAN see delegate's choice", async () => {
      await vcp.requestAs(cAlice.id, "POST", `/assemblies/${civicAsmId}/delegations`, {
        targetId: cBob.id,
        topicScope: [],
      });
      await vcp.request("POST", `/assemblies/${civicAsmId}/votes`, {
        participantId: cBob.id,
        issueId: civicIssueId,
        choice: "against",
      });

      // Alice is the delegator — she CAN see the choice under "delegators-only"
      const res = await vcp.request(
        "GET",
        `/assemblies/${civicAsmId}/events/${civicEventId}/participation?participantId=${cAlice.id}`,
        undefined,
        { "X-Participant-Id": cAlice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown }>;
      };

      expect(data.participation[0]!.status).toBe("delegated");
      expect(data.participation[0]!.effectiveChoice).toBe("against"); // visible to delegator
    });

    it("non-delegator CANNOT see another's choice", async () => {
      await vcp.request("POST", `/assemblies/${civicAsmId}/votes`, {
        participantId: cBob.id,
        issueId: civicIssueId,
        choice: "for",
      });

      // Carol asks about Bob — not her record, secret ballot
      const res = await vcp.request(
        "GET",
        `/assemblies/${civicAsmId}/events/${civicEventId}/participation?participantId=${cBob.id}`,
        undefined,
        { "X-Participant-Id": cCarol.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ status: string; effectiveChoice: unknown }>;
      };

      expect(data.participation[0]!.status).toBe("direct");
      expect(data.participation[0]!.effectiveChoice).toBeNull(); // secret ballot, not your record
    });

    it("own direct vote visible under secret ballot", async () => {
      await vcp.request("POST", `/assemblies/${civicAsmId}/votes`, {
        participantId: cAlice.id,
        issueId: civicIssueId,
        choice: "for",
      });

      const res = await vcp.request(
        "GET",
        `/assemblies/${civicAsmId}/events/${civicEventId}/participation?participantId=${cAlice.id}`,
        undefined,
        { "X-Participant-Id": cAlice.id },
      );
      const data = (await res.json()) as {
        participation: Array<{ effectiveChoice: unknown }>;
      };

      expect(data.participation[0]!.effectiveChoice).toBe("for"); // you know your own vote
    });
  });

  describe("private delegation visibility mode", () => {
    it("blocks querying another participant's participation", async () => {
      // CIVIC_PARTICIPATORY has private delegation visibility
      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "Private Delegation",
        preset: "CIVIC_PARTICIPATORY",
      });
      const assembly = (await asmRes.json()) as { id: string };
      const privAsmId = assembly.id;

      const participants: Array<{ id: string }> = [];
      for (const name of ["Alice", "Bob"]) {
        const res = await vcp.request("POST", `/assemblies/${privAsmId}/participants`, { name });
        participants.push((await res.json()) as { id: string });
      }
      const [pAlice, pBob] = participants as [{ id: string }, { id: string }];

      const now = Date.now();
      const eventRes = await vcp.request("POST", `/assemblies/${privAsmId}/events`, {
        title: "Private Event",
        description: "",
        issues: [{ title: "Issue", description: "", topicIds: [] }],
        eligibleParticipantIds: [pAlice.id, pBob.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now - 3600000,
        },
      });
      const event = (await eventRes.json()) as { id: string; issueIds: string[] };

      await vcp.request("POST", `/assemblies/${privAsmId}/votes`, {
        participantId: pAlice.id,
        issueId: event.issueIds[0]!,
        choice: "for",
      });

      // Bob tries to query Alice's participation — should be 403
      const res = await vcp.request(
        "GET",
        `/assemblies/${privAsmId}/events/${event.id}/participation?participantId=${pAlice.id}`,
        undefined,
        { "X-Participant-Id": pBob.id },
      );
      expect(res.status).toBe(403);
    });
  });
});
