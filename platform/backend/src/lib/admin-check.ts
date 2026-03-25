/**
 * Shared admin/owner role check for assembly-scoped authorization.
 *
 * Resolves the user's participant ID and checks VCP roles.
 * Used by proxy, invitations, and any route that gates on admin status.
 */

import type { MembershipService } from "../services/membership-service.js";
import type { VCPClient } from "../services/vcp-client.js";

export async function isAdminOf(
  userId: string,
  assemblyId: string,
  membershipService: MembershipService,
  vcpClient: VCPClient,
): Promise<boolean> {
  const participantId = await membershipService.getParticipantIdOrThrow(userId, assemblyId);
  try {
    const roles = await vcpClient.listRoles(assemblyId);
    return roles.some((r) => r.participantId === participantId && (r.role === "admin" || r.role === "owner"));
  } catch {
    return false;
  }
}
