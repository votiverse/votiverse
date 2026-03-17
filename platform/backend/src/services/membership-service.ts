/**
 * MembershipService — manages user-to-participant mapping across assemblies.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { VCPClient } from "./vcp-client.js";
import type { AssemblyCacheService } from "./assembly-cache.js";
import { NotFoundError, ConflictError } from "../api/middleware/error-handler.js";

interface MembershipRow {
  user_id: string;
  assembly_id: string;
  participant_id: string;
  assembly_name: string;
  joined_at: string;
}

export interface Membership {
  assemblyId: string;
  participantId: string;
  assemblyName: string;
  joinedAt: string;
}

export class MembershipService {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly vcpClient: VCPClient,
    private readonly assemblyCache?: AssemblyCacheService,
  ) {}

  /** Join an assembly: create participant in VCP + store local mapping. */
  async joinAssembly(userId: string, assemblyId: string, participantName: string): Promise<Membership> {
    // Check for existing membership
    const existing = await this.db.queryOne<MembershipRow>(
      "SELECT * FROM memberships WHERE user_id = ? AND assembly_id = ?",
      [userId, assemblyId],
    );
    if (existing) {
      throw new ConflictError("Already a member of this assembly");
    }

    // Get assembly info from VCP
    const assembly = await this.vcpClient.getAssembly(assemblyId);

    // Cache assembly data locally
    if (this.assemblyCache) {
      await this.assemblyCache.upsert({
        id: assembly.id,
        organizationId: assembly.organizationId,
        name: assembly.name,
        config: assembly.config,
        status: assembly.status,
        createdAt: assembly.createdAt,
      });
    }

    // Create participant in VCP
    const participant = await this.vcpClient.createParticipant(assemblyId, participantName);

    // Store local mapping
    const joinedAt = new Date().toISOString();
    await this.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name, joined_at) VALUES (?, ?, ?, ?, ?)",
      [userId, assemblyId, participant.id, assembly.name, joinedAt],
    );

    return {
      assemblyId,
      participantId: participant.id,
      assemblyName: assembly.name,
      joinedAt,
    };
  }

  /** Get participant ID for a user in a specific assembly. */
  async getParticipantId(userId: string, assemblyId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ participant_id: string }>(
      "SELECT participant_id FROM memberships WHERE user_id = ? AND assembly_id = ?",
      [userId, assemblyId],
    );
    return row?.participant_id ?? null;
  }

  /** Get participant ID or throw if not a member. */
  async getParticipantIdOrThrow(userId: string, assemblyId: string): Promise<string> {
    const pid = await this.getParticipantId(userId, assemblyId);
    if (!pid) throw new NotFoundError("Not a member of this assembly");
    return pid;
  }

  /** Get all memberships for a user. */
  async getUserMemberships(userId: string): Promise<Membership[]> {
    const rows = await this.db.query<MembershipRow>(
      "SELECT * FROM memberships WHERE user_id = ? ORDER BY joined_at ASC",
      [userId],
    );
    return rows.map((r) => ({
      assemblyId: r.assembly_id,
      participantId: r.participant_id,
      assemblyName: r.assembly_name,
      joinedAt: r.joined_at,
    }));
  }

  /**
   * Create a membership record directly (used by seed script).
   * Does NOT call VCP — assumes participant already exists.
   */
  async createMembership(
    userId: string,
    assemblyId: string,
    participantId: string,
    assemblyName: string,
  ): Promise<void> {
    await this.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
      [userId, assemblyId, participantId, assemblyName],
    );
  }
}
