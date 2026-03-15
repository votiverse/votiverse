/**
 * @votiverse/identity — InvitationProvider
 *
 * Identity provider for small groups. An administrator invites
 * participants by name. Identity is established by personal knowledge.
 */

import type {
  Participant,
  ParticipantId,
  Result,
  EventStore,
  ParticipantRegisteredEvent,
} from "@votiverse/core";
import { ok, err, generateParticipantId, generateEventId, now, createEvent } from "@votiverse/core";
import type {
  IdentityProvider,
  AuthCredentials,
  AuthResult,
  IdentityError,
  SybilCheck,
} from "./types.js";

/**
 * Credentials for the invitation provider.
 * Participants authenticate by providing the name they were invited with.
 */
export interface InvitationCredentials extends AuthCredentials {
  readonly name: string;
}

/**
 * Identity provider for small groups where identity is established
 * by personal knowledge (invitation by an administrator).
 *
 * Suitable for clubs, teams, committees — Stage 1 deployments.
 */
export class InvitationProvider implements IdentityProvider, SybilCheck {
  readonly providerName = "invitation";
  readonly checkName = "invitation-social-verification";

  private readonly participants = new Map<ParticipantId, Participant>();
  private readonly nameIndex = new Map<string, ParticipantId>();

  constructor(private readonly eventStore: EventStore) {}

  /**
   * Rebuild internal state from the event store.
   * Call this after loading a persisted event store to restore
   * the provider's participant maps.
   */
  async rehydrate(): Promise<void> {
    const events = await this.eventStore.query({
      types: ["ParticipantRegistered"],
    });
    for (const event of events) {
      if (event.type === "ParticipantRegistered") {
        const payload = event.payload as {
          participantId: ParticipantId;
          name: string;
        };
        const participant: Participant = {
          id: payload.participantId,
          name: payload.name,
          registeredAt: event.timestamp,
          status: "active",
        };
        this.participants.set(payload.participantId, participant);
        this.nameIndex.set(payload.name.toLowerCase(), payload.participantId);
      }
    }
  }

  /**
   * Invite a new participant by name. Creates the participant and
   * records a ParticipantRegistered event.
   */
  async invite(name: string): Promise<Result<Participant, IdentityError>> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      return err({
        kind: "invalid_invitation",
        message: "Participant name must not be empty",
      });
    }

    if (this.nameIndex.has(normalizedName.toLowerCase())) {
      return err({
        kind: "duplicate_participant",
        message: `Participant "${normalizedName}" already exists`,
      });
    }

    const id = generateParticipantId();
    const timestamp = now();
    const participant: Participant = {
      id,
      name: normalizedName,
      registeredAt: timestamp,
      status: "active",
    };

    const event = createEvent<ParticipantRegisteredEvent>(
      "ParticipantRegistered",
      { participantId: id, name: normalizedName },
      generateEventId(),
      timestamp,
    );

    await this.eventStore.append(event);
    this.participants.set(id, participant);
    this.nameIndex.set(normalizedName.toLowerCase(), id);

    return ok(participant);
  }

  async authenticate(credentials: AuthCredentials): Promise<Result<AuthResult, IdentityError>> {
    const name = (credentials as InvitationCredentials).name;
    if (typeof name !== "string") {
      return err({
        kind: "authentication_failed",
        message: "Name is required for invitation-based authentication",
      });
    }

    const participantId = this.nameIndex.get(name.trim().toLowerCase());
    if (participantId === undefined) {
      return err({
        kind: "authentication_failed",
        message: `No participant with name "${name}" found`,
      });
    }

    const participant = this.participants.get(participantId);
    if (participant === undefined) {
      return err({
        kind: "not_found",
        message: `Participant data inconsistency for "${name}"`,
      });
    }

    return ok({ participantId, participant });
  }

  async verifyUniqueness(participantId: ParticipantId): Promise<Result<boolean, IdentityError>> {
    // In invitation-based identity, uniqueness is guaranteed by the
    // administrator who invited the participant. If they exist, they're unique.
    if (this.participants.has(participantId)) {
      return ok(true);
    }
    return ok(false);
  }

  async verify(participantId: ParticipantId): Promise<Result<boolean, IdentityError>> {
    return this.verifyUniqueness(participantId);
  }

  async getParticipant(participantId: ParticipantId): Promise<Participant | undefined> {
    return this.participants.get(participantId);
  }

  async listParticipants(): Promise<readonly Participant[]> {
    return [...this.participants.values()];
  }
}
