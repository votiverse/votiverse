/**
 * @votiverse/integrity — Type definitions
 *
 * Commitment generation, blockchain anchoring, and verification.
 * The package is blockchain-agnostic: implementations plug in
 * through the BlockchainAnchor interface.
 */

import type { CommitmentId, Timestamp } from "@votiverse/core";

// ---------------------------------------------------------------------------
// Artifact types
// ---------------------------------------------------------------------------

/** Types of governance artifacts that can be committed. */
export type ArtifactType =
  | "vote-tally"
  | "prediction-commitment"
  | "poll-results"
  | "delegation-snapshot"
  | "event-batch";

// ---------------------------------------------------------------------------
// Commitment
// ---------------------------------------------------------------------------

/**
 * A cryptographic commitment to a governance artifact.
 * The hash proves the artifact existed in this form at commit time.
 */
export interface Commitment {
  readonly id: CommitmentId;
  /** What kind of artifact was committed. */
  readonly artifactType: ArtifactType;
  /** SHA-256 hash of the canonicalized artifact data. */
  readonly artifactHash: string;
  /** Reference to the blockchain record (block hash, tx id, etc.). null for no-op anchor. */
  readonly blockReference: string | null;
  readonly committedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerificationResult {
  /** Whether the artifact matches its committed hash. */
  readonly hashValid: boolean;
  /** Whether the blockchain reference is valid (if applicable). */
  readonly anchorValid: boolean;
  /** Overall verification status. */
  readonly verified: boolean;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// BlockchainAnchor interface
// ---------------------------------------------------------------------------

/**
 * Abstract interface for blockchain anchoring.
 * Implementations target specific chains (Ethereum, Solana, etc.)
 * or a no-op for deployments without blockchain integrity.
 */
export interface BlockchainAnchor {
  /** Human-readable name of this anchor (e.g., "ethereum", "no-op"). */
  readonly anchorName: string;

  /**
   * Anchor a hash to the blockchain.
   * Returns a block reference (tx hash, block number, etc.).
   */
  commit(hash: string): Promise<string | null>;

  /**
   * Verify that a hash exists on the blockchain at the given reference.
   */
  verify(hash: string, blockReference: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// OracleProvider interface
// ---------------------------------------------------------------------------

/**
 * Abstract interface for bringing external data into the system
 * with cryptographic provenance.
 */
export interface OracleProvider {
  readonly oracleName: string;

  /**
   * Fetch data from the oracle with a cryptographic attestation.
   */
  fetchWithAttestation(query: string): Promise<OracleResponse>;
}

export interface OracleResponse {
  readonly data: unknown;
  /** Cryptographic signature or attestation from the oracle. */
  readonly attestation: string;
  readonly timestamp: Timestamp;
  readonly oracleName: string;
}
