/**
 * NotificationService — tracks governance events/surveys and dispatches
 * notifications on a schedule based on user preferences.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { NotificationAdapter } from "./notification-adapter.js";
import type { VCPClient } from "./vcp-client.js";
import type { NotificationHubService, NotificationType as HubNotificationType, Urgency } from "./notification-hub.js";
import { renderTemplate } from "./notification-templates.js";
import { logger } from "../lib/logger.js";
import * as devClock from "../lib/dev-clock.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface TrackedEvent {
  id: string;
  assemblyId: string;
  title: string;
  votingStart: string;
  votingEnd: string;
}

export interface TrackedSurvey {
  id: string;
  assemblyId: string;
  title: string;
  schedule: string;
  closesAt: string;
}

interface TrackedEventRow {
  id: string;
  assembly_id: string;
  title: string;
  voting_start: string;
  voting_end: string;
  created_at: string;
  notified_created: number;
  notified_voting_open: number;
  notified_deadline: number;
  notified_closed: number;
}

interface TrackedSurveyRow {
  id: string;
  assembly_id: string;
  title: string;
  schedule: string;
  closes_at: string;
  created_at: string;
  notified_created: number;
  notified_deadline: number;
  notified_closed: number;
}

interface MembershipRow {
  user_id: string;
  assembly_id: string;
  participant_id: string;
  assembly_name: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
}

interface PrefRow {
  key: string;
  value: string;
}

/** Preference keys and their defaults. */
const PREFERENCE_DEFAULTS: Record<string, string> = {
  notify_new_votes: "always",
  notify_new_surveys: "true",
  notify_deadlines: "true",
  notify_results: "false",
  notify_channel: "email",
  notify_admin_join_requests: "true",
  notify_admin_new_members: "false",
};

const VALID_PREFERENCES: Record<string, string[]> = {
  notify_new_votes: ["always", "undelegated_only", "never"],
  notify_new_surveys: ["true", "false"],
  notify_deadlines: ["true", "false"],
  notify_results: ["true", "false"],
  notify_channel: ["email", "sms", "both", "none"],
  notify_admin_join_requests: ["true", "false"],
  notify_admin_new_members: ["true", "false"],
};

export interface NotificationPreferences {
  notify_new_votes: string;
  notify_new_surveys: string;
  notify_deadlines: string;
  notify_results: string;
  notify_channel: string;
  notify_admin_join_requests: string;
  notify_admin_new_members: string;
}

// ─── Service ─────────────────────────────────────────────────────────

