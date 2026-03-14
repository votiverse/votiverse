/**
 * WebhookAdapter — abstraction over webhook delivery.
 */

export interface WebhookPayload {
  id: string;
  type: string;
  assemblyId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookAdapter {
  /** Deliver a webhook payload. */
  deliver(payload: WebhookPayload): Promise<void>;
}
