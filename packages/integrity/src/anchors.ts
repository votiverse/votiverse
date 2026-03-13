/**
 * @votiverse/integrity — Built-in blockchain anchors
 *
 * NoOpAnchor: for deployments without blockchain integration.
 * InMemoryAnchor: for testing — stores commitments in memory.
 */

import type { BlockchainAnchor } from "./types.js";

/**
 * No-op blockchain anchor. Accepts all commits but doesn't anchor
 * them to any blockchain. Returns null block references.
 *
 * Use this for deployments that don't need blockchain integrity.
 * The engine code works identically — no conditional logic needed.
 */
export class NoOpAnchor implements BlockchainAnchor {
  readonly anchorName = "no-op";

  async commit(_hash: string): Promise<string | null> {
    return null;
  }

  async verify(_hash: string, _blockReference: string): Promise<boolean> {
    return true;
  }
}

/**
 * In-memory blockchain anchor for testing.
 * Stores committed hashes in a local map and verifies against them.
 * Simulates blockchain behavior without external dependencies.
 */
export class InMemoryAnchor implements BlockchainAnchor {
  readonly anchorName = "in-memory";
  private readonly store = new Map<string, string>(); // blockRef → hash
  private blockCounter = 0;

  async commit(hash: string): Promise<string> {
    const blockRef = `block-${++this.blockCounter}`;
    this.store.set(blockRef, hash);
    return blockRef;
  }

  async verify(hash: string, blockReference: string): Promise<boolean> {
    const storedHash = this.store.get(blockReference);
    return storedHash === hash;
  }

  /** Returns all stored commitments (for testing). */
  getAll(): ReadonlyMap<string, string> {
    return this.store;
  }
}
