import { createContext, useContext } from "react";

export interface ParticipantCtx {
  participantId: string | null;
  participantName: string | null;
  setParticipant: (id: string | null, name: string | null) => void;
}

export const ParticipantContext = createContext<ParticipantCtx>({
  participantId: null,
  participantName: null,
  setParticipant: () => {},
});

export function useParticipant() {
  return useContext(ParticipantContext);
}
