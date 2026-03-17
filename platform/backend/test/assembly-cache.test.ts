/**
 * Assembly cache tests — verify local cache serves assemblies without VCP round-trips.
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
