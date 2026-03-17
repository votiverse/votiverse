/**
 * NotificationAdapter — interface for delivering notifications to users.
 *
 * Implementations:
 *   - ConsoleNotificationAdapter — logs to stdout (dev default)
 *   - FileNotificationAdapter — writes .eml files to a directory (dev, inspectable)
 *   - SmtpNotificationAdapter — sends real email via SMTP (production)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
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
 * File adapter — writes each notification as an .eml file to a local directory.
 * Useful for dev: inspect the plain text and HTML output without a mail server.
 */
export class FileNotificationAdapter implements NotificationAdapter {
  private readonly log = logger.child({ component: "notification-file" });
  private readonly dir: string;
  private initialized = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  async send({ to, subject, body, bodyHtml }: NotificationParams): Promise<void> {
    if (!this.initialized) {
      await mkdir(this.dir, { recursive: true });
      this.initialized = true;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeSubject = subject.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60);
    const basename = `${timestamp}_${safeSubject}`;

    // Write plain-text version
    const emlContent = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      body,
    ].join("\n");
    await writeFile(join(this.dir, `${basename}.eml`), emlContent, "utf-8");

    // Write HTML version alongside for easy browser preview
    if (bodyHtml) {
      await writeFile(join(this.dir, `${basename}.html`), bodyHtml, "utf-8");
    }

    this.log.info(`[notification] Written to ${this.dir}/${basename}.eml → To: ${to} | ${subject}`);
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
