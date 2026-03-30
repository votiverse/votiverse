/**
 * Assembly, topic, and survey cache tests — verify local caches serve data without VCP round-trips.
 *
 * After the groups refactor, the /assemblies endpoint has been replaced by /groups.
 * Memberships are now in group_members. These tests exercise the group-centric API.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestBackend, TEST_PASSWORD, type TestBackend } from "./helpers.js";

describe("Group listing (formerly assembly cache)", () => {
  let backend: TestBackend;
  let accessToken: string;
  let userId: string;

  const VCP_ASSEMBLY_A = "asm-alpha-001";
  const VCP_ASSEMBLY_B = "asm-beta-002";

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("test@example.com", TEST_PASSWORD, "Test User");
    accessToken = auth.accessToken;
    userId = auth.userId;
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /groups serves from GroupService", async () => {
    // Create two groups with VCP assembly links
    const groupA = await backend.groupService.create({
      name: "Alpha Assembly",
      handle: "alpha-assembly",
      createdBy: userId,
    });
    await backend.groupService.setVcpAssemblyId(groupA.id, VCP_ASSEMBLY_A);
    await backend.groupService.addMember(groupA.id, userId, "member", "p-alice");

    const groupB = await backend.groupService.create({
      name: "Beta Assembly",
      handle: "beta-assembly",
      createdBy: userId,
    });
    await backend.groupService.setVcpAssemblyId(groupB.id, VCP_ASSEMBLY_B);
    await backend.groupService.addMember(groupB.id, userId, "member", "p-bob");

    // GET /groups should return both
    const res = await backend.request("GET", "/groups", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { groups: Array<{ id: string; name: string }> };
    expect(data.groups).toHaveLength(2);

    const ids = data.groups.map((g) => g.id).sort();
    expect(ids).toEqual([groupA.id, groupB.id].sort());
  });

  it("GET /groups/:id returns group details", async () => {
    const group = await backend.groupService.create({
      name: "Alpha Assembly",
      handle: "alpha-assembly-detail",
      createdBy: userId,
    });
    await backend.groupService.setVcpAssemblyId(group.id, VCP_ASSEMBLY_A);
    // Cache the VCP assembly config for merging
    await backend.assemblyCacheService.upsert({
      id: VCP_ASSEMBLY_A,
      organizationId: "org-1",
      name: "Alpha Assembly",
      config: { delegation: { enabled: true } },
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await backend.groupService.addMember(group.id, userId, "member", "p-alice");

    const res = await backend.request("GET", `/groups/${group.id}`, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { id: string; name: string };
    expect(data.id).toBe(group.id);
    expect(data.name).toBe("Alpha Assembly");
  });

  it("GET /groups/:id returns 404 for non-existent group", async () => {
    const res = await backend.request("GET", "/groups/nonexistent-id", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(404);
  });

  it("GET /groups only returns groups user is a member of", async () => {
    // Create two groups
    const groupA = await backend.groupService.create({
      name: "Alpha Assembly",
      handle: "alpha-only",
      createdBy: userId,
    });
    await backend.groupService.addMember(groupA.id, userId, "member", "p-alice");

    // Second group — user is NOT a member
    await backend.groupService.create({
      name: "Beta Assembly",
      handle: "beta-only",
      createdBy: userId,
    });

    const res = await backend.request("GET", "/groups", undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { groups: Array<{ id: string }> };
    // Only groupA (the user manually joined via addMember).
    // Note: GroupService.create does NOT auto-add the creator as a member.
    // We only added the user to groupA.
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]!.id).toBe(groupA.id);
  });

  it("POST /internal/assemblies-cache populates the VCP assembly cache", async () => {
    const res = await backend.request("POST", "/internal/assemblies-cache", {
      id: VCP_ASSEMBLY_A,
      organizationId: "org-1",
      name: "Alpha Assembly",
      config: { delegation: { enabled: true } },
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    }, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(201);

    // Verify it's cached
    const cached = await backend.assemblyCacheService.get(VCP_ASSEMBLY_A);
    expect(cached).toBeDefined();
    expect(cached!.name).toBe("Alpha Assembly");
  });
});

describe("Topic cache", () => {
  let backend: TestBackend;
  let accessToken: string;

  const ASM_ID = "asm-topic-test";

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("topic@example.com", TEST_PASSWORD, "Topic Tester");
    accessToken = auth.accessToken;
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /groups/:id/topics serves from local cache", async () => {
    // Create a group with VCP assembly link
    const auth = await backend.registerAndLogin("topic2@example.com", TEST_PASSWORD, "Topic User 2");

    const group = await backend.groupService.create({
      name: "Topic Assembly",
      handle: "topic-assembly",
      createdBy: auth.userId,
    });
    await backend.groupService.setVcpAssemblyId(group.id, ASM_ID);
    await backend.groupService.enableCapability(group.id, "voting");
    await backend.groupService.addMember(group.id, auth.userId, "member", "p-topic-user");

    // Populate topic cache (using VCP assembly ID)
    await backend.topicCacheService.upsertMany([
      { id: "t1", assemblyId: ASM_ID, name: "Environment", parentId: null, sortOrder: 0 },
      { id: "t2", assemblyId: ASM_ID, name: "Water", parentId: "t1", sortOrder: 1 },
    ]);

    const res = await backend.request("GET", `/groups/${group.id}/topics`, undefined, {
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

describe("Survey cache", () => {
  let backend: TestBackend;
  let accessToken: string;
  let userId: string;
  let groupId: string;

  const VCP_ASM_ID = "asm-survey-test";
  const PARTICIPANT_ID = "p-survey-user";

  const SURVEY_A = {
    id: "survey-1",
    assemblyId: VCP_ASM_ID,
    title: "Climate Survey",
    questions: [{ id: "q1", text: "How important?", questionType: { type: "likert" }, topicIds: [], tags: [] }],
    topicIds: ["t-env"],
    schedule: Date.now() - 86400000,
    closesAt: Date.now() + 86400000,
    createdBy: "p-admin",
  };

  const SURVEY_B = {
    id: "survey-2",
    assemblyId: VCP_ASM_ID,
    title: "Budget Survey",
    questions: [{ id: "q2", text: "Approve?", questionType: { type: "yes-no" }, topicIds: [], tags: [] }],
    topicIds: [],
    schedule: Date.now() + 86400000,
    closesAt: Date.now() + 172800000,
    createdBy: "p-admin",
  };

  beforeEach(async () => {
    backend = await createTestBackend();
    const auth = await backend.registerAndLogin("survey@example.com", TEST_PASSWORD, "Survey Tester");
    accessToken = auth.accessToken;
    userId = auth.userId;

    // Create group with VCP assembly link and membership
    const group = await backend.groupService.create({
      name: "Survey Assembly",
      handle: "survey-assembly",
      createdBy: userId,
    });
    groupId = group.id;
    await backend.groupService.setVcpAssemblyId(groupId, VCP_ASM_ID);
    await backend.groupService.enableCapability(groupId, "surveys");
    await backend.groupService.addMember(groupId, userId, "member", PARTICIPANT_ID);
  });

  afterEach(() => {
    backend.cleanup();
  });

  it("GET /groups/:id/surveys serves from local cache with hasResponded", async () => {
    await backend.surveyCacheService.upsert(SURVEY_A);
    await backend.surveyCacheService.upsert(SURVEY_B);

    // Mark as responded to survey A
    await backend.surveyCacheService.recordResponse(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);

    const res = await backend.request("GET", `/groups/${groupId}/surveys`, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as { surveys: Array<{ id: string; title: string; hasResponded: boolean }> };
    expect(data.surveys).toHaveLength(2);

    const surveyA = data.surveys.find((p) => p.id === SURVEY_A.id)!;
    expect(surveyA.hasResponded).toBe(true);

    const surveyB = data.surveys.find((p) => p.id === SURVEY_B.id)!;
    expect(surveyB.hasResponded).toBe(false);
  });

  it("POST /internal/surveys-cache populates the cache", async () => {
    const res = await backend.request("POST", "/internal/surveys-cache", {
      surveys: [SURVEY_A, SURVEY_B],
    }, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(201);

    const cached = await backend.surveyCacheService.listByAssembly(VCP_ASM_ID);
    expect(cached).toHaveLength(2);
  });

  it("hasResponded is per-participant: second user sees their own status", async () => {
    // Simulate the bug scenario: User A populates the cache, User B accesses it.
    // User B should see their own hasResponded status, not User A's.
    const PARTICIPANT_B = "p-survey-user-b";

    // Register a second user
    const authB = await backend.registerAndLogin("survey-b@example.com", TEST_PASSWORD, "Survey Tester B");
    await backend.groupService.addMember(groupId, authB.userId, "member", PARTICIPANT_B);

    // User A populates the cache and has responded to Survey A
    await backend.surveyCacheService.upsert(SURVEY_A);
    await backend.surveyCacheService.upsert(SURVEY_B);
    await backend.surveyCacheService.recordResponse(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);
    await backend.surveyCacheService.markParticipantChecked(VCP_ASM_ID, PARTICIPANT_ID);

    // User B has responded to Survey B (but not A)
    await backend.surveyCacheService.recordResponse(VCP_ASM_ID, SURVEY_B.id, PARTICIPANT_B);
    await backend.surveyCacheService.markParticipantChecked(VCP_ASM_ID, PARTICIPANT_B);

    // User A should see: Survey A = responded, Survey B = not responded
    const resA = await backend.request("GET", `/groups/${groupId}/surveys`, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    const dataA = (await resA.json()) as { surveys: Array<{ id: string; hasResponded: boolean }> };
    expect(dataA.surveys.find((s) => s.id === SURVEY_A.id)!.hasResponded).toBe(true);
    expect(dataA.surveys.find((s) => s.id === SURVEY_B.id)!.hasResponded).toBe(false);

    // User B should see: Survey A = not responded, Survey B = responded
    const resB = await backend.request("GET", `/groups/${groupId}/surveys`, undefined, {
      Authorization: `Bearer ${authB.accessToken}`,
    });
    const dataB = (await resB.json()) as { surveys: Array<{ id: string; hasResponded: boolean }> };
    expect(dataB.surveys.find((s) => s.id === SURVEY_A.id)!.hasResponded).toBe(false);
    expect(dataB.surveys.find((s) => s.id === SURVEY_B.id)!.hasResponded).toBe(true);
  });

  it("hasResponded is a one-way latch", async () => {
    await backend.surveyCacheService.upsert(SURVEY_A);

    // Not responded yet
    let responded = await backend.surveyCacheService.hasResponded(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);
    expect(responded).toBe(false);

    // Record response
    await backend.surveyCacheService.recordResponse(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);
    responded = await backend.surveyCacheService.hasResponded(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);
    expect(responded).toBe(true);

    // Recording again is a no-op (ON CONFLICT DO NOTHING)
    await backend.surveyCacheService.recordResponse(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);
    responded = await backend.surveyCacheService.hasResponded(VCP_ASM_ID, SURVEY_A.id, PARTICIPANT_ID);
    expect(responded).toBe(true);
  });
});
