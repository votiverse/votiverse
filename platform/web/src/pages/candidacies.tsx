import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Candidacy } from "../api/types.js";
import { Card, CardBody, Button, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { NotesList } from "../components/community-notes.js";
import { FileText, MessageSquareText, ExternalLink } from "lucide-react";
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
        {participantId && (
          <Button onClick={() => setShowDeclareForm(!showDeclareForm)}>
            {showDeclareForm ? t("common:cancel") : t("candidacies.declareCandidacy")}
          </Button>
        )}
      </div>

      {showDeclareForm && (
        <DeclareForm assemblyId={assemblyId!} onDeclared={() => { setShowDeclareForm(false); refetch(); }} />
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
  const { t } = useTranslation("governance");
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [fullContent, setFullContent] = useState<Candidacy | null>(null);

  const name = nameMap.get(candidacy.participantId) ?? candidacy.participantId;
  const topics = candidacy.topicScope.map((t) => topicNameMap.get(t) ?? t);
  const websiteUrl = fullContent?.content?.websiteUrl ?? candidacy.content?.websiteUrl;
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

  const markdown = fullContent?.content?.markdown ?? candidacy.content?.markdown;

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

        <div className="mt-3 flex gap-4">
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
  const { t } = useTranslation("governance");
  const [markdown, setMarkdown] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
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
        websiteUrl: websiteUrl.trim() || undefined,
      });
      onDeclared();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("candidacies.declareFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <h3 className="font-medium text-text-primary mb-3">{t("candidacies.declareTitle")}</h3>
        <p className="text-sm text-text-muted mb-4">
          {t("candidacies.declareIntro")}
        </p>
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
        <label className="flex items-center gap-2 text-sm text-text-secondary mb-4">
          <input
            type="checkbox"
            checked={voteTransparency}
            onChange={(e) => setVoteTransparency(e.target.checked)}
            className="rounded"
          />
          {t("candidacies.publicVotesLabel")}
        </label>
        <Button onClick={handleDeclare} disabled={submitting || !markdown.trim()}>
          {submitting ? t("candidacies.declaring") : t("candidacies.declareBtn")}
        </Button>
      </CardBody>
    </Card>
  );
}
