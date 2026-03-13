/**
 * @votiverse/identity — Public API
 *
 * Identity abstraction layer for participant identity management.
 */

// Types
export type {
  IdentityProvider,
  AuthCredentials,
  AuthResult,
  SybilCheck,
  IdentityError,
  IdentityErrorKind,
} from "./types.js";

// InvitationProvider
export type { InvitationCredentials } from "./invitation-provider.js";
export { InvitationProvider } from "./invitation-provider.js";
