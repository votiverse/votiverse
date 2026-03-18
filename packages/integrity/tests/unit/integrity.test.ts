import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import {
  hashArtifact,
  commitArtifact,
  verifyArtifact,
  getCommitments,
  NoOpAnchor,
  InMemoryAnchor,
  IntegrityService,
} from "../../src/index.js";

describe("hashArtifact", () => {
  it("produces a 64-char hex string", () => {
    const hash = hashArtifact({ key: "value" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const data = { votes: { for: 10, against: 5 }, quorumMet: true };
    expect(hashArtifact(data)).toBe(hashArtifact(data));
  });

  it("is order-independent", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(hashArtifact(a)).toBe(hashArtifact(b));
  });

  it("produces different hashes for different data", () => {
    expect(hashArtifact({ x: 1 })).not.toBe(hashArtifact({ x: 2 }));
  });
});

describe("NoOpAnchor", () => {
  it("returns null block reference", async () => {
    const anchor = new NoOpAnchor();
    const ref = await anchor.commit("abc123");
    expect(ref).toBeNull();
  });

  it("always verifies as true", async () => {
    const anchor = new NoOpAnchor();
    const valid = await anchor.verify("abc", "block-1");
    expect(valid).toBe(true);
  });
});

describe("InMemoryAnchor", () => {
  it("stores and verifies commitments", async () => {
    const anchor = new InMemoryAnchor();
    const ref = await anchor.commit("hash-abc");
    expect(ref).toBeTruthy();

    const valid = await anchor.verify("hash-abc", ref!);
    expect(valid).toBe(true);
  });

  it("fails verification for wrong hash", async () => {
    const anchor = new InMemoryAnchor();
    const ref = await anchor.commit("hash-abc");

    const valid = await anchor.verify("hash-WRONG", ref!);
    expect(valid).toBe(false);
  });

  it("fails verification for wrong block reference", async () => {
    const anchor = new InMemoryAnchor();
    await anchor.commit("hash-abc");

    const valid = await anchor.verify("hash-abc", "nonexistent-block");
    expect(valid).toBe(false);
  });

  it("assigns unique block references", async () => {
    const anchor = new InMemoryAnchor();
    const ref1 = await anchor.commit("hash-1");
    const ref2 = await anchor.commit("hash-2");
    expect(ref1).not.toBe(ref2);
  });
});

describe("End-to-end commitment flow", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  it("commit → verify cycle with InMemoryAnchor", async () => {
    const anchor = new InMemoryAnchor();
    const tallyData = { issueId: "i-1", for: 15, against: 5, total: 20 };

    // Commit
    const commitment = await commitArtifact("vote-tally", tallyData, store, anchor);

    expect(commitment.artifactType).toBe("vote-tally");
    expect(commitment.artifactHash).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment.blockReference).toBeTruthy();

    // Verify same data
    const result = await verifyArtifact(tallyData, commitment, anchor);
    expect(result.verified).toBe(true);
    expect(result.hashValid).toBe(true);
    expect(result.anchorValid).toBe(true);
  });

  it("detects tampered data", async () => {
    const anchor = new InMemoryAnchor();
    const tallyData = { issueId: "i-1", for: 15, against: 5 };

    const commitment = await commitArtifact("vote-tally", tallyData, store, anchor);

    // Tamper with the data
    const tampered = { issueId: "i-1", for: 20, against: 5 };
    const result = await verifyArtifact(tampered, commitment, anchor);

    expect(result.verified).toBe(false);
    expect(result.hashValid).toBe(false);
    expect(result.message).toContain("modified");
  });

  it("records IntegrityCommitment event", async () => {
    const anchor = new NoOpAnchor();
    await commitArtifact("prediction-commitment", { pred: "data" }, store, anchor);

    const events = await store.getAll();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("IntegrityCommitment");
  });

  it("commit → verify cycle with NoOpAnchor", async () => {
    const anchor = new NoOpAnchor();
    const data = { pollId: "p-1", responses: 42 };

    const commitment = await commitArtifact("survey-results", data, store, anchor);
    expect(commitment.blockReference).toBeNull();

    const result = await verifyArtifact(data, commitment, anchor);
    expect(result.verified).toBe(true);
  });

  it("getCommitments retrieves all stored commitments", async () => {
    const anchor = new InMemoryAnchor();
    await commitArtifact("vote-tally", { a: 1 }, store, anchor);
    await commitArtifact("survey-results", { b: 2 }, store, anchor);
    await commitArtifact("delegation-snapshot", { c: 3 }, store, anchor);

    const commitments = await getCommitments(store);
    expect(commitments).toHaveLength(3);
    expect(commitments.map((c) => c.artifactType)).toEqual([
      "vote-tally",
      "survey-results",
      "delegation-snapshot",
    ]);
  });
});

describe("IntegrityService", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  it("uses NoOpAnchor by default when blockchain disabled", () => {
    const service = new IntegrityService(store, getPreset("LIQUID_STANDARD"));
    expect(service.getAnchor().anchorName).toBe("no-op");
  });

  it("accepts custom anchor", () => {
    const anchor = new InMemoryAnchor();
    const service = new IntegrityService(store, getPreset("CIVIC_PARTICIPATORY"), anchor);
    expect(service.getAnchor().anchorName).toBe("in-memory");
  });

  it("full commit/verify flow through service", async () => {
    const anchor = new InMemoryAnchor();
    const service = new IntegrityService(store, getPreset("CIVIC_PARTICIPATORY"), anchor);

    const data = { event: "budget-vote", result: "passed" };
    const commitment = await service.commit("vote-tally", data);

    const verification = await service.verify(data, commitment);
    expect(verification.verified).toBe(true);

    const all = await service.listCommitments();
    expect(all).toHaveLength(1);
  });
});