export class NotificationService {
  private readonly log = logger.child({ component: "notifications" });
  private hub: NotificationHubService | null = null;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly adapter: NotificationAdapter,
    private readonly vcpClient: VCPClient,
    private readonly baseUrl: string,
  ) {}

  /** Set the notification hub for creating in-app notification records. */
  setHub(hub: NotificationHubService): void {
    this.hub = hub;
  }

  // ── Tracking ─────────────────────────────────────────────────────

  /** Track a new voting event for notification scheduling. */
  async trackEvent(event: TrackedEvent): Promise<void> {
    await this.db.run(
      `INSERT INTO tracked_events (id, assembly_id, title, voting_start, voting_end)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.assemblyId, event.title, event.votingStart, event.votingEnd],
    );
    this.log.info(`Tracking event: ${event.title}`, { eventId: event.id, assemblyId: event.assemblyId });
  }

  /** Track a new survey for notification scheduling. */
  async trackSurvey(survey: TrackedSurvey): Promise<void> {
    await this.db.run(
      `INSERT INTO tracked_surveys (id, assembly_id, title, schedule, closes_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [survey.id, survey.assemblyId, survey.title, survey.schedule, survey.closesAt],
    );
    this.log.info(`Tracking survey: ${survey.title}`, { surveyId: survey.id, assemblyId: survey.assemblyId });
  }

  /** Mark all notification flags as sent (used by seed to prevent re-notifying historical data). */
  async markAllNotified(type: "event" | "survey", id: string): Promise<void> {
    if (type === "event") {
      await this.db.run(
        "UPDATE tracked_events SET notified_created = 1, notified_voting_open = 1, notified_deadline = 1, notified_closed = 1 WHERE id = ?",
        [id],
      );
    } else {
      await this.db.run(
        "UPDATE tracked_surveys SET notified_created = 1, notified_deadline = 1, notified_closed = 1 WHERE id = ?",
        [id],
      );
    }
  }

  // ── Preferences ──────────────────────────────────────────────────

  /** Get notification preferences for a user (with defaults applied). */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const rows = await this.db.query<PrefRow>(
      "SELECT key, value FROM notification_preferences WHERE user_id = ?",
      [userId],
    );

    const prefs: Record<string, string> = { ...PREFERENCE_DEFAULTS };
    for (const row of rows) {
      prefs[row.key] = row.value;
    }
    return prefs as NotificationPreferences;
  }

  /** Set a single notification preference for a user. */
  async setPreference(userId: string, key: string, value: string): Promise<void> {
    const validValues = VALID_PREFERENCES[key];
    if (!validValues) {
      throw new Error(`Unknown preference key: ${key}`);
    }
    if (!validValues.includes(value)) {
      throw new Error(`Invalid value "${value}" for ${key}. Valid: ${validValues.join(", ")}`);
    }

    await this.db.run(
      `INSERT INTO notification_preferences (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
      [userId, key, value],
    );
  }

  // ── Scheduler ────────────────────────────────────────────────────

  /** Process all pending notifications. Called on each scheduler tick. */
  async processScheduledNotifications(): Promise<void> {
    const now = devClock.nowIso();
    const deadline = new Date(devClock.now() + 24 * 60 * 60 * 1000).toISOString();

    await this.processEventNotifications(now, deadline);
    await this.processSurveyNotifications(now, deadline);
  }

  // ── Internal: Event notifications ────────────────────────────────

  private async processEventNotifications(now: string, deadline: string): Promise<void> {
    // 1. New events created
    const newEvents = await this.db.query<TrackedEventRow>(
      "SELECT * FROM tracked_events WHERE notified_created = 0",
    );
    for (const event of newEvents) {
      await this.notifyEventCreated(event);
      await this.db.run("UPDATE tracked_events SET notified_created = 1 WHERE id = ?", [event.id]);
    }

    // 2. Voting now open
    const openEvents = await this.db.query<TrackedEventRow>(
      "SELECT * FROM tracked_events WHERE notified_voting_open = 0 AND voting_start <= ?",
      [now],
    );
    for (const event of openEvents) {
      await this.notifyVotingOpen(event);
      await this.db.run("UPDATE tracked_events SET notified_voting_open = 1 WHERE id = ?", [event.id]);
    }

    // 3. Deadline approaching (within 24h)
    const deadlineEvents = await this.db.query<TrackedEventRow>(
      "SELECT * FROM tracked_events WHERE notified_deadline = 0 AND notified_closed = 0 AND voting_end <= ?",
      [deadline],
    );
    for (const event of deadlineEvents) {
      // Don't send deadline notification if already closed
      if (event.voting_end > now) {
        await this.notifyDeadline(event);
      }
      await this.db.run("UPDATE tracked_events SET notified_deadline = 1 WHERE id = ?", [event.id]);
    }

    // 4. Voting closed
    const closedEvents = await this.db.query<TrackedEventRow>(
      "SELECT * FROM tracked_events WHERE notified_closed = 0 AND voting_end <= ?",
      [now],
    );
    for (const event of closedEvents) {
      await this.notifyResultsAvailable(event);
      await this.db.run("UPDATE tracked_events SET notified_closed = 1 WHERE id = ?", [event.id]);
    }
  }

  // ── Internal: Survey notifications ──────────────────────────────

  private async processSurveyNotifications(now: string, deadline: string): Promise<void> {
    // 1. New surveys created
    const newSurveys = await this.db.query<TrackedSurveyRow>(
      "SELECT * FROM tracked_surveys WHERE notified_created = 0",
    );
    for (const survey of newSurveys) {
      await this.notifySurveyCreated(survey);
      await this.db.run("UPDATE tracked_surveys SET notified_created = 1 WHERE id = ?", [survey.id]);
    }

    // 2. Survey closing soon (within 24h)
    const deadlineSurveys = await this.db.query<TrackedSurveyRow>(
      "SELECT * FROM tracked_surveys WHERE notified_deadline = 0 AND notified_closed = 0 AND closes_at <= ?",
      [deadline],
    );
    for (const survey of deadlineSurveys) {
      if (survey.closes_at > now) {
        await this.notifySurveyDeadline(survey);
      }
      await this.db.run("UPDATE tracked_surveys SET notified_deadline = 1 WHERE id = ?", [survey.id]);
    }

    // 3. Survey closed
    const closedSurveys = await this.db.query<TrackedSurveyRow>(
      "SELECT * FROM tracked_surveys WHERE notified_closed = 0 AND closes_at <= ?",
      [now],
    );
    for (const survey of closedSurveys) {
      await this.db.run("UPDATE tracked_surveys SET notified_closed = 1 WHERE id = ?", [survey.id]);
    }
  }

  // ── Internal: Notification dispatch ──────────────────────────────

  private async notifyEventCreated(event: TrackedEventRow): Promise<void> {
    const recipients = await this.resolveRecipients(event.assembly_id, "notify_new_votes", event);
    const assemblyName = await this.getAssemblyName(event.assembly_id);
    const template = renderTemplate("event_created", {
      assemblyName, title: event.title,
      votingStart: event.voting_start, votingEnd: event.voting_end, baseUrl: this.baseUrl,
    });
    for (const r of recipients) {
      await this.adapter.send({ to: r.email, ...template });
    }
    await this.createHubRecords(recipients, event.assembly_id, "vote_created", "timely",
      `New vote: ${event.title}`, `/assembly/${event.assembly_id}/events/${event.id}`);
    this.log.info(`Notified ${recipients.length} users: event created`, { eventId: event.id });
  }

  private async notifyVotingOpen(event: TrackedEventRow): Promise<void> {
    const recipients = await this.resolveRecipients(event.assembly_id, "notify_new_votes", event);
    const assemblyName = await this.getAssemblyName(event.assembly_id);
    const template = renderTemplate("voting_open", {
      assemblyName, title: event.title, votingEnd: event.voting_end, baseUrl: this.baseUrl,
    });
    for (const r of recipients) {
      await this.adapter.send({ to: r.email, ...template });
    }
    await this.createHubRecords(recipients, event.assembly_id, "voting_open", "action",
      `Voting is open: ${event.title}`, `/assembly/${event.assembly_id}/events/${event.id}`);
    this.log.info(`Notified ${recipients.length} users: voting open`, { eventId: event.id });
  }

  private async notifyDeadline(event: TrackedEventRow): Promise<void> {
    const recipients = await this.resolveRecipients(event.assembly_id, "notify_deadlines");
    const assemblyName = await this.getAssemblyName(event.assembly_id);
    const template = renderTemplate("deadline_approaching", {
      assemblyName, title: event.title, votingEnd: event.voting_end, baseUrl: this.baseUrl,
    });
    for (const r of recipients) {
      await this.adapter.send({ to: r.email, ...template });
    }
    await this.createHubRecords(recipients, event.assembly_id, "deadline_approaching", "action",
      `Voting closes tomorrow: ${event.title}`, `/assembly/${event.assembly_id}/events/${event.id}`);
    this.log.info(`Notified ${recipients.length} users: deadline approaching`, { eventId: event.id });
  }

  private async notifyResultsAvailable(event: TrackedEventRow): Promise<void> {
    const recipients = await this.resolveRecipients(event.assembly_id, "notify_results");
    const assemblyName = await this.getAssemblyName(event.assembly_id);
    const template = renderTemplate("results_available", {
      assemblyName, title: event.title, baseUrl: this.baseUrl,
    });
    for (const r of recipients) {
      await this.adapter.send({ to: r.email, ...template });
    }
    await this.createHubRecords(recipients, event.assembly_id, "results_available", "info",
      `Results are in: ${event.title}`, `/assembly/${event.assembly_id}/events/${event.id}`);
    this.log.info(`Notified ${recipients.length} users: results available`, { eventId: event.id });
  }

  private async notifySurveyCreated(survey: TrackedSurveyRow): Promise<void> {
    const recipients = await this.resolveRecipients(survey.assembly_id, "notify_new_surveys");
    const assemblyName = await this.getAssemblyName(survey.assembly_id);
    const template = renderTemplate("survey_created", {
      assemblyName, title: survey.title, baseUrl: this.baseUrl,
    });
    for (const r of recipients) {
      await this.adapter.send({ to: r.email, ...template });
    }
    await this.createHubRecords(recipients, survey.assembly_id, "survey_created", "timely",
      `New survey: ${survey.title}`, `/assembly/${survey.assembly_id}/surveys`);
    this.log.info(`Notified ${recipients.length} users: survey created`, { surveyId: survey.id });
  }

  private async notifySurveyDeadline(survey: TrackedSurveyRow): Promise<void> {
    const recipients = await this.resolveRecipients(survey.assembly_id, "notify_deadlines");
    const assemblyName = await this.getAssemblyName(survey.assembly_id);
    const template = renderTemplate("survey_deadline", {
      assemblyName, title: survey.title, closesAt: survey.closes_at, baseUrl: this.baseUrl,
    });
    for (const r of recipients) {
      await this.adapter.send({ to: r.email, ...template });
    }
    await this.createHubRecords(recipients, survey.assembly_id, "survey_deadline", "action",
      `Survey closes tomorrow: ${survey.title}`, `/assembly/${survey.assembly_id}/surveys`);
    this.log.info(`Notified ${recipients.length} users: survey deadline`, { surveyId: survey.id });
  }

  /** Create in-app notification records in the hub for a set of recipients. */
  private async createHubRecords(
    recipients: Array<{ userId: string; email: string }>,
    assemblyId: string,
    type: HubNotificationType,
    urgency: Urgency,
    title: string,
    actionUrl?: string,
  ): Promise<void> {
    if (!this.hub) return;
    for (const r of recipients) {
      try {
        await this.hub.notify({
          userId: r.userId,
          assemblyId,
          type,
          urgency,
          title,
          actionUrl,
          skipEmail: true, // scheduler already handles email dispatch
        });
      } catch (err) {
        this.log.error("Failed to create hub notification", { userId: r.userId, type, error: String(err) });
      }
    }
  }

  // ── Internal: Recipient resolution ───────────────────────────────

  private async resolveRecipients(
    assemblyId: string,
    preferenceKey: string,
    event?: TrackedEventRow,
  ): Promise<Array<{ userId: string; email: string }>> {
    // Get all members of the assembly
    const members = await this.db.query<MembershipRow>(
      "SELECT * FROM memberships WHERE assembly_id = ?",
      [assemblyId],
    );

    const recipients: Array<{ userId: string; email: string }> = [];

    for (const member of members) {
      const user = await this.db.queryOne<UserRow>(
        "SELECT id, email, name FROM users WHERE id = ? AND status = 'active'",
        [member.user_id],
      );
      if (!user) continue;

      const prefs = await this.getPreferences(user.id);

      // Check channel — if "none", skip all notifications
      if (prefs.notify_channel === "none") continue;

      // Check preference for this notification type
      const prefValue = prefs[preferenceKey as keyof NotificationPreferences];
      if (prefValue === "false" || prefValue === "never") continue;

      // Handle "undelegated_only" for vote notifications
      if (prefValue === "undelegated_only" && event) {
        const covered = await this.isDelegationCovered(
          assemblyId,
          member.participant_id,
        );
        if (covered) continue;
      }

      recipients.push({ userId: user.id, email: user.email });
    }

    return recipients;
  }

  /**
   * Check if a participant's delegations cover the event's topics.
   * This is the one place where we query the VCP at notification time.
   */
  private async isDelegationCovered(
    assemblyId: string,
    participantId: string,
  ): Promise<boolean> {
    try {
      const { body } = await this.vcpClient.request<{ delegations: Array<{ scope: unknown }> }>(
        "GET",
        `/assemblies/${assemblyId}/delegations?from=${participantId}`,
        { participantId },
      );
      // If the participant has any active delegations, consider them "covered"
      // A more precise implementation would check topic overlap with the event
      return body.delegations.length > 0;
    } catch {
      // If VCP is unreachable, default to sending the notification
      this.log.warn("Failed to check delegations, defaulting to notify", {
        assemblyId,
        participantId,
      });
      return false;
    }
  }

  /** Get assembly name from memberships table (avoids VCP call). */
  private async getAssemblyName(assemblyId: string): Promise<string> {
    const row = await this.db.queryOne<{ assembly_name: string }>(
      "SELECT assembly_name FROM memberships WHERE assembly_id = ? LIMIT 1",
      [assemblyId],
    );
    return row?.assembly_name ?? assemblyId;
  }
}
