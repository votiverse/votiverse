/**
 * Content lifecycle tests — proposals, candidacies, community notes.
 *
 * Tests the VCP-layer API for content metadata operations:
 * - Proposal submission during deliberation, rejection after votingStart
 * - Proposal versioning and withdrawal
 * - Candidacy declaration, versioning, withdrawal, reactivation
 * - Community note creation, evaluation, withdrawal, visibility
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

const DAY = 86_400_000;

describe("Content lifecycle — proposals", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let issueId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly with LIQUID_ACCOUNTABLE (community notes enabled)
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Content Test",
      preset: "LIQUID_ACCOUNTABLE",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    // Add participants
    const aliceRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Alice" });
    alice = (await aliceRes.json()) as { id: string };
    const bobRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Bob" });
    bob = (await bobRes.json()) as { id: string };

    // Create voting event with deliberation window open
    const now = vcp.clock.now() as number;
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Budget Vote",
      description: "Test",
      issues: [{ title: "Fund the park?", description: "Test", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id],
      timeline: {
        deliberationStart: now - 7 * DAY,
        votingStart: now + 3 * DAY,
        votingEnd: now + 10 * DAY,
      },
    });
    const event = (await eventRes.json()) as { issueIds: string[] };
    issueId = event.issueIds[0]!;
  });

  afterEach(() => { vcp.cleanup(); });

  it("submits a proposal during deliberation", async () => {
    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId,
      choiceKey: "for",
      title: "Fund the Park",
      contentHash: "abc123",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; title: string };
    expect(body.status).toBe("submitted");
    expect(body.title).toBe("Fund the Park");
    expect(body.id).toBeDefined();
  });

  it("lists proposals by issue", async () => {
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, title: "Pro", contentHash: "h1",
    });
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, choiceKey: "against", title: "Con", contentHash: "h2",
    });

    const res = await vcp.request("GET", `/assemblies/${asmId}/proposals?issueId=${issueId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proposals: unknown[] };
    expect(body.proposals).toHaveLength(2);
  });

  it("gets proposal with version history", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, title: "Proposal", contentHash: "v1",
    });
    const { id: proposalId } = (await createRes.json()) as { id: string };

    // Add a version
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/version`, {
      contentHash: "v2",
    });

    const res = await vcp.request("GET", `/assemblies/${asmId}/proposals/${proposalId}`);
    const body = (await res.json()) as { currentVersion: number; versions: unknown[] };
    expect(body.currentVersion).toBe(2);
    expect(body.versions).toHaveLength(2);
  });

  it("rejects proposal submission after voting starts", async () => {
    vcp.clock.advance(4 * DAY); // past votingStart

    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, title: "Late", contentHash: "late",
    });
    expect(res.status).toBe(409); // GovernanceRuleViolation
  });

  it("withdraws a submitted proposal", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId, title: "To Withdraw", contentHash: "h1",
    });
    const { id: proposalId } = (await createRes.json()) as { id: string };

    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/withdraw`);
    expect(res.status).toBe(200);

    const getRes = await vcp.request("GET", `/assemblies/${asmId}/proposals/${proposalId}`);
    const body = (await getRes.json()) as { status: string };
    expect(body.status).toBe("withdrawn");
  });
});

describe("Content lifecycle — candidacies", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };

  beforeEach(async () => {
    vcp = await createTestVCP();
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Candidacy Test",
      preset: "LIQUID_ACCOUNTABLE",
    });
    asmId = ((await asmRes.json()) as { id: string }).id;

    const aliceRes = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Alice" });
    alice = (await aliceRes.json()) as { id: string };
  });

  afterEach(() => { vcp.cleanup(); });

  it("declares a candidacy", async () => {
    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [],
      voteTransparencyOptIn: true,
      contentHash: "profile-v1",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; voteTransparencyOptIn: boolean };
    expect(body.status).toBe("active");
    expect(body.voteTransparencyOptIn).toBe(true);
  });

  it("versions and withdraws a candidacy", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [],
      voteTransparencyOptIn: false,
      contentHash: "v1",
    });
    const { id: candId } = (await createRes.json()) as { id: string };

    // New version
    const versionRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/candidacies/${candId}/version`, {
      contentHash: "v2",
      voteTransparencyOptIn: true,
    });
    expect(versionRes.status).toBe(200);

    // Withdraw
    const withdrawRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/candidacies/${candId}/withdraw`);
    expect(withdrawRes.status).toBe(200);

    const getRes = await vcp.request("GET", `/assemblies/${asmId}/candidacies/${candId}`);
    const body = (await getRes.json()) as { status: string; versions: unknown[] };
    expect(body.status).toBe("withdrawn");
    expect(body.versions).toHaveLength(2);
  });

  it("lists active candidacies", async () => {
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [], voteTransparencyOptIn: false, contentHash: "h1",
    });

    const res = await vcp.request("GET", `/assemblies/${asmId}/candidacies?status=active`);
    const body = (await res.json()) as { candidacies: unknown[] };
    expect(body.candidacies).toHaveLength(1);
  });
});

describe("Content lifecycle — community notes", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };
  let dave: { id: string };

  beforeEach(async () => {
    vcp = await createTestVCP();
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Notes Test",
      preset: "LIQUID_ACCOUNTABLE",
    });
    asmId = ((await asmRes.json()) as { id: string }).id;

    const participants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      participants.push((await res.json()) as { id: string });
    }
    [alice, bob, carol, dave] = participants as [{ id: string }, { id: string }, { id: string }, { id: string }];
  });

  afterEach(() => { vcp.cleanup(); });

  it("creates a community note", async () => {
    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "note-hash",
      targetType: "proposal",
      targetId: "prop-1",
      targetVersionNumber: 1,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; target: { type: string } };
    expect(body.status).toBe("proposed");
    expect(body.target.type).toBe("proposal");
  });

  it("evaluates a note and updates materialized counts", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h1", targetType: "proposal", targetId: "p1",
    });
    const { id: noteId } = (await createRes.json()) as { id: string };

    // Endorse
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/notes/${noteId}/evaluate`, {
      evaluation: "endorse",
    });
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/notes/${noteId}/evaluate`, {
      evaluation: "endorse",
    });
    await vcp.requestAs(dave.id, "POST", `/assemblies/${asmId}/notes/${noteId}/evaluate`, {
      evaluation: "dispute",
    });

    // Check materialized counts
    const getRes = await vcp.request("GET", `/assemblies/${asmId}/notes/${noteId}`);
    const body = (await getRes.json()) as {
      endorsementCount: number;
      disputeCount: number;
      visibility: { visible: boolean; ratio: number };
    };
    expect(body.endorsementCount).toBe(2);
    expect(body.disputeCount).toBe(1);
    expect(body.visibility.visible).toBe(true);
    expect(body.visibility.ratio).toBeCloseTo(0.667, 2);
  });

  it("changing evaluation updates counts correctly", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h1", targetType: "proposal", targetId: "p1",
    });
    const { id: noteId } = (await createRes.json()) as { id: string };

    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/notes/${noteId}/evaluate`, {
      evaluation: "endorse",
    });
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/notes/${noteId}/evaluate`, {
      evaluation: "dispute",
    });

    const getRes = await vcp.request("GET", `/assemblies/${asmId}/notes/${noteId}`);
    const body = (await getRes.json()) as { endorsementCount: number; disputeCount: number };
    expect(body.endorsementCount).toBe(0);
    expect(body.disputeCount).toBe(1);
  });

  it("rejects self-evaluation", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h1", targetType: "proposal", targetId: "p1",
    });
    const { id: noteId } = (await createRes.json()) as { id: string };

    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes/${noteId}/evaluate`, {
      evaluation: "endorse",
    });
    expect(res.status).toBe(400); // ValidationError
  });

  it("withdraws a note", async () => {
    const createRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h1", targetType: "proposal", targetId: "p1",
    });
    const { id: noteId } = (await createRes.json()) as { id: string };

    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes/${noteId}/withdraw`);
    expect(res.status).toBe(200);

    const getRes = await vcp.request("GET", `/assemblies/${asmId}/notes/${noteId}`);
    const body = (await getRes.json()) as { status: string };
    expect(body.status).toBe("withdrawn");
  });

  it("lists notes by target", async () => {
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h1", targetType: "proposal", targetId: "p1",
    });
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h2", targetType: "proposal", targetId: "p1",
    });
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/notes`, {
      contentHash: "h3", targetType: "candidacy", targetId: "c1",
    });

    const res = await vcp.request("GET", `/assemblies/${asmId}/notes?targetType=proposal&targetId=p1`);
    const body = (await res.json()) as { notes: unknown[] };
    expect(body.notes).toHaveLength(2);
  });
});
