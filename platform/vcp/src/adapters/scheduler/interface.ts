/**
 * SchedulerAdapter — abstraction over scheduled job execution.
 */

export interface ScheduledJob {
  id: string;
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

export interface SchedulerAdapter {
  /** Schedule a recurring job. */
  schedule(job: ScheduledJob): void;

  /** Cancel a scheduled job. */
  cancel(jobId: string): void;

  /** Stop all scheduled jobs. */
  stopAll(): void;
}
