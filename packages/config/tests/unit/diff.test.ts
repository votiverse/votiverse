import { describe, it, expect } from "vitest";
import { diffConfig, deriveConfig, getPreset } from "../../src/index.js";

describe("diffConfig", () => {
  it("returns empty array for identical configs", () => {
    const config = getPreset("DIRECT_DEMOCRACY");
    const diffs = diffConfig(config, config);
    expect(diffs).toHaveLength(0);
  });

  it("detects name change", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const modified = deriveConfig(base, { name: "My Custom Config" });
    const diffs = diffConfig(base, modified);
    expect(diffs).toContainEqual({
      path: "name",
      oldValue: "Direct Democracy",
      newValue: "My Custom Config",
    });
  });

  it("detects delegation property changes", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const modified = deriveConfig(base, {
      delegation: { candidacy: true },
    });
    const diffs = diffConfig(base, modified);
    expect(diffs).toContainEqual({
      path: "delegation.candidacy",
      oldValue: false,
      newValue: true,
    });
  });

  it("detects multiple changes", () => {
    const base = getPreset("DIRECT_DEMOCRACY");
    const modified = deriveConfig(base, {
      delegation: { candidacy: true, transferable: true },
      ballot: { quorum: 0.5 },
    });
    const diffs = diffConfig(base, modified);
    expect(diffs.length).toBeGreaterThanOrEqual(3);

    const paths = diffs.map((d) => d.path);
    expect(paths).toContain("delegation.candidacy");
    expect(paths).toContain("delegation.transferable");
    expect(paths).toContain("ballot.quorum");
  });

  it("detects boolean change", () => {
    const base = getPreset("LIQUID_DELEGATION");
    const modified = deriveConfig(base, {
      ballot: { secret: false },
    });
    const diffs = diffConfig(base, modified);
    expect(diffs).toContainEqual({
      path: "ballot.secret",
      oldValue: true,
      newValue: false,
    });
  });

  it("shows differences between LIQUID_DELEGATION and LIQUID_OPEN", () => {
    const liquid = getPreset("LIQUID_DELEGATION");
    const open = getPreset("LIQUID_OPEN");
    const diffs = diffConfig(liquid, open);

    const paths = diffs.map((d) => d.path);
    expect(paths).toContain("name");
    expect(paths).toContain("delegation.candidacy");
    expect(paths).toContain("ballot.secret");
    expect(diffs.length).toBeGreaterThan(0);
  });
});
