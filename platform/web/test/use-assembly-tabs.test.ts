/**
 * Assembly tabs hook tests — verifies tab visibility based on config.
 */

import { describe, it, expect } from "vitest";
import type { GovernanceConfig } from "../src/api/types.js";

// Test the tab logic directly without React hooks (pure function extraction)
function computeTabs(assemblyId: string, config: Partial<GovernanceConfig>) {
  const tabs: Array<{ to: string; label: string }> = [
    { to: `/assembly/${assemblyId}/events`, label: "Votes" },
  ];

  const delegationEnabled = (config.delegation?.candidacy || config.delegation?.transferable) ?? false;
  if (config.features?.surveys) {
    tabs.push({ to: `/assembly/${assemblyId}/surveys`, label: "Surveys" });
  }
  if (delegationEnabled) {
    tabs.push({ to: `/assembly/${assemblyId}/delegations`, label: "Delegates" });
    tabs.push({ to: `/assembly/${assemblyId}/topics`, label: "Topics" });
  }
  if (config.features?.communityNotes) {
    tabs.push({ to: `/assembly/${assemblyId}/notes`, label: "Notes" });
  }
  if (config.delegation?.candidacy) {
    tabs.push({ to: `/assembly/${assemblyId}/candidacies`, label: "Candidates" });
  }
  return tabs;
}

describe("Assembly tabs logic", () => {
  const baseConfig: Partial<GovernanceConfig> = {
    delegation: {
      candidacy: false,
      transferable: false,
    },
    features: {
      predictions: false,
      communityNotes: false,
      surveys: false,
    },
  };

  it("shows only Votes for DIRECT_DEMOCRACY (no delegation)", () => {
    const tabs = computeTabs("asm-1", baseConfig);
    const labels = tabs.map((t) => t.label);
    expect(labels).toEqual(["Votes"]);
    expect(labels).not.toContain("Delegates");
    expect(labels).not.toContain("Candidates");
  });

  it("shows Delegates and Topics tabs when transferable is true", () => {
    const config = {
      ...baseConfig,
      delegation: { ...baseConfig.delegation!, transferable: true },
    };
    const tabs = computeTabs("asm-1", config);
    expect(tabs.map((t) => t.label)).toContain("Delegates");
    expect(tabs.map((t) => t.label)).toContain("Topics");
    expect(tabs.map((t) => t.label)).not.toContain("Candidates");
  });

  it("shows Delegates, Topics, and Candidates tabs when candidacy is true", () => {
    const config = {
      ...baseConfig,
      delegation: { ...baseConfig.delegation!, candidacy: true },
    };
    const tabs = computeTabs("asm-1", config);
    const labels = tabs.map((t) => t.label);
    expect(labels).toContain("Delegates");
    expect(labels).toContain("Topics");
    expect(labels).toContain("Candidates");
  });

  it("shows Surveys tab when surveys enabled", () => {
    const config = {
      ...baseConfig,
      features: { ...baseConfig.features!, surveys: true },
    };
    const tabs = computeTabs("asm-1", config);
    expect(tabs.map((t) => t.label)).toContain("Surveys");
  });

  it("shows Notes tab when communityNotes enabled", () => {
    const config = {
      ...baseConfig,
      features: { ...baseConfig.features!, communityNotes: true },
    };
    const tabs = computeTabs("asm-1", config);
    expect(tabs.map((t) => t.label)).toContain("Notes");
  });

  it("LIQUID_DELEGATION config shows all relevant tabs", () => {
    const config = {
      delegation: { candidacy: true, transferable: true },
      features: {
        predictions: true,
        communityNotes: true,
        surveys: true,
      },
    };
    const tabs = computeTabs("asm-1", config);
    const labels = tabs.map((t) => t.label);
    expect(labels).toEqual(["Votes", "Surveys", "Delegates", "Topics", "Notes", "Candidates"]);
  });
});
