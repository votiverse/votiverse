import { Suspense, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, Outlet, Navigate, useParams, useLocation, useNavigationType } from "react-router";
import { IdentityContext, useIdentityProvider } from "./hooks/use-identity.js";
import { AttentionContext, useAttentionProvider } from "./hooks/use-attention.js";
import { ThemeContext, useThemeProvider } from "./hooks/use-theme.js";
import { Sidebar, MobileHeader, AssemblyContentHeader, BottomTabs } from "./components/layout.js";
import { ErrorBoundary } from "./components/error-boundary.js";
import { Dashboard } from "./pages/dashboard.js";
import { AssemblyList } from "./pages/assembly-list.js";
import { CreateAssembly } from "./pages/create-assembly.js";
import { AssemblyDashboard } from "./pages/assembly-dashboard.js";
import { Members } from "./pages/members.js";
import { EventsList } from "./pages/events-list.js";
import { EventDetail } from "./pages/event-detail.js";
import { Delegations } from "./pages/delegates/index.js";
import { Surveys, SurveyDetailPage } from "./pages/surveys.js";
import { Predictions } from "./pages/predictions.js";
import { Notes } from "./pages/notes.js";
import { Proposals } from "./pages/proposals.js";
import { Candidacies } from "./pages/candidacies.js";
import { CandidacyProfile } from "./pages/candidacy-profile.js";
import { TopicsList } from "./pages/topics-list.js";
import { TopicPage } from "./pages/topic-page.js";
import { Profile } from "./pages/profile.js";
import { ProfileDelegators } from "./pages/profile-delegators.js";
import { ProfileDelegates } from "./pages/profile-delegates.js";
import { ProfileVotes } from "./pages/profile-votes.js";
import { NotificationSettings } from "./pages/notification-settings.js";
import { Notifications } from "./pages/notifications.js";
import { InvitePage } from "./pages/invite.js";
import { LoginPage } from "./pages/login.js";
import { DevClock } from "./components/dev-clock.js";

/** In-memory scroll positions keyed by React Router's location.key. */
const scrollPositions = new Map<string, number>();

function Layout() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);
  const locationKeyRef = useRef(location.key);

  // Continuously save scroll position for the current location
  const handleScroll = useCallback(() => {
    if (mainRef.current) {
      scrollPositions.set(locationKeyRef.current, mainRef.current.scrollTop);
    }
  }, []);

  // Attach/detach scroll listener
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // On navigation: restore scroll on POP, reset on PUSH/REPLACE
  useEffect(() => {
    locationKeyRef.current = location.key;
    const el = mainRef.current;
    if (!el) return;

    if (navigationType === "POP") {
      const saved = scrollPositions.get(location.key);
      if (!saved) return;

      // Restore immediately
      el.scrollTo(0, saved);

      // Content loads async — retry on each resize until position sticks
      const observer = new ResizeObserver(() => {
        if (Math.abs(el.scrollTop - saved) > 5) {
          el.scrollTo(0, saved);
        } else {
          observer.disconnect();
        }
      });
      observer.observe(el);

      // Stop watching after 3s regardless
      const timeout = setTimeout(() => observer.disconnect(), 3000);
      return () => { observer.disconnect(); clearTimeout(timeout); };
    } else {
      el.scrollTo(0, 0);
    }
  }, [location.key, navigationType]);

  return (
    <div className="flex h-screen bg-surface">
      {/* Desktop sidebar (lg and above) */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header (below lg) */}
        <MobileHeader />

        {/* Assembly tab bar (desktop only, when inside an assembly) */}
        <AssemblyContentHeader />

        {/* Scrollable content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto py-6 px-4 sm:py-8 sm:px-6 lg:px-8 pb-20 lg:pb-8 animate-page-in">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Mobile bottom tabs (below lg) */}
        <BottomTabs />
      </div>
    </div>
  );
}

/** Redirect /assembly/:id → /assembly/:id/events (Votes is the default tab). */
function AssemblyRedirect() {
  const { assemblyId } = useParams();
  return <Navigate to={`/assembly/${assemblyId}/events`} replace />;
}

export function App() {
  const theme = useThemeProvider();
  const identity = useIdentityProvider();
  const attention = useAttentionProvider(
    identity.loading ? null : identity.memberships,
  );

  return (
    <ThemeContext value={theme}>
    <IdentityContext value={identity}>
      <AttentionContext value={attention}>
        <BrowserRouter>
          <Routes>
            {/* Login page — outside Layout (no header/tabs). Suspense needed
                because the auth i18n namespace may not be preloaded yet. */}
            <Route path="login" element={<Suspense><LoginPage /></Suspense>} />

            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="invite/:token" element={<InvitePage />} />
              <Route path="assemblies" element={<AssemblyList />} />
              <Route path="assemblies/new" element={<CreateAssembly />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profile/delegators" element={<ProfileDelegators />} />
              <Route path="profile/delegates" element={<ProfileDelegates />} />
              <Route path="profile/votes" element={<ProfileVotes />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="settings/notifications" element={<NotificationSettings />} />
              <Route path="settings/language" element={<Navigate to="/profile?tab=language" replace />} />
              <Route path="settings/appearance" element={<Navigate to="/profile?tab=appearance" replace />} />
              <Route path="assembly/:assemblyId" element={<AssemblyRedirect />} />
              <Route path="assembly/:assemblyId/about" element={<AssemblyDashboard />} />
              <Route path="assembly/:assemblyId/members" element={<Members />} />
              <Route path="assembly/:assemblyId/events" element={<EventsList />} />
              <Route path="assembly/:assemblyId/events/:eventId" element={<EventDetail />} />
              <Route path="assembly/:assemblyId/delegations" element={<Delegations />} />
              <Route path="assembly/:assemblyId/surveys" element={<Surveys />} />
              <Route path="assembly/:assemblyId/surveys/:surveyId" element={<SurveyDetailPage />} />
              <Route path="assembly/:assemblyId/predictions" element={<Predictions />} />
              <Route path="assembly/:assemblyId/notes" element={<Notes />} />
              <Route path="assembly/:assemblyId/proposals" element={<Proposals />} />
              <Route path="assembly/:assemblyId/candidacies" element={<Candidacies />} />
              <Route path="assembly/:assemblyId/candidacies/:candidacyId" element={<CandidacyProfile />} />
              <Route path="assembly/:assemblyId/topics" element={<TopicsList />} />
              <Route path="assembly/:assemblyId/topics/:topicId" element={<TopicPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AttentionContext>
      {import.meta.env.DEV && <DevClock />}
    </IdentityContext>
    </ThemeContext>
  );
}
