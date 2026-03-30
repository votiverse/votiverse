/**
 * Shared admin/owner role check for group-scoped authorization.
 *
 * Resolves the user's role from group_members and checks for admin/owner.
 * Used by proxy, invitations, and any route that gates on admin status.
 */

import type { GroupService } from "../services/group-service.js";

/**
 * Check if a user is an admin or owner of a group.
 * Uses the backend-owned group_members.role (no VCP round-trip).
 */
export async function isAdminOfGroup(
  userId: string,
  groupId: string,
  groupService: GroupService,
): Promise<boolean> {
  const member = await groupService.getMember(groupId, userId);
  if (!member) return false;
  return member.role === "admin" || member.role === "owner";
}
