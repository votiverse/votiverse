import { useState, useRef, useEffect } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import { useAssemblyTabs } from "../hooks/use-assembly-tabs.js";
import { Avatar } from "./avatar.js";
import { NotificationBell } from "./notification-bell.js";
import { ThemeToggle } from "./theme-toggle.js";
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
} from "lucide-react";

export function Header() {
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
    <header className="bg-surface-raised border-b border-border-default sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: logo / back + desktop nav */}
          <div className="flex items-center gap-4 sm:gap-6">
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
                  className="text-sm font-medium text-text-primary hover:text-accent-text truncate max-w-[55vw] sm:max-w-[280px] lg:max-w-[320px] ml-1"
                >
                  {assembly?.name ?? t("loading")}
                </Link>
              </div>
            ) : (
              <Link to="/" className="flex items-center gap-2 shrink-0">
                <img src="/logo.svg" alt="Votiverse" className="w-16 h-16" />
                <span className="font-semibold text-text-primary hidden sm:inline">Votiverse</span>
              </Link>
            )}
            {/* Desktop nav — hidden on mobile (bottom tabs handle it), hidden when not logged in */}
            {storeUserId && (
              <nav className="hidden lg:flex items-center gap-1">
                {inAssembly ? (
                  <AssemblyNavLinks assemblyId={assemblyId!} />
                ) : (
                  <GlobalNavLinks />
                )}
              </nav>
            )}
          </div>

          {/* Right: notifications + identity + menu */}
          <div className="flex items-center gap-1 sm:gap-2">
            {storeUserId && <NotificationBell />}
            {storeUserId && <IdentityIndicator name={participantName} />}
            {/* Mobile hamburger for secondary items */}
            {storeUserId && inAssembly && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="lg:hidden p-2 -mr-2 text-text-muted hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
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
            className="lg:hidden fixed inset-0 top-14 bg-[var(--overlay-backdrop)] z-10"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="lg:hidden absolute left-0 right-0 border-t border-border-subtle bg-surface-overlay px-4 py-3 space-y-1 z-20 shadow-lg">
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

/** Bottom tab bar — contextual based on context. Hidden when not logged in. */
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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-raised border-t border-border-default z-20 safe-bottom">
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

// ---------- Desktop nav links with icons ----------

function GlobalNavLinks() {
  const { t } = useTranslation();
  const items: Array<{ to: string; label: string; Icon: typeof Home }> = [
    { to: "/", label: t("nav.home"), Icon: Home },
    { to: "/assemblies", label: t("nav.myGroups"), Icon: LayoutGrid },
    { to: "/profile", label: t("nav.me"), Icon: User },
  ];
  return (
    <>
      {items.map(({ to, label, Icon }) => (
        <Link key={to} to={to} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-interactive-active rounded-md transition-colors">
          <Icon size={15} strokeWidth={1.5} />
          {label}
        </Link>
      ))}
    </>
  );
}

function AssemblyNavLinks({ assemblyId }: { assemblyId: string }) {
  const { assembly } = useAssembly(assemblyId);
  const tabs = useAssemblyTabs(assemblyId, assembly?.config);

  return (
    <>
      {tabs.map((tab) => {
        const Icon = NAV_ICONS[tab.key];
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-interactive-active rounded-md transition-colors"
          >
            {Icon && <Icon size={15} strokeWidth={1.5} />}
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}

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

// ---------- Icon mapping for desktop nav ----------

const NAV_ICONS: Record<string, typeof Home> = {
  Votes: Vote,
  Delegates: Users,
  Candidates: UserCheck,
  Surveys: BarChart3,
  Notes: MessageSquareText,
  Topics: Tags,
};

// ---------- Tab bar icon wrappers (Lucide, 20x20) ----------

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
