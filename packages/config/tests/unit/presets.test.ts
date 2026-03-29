import { describe, it, expect } from "vitest";
import { PRESETS, DEFAULT_PRESET, getPreset, getPresetNames, validateConfig } from "../../src/index.js";

describe("Named presets", () => {
  it("provides six named presets", () => {
    const names = getPresetNames();
    expect(names).toHaveLength(6);
    expect(names).toContain("LIQUID_DELEGATION");
    expect(names).toContain("DIRECT_DEMOCRACY");
    expect(names).toContain("SWISS_VOTATION");
    expect(names).toContain("LIQUID_OPEN");
    expect(names).toContain("REPRESENTATIVE");
    expect(names).toContain("CIVIC");
  });

  it("DEFAULT_PRESET is LIQUID_DELEGATION", () => {
    expect(DEFAULT_PRESET).toBe("LIQUID_DELEGATION");
  });

  it("getPreset returns the correct preset", () => {
    const preset = getPreset("LIQUID_DELEGATION");
    expect(preset.delegation.candidacy).toBe(true);
    expect(preset.delegation.transferable).toBe(true);
  });

  it("PRESETS object matches getPreset results", () => {
    for (const name of getPresetNames()) {
      expect(PRESETS[name]).toBe(getPreset(name));
    }
  });

  describe("all presets pass validation", () => {
    for (const name of getPresetNames()) {
      it(`${name} is valid`, () => {
        const result = validateConfig(getPreset(name));
        expect(result.valid).toBe(true);
        expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
      });
    }
  });

  describe("delegation 2×2 grid", () => {
    it("LIQUID_DELEGATION: candidacy=true, transferable=true (liquid delegation)", () => {
      const d = PRESETS.LIQUID_DELEGATION.delegation;
      expect(d.candidacy).toBe(true);
      expect(d.transferable).toBe(true);
    });

    it("DIRECT_DEMOCRACY: candidacy=false, transferable=false (no delegation)", () => {
      const d = PRESETS.DIRECT_DEMOCRACY.delegation;
      expect(d.candidacy).toBe(false);
      expect(d.transferable).toBe(false);
    });

    it("SWISS_VOTATION: candidacy=false, transferable=false (no delegation)", () => {
      const d = PRESETS.SWISS_VOTATION.delegation;
      expect(d.candidacy).toBe(false);
      expect(d.transferable).toBe(false);
    });

    it("LIQUID_OPEN: candidacy=false, transferable=true (informal liquid)", () => {
      const d = PRESETS.LIQUID_OPEN.delegation;
      expect(d.candidacy).toBe(false);
      expect(d.transferable).toBe(true);
    });

    it("REPRESENTATIVE: candidacy=true, transferable=false (classic proxy)", () => {
      const d = PRESETS.REPRESENTATIVE.delegation;
      expect(d.candidacy).toBe(true);
      expect(d.transferable).toBe(false);
    });

    it("CIVIC: candidacy=true, transferable=true (municipal liquid delegation)", () => {
      const d = PRESETS.CIVIC.delegation;
      expect(d.candidacy).toBe(true);
      expect(d.transferable).toBe(true);
    });
  });

  describe("ballot properties", () => {
    it("LIQUID_DELEGATION: secret ballot, sealed results, vote change allowed", () => {
      const b = PRESETS.LIQUID_DELEGATION.ballot;
      expect(b.secret).toBe(true);
      expect(b.liveResults).toBe(false);
      expect(b.allowVoteChange).toBe(true);
      expect(b.quorum).toBe(0.1);
      expect(b.method).toBe("majority");
    });

    it("LIQUID_OPEN: public ballot, live results (show of hands)", () => {
      const b = PRESETS.LIQUID_OPEN.ballot;
      expect(b.secret).toBe(false);
      expect(b.liveResults).toBe(true);
      expect(b.allowVoteChange).toBe(true);
    });

    it("REPRESENTATIVE: high quorum (50%)", () => {
      expect(PRESETS.REPRESENTATIVE.ballot.quorum).toBe(0.5);
    });

    it("SWISS_VOTATION: quorum 20%", () => {
      expect(PRESETS.SWISS_VOTATION.ballot.quorum).toBe(0.2);
    });
  });

  describe("preset timelines", () => {
    it("LIQUID_DELEGATION: 7/2/7", () => {
      const t = PRESETS.LIQUID_DELEGATION.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(2);
      expect(t.votingDays).toBe(7);
    });

    it("DIRECT_DEMOCRACY: 7/0/7 (no curation)", () => {
      const t = PRESETS.DIRECT_DEMOCRACY.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(0);
      expect(t.votingDays).toBe(7);
    });

    it("SWISS_VOTATION: 7/2/7", () => {
      const t = PRESETS.SWISS_VOTATION.timeline;
      expect(t.deliberationDays).toBe(7);
      expect(t.curationDays).toBe(2);
      expect(t.votingDays).toBe(7);
    });

    it("LIQUID_OPEN: 5/0/5", () => {
      const t = PRESETS.LIQUID_OPEN.timeline;
      expect(t.deliberationDays).toBe(5);
      expect(t.curationDays).toBe(0);
      expect(t.votingDays).toBe(5);
    });

    it("REPRESENTATIVE: 3/0/3", () => {
      const t = PRESETS.REPRESENTATIVE.timeline;
      expect(t.deliberationDays).toBe(3);
      expect(t.curationDays).toBe(0);
      expect(t.votingDays).toBe(3);
    });

    it("CIVIC: 14/3/14", () => {
      const t = PRESETS.CIVIC.timeline;
      expect(t.deliberationDays).toBe(14);
      expect(t.curationDays).toBe(3);
      expect(t.votingDays).toBe(14);
    });
  });

  it("presets are frozen (immutable)", () => {
    const preset = PRESETS.DIRECT_DEMOCRACY;
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.delegation)).toBe(true);
    expect(Object.isFrozen(preset.ballot)).toBe(true);
    expect(Object.isFrozen(preset.timeline)).toBe(true);
  });

  it("LIQUID_DELEGATION preset is frozen", () => {
    const preset = PRESETS.LIQUID_DELEGATION;
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.delegation)).toBe(true);
    expect(Object.isFrozen(preset.ballot)).toBe(true);
    expect(Object.isFrozen(preset.timeline)).toBe(true);
  });

  it("PRESETS map is frozen", () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
  });
});
