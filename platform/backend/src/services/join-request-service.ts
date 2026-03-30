/**
 * JoinRequestService — manages pending join requests for approval-mode groups.
 *
 * Refactored to use group_id instead of assembly_id.
 */

import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { ConflictError, NotFoundError } from "../api/middleware/error-handler.js";

export interface JoinRequest {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userHandle: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface JoinRequestRow {
  id: string;
  group_id: string;
  user_id: string;
  user_name: string;
  user_handle: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function rowToRequest(row: JoinRequestRow): JoinRequest {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    userName: row.user_name,
    userHandle: row.user_handle,
    status: row.status as JoinRequest["status"],
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export class JoinRequestService {
  constructor(private readonly db: DatabaseAdapter) {}

  /** Create a pending join request. Throws ConflictError if one already exists. */
  async create(
    groupId: string,
    userId: string,
    userName: string,
    userHandle: string | null,
  ): Promise<JoinRequest> {
    // Check for existing pending request
    const existing = await this.db.queryOne<JoinRequestRow>(
      "SELECT * FROM join_requests WHERE group_id = ? AND user_id = ? AND status = 'pending'",
      [groupId, userId],
    );
    if (existing) {
      throw new ConflictError("You already have a pending request to join this group");
    }

    const id = uuidv7();
    const createdAt = new Date().toISOString();

    await this.db.run(
      `INSERT INTO join_requests (id, group_id, user_id, user_name, user_handle, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [id, groupId, userId, userName, userHandle, createdAt],
    );

    return {
      id, groupId, userId, userName, userHandle,
      status: "pending", reviewedBy: null, reviewedAt: null, createdAt,
    };
  }

  /** List join requests for a group, optionally filtered by status. */
  async listByGroup(groupId: string, status?: string): Promise<JoinRequest[]> {
    const sql = status
      ? "SELECT * FROM join_requests WHERE group_id = ? AND status = ? ORDER BY created_at DESC"
      : "SELECT * FROM join_requests WHERE group_id = ? ORDER BY created_at DESC";
    const params = status ? [groupId, status] : [groupId];
    const rows = await this.db.query<JoinRequestRow>(sql, params);
    return rows.map(rowToRequest);
  }

  /** List a user's pending join requests across all groups. */
  async listByUser(userId: string): Promise<JoinRequest[]> {
    const rows = await this.db.query<JoinRequestRow>(
      "SELECT * FROM join_requests WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC",
      [userId],
    );
    return rows.map(rowToRequest);
  }

  /** Get a join request by ID. */
  async getById(id: string): Promise<JoinRequest | null> {
    const row = await this.db.queryOne<JoinRequestRow>(
      "SELECT * FROM join_requests WHERE id = ?",
      [id],
    );
    return row ? rowToRequest(row) : null;
  }

  /** Check if a user has a pending request for a group. */
  async hasPending(userId: string, groupId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM join_requests WHERE user_id = ? AND group_id = ? AND status = 'pending'",
      [userId, groupId],
    );
    return !!row;
  }

  /** Approve a join request. Returns the updated request. */
  async approve(requestId: string, reviewedByUserId: string): Promise<JoinRequest> {
    const result = await this.db.run(
      "UPDATE join_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'",
      [reviewedByUserId, new Date().toISOString(), requestId],
    );
    if (result.changes === 0) {
      throw new NotFoundError("Join request not found or already reviewed");
    }
    const req = await this.getById(requestId);
    return req!;
  }

  /** Reject a join request. Returns the updated request. */
  async reject(requestId: string, reviewedByUserId: string): Promise<JoinRequest> {
    const result = await this.db.run(
      "UPDATE join_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'",
      [reviewedByUserId, new Date().toISOString(), requestId],
    );
    if (result.changes === 0) {
      throw new NotFoundError("Join request not found or already reviewed");
    }
    const req = await this.getById(requestId);
    return req!;
  }
}
