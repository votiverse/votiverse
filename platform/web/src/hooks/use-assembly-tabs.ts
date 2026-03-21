import { useMemo } from "react";
import type { GovernanceConfig } from "../api/types.js";

export interface AssemblyTab {
  to: string;
  label: string;
}

/** Whether delegation is enabled in the governance config. */
function delegationEnabled(config: GovernanceConfig): boolean {
  return config.delegation.candidacy || config.delegation.transferable;
}

/** Single source of truth for assembly navigation tabs. */
export function useAssemblyTabs(assemblyId: string | undefined, config: GovernanceConfig | undefined): AssemblyTab[] {
  return useMemo(() => {
    if (!assemblyId) return [];
    const tabs: AssemblyTab[] = [
      { to: `/assembly/${assemblyId}/events`, label: "Votes" },
    ];
    if (config?.features.surveys) {
      tabs.push({ to: `/assembly/${assemblyId}/surveys`, label: "Surveys" });
    }
    if (config && delegationEnabled(config)) {
      tabs.push({ to: `/assembly/${assemblyId}/delegations`, label: "Delegates" });
      // Topics tab: always available when delegation is enabled (scoping is always available)
      tabs.push({ to: `/assembly/${assemblyId}/topics`, label: "Topics" });
    }
    if (config?.features.communityNotes) {
      tabs.push({ to: `/assembly/${assemblyId}/notes`, label: "Notes" });
    }
    if (config?.delegation.candidacy) {
      tabs.push({ to: `/assembly/${assemblyId}/candidacies`, label: "Candidates" });
    }
    // Group page is accessible via the group name in the header — no dedicated tab needed
    return tabs;
  }, [assemblyId, config]);
}
