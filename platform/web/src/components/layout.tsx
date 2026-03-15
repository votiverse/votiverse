import { useState } from "react";
import { Link, useParams, useLocation } from "react-router";
import { useParticipant } from "../hooks/use-participant.js";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";

export function Header() {
  const { assemblyId } = useParams();
  const { participantName, participantId } = useParticipant();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: logo + desktop nav */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-sm">V</span>
              </div>
              <span className="font-semibold text-gray-900 hidden sm:inline">Votiverse</span>
            </Link>
            {/* Desktop nav — hidden on mobile (bottom tabs handle it) */}
            {assemblyId && (
              <nav className="hidden lg:flex items-center gap-1">
                <AssemblyNavLinks assemblyId={assemblyId} />
              </nav>
            )}
          </div>

          {/* Right: participant selector + menu */}
          <div className="flex items-center gap-2 sm:gap-4">
            {assemblyId && <ParticipantSelector assemblyId={assemblyId} />}
            {participantId && (
              <div className="hidden sm:block text-sm text-gray-500">
                Acting as <span className="font-medium text-gray-900">{participantName}</span>
              </div>
            )}
            {/* Mobile hamburger for secondary items (Members, settings) */}
            {assemblyId && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="lg:hidden p-2 -mr-2 text-gray-500 hover:text-gray-900 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu with backdrop */}
      {menuOpen && assemblyId && (
        <>
          <div
            className="lg:hidden fixed inset-0 top-14 bg-black/20 z-10"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="lg:hidden absolute left-0 right-0 border-t border-gray-100 bg-white px-4 py-3 space-y-1 z-20 shadow-lg">
            <MobileMenuLinks assemblyId={assemblyId} onNavigate={() => setMenuOpen(false)} />
          </div>
        </>
      )}
    </header>
  );
}

/** Bottom tab bar — visible only on mobile when inside an assembly */
export function BottomTabs() {
  const { assemblyId } = useParams();
  const location = useLocation();

  if (!assemblyId) return null;

  const tabs = [
    { to: `/assembly/${assemblyId}`, label: "Home", icon: HomeIcon, exact: true },
    { to: `/assembly/${assemblyId}/events`, label: "Events", icon: CalendarIcon, exact: false },
    { to: `/assembly/${assemblyId}/delegations`, label: "Delegate", icon: LinkIcon, exact: false },
    { to: `/assembly/${assemblyId}/polls`, label: "Polls", icon: ChartIcon, exact: false },
    { to: `/assembly/${assemblyId}/awareness`, label: "Aware", icon: EyeIcon, exact: false },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20 safe-bottom">
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = tab.exact
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] text-xs transition-colors ${
                active ? "text-brand font-medium" : "text-gray-500"
              }`}
            >
              <tab.icon active={active} />
              <span className="mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AssemblyNavLinks({ assemblyId }: { assemblyId: string }) {
  const links = [
    { to: `/assembly/${assemblyId}`, label: "Dashboard" },
    { to: `/assembly/${assemblyId}/members`, label: "Members" },
    { to: `/assembly/${assemblyId}/events`, label: "Events" },
    { to: `/assembly/${assemblyId}/delegations`, label: "Delegations" },
    { to: `/assembly/${assemblyId}/polls`, label: "Polls" },
    { to: `/assembly/${assemblyId}/awareness`, label: "Awareness" },
  ];

  return (
    <>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

function MobileMenuLinks({ assemblyId, onNavigate }: { assemblyId: string; onNavigate: () => void }) {
  const links = [
    { to: `/assembly/${assemblyId}`, label: "Dashboard" },
    { to: `/assembly/${assemblyId}/members`, label: "Members" },
    { to: `/assembly/${assemblyId}/events`, label: "Events" },
    { to: `/assembly/${assemblyId}/delegations`, label: "Delegations" },
    { to: `/assembly/${assemblyId}/polls`, label: "Polls" },
    { to: `/assembly/${assemblyId}/awareness`, label: "Awareness" },
  ];
  return (
    <>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          onClick={onNavigate}
          className="block px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md min-h-[44px] flex items-center"
        >
          {link.label}
        </Link>
      ))}
    </>
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
      className="text-sm border border-gray-300 rounded-md px-2 py-2 min-h-[44px] sm:min-h-[36px] sm:py-1.5 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none max-w-[140px] sm:max-w-none"
      aria-label="Select participant"
    >
      <option value="">{participantId ? "Switch..." : "Participant..."}</option>
      {participants.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// ---------- Tab bar icons (inline SVGs, 20x20) ----------

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={active ? "currentColor" : "currentColor"} strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function LinkIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.914-3.814a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.25 9.879" />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function EyeIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
