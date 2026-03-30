/**
 * MembershipService — manages user-to-group membership and participant mapping.
 *
 * Refactored from assembly-centric `memberships` table to group-centric
 * `group_members` table. Each group_member row links a userId to a groupId
 * and optionally to a VCP participantId (when the group has a VCP assembly).
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { VCPClient } from "./vcp-client.js";
import type { AssemblyCacheService } from "./assembly-cache.js";
import type { GroupService } from "./group-service.js";
import type { GroupRole } from "./group-service.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../api/middleware/error-handler.js";

export interface Membership {
  groupId: string;
  groupName: string;
  participantId: string | null;
  role: GroupRole;
  joinedAt: string;
  title?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

export class MembershipService {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly vcpClient: VCPClient,
    private readonly groupService: GroupService,
    private readonly assemblyCache?: AssemblyCacheService,
  ) {}

  /**
   * Join a group: if the group has a VCP assembly, create participant in VCP.
   * Stores local group_members mapping.
   */
  async joinGroup(userId: string, groupId: string, participantName: string): Promise<Membership> {
    // Require verified email before joining any group
    const user = await this.db.queryOne<{ email_verified: number | boolean }>(
      "SELECT email_verified FROM users WHERE id = ?",
      [userId],
    );
    if (user && !user.email_verified) {
      throw new ForbiddenError("Please verify your email address before joining a group");
    }

    // Check for existing membership
    const existing = await this.groupService.getMember(groupId, userId);
    if (existing) {
      throw new ConflictError("Already a member of this group");
    }

    // Get group info
    const group = await this.groupService.get(groupId);
    if (!group) {
      throw new NotFoundError("Group not found");
    }

    let participantId: string | null = null;

    // If group has a VCP assembly, create participant in VCP
    if (group.vcpAssemblyId) {
      const participant = await this.vcpClient.createParticipant(group.vcpAssemblyId, participantName);
      participantId = participant.id;

      // Cache assembly data locally
      if (this.assemblyCache) {
        try {
          const assembly = await this.vcpClient.getAssembly(group.vcpAssemblyId);
          await this.assemblyCache.upsert({
            id: assembly.id,
            organizationId: assembly.organizationId,
            name: assembly.name,
            config: assembly.config,
            status: assembly.status,
            createdAt: assembly.createdAt,
          });
        } catch {
          // Cache miss is not fatal
        }
      }
    }

    // Store local mapping
    await this.groupService.addMember(groupId, userId, "member", participantId);

    const member = await this.groupService.getMember(groupId, userId);
    return {
      groupId,
      groupName: group.name,
      participantId,
      role: member?.role ?? "member",
      joinedAt: member?.joinedAt ?? new Date().toISOString(),
    };
  }

  /** Get participant ID for a user in a specific group. */
  async getParticipantId(userId: string, groupId: string): Promise<string | null> {
    return this.groupService.getParticipantId(groupId, userId);
  }

  /** Get participant ID or throw if not a member. */
  async getParticipantIdOrThrow(userId: string, groupId: string): Promise<string> {
    const pid = await this.getParticipantId(userId, groupId);
    if (!pid) throw new NotFoundError("Not a member of this group");
    return pid;
  }

  /** Get all memberships for a user. */
  async getUserMemberships(userId: string): Promise<Membership[]> {
    const groups = await this.groupService.getUserGroups(userId);
    return groups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      participantId: g.participantId,
      role: g.role,
      joinedAt: g.joinedAt ?? "",
      title: null,
      avatarUrl: null,
      bannerUrl: null,
    }));
  }

  /**
   * Get user display names for a list of participant IDs in a group.
   * Returns a Map from participantId to user name.
   */
  async getParticipantNames(groupId: string, participantIds: string[]): Promise<Map<string, string>> {
    return this.groupService.getParticipantNames(groupId, participantIds);
  }

  /** Get all user-to-participant mappings for a group. */
  async getUserMembershipsByGroup(groupId: string): Promise<Array<{ userId: string; participantId: string }>> {
    const members = await this.groupService.getMembers(groupId);
    return members
      .filter((m) => m.participantId !== null)
      .map((m) => ({ userId: m.userId, participantId: m.participantId! }));
  }

  /** Get the number of members in a group. */
  async getGroupMemberCount(groupId: string): Promise<number> {
    return this.groupService.getMemberCount(groupId);
  }

  /**
   * Create a membership record directly (used by seed script).
   * Does NOT call VCP — assumes participant already exists.
   */
  async createMembership(
    userId: string,
    groupId: string,
    participantId: string,
    _groupName: string,
    role: GroupRole = "member",
  ): Promise<void> {
    // groupName is accepted for backward compatibility with seed scripts but
    // is no longer stored separately — it comes from the groups table.
    await this.groupService.addMember(groupId, userId, role, participantId);
  }

  /** Update per-membership profile fields (title, avatar, banner). */
  async updateMemberProfile(
    userId: string,
    groupId: string,
    updates: { title?: string | null; avatarUrl?: string | null; bannerUrl?: string | null },
  ): Promise<void> {
    const member = await this.groupService.getMember(groupId, userId);
    if (!member) throw new NotFoundError("Not a member of this group");
    await this.groupService.updateMemberProfile(groupId, userId, updates);
  }

  /**
   * Get membership titles for a list of participant IDs in a group.
   * Returns a Map from participantId to title (only entries with non-null title).
   */
  async getMembershipTitles(groupId: string, participantIds: string[]): Promise<Map<string, string>> {
    if (participantIds.length === 0) return new Map();

    const placeholders = participantIds.map(() => "?").join(",");
    const rows = await this.db.query<{ participant_id: string; title: string }>(
      `SELECT participant_id, title FROM group_members WHERE group_id = ? AND participant_id IN (${placeholders}) AND title IS NOT NULL`,
      [groupId, ...participantIds],
    );

    const result = new Map<string, string>();
    for (const row of rows) {
      result.set(row.participant_id, row.title);
    }
    return result;
  }

  /**
   * Get user handles for a list of participant IDs in a group.
   * Returns a Map from participantId to handle (only entries with non-null handle).
   */
  async getHandlesForParticipants(groupId: string, participantIds: string[]): Promise<Map<string, string>> {
    return this.groupService.getHandlesForParticipants(groupId, participantIds);
  }
}
