/**
 * @votiverse/identity — Type definitions
 *
 * Interfaces for the identity abstraction layer.
 */

import type { Participant, ParticipantId, Result } from "@votiverse/core";

// ---------------------------------------------------------------------------
// Identity provider interface
// ---------------------------------------------------------------------------

/** Credentials passed to authenticate a participant. Provider-specific. */
export interface AuthCredentials {
  readonly [key: string]: unknown;
}

/** Result of a successful authentication. */
export interface AuthResult {
  readonly participantId: ParticipantId;
  readonly participant: Participant;
}

/**
 * Abstract identity provider interface.
 *
 * Organizations plug in their identity provider at configuration time.
 * The engine calls these methods without knowing the underlying mechanism.
 */
export interface IdentityProvider {
  /** Human-readable name for this provider (e.g., "invitation", "oauth"). */
  readonly providerName: string;

  /**
   * Authenticate a participant with the given credentials.
   * Returns the participant on success, or an error description on failure.
   */
  authenticate(
    credentials: AuthCredentials,
  ): Promise<Result<AuthResult, IdentityError>>;

  /**
   * Verify that a participant ID corresponds to a unique real person.
   * Used for Sybil resistance.
   */
  verifyUniqueness(
    participantId: ParticipantId,
  ): Promise<Result<boolean, IdentityError>>;

  /**
   * Retrieve a participant by their ID.
   * Returns undefined if not found.
   */
  getParticipant(
    participantId: ParticipantId,
  ): Promise<Participant | undefined>;

  /**
   * List all registered participants.
   */
  listParticipants(): Promise<readonly Participant[]>;
}

// ---------------------------------------------------------------------------
// Sybil check interface
// ---------------------------------------------------------------------------

/**
 * A hook that identity providers implement to certify that a participant
 * is unique. Different implementations use different mechanisms:
 * social verification, organizational directory lookup, biometrics, etc.
 */
export interface SybilCheck {
  /** Name of this check mechanism. */
  readonly checkName: string;

  /**
   * Verify that the participant identified by the given ID is a unique
   * person. Returns true if verified, false if not, or an error.
   */
  verify(participantId: ParticipantId): Promise<Result<boolean, IdentityError>>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Describes the kind of identity error. */
export type IdentityErrorKind =
  | "authentication_failed"
  | "not_found"
  | "duplicate_participant"
  | "invalid_invitation"
  | "provider_error";

/** Structured identity error. */
export interface IdentityError {
  readonly kind: IdentityErrorKind;
  readonly message: string;
}
