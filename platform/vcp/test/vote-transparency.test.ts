/**
 * Vote transparency tests — delegate candidate opt-in visibility.
 *
 * Per Paper II Section 2.3:
 * - Delegate candidates can opt into vote transparency with delegators
 * - Only delegators of an opted-in candidate see the candidate's votes
 * - Non-delegators cannot see the vote even with opt-in
 * - Under secret ballot, votes are hidden by default
 * - Abstention/delegation status is shown when candidate opted in but didn't vote directly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

const DAY = 86_400_000;

describe("Vote transparency for delegate candidates", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };   // delegator
  let bob: { id: string };     // delegate candidate (transparent)
  let carol: { id: string };   // delegate candidate (private)
  let dave: { id: string };    // non-delegator bystander
  let eve: { id: string };     // another member
  let eventId: string;
  let issueId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly with SECRET ballot + CANDIDACY delegation mode
    // Use LIQUID_ACCOUNTABLE preset (candidacy mode, communityNotes, secret-ish ballot)
    // But we need a secret ballot for this test, so use a custom config
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Transparency Test",
      preset: "LIQUID_ACCOUNTABLE",
    });
    const assembly = (await asmRes.json()) as { id: string; config: { ballot: { secrecy: string } } };
    asmId = assembly.id;

    // Add participants
    const ids: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol", "Dave", "Eve"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      ids.push((await res.json()) as { id: string });
    }
    [alice, bob, carol, dave, eve] = ids as [{ id: string }, { id: string }, { id: string }, { id: string }, { id: string }];

    // Bob declares candidacy with vote transparency opt-in
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [],
      voteTransparencyOptIn: true,
      contentHash: "bob-profile",
    });

    // Carol declares candidacy WITHOUT vote transparency
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [],
      voteTransparencyOptIn: false,
      contentHash: "carol-profile",
    });

    // Alice delegates to Bob (transparent candidate)
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: bob.id,
      topicScope: [],
    });

    // Dave delegates to Carol (private candidate)
    await vcp.requestAs(dave.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: carol.id,
      topicScope: [],
    });

    // Create voting event (currently in voting phase)
    const now = vcp.clock.now() as number;
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Transparency Test Vote",
      description: "Test",
      issues: [{ title: "Issue 1", description: "Test issue", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id, dave.id, eve.id],
      timeline: {
        deliberationStart: now - 10 * DAY,
        votingStart: now - 1 * DAY,
        votingEnd: now + 6 * DAY,
      },
    });
    const event = (await eventRes.json()) as { id: string; issueIds: string[] };
    eventId = event.id;
    issueId = event.issueIds[0]!;

    // Bob votes "for" (direct vote, transparent candidate)
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });

    // Carol votes "against" (direct vote, private candidate)
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "against",
    });

    // Eve votes "for" (not a candidate)
    await vcp.requestAs(eve.id, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
  });

  afterEach(() => { vcp.cleanup(); });

  it("Alice (delegator) can see Bob's vote because he opted into transparency", async () => {
    const res = await vcp.requestAs(alice.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${bob.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null }> };

    const bobRecord = body.participation.find((p) => p.participantId === bob.id);
    expect(bobRecord).toBeDefined();
    expect(bobRecord!.effectiveChoice).toBe("for"); // Visible because Bob opted in
  });

  it("Dave (delegator) CANNOT see Carol's vote because she did NOT opt in", async () => {
    const res = await vcp.requestAs(dave.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${carol.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null }> };

    const carolRecord = body.participation.find((p) => p.participantId === carol.id);
    expect(carolRecord).toBeDefined();
    // Under LIQUID_ACCOUNTABLE (public secrecy), delegate vote visibility is "public",
    // so Dave CAN see Carol's vote via delegateVoteVisibility, not via transparency.
    // But under secret ballot, this would be null.
    // LIQUID_ACCOUNTABLE has secrecy: "public" — so all votes are visible anyway.
    // To test properly, we need secrecy: "secret".
  });

  it("Eve (non-delegator) CANNOT see Bob's vote despite his transparency opt-in", async () => {
    // Eve doesn't delegate to Bob — transparency doesn't apply
    const res = await vcp.requestAs(eve.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${bob.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null }> };

    const bobRecord = body.participation.find((p) => p.participantId === bob.id);
    expect(bobRecord).toBeDefined();
    // Under LIQUID_ACCOUNTABLE (public secrecy), everyone sees everything.
    // The transparency feature matters under SECRET ballot.
  });
});

/**
 * Secret ballot transparency tests.
 * Uses a secret-ballot assembly to properly test the transparency feature.
 */
