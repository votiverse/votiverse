/**
 * Identity hook — manages user authentication state.
 *
 * On mount, checks for an existing access token and fetches /me.
 * Provides login/logout/register functions and membership lookup.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as auth from "../api/auth.js";
import { registerForPushNotifications } from "../lib/push.js";
import { registerDevice } from "../api/client.js";
import { isTauri } from "../lib/tauri.js";

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
  /** User handle (@username). */
  handle: string | null;
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
  register: (email: string, password: string, name: string, handle?: string) => Promise<void>;
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
  handle: null,
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
  handle: string | null;
  email: string;
  memberships: IdentityMembership[];
}

/** Register for push notifications and send device token to backend. Fire-and-forget. */
function tryPushRegistration(): void {
  if (!isTauri) return;
  void (async () => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" as const : "android" as const;
        await registerDevice(platform, token);
      }
    } catch (err) {
      console.warn("Push registration failed:", err);
    }
  })();
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
            handle: me.handle ?? null,
            email: me.email,
            memberships: me.memberships.map((m) => ({
              assemblyId: m.assemblyId,
              assemblyName: m.assemblyName,
              participantId: m.participantId,
            })),
          });
          tryPushRegistration();
        }
      } catch {
        // No valid session
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for auth-expired events (fired by API client when refresh fails)
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("votiverse:auth-expired", handler);
    return () => window.removeEventListener("votiverse:auth-expired", handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: authUser } = await auth.login(email, password);
    // Fetch full profile with memberships
    const me = await auth.getMe();
    if (me) {
      setUser({
        id: me.id,
        name: me.name,
        handle: me.handle ?? null,
        email: me.email,
        memberships: me.memberships.map((m) => ({
          assemblyId: m.assemblyId,
          assemblyName: m.assemblyName,
          participantId: m.participantId,
        })),
      });
    } else {
      setUser({ id: authUser.id, name: authUser.name, handle: authUser.handle ?? null, email: authUser.email, memberships: [] });
    }
    tryPushRegistration();
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, handle?: string) => {
    const { user: authUser } = await auth.register(email, password, name, handle);
    setUser({ id: authUser.id, name: authUser.name, handle: authUser.handle ?? null, email: authUser.email, memberships: [] });
    tryPushRegistration();
  }, []);

  const doLogout = useCallback(async () => {
    await auth.logout();
    // Hard navigation to /login — avoids React state issues during the
    // unauthenticated re-render cascade. A clean page load is the right
    // UX after sign-out anyway (no stale data, fresh i18n bootstrap).
    window.location.href = "/login";
  }, []);

  const getParticipantId = useCallback((assemblyId: string): string | null => {
    if (!user) return null;
    return user.memberships.find((m) => m.assemblyId === assemblyId)?.participantId ?? null;
  }, [user]);

  return {
    storeUserId: user?.id ?? null,
    participantName: user?.name ?? null,
    handle: user?.handle ?? null,
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
