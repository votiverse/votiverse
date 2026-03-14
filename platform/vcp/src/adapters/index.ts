/**
 * Adapter container — all infrastructure dependencies behind interfaces.
 */

export type { DatabaseAdapter, RunResult } from "./database/interface.js";
export type { QueueAdapter, WorkerTask, WorkerTaskType, TaskHandler } from "./queue/interface.js";
export type { SchedulerAdapter, ScheduledJob } from "./scheduler/interface.js";
export type { WebhookAdapter, WebhookPayload } from "./webhook/interface.js";
export type { AuthAdapter, ClientInfo } from "./auth/interface.js";

export { SQLiteAdapter } from "./database/sqlite.js";
export { MemoryQueueAdapter } from "./queue/memory.js";
export { LocalSchedulerAdapter } from "./scheduler/local.js";
export { ConsoleWebhookAdapter } from "./webhook/console.js";
export { SimpleAuthAdapter } from "./auth/simple.js";

/**
 * Container for all VCP infrastructure adapters.
 * Injected at startup based on configuration.
 */
export interface VCPAdapters {
  database: import("./database/interface.js").DatabaseAdapter;
  queue: import("./queue/interface.js").QueueAdapter;
  scheduler: import("./scheduler/interface.js").SchedulerAdapter;
  webhook: import("./webhook/interface.js").WebhookAdapter;
  auth: import("./auth/interface.js").AuthAdapter;
}
