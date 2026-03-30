/**
 * InvitationNotifier — sends email notifications when direct invitations are created.
 *
 * Resolves the invitee's handle to an email address (internal lookup) and dispatches
 * via the configured NotificationAdapter. The admin who sends the invitation never
 * sees the invitee's email — the backend resolves it internally.
 *
 * Refactored to use GroupService for group name lookup instead of AssemblyCacheService.
 */

import type { NotificationAdapter } from "./notification-adapter.js";
import type { UserService } from "./user-service.js";
import type { GroupService } from "./group-service.js";
import { renderTemplate } from "./notification-templates.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "invitation-notifier" });

export class InvitationNotifier {
  constructor(
    private readonly notificationAdapter: NotificationAdapter,
    private readonly userService: UserService,
    private readonly groupService: GroupService,
    private readonly baseUrl: string,
  ) {}

  /**
   * Send an invitation email to the invitee. Fire-and-forget — callers should
   * not await this or let failures propagate to the HTTP response.
   */
  async sendInvitationEmail(
    inviteeHandle: string,
    groupId: string,
    inviterName: string,
  ): Promise<void> {
    try {
      const email = await this.userService.getEmailByHandle(inviteeHandle);
      if (!email) {
        log.info(`No email found for handle @${inviteeHandle} — skipping notification`);
        return;
      }

      const group = await this.groupService.get(groupId);
      const groupName = group?.name ?? "a group";

      const { subject, body, bodyHtml } = renderTemplate("invitation_received", {
        assemblyName: groupName,
        title: groupName,
        inviterName,
        baseUrl: `${this.baseUrl}/dashboard`,
      });

      await this.notificationAdapter.send({ to: email, subject, body, bodyHtml });
      log.info(`Invitation email sent to @${inviteeHandle} for group "${groupName}"`);
    } catch (err) {
      // Fire-and-forget: log but don't propagate
      log.error(`Failed to send invitation email to @${inviteeHandle}`, { error: String(err) });
    }
  }
}
