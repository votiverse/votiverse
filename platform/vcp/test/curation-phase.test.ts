/**
 * Curation phase enforcement tests — validates the deliberation → curation → voting lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

const DAY = 86_400_000;

describe("Curation phase enforcement", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let issueId: string;
  let eventId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly with MODERN_DEMOCRACY (7d deliberation, 2d curation, 7d voting)
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Curation Phase Test",
      preset: "MODERN_DEMOCRACY",
    });
    asmId = ((await asmRes.json()) as { id: string }).id;

    const aliceRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Alice" });
    alice = (await aliceRes.json()) as { id: string };
    const bobRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Bob" });
    bob = (await bobRes.json()) as { id: string };

    // Grant Alice admin for curation
    await vcp.manager.grantRole(asmId, alice.id, "owner", alice.id);
  });

  afterEach(() => { vcp.cleanup(); });

  describe("startDate-based timeline computation", () => {
    it("computes timeline from startDate and assembly config", async () => {
      const startDate = vcp.clock.now() as number;

      const eventRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/events`, {
        title: "Auto-timeline Event",
        description: "Test",
        issues: [{ title: "Issue 1", description: "Test", topicId: null }],
        eligibleParticipantIds: [alice.id, bob.id],
        startDate,
      });
      expect(eventRes.status).toBe(201);
      const event = (await eventRes.json()) as {
        id: string;
        timeline: { deliberationStart: string; votingStart: string; votingEnd: string };
      };

      const deliberationStart = new Date(event.timeline.deliberationStart).getTime();
      const votingStart = new Date(event.timeline.votingStart).getTime();
      const votingEnd = new Date(event.timeline.votingEnd).getTime();

      // MODERN_DEMOCRACY: 7d deliberation + 2d curation + 7d voting
      expect(deliberationStart).toBe(startDate);
      expect(votingStart).toBe(startDate + (7 + 2) * DAY);
      expect(votingEnd).toBe(startDate + (7 + 2 + 7) * DAY);
    });
  });

  describe("phase transitions", () => {
    let proposalId: string;

    beforeEach(async () => {
      // Create event with deliberation starting 3 days ago (solidly in deliberation for 7-day config)
      const now = vcp.clock.now() as number;
      const eventRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/events`, {
        title: "Phase Test",
        description: "Test",
        issues: [{ title: "Issue", description: "Test", topicId: null }],
        eligibleParticipantIds: [alice.id, bob.id],
        timeline: {
          deliberationStart: now - 3 * DAY,
          votingStart: now + 6 * DAY, // 9 days total = 7 deliberation + 2 curation
          votingEnd: now + 13 * DAY,
        },
      });
      const event = (await eventRes.json()) as { id: string; issueIds: string[] };
      eventId = event.id;
      issueId = event.issueIds[0]!;

      // Submit a proposal during deliberation
      const propRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
        issueId, choiceKey: "for", title: "Test Proposal", contentHash: "hash1",
      });
      proposalId = ((await propRes.json()) as { id: string }).id;
    });

    it("allows proposals and endorsements during deliberation", async () => {
      // We're 3 days into a 7-day deliberation — should be allowed
      const propRes = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals`, {
        issueId, choiceKey: "against", title: "Another Proposal", contentHash: "hash2",
      });
      expect(propRes.status).toBe(201);

      const endorseRes = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
        evaluation: "endorse",
      });
      expect(endorseRes.status).toBe(200);
    });

    it("rejects proposals during curation phase", async () => {
      // Advance to curation phase: deliberation started 3 days ago, ends at +4 days from now
      vcp.clock.advance(5 * DAY); // now 5 days later → 8 days into the event → curation phase

      const propRes = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals`, {
        issueId, choiceKey: "against", title: "Late Proposal", contentHash: "hash3",
      });
      expect(propRes.status).toBe(409);
      const body = (await propRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("CURATION_PHASE");
    });

    it("rejects endorsements during curation phase", async () => {
      vcp.clock.advance(5 * DAY); // into curation

      const endorseRes = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
        evaluation: "endorse",
      });
      expect(endorseRes.status).toBe(409);
      const body = (await endorseRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("ENDORSEMENTS_FROZEN");
    });

    it("allows admin curation during curation phase", async () => {
      vcp.clock.advance(5 * DAY); // into curation

      // Featuring should still work during curation
      const featureRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/feature`);
      expect(featureRes.status).toBe(200);

      // Recommendations should work too
      const recRes = await vcp.requestAs(alice.id, "POST",
        `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
        { contentHash: "rec-hash" },
      );
      expect(recRes.status).toBe(201);
    });

    it("proposals show as locked during curation phase", async () => {
      vcp.clock.advance(5 * DAY); // into curation

      const listRes = await vcp.request("GET", `/assemblies/${asmId}/proposals?issueId=${issueId}`);
      const body = (await listRes.json()) as { proposals: Array<{ id: string; status: string }> };
      const proposal = body.proposals.find((p) => p.id === proposalId);
      expect(proposal?.status).toBe("locked");
    });
  });

  describe("no-curation assembly (curationDays=0)", () => {
    it("transitions directly from deliberation to voting without curation phase", async () => {
      // Create assembly with TOWN_HALL (0 curation days)
      const asmRes = await vcp.request("POST", "/assemblies", {
        name: "No-Curation Test",
        preset: "TOWN_HALL",
      });
      const noCurAsmId = ((await asmRes.json()) as { id: string }).id;

      const p1Res = await vcp.request("POST", `/assemblies/${noCurAsmId}/participants`, { name: "Dave" });
      const dave = (await p1Res.json()) as { id: string };

      const now = vcp.clock.now() as number;
      // TOWN_HALL: 7d deliberation, 0d curation, 7d voting
      // Start deliberation 8 days ago → deliberation ended 1 day ago → should be in voting
      const eventRes = await vcp.request("POST", `/assemblies/${noCurAsmId}/events`, {
        title: "Direct Vote",
        description: "Test",
        issues: [{ title: "Issue", description: "Test", topicId: null }],
        eligibleParticipantIds: [dave.id],
        timeline: {
          deliberationStart: now - 8 * DAY,
          votingStart: now - 1 * DAY, // no curation gap
          votingEnd: now + 6 * DAY,
        },
      });
      const event = (await eventRes.json()) as { issueIds: string[] };
      const iid = event.issueIds[0]!;

      // Should be in voting phase — proposals rejected but NOT with CURATION_PHASE code
      const propRes = await vcp.requestAs(dave.id, "POST", `/assemblies/${noCurAsmId}/proposals`, {
        issueId: iid, title: "Late", contentHash: "h1",
      });
      // The engine or VCP rejects the proposal, but the code should NOT be CURATION_PHASE
      const body = (await propRes.json()) as { error?: { code?: string } };
      expect(body.error?.code).not.toBe("CURATION_PHASE");
    });
  });
});
