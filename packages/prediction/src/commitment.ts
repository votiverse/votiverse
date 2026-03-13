/**
 * @votiverse/prediction — Commitment hash
 *
 * Produces a deterministic SHA-256 hash of a PredictionClaim.
 * Used for tamper detection — the claim is immutable once committed.
 */

import { createHash } from "node:crypto";
import type { PredictionClaim } from "./types.js";

/**
 * Canonicalizes a value for deterministic JSON serialization.
 * Object keys are sorted alphabetically.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes the SHA-256 commitment hash of a prediction claim.
 * The claim is canonicalized (sorted keys, deterministic JSON)
 * before hashing to ensure identical claims produce identical hashes.
 */
export function computeCommitmentHash(claim: PredictionClaim): string {
  const canonical = canonicalize(claim);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Verifies that a claim matches its commitment hash.
 */
export function verifyCommitment(
  claim: PredictionClaim,
  expectedHash: string,
): boolean {
  return computeCommitmentHash(claim) === expectedHash;
}
