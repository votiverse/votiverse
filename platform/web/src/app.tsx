import { BrowserRouter, Routes, Route, Outlet } from "react-router";
import { IdentityContext, useIdentityProvider } from "./hooks/use-identity.js";
import { AttentionContext, useAttentionProvider } from "./hooks/use-attention.js";
import { Header, BottomTabs } from "./components/layout.js";
import { ErrorBoundary } from "./components/error-boundary.js";
import { Dashboard } from "./pages/dashboard.js";
import { AssemblyList } from "./pages/assembly-list.js";
import { AssemblyDashboard } from "./pages/assembly-dashboard.js";
import { Members } from "./pages/members.js";
import { EventsList } from "./pages/events-list.js";
import { EventDetail } from "./pages/event-detail.js";
import { Delegations } from "./pages/delegations.js";
import { Polls } from "./pages/polls.js";
import { Predictions } from "./pages/predictions.js";
import { Profile } from "./pages/profile.js";
import { ProfileDelegators } from "./pages/profile-delegators.js";
import { ProfileDelegates } from "./pages/profile-delegates.js";
import { ProfileVotes } from "./pages/profile-votes.js";

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="py-6 px-4 sm:py-8 sm:px-6 lg:px-8 pb-20 lg:pb-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomTabs />
    </div>
  );
}

export function App() {
  const identity = useIdentityProvider();
  const attention = useAttentionProvider(identity.userId);

  return (
    <IdentityContext value={identity}>
      <AttentionContext value={attention}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="assemblies" element={<AssemblyList />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profile/delegators" element={<ProfileDelegators />} />
              <Route path="profile/delegates" element={<ProfileDelegates />} />
              <Route path="profile/votes" element={<ProfileVotes />} />
              <Route path="assembly/:assemblyId" element={<AssemblyDashboard />} />
              <Route path="assembly/:assemblyId/members" element={<Members />} />
              <Route path="assembly/:assemblyId/events" element={<EventsList />} />
              <Route path="assembly/:assemblyId/events/:eventId" element={<EventDetail />} />
              <Route path="assembly/:assemblyId/delegations" element={<Delegations />} />
              <Route path="assembly/:assemblyId/polls" element={<Polls />} />
              <Route path="assembly/:assemblyId/predictions" element={<Predictions />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AttentionContext>
    </IdentityContext>
  );
}
