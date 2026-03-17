/**
 * NotificationAdapter — interface for delivering notifications to users.
 *
 * Implementations: ConsoleNotificationAdapter (dev), SmtpNotificationAdapter (production).
 */

import { createTransport, type Transporter } from "nodemailer";
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

/**
 * SMTP adapter — sends email via an SMTP server using nodemailer.
 */
export class SmtpNotificationAdapter implements NotificationAdapter {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly log = logger.child({ component: "notification-smtp" });

  constructor(config: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  }) {
    this.from = config.from;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user
        ? { user: config.user, pass: config.pass }
        : undefined,
    });
  }

  async send({ to, subject, body, bodyHtml }: NotificationParams): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text: body,
        html: bodyHtml,
      });
      this.log.info(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.log.error(`Failed to send email to ${to}`, { error: String(err) });
      throw err;
    }
  }
}
