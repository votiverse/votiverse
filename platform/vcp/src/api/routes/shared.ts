/**
 * Shared constants for route handlers.
 */

/** Default delegation visibility config, used when config.delegation.visibility is undefined. */
export const DEFAULT_DELEGATION_VISIBILITY = {
  mode: "public" as const,
  incomingVisibility: "direct" as const,
};
