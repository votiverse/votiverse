import { describe, it, expect } from "vitest";
import { PRESETS, DEFAULT_PRESET, getPreset, getPresetNames, validateConfig } from "../../src/index.js";
import type { PresetName } from "../../src/index.js";

describe("Named presets", () => {
  it("provides seven named presets", () => {
    const names = getPresetNames();
    expect(names).toHaveLength(7);
    expect(names).toContain("MODERN_DEMOCRACY");
    expect(names).toContain("TOWN_HALL");
    expect(names).toContain("SWISS_MODEL");
    expect(names).toContain("LIQUID_STANDARD");
    expect(names).toContain("LIQUID_ACCOUNTABLE");
    expect(names).toContain("BOARD_PROXY");
    expect(names).toContain("CIVIC_PARTICIPATORY");
  });

  it("DEFAULT_PRESET is MODERN_DEMOCRACY", () => {
    expect(DEFAULT_PRESET).toBe("MODERN_DEMOCRACY");
  });

  it("getPreset returns the correct preset", () => {
    const modernDemocracy = getPreset("MODERN_DEMOCRACY");
    expect(modernDemocracy.name).toBe("Modern Democracy");
    expect(modernDemocracy.delegation.delegationMode).toBe("candidacy");
  });

  it("PRESETS object matches getPreset results", () => {
    for (const name of getPresetNames()) {
      expect(PRESETS[name]).toBe(getPreset(name));
    }
  });

  describe("all presets pass validation", () => {
    for (const name of [
      "MODERN_DEMOCRACY",
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

  describe("preset display names", () => {
    it("MODERN_DEMOCRACY: Modern Democracy", () => {
      expect(PRESETS.MODERN_DEMOCRACY.name).toBe("Modern Democracy");
    });

    it("TOWN_HALL: Direct Democracy", () => {
      expect(PRESETS.TOWN_HALL.name).toBe("Direct Democracy");
    });

    it("SWISS_MODEL: Swiss Votation", () => {
      expect(PRESETS.SWISS_MODEL.name).toBe("Swiss Votation");
    });

    it("LIQUID_STANDARD: Liquid Open", () => {
      expect(PRESETS.LIQUID_STANDARD.name).toBe("Liquid Open");
    });

    it("LIQUID_ACCOUNTABLE: Full Accountability", () => {
      expect(PRESETS.LIQUID_ACCOUNTABLE.name).toBe("Full Accountability");
    });

    it("BOARD_PROXY: Board Proxy", () => {
      expect(PRESETS.BOARD_PROXY.name).toBe("Board Proxy");
    });

    it("CIVIC_PARTICIPATORY: Civic Participatory", () => {
      expect(PRESETS.CIVIC_PARTICIPATORY.name).toBe("Civic Participatory");
    });
  });

  describe("preset properties", () => {
    it("MODERN_DEMOCRACY: candidacy delegation, secret ballot, community notes, surveys, predictions encouraged", () => {
      const config = PRESETS.MODERN_DEMOCRACY;
      expect(config.delegation.delegationMode).toBe("candidacy");
      expect(config.delegation.topicScoped).toBe(true);
      expect(config.delegation.transitive).toBe(true);
      expect(config.delegation.revocableAnytime).toBe(true);
      expect(config.ballot.secrecy).toBe("secret");
      expect(config.ballot.resultsVisibility).toBe("sealed");
      expect(config.ballot.allowVoteChange).toBe(true);
      expect(config.features.predictions).toBe("encouraged");
      expect(config.features.communityNotes).toBe(true);
      expect(config.features.surveys).toBe(true);
      expect(config.features.awarenessIntensity).toBe("standard");
    });

    it("TOWN_HALL: no delegation, secret ballot, simple majority", () => {
      const config = PRESETS.TOWN_HALL;
      expect(config.delegation.delegationMode).toBe("none");
      expect(config.ballot.secrecy).toBe("secret");
      expect(config.ballot.votingMethod).toBe("simple-majority");
    });

    it("SWISS_MODEL: no delegation, predictions encouraged, community notes", () => {
      const config = PRESETS.SWISS_MODEL;
      expect(config.delegation.delegationMode).toBe("none");
      expect(config.features.predictions).toBe("encouraged");
      expect(config.features.communityNotes).toBe(true);
    });

    it("LIQUID_STANDARD: open delegation, topic-scoped, transitive, revocable", () => {
      const config = PRESETS.LIQUID_STANDARD;
      expect(config.delegation.delegationMode).toBe("open");
      expect(config.delegation.topicScoped).toBe(true);
      expect(config.delegation.transitive).toBe(true);
      expect(config.delegation.revocableAnytime).toBe(true);
      expect(config.ballot.delegateVoteVisibility).toBe("delegators-only");
      expect(config.features.predictions).toBe("optional");
    });

    it("LIQUID_ACCOUNTABLE: candidacy mode, mandatory predictions, full awareness", () => {
      const config = PRESETS.LIQUID_ACCOUNTABLE;
      expect(config.delegation.delegationMode).toBe("candidacy");
      expect(config.features.predictions).toBe("mandatory");
      expect(config.features.awarenessIntensity).toBe("aggressive");
      expect(config.ballot.delegateVoteVisibility).toBe("public");
    });

    it("BOARD_PROXY: open delegation, single delegate, non-transitive, secret ballot", () => {
      const config = PRESETS.BOARD_PROXY;
      expect(config.delegation.delegationMode).toBe("open");
      expect(config.delegation.transitive).toBe(false);
      expect(config.delegation.maxDelegatesPerParticipant).toBe(1);
      expect(config.ballot.secrecy).toBe("secret");
    });

    it("CIVIC_PARTICIPATORY: open delegation, mandatory predictions, blockchain", () => {
      const config = PRESETS.CIVIC_PARTICIPATORY;
      expect(config.delegation.delegationMode).toBe("open");
      expect(config.features.predictions).toBe("mandatory");
      expect(config.features.communityNotes).toBe(true);
      expect(config.features.surveys).toBe(true);
      expect(config.features.blockchainIntegrity).toBe(true);
    });
  });

  describe("preset timelines", () => {
    it("MODERN_DEMOCRACY: 7/2/7", () => {
      const t = PRESETS.MODERN_DEMOCRACY.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(2);
      expect(t.votingDays).toBe(7);
    });

    it("TOWN_HALL: 7/0/7 (no curation)", () => {
      const t = PRESETS.TOWN_HALL.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(0);
      expect(t.votingDays).toBe(7);
    });

    it("SWISS_MODEL: 7/2/7", () => {
      const t = PRESETS.SWISS_MODEL.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(2);
      expect(t.votingDays).toBe(7);
    });

    it("LIQUID_STANDARD: 5/0/5", () => {
      const t = PRESETS.LIQUID_STANDARD.timeline;
      expect(t.deliberationDays).toBe(5);
      expect(t.curationDays).toBe(0);
      expect(t.votingDays).toBe(5);
    });

    it("LIQUID_ACCOUNTABLE: 7/3/7", () => {
      const t = PRESETS.LIQUID_ACCOUNTABLE.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(3);
      expect(t.votingDays).toBe(7);
    });

    it("BOARD_PROXY: 3/0/3", () => {
      const t = PRESETS.BOARD_PROXY.timeline;
      expect(t.deliberationDays).toBe(3);
      expect(t.curationDays).toBe(0);
      expect(t.votingDays).toBe(3);
    });

    it("CIVIC_PARTICIPATORY: 14/3/14", () => {
      const t = PRESETS.CIVIC_PARTICIPATORY.timeline;
      expect(t.deliberationDays).toBe(14);
      expect(t.curationDays).toBe(3);
      expect(t.votingDays).toBe(14);
    });
  });

  it("presets are frozen (immutable)", () => {
    const preset = PRESETS.TOWN_HALL;
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.delegation)).toBe(true);
    expect(Object.isFrozen(preset.ballot)).toBe(true);
    expect(Object.isFrozen(preset.features)).toBe(true);
    expect(Object.isFrozen(preset.thresholds)).toBe(true);
    expect(Object.isFrozen(preset.timeline)).toBe(true);
  });

  it("MODERN_DEMOCRACY preset is frozen", () => {
    const preset = PRESETS.MODERN_DEMOCRACY;
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.delegation)).toBe(true);
    expect(Object.isFrozen(preset.ballot)).toBe(true);
    expect(Object.isFrozen(preset.features)).toBe(true);
    expect(Object.isFrozen(preset.thresholds)).toBe(true);
    expect(Object.isFrozen(preset.timeline)).toBe(true);
  });

  it("PRESETS map is frozen", () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
  });
});
