import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GovernanceConfig } from "../api/types.js";
import { useGroupRole } from "./use-group-role.js";

export interface GroupTab {
  to: string;
  /** Stable identifier for icon mapping (never translated). */
  key: string;
  /** Display label (translated). */
  label: string;
}

/** Whether delegation is enabled in the governance config. */
function delegationEnabled(config: GovernanceConfig | null | undefined): boolean {
  if (!config) return false;
  return config.delegation.candidacy || config.delegation.transferable;
}

/** Single source of truth for group navigation tabs. */
export function useGroupTabs(groupId: string | undefined, config: GovernanceConfig | undefined): GroupTab[] {
  const { t } = useTranslation();
  const { isAdmin } = useGroupRole(groupId);
  return useMemo(() => {
    if (!groupId) return [];
    const tabs: GroupTab[] = [
      { to: `/group/${groupId}/events`, key: "Votes", label: t("nav.votes") },
      { to: `/group/${groupId}/surveys`, key: "Surveys", label: t("nav.surveys") },
    ];
    if (config && delegationEnabled(config)) {
      tabs.push({ to: `/group/${groupId}/delegations`, key: "Delegates", label: t("nav.delegates") });
      tabs.push({ to: `/group/${groupId}/topics`, key: "Topics", label: t("nav.topics") });
    }
    tabs.push({ to: `/group/${groupId}/scoring`, key: "Scores", label: t("nav.scores") });
    tabs.push({ to: `/group/${groupId}/notes`, key: "Notes", label: t("nav.notes") });
    if (config?.delegation.candidacy) {
      tabs.push({ to: `/group/${groupId}/candidacies`, key: "Candidates", label: t("nav.candidates") });
    }
    if (isAdmin) {
      tabs.push({ to: `/group/${groupId}/members`, key: "Members", label: t("nav.members") });
    }
    // About tab — always last, always present
    tabs.push({ to: `/group/${groupId}/about`, key: "About", label: t("nav.about") });
    return tabs;
  }, [groupId, config, isAdmin, t]);
}
