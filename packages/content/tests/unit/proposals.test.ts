import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, TestClock } from "@votiverse/core";
import type { ContentHash, IssueId, ParticipantId, ProposalId } from "@votiverse/core";
import { ProposalService } from "../../src/proposals.js";

function issueId(s: string): IssueId { return s as IssueId; }
function participantId(s: string): ParticipantId { return s as ParticipantId; }
function contentHash(s: string): ContentHash { return s as ContentHash; }

describe("ProposalService", () => {
  let store: InstanceType<typeof InMemoryEventStore>;
  let clock: InstanceType<typeof TestClock>;
  let service: ProposalService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    clock = new TestClock();
    service = new ProposalService(store, clock);
  });

  describe("submit", () => {
    it("creates a proposal with status 'submitted' and version 1", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        choiceKey: "for",
        authorId: participantId("alice"),
        title: "Fund the park",
        contentHash: contentHash("hash-v1"),
      });

      expect(proposal.status).toBe("submitted");
      expect(proposal.currentVersion).toBe(1);
      expect(proposal.versions).toHaveLength(1);
      expect(proposal.versions[0].contentHash).toBe("hash-v1");
      expect(proposal.issueId).toBe("issue-1");
      expect(proposal.choiceKey).toBe("for");
      expect(proposal.authorId).toBe("alice");
      expect(proposal.title).toBe("Fund the park");
    });

    it("generates a unique proposal ID", async () => {
      const a = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "A",
        contentHash: contentHash("hash-a"),
      });
      const b = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("bob"),
        title: "B",
        contentHash: contentHash("hash-b"),
      });
      expect(a.id).not.toBe(b.id);
    });

    it("records a ProposalSubmitted event", async () => {
      await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("hash-1"),
      });
      const events = await store.getAll();
      const submitted = events.filter((e) => e.type === "ProposalSubmitted");
      expect(submitted).toHaveLength(1);
    });
  });

  describe("createVersion", () => {
    it("increments version number and adds version record", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("v1"),
      });

      clock.advance(1000);
      const updated = await service.createVersion({
        proposalId: proposal.id,
        contentHash: contentHash("v2"),
      });

      expect(updated.currentVersion).toBe(2);
      expect(updated.versions).toHaveLength(2);
      expect(updated.versions[1].contentHash).toBe("v2");
    });

    it("rejects versioning a locked proposal", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("v1"),
      });

      await service.lockForIssue(issueId("issue-1"));

      await expect(
        service.createVersion({ proposalId: proposal.id, contentHash: contentHash("v2") }),
      ).rejects.toThrow("locked");
    });

    it("rejects versioning a withdrawn proposal", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("v1"),
      });

      await service.withdraw(proposal.id, "alice");

      await expect(
        service.createVersion({ proposalId: proposal.id, contentHash: contentHash("v2") }),
      ).rejects.toThrow("withdrawn");
    });

    it("rejects versioning a non-existent proposal", async () => {
      await expect(
        service.createVersion({ proposalId: "nope" as ProposalId, contentHash: contentHash("v1") }),
      ).rejects.toThrow("not found");
    });
  });

  describe("lockForIssue", () => {
    it("locks all submitted proposals for an issue", async () => {
      await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Pro",
        contentHash: contentHash("h1"),
      });
      await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("bob"),
        title: "Con",
        contentHash: contentHash("h2"),
      });

      const locked = await service.lockForIssue(issueId("issue-1"));
      expect(locked).toBe(2);

      const proposals = await service.listByIssue(issueId("issue-1"));
      expect(proposals.every((p) => p.status === "locked")).toBe(true);
      expect(proposals.every((p) => p.lockedAt !== undefined)).toBe(true);
    });

    it("does not lock proposals for other issues", async () => {
      await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "A",
        contentHash: contentHash("h1"),
      });
      await service.submit({
        issueId: issueId("issue-2"),
        authorId: participantId("bob"),
        title: "B",
        contentHash: contentHash("h2"),
      });

      await service.lockForIssue(issueId("issue-1"));

      const other = await service.listByIssue(issueId("issue-2"));
      expect(other[0].status).toBe("submitted");
    });

    it("skips already withdrawn proposals", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "A",
        contentHash: contentHash("h1"),
      });
      await service.withdraw(proposal.id, "alice");

      const locked = await service.lockForIssue(issueId("issue-1"));
      expect(locked).toBe(0);
    });
  });

  describe("withdraw", () => {
    it("sets status to withdrawn", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });

      await service.withdraw(proposal.id, "alice");

      const retrieved = await service.getById(proposal.id);
      expect(retrieved?.status).toBe("withdrawn");
      expect(retrieved?.withdrawnAt).toBeDefined();
    });

    it("rejects withdrawing a locked proposal", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });
      await service.lockForIssue(issueId("issue-1"));

      await expect(service.withdraw(proposal.id, "alice")).rejects.toThrow("locked");
    });

    it("rejects withdrawing an already withdrawn proposal", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });
      await service.withdraw(proposal.id, "alice");

      await expect(service.withdraw(proposal.id, "alice")).rejects.toThrow("already withdrawn");
    });
  });

  describe("getById / listByIssue", () => {
    it("reconstructs full state from events", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        choiceKey: "for",
        authorId: participantId("alice"),
        title: "Park proposal",
        contentHash: contentHash("v1"),
      });

      clock.advance(5000);
      await service.createVersion({ proposalId: proposal.id, contentHash: contentHash("v2") });

      const retrieved = await service.getById(proposal.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.currentVersion).toBe(2);
      expect(retrieved!.versions).toHaveLength(2);
      expect(retrieved!.status).toBe("submitted");
    });

    it("returns undefined for non-existent proposal", async () => {
      const result = await service.getById("nope" as ProposalId);
      expect(result).toBeUndefined();
    });

    it("lists only proposals for the requested issue", async () => {
      await service.submit({ issueId: issueId("issue-1"), authorId: participantId("a"), title: "A", contentHash: contentHash("h1") });
      await service.submit({ issueId: issueId("issue-2"), authorId: participantId("b"), title: "B", contentHash: contentHash("h2") });
      await service.submit({ issueId: issueId("issue-1"), authorId: participantId("c"), title: "C", contentHash: contentHash("h3") });

      const list = await service.listByIssue(issueId("issue-1"));
      expect(list).toHaveLength(2);
    });
  });

  describe("evaluate", () => {
    it("endorses a proposal and updates counts", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });

      await service.evaluate(proposal.id, participantId("bob"), "endorse");
      await service.evaluate(proposal.id, participantId("carol"), "endorse");
      await service.evaluate(proposal.id, participantId("dave"), "dispute");

      const retrieved = await service.getById(proposal.id);
      expect(retrieved!.endorsementCount).toBe(2);
      expect(retrieved!.disputeCount).toBe(1);
    });

    it("rejects self-endorsement", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });

      await expect(
        service.evaluate(proposal.id, participantId("alice"), "endorse"),
      ).rejects.toThrow("Cannot evaluate your own proposal");
    });

    it("rejects endorsement of a withdrawn proposal", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });
      await service.withdraw(proposal.id, "alice");

      await expect(
        service.evaluate(proposal.id, participantId("bob"), "endorse"),
      ).rejects.toThrow("withdrawn");
    });

    it("changing evaluation updates counts correctly", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });

      await service.evaluate(proposal.id, participantId("bob"), "endorse");
      let retrieved = await service.getById(proposal.id);
      expect(retrieved!.endorsementCount).toBe(1);
      expect(retrieved!.disputeCount).toBe(0);

      // Change evaluation
      await service.evaluate(proposal.id, participantId("bob"), "dispute");
      retrieved = await service.getById(proposal.id);
      expect(retrieved!.endorsementCount).toBe(0);
      expect(retrieved!.disputeCount).toBe(1);
    });

    it("counts endorsements correctly in listByIssue", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });

      await service.evaluate(proposal.id, participantId("bob"), "endorse");
      await service.evaluate(proposal.id, participantId("carol"), "dispute");

      const list = await service.listByIssue(issueId("issue-1"));
      expect(list[0].endorsementCount).toBe(1);
      expect(list[0].disputeCount).toBe(1);
    });

    it("initializes endorsement counts to zero", async () => {
      const proposal = await service.submit({
        issueId: issueId("issue-1"),
        authorId: participantId("alice"),
        title: "Test",
        contentHash: contentHash("h1"),
      });

      expect(proposal.endorsementCount).toBe(0);
      expect(proposal.disputeCount).toBe(0);
      expect(proposal.featured).toBe(false);
    });
  });
});
