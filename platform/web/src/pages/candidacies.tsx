import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Candidacy } from "../api/types.js";
import { Card, CardBody, Button, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { NotesList } from "../components/community-notes.js";
import { lazy, Suspense } from "react";
const MarkdownEditor = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownEditor })));
const MarkdownViewer = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownViewer })));

export function Candidacies() {
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { assembly } = useAssembly(assemblyId);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);

  const { data, loading, error, refetch } = useApi(
    () => api.listCandidacies(assemblyId!, "active"),
    [assemblyId],
  );

  const nameMap = new Map((participantsData?.participants ?? []).map((p) => [p.id, p.name]));
  const topicNameMap = new Map((topicsData?.topics ?? []).map((t) => [t.id, t.name]));
  const candidacies = data?.candidacies ?? [];

  const [showDeclareForm, setShowDeclareForm] = useState(false);

  const delegationMode = assembly?.config.delegation.delegationMode ?? "none";

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Delegate Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">
            {delegationMode === "candidacy"
              ? "Declared candidates seeking your delegation. You can also delegate to anyone via search."
              : "Participants who have declared their availability as delegates."}
          </p>
        </div>
        {participantId && (
          <Button onClick={() => setShowDeclareForm(!showDeclareForm)}>
            {showDeclareForm ? "Cancel" : "Declare Candidacy"}
          </Button>
        )}
      </div>

      {showDeclareForm && (
        <DeclareForm assemblyId={assemblyId!} onDeclared={() => { setShowDeclareForm(false); refetch(); }} />
      )}

      {candidacies.length === 0 ? (
        <EmptyState title="No candidates" description="No one has declared a delegate candidacy yet." />
      ) : (
        <div className="space-y-4">
          {candidacies.map((c) => (
            <CandidacyCard
              key={c.id}
              candidacy={c}
              nameMap={nameMap}
              topicNameMap={topicNameMap}
              assemblyId={assemblyId!}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidacyCard({ candidacy, nameMap, topicNameMap, assemblyId }: {
  candidacy: Candidacy;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  assemblyId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [fullContent, setFullContent] = useState<Candidacy | null>(null);

  const name = nameMap.get(candidacy.participantId) ?? candidacy.participantId;
  const topics = candidacy.topicScope.map((t) => topicNameMap.get(t) ?? t);

  const handleExpand = async () => {
    if (!expanded && !fullContent) {
      try {
        const full = await api.getCandidacy(assemblyId, candidacy.id);
        setFullContent(full);
      } catch { /* fallback to no content */ }
    }
    setExpanded(!expanded);
  };

  const markdown = fullContent?.content?.markdown ?? candidacy.content?.markdown;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <Avatar name={name} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900">{name}</h3>
            <div className="flex flex-wrap gap-1 mt-1">
              {topics.length > 0 ? (
                topics.map((t) => <Badge key={t} color="blue">{t}</Badge>)
              ) : (
                <Badge color="gray">Global</Badge>
              )}
              {candidacy.voteTransparencyOptIn && (
                <Badge color="green">Transparent votes</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Declared {new Date(candidacy.declaredAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-4">
            {markdown ? (
              <Suspense fallback={<p className="text-sm text-gray-400">Loading...</p>}><MarkdownViewer content={markdown} /></Suspense>
            ) : (
              <p className="text-sm text-gray-400 italic">Profile content not yet available.</p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            className="text-sm text-blue-600 hover:text-blue-800"
            onClick={handleExpand}
          >
            {expanded ? "Collapse" : "View profile"}
          </button>
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={() => setShowNotes(!showNotes)}
          >
            Community Notes
          </button>
        </div>

        {showNotes && (
          <div className="mt-4 border-t pt-4">
            <NotesList assemblyId={assemblyId} targetType="candidacy" targetId={candidacy.id} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function DeclareForm({ assemblyId, onDeclared }: { assemblyId: string; onDeclared: () => void }) {
  const [markdown, setMarkdown] = useState("");
  const [voteTransparency, setVoteTransparency] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleDeclare = async () => {
    if (!markdown.trim()) return;
    setSubmitting(true);
    try {
      await api.declareCandidacy(assemblyId, {
        topicScope: [],
        voteTransparencyOptIn: voteTransparency,
        markdown,
      });
      onDeclared();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Declaration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <h3 className="font-medium text-gray-900 mb-3">Declare Candidacy</h3>
        <p className="text-sm text-gray-500 mb-4">
          Introduce yourself, your qualifications, and how you plan to represent delegators.
        </p>
        <Suspense fallback={<p className="text-sm text-gray-400">Loading editor...</p>}>
          <MarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            placeholder="Introduce yourself — qualifications, positions, and why delegates should trust you..."
            assemblyId={assemblyId}
            minHeight={250}
          />
        </Suspense>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
          <input
            type="checkbox"
            checked={voteTransparency}
            onChange={(e) => setVoteTransparency(e.target.checked)}
            className="rounded"
          />
          Opt into vote transparency (delegators can see how I vote)
        </label>
        <Button onClick={handleDeclare} disabled={submitting || !markdown.trim()}>
          {submitting ? "Declaring..." : "Declare Candidacy"}
        </Button>
      </CardBody>
    </Card>
  );
}