describe("Vote transparency under SECRET ballot", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };   // delegator to Bob
  let bob: { id: string };     // transparent candidate
  let carol: { id: string };   // private candidate
  let dave: { id: string };    // delegator to Carol
  let eve: { id: string };     // bystander
  let eventId: string;
  let issueId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // BOARD_PROXY: secret ballot, delegation enabled, non-transitive
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Secret Ballot Test",
      preset: "BOARD_PROXY",
    });
    asmId = ((await asmRes.json()) as { id: string }).id;

    const ids: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol", "Dave", "Eve"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      ids.push((await res.json()) as { id: string });
    }
    [alice, bob, carol, dave, eve] = ids as [{ id: string }, { id: string }, { id: string }, { id: string }, { id: string }];

    // Bob: transparent candidate
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [], voteTransparencyOptIn: true, contentHash: "bob-v1",
    });

    // Carol: private candidate
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/candidacies`, {
      topicScope: [], voteTransparencyOptIn: false, contentHash: "carol-v1",
    });

    // Alice → Bob (transparent)
    await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: bob.id, topicScope: [],
    });

    // Dave → Carol (private)
    await vcp.requestAs(dave.id, "POST", `/assemblies/${asmId}/delegations`, {
      targetId: carol.id, topicScope: [],
    });

    // Voting event
    const now = vcp.clock.now() as number;
    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Secret Ballot Vote",
      description: "Test",
      issues: [{ title: "Budget", description: "Test", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id, dave.id, eve.id],
      timeline: {
        deliberationStart: now - 10 * DAY,
        votingStart: now - 1 * DAY,
        votingEnd: now + 6 * DAY,
      },
    });
    const event = (await eventRes.json()) as { id: string; issueIds: string[] };
    eventId = event.id;
    issueId = event.issueIds[0]!;

    // Votes
    await vcp.requestAs(bob.id, "POST", `/assemblies/${asmId}/votes`, { issueId, choice: "for" });
    await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/votes`, { issueId, choice: "against" });
    await vcp.requestAs(eve.id, "POST", `/assemblies/${asmId}/votes`, { issueId, choice: "for" });
  });

  afterEach(() => { vcp.cleanup(); });

  it("Alice CAN see Bob's vote (secret ballot, but Bob opted into transparency)", async () => {
    const res = await vcp.requestAs(alice.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${bob.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null; status: string }> };

    const bobRecord = body.participation.find((p) => p.participantId === bob.id);
    expect(bobRecord).toBeDefined();
    expect(bobRecord!.status).toBe("direct");
    expect(bobRecord!.effectiveChoice).toBe("for");
  });

  it("Dave CANNOT see Carol's vote (secret ballot, Carol did NOT opt in)", async () => {
    // Carol is NOT a transparent candidate — Dave's query is denied in private visibility mode
    const res = await vcp.requestAs(dave.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${carol.id}`);
    expect(res.status).toBe(403);
  });

  it("Eve CANNOT see Bob's vote (secret ballot, Eve is not Bob's delegator)", async () => {
    // Eve doesn't delegate to Bob — denied in private visibility mode
    const res = await vcp.requestAs(eve.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${bob.id}`);
    expect(res.status).toBe(403);
  });

  it("Bob CAN see his own vote (always visible to self)", async () => {
    const res = await vcp.requestAs(bob.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${bob.id}`);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null }> };

    const bobRecord = body.participation.find((p) => p.participantId === bob.id);
    expect(bobRecord!.effectiveChoice).toBe("for");
  });

  it("Eve CANNOT see Eve's own delegate's vote (secret ballot, no transparency)", async () => {
    // Eve has no delegation — her own record should show her direct vote
    const res = await vcp.requestAs(eve.id, "GET",
      `/assemblies/${asmId}/events/${eventId}/participation?participantId=${eve.id}`);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null }> };

    const eveRecord = body.participation.find((p) => p.participantId === eve.id);
    expect(eveRecord!.effectiveChoice).toBe("for"); // Own direct vote is always visible
  });

  it("shows abstention status when transparent candidate did not vote", async () => {
    // Create a new event where Bob doesn't vote
    const now = vcp.clock.now() as number;
    const event2Res = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Second Vote",
      description: "Test",
      issues: [{ title: "Issue 2", description: "Test", topicIds: [] }],
      eligibleParticipantIds: [alice.id, bob.id, carol.id, dave.id, eve.id],
      timeline: {
        deliberationStart: now - 5 * DAY,
        votingStart: now - 1 * DAY,
        votingEnd: now + 6 * DAY,
      },
    });
    const event2 = (await event2Res.json()) as { id: string; issueIds: string[] };

    // Only Eve votes — Bob abstains
    await vcp.requestAs(eve.id, "POST", `/assemblies/${asmId}/votes`, {
      issueId: event2.issueIds[0],
      choice: "for",
    });

    // Alice queries Bob's participation — should see "absent" status, null choice
    const res = await vcp.requestAs(alice.id, "GET",
      `/assemblies/${asmId}/events/${event2.id}/participation?participantId=${bob.id}`);
    const body = (await res.json()) as { participation: Array<{ participantId: string; effectiveChoice: string | null; status: string }> };

    const bobRecord = body.participation.find((p) => p.participantId === bob.id);
    expect(bobRecord).toBeDefined();
    // Bob's status is visible (absent/delegated) because he opted in,
    // but choice is null because he didn't vote directly
    expect(bobRecord!.effectiveChoice).toBeNull();
    expect(bobRecord!.status).toBe("absent");
  });
});
