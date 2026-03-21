import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TestOutput } from "../src/output.js";
import {
  cmdInit,
  cmdParticipantAdd,
  cmdParticipantList,
  cmdEventCreate,
  cmdEventList,
  cmdDelegateSet,
  cmdDelegateList,
  cmdVote,
  cmdVoteTally,
  cmdVoteWeights,
  cmdConfigPresets,
  cmdConfigShow,
  cmdConfigValidate,
  cmdStatus,
  cmdEventsLog,
} from "../src/commands.js";

describe("CLI end-to-end: voting event with delegations", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "votiverse-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("full lifecycle: init, add participants, create event, delegate, vote, tally", async () => {
    const out = new TestOutput();

    // 1. Initialize with Liquid Standard preset
    await cmdInit("LIQUID_OPEN", out);
    expect(out.messages.some((m) => m.includes("Initialized"))).toBe(true);

    // 2. Add participants
    await cmdParticipantAdd("Alice", out);
    await cmdParticipantAdd("Bob", out);
    await cmdParticipantAdd("Carol", out);
    await cmdParticipantAdd("Dave", out);
    expect(out.messages.some((m) => m.includes("Alice"))).toBe(true);

    // 3. List participants
    const listOut = new TestOutput();
    await cmdParticipantList(listOut);
    expect(listOut.messages).toHaveLength(4);

    // 4. Create a voting event
    const eventOut = new TestOutput();
    await cmdEventCreate("Budget Vote", "Approve Q1 Budget", "Finance", eventOut);
    expect(eventOut.messages.some((m) => m.includes("Budget Vote"))).toBe(true);

    // Extract issue ID from output
    const issueMsg = eventOut.messages.find((m) => m.includes("Issue:"));
    expect(issueMsg).toBeDefined();
    const issueIdMatch = issueMsg!.match(/\(([^)]+)\)$/);
    expect(issueIdMatch).toBeTruthy();
    const issueId = issueIdMatch![1]!;

    // 5. Set up delegations: Alice → Carol, Bob → Carol
    const delOut = new TestOutput();
    await cmdDelegateSet("Alice", "Carol", "Finance", delOut);
    expect(delOut.messages.some((m) => m.includes("delegates"))).toBe(true);

    const delOut2 = new TestOutput();
    await cmdDelegateSet("Bob", "Carol", "Finance", delOut2);
    expect(delOut2.messages.some((m) => m.includes("delegates"))).toBe(true);

    // 6. List delegations
    const delListOut = new TestOutput();
    await cmdDelegateList(delListOut);
    expect(delListOut.messages).toHaveLength(2);

    // 7. Cast votes: Carol votes "for" (carries Alice + Bob weight), Dave votes "against"
    const voteOut1 = new TestOutput();
    await cmdVote(issueId, "for", "Carol", voteOut1);
    expect(voteOut1.messages.some((m) => m.includes("Carol voted"))).toBe(true);

    const voteOut2 = new TestOutput();
    await cmdVote(issueId, "against", "Dave", voteOut2);
    expect(voteOut2.messages.some((m) => m.includes("Dave voted"))).toBe(true);

    // 8. Check tally
    const tallyOut = new TestOutput();
    await cmdVoteTally(issueId, tallyOut);
    // Carol carries weight 3 (Alice + Bob + herself), Dave has weight 1
    expect(tallyOut.messages.some((m) => m.includes("Winner: for"))).toBe(true);
    expect(tallyOut.messages.some((m) => m.includes("for: 3"))).toBe(true);
    expect(tallyOut.messages.some((m) => m.includes("against: 1"))).toBe(true);

    // 9. Check weight distribution
    const weightOut = new TestOutput();
    await cmdVoteWeights(issueId, weightOut);
    expect(weightOut.messages.some((m) => m.includes("Carol: 3"))).toBe(true);
    expect(weightOut.messages.some((m) => m.includes("Dave: 1"))).toBe(true);
  });

  it("override rule: direct vote overrides delegation", async () => {
    const out = new TestOutput();

    await cmdInit("LIQUID_OPEN", out);
    await cmdParticipantAdd("Alice", out);
    await cmdParticipantAdd("Bob", out);

    const eventOut = new TestOutput();
    await cmdEventCreate("Override Test", "Test Issue", undefined, eventOut);
    const issueMsg = eventOut.messages.find((m) => m.includes("Issue:"));
    const issueId = issueMsg!.match(/\(([^)]+)\)$/)![1]!;

    // Alice delegates to Bob
    const delOut = new TestOutput();
    await cmdDelegateSet("Alice", "Bob", undefined, delOut);

    // Both vote directly — Alice's delegation is overridden
    const v1 = new TestOutput();
    await cmdVote(issueId, "against", "Alice", v1);
    const v2 = new TestOutput();
    await cmdVote(issueId, "for", "Bob", v2);

    const tallyOut = new TestOutput();
    await cmdVoteTally(issueId, tallyOut);
    // Each has weight 1 — it's a tie
    expect(tallyOut.messages.some((m) => m.includes("Winner: (no winner)"))).toBe(true);
  });

  it("config commands work", async () => {
    // Presets don't need init
    const presetsOut = new TestOutput();
    await cmdConfigPresets(presetsOut);
    expect(presetsOut.messages.length).toBeGreaterThanOrEqual(6);

    // Init then show/validate
    const out = new TestOutput();
    await cmdInit("DIRECT_DEMOCRACY", out);

    const showOut = new TestOutput();
    await cmdConfigShow(showOut);
    expect(showOut.messages.length).toBeGreaterThan(0);

    const valOut = new TestOutput();
    await cmdConfigValidate(valOut);
    expect(valOut.messages.some((m) => m.includes("valid"))).toBe(true);
  });

  it("status command shows instance info", async () => {
    const out = new TestOutput();
    await cmdInit("LIQUID_OPEN", out);
    await cmdParticipantAdd("Alice", out);

    const statusOut = new TestOutput();
    await cmdStatus(statusOut);
    expect(statusOut.messages.some((m) => m.includes("Liquid Open"))).toBe(true);
    expect(statusOut.messages.some((m) => m.includes("Participants: 1"))).toBe(true);
  });

  it("events log shows recorded events", async () => {
    const out = new TestOutput();
    await cmdInit("LIQUID_OPEN", out);
    await cmdParticipantAdd("Alice", out);

    const logOut = new TestOutput();
    await cmdEventsLog(0, logOut);
    expect(logOut.messages.some((m) => m.includes("ParticipantRegistered"))).toBe(true);
  });
});
