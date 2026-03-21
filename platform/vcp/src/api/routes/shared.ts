/**
 * Shared helpers for route handlers.
 */

import type { GovernanceConfig } from "@votiverse/config";

/**
 * Derives delegation visibility from the governance config.
 *
 * Visibility is derived (not stored) in the new config model:
 * - "public" when candidacy=true (declared candidates are public by design)
 * - "private" otherwise
 *
 * incomingVisibility is always "direct" (delegates see direct delegators only).
 */
export function getDelegationVisibility(config: GovernanceConfig): {
  mode: "public" | "private";
  incomingVisibility: "direct";
} {
  return {
    mode: config.delegation.candidacy ? "public" : "private",
    incomingVisibility: "direct",
  };
}
