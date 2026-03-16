/**
 * Error handling tests — invalid inputs, auth failures, not-found resources.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Error handling", () => {
  let vcp: TestVCP;

  beforeEach(async () => {
    vcp = await createTestVCP();
  });

  afterEach(() => {
    vcp.cleanup();
  });

  it("rejects requests without auth header", async () => {
    const req = new Request("http://localhost/assemblies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", preset: "LIQUID_STANDARD" }),
    });
    const res = await vcp.app.fetch(req);
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects requests with invalid API key", async () => {
    const req = new Request("http://localhost/assemblies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid_key",
      },
      body: JSON.stringify({ name: "Test", preset: "LIQUID_STANDARD" }),
    });
    const res = await vcp.app.fetch(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent assembly", async () => {
    const res = await vcp.request("GET", "/assemblies/non-existent-id");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("ASSEMBLY_NOT_FOUND");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await vcp.request("POST", "/assemblies", {});
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid preset name", async () => {
    const res = await vcp.request("POST", "/assemblies", {
      name: "Test",
      preset: "INVALID_PRESET",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for voting event in wrong assembly", async () => {
    // Create an assembly
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Test",
      preset: "LIQUID_STANDARD",
    });
    const asm = (await asmRes.json()) as { id: string };

    // Try to get a non-existent event
    const res = await vcp.request("GET", `/assemblies/${asm.id}/events/fake-event-id`);
    expect(res.status).toBe(404);
  });

  it("returns 501 for stub endpoints", async () => {
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Test",
      preset: "LIQUID_STANDARD",
    });
    const asm = (await asmRes.json()) as { id: string };

    const res = await vcp.request("POST", `/assemblies/${asm.id}/integrity/commit`);
    expect(res.status).toBe(501);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("NOT_IMPLEMENTED");
  });

  it("handles duplicate participant names", async () => {
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Test",
      preset: "LIQUID_STANDARD",
    });
    const asm = (await asmRes.json()) as { id: string };

    // First add succeeds
    const res1 = await vcp.request("POST", `/assemblies/${asm.id}/participants`, { name: "Alice" });
    expect(res1.status).toBe(201);

    // Second add with same name should fail
    const res2 = await vcp.request("POST", `/assemblies/${asm.id}/participants`, { name: "Alice" });
    expect(res2.status).toBe(409);
  });

  it("returns 404 when deleting non-existent participant", async () => {
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Test",
      preset: "LIQUID_STANDARD",
    });
    const asm = (await asmRes.json()) as { id: string };

    const res = await vcp.request("DELETE", `/assemblies/${asm.id}/participants/fake-id`);
    expect(res.status).toBe(404);
  });

  it("allows health check without auth", async () => {
    const req = new Request("http://localhost/health");
    const res = await vcp.app.fetch(req);
    expect(res.status).toBe(200);
  });
});
