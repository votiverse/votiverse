/**
 * @votiverse/integrity — Public API
 *
 * Blockchain anchoring, commitment generation, and verification.
 */

// Types
export type {
  ArtifactType,
  Commitment,
  VerificationResult,
  BlockchainAnchor,
  OracleProvider,
  OracleResponse,
} from "./types.js";

// Commitment functions
export { hashArtifact, commitArtifact, verifyArtifact, getCommitments } from "./commitment.js";

// Anchors
export { NoOpAnchor, InMemoryAnchor } from "./anchors.js";

// Service
export { IntegrityService } from "./integrity-service.js";
