/**
 * AuthAdapter — abstraction over client authentication.
 */

/** Auth scope: 'participant' for governance actions, 'operational' for lifecycle management. */
export type AuthScope = "participant" | "operational";

export interface ClientInfo {
  id: string;
  name: string;
  scopes: readonly AuthScope[];
}

export interface AuthAdapter {
  /** Validate an API key and return the associated client, or null if invalid. */
  validate(apiKey: string): ClientInfo | null;
}
