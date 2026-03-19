/**
 * InvitationNotifier — sends email notifications when direct invitations are created.
 *
 * Resolves the invitee's handle to an email address (internal lookup) and dispatches
 * via the configured NotificationAdapter. The admin who sends the invitation never
 * sees the invitee's email — the backend resolves it internally.
 */

import type { NotificationAdapter } from "./notification-adapter.js";
import type { UserService } from "./user-service.js";
import type { AssemblyCacheService } from "./assembly-cache.js";
import { renderTemplate } from "./notification-templates.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "invitation-notifier" });

export class InvitationNotifier {
  constructor(
    private readonly notificationAdapter: NotificationAdapter,
    private readonly userService: UserService,
    private readonly assemblyCacheService: AssemblyCacheService,
    private readonly baseUrl: string,
  ) {}

  /**
   * Send an invitation email to the invitee. Fire-and-forget — callers should
   * not await this or let failures propagate to the HTTP response.
   */
  async sendInvitationEmail(
    inviteeHandle: string,
    assemblyId: string,
    inviterName: string,
  ): Promise<void> {
    try {
      const email = await this.userService.getEmailByHandle(inviteeHandle);
      if (!email) {
        log.info(`No email found for handle @${inviteeHandle} — skipping notification`);
        return;
      }

      const assembly = await this.assemblyCacheService.get(assemblyId);
      const assemblyName = assembly?.name ?? "a group";

      const { subject, body, bodyHtml } = renderTemplate("invitation_received", {
        assemblyName,
        title: assemblyName,
        inviterName,
        baseUrl: `${this.baseUrl}/dashboard`,
      });

      await this.notificationAdapter.send({ to: email, subject, body, bodyHtml });
      log.info(`Invitation email sent to @${inviteeHandle} for group "${assemblyName}"`);
    } catch (err) {
      // Fire-and-forget: log but don't propagate
      log.error(`Failed to send invitation email to @${inviteeHandle}`, { error: String(err) });
    }
  }
}
