/**
 * Assembly, topic, and poll cache tests — verify local caches serve data without VCP round-trips.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestBackend, type TestBackend } from "./helpers.js";

describe("Assembly cache", () => {
  let backend: TestBackend;
  let accessToken: string;
  let userId: string;

  const ASSEMBLY_A = {
    id: "asm-alpha-001",
    organizationId: "org-1",
    name: "Alpha Assembly",
    config: { delegation: { enabled: true } },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const ASSEMBLY_B = {
    id: "asm-beta-002",
    organizationId: null,
    name: "Beta Assembly",
    config: { delegation: { enabled: false } },
    status: "active",
    createdAt: "2026-02-01T00:00:00.000Z",
  };

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("test@example.com", "password", "Test User");
    accessToken = auth.accessToken;
    userId = auth.userId;
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /assemblies serves from local cache", async () => {
    // Populate cache
    await backend.assemblyCacheService.upsert(ASSEMBLY_A);
    await backend.assemblyCacheService.upsert(ASSEMBLY_B);

    // Create memberships for the user
    await backend.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name) VALUES (?, ?, ?, ?)",
      [userId, ASSEMBLY_A.id, "p-alice", ASSEMBLY_A.name],
    );
    await backend.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name) VALUES (?, ?, ?, ?)",
      [userId, ASSEMBLY_B.id, "p-bob", ASSEMBLY_B.name],
    );

    // GET /assemblies should return both from cache
    const res = await backend.request("GET", "/assemblies", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { assemblies: Array<{ id: string; name: string }> };
    expect(data.assemblies).toHaveLength(2);

    const ids = data.assemblies.map((a) => a.id).sort();
    expect(ids).toEqual([ASSEMBLY_A.id, ASSEMBLY_B.id].sort());
  });

  it("GET /assemblies/:id returns cached assembly", async () => {
    await backend.assemblyCacheService.upsert(ASSEMBLY_A);

    const res = await backend.request("GET", `/assemblies/${ASSEMBLY_A.id}`, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { id: string; name: string; config: unknown };
    expect(data.id).toBe(ASSEMBLY_A.id);
    expect(data.name).toBe(ASSEMBLY_A.name);
    expect(data.config).toEqual(ASSEMBLY_A.config);
  });

  it("GET /assemblies/:id returns 404 for uncached assembly", async () => {
    const res = await backend.request("GET", "/assemblies/nonexistent-id", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(404);

    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("GET /assemblies only returns assemblies user has membership for", async () => {
    // Cache both assemblies
    await backend.assemblyCacheService.upsert(ASSEMBLY_A);
    await backend.assemblyCacheService.upsert(ASSEMBLY_B);

    // Membership for only one
    await backend.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name) VALUES (?, ?, ?, ?)",
      [userId, ASSEMBLY_A.id, "p-alice", ASSEMBLY_A.name],
    );

    const res = await backend.request("GET", "/assemblies", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { assemblies: Array<{ id: string }> };
    expect(data.assemblies).toHaveLength(1);
    expect(data.assemblies[0]!.id).toBe(ASSEMBLY_A.id);
  });

  it("POST /internal/assemblies-cache populates the cache", async () => {
    const res = await backend.request("POST", "/internal/assemblies-cache", ASSEMBLY_A, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(201);

    // Verify it's cached
    const cached = await backend.assemblyCacheService.get(ASSEMBLY_A.id);
    expect(cached).toBeDefined();
    expect(cached!.name).toBe(ASSEMBLY_A.name);
  });
});

describe("Topic cache", () => {
  let backend: TestBackend;
  let accessToken: string;

  const ASM_ID = "asm-topic-test";

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("topic@example.com", "password", "Topic Tester");
    accessToken = auth.accessToken;
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /assemblies/:id/topics serves from local cache", async () => {
    // Populate topic cache
    await backend.topicCacheService.upsertMany([
      { id: "t1", assemblyId: ASM_ID, name: "Environment", parentId: null, sortOrder: 0 },
      { id: "t2", assemblyId: ASM_ID, name: "Water", parentId: "t1", sortOrder: 1 },
    ]);

    // Also need a membership for the user
    const auth = await backend.registerAndLogin("topic2@example.com", "password", "Topic User 2");
    await backend.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name) VALUES (?, ?, ?, ?)",
      [auth.userId, ASM_ID, "p-topic-user", "Topic Assembly"],
    );

    const res = await backend.request("GET", `/assemblies/${ASM_ID}/topics`, undefined, {
      Authorization: `Bearer ${auth.accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { topics: Array<{ id: string; name: string; parentId: string | null }> };
    expect(data.topics).toHaveLength(2);
    expect(data.topics[0]!.name).toBe("Environment");
    expect(data.topics[1]!.name).toBe("Water");
    expect(data.topics[1]!.parentId).toBe("t1");
  });

  it("POST /internal/topics-cache populates the cache", async () => {
    const res = await backend.request("POST", "/internal/topics-cache", {
      topics: [
        { id: "t10", assemblyId: ASM_ID, name: "Education", parentId: null, sortOrder: 0 },
        { id: "t11", assemblyId: ASM_ID, name: "Primary", parentId: "t10", sortOrder: 1 },
      ],
    }, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(201);

    const cached = await backend.topicCacheService.listByAssembly(ASM_ID);
    expect(cached).toHaveLength(2);
    expect(cached[0]!.name).toBe("Education");
  });

  it("topic cache is scoped per assembly", async () => {
    await backend.topicCacheService.upsertMany([
      { id: "t1", assemblyId: "asm-a", name: "Topic A", parentId: null, sortOrder: 0 },
      { id: "t2", assemblyId: "asm-b", name: "Topic B", parentId: null, sortOrder: 0 },
    ]);

    const topicsA = await backend.topicCacheService.listByAssembly("asm-a");
    expect(topicsA).toHaveLength(1);
    expect(topicsA[0]!.name).toBe("Topic A");

    const topicsB = await backend.topicCacheService.listByAssembly("asm-b");
    expect(topicsB).toHaveLength(1);
    expect(topicsB[0]!.name).toBe("Topic B");
  });
});

describe("Poll cache", () => {
  let backend: TestBackend;
  let accessToken: string;
  let userId: string;

  const ASM_ID = "asm-poll-test";
  const PARTICIPANT_ID = "p-poll-user";

  const POLL_A = {
    id: "poll-1",
    assemblyId: ASM_ID,
    title: "Climate Survey",
    questions: [{ id: "q1", text: "How important?", questionType: { type: "likert" }, topicIds: [], tags: [] }],
    topicIds: ["t-env"],
    schedule: Date.now() - 86400000,
    closesAt: Date.now() + 86400000,
    createdBy: "p-admin",
  };

  const POLL_B = {
    id: "poll-2",
    assemblyId: ASM_ID,
    title: "Budget Survey",
    questions: [{ id: "q2", text: "Approve?", questionType: { type: "yes-no" }, topicIds: [], tags: [] }],
    topicIds: [],
    schedule: Date.now() + 86400000,
    closesAt: Date.now() + 172800000,
    createdBy: "p-admin",
  };

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("poll@example.com", "password", "Poll Tester");
    accessToken = auth.accessToken;
    userId = auth.userId;

    // Create membership
    await backend.db.run(
      "INSERT INTO memberships (user_id, assembly_id, participant_id, assembly_name) VALUES (?, ?, ?, ?)",
      [userId, ASM_ID, PARTICIPANT_ID, "Poll Assembly"],
    );
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /assemblies/:id/polls serves from local cache with hasResponded", async () => {
    await backend.pollCacheService.upsert(POLL_A);
    await backend.pollCacheService.upsert(POLL_B);

    // Mark as responded to poll A
    await backend.pollCacheService.recordResponse(ASM_ID, POLL_A.id, PARTICIPANT_ID);

    const res = await backend.request("GET", `/assemblies/${ASM_ID}/polls`, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { polls: Array<{ id: string; title: string; hasResponded: boolean }> };
    expect(data.polls).toHaveLength(2);

    const pollA = data.polls.find((p) => p.id === POLL_A.id)!;
    expect(pollA.hasResponded).toBe(true);

    const pollB = data.polls.find((p) => p.id === POLL_B.id)!;
    expect(pollB.hasResponded).toBe(false);
  });

  it("POST /internal/polls-cache populates the cache", async () => {
    const res = await backend.request("POST", "/internal/polls-cache", {
      polls: [POLL_A, POLL_B],
    }, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(201);

    const cached = await backend.pollCacheService.listByAssembly(ASM_ID);
    expect(cached).toHaveLength(2);
  });

  it("hasResponded is a one-way latch", async () => {
    await backend.pollCacheService.upsert(POLL_A);

    // Not responded yet
    let responded = await backend.pollCacheService.hasResponded(ASM_ID, POLL_A.id, PARTICIPANT_ID);
    expect(responded).toBe(false);

    // Record response
    await backend.pollCacheService.recordResponse(ASM_ID, POLL_A.id, PARTICIPANT_ID);
    responded = await backend.pollCacheService.hasResponded(ASM_ID, POLL_A.id, PARTICIPANT_ID);
    expect(responded).toBe(true);

    // Recording again is a no-op (ON CONFLICT DO NOTHING)
    await backend.pollCacheService.recordResponse(ASM_ID, POLL_A.id, PARTICIPANT_ID);
    responded = await backend.pollCacheService.hasResponded(ASM_ID, POLL_A.id, PARTICIPANT_ID);
    expect(responded).toBe(true);
  });
});
