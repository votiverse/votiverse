/**
 * MembershipService — manages user-to-participant mapping across assemblies.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { VCPClient } from "./vcp-client.js";
import type { AssemblyCacheService } from "./assembly-cache.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../api/middleware/error-handler.js";

interface MembershipRow {
  user_id: string;
  assembly_id: string;
  participant_id: string;
  assembly_name: string;
  joined_at: string;
  title: string | null;
  avatar_url: string | null;
  banner_url: string | null;
}

export interface Membership {
  assemblyId: string;
  participantId: string;
  assemblyName: string;
  joinedAt: string;
  title?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

export class MembershipService {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly vcpClient: VCPClient,
    private readonly assemblyCache?: AssemblyCacheService,
  ) {}

  /** Join an assembly: create participant in VCP + store local mapping. */
  async joinAssembly(userId: string, assemblyId: string, participantName: string): Promise<Membership> {
    // Require verified email before joining any assembly
    const user = await this.db.queryOne<{ email_verified: number | boolean }>(
      "SELECT email_verified FROM users WHERE id = ?",
      [userId],
    );
    if (user && !user.email_verified) {
      throw new ForbiddenError("Please verify your email address before joining a group");
    }

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
      title: r.title ?? null,
      avatarUrl: r.avatar_url ?? null,
      bannerUrl: r.banner_url ?? null,
    }));
  }

  /**
   * Get user display names for a list of participant IDs in an assembly.
   * Returns a Map from participantId to user name.
   */
  async getParticipantNames(assemblyId: string, participantIds: string[]): Promise<Map<string, string>> {
    if (participantIds.length === 0) return new Map();

    // Look up users via the memberships table
    const placeholders = participantIds.map(() => "?").join(",");
    const rows = await this.db.query<{ participant_id: string; user_id: string }>(
      `SELECT participant_id, user_id FROM memberships WHERE assembly_id = ? AND participant_id IN (${placeholders})`,
      [assemblyId, ...participantIds],
    );

    const result = new Map<string, string>();
    for (const row of rows) {
      // Get user name
      const user = await this.db.queryOne<{ name: string }>(
        "SELECT name FROM users WHERE id = ?",
        [row.user_id],
      );
      if (user) {
        result.set(row.participant_id, user.name);
      }
    }
    return result;
  }

  /** Get all user-to-participant mappings for an assembly. */
  async getUserMembershipsByAssembly(assemblyId: string): Promise<Array<{ userId: string; participantId: string }>> {
    const rows = await this.db.query<{ user_id: string; participant_id: string }>(
      "SELECT user_id, participant_id FROM memberships WHERE assembly_id = ?",
      [assemblyId],
    );
    return rows.map((r) => ({ userId: r.user_id, participantId: r.participant_id }));
  }

  /** Get the number of members in an assembly. */
  async getAssemblyMemberCount(assemblyId: string): Promise<number> {
    const row = await this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM memberships WHERE assembly_id = ?",
      [assemblyId],
    );
    return row?.cnt ?? 0;
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

  /** Update per-membership profile fields (title, avatar, banner). */
  async updateMemberProfile(
    userId: string,
    assemblyId: string,
    updates: { title?: string | null; avatarUrl?: string | null; bannerUrl?: string | null },
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) {
      sets.push("title = ?");
      values.push(updates.title);
    }
    if (updates.avatarUrl !== undefined) {
      sets.push("avatar_url = ?");
      values.push(updates.avatarUrl);
    }
    if (updates.bannerUrl !== undefined) {
      sets.push("banner_url = ?");
      values.push(updates.bannerUrl);
    }

    if (sets.length === 0) return;

    values.push(userId, assemblyId);
    const result = await this.db.run(
      `UPDATE memberships SET ${sets.join(", ")} WHERE user_id = ? AND assembly_id = ?`,
      values,
    );
    if (result.changes === 0) throw new NotFoundError("Not a member of this assembly");
  }

  /**
   * Get membership titles for a list of participant IDs in an assembly.
   * Returns a Map from participantId to title (only entries with non-null title).
   */
  async getMembershipTitles(assemblyId: string, participantIds: string[]): Promise<Map<string, string>> {
    if (participantIds.length === 0) return new Map();

    const placeholders = participantIds.map(() => "?").join(",");
    const rows = await this.db.query<{ participant_id: string; title: string }>(
      `SELECT participant_id, title FROM memberships WHERE assembly_id = ? AND participant_id IN (${placeholders}) AND title IS NOT NULL`,
      [assemblyId, ...participantIds],
    );

    const result = new Map<string, string>();
    for (const row of rows) {
      result.set(row.participant_id, row.title);
    }
    return result;
  }

  /**
   * Get user handles for a list of participant IDs in an assembly.
   * Returns a Map from participantId to handle (only entries with non-null handle).
   */
  async getHandlesForParticipants(assemblyId: string, participantIds: string[]): Promise<Map<string, string>> {
    if (participantIds.length === 0) return new Map();

    const placeholders = participantIds.map(() => "?").join(",");
    const rows = await this.db.query<{ participant_id: string; handle: string }>(
      `SELECT m.participant_id, u.handle FROM memberships m JOIN users u ON m.user_id = u.id WHERE m.assembly_id = ? AND m.participant_id IN (${placeholders}) AND u.handle IS NOT NULL`,
      [assemblyId, ...participantIds],
    );

    const result = new Map<string, string>();
    for (const row of rows) {
      result.set(row.participant_id, row.handle);
    }
    return result;
  }
}
