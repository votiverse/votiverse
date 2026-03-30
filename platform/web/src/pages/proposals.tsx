import { useState, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Proposal, ProposalDraft, EndorsementCounts } from "../api/types.js";
import { Card, CardBody, CardHeader, Button, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { NotesList } from "../components/community-notes.js";
import { EndorseButton, EndorseScore } from "../components/endorse-button.js";
import { ChevronLeft, LinkIcon, Check, Pencil } from "lucide-react";
import { lazy, Suspense } from "react";
const MarkdownEditor = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownEditor })));
const MarkdownViewer = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownViewer })));

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export function Proposals() {
  const { t } = useTranslation("governance");
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const issueId = searchParams.get("issueId") ?? undefined;
  const { getParticipantId } = useIdentity();
  const participantId = groupId ? getParticipantId(groupId) : null;

  const { data, loading, error, refetch } = useApi(
    () => api.listProposals(groupId!, issueId),
    [groupId, issueId],
  );
  const { data: participantsData } = useApi(() => api.listParticipants(groupId!), [groupId]);
  const { data: draftsData, refetch: refetchDrafts } = useApi(
    () => api.listProposalDrafts(groupId!),
    [groupId],
  );

  const nameMap = new Map((participantsData?.participants ?? []).map((p) => [p.id, p.name]));
  const proposals = data?.proposals ?? [];
  const drafts = draftsData?.drafts ?? [];

  // Batch-fetch endorsement data for read-only score display
  const proposalIdKey = useMemo(() => proposals.map(p => p.id).join(","), [proposals]);
  const { data: endorsementData } = useApi(
    () => proposalIdKey
      ? api.getEndorsements(groupId!, "proposal", proposalIdKey.split(","))
      : Promise.resolve({ endorsements: {} as Record<string, EndorsementCounts> }),
    [groupId, proposalIdKey],
  );

  const [showDraftForm, setShowDraftForm] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>(issueId);

  // Fetch events to populate the issue picker when no issueId is in the URL
  const { data: eventsData } = useApi(() => api.listEvents(groupId!), [groupId]);
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

  // Derive parent event for back navigation when filtered by issueId
  const parentEvent = useMemo(() => {
    if (!issueId || !eventsData) return null;
    return (eventsData.events ?? []).find(e => (e.issues ?? []).some(i => i.id === issueId)) ?? null;
  }, [issueId, eventsData]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-3xl mx-auto">
      {issueId && parentEvent && (
        <Link
          to={`/group/${groupId}/events/${parentEvent.id}`}
          className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px] mb-2"
        >
          <ChevronLeft size={16} />
          {t("proposals.backToEvent", { title: parentEvent.title })}
        </Link>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("proposals.title")}</h1>
          <p className="text-sm text-text-muted mt-1">
            {t("proposals.subtitle")}
          </p>
        </div>
        {participantId && (
          <Button onClick={() => setShowDraftForm(!showDraftForm)}>
            {showDraftForm ? t("common:cancel") : t("proposals.newDraft")}
          </Button>
        )}
      </div>

      {showDraftForm && !effectiveIssueId && deliberationIssues.length > 0 && (
        <Card className="mb-6">
          <CardBody>
            <h3 className="font-bold text-text-primary mb-3">{t("proposals.selectQuestion")}</h3>
            <div className="space-y-2">
              {deliberationIssues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => setSelectedIssueId(issue.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border-default hover:border-accent-muted hover:bg-accent-subtle transition-colors"
                >
                  <p className="text-sm font-medium text-text-primary">{issue.title}</p>
                  <p className="text-xs text-text-tertiary">{issue.eventTitle}</p>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {showDraftForm && effectiveIssueId && (
        <DraftForm groupId={groupId!} issueId={effectiveIssueId} onCreated={() => {
          setShowDraftForm(false);
          refetchDrafts();
        }} />
      )}

      {drafts.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold font-display text-text-primary mb-3">{t("proposals.yourDrafts")}</h2>
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} groupId={groupId!} onAction={() => { refetchDrafts(); refetch(); }} />
          ))}
        </section>
      )}

      {proposals.length === 0 ? (
        <EmptyState title={t("proposals.noProposals")} description={t("proposals.noProposalsDesc")} />
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              nameMap={nameMap}
              groupId={groupId!}
              endorsement={endorsementData?.endorsements?.[p.id] ?? { endorse: p.endorsementCount, dispute: p.disputeCount, my: null }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact clickable card (list page)
// ---------------------------------------------------------------------------

function ProposalCard({ proposal, nameMap, groupId, endorsement }: {
  proposal: Proposal;
  nameMap: Map<string, string>;
  groupId: string;
  endorsement: EndorsementCounts;
}) {
  const { t } = useTranslation("governance");
  const navigate = useNavigate();
  const statusColor = proposal.status === "locked" ? "blue" : proposal.status === "withdrawn" ? "gray" : "green";
  const proposalUrl = `/group/${groupId}/proposals/${proposal.id}`;
  const [copied, setCopied] = useState(false);

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${proposalUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card
      className="group cursor-pointer hover:border-accent-border transition-colors"
      onClick={() => navigate(proposalUrl)}
    >
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={nameMap.get(proposal.authorId) ?? "?"} size="sm" />
            <div className="min-w-0">
              <h3 className="font-bold text-text-primary truncate">{proposal.title}</h3>
              <p className="text-xs text-text-muted">
                by {nameMap.get(proposal.authorId) ?? proposal.authorId}
                {proposal.choiceKey && <> &middot; advocates <strong>{proposal.choiceKey}</strong></>}
                {proposal.currentVersion > 1 && <> &middot; v{proposal.currentVersion}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyLink}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors opacity-0 group-hover:opacity-100"
              title={t("proposals.copyLink")}
            >
              {copied ? <Check size={14} className="text-success-text" /> : <LinkIcon size={14} />}
            </button>
            {(endorsement.endorse > 0 || endorsement.dispute > 0) && (
              <EndorseScore counts={endorsement} />
            )}
            {proposal.featured && <Badge color="yellow">Featured</Badge>}
            <Badge color={statusColor}>{proposal.status}</Badge>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail page (standalone route)
// ---------------------------------------------------------------------------

export function ProposalDetailPage() {
  const { t } = useTranslation("governance");
  const { groupId, proposalId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = groupId ? getParticipantId(groupId) : null;

  const { data: proposal, loading, error, refetch } = useApi(
    () => api.getProposal(groupId!, proposalId!),
    [groupId, proposalId],
  );
  const { data: participantsData } = useApi(
    () => api.listParticipants(groupId!),
    [groupId],
  );

  // Endorsement state (same pattern as candidacy-profile)
  const { data: endorsementData } = useApi(
    () => api.getEndorsements(groupId!, "proposal", [proposalId!]),
    [groupId, proposalId],
  );
  const [localEndorsement, setLocalEndorsement] = useState<EndorsementCounts | null>(null);
  const endorsement: EndorsementCounts = localEndorsement
    ?? endorsementData?.endorsements?.[proposalId!]
    ?? { endorse: proposal?.endorsementCount ?? 0, dispute: proposal?.disputeCount ?? 0, my: null };

  // Copy link state
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    const fullUrl = `${window.location.origin}/group/${groupId}/proposals/${proposalId}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Version editing state
  const [editingVersion, setEditingVersion] = useState(false);
  const [versionMarkdown, setVersionMarkdown] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [publishing, setPublishing] = useState(false);

  const startEditing = () => {
    setVersionMarkdown(proposal?.content?.markdown ?? "");
    setChangeSummary("");
    setEditingVersion(true);
  };

  const cancelEditing = () => {
    setEditingVersion(false);
    setVersionMarkdown("");
    setChangeSummary("");
  };

  const handlePublishVersion = async () => {
    if (!versionMarkdown.trim()) return;
    setPublishing(true);
    try {
      await api.createProposalVersion(groupId!, proposalId!, {
        markdown: versionMarkdown,
        changeSummary: changeSummary.trim() || undefined,
      });
      setEditingVersion(false);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("proposals.submitFailed"));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div className="max-w-3xl mx-auto py-8"><Spinner /></div>;
  if (error) return <div className="max-w-3xl mx-auto py-8"><ErrorBox message={error} /></div>;
  if (!proposal) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <Link
          to={`/group/${groupId}/proposals`}
          className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px] mb-6"
        >
          <ChevronLeft size={16} />
          {t("proposals.backToProposals")}
        </Link>
        <EmptyState title={t("proposals.notFound")} description={t("proposals.notFoundDesc")} />
      </div>
    );
  }

  const nameMap = new Map((participantsData?.participants ?? []).map((p) => [p.id, p.name]));
  const isAuthor = participantId === proposal.authorId;
  const canEndorse = proposal.status === "submitted" && !!participantId && !isAuthor;
  const canUpdate = isAuthor && proposal.status === "submitted";
  const statusColor = proposal.status === "locked" ? "blue" : proposal.status === "withdrawn" ? "gray" : "green";
  const score = endorsement.endorse - endorsement.dispute;

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-page-in">
      {/* Back link */}
      <Link
        to={`/group/${groupId}/proposals`}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("proposals.backToProposals")}
      </Link>

      {/* Proposal header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge color={statusColor}>{proposal.status}</Badge>
          {proposal.featured && <Badge color="yellow">Featured</Badge>}
          {proposal.currentVersion > 1 && <Badge color="gray">v{proposal.currentVersion}</Badge>}
          {(endorsement.endorse > 0 || endorsement.dispute > 0) && (
            <span className={`text-xs font-medium ${score > 0 ? "text-success-text" : score < 0 ? "text-error-text" : "text-text-muted"}`}>
              {score > 0 ? "+" : ""}{score}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight">
            {proposal.title}
          </h1>
          <button
            type="button"
            onClick={copyLink}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors shrink-0"
            title={t("proposals.copyLink")}
          >
            {copied ? <Check size={16} className="text-success-text" /> : <LinkIcon size={16} />}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Avatar name={nameMap.get(proposal.authorId) ?? "?"} size="sm" />
          <span>
            by {nameMap.get(proposal.authorId) ?? proposal.authorId}
            {proposal.choiceKey && <> &middot; advocates <strong>{proposal.choiceKey}</strong></>}
          </span>
        </div>
      </div>

      {/* Full proposal content / version editor */}
      <Card>
        <CardBody>
          {editingVersion ? (
            <div className="space-y-3">
              <Suspense fallback={<div className="py-6 flex justify-center"><Spinner /></div>}>
                <MarkdownEditor
                  value={versionMarkdown}
                  onChange={setVersionMarkdown}
                  placeholder={t("proposals.editorPlaceholder")}
                  groupId={groupId!}
                  minHeight={250}
                />
              </Suspense>
              <input
                type="text"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                className="w-full border border-border-default rounded px-3 py-2 text-sm"
                placeholder={t("proposals.changeSummaryPlaceholder")}
              />
              <div className="flex gap-2">
                <Button onClick={handlePublishVersion} disabled={publishing || !versionMarkdown.trim()}>
                  {publishing ? t("proposals.submitting") : t("proposals.publishUpdate")}
                </Button>
                <Button variant="secondary" onClick={cancelEditing}>
                  {t("common:cancel")}
                </Button>
              </div>
            </div>
          ) : proposal.content?.markdown ? (
            <Suspense fallback={<div className="py-6 flex justify-center"><Spinner /></div>}>
              <div className="prose prose-sm max-w-none text-text-secondary">
                <MarkdownViewer content={proposal.content.markdown} />
              </div>
            </Suspense>
          ) : (
            <p className="text-sm text-text-muted italic py-4">{t("proposals.contentNotAvailable")}</p>
          )}
        </CardBody>
      </Card>

      {/* Community Notes (always visible) */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-bold font-display text-text-primary">
            {t("proposals.notesLabel")}
          </h2>
        </CardHeader>
        <CardBody>
          <NotesList groupId={groupId!} targetType="proposal" targetId={proposalId!} nameMap={nameMap} />
        </CardBody>
      </Card>

      {/* Spacer for sticky footer */}
      <div className="h-16" />

      {/* Sticky action footer */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-surface-raised/95 backdrop-blur-md border-t border-border-default z-40">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {canEndorse && (
            <EndorseButton
              groupId={groupId!}
              targetType="proposal"
              targetId={proposalId!}
              counts={endorsement}
              onUpdate={setLocalEndorsement}
            />
          )}
          <div className="flex-1" />
          {canUpdate && !editingVersion && (
            <button
              type="button"
              onClick={startEditing}
              className="flex items-center gap-1.5 text-sm text-accent-text hover:text-accent-strong-text min-h-[36px]"
            >
              <Pencil size={14} />
              {t("proposals.updateProposal")}
            </button>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
          >
            {copied ? <Check size={14} className="text-success-text" /> : <LinkIcon size={14} />}
            {t("proposals.copyLink")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft management (unchanged)
// ---------------------------------------------------------------------------

function DraftCard({ draft, groupId, onAction }: { draft: ProposalDraft; groupId: string; onAction: () => void }) {
  const { t } = useTranslation("governance");
  const [editing, setEditing] = useState(!draft.markdown);
  const [title, setTitle] = useState(draft.title);
  const [markdown, setMarkdown] = useState(draft.markdown);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (title !== draft.title || markdown !== draft.markdown) {
        await api.updateProposalDraft(groupId, draft.id, { title, markdown });
      }
      await api.submitProposalDraft(groupId, draft.id);
      onAction();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("proposals.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    await api.deleteProposalDraft(groupId, draft.id);
    onAction();
  };

  return (
    <Card className="mb-3 border-dashed border-warning-border bg-warning-subtle">
      <CardBody>
        <div className="flex items-center justify-between mb-2">
          <Badge color="yellow">{t("proposals.draft")}</Badge>
          <div className="flex gap-2">
            <button className="text-sm text-text-muted hover:text-text-secondary" onClick={() => setEditing(!editing)}>
              {editing ? t("proposals.doneEditing") : t("proposals.edit")}
            </button>
            <button className="text-sm text-error hover:text-error-text" onClick={handleDelete}>{t("common:delete")}</button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-border-default rounded px-3 py-2 text-sm"
              placeholder={t("proposals.titlePlaceholder")}
            />
            <Suspense fallback={<p className="text-sm text-text-tertiary">{t("proposals.loadingEditor")}</p>}>
              <MarkdownEditor
                value={markdown}
                onChange={setMarkdown}
                placeholder={t("proposals.editorPlaceholder")}
                groupId={groupId}
                minHeight={250}
              />
            </Suspense>
          </div>
        ) : (
          <div>
            <h3 className="font-medium text-text-primary">{draft.title}</h3>
            {draft.markdown && (
              <p className="text-sm text-text-secondary mt-1 line-clamp-3">{draft.markdown}</p>
            )}
          </div>
        )}

        <div className="mt-3">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("proposals.submitting") : t("proposals.submitProposal")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function DraftForm({ groupId, issueId, onCreated }: { groupId: string; issueId: string; onCreated: () => void }) {
  const { t } = useTranslation("governance");
  const [title, setTitle] = useState("");
  const [choiceKey, setChoiceKey] = useState("for");

  const handleCreate = async () => {
    if (!title.trim()) return;
    await api.createProposalDraft(groupId, { issueId, choiceKey, title });
    onCreated();
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <h3 className="font-medium text-text-primary mb-3">{t("proposals.newDraftTitle")}</h3>
        <div className="flex gap-3 mb-3">
          <select
            value={choiceKey}
            onChange={(e) => setChoiceKey(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-surface-raised"
          >
            <option value="for">{t("proposals.choiceFor")}</option>
            <option value="against">{t("proposals.choiceAgainst")}</option>
            <option value="general">{t("proposals.choiceGeneral")}</option>
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="Proposal title"
          />
        </div>
        <Button onClick={handleCreate} disabled={!title.trim()}>{t("proposals.createDraft")}</Button>
      </CardBody>
    </Card>
  );
}
