/**
 * In-memory queue adapter for local development.
 *
 * Tasks are stored in an array and processed by a setInterval loop.
 */

import { randomUUID } from "node:crypto";
import type { QueueAdapter, WorkerTask, WorkerTaskType, TaskHandler } from "./interface.js";

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;

export class MemoryQueueAdapter implements QueueAdapter {
  private readonly tasks: WorkerTask[] = [];
  private readonly handlers = new Map<WorkerTaskType, TaskHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  enqueue(
    task: Omit<WorkerTask, "id" | "createdAt" | "attempts" | "maxAttempts"> & { maxAttempts?: number },
  ): void {
    this.tasks.push({
      ...task,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: task.maxAttempts ?? 3,
    });
    // Sort by priority
    this.tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }

  registerHandler(type: WorkerTaskType, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processNext();
    }, 100);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  depth(): number {
    return this.tasks.length;
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.tasks.length === 0) return;
    this.processing = true;

    const task = this.tasks.shift();
    if (!task) {
      this.processing = false;
      return;
    }

    const handler = this.handlers.get(task.type);
    if (!handler) {
      // No handler registered — silently drop
      this.processing = false;
      return;
    }

    try {
      task.attempts++;
      await handler(task);
    } catch {
      if (task.attempts < task.maxAttempts) {
        this.tasks.push(task);
      }
      // else: dead letter — for local dev, just drop it
    } finally {
      this.processing = false;
    }
  }
}
