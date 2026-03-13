import { describe, it, expect } from "vitest";
import { deriveConfig, getPreset } from "../../src/index.js";

describe("deriveConfig", () => {
  it("returns the base config when no overrides provided", () => {
    const base = getPreset("TOWN_HALL");
    const derived = deriveConfig(base, {});
    expect(derived).toEqual(base);
  });

  it("does not mutate the base config", () => {
    const base = getPreset("TOWN_HALL");
    const originalEnabled = base.delegation.enabled;
    deriveConfig(base, { delegation: { enabled: true } });
    expect(base.delegation.enabled).toBe(originalEnabled);
  });

  it("overrides top-level properties", () => {
    const base = getPreset("TOWN_HALL");
    const derived = deriveConfig(base, { name: "My Config" });
    expect(derived.name).toBe("My Config");
    expect(derived.description).toBe(base.description);
  });

  it("overrides nested delegation properties", () => {
    const base = getPreset("TOWN_HALL");
    const derived = deriveConfig(base, {
      delegation: { enabled: true, transitive: true },
    });
    expect(derived.delegation.enabled).toBe(true);
    expect(derived.delegation.transitive).toBe(true);
    // Non-overridden properties should keep base values
    expect(derived.delegation.topicScoped).toBe(base.delegation.topicScoped);
  });

  it("overrides nested ballot properties", () => {
    const base = getPreset("LIQUID_STANDARD");
    const derived = deriveConfig(base, {
      ballot: { quorum: 0.5, votingMethod: "supermajority" },
    });
    expect(derived.ballot.quorum).toBe(0.5);
    expect(derived.ballot.votingMethod).toBe("supermajority");
    expect(derived.ballot.secrecy).toBe(base.ballot.secrecy);
  });

  it("overrides nested feature properties", () => {
    const base = getPreset("TOWN_HALL");
    const derived = deriveConfig(base, {
      features: { predictions: "mandatory", communityNotes: true },
    });
    expect(derived.features.predictions).toBe("mandatory");
    expect(derived.features.communityNotes).toBe(true);
    expect(derived.features.polls).toBe(base.features.polls);
  });

  it("overrides nested threshold properties", () => {
    const base = getPreset("LIQUID_STANDARD");
    const derived = deriveConfig(base, {
      thresholds: { concentrationAlertThreshold: 0.05 },
    });
    expect(derived.thresholds.concentrationAlertThreshold).toBe(0.05);
  });

  it("produces a new config that can be validated", () => {
    const base = getPreset("LIQUID_STANDARD");
    const derived = deriveConfig(base, {
      name: "Custom Liquid",
      ballot: { votingMethod: "supermajority", supermajorityThreshold: 0.67 },
    });
    expect(derived.name).toBe("Custom Liquid");
    expect(derived.ballot.votingMethod).toBe("supermajority");
    expect(derived.ballot.supermajorityThreshold).toBe(0.67);
  });
});
