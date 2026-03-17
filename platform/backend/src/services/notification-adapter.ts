/**
 * NotificationAdapter — interface for delivering notifications to users.
 *
 * Implementations: ConsoleNotificationAdapter (dev), SMTP/SES/Twilio (production).
 */

import { logger } from "../lib/logger.js";

export interface NotificationParams {
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
}

export interface NotificationAdapter {
  send(params: NotificationParams): Promise<void>;
}

/**
 * Console adapter — logs notifications to stdout. Default for development.
 */
export class ConsoleNotificationAdapter implements NotificationAdapter {
  private readonly log = logger.child({ component: "notification" });

  async send({ to, subject, body }: NotificationParams): Promise<void> {
    this.log.info(`[notification] To: ${to} | ${subject}`, { body });
  }
}
