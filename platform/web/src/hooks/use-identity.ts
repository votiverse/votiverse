import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "votiverse_identity";

export interface Identity {
  participantId: string;
  participantName: string;
}

export interface IdentityCtx {
  participantId: string | null;
  participantName: string | null;
  setParticipant: (id: string | null, name: string | null) => void;
  clearIdentity: () => void;
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
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
  participantId: null,
  participantName: null,
  setParticipant: () => {},
  clearIdentity: () => {},
});

export function useIdentityProvider(): IdentityCtx {
  const [identity, setIdentityState] = useState<Identity | null>(loadIdentity);

  const setParticipant = useCallback((id: string | null, name: string | null) => {
    if (id && name) {
      const next = { participantId: id, participantName: name };
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
    participantId: identity?.participantId ?? null,
    participantName: identity?.participantName ?? null,
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
