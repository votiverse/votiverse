import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Proposal, ProposalDraft } from "../api/types.js";
import { Card, CardBody, Button, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { NotesList } from "../components/community-notes.js";
import { FileText, MessageSquareText, ThumbsUp, ThumbsDown } from "lucide-react";
import { lazy, Suspense } from "react";
const MarkdownEditor = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownEditor })));
const MarkdownViewer = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownViewer })));

export function Proposals() {
  const { assemblyId } = useParams();
  const [searchParams] = useSearchParams();
  const issueId = searchParams.get("issueId") ?? undefined;
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;

  const { data, loading, error, refetch } = useApi(
    () => api.listProposals(assemblyId!, issueId),
    [assemblyId, issueId],
  );
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: draftsData, refetch: refetchDrafts } = useApi(
    () => api.listProposalDrafts(assemblyId!),
    [assemblyId],
  );

  const nameMap = new Map((participantsData?.participants ?? []).map((p) => [p.id, p.name]));
  const proposals = data?.proposals ?? [];
  const drafts = draftsData?.drafts ?? [];

  const [showDraftForm, setShowDraftForm] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>(issueId);

  // Fetch events to populate the issue picker when no issueId is in the URL
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const deliberationIssues = useMemo(() => {
    if (!eventsData) return [];
    const issues: Array<{ id: string; title: string; eventTitle: string }> = [];
    for (const evt of eventsData.events ?? []) {
      for (const issue of evt.issues ?? []) {
        issues.push({ id: issue.id, title: issue.title, eventTitle: evt.title });
      }
    }
    return issues;
  }, [eventsData]);

  const effectiveIssueId = issueId ?? selectedIssueId;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Proposals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Documents arguing for or against each choice.
          </p>
        </div>
        {participantId && (
          <Button onClick={() => setShowDraftForm(!showDraftForm)}>
            {showDraftForm ? "Cancel" : "New Draft"}
          </Button>
        )}
      </div>

      {showDraftForm && !effectiveIssueId && deliberationIssues.length > 0 && (
        <Card className="mb-6">
          <CardBody>
            <h3 className="font-medium text-gray-900 mb-3">Select a question to write about</h3>
            <div className="space-y-2">
              {deliberationIssues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => setSelectedIssueId(issue.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900">{issue.title}</p>
                  <p className="text-xs text-gray-400">{issue.eventTitle}</p>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {showDraftForm && effectiveIssueId && (
        <DraftForm assemblyId={assemblyId!} issueId={effectiveIssueId} onCreated={() => {
          setShowDraftForm(false);
          refetchDrafts();
        }} />
      )}

      {drafts.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium text-gray-800 mb-3">Your Drafts</h2>
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} assemblyId={assemblyId!} onAction={() => { refetchDrafts(); refetch(); }} />
          ))}
        </section>
      )}

      {proposals.length === 0 ? (
        <EmptyState title="No proposals yet" description="Be the first to submit a proposal for this issue." />
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} nameMap={nameMap} assemblyId={assemblyId!} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal, nameMap, assemblyId }: { proposal: Proposal; nameMap: Map<string, string>; assemblyId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [fullContent, setFullContent] = useState<Proposal | null>(null);
  const [endorsements, setEndorsements] = useState(proposal.endorsementCount ?? 0);
  const [disputes, setDisputes] = useState(proposal.disputeCount ?? 0);
  const [evaluating, setEvaluating] = useState(false);
  const { getParticipantId } = useIdentity();
  const participantId = getParticipantId(assemblyId);
  const isAuthor = participantId === proposal.authorId;
  const canEndorse = proposal.status === "submitted" && participantId && !isAuthor;

  const statusColor = proposal.status === "locked" ? "blue" : proposal.status === "withdrawn" ? "gray" : "green";

  const handleExpand = async () => {
    if (!expanded && !fullContent) {
      try {
        const full = await api.getProposal(assemblyId, proposal.id);
        setFullContent(full);
      } catch { /* fallback */ }
    }
    setExpanded(!expanded);
  };

  const handleEvaluate = async (evaluation: "endorse" | "dispute") => {
    if (!canEndorse || evaluating) return;
    setEvaluating(true);
    try {
      await api.evaluateProposal(assemblyId, proposal.id, evaluation);
      if (evaluation === "endorse") setEndorsements((n) => n + 1);
      else setDisputes((n) => n + 1);
    } catch { /* ignore */ }
    setEvaluating(false);
  };

  const markdown = fullContent?.content?.markdown ?? proposal.content?.markdown;
  const score = endorsements - disputes;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={nameMap.get(proposal.authorId) ?? "?"} size="sm" />
            <div className="min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{proposal.title}</h3>
              <p className="text-xs text-gray-500">
                by {nameMap.get(proposal.authorId) ?? proposal.authorId}
                {proposal.choiceKey && <> &middot; advocates <strong>{proposal.choiceKey}</strong></>}
                {" "}&middot; v{proposal.currentVersion}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(endorsements > 0 || disputes > 0) && (
              <span className={`text-xs font-medium ${score > 0 ? "text-green-600" : score < 0 ? "text-red-600" : "text-gray-500"}`}>
                {score > 0 ? "+" : ""}{score}
              </span>
            )}
            {proposal.featured && <Badge color="yellow">Featured</Badge>}
            <Badge color={statusColor}>{proposal.status}</Badge>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-4">
            {markdown ? (
              <Suspense fallback={<p className="text-sm text-gray-400">Loading...</p>}><MarkdownViewer content={markdown} /></Suspense>
            ) : (
              <p className="text-sm text-gray-400 italic">Proposal content not yet available.</p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4">
          <button
            className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1.5"
            onClick={handleExpand}
          >
            <FileText size={14} />
            {expanded ? "Hide proposal" : "Read proposal"}
          </button>
          <button
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5"
            onClick={() => setShowNotes(!showNotes)}
          >
            <MessageSquareText size={14} />
            Notes
          </button>
          {canEndorse && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => handleEvaluate("endorse")}
                disabled={evaluating}
                className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                title="Endorse"
              >
                <ThumbsUp size={14} />
              </button>
              <span className="text-xs text-gray-400 tabular-nums min-w-[2ch] text-center">
                {endorsements > 0 ? endorsements : ""}
              </span>
              <button
                onClick={() => handleEvaluate("dispute")}
                disabled={evaluating}
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Dispute"
              >
                <ThumbsDown size={14} />
              </button>
              <span className="text-xs text-gray-400 tabular-nums min-w-[2ch] text-center">
                {disputes > 0 ? disputes : ""}
              </span>
            </div>
          )}
        </div>

        {showNotes && (
          <div className="mt-4 border-t pt-4">
            <NotesList assemblyId={assemblyId} targetType="proposal" targetId={proposal.id} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function DraftCard({ draft, assemblyId, onAction }: { draft: ProposalDraft; assemblyId: string; onAction: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [markdown, setMarkdown] = useState(draft.markdown);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (title !== draft.title || markdown !== draft.markdown) {
        await api.updateProposalDraft(assemblyId, draft.id, { title, markdown });
      }
      await api.submitProposalDraft(assemblyId, draft.id);
      onAction();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    await api.deleteProposalDraft(assemblyId, draft.id);
    onAction();
  };

  return (
    <Card className="mb-3 border-dashed border-amber-300 bg-amber-50">
      <CardBody>
        <div className="flex items-center justify-between mb-2">
          <Badge color="yellow">Draft</Badge>
          <div className="flex gap-2">
            <button className="text-sm text-gray-500 hover:text-gray-700" onClick={() => setEditing(!editing)}>
              {editing ? "Done editing" : "Edit"}
            </button>
            <button className="text-sm text-red-500 hover:text-red-700" onClick={handleDelete}>Delete</button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Proposal title"
            />
            <Suspense fallback={<p className="text-sm text-gray-400">Loading editor...</p>}>
              <MarkdownEditor
                value={markdown}
                onChange={setMarkdown}
                placeholder="Write your proposal — use headings, lists, and bold text to structure your argument..."
                assemblyId={assemblyId}
                minHeight={250}
              />
            </Suspense>
          </div>
        ) : (
          <div>
            <h3 className="font-medium text-gray-900">{draft.title}</h3>
            {draft.markdown && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-3">{draft.markdown}</p>
            )}
          </div>
        )}

        <div className="mt-3">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Proposal"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function DraftForm({ assemblyId, issueId, onCreated }: { assemblyId: string; issueId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [choiceKey, setChoiceKey] = useState("for");

  const handleCreate = async () => {
    if (!title.trim()) return;
    await api.createProposalDraft(assemblyId, { issueId, choiceKey, title });
    onCreated();
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <h3 className="font-medium text-gray-900 mb-3">New Proposal Draft</h3>
        <div className="flex gap-3 mb-3">
          <select
            value={choiceKey}
            onChange={(e) => setChoiceKey(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-white"
          >
            <option value="for">For</option>
            <option value="against">Against</option>
            <option value="general">General</option>
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="Proposal title"
          />
        </div>
        <Button onClick={handleCreate} disabled={!title.trim()}>Create Draft</Button>
      </CardBody>
    </Card>
  );
}
