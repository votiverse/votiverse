/**
 * Console webhook adapter — logs webhook payloads to stdout.
 * Used for local development.
 */

import type { WebhookAdapter, WebhookPayload } from "./interface.js";

export class ConsoleWebhookAdapter implements WebhookAdapter {
  async deliver(payload: WebhookPayload): Promise<void> {
    console.log(`[webhook] ${payload.type} for assembly ${payload.assemblyId}:`, JSON.stringify(payload.data));
  }
}
