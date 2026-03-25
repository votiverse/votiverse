import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Candidacy } from "../api/types.js";
import { Card, CardBody, Button, Label, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { NotesList } from "../components/community-notes.js";
import { TopicPicker } from "../components/topic-picker.js";
import { FileText, MessageSquareText, ExternalLink, Pencil } from "lucide-react";
import { lazy, Suspense } from "react";
const MarkdownEditor = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownEditor })));
const MarkdownViewer = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownViewer })));

export function Candidacies() {
  const { t } = useTranslation("governance");
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

  const delegationCandidacy = assembly?.config.delegation.candidacy ?? false;

  // Check if the current user already has an active candidacy
  const myActiveCandidacy = participantId
    ? candidacies.find((c) => c.participantId === participantId)
    : null;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("candidacies.title")}</h1>
          <p className="text-sm text-text-muted mt-1">
            {delegationCandidacy
              ? t("candidacies.subtitleCandidacy")
              : t("candidacies.subtitleGeneral")}
          </p>
        </div>
        {participantId && !myActiveCandidacy && (
          <Button onClick={() => setShowDeclareForm(!showDeclareForm)}>
            {showDeclareForm ? t("common:cancel") : t("candidacies.declareCandidacy")}
          </Button>
        )}
      </div>

      {showDeclareForm && (
        <CandidacyForm
          assemblyId={assemblyId!}
          onDone={() => { setShowDeclareForm(false); refetch(); }}
        />
      )}

      {candidacies.length === 0 ? (
        <EmptyState title={t("candidacies.noCandidates")} description={t("candidacies.noCandidatesDesc")} />
      ) : (
        <div className="space-y-4">
          {candidacies.map((c) => (
            <CandidacyCard
              key={c.id}
              candidacy={c}
              nameMap={nameMap}
              topicNameMap={topicNameMap}
              assemblyId={assemblyId!}
              isOwn={c.participantId === participantId}
              onChanged={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidacyCard({ candidacy, nameMap, topicNameMap, assemblyId, isOwn, onChanged }: {
  candidacy: Candidacy;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  assemblyId: string;
  isOwn: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation("governance");
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [fullContent, setFullContent] = useState<Candidacy | null>(null);

  const name = nameMap.get(candidacy.participantId) ?? candidacy.participantId;
  const topics = candidacy.topicScope.map((t) => topicNameMap.get(t) ?? t);
  const websiteUrl = fullContent?.content?.websiteUrl ?? candidacy.websiteUrl ?? candidacy.content?.websiteUrl;
  const websiteHostname = websiteUrl ? (() => { try { return new URL(websiteUrl).hostname; } catch { return websiteUrl; } })() : null;

  const handleExpand = async () => {
    if (!expanded && !fullContent) {
      try {
        const full = await api.getCandidacy(assemblyId, candidacy.id);
        setFullContent(full);
      } catch { /* fallback to no content */ }
    }
    setExpanded(!expanded);
  };

  const handleEdit = async () => {
    // Ensure we have full content loaded for the edit form
    if (!fullContent) {
      try {
        const full = await api.getCandidacy(assemblyId, candidacy.id);
        setFullContent(full);
      } catch { /* proceed with what we have */ }
    }
    setEditing(true);
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      await api.withdrawCandidacy(assemblyId, candidacy.id);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("candidacies.withdrawFailed"));
    } finally {
      setWithdrawing(false);
    }
  };

  const markdown = fullContent?.content?.markdown ?? candidacy.content?.markdown;

  if (editing) {
    return (
      <CandidacyForm
        assemblyId={assemblyId}
        candidacyId={candidacy.id}
        initialMarkdown={fullContent?.content?.markdown ?? candidacy.content?.markdown ?? ""}
        initialWebsiteUrl={fullContent?.content?.websiteUrl ?? candidacy.websiteUrl ?? ""}
        initialTopicScope={candidacy.topicScope}
        initialVoteTransparency={candidacy.voteTransparencyOptIn}
        onDone={() => { setEditing(false); setFullContent(null); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <Avatar name={name} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary">{name}</h3>
            <div className="flex flex-wrap gap-1 mt-1">
              {topics.length > 0 ? (
                topics.map((t) => <Badge key={t} color="blue">{t}</Badge>)
              ) : (
                <Badge color="gray">{t("candidacies.global")}</Badge>
              )}
              {candidacy.voteTransparencyOptIn && (
                <Badge color="green">Public votes</Badge>
              )}
            </div>
            <p className="text-xs text-text-muted mt-1">
              {t("candidacies.declared", { date: formatDate(candidacy.declaredAt) })}
              {candidacy.currentVersion > 1 && (
                <span className="ml-1 text-text-tertiary">
                  · {t("candidacies.edited", { version: candidacy.currentVersion })}
                </span>
              )}
            </p>
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-text hover:underline inline-flex items-center gap-1 mt-1"
              >
                {websiteHostname}
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-4">
            {markdown ? (
              <Suspense fallback={<p className="text-sm text-text-tertiary">{t("candidacies.loading")}</p>}><MarkdownViewer content={markdown} /></Suspense>
            ) : (
              <p className="text-sm text-text-tertiary italic">{t("candidacies.profileNotAvailable")}</p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4">
          <button
            className="text-sm text-info-text hover:text-info-text inline-flex items-center gap-1.5"
            onClick={handleExpand}
          >
            <FileText size={14} />
            {expanded ? t("candidacies.hideStatement") : t("candidacies.candidateStatement")}
          </button>
          <button
            className="text-sm text-text-muted hover:text-text-secondary inline-flex items-center gap-1.5"
            onClick={() => setShowNotes(!showNotes)}
          >
            <MessageSquareText size={14} />
            {t("candidacies.notesLabel")}
          </button>
          {isOwn && (
            <>
              <button
                className="text-sm text-accent-text hover:text-accent-strong-text inline-flex items-center gap-1.5 ml-auto"
                onClick={handleEdit}
              >
                <Pencil size={14} />
                {t("candidacies.editProfile")}
              </button>
              <button
                className="text-sm text-error-text hover:text-error-text"
                onClick={() => { if (confirm(t("candidacies.withdrawConfirm"))) handleWithdraw(); }}
                disabled={withdrawing}
              >
                {withdrawing ? t("candidacies.withdrawing") : t("candidacies.withdraw")}
              </button>
            </>
          )}
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

// ---------------------------------------------------------------------------
// Shared form for declaring and editing candidacies
// ---------------------------------------------------------------------------

function CandidacyForm({
  assemblyId,
  candidacyId,
  initialMarkdown = "",
  initialWebsiteUrl = "",
  initialTopicScope = [],
  initialVoteTransparency = false,
  onDone,
  onCancel,
}: {
  assemblyId: string;
  candidacyId?: string;
  initialMarkdown?: string;
  initialWebsiteUrl?: string;
  initialTopicScope?: string[];
  initialVoteTransparency?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("governance");
  const isEdit = !!candidacyId;
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl || "");
  const [topicScope, setTopicScope] = useState<string[]>(initialTopicScope);
  const [voteTransparency, setVoteTransparency] = useState(initialVoteTransparency);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!markdown.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.createCandidacyVersion(assemblyId, candidacyId, {
          markdown,
          topicScope: topicScope.length > 0 ? topicScope : undefined,
          voteTransparencyOptIn: voteTransparency,
          websiteUrl: websiteUrl.trim() || undefined,
        });
      } else {
        await api.declareCandidacy(assemblyId, {
          topicScope,
          voteTransparencyOptIn: voteTransparency,
          markdown,
          websiteUrl: websiteUrl.trim() || undefined,
        });
      }
      onDone();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("candidacies.declareFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <h3 className="font-medium text-text-primary mb-3">
          {isEdit ? t("candidacies.editTitle") : t("candidacies.declareTitle")}
        </h3>
        {!isEdit && (
          <p className="text-sm text-text-muted mb-4">
            {t("candidacies.declareIntro")}
          </p>
        )}
        <Suspense fallback={<p className="text-sm text-text-tertiary">{t("candidacies.loadingEditor")}</p>}>
          <MarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            placeholder={t("candidacies.editorPlaceholder")}
            assemblyId={assemblyId}
            minHeight={250}
          />
        </Suspense>
        <div className="mb-4">
          <label htmlFor="candidacy-website" className="block text-sm font-medium text-text-secondary mb-1">
            {t("candidacies.websiteLabel")}
          </label>
          <input
            id="candidacy-website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-border-strong rounded-xl px-4 py-2.5 text-sm bg-transparent text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-accent"
          />
          {!websiteUrl && (
            <p className="text-xs text-text-tertiary mt-1">
              {t("candidacies.websiteHelper")}{" "}
              <a href="https://uniweb.app/templates?category=campaign" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                {t("candidacies.browseTemplates")} →
              </a>
            </p>
          )}
        </div>
        <div className="mb-4">
          <Label>{t("candidacies.topicScopeLabel")}</Label>
          <p className="text-xs text-text-tertiary mb-2">{t("candidacies.topicScopeHint")}</p>
          <TopicPicker assemblyId={assemblyId} value={topicScope} onChange={setTopicScope} />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary mb-4">
          <input
            type="checkbox"
            checked={voteTransparency}
            onChange={(e) => setVoteTransparency(e.target.checked)}
            className="rounded"
          />
          {t("candidacies.publicVotesLabel")}
        </label>
        <div className="flex items-center gap-2">
          <Button onClick={handleSubmit} disabled={submitting || !markdown.trim()}>
            {submitting
              ? (isEdit ? t("candidacies.saving") : t("candidacies.declaring"))
              : (isEdit ? t("candidacies.saveChanges") : t("candidacies.declareBtn"))}
          </Button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-text-muted hover:text-text-secondary min-h-[36px] px-2"
            >
              {t("common:cancel")}
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
