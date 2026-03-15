// Re-export from use-identity for backward compatibility.
// All new code should import from use-identity.ts directly.
export { IdentityContext as ParticipantContext, useParticipant } from "./use-identity.js";
export type { IdentityCtx as ParticipantCtx } from "./use-identity.js";
