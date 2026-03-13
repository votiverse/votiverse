import { describe, it, expect } from "vitest";
import {
  VotiverseError,
  NotFoundError,
  ValidationError,
  InvalidStateError,
  GovernanceRuleViolation,
} from "../../src/errors.js";

describe("Error types", () => {
  describe("VotiverseError", () => {
    it("is an instance of Error", () => {
      const error = new VotiverseError("test");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(VotiverseError);
    });

    it("has the correct name and message", () => {
      const error = new VotiverseError("something broke");
      expect(error.name).toBe("VotiverseError");
      expect(error.message).toBe("something broke");
    });
  });

  describe("NotFoundError", () => {
    it("extends VotiverseError", () => {
      const error = new NotFoundError("Participant", "abc-123");
      expect(error).toBeInstanceOf(VotiverseError);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("has the correct name, message, and entity info", () => {
      const error = new NotFoundError("Issue", "xyz-789");
      expect(error.name).toBe("NotFoundError");
      expect(error.message).toBe('Issue with ID "xyz-789" not found');
      expect(error.entityType).toBe("Issue");
      expect(error.entityId).toBe("xyz-789");
    });
  });

  describe("ValidationError", () => {
    it("extends VotiverseError", () => {
      const error = new ValidationError("name", "must not be empty");
      expect(error).toBeInstanceOf(VotiverseError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("has the correct name, message, and field", () => {
      const error = new ValidationError("email", "invalid format");
      expect(error.name).toBe("ValidationError");
      expect(error.message).toBe('Validation error on "email": invalid format');
      expect(error.field).toBe("email");
    });
  });

  describe("InvalidStateError", () => {
    it("extends VotiverseError", () => {
      const error = new InvalidStateError("voting period has ended");
      expect(error).toBeInstanceOf(VotiverseError);
      expect(error).toBeInstanceOf(InvalidStateError);
    });

    it("has the correct name and message", () => {
      const error = new InvalidStateError("cannot vote after close");
      expect(error.name).toBe("InvalidStateError");
      expect(error.message).toBe("cannot vote after close");
    });
  });

  describe("GovernanceRuleViolation", () => {
    it("extends VotiverseError", () => {
      const error = new GovernanceRuleViolation("quorum", "not enough participants");
      expect(error).toBeInstanceOf(VotiverseError);
      expect(error).toBeInstanceOf(GovernanceRuleViolation);
    });

    it("has the correct name, message, and rule", () => {
      const error = new GovernanceRuleViolation("sovereignty", "direct vote was blocked");
      expect(error.name).toBe("GovernanceRuleViolation");
      expect(error.message).toBe('Governance rule "sovereignty" violated: direct vote was blocked');
      expect(error.rule).toBe("sovereignty");
    });
  });
});
