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
export function useGroupTabs(
  groupId: string | undefined,
  config: GovernanceConfig | null | undefined,
  capabilities: string[] = [],
): GroupTab[] {
  const { t } = useTranslation();
  const { isAdmin } = useGroupRole(groupId);
  return useMemo(() => {
    if (!groupId) return [];
    const has = (cap: string) => capabilities.includes(cap);
    const tabs: GroupTab[] = [];

    // Core capabilities — ordered by importance
    if (has("voting")) {
      tabs.push({ to: `/group/${groupId}/events`, key: "Votes", label: t("nav.votes") });
    }
    if (has("scoring")) {
      tabs.push({ to: `/group/${groupId}/scoring`, key: "Scores", label: t("nav.scores") });
    }
    if (has("surveys")) {
      tabs.push({ to: `/group/${groupId}/surveys`, key: "Surveys", label: t("nav.surveys") });
    }

    // Delegation-related tabs (only when voting with delegation)
    if (has("voting") && config && delegationEnabled(config)) {
      tabs.push({ to: `/group/${groupId}/delegations`, key: "Delegates", label: t("nav.delegates") });
      tabs.push({ to: `/group/${groupId}/topics`, key: "Topics", label: t("nav.topics") });
    }
    if (has("voting") && config?.delegation.candidacy) {
      tabs.push({ to: `/group/${groupId}/candidacies`, key: "Candidates", label: t("nav.candidates") });
    }

    // Notes — always shown if enabled
    if (has("community_notes")) {
      tabs.push({ to: `/group/${groupId}/notes`, key: "Notes", label: t("nav.notes") });
    }

    // Members — admin only
    if (isAdmin) {
      tabs.push({ to: `/group/${groupId}/members`, key: "Members", label: t("nav.members") });
    }

    // About — always last
    tabs.push({ to: `/group/${groupId}/about`, key: "About", label: t("nav.about") });
    return tabs;
  }, [groupId, config, capabilities, isAdmin, t]);
}
