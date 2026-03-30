/**
 * Assembly roles tests — REMOVED.
 *
 * Roles are now enforced by the backend (group_members table).
 * The VCP no longer stores or manages assembly_roles.
 * RoleGranted/RoleRevoked events remain in the event log as audit trail.
 *
 * Role management tests now live in the backend test suite.
 */

import { describe, it } from "vitest";

describe("Assembly roles (removed from VCP)", () => {
  it.skip("roles are now managed by the backend", () => {
    // Placeholder — role tests moved to platform/backend/test/
  });
});
