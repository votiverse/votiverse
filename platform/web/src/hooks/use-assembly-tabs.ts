import { useMemo } from "react";
import type { GovernanceConfig } from "../api/types.js";

export interface AssemblyTab {
  to: string;
  label: string;
}

/** Single source of truth for assembly navigation tabs. */
export function useAssemblyTabs(assemblyId: string | undefined, config: GovernanceConfig | undefined): AssemblyTab[] {
  return useMemo(() => {
    if (!assemblyId) return [];
    const tabs: AssemblyTab[] = [
      { to: `/assembly/${assemblyId}/events`, label: "Votes" },
    ];
    if (config?.delegation.delegationMode !== "none") {
      tabs.push({ to: `/assembly/${assemblyId}/delegations`, label: "Delegates" });
    }
    if (config?.delegation.delegationMode === "candidacy") {
      tabs.push({ to: `/assembly/${assemblyId}/candidacies`, label: "Candidates" });
    }
    if (config?.features.polls) {
      tabs.push({ to: `/assembly/${assemblyId}/polls`, label: "Surveys" });
    }
    if (config?.features.communityNotes) {
      tabs.push({ to: `/assembly/${assemblyId}/notes`, label: "Notes" });
    }
    tabs.push({ to: `/assembly/${assemblyId}`, label: "Group" });
    return tabs;
  }, [assemblyId, config]);
}
