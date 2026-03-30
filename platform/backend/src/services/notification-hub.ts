/**
 * NotificationHubService — persistent in-app notification feed.
 *
 * Creates notification records in the database and optionally dispatches
 * to external channels (email/push) via the NotificationAdapter.
 * In-app notifications are always created regardless of delivery preferences.
 *
 * Refactored to use group_id instead of assembly_id in the notifications table.
 */

import { v7 as uuidv7 } from "uuid";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { NotificationAdapter } from "./notification-adapter.js";
import type { NotificationService } from "./notification-service.js";
import type { GroupService } from "./group-service.js";
import { renderTemplate, type NotificationType as EmailTemplateType } from "./notification-templates.js";
import type { PushDeliveryService } from "./push-delivery.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "notification-hub" });

export type NotificationType =
  | "vote_created"
  | "voting_open"
  | "deadline_approaching"
  | "results_available"
  | "survey_created"
  | "survey_deadline"
  | "invitation_received"
  | "join_request"
  | "member_joined"
  | "join_request_approved"
  | "join_request_rejected";

export type Urgency = "action" | "timely" | "info";

export interface Notification {
  id: string;
  userId: string;
  groupId: string;
  groupName?: string;
  type: NotificationType;
  urgency: Urgency;
  title: string;
  body: string | null;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  group_id: string;
  type: string;
  urgency: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    type: row.type as NotificationType,
    urgency: row.urgency as Urgency,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}

/** Maps hub notification types to email template types (where applicable). */
const EMAIL_TEMPLATE_MAP: Partial<Record<NotificationType, EmailTemplateType>> = {
  vote_created: "event_created",
  voting_open: "voting_open",
  deadline_approaching: "deadline_approaching",
  results_available: "results_available",
  survey_created: "survey_created",
  survey_deadline: "survey_deadline",
  invitation_received: "invitation_received",
};

