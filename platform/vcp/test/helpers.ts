/**
 * Test helpers — creates an in-process VCP for integration testing.
 */

import { Hono } from "hono";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TestClock } from "@votiverse/core";
import { SQLiteAdapter } from "../src/adapters/database/sqlite.js";
import { runMigrations } from "../src/adapters/database/migrator.js";
import { MemoryQueueAdapter } from "../src/adapters/queue/memory.js";
import { LocalSchedulerAdapter } from "../src/adapters/scheduler/local.js";
import { ConsoleWebhookAdapter } from "../src/adapters/webhook/console.js";
import { SimpleAuthAdapter } from "../src/adapters/auth/simple.js";
import type { VCPAdapters } from "../src/adapters/index.js";
import { AssemblyManager } from "../src/engine/assembly-manager.js";
import { createApp } from "../src/api/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

export const TEST_API_KEY = "test_key_12345";

/** API key with empty assemblyAccess and participant-only scope. */
export const LIMITED_API_KEY = "limited_key_67890";

export interface TestVCP {
  app: Hono;
  manager: AssemblyManager;
  clock: TestClock;
  db: SQLiteAdapter;
  auth: SimpleAuthAdapter;
  cleanup: () => void;
  request: (method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => Promise<{ status: number; json: () => Promise<unknown> }>;
  requestAs: (participantId: string, method: string, path: string, body?: unknown) => Promise<{ status: number; json: () => Promise<unknown> }>;
  /** Make a request using a specific API key. */
  requestWithKey: (apiKey: string, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => Promise<{ status: number; json: () => Promise<unknown> }>;
}

export async function createTestVCP(): Promise<TestVCP> {
  // Use in-memory SQLite for tests
  const db = new SQLiteAdapter(":memory:");
  await db.initialize();
  await runMigrations(db, MIGRATIONS_DIR);

  const queue = new MemoryQueueAdapter();
  const scheduler = new LocalSchedulerAdapter();
  const webhook = new ConsoleWebhookAdapter();
  const auth = new SimpleAuthAdapter(
    [
      { key: TEST_API_KEY, clientId: "test-client", clientName: "Test Client", assemblyAccess: "*" },
      { key: LIMITED_API_KEY, clientId: "limited-client", clientName: "Limited Client", scopes: ["participant"], assemblyAccess: [] },
    ],
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

  const makeRequest = async (apiKey: string, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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

  const request = (method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => {
    return makeRequest(TEST_API_KEY, method, path, body, extraHeaders);
  };

  /** Make a request with X-Participant-Id header set. */
  const requestAs = (participantId: string, method: string, path: string, body?: unknown) => {
    return request(method, path, body, { "X-Participant-Id": participantId });
  };

  const requestWithKey = (apiKey: string, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => {
    return makeRequest(apiKey, method, path, body, extraHeaders);
  };

  return { app, manager, clock, db, auth, cleanup, request, requestAs, requestWithKey };
}
