import { useState, useRef, useEffect } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import { useAssemblyTabs } from "../hooks/use-assembly-tabs.js";
import { useAttention } from "../hooks/use-attention.js";
import { Avatar } from "./avatar.js";
import { NotificationBell } from "./notification-bell.js";
import { ThemeToggle } from "./theme-toggle.js";
import { BadgeDot } from "./ui.js";
import {
  Home,
  Vote,
  Users,
  UserCheck,
  BarChart3,
  MessageSquareText,
  LayoutGrid,
  User,
  ChevronLeft,
  Menu,
  X,
  Tags,
  Bell,
  LogOut,
  Settings,
  Scale,
} from "lucide-react";

// ============================================================================
// Desktop Sidebar (lg and above)
// ============================================================================

export function Sidebar() {
  const { assemblyId } = useParams();
  const location = useLocation();
  const { t } = useTranslation();
  const { storeUserId, participantName, handle, memberships, clearIdentity } = useIdentity();
  const { pendingByAssembly, totalPending, totalPendingSurveys } = useAttention();

  if (!storeUserId) return null;

  const totalPendingAll = totalPending + totalPendingSurveys;

  return (
    <aside className="w-64 bg-surface-raised border-r border-border-default hidden lg:flex flex-col z-10 shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-6 border-b border-border-subtle shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
            <Scale size={14} className="text-text-on-accent" />
          </div>
          <span className="font-bold font-display text-lg text-text-primary tracking-tight">Votiverse</span>
        </Link>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {/* Personal section */}
        <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest px-3 mb-2">{t("nav.personal")}</div>
        <SidebarLink to="/" icon={Home} label={t("nav.home")} active={location.pathname === "/"} badge={totalPendingAll} />
        <SidebarLink to="/notifications" icon={Bell} label={t("nav.notifications")} active={location.pathname.startsWith("/notifications")} />

        {/* Assemblies section */}
        {memberships.length > 0 && (
          <>
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest px-3 mb-2 mt-6">{t("nav.myGroups")}</div>
            {memberships.map((m) => {
              const isActive = assemblyId === m.assemblyId;
              const pending = pendingByAssembly[m.assemblyId] ?? 0;
              return (
                <Link
                  key={m.assemblyId}
                  to={`/assembly/${m.assemblyId}/events`}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent-subtle text-accent-text"
                      : "text-text-secondary hover:bg-surface-sunken"
                  }`}
                >
                  <div className="w-6 h-6 rounded-md flex items-center justify-center bg-surface-sunken border border-border-default text-[10px] font-bold text-text-muted shrink-0">
                    {m.assemblyName[0]}
                  </div>
                  <span className="truncate flex-1">{m.assemblyName}</span>
                  {pending > 0 && <BadgeDot count={pending} />}
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* User footer */}
      <div className="p-3 border-t border-border-subtle shrink-0">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={participantName ?? "?"} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">{participantName}</div>
            {handle && <div className="text-xs text-text-tertiary truncate">@{handle}</div>}
          </div>
          <Link
            to="/profile"
            className="p-1.5 text-text-tertiary hover:text-text-secondary transition-colors rounded-lg hover:bg-interactive-active"
            aria-label={t("nav.me")}
          >
            <Settings size={14} />
          </Link>
          <button
            onClick={() => clearIdentity()}
            className="p-1.5 text-text-tertiary hover:text-error-text transition-colors rounded-lg hover:bg-error-subtle"
            aria-label={t("nav.logout")}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label, active, badge = 0 }: {
  to: string;
  icon: typeof Home;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
        active
          ? "bg-accent-subtle text-accent-text"
          : "text-text-secondary hover:bg-surface-sunken"
      }`}
    >
      <Icon size={18} />
      <span className="flex-1">{label}</span>
      {badge > 0 && <BadgeDot count={badge} />}
    </Link>
  );
}

// ============================================================================
// Assembly Content Header (desktop only — sticky tab bar within content area)
// ============================================================================

export function AssemblyContentHeader() {
  const { assemblyId } = useParams();
  const { assembly } = useAssembly(assemblyId);
  const tabs = useAssemblyTabs(assemblyId, assembly?.config);
  const location = useLocation();

  if (!assemblyId) return null;

  return (
    <div className="hidden lg:block sticky top-0 z-10 bg-surface border-b border-border-subtle">
      <div className="max-w-5xl mx-auto px-6 lg:px-8">
        {/* Assembly name */}
        <div className="pt-4 pb-2">
          <Link
            to={`/assembly/${assemblyId}`}
            className="text-lg font-bold font-display text-text-primary hover:text-accent-text transition-colors"
          >
            {assembly?.name ?? "…"}
          </Link>
        </div>
        {/* Scrollable tab bar */}
        <div className="flex overflow-x-auto hide-scrollbar gap-1">
          {tabs.map((tab) => {
            const active = location.pathname.startsWith(tab.to);
            const Icon = NAV_ICONS[tab.key];
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex items-center gap-1.5 px-3 pb-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-accent text-accent-text"
                    : "border-transparent text-text-muted hover:text-text-primary hover:border-border-strong"
                }`}
              >
                {Icon && <Icon size={15} strokeWidth={1.5} />}
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mobile Header (below lg)
// ============================================================================

export function MobileHeader() {
  const { assemblyId } = useParams();
  const { participantName, storeUserId } = useIdentity();
  const { assembly } = useAssembly(assemblyId);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const inAssembly = Boolean(assemblyId);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  return (
    <header className="lg:hidden bg-surface-raised/90 backdrop-blur-md border-b border-border-default sticky top-0 z-20">
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: logo / back */}
          <div className="flex items-center gap-4">
            {inAssembly ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleBack}
                  className="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
                  aria-label={t("nav.goBack")}
                >
                  <ChevronLeft size={18} strokeWidth={2} />
                </button>
                <Link
                  to="/"
                  className="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
                  aria-label={t("nav.goHome")}
                >
                  <Home size={16} strokeWidth={2} />
                </Link>
                <Link
                  to={`/assembly/${assemblyId}`}
                  className="text-sm font-medium text-text-primary hover:text-accent-text truncate max-w-[55vw] sm:max-w-[280px] ml-1"
                >
                  {assembly?.name ?? t("loading")}
                </Link>
              </div>
            ) : (
              <Link to="/" className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
                  <Scale size={14} className="text-text-on-accent" />
                </div>
                <span className="font-bold font-display text-text-primary tracking-tight">Votiverse</span>
              </Link>
            )}
          </div>

          {/* Right: notifications + identity + menu */}
          <div className="flex items-center gap-1 sm:gap-2">
            {storeUserId && <NotificationBell />}
            {storeUserId && <IdentityIndicator name={participantName} />}
            {storeUserId && inAssembly && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 -mr-2 text-text-muted hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu with backdrop */}
      {menuOpen && inAssembly && (
        <>
          <div
            className="fixed inset-0 top-14 bg-[var(--overlay-backdrop)] z-10"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 right-0 border-t border-border-subtle bg-surface-overlay px-4 py-3 space-y-1 z-20 shadow-lg">
            <MobileMenuLinks assemblyId={assemblyId!} onNavigate={() => setMenuOpen(false)} />
          </div>
        </>
      )}
    </header>
  );
}

// ============================================================================
// Identity Indicator (avatar dropdown — used in mobile header)
// ============================================================================

function IdentityIndicator({ name }: { name: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { clearIdentity, handle } = useIdentity();
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-h-[44px] sm:min-h-0 px-1 cursor-pointer"
        aria-label="Identity menu"
      >
        <Avatar name={name ?? "?"} size="sm" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-surface-overlay border border-border-default rounded-lg shadow-lg z-30 py-1">
          <div className="px-3 py-2 border-b border-border-subtle">
            <p className="text-sm font-medium text-text-primary">{name}</p>
            {handle && <p className="text-xs text-text-tertiary truncate">@{handle}</p>}
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover min-h-[44px] flex items-center"
          >
            {t("nav.me")}
          </Link>
          <Link
            to="/profile/delegators"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover min-h-[44px] flex items-center"
          >
            {t("nav.delegators")}
          </Link>
          <Link
            to="/settings/notifications"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover min-h-[44px] flex items-center"
          >
            {t("nav.notifications")}
          </Link>
          <Link
            to="/settings/language"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover min-h-[44px] flex items-center"
          >
            {t("nav.language")}
          </Link>
          <Link
            to="/settings/appearance"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover min-h-[44px] flex items-center"
          >
            {t("nav.appearance")}
          </Link>
          <div className="px-3 py-2 border-t border-border-subtle">
            <ThemeToggle />
          </div>
          <button
            onClick={() => { clearIdentity(); setOpen(false); }}
            className="w-full text-left px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover min-h-[44px] flex items-center"
          >
            {t("nav.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Bottom Tab Bar (mobile only — contextual based on current route)
// ============================================================================

export function BottomTabs() {
  const { assemblyId } = useParams();
  const location = useLocation();
  const { storeUserId } = useIdentity();
  const { assembly } = useAssembly(assemblyId);
  const { t } = useTranslation();
  const inAssembly = Boolean(assemblyId);

  const globalTabs = [
    { to: "/", key: "Home", label: t("nav.home"), icon: TabHome, exact: true },
    { to: "/assemblies", key: "MyGroups", label: t("nav.myGroups"), icon: TabGrid, exact: true },
    { to: "/profile", key: "Me", label: t("nav.me"), icon: TabUser, exact: true },
  ];

  const assemblyTabDefs = useAssemblyTabs(assemblyId, assembly?.config);

  // Must be after all hooks
  if (!storeUserId) return null;
  const assemblyTabs = assemblyTabDefs.map((tab) => ({
    ...tab,
    icon: TAB_ICONS[tab.key] ?? TabHome,
    exact: false,
  }));

  const tabs = inAssembly ? assemblyTabs : globalTabs;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-raised/95 backdrop-blur-xl border-t border-border-default z-20 safe-bottom">
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
                active ? "text-accent-text font-medium" : "text-text-muted"
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

// ============================================================================
// Mobile menu links (hamburger dropdown when in assembly)
// ============================================================================

function MobileMenuLinks({ assemblyId, onNavigate }: { assemblyId: string; onNavigate: () => void }) {
  const { assembly } = useAssembly(assemblyId);
  const tabs = useAssemblyTabs(assemblyId, assembly?.config);

  return (
    <>
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          onClick={onNavigate}
          className="block px-3 py-2.5 text-sm text-text-secondary hover:bg-interactive-hover rounded-md min-h-[44px] flex items-center"
        >
          {tab.label}
        </Link>
      ))}
    </>
  );
}

// ============================================================================
// Icon mappings
// ============================================================================

const NAV_ICONS: Record<string, typeof Home> = {
  Votes: Vote,
  Delegates: Users,
  Candidates: UserCheck,
  Surveys: BarChart3,
  Notes: MessageSquareText,
  Topics: Tags,
};

const TAB_ICONS: Record<string, (props: { active: boolean }) => React.JSX.Element> = {
  Votes: TabVote,
  Delegates: TabUsers,
  Candidates: TabCandidates,
  Surveys: TabChart,
  Notes: TabNotes,
  Topics: TabTopics,
};

function TabHome({ active }: { active: boolean }) {
  return <Home size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabVote({ active }: { active: boolean }) {
  return <Vote size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabUsers({ active }: { active: boolean }) {
  return <Users size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabChart({ active }: { active: boolean }) {
  return <BarChart3 size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabCandidates({ active }: { active: boolean }) {
  return <UserCheck size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabNotes({ active }: { active: boolean }) {
  return <MessageSquareText size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabTopics({ active }: { active: boolean }) {
  return <Tags size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabGrid({ active }: { active: boolean }) {
  return <LayoutGrid size={20} strokeWidth={active ? 2.5 : 1.5} />;
}

function TabUser({ active }: { active: boolean }) {
  return <User size={20} strokeWidth={active ? 2.5 : 1.5} />;
}
