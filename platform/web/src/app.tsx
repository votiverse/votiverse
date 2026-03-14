import { useState } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router";
import { ParticipantContext } from "./hooks/use-participant.js";
import { Header } from "./components/layout.js";
import { AssemblyList } from "./pages/assembly-list.js";
import { AssemblyDashboard } from "./pages/assembly-dashboard.js";
import { Members } from "./pages/members.js";
import { EventsList } from "./pages/events-list.js";
import { EventDetail } from "./pages/event-detail.js";
import { Delegations } from "./pages/delegations.js";
import { Polls } from "./pages/polls.js";
import { Awareness, AwarenessProfile, AwarenessHistory } from "./pages/awareness.js";

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="py-8 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);

  const setParticipant = (id: string | null, name: string | null) => {
    setParticipantId(id);
    setParticipantName(name);
  };

  return (
    <ParticipantContext value={{ participantId, participantName, setParticipant }}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<AssemblyList />} />
            <Route path="assembly/:assemblyId" element={<AssemblyDashboard />} />
            <Route path="assembly/:assemblyId/members" element={<Members />} />
            <Route path="assembly/:assemblyId/events" element={<EventsList />} />
            <Route path="assembly/:assemblyId/events/:eventId" element={<EventDetail />} />
            <Route path="assembly/:assemblyId/delegations" element={<Delegations />} />
            <Route path="assembly/:assemblyId/polls" element={<Polls />} />
            <Route path="assembly/:assemblyId/awareness" element={<Awareness />} />
            <Route path="assembly/:assemblyId/awareness/profile/:participantId" element={<AwarenessProfile />} />
            <Route path="assembly/:assemblyId/awareness/history/:participantId" element={<AwarenessHistory />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ParticipantContext>
  );
}
