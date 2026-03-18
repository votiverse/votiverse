/**
 * @votiverse/content — Public API
 *
 * Governance metadata lifecycle for proposals, delegate candidacies,
 * and community notes. The VCP stores metadata and content hashes;
 * rich content (markdown, assets) lives in the client backend.
 */

// Types
export type {
  VersionRecord,
  NoteTarget,
  ProposalStatus,
  ProposalMetadata,
  SubmitProposalParams,
  CreateProposalVersionParams,
  CandidacyStatus,
  CandidacyMetadata,
  DeclareCandidacyParams,
  CreateCandidacyVersionParams,
  NoteStatus,
  NoteMetadata,
  CreateNoteParams,
  NoteVisibility,
} from "./types.js";

// Content hash
export { computeContentHash, computeAssetHash } from "./content-hash.js";

// Proposals
export { ProposalService } from "./proposals.js";

// Candidacies
export { CandidacyService } from "./candidacies.js";

// Notes
export { NoteService, computeNoteVisibility } from "./notes.js";
