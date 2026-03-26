import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Candidacy, EndorsementCounts } from "../api/types.js";
import { Card, CardBody, Button, Label, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { EndorseScore } from "../components/endorse-button.js";
import { TopicPicker } from "../components/topic-picker.js";
import { lazy } from "react";
const MarkdownEditor = lazy(() => import("../components/markdown-editor.js").then(m => ({ default: m.MarkdownEditor })));

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

  // Fetch endorsement counts for all candidacies
  const candidacyIds = candidacies.map((c) => c.id);
  const { data: endorsementData } = useApi(
    () => candidacyIds.length > 0 ? api.getEndorsements(assemblyId!, "candidacy", candidacyIds) : Promise.resolve({ endorsements: {} }),
    [assemblyId, candidacyIds.join(",")],
  );
  const endorsementMap: Record<string, EndorsementCounts> = endorsementData?.endorsements ?? {};

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {candidacies.map((c) => (
            <CandidacyCard
              key={c.id}
              candidacy={c}
              nameMap={nameMap}
              topicNameMap={topicNameMap}
              assemblyId={assemblyId!}
              endorsement={endorsementMap[c.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidacyCard({ candidacy, nameMap, topicNameMap, assemblyId, endorsement }: {
  candidacy: Candidacy;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  assemblyId: string;
  endorsement?: EndorsementCounts;
}) {
  const { t } = useTranslation("governance");
  const name = nameMap.get(candidacy.participantId) ?? candidacy.participantId;
  const title = candidacy.title ?? null;
  const topics = candidacy.topicScope.map((tt) => topicNameMap.get(tt) ?? tt);
  const profileUrl = `/assembly/${assemblyId}/candidacies/${candidacy.id}`;

  return (
    <Card
      className="group cursor-pointer hover:border-accent-border transition-colors"
      onClick={() => window.open(profileUrl, "_blank")}
    >
      <CardBody className="p-5">
        {/* Header: avatar + name + title + badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={name}
              size="md"
              className="shrink-0 group-hover:ring-2 group-hover:ring-accent-border transition-shadow"
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">{name}</h3>
              {title && <p className="text-xs text-text-muted truncate">{title}</p>}
            </div>
          </div>
          <Badge color="blue" className="shrink-0">{t("delegates.candidateLabel")}</Badge>
        </div>

        {/* Footer: topic badges + endorsement score */}
        <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
          <div className="flex flex-wrap gap-1.5">
            {topics.length > 0 ? (
              topics.slice(0, 3).map((tt) => (
                <span key={tt} className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary bg-surface-sunken px-2 py-0.5 rounded-md border border-border-default truncate max-w-[140px]">
                  {tt}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-text-tertiary">{t("candidacies.global")}</span>
            )}
          </div>
          {endorsement && (endorsement.endorse > 0 || endorsement.dispute > 0) && (
            <EndorseScore counts={endorsement} />
          )}
        </div>
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
