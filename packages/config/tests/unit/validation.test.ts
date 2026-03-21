import { describe, it, expect } from "vitest";
import { validateConfig, deriveConfig, getPreset } from "../../src/index.js";

describe("validateConfig", () => {
  describe("all parameter combinations are valid", () => {
    it("accepts candidacy=true, transferable=true (liquid delegation)", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {});
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts candidacy=false, transferable=false (direct democracy)", () => {
      const config = deriveConfig(getPreset("DIRECT_DEMOCRACY"), {});
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts candidacy=true, transferable=false (representative)", () => {
      const config = deriveConfig(getPreset("REPRESENTATIVE"), {});
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts candidacy=false, transferable=true (informal liquid)", () => {
      const config = deriveConfig(getPreset("LIQUID_OPEN"), {});
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts secret=false with liveResults=true (show of hands)", () => {
      const config = deriveConfig(getPreset("LIQUID_OPEN"), {
        ballot: { secret: false, liveResults: true, allowVoteChange: true },
      });
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts secret=true with liveResults=false (sealed election)", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { secret: true, liveResults: false },
      });
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts supermajority method", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { method: "supermajority" },
      });
      expect(validateConfig(config).valid).toBe(true);
    });
  });

  describe("quorum validation", () => {
    it("errors when quorum is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { quorum: -0.1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === "ballot.quorum" && i.severity === "error")).toBe(true);
    });

    it("errors when quorum is > 1", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { quorum: 1.5 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("accepts quorum of 0 (no quorum requirement)", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { quorum: 0 },
      });
      expect(validateConfig(config).valid).toBe(true);
    });

    it("accepts quorum of 1 (100%)", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        ballot: { quorum: 1 },
      });
      expect(validateConfig(config).valid).toBe(true);
    });
  });

  describe("timeline validation", () => {
    it("errors when deliberationDays is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { deliberationDays: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === "timeline.deliberationDays" && i.severity === "error")).toBe(true);
    });

    it("errors when deliberationDays is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { deliberationDays: -1 },
      });
      expect(validateConfig(config).valid).toBe(false);
    });

    it("errors when deliberationDays is not an integer", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { deliberationDays: 3.5 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === "timeline.deliberationDays" && i.severity === "error")).toBe(true);
    });

    it("accepts deliberationDays of 1", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { deliberationDays: 1 },
      });
      const errors = validateConfig(config).issues.filter(
        (i) => i.field === "timeline.deliberationDays" && i.severity === "error",
      );
      expect(errors).toHaveLength(0);
    });

    it("errors when curationDays is negative", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { curationDays: -1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === "timeline.curationDays" && i.severity === "error")).toBe(true);
    });

    it("errors when curationDays is not an integer", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { curationDays: 1.5 },
      });
      expect(validateConfig(config).valid).toBe(false);
    });

    it("accepts curationDays of 0 (no curation phase)", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { curationDays: 0 },
      });
      const errors = validateConfig(config).issues.filter(
        (i) => i.field === "timeline.curationDays" && i.severity === "error",
      );
      expect(errors).toHaveLength(0);
    });

    it("errors when votingDays is 0", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { votingDays: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === "timeline.votingDays" && i.severity === "error")).toBe(true);
    });

    it("errors when votingDays is not an integer", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { votingDays: 2.5 },
      });
      expect(validateConfig(config).valid).toBe(false);
    });

    it("accepts votingDays of 1", () => {
      const config = deriveConfig(getPreset("LIQUID_DELEGATION"), {
        timeline: { votingDays: 1 },
      });
      const errors = validateConfig(config).issues.filter(
        (i) => i.field === "timeline.votingDays" && i.severity === "error",
      );
      expect(errors).toHaveLength(0);
    });
  });
});
