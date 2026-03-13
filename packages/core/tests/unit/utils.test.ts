import { describe, it, expect } from "vitest";
import {
  generateEventId,
  generateParticipantId,
  generateTopicId,
  generateIssueId,
  generateVotingEventId,
  generateDelegationId,
  generatePredictionId,
  generatePollId,
  generateProposalId,
  generateCommitmentId,
  now,
  timestampFromDate,
  dateFromTimestamp,
  timestamp,
} from "../../src/utils.js";
import type { Timestamp } from "../../src/types.js";

describe("ID generation", () => {
  it("generates unique EventIds", () => {
    const id1 = generateEventId();
    const id2 = generateEventId();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(0);
  });

  it("generates unique ParticipantIds", () => {
    const id1 = generateParticipantId();
    const id2 = generateParticipantId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique TopicIds", () => {
    const id1 = generateTopicId();
    const id2 = generateTopicId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique IssueIds", () => {
    const id1 = generateIssueId();
    const id2 = generateIssueId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique VotingEventIds", () => {
    const id1 = generateVotingEventId();
    const id2 = generateVotingEventId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique DelegationIds", () => {
    const id1 = generateDelegationId();
    const id2 = generateDelegationId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique PredictionIds", () => {
    const id1 = generatePredictionId();
    const id2 = generatePredictionId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique PollIds", () => {
    const id1 = generatePollId();
    const id2 = generatePollId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique ProposalIds", () => {
    const id1 = generateProposalId();
    const id2 = generateProposalId();
    expect(id1).not.toBe(id2);
  });

  it("generates unique CommitmentIds", () => {
    const id1 = generateCommitmentId();
    const id2 = generateCommitmentId();
    expect(id1).not.toBe(id2);
  });

  it("generates IDs in UUID format", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(generateEventId()).toMatch(uuidRegex);
    expect(generateParticipantId()).toMatch(uuidRegex);
    expect(generateTopicId()).toMatch(uuidRegex);
    expect(generateIssueId()).toMatch(uuidRegex);
  });
});

describe("Timestamp utilities", () => {
  it("now() returns the current time as a Timestamp", () => {
    const before = Date.now();
    const ts = now();
    const after = Date.now();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("timestampFromDate() converts a Date to Timestamp", () => {
    const date = new Date("2026-01-15T12:00:00Z");
    const ts = timestampFromDate(date);
    expect(ts).toBe(date.getTime());
  });

  it("dateFromTimestamp() converts a Timestamp to Date", () => {
    const ts = timestamp(1705320000000);
    const date = dateFromTimestamp(ts);
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBe(1705320000000);
  });

  it("timestamp() creates a Timestamp from a number", () => {
    const ts = timestamp(1000);
    expect(ts).toBe(1000);
  });

  it("round-trips through Date and back", () => {
    const original = now();
    const date = dateFromTimestamp(original);
    const restored = timestampFromDate(date);
    expect(restored).toBe(original);
  });
});
