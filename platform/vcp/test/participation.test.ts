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
    vcp = await createTestVCP();

    // Create assembly with custom config: public ballot + candidacy=true (public delegation visibility)
    const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
      ballot: { secret: false, liveResults: true },
    });
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Participation Test",
      config,
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

    // Create a voting event with voting window open (votingEnd in the future)
    const now = Date.now();
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Participation Test Event",
      description: "",
      issues: [{ title: "Issue 1", description: "", topicId: null }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id, dave.id],
      timeline: {
        deliberationStart: now - 86400000 * 2,
        votingStart: now - 86400000,
        votingEnd: now + 3600000, // voting window open for 1 hour
      },
    });
    const event = (await eventRes.json()) as { id: string; issueIds: string[] };
    eventId = event.id;
    issueId = event.issueIds[0]!;
  });

  afterEach(() => {
    vcp.cleanup();
  });

  describe("public ballot (LIQUID_OPEN)", () => {
    it("returns direct participation with choice visible to anyone", async () => {
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

      // Carol asking about Alice — public ballot + public delegation visibility = visible
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
      await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "against",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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

    it("returns delegation chain", async () => {
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });
      await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: carol.id,
        topicScope: [],
      });
      await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

      const res1 = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/participation`);
      const data1 = (await res1.json()) as { participation: unknown[] };

      const res2 = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/participation`);
      const data2 = (await res2.json()) as { participation: unknown[] };

      expect(data1.participation).toEqual(data2.participation);
    });

    it("tally endpoint triggers materialization for closed events", async () => {
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/votes`, {
        issueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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

  describe("secret ballot filtering", () => {
    // Use a custom config: secret ballot + public delegation visibility (candidacy=false, transferable=true)
    // This isolates secrecy filtering from delegation visibility restrictions.
    let secretAsmId: string;
    let sAlice: { id: string };
    let sBob: { id: string };
    let sCarol: { id: string };
    let secretEventId: string;
    let secretIssueId: string;

    beforeEach(async () => {
      // Derive from LIQUID_OPEN: keep public delegation visibility (candidacy=false so private),
      // override ballot to secret. But LIQUID_OPEN has candidacy=false → private delegation visibility.
      // We need a preset with candidacy=true for public delegation visibility + secret ballot.
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { secret: true },
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
        issues: [{ title: "Secret Issue", description: "", topicId: null }],
        eligibleParticipantIds: [sAlice.id, sBob.id, sCarol.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
        },
      });
      const event = (await eventRes.json()) as { id: string; issueIds: string[] };
      secretEventId = event.id;
      secretIssueId = event.issueIds[0]!;
    });

    it("own direct vote: choice IS visible to self", async () => {
      await vcp.requestAs(sAlice.id, "POST", `/assemblies/${secretAsmId}/votes`, {
        issueId: secretIssueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      await vcp.requestAs(sAlice.id, "POST", `/assemblies/${secretAsmId}/votes`, {
        issueId: secretIssueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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

    it("delegated vote: choice VISIBLE to delegator (delegates always accountable)", async () => {
      await vcp.requestAs(sAlice.id, "POST", `/assemblies/${secretAsmId}/delegations`, {
        targetId: sBob.id,
        topicScope: [],
      });
      await vcp.requestAs(sBob.id, "POST", `/assemblies/${secretAsmId}/votes`, {
        issueId: secretIssueId,
        choice: "against",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

      // Alice asks about herself — delegated, delegates always accountable to delegators
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
      expect(record.effectiveChoice).toBe("against"); // delegates always accountable — delegator sees choice
      expect(record.delegateId).toBe(sBob.id); // structural info is visible
    });

    it("spy prevention: delegating to learn someone's secret vote fails", async () => {
      // Carol delegates to Alice just to try to learn Alice's vote
      await vcp.requestAs(sCarol.id, "POST", `/assemblies/${secretAsmId}/delegations`, {
        targetId: sAlice.id,
        topicScope: [],
      });
      await vcp.requestAs(sAlice.id, "POST", `/assemblies/${secretAsmId}/votes`, {
        issueId: secretIssueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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

      // Carol sees she delegated, and CAN see what Alice voted
      // (delegates always accountable to delegators)
      expect(data.participation[0]!.status).toBe("delegated");
      expect(data.participation[0]!.effectiveChoice).toBe("for");
    });
  });

  describe("delegate accountability under secret ballot", () => {
    // Delegates are always accountable to their delegators in the new model.
    // Secret ballot + candidacy=true (public delegation visibility).
    let civicAsmId: string;
    let cAlice: { id: string };
    let cBob: { id: string };
    let cCarol: { id: string };
    let civicEventId: string;
    let civicIssueId: string;

    beforeEach(async () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { secret: true },
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
        issues: [{ title: "Civic Issue", description: "", topicId: null }],
        eligibleParticipantIds: [cAlice.id, cBob.id, cCarol.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
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
      await vcp.requestAs(cBob.id, "POST", `/assemblies/${civicAsmId}/votes`, {
        issueId: civicIssueId,
        choice: "against",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      await vcp.requestAs(cBob.id, "POST", `/assemblies/${civicAsmId}/votes`, {
        issueId: civicIssueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      await vcp.requestAs(cAlice.id, "POST", `/assemblies/${civicAsmId}/votes`, {
        issueId: civicIssueId,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
      // LIQUID_OPEN has private delegation visibility (candidacy=false)
      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "Private Delegation",
        preset: "LIQUID_OPEN",
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
        issues: [{ title: "Issue", description: "", topicId: null }],
        eligibleParticipantIds: [pAlice.id, pBob.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
        },
      });
      const event = (await eventRes.json()) as { id: string; issueIds: string[] };

      await vcp.requestAs(pAlice.id, "POST", `/assemblies/${privAsmId}/votes`, {
        issueId: event.issueIds[0]!,
        choice: "for",
      });

      // Advance clock past votingEnd so event is closed
      vcp.clock.advance(7200000);

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
