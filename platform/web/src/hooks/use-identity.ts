/**
 * Identity hook — manages user authentication state.
 *
 * On mount, checks for an existing access token and fetches /me.
 * Provides login/logout/register functions and membership lookup.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as auth from "../api/auth.js";

export interface IdentityMembership {
  assemblyId: string;
  assemblyName: string;
  participantId: string;
}

export interface IdentityCtx {
  /** User ID (null if not logged in). */
  storeUserId: string | null;
  /** User display name. */
  participantName: string | null;
  /** User email. */
  email: string | null;
  /** Assembly memberships. */
  memberships: IdentityMembership[];
  /** Get the assembly-specific participant ID for the current user. */
  getParticipantId: (assemblyId: string) => string | null;
  /** Whether the initial auth check is in progress. */
  loading: boolean;
  /** Login with email/password. */
  login: (email: string, password: string) => Promise<void>;
  /** Register a new account. */
  register: (email: string, password: string, name: string) => Promise<void>;
  /** Logout and clear tokens. */
  logout: () => Promise<void>;
  /** Legacy alias for logout. */
  clearIdentity: () => void;
  /** Legacy alias — no-op in new auth system. */
  setUser: (storeUserId: string, name: string, memberships: IdentityMembership[]) => void;
}

export const IdentityContext = createContext<IdentityCtx>({
  storeUserId: null,
  participantName: null,
  email: null,
  memberships: [],
  getParticipantId: () => null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  clearIdentity: () => {},
  setUser: () => {},
});

interface UserState {
  id: string;
  name: string;
  email: string;
  memberships: IdentityMembership[];
}

export function useIdentityProvider(): IdentityCtx {
  const [user, setUser] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check for existing session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await auth.getMe();
        if (!cancelled && me) {
          setUser({
            id: me.id,
            name: me.name,
            email: me.email,
            memberships: me.memberships.map((m) => ({
              assemblyId: m.assemblyId,
              assemblyName: m.assemblyName,
              participantId: m.participantId,
            })),
          });
        }
      } catch {
        // No valid session
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: authUser } = await auth.login(email, password);
    // Fetch full profile with memberships
    const me = await auth.getMe();
    if (me) {
      setUser({
        id: me.id,
        name: me.name,
        email: me.email,
        memberships: me.memberships.map((m) => ({
          assemblyId: m.assemblyId,
          assemblyName: m.assemblyName,
          participantId: m.participantId,
        })),
      });
    } else {
      setUser({ id: authUser.id, name: authUser.name, email: authUser.email, memberships: [] });
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { user: authUser } = await auth.register(email, password, name);
    setUser({ id: authUser.id, name: authUser.name, email: authUser.email, memberships: [] });
  }, []);

  const doLogout = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  const getParticipantId = useCallback((assemblyId: string): string | null => {
    if (!user) return null;
    return user.memberships.find((m) => m.assemblyId === assemblyId)?.participantId ?? null;
  }, [user]);

  return {
    storeUserId: user?.id ?? null,
    participantName: user?.name ?? null,
    email: user?.email ?? null,
    memberships: user?.memberships ?? [],
    getParticipantId,
    loading,
    login,
    register,
    logout: doLogout,
    clearIdentity: () => { void doLogout(); },
    setUser: () => {}, // Legacy no-op
  };
}

export function useParticipant() {
  return useContext(IdentityContext);
}

export function useIdentity() {
  return useContext(IdentityContext);
}
