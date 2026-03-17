/**
 * AuthAdapter — abstraction over client authentication.
 */

/** Auth scope: 'participant' for governance actions, 'operational' for lifecycle management. */
export type AuthScope = "participant" | "operational";

export interface ClientInfo {
  id: string;
  name: string;
  scopes: readonly AuthScope[];
  /** Assembly IDs this client can access. "*" = unrestricted. */
  assemblyAccess: readonly string[] | "*";
}

export interface AuthAdapter {
  /** Validate an API key and return the associated client, or null if invalid. */
  validate(apiKey: string): Promise<ClientInfo | null>;
  /** Grant a client access to an assembly (appends to assembly_access list). */
  grantAssemblyAccess?(clientId: string, assemblyId: string): Promise<void>;
}
