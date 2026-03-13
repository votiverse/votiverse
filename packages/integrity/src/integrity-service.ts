/**
 * @votiverse/integrity — IntegrityService
 *
 * High-level service for commitment generation and verification.
 */

import type { EventStore } from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import type { ArtifactType, Commitment, VerificationResult, BlockchainAnchor } from "./types.js";
import { commitArtifact, verifyArtifact, getCommitments } from "./commitment.js";
import { NoOpAnchor } from "./anchors.js";

/**
 * Service for managing governance integrity commitments.
 */
export class IntegrityService {
  private readonly anchor: BlockchainAnchor;

  constructor(
    private readonly eventStore: EventStore,
    config: GovernanceConfig,
    anchor?: BlockchainAnchor,
  ) {
    this.anchor =
      anchor ?? (config.features.blockchainIntegrity ? new NoOpAnchor() : new NoOpAnchor());
  }

  /**
   * Commit a governance artifact for integrity verification.
   */
  async commit(artifactType: ArtifactType, artifactData: unknown): Promise<Commitment> {
    return commitArtifact(artifactType, artifactData, this.eventStore, this.anchor);
  }

  /**
   * Verify that an artifact matches its commitment.
   */
  async verify(artifactData: unknown, commitment: Commitment): Promise<VerificationResult> {
    return verifyArtifact(artifactData, commitment, this.anchor);
  }

  /**
   * List all commitments.
   */
  async listCommitments(): Promise<readonly Commitment[]> {
    return getCommitments(this.eventStore);
  }

  /**
   * Get the anchor in use.
   */
  getAnchor(): BlockchainAnchor {
    return this.anchor;
  }
}
