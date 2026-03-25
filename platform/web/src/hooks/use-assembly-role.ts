/**
 * useAssemblyRole — determines the current user's admin/owner status in an assembly.
 *
 * Fetches the assembly profile (cached by useApi) and checks whether
 * the user's participant ID appears in the owners or admins arrays.
 */

import { useMemo } from "react";
import { useApi } from "./use-api.js";
import { useIdentity } from "./use-identity.js";
import * as api from "../api/client.js";

interface AssemblyRole {
  /** True if the user is an owner or admin. */
  isAdmin: boolean;
  /** True if the user is specifically an owner. */
  isOwner: boolean;
  /** Still loading profile data. */
  loading: boolean;
}

export function useAssemblyRole(assemblyId: string | undefined): AssemblyRole {
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { data: profile, loading } = useApi(
    () => api.getAssemblyProfile(assemblyId!),
    [assemblyId],
  );

  return useMemo(() => {
    if (!participantId || !profile) return { isAdmin: false, isOwner: false, loading };
    const isOwner = (profile.owners ?? []).some((r) => r.participantId === participantId);
    const isAdminRole = (profile.admins ?? []).some((r) => r.participantId === participantId);
    return { isAdmin: isOwner || isAdminRole, isOwner, loading: false };
  }, [participantId, profile, loading]);
}
