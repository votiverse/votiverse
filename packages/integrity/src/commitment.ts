/**
 * @votiverse/integrity — Commitment generation
 *
 * Produces cryptographic commitments (SHA-256 hashes) of governance
 * artifacts. Commitments can be anchored to a blockchain for
 * tamper-evident storage.
 */

import { createHash } from "node:crypto";
import type { EventStore, IntegrityCommitmentEvent } from "@votiverse/core";
import { createEvent, generateCommitmentId, generateEventId, now } from "@votiverse/core";
import type { ArtifactType, Commitment, VerificationResult, BlockchainAnchor } from "./types.js";

/**
 * Computes a SHA-256 hash of an artifact's canonical representation.
 */
export function hashArtifact(data: unknown): string {
  const canonical = canonicalize(data);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Creates a commitment for a governance artifact.
 * Computes the hash, optionally anchors to blockchain, and records
 * an IntegrityCommitment event.
 */
export async function commitArtifact(
  artifactType: ArtifactType,
  artifactData: unknown,
  eventStore: EventStore,
  anchor: BlockchainAnchor,
): Promise<Commitment> {
  const id = generateCommitmentId();
  const artifactHash = hashArtifact(artifactData);
  const blockReference = await anchor.commit(artifactHash);
  const timestamp = now();

  const event = createEvent<IntegrityCommitmentEvent>(
    "IntegrityCommitment",
    {
      commitmentId: id,
      artifactType,
      artifactHash,
      blockReference,
    },
    generateEventId(),
    timestamp,
  );

  await eventStore.append(event);

  return {
    id,
    artifactType,
    artifactHash,
    blockReference,
    committedAt: timestamp,
  };
}

/**
 * Verifies that an artifact matches its commitment.
 * Checks both the hash and (optionally) the blockchain anchor.
 */
export async function verifyArtifact(
  artifactData: unknown,
  commitment: Commitment,
  anchor: BlockchainAnchor,
): Promise<VerificationResult> {
  const currentHash = hashArtifact(artifactData);
  const hashValid = currentHash === commitment.artifactHash;

  let anchorValid = true;
  if (commitment.blockReference !== null) {
    anchorValid = await anchor.verify(commitment.artifactHash, commitment.blockReference);
  }

  const verified = hashValid && anchorValid;
  let message: string;

  if (verified) {
    message = "Artifact verified: hash matches and blockchain anchor is valid";
  } else if (!hashValid) {
    message = `Artifact has been modified since commitment (expected ${commitment.artifactHash}, got ${currentHash})`;
  } else {
    message = "Blockchain anchor verification failed";
  }

  return { hashValid, anchorValid, verified, message };
}

/**
 * Retrieves all commitments from the event store.
 */
export async function getCommitments(eventStore: EventStore): Promise<readonly Commitment[]> {
  const events = await eventStore.query({ types: ["IntegrityCommitment"] });
  return events.map((event) => {
    const e = event as IntegrityCommitmentEvent;
    return {
      id: e.payload.commitmentId,
      artifactType: e.payload.artifactType as ArtifactType,
      artifactHash: e.payload.artifactHash,
      blockReference: e.payload.blockReference,
      committedAt: e.timestamp,
    };
  });
}

// ---------------------------------------------------------------------------
// Canonicalization (same as prediction/commitment.ts — shared logic)
// ---------------------------------------------------------------------------

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
