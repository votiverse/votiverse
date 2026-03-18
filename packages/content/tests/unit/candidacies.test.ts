import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, TestClock } from "@votiverse/core";
import type { CandidacyId, ContentHash, ParticipantId, TopicId } from "@votiverse/core";
import { CandidacyService } from "../../src/candidacies.js";

function pid(s: string): ParticipantId { return s as ParticipantId; }
function tid(s: string): TopicId { return s as TopicId; }
function hash(s: string): ContentHash { return s as ContentHash; }

describe("CandidacyService", () => {
  let store: InstanceType<typeof InMemoryEventStore>;
  let clock: InstanceType<typeof TestClock>;
  let service: CandidacyService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    clock = new TestClock();
    service = new CandidacyService(store, clock);
  });

  describe("declare", () => {
    it("creates an active candidacy with version 1", async () => {
      const candidacy = await service.declare({
        participantId: pid("alice"),
        topicScope: [tid("budget"), tid("parks")],
        voteTransparencyOptIn: true,
        contentHash: hash("profile-v1"),
      });

      expect(candidacy.status).toBe("active");
      expect(candidacy.currentVersion).toBe(1);
      expect(candidacy.participantId).toBe("alice");
      expect(candidacy.topicScope).toEqual([tid("budget"), tid("parks")]);
      expect(candidacy.voteTransparencyOptIn).toBe(true);
      expect(candidacy.versions).toHaveLength(1);
    });

    it("rejects declaring when an active candidacy already exists", async () => {
      await service.declare({
        participantId: pid("alice"),
        topicScope: [],
        voteTransparencyOptIn: false,
        contentHash: hash("h1"),
      });

      await expect(
        service.declare({
          participantId: pid("alice"),
          topicScope: [],
          voteTransparencyOptIn: false,
          contentHash: hash("h2"),
        }),
      ).rejects.toThrow("already has an active candidacy");
    });

    it("reactivates a withdrawn candidacy with continuous version history", async () => {
      const original = await service.declare({
        participantId: pid("alice"),
        topicScope: [tid("budget")],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });

      await service.withdraw(original.id, pid("alice"));

      clock.advance(5000);
      const reactivated = await service.declare({
        participantId: pid("alice"),
        topicScope: [tid("parks")],
        voteTransparencyOptIn: true,
        contentHash: hash("v2"),
      });

      expect(reactivated.id).toBe(original.id); // same candidacy ID
      expect(reactivated.status).toBe("active");
      expect(reactivated.currentVersion).toBe(2); // continuous history
      expect(reactivated.versions).toHaveLength(2);
      expect(reactivated.topicScope).toEqual([tid("parks")]); // updated
      expect(reactivated.voteTransparencyOptIn).toBe(true); // updated
    });
  });

  describe("createVersion", () => {
    it("increments version and preserves metadata if not overridden", async () => {
      const candidacy = await service.declare({
        participantId: pid("alice"),
        topicScope: [tid("budget")],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });

      clock.advance(1000);
      const updated = await service.createVersion({
        candidacyId: candidacy.id,
        contentHash: hash("v2"),
      });

      expect(updated.currentVersion).toBe(2);
      expect(updated.topicScope).toEqual([tid("budget")]); // preserved
      expect(updated.voteTransparencyOptIn).toBe(false); // preserved
    });

    it("updates topicScope and voteTransparencyOptIn when provided", async () => {
      const candidacy = await service.declare({
        participantId: pid("alice"),
        topicScope: [tid("budget")],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });

      const updated = await service.createVersion({
        candidacyId: candidacy.id,
        contentHash: hash("v2"),
        topicScope: [tid("budget"), tid("parks")],
        voteTransparencyOptIn: true,
      });

      expect(updated.topicScope).toEqual([tid("budget"), tid("parks")]);
      expect(updated.voteTransparencyOptIn).toBe(true);
    });

    it("rejects versioning a withdrawn candidacy", async () => {
      const candidacy = await service.declare({
        participantId: pid("alice"),
        topicScope: [],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });
      await service.withdraw(candidacy.id, pid("alice"));

      await expect(
        service.createVersion({ candidacyId: candidacy.id, contentHash: hash("v2") }),
      ).rejects.toThrow("withdrawn");
    });

    it("rejects versioning a non-existent candidacy", async () => {
      await expect(
        service.createVersion({ candidacyId: "nope" as CandidacyId, contentHash: hash("v1") }),
      ).rejects.toThrow("not found");
    });
  });

  describe("withdraw", () => {
    it("sets status to withdrawn", async () => {
      const candidacy = await service.declare({
        participantId: pid("alice"),
        topicScope: [],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });

      await service.withdraw(candidacy.id, pid("alice"));

      const retrieved = await service.getById(candidacy.id);
      expect(retrieved?.status).toBe("withdrawn");
      expect(retrieved?.withdrawnAt).toBeDefined();
    });

    it("rejects withdrawing an already withdrawn candidacy", async () => {
      const candidacy = await service.declare({
        participantId: pid("alice"),
        topicScope: [],
        voteTransparencyOptIn: false,
        contentHash: hash("v1"),
      });
      await service.withdraw(candidacy.id, pid("alice"));

      await expect(service.withdraw(candidacy.id, pid("alice"))).rejects.toThrow("already withdrawn");
    });
  });

  describe("getByParticipant", () => {
    it("finds a candidacy by participant ID", async () => {
      await service.declare({
        participantId: pid("alice"),
        topicScope: [tid("budget")],
        voteTransparencyOptIn: true,
        contentHash: hash("v1"),
      });

      const found = await service.getByParticipant(pid("alice"));
      expect(found).toBeDefined();
      expect(found!.participantId).toBe("alice");
    });

    it("returns undefined for a participant with no candidacy", async () => {
      const found = await service.getByParticipant(pid("bob"));
      expect(found).toBeUndefined();
    });
  });
});
