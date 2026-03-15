import { useState, useRef, useEffect } from "react";
import { Link, useParams, useLocation } from "react-router";
import { useIdentity } from "../hooks/use-identity.js";

export function Header() {
  const { assemblyId } = useParams();
  const { participantName, participantId } = useIdentity();
  const [menuOpen, setMenuOpen] = useState(false);
  const inAssembly = Boolean(assemblyId);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: logo / back + desktop nav */}
          <div className="flex items-center gap-4 sm:gap-6">
            {inAssembly ? (
              <Link to="/" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-sm">V</span>
                </div>
              </Link>
            ) : (
              <Link to="/" className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-sm">V</span>
                </div>
                <span className="font-semibold text-gray-900 hidden sm:inline">Votiverse</span>
              </Link>
            )}
            {/* Desktop nav — hidden on mobile (bottom tabs handle it) */}
            <nav className="hidden lg:flex items-center gap-1">
              {inAssembly ? (
                <AssemblyNavLinks assemblyId={assemblyId!} />
              ) : (
                <GlobalNavLinks />
              )}
            </nav>
          </div>

          {/* Right: identity indicator + menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            {participantId && <IdentityIndicator name={participantName} />}
            {/* Mobile hamburger for secondary items */}
            {inAssembly && (
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
      {menuOpen && inAssembly && (
        <>
          <div
            className="lg:hidden fixed inset-0 top-14 bg-black/20 z-10"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="lg:hidden absolute left-0 right-0 border-t border-gray-100 bg-white px-4 py-3 space-y-1 z-20 shadow-lg">
            <MobileMenuLinks assemblyId={assemblyId!} onNavigate={() => setMenuOpen(false)} />
          </div>
        </>
      )}
    </header>
  );
}

function IdentityIndicator({ name }: { name: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { clearIdentity } = useIdentity();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initial = (name ?? "?")[0].toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-h-[44px] sm:min-h-0 px-1"
        aria-label="Identity menu"
      >
        <div className="w-7 h-7 rounded-full bg-brand/10 text-brand font-semibold text-sm flex items-center justify-center">
          {initial}
        </div>
        <span className="hidden sm:inline text-sm text-gray-700 font-medium max-w-[120px] truncate">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">{name}</p>
            <p className="text-xs text-gray-400">Current identity</p>
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] flex items-center"
          >
            Profile
          </Link>
          <button
            onClick={() => { clearIdentity(); setOpen(false); }}
            className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] flex items-center"
          >
            Switch Identity
          </button>
        </div>
      )}
    </div>
  );
}

/** Bottom tab bar — contextual based on context */
export function BottomTabs() {
  const { assemblyId } = useParams();
  const location = useLocation();
  const inAssembly = Boolean(assemblyId);

  const globalTabs = [
    { to: "/", label: "Dashboard", icon: HomeIcon, exact: true },
    { to: "/assemblies", label: "Assemblies", icon: GridIcon, exact: true },
    { to: "/profile", label: "Profile", icon: UserIcon, exact: true },
  ];

  const assemblyTabs = assemblyId
    ? [
        { to: `/assembly/${assemblyId}`, label: "Overview", icon: HomeIcon, exact: true },
        { to: `/assembly/${assemblyId}/events`, label: "Events", icon: CalendarIcon, exact: false },
        { to: `/assembly/${assemblyId}/delegations`, label: "Delegate", icon: LinkIcon, exact: false },
        { to: `/assembly/${assemblyId}/polls`, label: "Polls", icon: ChartIcon, exact: false },
        { to: `/assembly/${assemblyId}/members`, label: "Members", icon: UsersIcon, exact: false },
      ]
    : [];

  const tabs = inAssembly ? assemblyTabs : globalTabs;

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

function GlobalNavLinks() {
  return (
    <>
      <Link to="/" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
        Dashboard
      </Link>
      <Link to="/assemblies" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
        Assemblies
      </Link>
      <Link to="/profile" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
        Profile
      </Link>
    </>
  );
}

function AssemblyNavLinks({ assemblyId }: { assemblyId: string }) {
  const links = [
    { to: `/assembly/${assemblyId}`, label: "Overview" },
    { to: `/assembly/${assemblyId}/events`, label: "Events" },
    { to: `/assembly/${assemblyId}/delegations`, label: "Delegations" },
    { to: `/assembly/${assemblyId}/polls`, label: "Polls" },
    { to: `/assembly/${assemblyId}/members`, label: "Members" },
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
    { to: `/assembly/${assemblyId}`, label: "Overview" },
    { to: `/assembly/${assemblyId}/events`, label: "Events" },
    { to: `/assembly/${assemblyId}/delegations`, label: "Delegations" },
    { to: `/assembly/${assemblyId}/polls`, label: "Polls" },
    { to: `/assembly/${assemblyId}/members`, label: "Members" },
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

// ---------- Tab bar icons (inline SVGs, 20x20) ----------

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
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

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function UsersIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
