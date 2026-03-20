/**
 * Topic query endpoint tests — issues and delegations filtered by topic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestVCP, type TestVCP } from "./helpers.js";

describe("Topic query endpoints", () => {
  let vcp: TestVCP;
  let asmId: string;
  let alice: { id: string };
  let bob: { id: string };
  let carol: { id: string };
  let rootTopicId: string;
  let childTopicId: string;
  let otherTopicId: string;

  beforeEach(async () => {
    vcp = await createTestVCP();

    // Create assembly with LIQUID_STANDARD (transitive, topic-scoped delegations)
    const asmRes = await vcp.request("POST", "/assemblies", {
      name: "Topic Queries Test",
      preset: "LIQUID_STANDARD",
    });
    const assembly = (await asmRes.json()) as { id: string };
    asmId = assembly.id;

    // Add participants
    const participants: Array<{ id: string }> = [];
    for (const name of ["Alice", "Bob", "Carol"]) {
      const res = await vcp.request("POST", `/assemblies/${asmId}/participants`, { name });
      participants.push((await res.json()) as { id: string });
    }
    [alice, bob, carol] = participants as [{ id: string }, { id: string }, { id: string }];

    // Create topic taxonomy: Infrastructure (root) → Roads (child), plus Environment (separate root)
    const t1 = await vcp.request("POST", `/assemblies/${asmId}/topics`, {
      name: "Infrastructure",
      sortOrder: 0,
    });
    rootTopicId = ((await t1.json()) as { id: string }).id;

    const t2 = await vcp.request("POST", `/assemblies/${asmId}/topics`, {
      name: "Roads",
      parentId: rootTopicId,
      sortOrder: 0,
    });
    childTopicId = ((await t2.json()) as { id: string }).id;

    const t3 = await vcp.request("POST", `/assemblies/${asmId}/topics`, {
      name: "Environment",
      sortOrder: 1,
    });
    otherTopicId = ((await t3.json()) as { id: string }).id;
  });

  afterEach(() => {
    vcp.cleanup();
  });

  // -----------------------------------------------------------------------
  // Issues endpoint
  // -----------------------------------------------------------------------

  describe("GET /assemblies/:id/topics/:topicId/issues", () => {
    it("returns issues for a child topic", async () => {
      const now = Date.now();
      // Create event with issue under the child topic (Roads)
      const eventRes = await vcp.request("POST", `/assemblies/${asmId}/events`, {
        title: "Road Fix Vote",
        description: "Fix the road",
        issues: [{ title: "Pothole repair", description: "Fix potholes", topicId: childTopicId }],
        eligibleParticipantIds: [alice.id, bob.id, carol.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
        },
      });
      expect(eventRes.status).toBe(201);

      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/${childTopicId}/issues`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { issues: Array<{ issue: { title: string }; event: { title: string } }>; pagination: { total: number } };
      expect(data.issues).toHaveLength(1);
      expect(data.issues[0]!.issue.title).toBe("Pothole repair");
      expect(data.issues[0]!.event.title).toBe("Road Fix Vote");
      expect(data.pagination.total).toBe(1);
    });

    it("returns all children's issues for a parent topic", async () => {
      const now = Date.now();
      // Issue under child topic (Roads)
      await vcp.request("POST", `/assemblies/${asmId}/events`, {
        title: "Road Vote",
        description: "",
        issues: [{ title: "Road issue", description: "", topicId: childTopicId }],
        eligibleParticipantIds: [alice.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
        },
      });

      // Issue under parent topic directly (Infrastructure)
      await vcp.request("POST", `/assemblies/${asmId}/events`, {
        title: "Infra Vote",
        description: "",
        issues: [{ title: "Bridge issue", description: "", topicId: rootTopicId }],
        eligibleParticipantIds: [alice.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
        },
      });

      // Issue under a different topic (Environment) — should NOT match
      await vcp.request("POST", `/assemblies/${asmId}/events`, {
        title: "Green Vote",
        description: "",
        issues: [{ title: "Env issue", description: "", topicId: otherTopicId }],
        eligibleParticipantIds: [alice.id],
        timeline: {
          deliberationStart: now - 86400000 * 2,
          votingStart: now - 86400000,
          votingEnd: now + 3600000,
        },
      });

      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/${rootTopicId}/issues`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { issues: Array<{ issue: { title: string } }>; pagination: { total: number } };
      expect(data.pagination.total).toBe(2);
      const titles = data.issues.map((i) => i.issue.title).sort();
      expect(titles).toEqual(["Bridge issue", "Road issue"]);
    });

    it("returns 404 for unknown topic", async () => {
      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/nonexistent/issues`);
      expect(res.status).toBe(404);
    });

    it("supports pagination", async () => {
      const now = Date.now();
      // Create 3 issues under the child topic
      for (let i = 0; i < 3; i++) {
        await vcp.request("POST", `/assemblies/${asmId}/events`, {
          title: `Event ${i}`,
          description: "",
          issues: [{ title: `Issue ${i}`, description: "", topicId: childTopicId }],
          eligibleParticipantIds: [alice.id],
          timeline: {
            deliberationStart: now - 86400000 * 2,
            votingStart: now - 86400000 + i * 1000,
            votingEnd: now + 3600000 + i * 1000,
          },
        });
      }

      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/${childTopicId}/issues?limit=2&offset=0`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { issues: unknown[]; pagination: { total: number; limit: number; offset: number } };
      expect(data.issues).toHaveLength(2);
      expect(data.pagination.total).toBe(3);
      expect(data.pagination.limit).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Delegations endpoint
  // -----------------------------------------------------------------------

  describe("GET /assemblies/:id/topics/:topicId/delegations", () => {
    it("returns weight distribution for topic delegations", async () => {
      // Alice delegates to Bob on Roads
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [childTopicId],
      });

      // Carol delegates to Bob globally (should match any topic)
      await vcp.requestAs(carol.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [],
      });

      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/${childTopicId}/delegations`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        delegations: Array<{
          delegate: { id: string; name: string };
          weight: number;
        }>;
        pagination: { total: number };
      };
      expect(data.delegations).toHaveLength(1);
      expect(data.delegations[0]!.delegate.id).toBe(bob.id);
      expect(data.delegations[0]!.weight).toBe(3); // Bob(1) + Alice(1) + Carol(1)
    });

    it("returns weight for parent topic including child-scoped delegations", async () => {
      // Alice delegates to Bob on child topic (Roads)
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [childTopicId],
      });

      // Query parent topic — Bob should carry weight because child delegation
      // resolves when the graph is built for the parent topic scope
      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/${rootTopicId}/delegations`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        delegations: Array<{ delegate: { id: string }; weight: number }>;
      };
      expect(data.delegations).toHaveLength(1);
      expect(data.delegations[0]!.delegate.id).toBe(bob.id);
    });

    it("excludes delegations scoped to unrelated topics", async () => {
      // Alice delegates to Bob on Environment
      await vcp.requestAs(alice.id, "POST", `/assemblies/${asmId}/delegations`, {
        targetId: bob.id,
        topicScope: [otherTopicId],
      });

      // Query Roads topic — should not include Environment delegation
      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/${childTopicId}/delegations`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { delegations: unknown[] };
      expect(data.delegations).toHaveLength(0);
    });

    it("shows weight distribution even under private visibility (no individual names exposed)", async () => {
      // Create assembly with private delegation visibility
      const privateAsmRes = await vcp.request("POST", "/assemblies", {
        name: "Private Delegations",
        preset: "BOARD_PROXY",
      });
      const privateAsm = (await privateAsmRes.json()) as { id: string };

      const pAlice = (await (await vcp.request("POST", `/assemblies/${privateAsm.id}/participants`, { name: "Alice" })).json()) as { id: string };
      const pBob = (await (await vcp.request("POST", `/assemblies/${privateAsm.id}/participants`, { name: "Bob" })).json()) as { id: string };
      const pCarol = (await (await vcp.request("POST", `/assemblies/${privateAsm.id}/participants`, { name: "Carol" })).json()) as { id: string };

      // Create a topic
      const topicRes = await vcp.request("POST", `/assemblies/${privateAsm.id}/topics`, { name: "Budgets" });
      const tid = ((await topicRes.json()) as { id: string }).id;

      // Alice delegates to Bob
      await vcp.requestAs(pAlice.id, "POST", `/assemblies/${privateAsm.id}/delegations`, {
        targetId: pBob.id,
        topicScope: [],
      });

      // Carol requests — can see weight distribution (no delegator names exposed)
      const res = await vcp.request(
        "GET",
        `/assemblies/${privateAsm.id}/topics/${tid}/delegations`,
        undefined,
        { "X-Participant-Id": pCarol.id },
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { delegations: Array<{ delegate: { id: string }; weight: number }> };
      expect(data.delegations).toHaveLength(1);
      expect(data.delegations[0]!.delegate.id).toBe(pBob.id);
      expect(data.delegations[0]!.weight).toBe(2); // Bob + Alice
    });

    it("returns 404 for unknown topic", async () => {
      const res = await vcp.request("GET", `/assemblies/${asmId}/topics/nonexistent/delegations`);
      expect(res.status).toBe(404);
    });
  });
});