export class NotificationHubService {
  private pushService: PushDeliveryService | null = null;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly groupService: GroupService,
    private readonly notificationAdapter: NotificationAdapter | null,
    private readonly notificationService: NotificationService,
  ) {}

  /** Set the push delivery service (called during app wiring). */
  setPushService(service: PushDeliveryService): void {
    this.pushService = service;
  }

  /** Create a notification for a single user. Set skipEmail when the caller already handles email delivery. */
  async notify(params: {
    userId: string;
    groupId: string;
    type: NotificationType;
    urgency: Urgency;
    title: string;
    body?: string;
    actionUrl?: string;
    skipEmail?: boolean;
  }): Promise<void> {
    const id = uuidv7();
    await this.db.run(
      `INSERT INTO notifications (id, user_id, group_id, type, urgency, title, body, action_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userId, params.groupId, params.type, params.urgency,
       params.title, params.body ?? null, params.actionUrl ?? null, new Date().toISOString()],
    );

    // Fire-and-forget email dispatch (skip if caller already sent email)
    if (!params.skipEmail && this.notificationAdapter) {
      void this.dispatchEmail(params.userId, params.groupId, params.type, params.title).catch((err) =>
        log.error("Email dispatch failed", { error: String(err) }),
      );
    }

    // Fire-and-forget push notification delivery
    if (this.pushService?.enabled) {
      void this.pushService.sendToUser({
        userId: params.userId,
        title: params.title,
        body: params.body ?? params.title,
        category: params.type,
        actionUrl: params.actionUrl,
      }).catch((err) =>
        log.error("Push dispatch failed", { error: String(err) }),
      );
    }
  }

  /** Create notifications for all members of a group. */
  async notifyGroupMembers(params: {
    groupId: string;
    type: NotificationType;
    urgency: Urgency;
    title: string;
    body?: string;
    actionUrl?: string;
    excludeUserIds?: string[];
  }): Promise<void> {
    const members = await this.groupService.getMembers(params.groupId);
    const exclude = new Set(params.excludeUserIds ?? []);

    for (const m of members) {
      if (exclude.has(m.userId)) continue;
      await this.notify({
        userId: m.userId,
        groupId: params.groupId,
        type: params.type,
        urgency: params.urgency,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
      });
    }
  }

  /** Create notifications for group admins/owners only. */
  async notifyGroupAdmins(params: {
    groupId: string;
    type: NotificationType;
    urgency: Urgency;
    title: string;
    body?: string;
    actionUrl?: string;
  }): Promise<void> {
    try {
      const members = await this.groupService.getMembers(params.groupId);
      const adminUserIds = members
        .filter((m) => m.role === "admin" || m.role === "owner")
        .map((m) => m.userId);

      for (const userId of adminUserIds) {
        await this.notify({
          userId,
          groupId: params.groupId,
          type: params.type,
          urgency: params.urgency,
          title: params.title,
          body: params.body,
          actionUrl: params.actionUrl,
        });
      }
    } catch (err) {
      log.error("Failed to notify group admins", { groupId: params.groupId, error: String(err) });
    }
  }

  /** List notifications for a user (paginated, filterable). */
  async list(userId: string, options?: {
    groupId?: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: Notification[]; unreadCount: number; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Build WHERE clause
    const conditions = ["user_id = ?"];
    const params: unknown[] = [userId];

    if (options?.groupId) {
      conditions.push("group_id = ?");
      params.push(options.groupId);
    }
    if (options?.unreadOnly) {
      conditions.push("read_at IS NULL");
    }

    const where = conditions.join(" AND ");

    // Get total count
    const countRow = await this.db.queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM notifications WHERE ${where}`,
      params,
    );
    const total = countRow?.cnt ?? 0;

    // Get unread count (always unfiltered by group for the badge)
    const unreadRow = await this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read_at IS NULL",
      [userId],
    );
    const unreadCount = unreadRow?.cnt ?? 0;

    // Get paginated results — sort: unread first, then by urgency, then by recency
    const rows = await this.db.query<NotificationRow>(
      `SELECT * FROM notifications WHERE ${where}
       ORDER BY
         CASE WHEN read_at IS NULL THEN 0 ELSE 1 END,
         CASE urgency WHEN 'action' THEN 0 WHEN 'timely' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    // Enrich with group names
    const groupIds = [...new Set(rows.map((r) => r.group_id))];
    const groups = await this.groupService.listByIds(groupIds);
    const nameMap = new Map(groups.map((g) => [g.id, g.name]));

    const notifications = rows.map((row) => ({
      ...rowToNotification(row),
      groupName: nameMap.get(row.group_id),
    }));

    return { notifications, unreadCount, total };
  }

  /** Get unread count for the badge. */
  async getUnreadCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read_at IS NULL",
      [userId],
    );
    return row?.cnt ?? 0;
  }

  /** Mark a single notification as read. */
  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.db.run(
      "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
      [new Date().toISOString(), notificationId, userId],
    );
  }

  /** Mark all notifications as read for a user (optionally scoped to group). */
  async markAllRead(userId: string, groupId?: string): Promise<void> {
    if (groupId) {
      await this.db.run(
        "UPDATE notifications SET read_at = ? WHERE user_id = ? AND group_id = ? AND read_at IS NULL",
        [new Date().toISOString(), userId, groupId],
      );
    } else {
      await this.db.run(
        "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
        [new Date().toISOString(), userId],
      );
    }
  }

  /** Dispatch email for a notification (fire-and-forget, preference-checked). */
  private async dispatchEmail(
    userId: string,
    groupId: string,
    type: NotificationType,
    title: string,
  ): Promise<void> {
    if (!this.notificationAdapter) return;

    // Check if this type has an email template
    const templateType = EMAIL_TEMPLATE_MAP[type];
    if (!templateType) return; // Admin notifications don't have email templates yet

    // Check user preferences
    const prefs = await this.notificationService.getPreferences(userId);
    if (prefs.notify_channel === "none") return;

    // Get user email
    const user = await this.db.queryOne<{ email: string }>(
      "SELECT email FROM users WHERE id = ?",
      [userId],
    );
    if (!user) return;

    // Get group name
    const group = await this.groupService.get(groupId);
    const groupName = group?.name ?? "a group";

    try {
      const rendered = renderTemplate(templateType, {
        assemblyName: groupName,
        title,
        baseUrl: "https://votiverse.app", // TODO: configurable
      });
      await this.notificationAdapter.send({
        to: user.email,
        subject: rendered.subject,
        body: rendered.body,
        bodyHtml: rendered.bodyHtml,
      });
    } catch (err) {
      log.error("Email send failed", { userId, type, error: String(err) });
    }
  }
}
