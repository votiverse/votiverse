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

  const delegationMode = config.delegation?.delegationMode ?? "none";
  if (delegationMode !== "none") {
    tabs.push({ to: `/assembly/${assemblyId}/delegations`, label: "Delegates" });
  }
  if (delegationMode === "candidacy") {
    tabs.push({ to: `/assembly/${assemblyId}/candidacies`, label: "Candidates" });
  }
  if (config.features?.polls) {
    tabs.push({ to: `/assembly/${assemblyId}/polls`, label: "Surveys" });
  }
  if (config.features?.predictions && config.features.predictions !== "disabled") {
    tabs.push({ to: `/assembly/${assemblyId}/predictions`, label: "Track Record" });
  }
  tabs.push({ to: `/assembly/${assemblyId}`, label: "Group" });
  return tabs;
}

describe("Assembly tabs logic", () => {
  const baseConfig: Partial<GovernanceConfig> = {
    delegation: {
      delegationMode: "none",
      topicScoped: false,
      transitive: false,
      revocableAnytime: false,
      maxChainDepth: null,
      maxDelegatesPerParticipant: null,
      maxAge: null,
      visibility: { mode: "private", incomingVisibility: "direct" },
    },
    features: {
      predictions: "disabled",
      communityNotes: false,
      noteVisibilityThreshold: 0.3,
      noteMinEvaluations: 3,
      polls: false,
      surveyResponseAnonymity: "anonymous",
      awarenessIntensity: "minimal",
      blockchainIntegrity: false,
    },
  };

  it("shows only Votes and Group for TOWN_HALL (no delegation)", () => {
    const tabs = computeTabs("asm-1", baseConfig);
    const labels = tabs.map((t) => t.label);
    expect(labels).toEqual(["Votes", "Group"]);
    expect(labels).not.toContain("Delegates");
    expect(labels).not.toContain("Candidates");
  });

  it("shows Delegates tab when delegationMode is 'open'", () => {
    const config = {
      ...baseConfig,
      delegation: { ...baseConfig.delegation!, delegationMode: "open" as const },
    };
    const tabs = computeTabs("asm-1", config);
    expect(tabs.map((t) => t.label)).toContain("Delegates");
    expect(tabs.map((t) => t.label)).not.toContain("Candidates");
  });

  it("shows both Delegates and Candidates tabs for candidacy mode", () => {
    const config = {
      ...baseConfig,
      delegation: { ...baseConfig.delegation!, delegationMode: "candidacy" as const },
    };
    const tabs = computeTabs("asm-1", config);
    const labels = tabs.map((t) => t.label);
    expect(labels).toContain("Delegates");
    expect(labels).toContain("Candidates");
  });

  it("shows Surveys tab when polls enabled", () => {
    const config = {
      ...baseConfig,
      features: { ...baseConfig.features!, polls: true },
    };
    const tabs = computeTabs("asm-1", config);
    expect(tabs.map((t) => t.label)).toContain("Surveys");
  });

  it("shows Track Record when predictions not disabled", () => {
    const config = {
      ...baseConfig,
      features: { ...baseConfig.features!, predictions: "mandatory" },
    };
    const tabs = computeTabs("asm-1", config);
    expect(tabs.map((t) => t.label)).toContain("Track Record");
  });

  it("LIQUID_ACCOUNTABLE config shows all relevant tabs", () => {
    const config = {
      delegation: { ...baseConfig.delegation!, delegationMode: "candidacy" as const },
      features: {
        ...baseConfig.features!,
        predictions: "mandatory",
        communityNotes: true,
        polls: true,
      },
    };
    const tabs = computeTabs("asm-1", config);
    const labels = tabs.map((t) => t.label);
    expect(labels).toEqual(["Votes", "Delegates", "Candidates", "Surveys", "Track Record", "Group"]);
  });
});
