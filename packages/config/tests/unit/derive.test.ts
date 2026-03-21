import { describe, it, expect } from "vitest";
import { deriveConfig, getPreset } from "../../src/index.js";

describe("deriveConfig", () => {
  it("returns the base config when no overrides provided", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const derived = deriveConfig(base, {});
    expect(derived).toEqual(base);
  });

  it("does not mutate the base config", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const originalCandidacy = base.delegation.candidacy;
    deriveConfig(base, { delegation: { candidacy: true } });
    expect(base.delegation.candidacy).toBe(originalCandidacy);
  });

  it("overrides top-level properties", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const derived = deriveConfig(base, { name: "My Config" });
    expect(derived.name).toBe("My Config");
    expect(derived.description).toBe(base.description);
  });

  it("overrides delegation properties", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const derived = deriveConfig(base, {
      delegation: { candidacy: true, transferable: true },
    });
    expect(derived.delegation.candidacy).toBe(true);
    expect(derived.delegation.transferable).toBe(true);
  });

  it("overrides ballot properties", () => {
    const base = getPreset("LIQUID_DELEGATION");
    const derived = deriveConfig(base, {
      ballot: { quorum: 0.5, method: "supermajority" },
    });
    expect(derived.ballot.quorum).toBe(0.5);
    expect(derived.ballot.method).toBe("supermajority");
    expect(derived.ballot.secret).toBe(base.ballot.secret);
  });

  it("overrides feature properties", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const derived = deriveConfig(base, {
      features: { predictions: true, communityNotes: true },
    });
    expect(derived.features.predictions).toBe(true);
    expect(derived.features.communityNotes).toBe(true);
    expect(derived.features.surveys).toBe(base.features.surveys);
  });

  it("overrides timeline properties", () => {
    const base = getPreset("LIQUID_DELEGATION");
    const derived = deriveConfig(base, {
      timeline: { deliberationDays: 14, curationDays: 5 },
    });
    expect(derived.timeline.deliberationDays).toBe(14);
    expect(derived.timeline.curationDays).toBe(5);
    expect(derived.timeline.votingDays).toBe(base.timeline.votingDays);
  });

  it("produces a new config that can be validated", () => {
    const base = getPreset("LIQUID_OPEN");
    const derived = deriveConfig(base, {
      name: "Custom Liquid",
      ballot: { method: "supermajority" },
    });
    expect(derived.name).toBe("Custom Liquid");
    expect(derived.ballot.method).toBe("supermajority");
  });
});
