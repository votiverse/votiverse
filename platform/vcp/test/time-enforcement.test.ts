/**
 * Time enforcement integration tests — VCP HTTP layer.
 *
 * Tests that time-sensitive governance contracts are enforced at the
 * HTTP API level for both voting and surveys. Uses the TestClock
 * injected into the VCP test harness to control time deterministically.
 *
 * These tests complement the engine-layer unit tests by verifying:
 * - Correct HTTP status codes for time violations (409 for votes, 400 for surveys)
 * - Error response structure matches API contract
 * - Dev clock endpoints work correctly
 * - Phase transitions observed through the HTTP API
 * - Sealed results visibility tied to voting end time
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("Time enforcement — voting windows", () => {
  let vcp: TestVCP;
  let asmId: string;
  let aliceId: string;
  let bobId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Time Test Assembly",
      preset: "LIQUID_STANDARD",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    const participants: string[] = [];
    for (const name of ["Alice", "Bob"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      const p = (await res.json()) as { id: string };
      participants.push(p.id);
    }
    [aliceId, bobId] = participants as [string, string];
  });

  afterEach(() => {
    vcp.cleanup();
  });

  /**
   * Create a voting event with timeline relative to the test clock.
   * Returns { eventId, issueId }.
   */
  async function createEvent(timeline: {
    deliberationStart: number;
    votingStart: number;
    votingEnd: number;
  }) {
    const res = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Test Event",
      description: "Testing time enforcement",
      issues: [{ title: "Issue 1", description: "Test issue", topicIds: [] }],
      eligibleParticipantIds: [aliceId, bobId],
      timeline,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; issueIds: string[] };
    return { eventId: data.id, issueId: data.issueIds[0]! };
  }

  it("rejects vote before voting window opens (HTTP 409)", async () => {
    const now = vcp.clock.now() as number;
    const { issueId } = await createEvent({
      deliberationStart: now + 1 * DAY,
      votingStart: now + 3 * DAY,
      votingEnd: now + 10 * DAY,
    });

    const res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(409);

    const body = (await res.json()) as { error: { code: string; details: { rule: string } } };
    expect(body.error.code).toBe("GOVERNANCE_RULE_VIOLATION");
    expect(body.error.details.rule).toBe("Voting has not started yet");
  });

  it("rejects vote after voting window closes (HTTP 409)", async () => {
    const now = vcp.clock.now() as number;
    const { issueId } = await createEvent({
      deliberationStart: now - 10 * DAY,
      votingStart: now - 7 * DAY,
      votingEnd: now - 1 * DAY,
    });

    const res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(409);

    const body = (await res.json()) as { error: { code: string; details: { rule: string } } };
    expect(body.error.code).toBe("GOVERNANCE_RULE_VIOLATION");
    expect(body.error.details.rule).toBe("Voting has closed");
  });

  it("accepts vote within voting window (HTTP 200)", async () => {
    const now = vcp.clock.now() as number;
    const { issueId } = await createEvent({
      deliberationStart: now - 3 * DAY,
      votingStart: now - 1 * DAY,
      votingEnd: now + 6 * DAY,
    });

    const res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(200);
  });

  it("transitions through phases via clock advancement", async () => {
    const now = vcp.clock.now() as number;
    const { issueId } = await createEvent({
      deliberationStart: now + 1 * DAY,
      votingStart: now + 3 * DAY,
      votingEnd: now + 10 * DAY,
    });

    // Phase 1: Before deliberation → rejected
    let res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(409);

    // Phase 2: During deliberation → still rejected (voting not started)
    vcp.clock.advance(2 * DAY);
    res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(409);

    // Phase 3: During voting → accepted
    vcp.clock.advance(2 * DAY);
    res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(200);

    // Phase 4: After voting → rejected (and cannot re-vote anyway, but the
    // timeline check fires first)
    vcp.clock.advance(8 * DAY);
    res = await vcp.requestAs(bobId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "against",
    });
    expect(res.status).toBe(409);
  });

  it("boundary: vote at exactly votingStart succeeds", async () => {
    const now = vcp.clock.now() as number;
    const { issueId } = await createEvent({
      deliberationStart: now - 1 * DAY,
      votingStart: now + 1 * DAY,
      votingEnd: now + 7 * DAY,
    });

    // Advance to exactly votingStart
    vcp.clock.advance(1 * DAY);
    const res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(200);
  });

  it("boundary: vote at exactly votingEnd is rejected", async () => {
    const now = vcp.clock.now() as number;
    const { issueId } = await createEvent({
      deliberationStart: now - 7 * DAY,
      votingStart: now - 1 * DAY,
      votingEnd: now + 1 * DAY,
    });

    // Advance to exactly votingEnd
    vcp.clock.advance(1 * DAY);
    const res = await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    expect(res.status).toBe(409);
  });

  it("tally reflects voting-ended state via clock advancement", async () => {
    const now = vcp.clock.now() as number;
    const { eventId, issueId } = await createEvent({
      deliberationStart: now - 3 * DAY,
      votingStart: now - 1 * DAY,
      votingEnd: now + 2 * DAY,
    });

    // Cast votes while window is open
    await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });
    await vcp.requestAs(bobId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "against",
    });

    // Tally while voting is still open — should still work (live compute)
    let tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/tally`);
    expect(tallyRes.status).toBe(200);
    let tallyData = (await tallyRes.json()) as {
      tallies: Array<{ sealed: boolean; totalVotes: number }>;
    };
    expect(tallyData.tallies[0]!.sealed).toBe(false);
    expect(tallyData.tallies[0]!.totalVotes).toBe(2);

    // Advance past votingEnd
    vcp.clock.advance(3 * DAY);

    // Tally after close — should still return results (materialized)
    tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/tally`);
    expect(tallyRes.status).toBe(200);
    tallyData = (await tallyRes.json()) as {
      tallies: Array<{ sealed: boolean; totalVotes: number }>;
    };
    expect(tallyData.tallies[0]!.totalVotes).toBe(2);
  });
});

