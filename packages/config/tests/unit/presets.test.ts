import { describe, it, expect } from "vitest";
import { PRESETS, getPreset, getPresetNames, validateConfig } from "../../src/index.js";
import type { PresetName } from "../../src/index.js";

describe("Named presets", () => {
  it("provides six named presets", () => {
    const names = getPresetNames();
    expect(names).toHaveLength(6);
    expect(names).toContain("TOWN_HALL");
    expect(names).toContain("SWISS_MODEL");
    expect(names).toContain("LIQUID_STANDARD");
    expect(names).toContain("LIQUID_ACCOUNTABLE");
    expect(names).toContain("BOARD_PROXY");
    expect(names).toContain("CIVIC_PARTICIPATORY");
  });

  it("getPreset returns the correct preset", () => {
    const townHall = getPreset("TOWN_HALL");
    expect(townHall.name).toBe("Town Hall");
    expect(townHall.delegation.enabled).toBe(false);
  });

  it("PRESETS object matches getPreset results", () => {
    for (const name of getPresetNames()) {
      expect(PRESETS[name]).toBe(getPreset(name));
    }
  });

  describe("all presets pass validation", () => {
    for (const name of [
      "TOWN_HALL",
      "SWISS_MODEL",
      "LIQUID_STANDARD",
      "LIQUID_ACCOUNTABLE",
      "BOARD_PROXY",
      "CIVIC_PARTICIPATORY",
    ] as PresetName[]) {
      it(`${name} is valid`, () => {
        const result = validateConfig(getPreset(name));
        expect(result.valid).toBe(true);
        // No errors, maybe warnings
        expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
      });
    }
  });

  describe("preset properties match whitepaper", () => {
    it("TOWN_HALL: no delegation, secret ballot, simple majority", () => {
      const config = PRESETS.TOWN_HALL;
      expect(config.delegation.enabled).toBe(false);
      expect(config.ballot.secrecy).toBe("secret");
      expect(config.ballot.votingMethod).toBe("simple-majority");
    });

    it("SWISS_MODEL: no delegation, predictions encouraged, community notes", () => {
      const config = PRESETS.SWISS_MODEL;
      expect(config.delegation.enabled).toBe(false);
      expect(config.features.predictions).toBe("encouraged");
      expect(config.features.communityNotes).toBe(true);
    });

    it("LIQUID_STANDARD: topic-scoped delegation, transitive, revocable", () => {
      const config = PRESETS.LIQUID_STANDARD;
      expect(config.delegation.enabled).toBe(true);
      expect(config.delegation.topicScoped).toBe(true);
      expect(config.delegation.transitive).toBe(true);
      expect(config.delegation.revocableAnytime).toBe(true);
      expect(config.ballot.delegateVoteVisibility).toBe("delegators-only");
      expect(config.features.predictions).toBe("optional");
    });

    it("LIQUID_ACCOUNTABLE: mandatory predictions, full awareness, public delegates", () => {
      const config = PRESETS.LIQUID_ACCOUNTABLE;
      expect(config.delegation.enabled).toBe(true);
      expect(config.features.predictions).toBe("mandatory");
      expect(config.features.awarenessIntensity).toBe("aggressive");
      expect(config.ballot.delegateVoteVisibility).toBe("public");
    });

    it("BOARD_PROXY: single delegate, non-transitive, secret ballot", () => {
      const config = PRESETS.BOARD_PROXY;
      expect(config.delegation.enabled).toBe(true);
      expect(config.delegation.transitive).toBe(false);
      expect(config.delegation.maxDelegatesPerParticipant).toBe(1);
      expect(config.delegation.maxChainDepth).toBe(1);
      expect(config.ballot.secrecy).toBe("secret");
    });

    it("CIVIC_PARTICIPATORY: chain depth cap, mandatory predictions, blockchain", () => {
      const config = PRESETS.CIVIC_PARTICIPATORY;
      expect(config.delegation.enabled).toBe(true);
      expect(config.delegation.maxChainDepth).toBe(3);
      expect(config.features.predictions).toBe("mandatory");
      expect(config.features.communityNotes).toBe(true);
      expect(config.features.polls).toBe(true);
      expect(config.features.blockchainIntegrity).toBe(true);
    });
  });

  it("presets are frozen (immutable)", () => {
    const preset = PRESETS.TOWN_HALL;
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.delegation)).toBe(true);
    expect(Object.isFrozen(preset.ballot)).toBe(true);
    expect(Object.isFrozen(preset.features)).toBe(true);
    expect(Object.isFrozen(preset.thresholds)).toBe(true);
  });

  it("PRESETS map is frozen", () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
  });
});
