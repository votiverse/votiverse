/**
 * Console webhook adapter — logs webhook payloads to stdout.
 * Used for local development.
 */

import type { WebhookAdapter, WebhookPayload } from "./interface.js";
import { logger } from "../../lib/logger.js";

export class ConsoleWebhookAdapter implements WebhookAdapter {
  async deliver(payload: WebhookPayload): Promise<void> {
    logger.debug(`Webhook ${payload.type}`, { assemblyId: payload.assemblyId, data: payload.data });
  }
}
