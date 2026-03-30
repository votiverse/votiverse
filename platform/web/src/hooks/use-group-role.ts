/**
 * useGroupRole — determines the current user's admin/owner status in a group.
 *
 * Fetches the group profile (cached by useApi) and checks whether
 * the user's participant ID appears in the owners or admins arrays.
 */

import { useMemo } from "react";
import { useApi } from "./use-api.js";
import { useIdentity } from "./use-identity.js";
import * as api from "../api/client.js";

interface GroupRoleResult {
  /** True if the user is an owner or admin. */
  isAdmin: boolean;
  /** True if the user is specifically an owner. */
  isOwner: boolean;
  /** Still loading profile data. */
  loading: boolean;
}

export function useGroupRole(groupId: string | undefined): GroupRoleResult {
  const { getParticipantId } = useIdentity();
  const participantId = groupId ? getParticipantId(groupId) : null;
  const { data: profile, loading } = useApi(
    () => api.getGroupProfile(groupId!),
    [groupId],
  );

  return useMemo(() => {
    if (!participantId || !profile) return { isAdmin: false, isOwner: false, loading };
    const isOwner = (profile.owners ?? []).some((r) => r.participantId === participantId);
    const isAdminRole = (profile.admins ?? []).some((r) => r.participantId === participantId);
    return { isAdmin: isOwner || isAdminRole, isOwner, loading: false };
  }, [participantId, profile, loading]);
}
