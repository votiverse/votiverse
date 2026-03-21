/**
 * Scope-gate tests — verify that admin write operations require the 'operational' scope.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, LIMITED_API_KEY, TEST_API_KEY, type TestVCP } from "./helpers.js";

describe("Scope gates on write operations", () => {
  let vcp: TestVCP;
  let assemblyId: string;
  let participantId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly and participant with the operational (wildcard) key
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Scope Test Assembly",
      preset: "CIVIC",
    });
    const asm = (await asmRes.json()) as { id: string };
    assemblyId = asm.id;

    const pRes = await vcp.request("POST", `/assemblies/${assemblyId}/participants`, { name: "Alice" });
    const p = (await pRes.json()) as { id: string };
    participantId = p.id;

    // Grant limited client access to this assembly so we isolate scope checks from access checks
    await vcp.auth.grantAssemblyAccess("limited-client", assemblyId);
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("participant-scoped client cannot POST participants", async () => {
    const res = await vcp.requestWithKey(LIMITED_API_KEY, "POST", `/assemblies/${assemblyId}/participants`, {
      name: "Bob",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("scope");
  });

  it("participant-scoped client cannot DELETE participants", async () => {
    const res = await vcp.requestWithKey(LIMITED_API_KEY, "DELETE", `/assemblies/${assemblyId}/participants/${participantId}`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("scope");
  });

  it("participant-scoped client cannot POST events", async () => {
    const now = Date.now();
    const res = await vcp.requestWithKey(LIMITED_API_KEY, "POST", `/assemblies/${assemblyId}/events`, {
      title: "Unauthorized Event",
      description: "",
      issues: [{ title: "Issue", description: "", topicId: null }],
      eligibleParticipantIds: [participantId],
      timeline: {
        deliberationStart: now - 86400000,
        votingStart: now - 3600000,
        votingEnd: now + 86400000,
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("scope");
  });

  it("participant-scoped client cannot POST surveys", async () => {
    const res = await vcp.requestWithKey(LIMITED_API_KEY, "POST", `/assemblies/${assemblyId}/surveys`, {
      title: "Unauthorized Survey",
      questions: [{ text: "Q?", type: "likert" }],
      topicScope: [],
      createdBy: participantId,
      schedule: Date.now(),
      closesAt: Date.now() + 86400000,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("scope");
  });

  it("participant-scoped client cannot POST topics", async () => {
    const res = await vcp.requestWithKey(LIMITED_API_KEY, "POST", `/assemblies/${assemblyId}/topics`, {
      name: "Unauthorized Topic",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("scope");
  });

  it("operational-scoped client can perform admin writes", async () => {
    // The default TEST_API_KEY has both scopes
    const pRes = await vcp.request("POST", `/assemblies/${assemblyId}/participants`, {
      name: "Bob",
    });
    expect(pRes.status).toBe(201);

    const tRes = await vcp.request("POST", `/assemblies/${assemblyId}/topics`, {
      name: "Environment",
    });
    expect(tRes.status).toBe(201);
  });
});
