import { Link, useParams } from "react-router";
import { useParticipant } from "../hooks/use-participant.js";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";

export function Header() {
  const { assemblyId } = useParams();
  const { participantName, participantId } = useParticipant();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-sm">V</span>
              </div>
              <span className="font-semibold text-gray-900">Votiverse</span>
            </Link>
            {assemblyId && <AssemblyNav assemblyId={assemblyId} />}
          </div>
          <div className="flex items-center gap-4">
            {assemblyId && <ParticipantSelector assemblyId={assemblyId} />}
            {participantId && (
              <div className="text-sm text-gray-500">
                Acting as <span className="font-medium text-gray-900">{participantName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function AssemblyNav({ assemblyId }: { assemblyId: string }) {
  const links = [
    { to: `/assembly/${assemblyId}`, label: "Dashboard" },
    { to: `/assembly/${assemblyId}/members`, label: "Members" },
    { to: `/assembly/${assemblyId}/events`, label: "Events" },
    { to: `/assembly/${assemblyId}/delegations`, label: "Delegations" },
    { to: `/assembly/${assemblyId}/polls`, label: "Polls" },
    { to: `/assembly/${assemblyId}/awareness`, label: "Awareness" },
  ];

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function ParticipantSelector({ assemblyId }: { assemblyId: string }) {
  const { participantId, setParticipant } = useParticipant();
  const { data } = useApi(() => api.listParticipants(assemblyId), [assemblyId]);

  const participants = data?.participants ?? [];

  return (
    <select
      value={participantId ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        if (!id) {
          setParticipant(null, null);
        } else {
          const p = participants.find((p) => p.id === id);
          setParticipant(id, p?.name ?? null);
        }
      }}
      className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
    >
      <option value="">Select participant...</option>
      {participants.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
