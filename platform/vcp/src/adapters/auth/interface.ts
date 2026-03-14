/**
 * AuthAdapter — abstraction over client authentication.
 */

export interface ClientInfo {
  id: string;
  name: string;
}

export interface AuthAdapter {
  /** Validate an API key and return the associated client, or null if invalid. */
  validate(apiKey: string): ClientInfo | null;
}
