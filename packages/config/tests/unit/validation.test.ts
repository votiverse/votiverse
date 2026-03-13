import { describe, it, expect } from "vitest";
import { validateConfig, deriveConfig, getPreset } from "../../src/index.js";
import type { GovernanceConfig } from "../../src/index.js";

/** Helper to create a minimal valid config for testing. */
function validConfig(overrides?: Partial<GovernanceConfig>): GovernanceConfig {
  return deriveConfig(getPreset("LIQUID_STANDARD"), overrides ?? {});
}

describe("validateConfig", () => {
  describe("delegation consistency", () => {
    it("errors when transitivity enabled but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        delegation: { transitive: true },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some(
          (i) =>
            i.field === "delegation.transitive" && i.severity === "error",
        ),
      ).toBe(true);
    });

    it("errors when topic scoping enabled but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        delegation: { topicScoped: true },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some(
          (i) =>
            i.field === "delegation.topicScoped" && i.severity === "error",
        ),
      ).toBe(true);
    });

    it("warns when chain depth set but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        delegation: { maxChainDepth: 3 },
      });
      const result = validateConfig(config);
      // Not an error, just a warning
      expect(result.valid).toBe(true);
      expect(
        result.issues.some(
          (i) =>
            i.field === "delegation.maxChainDepth" &&
            i.severity === "warning",
        ),
      ).toBe(true);
    });

    it("warns when chain depth > 1 but transitivity disabled", () => {
      const config = deriveConfig(getPreset("BOARD_PROXY"), {
        delegation: { maxChainDepth: 5 },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) =>
            i.field === "delegation.maxChainDepth" &&
            i.severity === "warning",
        ),
      ).toBe(true);
    });

    it("errors when maxChainDepth is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        delegation: { maxChainDepth: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some(
          (i) =>
            i.field === "delegation.maxChainDepth" && i.severity === "error",
        ),
      ).toBe(true);
    });

    it("errors when maxDelegatesPerParticipant is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        delegation: { maxDelegatesPerParticipant: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });
  });

  describe("ballot consistency", () => {
    it("warns when supermajority threshold set but method is not supermajority", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { supermajorityThreshold: 0.67 },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) =>
            i.field === "ballot.supermajorityThreshold" &&
            i.severity === "warning",
        ),
      ).toBe(true);
    });

    it("errors when supermajority threshold is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { votingMethod: "supermajority", supermajorityThreshold: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("errors when supermajority threshold is > 1", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: {
          votingMethod: "supermajority",
          supermajorityThreshold: 1.5,
        },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("errors when quorum is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { quorum: -0.1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("errors when quorum is > 1", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { quorum: 1.5 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("accepts quorum of 0 (no quorum requirement)", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { quorum: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("participation mode", () => {
    it("errors when mandatory-with-delegation but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        ballot: { participationMode: "mandatory-with-delegation" },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some(
          (i) =>
            i.field === "ballot.participationMode" && i.severity === "error",
        ),
      ).toBe(true);
    });

    it("accepts mandatory-with-delegation when delegation enabled", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { participationMode: "mandatory-with-delegation" },
      });
      const result = validateConfig(config);
      const participationErrors = result.issues.filter(
        (i) =>
          i.field === "ballot.participationMode" && i.severity === "error",
      );
      expect(participationErrors).toHaveLength(0);
    });
  });

  describe("delegate vote visibility", () => {
    it("warns when delegate vote visibility set but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        ballot: { delegateVoteVisibility: "public" },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) =>
            i.field === "ballot.delegateVoteVisibility" &&
            i.severity === "warning",
        ),
      ).toBe(true);
    });
  });

  describe("feature / interaction warnings", () => {
    it("warns about secret ballots with public delegate votes", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { secrecy: "secret", delegateVoteVisibility: "public" },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) =>
            i.field === "ballot.secrecy" && i.severity === "warning",
        ),
      ).toBe(true);
    });
  });

  describe("thresholds", () => {
    it("errors when concentration threshold is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        thresholds: { concentrationAlertThreshold: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("errors when concentration threshold is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        thresholds: { concentrationAlertThreshold: -0.1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("accepts concentration threshold of 1.0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        thresholds: { concentrationAlertThreshold: 1.0 },
      });
      const result = validateConfig(config);
      const thresholdErrors = result.issues.filter(
        (i) =>
          i.field === "thresholds.concentrationAlertThreshold" &&
          i.severity === "error",
      );
      expect(thresholdErrors).toHaveLength(0);
    });
  });
});
