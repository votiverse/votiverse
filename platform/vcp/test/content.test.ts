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

    // Create assembly with LIQUID_DELEGATION (community notes enabled)
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Content Test",
      preset: "LIQUID_DELEGATION",
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
      issues: [{ title: "Fund the park?", description: "Test", topicId: null }],
      eligibleParticipantIds: [alice.id, bob.id],
      timeline: {
        deliberationStart: now - 3 * DAY,
        votingStart: now + 7 * DAY,
        votingEnd: now + 14 * DAY,
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
      preset: "LIQUID_DELEGATION",
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
      preset: "LIQUID_DELEGATION",
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

describe("Proposal endorsements and curation", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };
  let dave: { id: string };
  let issueId: string;
  let eventId: string;
  let proposalId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Endorsement Test",
      preset: "LIQUID_DELEGATION",
    });
    asmId = ((await asmRes.json()) as { id: string }).id;

    const participants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      participants.push((await res.json()) as { id: string });
    }
    [alice, bob, carol, dave] = participants as [{ id: string }, { id: string }, { id: string }, { id: string }];

    // Grant Alice admin role (needed for curation: featuring proposals, recommendations)
    await vcp.manager.grantRole(asmId, alice.id, "owner", alice.id);

    // Create event with Alice as creator (via X-Participant-Id header)
    const now = vcp.clock.now() as number;
    const eventRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/events`, {
      title: "Endorsement Vote",
      description: "Test",
      issues: [{ title: "Should we endorse?", description: "Test", topicId: null }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id, dave.id],
      timeline: {
        deliberationStart: now - 3 * DAY,
        votingStart: now + 7 * DAY,
        votingEnd: now + 14 * DAY,
      },
    });
    const event = (await eventRes.json()) as { id: string; issueIds: string[] };
    eventId = event.id;
    issueId = event.issueIds[0]!;

    // Submit a proposal
    const propRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId,
      choiceKey: "for",
      title: "Endorse This",
      contentHash: "abc123",
    });
    proposalId = ((await propRes.json()) as { id: string }).id;
  });

  afterEach(() => { vcp.cleanup(); });

  it("endorses a proposal and updates materialized counts", async () => {
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "endorse",
    });
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "endorse",
    });
    await vcp.requestAs(dave.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "dispute",
    });

    const getRes = await vcp.request("GET", `/assemblies/${asmId}/proposals/${proposalId}`);
    const body = (await getRes.json()) as { endorsementCount: number; disputeCount: number; featured: boolean };
    expect(body.endorsementCount).toBe(2);
    expect(body.disputeCount).toBe(1);
    expect(body.featured).toBe(false);
  });

  it("rejects self-endorsement", async () => {
    const res = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "endorse",
    });
    expect(res.status).toBe(400);
  });

  it("changing endorsement updates counts", async () => {
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "endorse",
    });
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "dispute",
    });

    const getRes = await vcp.request("GET", `/assemblies/${asmId}/proposals/${proposalId}`);
    const body = (await getRes.json()) as { endorsementCount: number; disputeCount: number };
    expect(body.endorsementCount).toBe(0);
    expect(body.disputeCount).toBe(1);
  });

  it("admin can feature and unfeature proposals", async () => {
    // Feature
    const featureRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/feature`);
    expect(featureRes.status).toBe(200);

    let getRes = await vcp.request("GET", `/assemblies/${asmId}/proposals/${proposalId}`);
    let body = (await getRes.json()) as { featured: boolean };
    expect(body.featured).toBe(true);

    // Unfeature
    const unfeatureRes = await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/unfeature`);
    expect(unfeatureRes.status).toBe(200);

    getRes = await vcp.request("GET", `/assemblies/${asmId}/proposals/${proposalId}`);
    body = (await getRes.json()) as { featured: boolean };
    expect(body.featured).toBe(false);
  });

  it("non-admin cannot feature proposals", async () => {
    const res = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/feature`);
    expect(res.status).toBe(403);
  });

  it("booklet returns featured proposal per position (auto-fallback to highest scored)", async () => {
    // Submit a second proposal for the "against" position
    const prop2Res = await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/proposals`, {
      issueId,
      choiceKey: "against",
      title: "Against This",
      contentHash: "def456",
    });
    const prop2Id = ((await prop2Res.json()) as { id: string }).id;

    // Endorse the "for" proposal
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/proposals/${proposalId}/evaluate`, {
      evaluation: "endorse",
    });

    // Get booklet
    const bookletRes = await vcp.request("GET", `/assemblies/${asmId}/proposals/booklet?issueId=${issueId}`);
    expect(bookletRes.status).toBe(200);
    const booklet = (await bookletRes.json()) as {
      issueId: string;
      positions: Record<string, { featured: { id: string }; all: unknown[] }>;
      recommendation: unknown;
    };
    expect(booklet.issueId).toBe(issueId);
    // "for" position auto-selects highest scored (the endorsed one)
    expect(booklet.positions["for"]?.featured.id).toBe(proposalId);
    // "against" position auto-selects (only one)
    expect(booklet.positions["against"]?.featured.id).toBe(prop2Id);
    expect(booklet.recommendation).toBeNull();
  });

  it("recommendation CRUD works for admin", async () => {
    // Create recommendation
    const createRes = await vcp.requestAs(alice.id, "POST",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
      { contentHash: "rec-hash-1" },
    );
    expect(createRes.status).toBe(201);

    // Get recommendation
    const getRes = await vcp.request("GET",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
    );
    const body = (await getRes.json()) as { recommendation: { authorId: string; contentHash: string } };
    expect(body.recommendation).not.toBeNull();
    expect(body.recommendation.contentHash).toBe("rec-hash-1");
    expect(body.recommendation.authorId).toBe(alice.id);

    // Update recommendation
    await vcp.requestAs(alice.id, "POST",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
      { contentHash: "rec-hash-2" },
    );
    const getRes2 = await vcp.request("GET",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
    );
    const body2 = (await getRes2.json()) as { recommendation: { contentHash: string } };
    expect(body2.recommendation.contentHash).toBe("rec-hash-2");

    // Delete recommendation
    const delRes = await vcp.requestAs(alice.id, "DELETE",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
    );
    expect(delRes.status).toBe(200);

    const getRes3 = await vcp.request("GET",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
    );
    const body3 = (await getRes3.json()) as { recommendation: unknown };
    expect(body3.recommendation).toBeNull();
  });

  it("non-creator cannot set recommendation", async () => {
    const res = await vcp.requestAs(bob.id, "POST",
      `/assemblies/${asmId}/events/${eventId}/issues/${issueId}/recommendation`,
      { contentHash: "rec" },
    );
    expect(res.status).toBe(403);
  });
});
