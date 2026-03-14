/**
 * QueueAdapter — abstraction over the task queue.
 *
 * Decouples event-producing operations from async processing.
 */

export interface WorkerTask {
  id: string;
  type: WorkerTaskType;
  assemblyId: string;
  payload: Record<string, unknown>;
  priority: "high" | "normal" | "low";
  createdAt: string;
  attempts: number;
  maxAttempts: number;
}

export type WorkerTaskType =
  | "awareness-recompute"
  | "webhook-deliver"
  | "ai-outcome-gather"
  | "anomaly-detect"
  | "prediction-evaluate"
  | "reminder-send"
  | "trend-refresh"
  | "integrity-commit";

export type TaskHandler = (task: WorkerTask) => Promise<void>;

export interface QueueAdapter {
  /** Enqueue a task for async processing. */
  enqueue(task: Omit<WorkerTask, "id" | "createdAt" | "attempts" | "maxAttempts"> & { maxAttempts?: number }): void;

  /** Register a handler for a task type. */
  registerHandler(type: WorkerTaskType, handler: TaskHandler): void;

  /** Start processing tasks. */
  start(): void;

  /** Stop processing tasks. */
  stop(): void;

  /** Get the current queue depth. */
  depth(): number;
}
