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
        result.issues.some((i) => i.field === "delegation.transitive" && i.severity === "error"),
      ).toBe(true);
    });

    it("errors when topic scoping enabled but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        delegation: { topicScoped: true },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.field === "delegation.topicScoped" && i.severity === "error"),
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

  describe("maxAge validation", () => {
    it("errors when maxAge is less than 1 day", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        delegation: { maxAge: 3_600_000 }, // 1 hour
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.field === "delegation.maxAge" && i.severity === "error"),
      ).toBe(true);
    });

    it("accepts maxAge of exactly 1 day", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        delegation: { maxAge: 86_400_000 },
      });
      const result = validateConfig(config);
      const maxAgeErrors = result.issues.filter(
        (i) => i.field === "delegation.maxAge" && i.severity === "error",
      );
      expect(maxAgeErrors).toHaveLength(0);
    });

    it("warns when maxAge set but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        delegation: { maxAge: 86_400_000 },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some((i) => i.field === "delegation.maxAge" && i.severity === "warning"),
      ).toBe(true);
    });

    it("accepts null maxAge", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        delegation: { maxAge: null },
      });
      const result = validateConfig(config);
      const maxAgeIssues = result.issues.filter((i) => i.field === "delegation.maxAge");
      expect(maxAgeIssues).toHaveLength(0);
    });
  });

  describe("visibility validation", () => {
    it("warns when public visibility but delegation disabled", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        delegation: { visibility: { mode: "public" } },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) => i.field === "delegation.visibility.mode" && i.severity === "warning",
        ),
      ).toBe(true);
    });

    it("warns when chain incoming visibility but non-transitive", () => {
      const config = deriveConfig(getPreset("BOARD_PROXY"), {
        delegation: { visibility: { incomingVisibility: "chain" } },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) =>
            i.field === "delegation.visibility.incomingVisibility" && i.severity === "warning",
        ),
      ).toBe(true);
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
          (i) => i.field === "ballot.supermajorityThreshold" && i.severity === "warning",
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
        result.issues.some((i) => i.field === "ballot.participationMode" && i.severity === "error"),
      ).toBe(true);
    });

    it("accepts mandatory-with-delegation when delegation enabled", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { participationMode: "mandatory-with-delegation" },
      });
      const result = validateConfig(config);
      const participationErrors = result.issues.filter(
        (i) => i.field === "ballot.participationMode" && i.severity === "error",
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
          (i) => i.field === "ballot.delegateVoteVisibility" && i.severity === "warning",
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
        result.issues.some((i) => i.field === "ballot.secrecy" && i.severity === "warning"),
      ).toBe(true);
    });
  });

  describe("resultsVisibility", () => {
    it("warns when live results with secret ballot", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        ballot: { resultsVisibility: "live" },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some(
          (i) => i.field === "ballot.resultsVisibility" && i.severity === "warning",
        ),
      ).toBe(true);
    });

    it("no issue when live results with public ballot", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        ballot: { resultsVisibility: "live" },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some((i) => i.field === "ballot.resultsVisibility"),
      ).toBe(false);
    });

    it("no issue when sealed results with any secrecy", () => {
      const config = deriveConfig(getPreset("TOWN_HALL"), {
        ballot: { resultsVisibility: "sealed" },
      });
      const result = validateConfig(config);
      expect(
        result.issues.some((i) => i.field === "ballot.resultsVisibility"),
      ).toBe(false);
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
        (i) => i.field === "thresholds.concentrationAlertThreshold" && i.severity === "error",
      );
      expect(thresholdErrors).toHaveLength(0);
    });
  });

  describe("timeline", () => {
    it("errors when deliberationDays is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { deliberationDays: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.field === "timeline.deliberationDays" && i.severity === "error"),
      ).toBe(true);
    });

    it("errors when deliberationDays is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { deliberationDays: -1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("errors when deliberationDays is not an integer", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { deliberationDays: 3.5 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.field === "timeline.deliberationDays" && i.severity === "error"),
      ).toBe(true);
    });

    it("accepts deliberationDays of 1", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { deliberationDays: 1 },
      });
      const result = validateConfig(config);
      const errors = result.issues.filter(
        (i) => i.field === "timeline.deliberationDays" && i.severity === "error",
      );
      expect(errors).toHaveLength(0);
    });

    it("errors when curationDays is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { curationDays: -1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.field === "timeline.curationDays" && i.severity === "error"),
      ).toBe(true);
    });

    it("errors when curationDays is not an integer", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { curationDays: 1.5 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("accepts curationDays of 0 (no curation phase)", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { curationDays: 0 },
      });
      const result = validateConfig(config);
      const errors = result.issues.filter(
        (i) => i.field === "timeline.curationDays" && i.severity === "error",
      );
      expect(errors).toHaveLength(0);
    });

    it("errors when votingDays is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { votingDays: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.field === "timeline.votingDays" && i.severity === "error"),
      ).toBe(true);
    });

    it("errors when votingDays is not an integer", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { votingDays: 2.5 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("accepts votingDays of 1", () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        timeline: { votingDays: 1 },
      });
      const result = validateConfig(config);
      const errors = result.issues.filter(
        (i) => i.field === "timeline.votingDays" && i.severity === "error",
      );
      expect(errors).toHaveLength(0);
    });
  });
});
