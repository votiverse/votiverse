import { describe, it, expect } from "vitest";
import { diffConfig, deriveConfig, getPreset } from "../../src/index.js";

describe("diffConfig", () => {
  it("returns empty array for identical configs", () => {
    const config = getPreset("TOWN_HALL");
    const diffs = diffConfig(config, config);
    expect(diffs).toHaveLength(0);
  });

  it("detects name change", () => {
    const base = getPreset("TOWN_HALL");
    const modified = deriveConfig(base, { name: "My Custom Config" });
    const diffs = diffConfig(base, modified);
    expect(diffs).toContainEqual({
      path: "name",
      oldValue: "Direct Democracy",
      newValue: "My Custom Config",
    });
  });

  it("detects nested property changes", () => {
    const base = getPreset("TOWN_HALL");
    const modified = deriveConfig(base, {
      delegation: { delegationMode: "open" },
    });
    const diffs = diffConfig(base, modified);
    expect(diffs).toContainEqual({
      path: "delegation.delegationMode",
      oldValue: "none",
      newValue: "open",
    });
  });

  it("detects multiple changes", () => {
    const base = getPreset("TOWN_HALL");
    const modified = deriveConfig(base, {
      delegation: { delegationMode: "open", transitive: true },
      ballot: { quorum: 0.5 },
    });
    const diffs = diffConfig(base, modified);
    expect(diffs.length).toBeGreaterThanOrEqual(3);

    const paths = diffs.map((d) => d.path);
    expect(paths).toContain("delegation.delegationMode");
    expect(paths).toContain("delegation.transitive");
    expect(paths).toContain("ballot.quorum");
  });

  it("detects change from null to a value", () => {
    const base = getPreset("LIQUID_STANDARD");
    const modified = deriveConfig(base, {
      delegation: { maxDelegatesPerParticipant: 3 },
    });
    const diffs = diffConfig(base, modified);
    expect(diffs).toContainEqual({
      path: "delegation.maxDelegatesPerParticipant",
      oldValue: null,
      newValue: 3,
    });
  });

  it("shows the full diff from LIQUID_STANDARD to LIQUID_ACCOUNTABLE", () => {
    const base = getPreset("LIQUID_STANDARD");
    const accountable = getPreset("LIQUID_ACCOUNTABLE");
    const diffs = diffConfig(base, accountable);

    // Should show the differences: name, description, delegationMode, visibility, predictions, etc.
    const paths = diffs.map((d) => d.path);
    expect(paths).toContain("name");
    expect(paths).toContain("delegation.delegationMode");
    expect(paths).toContain("features.predictions");
    expect(paths).toContain("ballot.delegateVoteVisibility");
    expect(diffs.length).toBeGreaterThan(0);
  });
});
