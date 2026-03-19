/**
 * NotificationHubService — persistent in-app notification feed.
 *
 * Creates notification records in the database and optionally dispatches
 * to external channels (email/push) via the NotificationAdapter.
 * In-app notifications are always created regardless of delivery preferences.
 */

import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { NotificationAdapter } from "./notification-adapter.js";
import type { NotificationService } from "./notification-service.js";
import type { MembershipService } from "./membership-service.js";
import type { VCPClient } from "./vcp-client.js";
import type { AssemblyCacheService } from "./assembly-cache.js";
import { renderTemplate, type NotificationType as EmailTemplateType } from "./notification-templates.js";
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
  assemblyId: string;
  assemblyName?: string;
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
  assembly_id: string;
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
    assemblyId: row.assembly_id,
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
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly membershipService: MembershipService,
    private readonly assemblyCacheService: AssemblyCacheService,
    private readonly notificationAdapter: NotificationAdapter | null,
    private readonly notificationService: NotificationService,
    private readonly vcpClient: VCPClient,
  ) {}

  /** Create a notification for a single user. */
  async notify(params: {
    userId: string;
    assemblyId: string;
    type: NotificationType;
    urgency: Urgency;
    title: string;
    body?: string;
    actionUrl?: string;
  }): Promise<void> {
    const id = randomUUID();
    await this.db.run(
      `INSERT INTO notifications (id, user_id, assembly_id, type, urgency, title, body, action_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userId, params.assemblyId, params.type, params.urgency,
       params.title, params.body ?? null, params.actionUrl ?? null, new Date().toISOString()],
    );

    // Fire-and-forget email dispatch (if adapter configured and user wants it)
    if (this.notificationAdapter) {
      void this.dispatchEmail(params.userId, params.assemblyId, params.type, params.title).catch((err) =>
        log.error("Email dispatch failed", { error: String(err) }),
      );
    }
  }

  /** Create notifications for all members of an assembly. */
  async notifyAssemblyMembers(params: {
    assemblyId: string;
    type: NotificationType;
    urgency: Urgency;
    title: string;
    body?: string;
    actionUrl?: string;
    excludeUserIds?: string[];
  }): Promise<void> {
    const memberships = await this.membershipService.getUserMembershipsByAssembly(params.assemblyId);
    const exclude = new Set(params.excludeUserIds ?? []);

    for (const m of memberships) {
      if (exclude.has(m.userId)) continue;
      await this.notify({
        userId: m.userId,
        assemblyId: params.assemblyId,
        type: params.type,
        urgency: params.urgency,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
      });
    }
  }

  /** Create notifications for assembly admins/owners only. */
  async notifyAssemblyAdmins(params: {
    assemblyId: string;
    type: NotificationType;
    urgency: Urgency;
    title: string;
    body?: string;
    actionUrl?: string;
  }): Promise<void> {
    try {
      const roles = await this.vcpClient.listRoles(params.assemblyId);
      const adminPids = roles
        .filter((r) => r.role === "admin" || r.role === "owner")
        .map((r) => r.participantId);

      // Resolve participant IDs to user IDs
      const memberships = await this.membershipService.getUserMembershipsByAssembly(params.assemblyId);
      const adminUserIds = memberships
        .filter((m) => adminPids.includes(m.participantId))
        .map((m) => m.userId);

      for (const userId of adminUserIds) {
        await this.notify({
          userId,
          assemblyId: params.assemblyId,
          type: params.type,
          urgency: params.urgency,
          title: params.title,
          body: params.body,
          actionUrl: params.actionUrl,
        });
      }
    } catch (err) {
      log.error("Failed to notify assembly admins", { assemblyId: params.assemblyId, error: String(err) });
    }
  }

  /** List notifications for a user (paginated, filterable). */
  async list(userId: string, options?: {
    assemblyId?: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: Notification[]; unreadCount: number; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Build WHERE clause
    const conditions = ["user_id = ?"];
    const params: unknown[] = [userId];

    if (options?.assemblyId) {
      conditions.push("assembly_id = ?");
      params.push(options.assemblyId);
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

    // Get unread count (always unfiltered by assembly for the badge)
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

    // Enrich with assembly names
    const assemblyIds = [...new Set(rows.map((r) => r.assembly_id))];
    const assemblies = await this.assemblyCacheService.listByIds(assemblyIds);
    const nameMap = new Map(assemblies.map((a) => [a.id, a.name]));

    const notifications = rows.map((row) => ({
      ...rowToNotification(row),
      assemblyName: nameMap.get(row.assembly_id),
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

  /** Mark all notifications as read for a user (optionally scoped to assembly). */
  async markAllRead(userId: string, assemblyId?: string): Promise<void> {
    if (assemblyId) {
      await this.db.run(
        "UPDATE notifications SET read_at = ? WHERE user_id = ? AND assembly_id = ? AND read_at IS NULL",
        [new Date().toISOString(), userId, assemblyId],
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
    assemblyId: string,
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

    // Get assembly name
    const assembly = await this.assemblyCacheService.get(assemblyId);
    const assemblyName = assembly?.name ?? "a group";

    try {
      const rendered = renderTemplate(templateType, {
        assemblyName,
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
