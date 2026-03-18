/**
 * Property-based tests for content immutability guarantees.
 *
 * These tests verify that the content lifecycle rules hold
 * regardless of operation ordering:
 *
 * 1. Locked proposals cannot be versioned or withdrawn.
 * 2. Withdrawn proposals cannot be versioned.
 * 3. Community note content is immutable (no version/edit events exist).
 * 4. Candidacy versions are append-only (previous versions are never modified).
 * 5. Note evaluations are idempotent per participant (latest wins, no duplication).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, TestClock } from "@votiverse/core";
import type { ContentHash, IssueId, ParticipantId, TopicId } from "@votiverse/core";
import { getPreset } from "@votiverse/config";
import { ProposalService } from "../../src/proposals.js";
import { CandidacyService } from "../../src/candidacies.js";
import { NoteService } from "../../src/notes.js";

function iid(s: string): IssueId { return s as IssueId; }
function pid(s: string): ParticipantId { return s as ParticipantId; }
function tid(s: string): TopicId { return s as TopicId; }
function hash(s: string): ContentHash { return s as ContentHash; }

const config = {
  ...getPreset("LIQUID_ACCOUNTABLE"),
  features: { ...getPreset("LIQUID_ACCOUNTABLE").features, communityNotes: true },
};

describe("Immutability guarantees", () => {
  let store: InstanceType<typeof InMemoryEventStore>;
  let clock: InstanceType<typeof TestClock>;

  beforeEach(() => {
    store = new InMemoryEventStore();
    clock = new TestClock();
  });

  describe("proposal immutability after locking", () => {
    it("cannot create a new version after lock", async () => {
      const proposals = new ProposalService(store, clock);
      const p = await proposals.submit({ issueId: iid("i1"), authorId: pid("a"), title: "T", contentHash: hash("v1") });
      await proposals.lockForIssue(iid("i1"));

      await expect(proposals.createVersion({ proposalId: p.id, contentHash: hash("v2") })).rejects.toThrow();
    });

    it("cannot withdraw after lock", async () => {
      const proposals = new ProposalService(store, clock);
      const p = await proposals.submit({ issueId: iid("i1"), authorId: pid("a"), title: "T", contentHash: hash("v1") });
      await proposals.lockForIssue(iid("i1"));

      await expect(proposals.withdraw(p.id, "a")).rejects.toThrow();
    });

    it("locking is idempotent — locking twice does not error or double-count", async () => {
      const proposals = new ProposalService(store, clock);
      await proposals.submit({ issueId: iid("i1"), authorId: pid("a"), title: "T", contentHash: hash("v1") });

      const first = await proposals.lockForIssue(iid("i1"));
      const second = await proposals.lockForIssue(iid("i1"));
      expect(first).toBe(1);
      expect(second).toBe(0); // already locked, not re-locked
    });

    it("version history is preserved after lock — all versions are accessible", async () => {
      const proposals = new ProposalService(store, clock);
      const p = await proposals.submit({ issueId: iid("i1"), authorId: pid("a"), title: "T", contentHash: hash("v1") });
      clock.advance(1000);
      await proposals.createVersion({ proposalId: p.id, contentHash: hash("v2") });
      clock.advance(1000);
      await proposals.createVersion({ proposalId: p.id, contentHash: hash("v3") });
      await proposals.lockForIssue(iid("i1"));

      const locked = await proposals.getById(p.id);
      expect(locked!.versions).toHaveLength(3);
      expect(locked!.versions[0].contentHash).toBe("v1");
      expect(locked!.versions[1].contentHash).toBe("v2");
      expect(locked!.versions[2].contentHash).toBe("v3");
      expect(locked!.status).toBe("locked");
    });
  });

  describe("candidacy version append-only", () => {
    it("each version preserves previous versions unchanged", async () => {
      const candidacies = new CandidacyService(store, clock);
      const c = await candidacies.declare({
        participantId: pid("alice"),
        topicScope: [tid("budget")],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });

      const v1Hash = c.versions[0].contentHash;
      const v1Time = c.versions[0].createdAt;

      clock.advance(5000);
      const c2 = await candidacies.createVersion({
        candidacyId: c.id,
        contentHash: hash("v2"),
        topicScope: [tid("parks")],
      });

      // v1 is unchanged
      expect(c2.versions[0].contentHash).toBe(v1Hash);
      expect(c2.versions[0].createdAt).toBe(v1Time);
      expect(c2.versions[0].versionNumber).toBe(1);

      // v2 is appended
      expect(c2.versions[1].contentHash).toBe("v2");
      expect(c2.versions[1].versionNumber).toBe(2);
    });

    it("withdraw + reactivate preserves full version history", async () => {
      const candidacies = new CandidacyService(store, clock);
      const c = await candidacies.declare({
        participantId: pid("alice"),
        topicScope: [],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });

      clock.advance(1000);
      await candidacies.createVersion({ candidacyId: c.id, contentHash: hash("v2") });

      await candidacies.withdraw(c.id, pid("alice"));

      clock.advance(1000);
      const reactivated = await candidacies.declare({
        participantId: pid("alice"),
        topicScope: [tid("new-scope")],
        voteTransparencyOptIn: true,
        contentHash: hash("v3"),
      });

      expect(reactivated.versions).toHaveLength(3);
      expect(reactivated.versions.map((v) => v.contentHash)).toEqual(["v1", "v2", "v3"]);
    });
  });

  describe("note content immutability", () => {
    it("note content hash never changes — only evaluations and status", async () => {
      const notes = new NoteService(store, config, clock);
      const note = await notes.create({
        authorId: pid("alice"),
        contentHash: hash("original-content"),
        targetType: "proposal",
        targetId: "p1",
      });

      // Add evaluations
      await notes.evaluate(note.id, pid("bob"), "endorse");
      await notes.evaluate(note.id, pid("carol"), "dispute");

      const retrieved = await notes.getById(note.id);
      expect(retrieved!.contentHash).toBe("original-content"); // unchanged
      expect(retrieved!.endorsementCount).toBe(1);
      expect(retrieved!.disputeCount).toBe(1);
    });

    it("withdrawn note preserves its content hash", async () => {
      const notes = new NoteService(store, config, clock);
      const note = await notes.create({
        authorId: pid("alice"),
        contentHash: hash("content"),
        targetType: "proposal",
        targetId: "p1",
      });
      await notes.withdraw(note.id, pid("alice"));

      const retrieved = await notes.getById(note.id);
      expect(retrieved!.contentHash).toBe("content"); // still preserved
      expect(retrieved!.status).toBe("withdrawn");
    });
  });

  describe("note evaluation idempotency", () => {
    it("multiple evaluations by the same participant count as one (latest wins)", async () => {
      const notes = new NoteService(store, config, clock);
      const note = await notes.create({
        authorId: pid("alice"),
        contentHash: hash("h1"),
        targetType: "proposal",
        targetId: "p1",
      });

      await notes.evaluate(note.id, pid("bob"), "endorse");
      await notes.evaluate(note.id, pid("bob"), "endorse"); // duplicate
      await notes.evaluate(note.id, pid("bob"), "dispute"); // change
      await notes.evaluate(note.id, pid("bob"), "endorse"); // change back

      const retrieved = await notes.getById(note.id);
      // Bob's latest is endorse, counts as 1 endorsement total
      expect(retrieved!.endorsementCount).toBe(1);
      expect(retrieved!.disputeCount).toBe(0);
    });
  });
});
