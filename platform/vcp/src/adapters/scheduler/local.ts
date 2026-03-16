/**
 * Local scheduler adapter using setInterval.
 */

import type { SchedulerAdapter, ScheduledJob } from "./interface.js";
import { logger } from "../../lib/logger.js";

export class LocalSchedulerAdapter implements SchedulerAdapter {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  schedule(job: ScheduledJob): void {
    if (this.timers.has(job.id)) {
      this.cancel(job.id);
    }
    const timer = setInterval(() => {
      job.handler().catch((err: unknown) => {
        logger.error(`Scheduler job "${job.name}" failed`, { error: String(err) });
      });
    }, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  cancel(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(jobId);
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}
