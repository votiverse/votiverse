import { describe, it, expect } from "vitest";
import { computeCommitmentHash, verifyCommitment } from "../../src/commitment.js";
import type { PredictionClaim } from "../../src/types.js";
import type { Timestamp } from "@votiverse/core";

const ts = (n: number) => n as Timestamp;

describe("Commitment hash", () => {
  const claim: PredictionClaim = {
    variable: "youth sports participation",
    baselineValue: 500,
    timeframe: { start: ts(1000), deadline: ts(100000) },
    methodology: "annual survey",
    pattern: { type: "absolute-change", expected: 200 },
  };

  it("produces a hex string", () => {
    const hash = computeCommitmentHash(claim);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same claim produces same hash", () => {
    const hash1 = computeCommitmentHash(claim);
    const hash2 = computeCommitmentHash(claim);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different claims", () => {
    const altered: PredictionClaim = {
      ...claim,
      pattern: { type: "absolute-change", expected: 201 },
    };
    expect(computeCommitmentHash(claim)).not.toBe(computeCommitmentHash(altered));
  });

  it("is order-independent — same data in different key order produces same hash", () => {
    const claim1: PredictionClaim = {
      variable: "X",
      timeframe: { start: ts(0), deadline: ts(1) },
      pattern: { type: "binary", expectedOutcome: true },
    };
    // Same content, constructed with different key order
    const claim2 = {
      pattern: { expectedOutcome: true, type: "binary" },
      timeframe: { deadline: ts(1), start: ts(0) },
      variable: "X",
    } as PredictionClaim;
    expect(computeCommitmentHash(claim1)).toBe(computeCommitmentHash(claim2));
  });

  it("verifyCommitment returns true for matching hash", () => {
    const hash = computeCommitmentHash(claim);
    expect(verifyCommitment(claim, hash)).toBe(true);
  });

  it("verifyCommitment returns false for wrong hash", () => {
    expect(verifyCommitment(claim, "deadbeef")).toBe(false);
  });
});
