/**
 * Basic in-memory metrics collector.
 */

export interface MetricsSnapshot {
  requestCount: number;
  errorCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  statusCounts: Record<number, number>;
  startedAt: string;
}

class MetricsCollector {
  private requestCount = 0;
  private errorCount = 0;
  private totalLatencyMs = 0;
  private readonly statusCounts: Record<number, number> = {};
  private readonly startedAt = new Date().toISOString();

  record(status: number, durationMs: number): void {
    this.requestCount++;
    this.totalLatencyMs += durationMs;
    this.statusCounts[status] = (this.statusCounts[status] ?? 0) + 1;
    if (status >= 500) this.errorCount++;
  }

  snapshot(): MetricsSnapshot {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      totalLatencyMs: this.totalLatencyMs,
      avgLatencyMs: this.requestCount > 0
        ? Math.round(this.totalLatencyMs / this.requestCount)
        : 0,
      statusCounts: { ...this.statusCounts },
      startedAt: this.startedAt,
    };
  }
}

export const metrics = new MetricsCollector();
