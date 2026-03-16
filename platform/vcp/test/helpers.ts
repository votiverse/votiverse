/**
 * Test helpers — creates an in-process VCP for integration testing.
 */

import { Hono } from "hono";
import { TestClock } from "@votiverse/core";
import { SQLiteAdapter } from "../src/adapters/database/sqlite.js";
import { MemoryQueueAdapter } from "../src/adapters/queue/memory.js";
import { LocalSchedulerAdapter } from "../src/adapters/scheduler/local.js";
import { ConsoleWebhookAdapter } from "../src/adapters/webhook/console.js";
import { SimpleAuthAdapter } from "../src/adapters/auth/simple.js";
import type { VCPAdapters } from "../src/adapters/index.js";
import { AssemblyManager } from "../src/engine/assembly-manager.js";
import { createApp } from "../src/api/server.js";

const TEST_API_KEY = "test_key_12345";

export interface TestVCP {
  app: Hono;
  manager: AssemblyManager;
  clock: TestClock;
  db: SQLiteAdapter;
  cleanup: () => void;
  request: (method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => Promise<{ status: number; json: () => Promise<unknown> }>;
  requestAs: (participantId: string, method: string, path: string, body?: unknown) => Promise<{ status: number; json: () => Promise<unknown> }>;
}

export async function createTestVCP(): Promise<TestVCP> {
  // Use in-memory SQLite for tests
  const db = new SQLiteAdapter(":memory:");
  await db.initialize();

  const queue = new MemoryQueueAdapter();
  const scheduler = new LocalSchedulerAdapter();
  const webhook = new ConsoleWebhookAdapter();
  const auth = new SimpleAuthAdapter(
    [{ key: TEST_API_KEY, clientId: "test-client", clientName: "Test Client" }],
    db,
  );

  const adapters: VCPAdapters = { database: db, queue, scheduler, webhook, auth };
  const clock = new TestClock();
  const manager = new AssemblyManager(db, queue);
  manager.timeProvider = clock;
  const app = createApp(adapters, manager);

  queue.start();

  const cleanup = () => {
    queue.stop();
    scheduler.stopAll();
    void db.close();
  };

  const request = async (method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
        ...extraHeaders,
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const req = new Request(`http://localhost${path}`, init);
    const res = await app.fetch(req);
    return {
      status: res.status,
      json: () => res.json(),
    };
  };

  /** Make a request with X-Participant-Id header set. */
  const requestAs = (participantId: string, method: string, path: string, body?: unknown) => {
    return request(method, path, body, { "X-Participant-Id": participantId });
  };

  return { app, manager, clock, db, cleanup, request, requestAs };
}
