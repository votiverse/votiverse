/**
 * InvitationService — manages invite links and direct invitations.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { MembershipService } from "./membership-service.js";
import { NotFoundError, ConflictError, ValidationError } from "../api/middleware/error-handler.js";

interface InvitationRow {
  id: string;
  assembly_id: string;
  type: string;
  token: string | null;
  invited_by: string;
  invitee_handle: string | null;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  status: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  assemblyId: string;
  type: "link" | "direct";
  token: string | null;
  invitedBy: string;
  inviteeHandle: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  status: string;
  createdAt: string;
}

function rowToInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    assemblyId: row.assembly_id,
    type: row.type as "link" | "direct",
    token: row.token,
    invitedBy: row.invited_by,
    inviteeHandle: row.invitee_handle,
    maxUses: row.max_uses,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class InvitationService {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly membershipService: MembershipService,
  ) {}

  /** Default link invite expiration: 7 days. */
  static readonly DEFAULT_LINK_EXPIRY_DAYS = 7;

  /** Create an invite link. Returns the invitation with token. */
  async createLinkInvite(
    assemblyId: string,
    invitedByUserId: string,
    options?: { maxUses?: number; expiresAt?: string },
  ): Promise<Invitation> {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = options?.expiresAt
      ?? new Date(Date.now() + InvitationService.DEFAULT_LINK_EXPIRY_DAYS * 86400000).toISOString();
    const maxUses = options?.maxUses ?? null;

    await this.db.run(
      `INSERT INTO invitations (id, assembly_id, type, token, invited_by, max_uses, expires_at, status, created_at)
       VALUES (?, ?, 'link', ?, ?, ?, ?, 'active', ?)`,
      [id, assemblyId, token, invitedByUserId, maxUses, expiresAt, new Date().toISOString()],
    );

    return {
      id, assemblyId, type: "link", token, invitedBy: invitedByUserId,
      inviteeHandle: null, maxUses, useCount: 0, expiresAt, status: "active",
      createdAt: new Date().toISOString(),
    };
  }

  /** Create a direct invitation to a specific user by handle. */
  async createDirectInvite(
    assemblyId: string,
    invitedByUserId: string,
    inviteeHandle: string,
  ): Promise<Invitation> {
    const id = randomUUID();

    await this.db.run(
      `INSERT INTO invitations (id, assembly_id, type, invited_by, invitee_handle, status, created_at)
       VALUES (?, ?, 'direct', ?, ?, 'active', ?)`,
      [id, assemblyId, invitedByUserId, inviteeHandle.toLowerCase(), new Date().toISOString()],
    );

    return {
      id, assemblyId, type: "direct", token: null, invitedBy: invitedByUserId,
      inviteeHandle: inviteeHandle.toLowerCase(), maxUses: null, useCount: 0,
      expiresAt: null, status: "active", createdAt: new Date().toISOString(),
    };
  }

  /** List invitations for an assembly. */
  async listByAssembly(assemblyId: string): Promise<Invitation[]> {
    const rows = await this.db.query<InvitationRow>(
      "SELECT * FROM invitations WHERE assembly_id = ? ORDER BY created_at DESC",
      [assemblyId],
    );
    return rows.map(rowToInvitation);
  }

  /** List pending direct invitations for a user (by handle). */
  async listPendingForHandle(handle: string): Promise<Invitation[]> {
    const rows = await this.db.query<InvitationRow>(
      "SELECT * FROM invitations WHERE type = 'direct' AND invitee_handle = ? AND status = 'active' ORDER BY created_at DESC",
      [handle.toLowerCase()],
    );
    return rows.map(rowToInvitation);
  }

  /** Get an invitation by token (for link invites). */
  async getByToken(token: string): Promise<Invitation | null> {
    const row = await this.db.queryOne<InvitationRow>(
      "SELECT * FROM invitations WHERE token = ?",
      [token],
    );
    return row ? rowToInvitation(row) : null;
  }

  /** Get an invitation by ID. */
  async getById(id: string): Promise<Invitation | null> {
    const row = await this.db.queryOne<InvitationRow>(
      "SELECT * FROM invitations WHERE id = ?",
      [id],
    );
    return row ? rowToInvitation(row) : null;
  }

  /** Revoke an invitation. */
  async revoke(invitationId: string): Promise<void> {
    await this.db.run(
      "UPDATE invitations SET status = 'revoked' WHERE id = ?",
      [invitationId],
    );
  }

  /**
   * Accept an invitation. Creates the membership and records the acceptance.
   * Returns the assembly ID for redirect.
   */
  async accept(invitation: Invitation, userId: string, userName: string): Promise<{ assemblyId: string }> {
    // Validate invitation is still active
    if (invitation.status !== "active") {
      throw new ValidationError("This invitation is no longer active");
    }

    // Check expiration
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      await this.db.run("UPDATE invitations SET status = 'expired' WHERE id = ?", [invitation.id]);
      throw new ValidationError("This invitation has expired");
    }

    // Check max uses (link invites)
    if (invitation.type === "link" && invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) {
      throw new ValidationError("This invitation has reached its maximum number of uses");
    }

    // Check if user is already a member
    const existingPid = await this.membershipService.getParticipantId(userId, invitation.assemblyId);
    if (existingPid) {
      throw new ConflictError("You are already a member of this group");
    }

    // Join the assembly
    await this.membershipService.joinAssembly(userId, invitation.assemblyId, userName);

    // Record acceptance
    await this.db.run(
      "INSERT INTO invitation_acceptances (id, invitation_id, user_id, accepted_at) VALUES (?, ?, ?, ?)",
      [randomUUID(), invitation.id, userId, new Date().toISOString()],
    );

    // Increment use count
    await this.db.run(
      "UPDATE invitations SET use_count = use_count + 1 WHERE id = ?",
      [invitation.id],
    );

    return { assemblyId: invitation.assemblyId };
  }
}