describe("Time enforcement — sealed results", () => {
  let vcp: TestVCP;
  let asmId: string;
  let aliceId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Use CIVIC_PARTICIPATORY which has sealed results
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Sealed Test",
      preset: "CIVIC_PARTICIPATORY",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name: "Alice" });
    const p = (await res.json()) as { id: string };
    aliceId = p.id;
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("sealed results: tally is sealed while voting is open, unsealed after close", async () => {
    const now = vcp.clock.now() as number;

    const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
      title: "Sealed Vote",
      description: "Tests sealed results visibility",
      issues: [{ title: "Issue", description: "", topicIds: [] }],
      eligibleParticipantIds: [aliceId],
      timeline: {
        deliberationStart: now - 3 * DAY,
        votingStart: now - 1 * DAY,
        votingEnd: now + 2 * DAY,
      },
    });
    const event = (await eventRes.json()) as { id: string; issueIds: string[] };
    const eventId = event.id;
    const issueId = event.issueIds[0]!;

    // Cast vote
    await vcp.requestAs(aliceId, "POST", `/assemblies/${asmId}/votes`, {
      issueId,
      choice: "for",
    });

    // Tally while open — should be sealed
    let tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/tally`);
    let tally = (await tallyRes.json()) as {
      tallies: Array<{ sealed: boolean; winner: string | null; counts: Record<string, number> }>;
    };
    expect(tally.tallies[0]!.sealed).toBe(true);
    expect(tally.tallies[0]!.winner).toBeNull();
    expect(tally.tallies[0]!.counts).toEqual({});

    // Advance past voting end
    vcp.clock.advance(3 * DAY);

    // Tally after close — should be unsealed
    tallyRes = await vcp.request("GET", `/assemblies/${asmId}/events/${eventId}/tally`);
    tally = (await tallyRes.json()) as {
      tallies: Array<{ sealed: boolean; winner: string | null; counts: Record<string, number> }>;
    };
    expect(tally.tallies[0]!.sealed).toBe(false);
    expect(tally.tallies[0]!.winner).toBe("for");
  });
});

describe("Time enforcement — survey windows", () => {
  let vcp: TestVCP;
  let asmId: string;
  let aliceId: string;
  let bobId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Use LIQUID_ACCOUNTABLE which has surveys enabled
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Survey Time Test",
      preset: "LIQUID_ACCOUNTABLE",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    const participants: string[] = [];
    for (const name of ["Alice", "Bob"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      const p = (await res.json()) as { id: string };
      participants.push(p.id);
    }
    [aliceId, bobId] = participants as [string, string];
  });

  afterEach(() => {
    vcp.cleanup();
  });

  async function createSurvey(schedule: number, closesAt: number) {
    const res = await vcp.request("POST", `/assemblies/${asmId}/surveys`, {
      title: "Test Survey",
      topicScope: [],
      questions: [
        {
          text: "Do you agree?",
          questionType: { type: "yes-no" },
          topicIds: [],
          tags: [],
        },
      ],
      schedule,
      closesAt,
      createdBy: aliceId,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      id: string;
      schedule: number;
      closesAt: number;
      questions: Array<{ id: string }>;
    };
    return data;
  }

  it("survey response returns immutable schedule and closesAt timestamps", async () => {
    const now = vcp.clock.now() as number;
    const survey = await createSurvey(now + 1 * DAY, now + 7 * DAY);
    expect(survey.schedule).toBe(now + 1 * DAY);
    expect(survey.closesAt).toBe(now + 7 * DAY);
  });

  it("rejects survey response before schedule (HTTP 400)", async () => {
    const now = vcp.clock.now() as number;
    const survey = await createSurvey(now + 1 * DAY, now + 7 * DAY);

    const res = await vcp.requestAs(
      aliceId,
      "POST",
      `/assemblies/${asmId}/surveys/${survey.id}/respond`,
      {
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.message).toContain("not yet open");
  });

  it("accepts survey response during open window (HTTP 200)", async () => {
    const now = vcp.clock.now() as number;
    const survey = await createSurvey(now + 1 * DAY, now + 7 * DAY);

    // Advance into open window
    vcp.clock.advance(2 * DAY);

    const res = await vcp.requestAs(
      aliceId,
      "POST",
      `/assemblies/${asmId}/surveys/${survey.id}/respond`,
      {
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      },
    );
    expect(res.status).toBe(200);
  });

  it("rejects survey response after close (HTTP 400)", async () => {
    const now = vcp.clock.now() as number;
    const survey = await createSurvey(now + 1 * DAY, now + 7 * DAY);

    // Advance past close
    vcp.clock.advance(8 * DAY);

    const res = await vcp.requestAs(
      aliceId,
      "POST",
      `/assemblies/${asmId}/surveys/${survey.id}/respond`,
      {
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.message).toContain("closed");
  });

  it("survey list returns immutable timestamps for client-side status derivation", async () => {
    const now = vcp.clock.now() as number;
    const schedule = now + 2 * DAY;
    const closesAt = now + 5 * DAY;
    const survey = await createSurvey(schedule, closesAt);

    const listRes = await vcp.request("GET", `/assemblies/${asmId}/surveys`);
    const surveys = (await listRes.json()) as { surveys: Array<{ id: string; schedule: number; closesAt: number }> };
    const listed = surveys.surveys.find((s) => s.id === survey.id)!;
    expect(listed.schedule).toBe(schedule);
    expect(listed.closesAt).toBe(closesAt);
  });

  it("response accepted then clock advances past close prevents further responses", async () => {
    const now = vcp.clock.now() as number;
    const survey = await createSurvey(now - HOUR, now + 2 * DAY);

    // Alice responds while open
    let res = await vcp.requestAs(
      aliceId,
      "POST",
      `/assemblies/${asmId}/surveys/${survey.id}/respond`,
      {
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      },
    );
    expect(res.status).toBe(200);

    // Advance past close
    vcp.clock.advance(3 * DAY);

    // Bob tries to respond — rejected
    res = await vcp.requestAs(
      bobId,
      "POST",
      `/assemblies/${asmId}/surveys/${survey.id}/respond`,
      {
        answers: [{ questionId: survey.questions[0]!.id, value: false }],
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("Dev clock endpoints", () => {
  let vcp: TestVCP;

  beforeEach(async () => {
    vcp = await createTestVCP();
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("GET /dev/clock returns current clock state", async () => {
    const res = await vcp.request("GET", "/dev/clock");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      time: number;
      iso: string;
      mode: string;
      systemTime: number;
    };
    expect(data.time).toBeTypeOf("number");
    expect(data.iso).toBeTypeOf("string");
    expect(data.mode).toBeTypeOf("string");
    expect(data.systemTime).toBeTypeOf("number");
  });

  it("POST /dev/clock/advance moves time forward", async () => {
    const before = (await (await vcp.request("GET", "/dev/clock")).json()) as { time: number };
    const res = await vcp.request("POST", "/dev/clock/advance", { ms: DAY });
    expect(res.status).toBe(200);

    const after = (await res.json()) as { time: number };
    expect(after.time).toBeGreaterThanOrEqual(before.time + DAY - 100);
  });

  it("POST /dev/clock/set jumps to specific time", async () => {
    const target = Date.now() + 365 * DAY; // 1 year in the future
    const res = await vcp.request("POST", "/dev/clock/set", { time: target });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { time: number };
    expect(Math.abs(data.time - target)).toBeLessThan(100);
  });

  it("POST /dev/clock/reset returns to system time", async () => {
    // First advance far
    await vcp.request("POST", "/dev/clock/advance", { ms: 365 * DAY });

    // Reset
    const res = await vcp.request("POST", "/dev/clock/reset");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { time: number; mode: string };
    expect(data.mode).toContain("reset");
    expect(Math.abs(data.time - Date.now())).toBeLessThan(5000);
  });
});
