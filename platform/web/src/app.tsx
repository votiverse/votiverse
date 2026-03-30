import { Suspense, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, Outlet, Navigate, useParams, useLocation, useNavigationType } from "react-router";
import { IdentityContext, useIdentityProvider } from "./hooks/use-identity.js";
import { AttentionContext, useAttentionProvider } from "./hooks/use-attention.js";
import { ThemeContext, useThemeProvider } from "./hooks/use-theme.js";
import { Sidebar, MobileHeader, GroupContentHeader, BottomTabs } from "./components/layout.js";
import { ErrorBoundary } from "./components/error-boundary.js";
import { Dashboard } from "./pages/dashboard.js";
import { GroupList } from "./pages/group-list.js";
import { CreateGroup } from "./pages/create-group.js";
import { GroupDashboard } from "./pages/group-dashboard.js";
import { Members } from "./pages/members.js";
import { EventsList } from "./pages/events-list.js";
import { EventDetail } from "./pages/event-detail.js";
import { Delegations } from "./pages/delegates/index.js";
import { Surveys, SurveyDetailPage } from "./pages/surveys.js";
import { Scoring, ScoringDetailPage } from "./pages/scoring.js";
import { Predictions } from "./pages/predictions.js";
import { Notes } from "./pages/notes.js";
import { Proposals, ProposalDetailPage } from "./pages/proposals.js";
import { Candidacies } from "./pages/candidacies.js";
import { CandidacyProfile } from "./pages/candidacy-profile.js";
import { TopicsList } from "./pages/topics-list.js";
import { TopicPage } from "./pages/topic-page.js";
import { Profile } from "./pages/profile.js";
import { ProfileDelegators } from "./pages/profile-delegators.js";
import { ProfileDelegates } from "./pages/profile-delegates.js";
import { ProfileVotes } from "./pages/profile-votes.js";
import { NotificationSettings } from "./pages/notification-settings.js";
import { GroupSettings } from "./pages/group-settings.js";
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

      // Retry scroll restoration as content loads asynchronously.
      // ResizeObserver won't work here — <main> is flex-1 overflow-y-auto
      // so its box size is fixed; only scrollHeight changes.
      let raf: number;
      let attempts = 0;
      const tryRestore = () => {
        el.scrollTo(0, saved);
        if (Math.abs(el.scrollTop - saved) > 5 && attempts < 30) {
          attempts++;
          raf = requestAnimationFrame(tryRestore);
        }
      };
      raf = requestAnimationFrame(tryRestore);

      return () => cancelAnimationFrame(raf);
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

        {/* Group tab bar (desktop only, when inside a group) */}
        <GroupContentHeader />

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

/** Redirect /group/:id → /group/:id/events (Votes is the default tab). */
function GroupRedirect() {
  const { groupId } = useParams();
  return <Navigate to={`/group/${groupId}/events`} replace />;
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
              <Route path="groups" element={<GroupList />} />
              <Route path="groups/new" element={<CreateGroup />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profile/delegators" element={<ProfileDelegators />} />
              <Route path="profile/delegates" element={<ProfileDelegates />} />
              <Route path="profile/votes" element={<ProfileVotes />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="settings/notifications" element={<NotificationSettings />} />
              <Route path="settings/language" element={<Navigate to="/profile?tab=language" replace />} />
              <Route path="settings/appearance" element={<Navigate to="/profile?tab=appearance" replace />} />
              <Route path="group/:groupId" element={<GroupRedirect />} />
              <Route path="group/:groupId/about" element={<GroupDashboard />} />
              <Route path="group/:groupId/settings" element={<GroupSettings />} />
              <Route path="group/:groupId/members" element={<Members />} />
              <Route path="group/:groupId/events" element={<EventsList />} />
              <Route path="group/:groupId/events/:eventId" element={<EventDetail />} />
              <Route path="group/:groupId/delegations" element={<Delegations />} />
              <Route path="group/:groupId/surveys" element={<Surveys />} />
              <Route path="group/:groupId/surveys/:surveyId" element={<SurveyDetailPage />} />
              <Route path="group/:groupId/scoring" element={<Scoring />} />
              <Route path="group/:groupId/scoring/:scoringEventId" element={<ScoringDetailPage />} />
              <Route path="group/:groupId/predictions" element={<Predictions />} />
              <Route path="group/:groupId/notes" element={<Notes />} />
              <Route path="group/:groupId/proposals" element={<Proposals />} />
              <Route path="group/:groupId/proposals/:proposalId" element={<ProposalDetailPage />} />
              <Route path="group/:groupId/candidacies" element={<Candidacies />} />
              <Route path="group/:groupId/candidacies/:candidacyId" element={<CandidacyProfile />} />
              <Route path="group/:groupId/topics" element={<TopicsList />} />
              <Route path="group/:groupId/topics/:topicId" element={<TopicPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AttentionContext>
      {import.meta.env.DEV && <DevClock />}
    </IdentityContext>
    </ThemeContext>
  );
}
