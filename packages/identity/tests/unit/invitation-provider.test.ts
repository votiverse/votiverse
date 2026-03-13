import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, isOk, isErr } from "@votiverse/core";
import type { ParticipantId } from "@votiverse/core";
import { InvitationProvider } from "../../src/invitation-provider.js";

describe("InvitationProvider", () => {
  let store: InMemoryEventStore;
  let provider: InvitationProvider;

  beforeEach(() => {
    store = new InMemoryEventStore();
    provider = new InvitationProvider(store);
  });

  describe("invite()", () => {
    it("creates a new participant", async () => {
      const result = await provider.invite("Alice");
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.name).toBe("Alice");
        expect(result.value.id).toBeTruthy();
      }
    });

    it("records a ParticipantRegistered event", async () => {
      await provider.invite("Alice");
      const events = await store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("ParticipantRegistered");
      if (events[0]!.type === "ParticipantRegistered") {
        expect(events[0]!.payload.name).toBe("Alice");
      }
    });

    it("rejects empty names", async () => {
      const result = await provider.invite("  ");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe("invalid_invitation");
      }
    });

    it("rejects duplicate names (case-insensitive)", async () => {
      await provider.invite("Alice");
      const result = await provider.invite("alice");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe("duplicate_participant");
      }
    });

    it("trims whitespace from names", async () => {
      const result = await provider.invite("  Bob  ");
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.name).toBe("Bob");
      }
    });
  });

  describe("authenticate()", () => {
    it("authenticates an invited participant by name", async () => {
      const inviteResult = await provider.invite("Alice");
      expect(isOk(inviteResult)).toBe(true);

      const authResult = await provider.authenticate({ name: "Alice" });
      expect(isOk(authResult)).toBe(true);
      if (isOk(authResult) && isOk(inviteResult)) {
        expect(authResult.value.participantId).toBe(inviteResult.value.id);
        expect(authResult.value.participant.name).toBe("Alice");
      }
    });

    it("authenticates case-insensitively", async () => {
      await provider.invite("Alice");
      const result = await provider.authenticate({ name: "alice" });
      expect(isOk(result)).toBe(true);
    });

    it("fails for unknown names", async () => {
      const result = await provider.authenticate({ name: "Unknown" });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe("authentication_failed");
      }
    });

    it("fails when name is not a string", async () => {
      const result = await provider.authenticate({ name: 123 });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe("authentication_failed");
      }
    });
  });

  describe("verifyUniqueness()", () => {
    it("returns true for registered participants", async () => {
      const invite = await provider.invite("Alice");
      expect(isOk(invite)).toBe(true);
      if (isOk(invite)) {
        const result = await provider.verifyUniqueness(invite.value.id);
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(true);
        }
      }
    });

    it("returns false for unknown participant IDs", async () => {
      const result = await provider.verifyUniqueness("unknown-id" as ParticipantId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe("SybilCheck.verify()", () => {
    it("delegates to verifyUniqueness", async () => {
      const invite = await provider.invite("Alice");
      expect(isOk(invite)).toBe(true);
      if (isOk(invite)) {
        const result = await provider.verify(invite.value.id);
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(true);
        }
      }
    });
  });

  describe("getParticipant()", () => {
    it("returns participant by ID", async () => {
      const invite = await provider.invite("Alice");
      expect(isOk(invite)).toBe(true);
      if (isOk(invite)) {
        const participant = await provider.getParticipant(invite.value.id);
        expect(participant).toBeDefined();
        expect(participant!.name).toBe("Alice");
      }
    });

    it("returns undefined for unknown IDs", async () => {
      const participant = await provider.getParticipant("unknown" as ParticipantId);
      expect(participant).toBeUndefined();
    });
  });

  describe("listParticipants()", () => {
    it("returns empty array when no participants", async () => {
      const participants = await provider.listParticipants();
      expect(participants).toHaveLength(0);
    });

    it("returns all invited participants", async () => {
      await provider.invite("Alice");
      await provider.invite("Bob");
      await provider.invite("Carol");

      const participants = await provider.listParticipants();
      expect(participants).toHaveLength(3);
      const names = participants.map((p) => p.name);
      expect(names).toContain("Alice");
      expect(names).toContain("Bob");
      expect(names).toContain("Carol");
    });
  });

  describe("providerName and checkName", () => {
    it("has correct provider name", () => {
      expect(provider.providerName).toBe("invitation");
    });

    it("has correct check name", () => {
      expect(provider.checkName).toBe("invitation-social-verification");
    });
  });
});
