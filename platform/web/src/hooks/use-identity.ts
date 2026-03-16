import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "votiverse_identity";

export interface Identity {
  userId: string;
  participantId: string;
  participantName: string;
}

export interface IdentityCtx {
  userId: string | null;
  participantId: string | null;
  participantName: string | null;
  setUser: (userId: string, participantId: string, name: string) => void;
  /** @deprecated Use setUser instead */
  setParticipant: (id: string | null, name: string | null) => void;
  clearIdentity: () => void;
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Support both old format (participantId+participantName) and new (userId+...)
    if (parsed.userId && parsed.participantName) return parsed;
    if (parsed.participantId && parsed.participantName) return parsed;
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
  userId: null,
  participantId: null,
  participantName: null,
  setUser: () => {},
  setParticipant: () => {},
  clearIdentity: () => {},
});

export function useIdentityProvider(): IdentityCtx {
  const [identity, setIdentityState] = useState<Identity | null>(loadIdentity);

  const setUser = useCallback((userId: string, participantId: string, name: string) => {
    const next: Identity = { userId, participantId, participantName: name };
    setIdentityState(next);
    saveIdentity(next);
  }, []);

  const setParticipant = useCallback((id: string | null, name: string | null) => {
    if (id && name) {
      // Legacy path — use participantId as userId fallback
      const next: Identity = { userId: id, participantId: id, participantName: name };
      setIdentityState(next);
      saveIdentity(next);
    } else {
      setIdentityState(null);
      saveIdentity(null);
    }
  }, []);

  const clearIdentity = useCallback(() => {
    setIdentityState(null);
    saveIdentity(null);
  }, []);

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
    userId: identity?.userId ?? null,
    participantId: identity?.participantId ?? null,
    participantName: identity?.participantName ?? null,
    setUser,
    setParticipant,
    clearIdentity,
  };
}

/** Backward-compatible hook — same shape as the old useParticipant */
export function useParticipant() {
  return useContext(IdentityContext);
}

export function useIdentity() {
  return useContext(IdentityContext);
}
