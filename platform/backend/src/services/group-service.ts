/**
 * GroupService — manages groups, capabilities, and group members.
 *
 * Groups are the user-facing top-level entity. Each group may link to
 * a VCP assembly (via vcp_assembly_id) when VCP-backed capabilities
 * (voting, scoring, surveys, community notes) are enabled.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { v4 as uuid } from "uuid";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdmissionMode = "open" | "approval" | "invite-only";
export type VoteCreation = "admin" | "members";
export type GroupRole = "owner" | "admin" | "member";
export type Capability = "voting" | "scoring" | "surveys" | "community_notes";

export interface Group {
  id: string;
  name: string;
  handle: string;
  avatarStyle: string;
  websiteUrl: string | null;
  admissionMode: AdmissionMode;
  voteCreation: VoteCreation;
  createdBy: string;
  createdAt: string;
  vcpAssemblyId: string | null;
}

export interface GroupCapability {
  groupId: string;
  capability: Capability;
  enabled: boolean;
  enabledAt: string;
  disabledAt: string | null;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  participantId: string | null;
  role: GroupRole;
  joinedAt: string;
  title: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

export interface CreateGroupParams {
  name: string;
  handle: string;
  createdBy: string;
  admissionMode?: AdmissionMode;
  websiteUrl?: string | null;
  voteCreation?: VoteCreation;
  avatarStyle?: string;
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string;
  name: string;
  handle: string;
  avatar_style: string;
  website_url: string | null;
  admission_mode: string;
  vote_creation: string;
  created_by: string;
  created_at: string;
  vcp_assembly_id: string | null;
}

interface CapabilityRow {
  group_id: string;
  capability: string;
  enabled: number;
  enabled_at: string;
  disabled_at: string | null;
}

interface MemberRow {
  group_id: string;
  user_id: string;
  participant_id: string | null;
  role: string;
  joined_at: string;
  title: string | null;
  avatar_url: string | null;
  banner_url: string | null;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    avatarStyle: row.avatar_style,
    websiteUrl: row.website_url,
    admissionMode: row.admission_mode as AdmissionMode,
    voteCreation: row.vote_creation as VoteCreation,
    createdBy: row.created_by,
    createdAt: row.created_at,
    vcpAssemblyId: row.vcp_assembly_id,
  };
}

function rowToCapability(row: CapabilityRow): GroupCapability {
  return {
    groupId: row.group_id,
    capability: row.capability as Capability,
    enabled: !!row.enabled,
    enabledAt: row.enabled_at,
    disabledAt: row.disabled_at,
  };
}

function rowToMember(row: MemberRow): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    participantId: row.participant_id,
    role: row.role as GroupRole,
    joinedAt: row.joined_at,
    title: row.title,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class GroupService {
  constructor(private readonly db: DatabaseAdapter) {}

  // ── Group CRUD ────────────────────────────────────────────────────────────

  async create(params: CreateGroupParams): Promise<Group> {
    const id = uuid();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO groups (id, name, handle, avatar_style, website_url, admission_mode, vote_creation, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.name,
        params.handle,
        params.avatarStyle ?? "initials",
        params.websiteUrl ?? null,
        params.admissionMode ?? "approval",
        params.voteCreation ?? "admin",
        params.createdBy,
        now,
      ],
    );
    return {
      id,
      name: params.name,
      handle: params.handle,
      avatarStyle: params.avatarStyle ?? "initials",
      websiteUrl: params.websiteUrl ?? null,
      admissionMode: params.admissionMode ?? "approval",
      voteCreation: params.voteCreation ?? "admin",
      createdBy: params.createdBy,
      createdAt: now,
      vcpAssemblyId: null,
    };
  }

  async get(id: string): Promise<Group | undefined> {
    const row = await this.db.queryOne<GroupRow>(
      "SELECT * FROM groups WHERE id = ?",
      [id],
    );
    return row ? rowToGroup(row) : undefined;
  }

  async getByHandle(handle: string): Promise<Group | undefined> {
    const row = await this.db.queryOne<GroupRow>(
      "SELECT * FROM groups WHERE handle = ?",
      [handle],
    );
    return row ? rowToGroup(row) : undefined;
  }

  async getByVcpAssemblyId(assemblyId: string): Promise<Group | undefined> {
    const row = await this.db.queryOne<GroupRow>(
      "SELECT * FROM groups WHERE vcp_assembly_id = ?",
      [assemblyId],
    );
    return row ? rowToGroup(row) : undefined;
  }

  async listByIds(ids: string[]): Promise<Group[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.db.query<GroupRow>(
      `SELECT * FROM groups WHERE id IN (${placeholders})`,
      ids,
    );
    return rows.map(rowToGroup);
  }

  async update(id: string, updates: Partial<Pick<Group, "name" | "handle" | "avatarStyle" | "websiteUrl" | "admissionMode" | "voteCreation">>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.handle !== undefined) { sets.push("handle = ?"); params.push(updates.handle); }
    if (updates.avatarStyle !== undefined) { sets.push("avatar_style = ?"); params.push(updates.avatarStyle); }
    if (updates.websiteUrl !== undefined) { sets.push("website_url = ?"); params.push(updates.websiteUrl); }
    if (updates.admissionMode !== undefined) { sets.push("admission_mode = ?"); params.push(updates.admissionMode); }
    if (updates.voteCreation !== undefined) { sets.push("vote_creation = ?"); params.push(updates.voteCreation); }
    if (sets.length === 0) return;
    params.push(id);
    await this.db.run(`UPDATE groups SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async setVcpAssemblyId(groupId: string, assemblyId: string): Promise<void> {
    await this.db.run(
      "UPDATE groups SET vcp_assembly_id = ? WHERE id = ?",
      [assemblyId, groupId],
    );
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  async enableCapability(groupId: string, capability: Capability): Promise<void> {
    await this.db.run(
      `INSERT INTO group_capabilities (group_id, capability, enabled, enabled_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT (group_id, capability) DO UPDATE SET
         enabled = 1, enabled_at = datetime('now'), disabled_at = NULL`,
      [groupId, capability],
    );
  }

  async disableCapability(groupId: string, capability: Capability): Promise<void> {
    await this.db.run(
      `UPDATE group_capabilities SET enabled = 0, disabled_at = datetime('now')
       WHERE group_id = ? AND capability = ?`,
      [groupId, capability],
    );
  }

  async getCapabilities(groupId: string): Promise<GroupCapability[]> {
    const rows = await this.db.query<CapabilityRow>(
      "SELECT * FROM group_capabilities WHERE group_id = ?",
      [groupId],
    );
    return rows.map(rowToCapability);
  }

  async isCapabilityEnabled(groupId: string, capability: Capability): Promise<boolean> {
    const row = await this.db.queryOne<{ enabled: number }>(
      "SELECT enabled FROM group_capabilities WHERE group_id = ? AND capability = ?",
      [groupId, capability],
    );
    return !!row?.enabled;
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async addMember(groupId: string, userId: string, role: GroupRole = "member", participantId?: string | null): Promise<void> {
    await this.db.run(
      `INSERT INTO group_members (group_id, user_id, participant_id, role, joined_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, userId, participantId ?? null, role],
    );
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.db.run(
      "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
      [groupId, userId],
    );
  }

  async getMember(groupId: string, userId: string): Promise<GroupMember | undefined> {
    const row = await this.db.queryOne<MemberRow>(
      "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?",
      [groupId, userId],
    );
    return row ? rowToMember(row) : undefined;
  }

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const rows = await this.db.query<MemberRow>(
      "SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at",
      [groupId],
    );
    return rows.map(rowToMember);
  }

  async getUserGroups(userId: string): Promise<Array<Group & { role: GroupRole; participantId: string | null }>> {
    const rows = await this.db.query<GroupRow & { role: string; participant_id: string | null }>(
      `SELECT g.*, gm.role, gm.participant_id
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = ?
       ORDER BY gm.joined_at`,
      [userId],
    );
    return rows.map((row) => ({
      ...rowToGroup(row),
      role: row.role as GroupRole,
      participantId: row.participant_id,
    }));
  }

  async getMemberCount(groupId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM group_members WHERE group_id = ?",
      [groupId],
    );
    return row?.count ?? 0;
  }

  async updateMemberRole(groupId: string, userId: string, role: GroupRole): Promise<void> {
    await this.db.run(
      "UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?",
      [role, groupId, userId],
    );
  }

  async updateMemberProfile(groupId: string, userId: string, updates: { title?: string | null; avatarUrl?: string | null; bannerUrl?: string | null }): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (updates.title !== undefined) { sets.push("title = ?"); params.push(updates.title); }
    if (updates.avatarUrl !== undefined) { sets.push("avatar_url = ?"); params.push(updates.avatarUrl); }
    if (updates.bannerUrl !== undefined) { sets.push("banner_url = ?"); params.push(updates.bannerUrl); }
    if (sets.length === 0) return;
    params.push(groupId, userId);
    await this.db.run(`UPDATE group_members SET ${sets.join(", ")} WHERE group_id = ? AND user_id = ?`, params);
  }

  async setParticipantId(groupId: string, userId: string, participantId: string): Promise<void> {
    await this.db.run(
      "UPDATE group_members SET participant_id = ? WHERE group_id = ? AND user_id = ?",
      [participantId, groupId, userId],
    );
  }

  /** Get the participant ID for a user in a group (resolves via group_members). */
  async getParticipantId(groupId: string, userId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ participant_id: string | null }>(
      "SELECT participant_id FROM group_members WHERE group_id = ? AND user_id = ?",
      [groupId, userId],
    );
    return row?.participant_id ?? null;
  }

  /** Resolve group_id → vcp_assembly_id. Returns null if group has no VCP assembly. */
  async resolveAssemblyId(groupId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ vcp_assembly_id: string | null }>(
      "SELECT vcp_assembly_id FROM groups WHERE id = ?",
      [groupId],
    );
    return row?.vcp_assembly_id ?? null;
  }

  /** Map participant IDs to user names (for a given group). */
  async getParticipantNames(groupId: string, participantIds: string[]): Promise<Map<string, string>> {
    if (participantIds.length === 0) return new Map();
    const placeholders = participantIds.map(() => "?").join(", ");
    const rows = await this.db.query<{ participant_id: string; name: string }>(
      `SELECT gm.participant_id, u.name
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ? AND gm.participant_id IN (${placeholders})`,
      [groupId, ...participantIds],
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.participant_id, row.name);
    }
    return map;
  }

  /** Map participant IDs to user handles (for a given group). */
  async getHandlesForParticipants(groupId: string, participantIds: string[]): Promise<Map<string, string>> {
    if (participantIds.length === 0) return new Map();
    const placeholders = participantIds.map(() => "?").join(", ");
    const rows = await this.db.query<{ participant_id: string; handle: string }>(
      `SELECT gm.participant_id, u.handle
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ? AND gm.participant_id IN (${placeholders})`,
      [groupId, ...participantIds],
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.participant_id, row.handle);
    }
    return map;
  }
}
