import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GovernanceConfig } from "../api/types.js";

export interface AssemblyTab {
  to: string;
  /** Stable identifier for icon mapping (never translated). */
  key: string;
  /** Display label (translated). */
  label: string;
}

/** Whether delegation is enabled in the governance config. */
function delegationEnabled(config: GovernanceConfig): boolean {
  return config.delegation.candidacy || config.delegation.transferable;
}

/** Single source of truth for assembly navigation tabs. */
export function useAssemblyTabs(assemblyId: string | undefined, config: GovernanceConfig | undefined): AssemblyTab[] {
  const { t } = useTranslation();
  return useMemo(() => {
    if (!assemblyId) return [];
    const tabs: AssemblyTab[] = [
      { to: `/assembly/${assemblyId}/events`, key: "Votes", label: t("nav.votes") },
    ];
    if (config?.features.surveys) {
      tabs.push({ to: `/assembly/${assemblyId}/surveys`, key: "Surveys", label: t("nav.surveys") });
    }
    if (config && delegationEnabled(config)) {
      tabs.push({ to: `/assembly/${assemblyId}/delegations`, key: "Delegates", label: t("nav.delegates") });
      // Topics tab: always available when delegation is enabled (scoping is always available)
      tabs.push({ to: `/assembly/${assemblyId}/topics`, key: "Topics", label: t("nav.topics") });
    }
    if (config?.features.communityNotes) {
      tabs.push({ to: `/assembly/${assemblyId}/notes`, key: "Notes", label: t("nav.notes") });
    }
    if (config?.delegation.candidacy) {
      tabs.push({ to: `/assembly/${assemblyId}/candidacies`, key: "Candidates", label: t("nav.candidates") });
    }
    // About tab — always last, always present
    tabs.push({ to: `/assembly/${assemblyId}/about`, key: "About", label: t("nav.about") });
    return tabs;
  }, [assemblyId, config, t]);
}
