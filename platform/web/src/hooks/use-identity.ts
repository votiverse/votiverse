import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "votiverse_identity";

export interface IdentityMembership {
  assemblyId: string;
  assemblyName: string;
  participantId: string;
}

export interface Identity {
  storeUserId: string;
  participantName: string;
  memberships: IdentityMembership[];
}

export interface IdentityCtx {
  storeUserId: string | null;
  participantName: string | null;
  memberships: IdentityMembership[];
  /** Get the assembly-specific participant ID for the current user. */
  getParticipantId: (assemblyId: string) => string | null;
  setUser: (storeUserId: string, name: string, memberships: IdentityMembership[]) => void;
  clearIdentity: () => void;
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // New format: storeUserId + memberships
    if (parsed.storeUserId && parsed.participantName && parsed.memberships) return parsed;
    // Old format detected — clear it
    return null;
  } catch {
    return null;
  }
}

function saveIdentity(identity: Identity | null) {
  if (identity) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const IdentityContext = createContext<IdentityCtx>({
  storeUserId: null,
  participantName: null,
  memberships: [],
  getParticipantId: () => null,
  setUser: () => {},
  clearIdentity: () => {},
});

export function useIdentityProvider(): IdentityCtx {
  const [identity, setIdentityState] = useState<Identity | null>(loadIdentity);

  const setUser = useCallback((storeUserId: string, name: string, memberships: IdentityMembership[]) => {
    const next: Identity = { storeUserId, participantName: name, memberships };
    setIdentityState(next);
    saveIdentity(next);
  }, []);

  const clearIdentity = useCallback(() => {
    setIdentityState(null);
    saveIdentity(null);
  }, []);

  const getParticipantId = useCallback((assemblyId: string): string | null => {
    if (!identity) return null;
    return identity.memberships.find((m) => m.assemblyId === assemblyId)?.participantId ?? null;
  }, [identity]);

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setIdentityState(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return {
    storeUserId: identity?.storeUserId ?? null,
    participantName: identity?.participantName ?? null,
    memberships: identity?.memberships ?? [],
    getParticipantId,
    setUser,
    clearIdentity,
  };
}

export function useParticipant() {
  return useContext(IdentityContext);
}

export function useIdentity() {
  return useContext(IdentityContext);
}
