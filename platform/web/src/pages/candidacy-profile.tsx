import { lazy, Suspense, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { EndorsementCounts } from "../api/types.js";
import { Card, CardBody, CardHeader, Badge, Button, Spinner, ErrorBox } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { NotesList } from "../components/community-notes.js";
import { EndorseButton } from "../components/endorse-button.js";
import { ChevronLeft, ExternalLink, Pencil } from "lucide-react";
import { bannerGradient } from "./delegates/utils.js";

const MarkdownViewer = lazy(() =>
  import("../components/markdown-editor.js").then((m) => ({ default: m.MarkdownViewer })),
);

/**
 * Standalone candidacy profile page — /assembly/:assemblyId/candidacies/:candidacyId
 * Shows the full candidate profile with statement, community notes, and topic badges.
 */
export function CandidacyProfile() {
  const { t } = useTranslation("governance");
  const { assemblyId, candidacyId } = useParams();
  const { getParticipantId } = useIdentity();
  const navigate = useNavigate();
  const myParticipantId = assemblyId ? getParticipantId(assemblyId) : null;

  const { data: candidacy, loading, error } = useApi(
    () => api.getCandidacy(assemblyId!, candidacyId!),
    [assemblyId, candidacyId],
  );
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);

  // Endorsement state
  const { data: endorsementData } = useApi(
    () => api.getEndorsements(assemblyId!, "candidacy", [candidacyId!]),
    [assemblyId, candidacyId],
  );
  const [localEndorsement, setLocalEndorsement] = useState<EndorsementCounts | null>(null);
  const endorsement: EndorsementCounts = localEndorsement
    ?? endorsementData?.endorsements?.[candidacyId!]
    ?? { endorse: 0, dispute: 0, my: null };

  const [withdrawing, setWithdrawing] = useState(false);

  if (loading) return <div className="max-w-3xl mx-auto py-8"><Spinner /></div>;
  if (error) return <div className="max-w-3xl mx-auto py-8"><ErrorBox message={error} /></div>;
  if (!candidacy) return <div className="max-w-3xl mx-auto py-8"><ErrorBox message="Candidacy not found" /></div>;

  const participants = participantsData?.participants ?? [];
  const topics = topicsData?.topics ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const name = nameMap.get(candidacy.participantId) ?? "";
  const title = candidacy.title ?? null;
  const websiteUrl = candidacy.websiteUrl ?? candidacy.content?.websiteUrl ?? null;
  const isOwn = myParticipantId === candidacy.participantId;

  const handleWithdraw = async () => {
    if (!confirm(t("candidacies.withdrawConfirm"))) return;
    setWithdrawing(true);
    try {
      await api.withdrawCandidacy(assemblyId!, candidacyId!);
      navigate(`/assembly/${assemblyId}/candidacies`);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("candidacies.withdrawFailed"));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-page-in">
      {/* Back link */}
      <Link
        to={`/assembly/${assemblyId}/candidacies`}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("delegates.allCandidates")}
      </Link>

      {/* Profile header card */}
      <Card className="overflow-hidden">
        <div
          className="h-20 opacity-80"
          style={{ background: bannerGradient(name) }}
        />
        <CardBody className="relative px-5 pb-5 pt-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 -mt-10 mb-4">
            <Avatar
              name={name}
              size="xl"
              className="w-20 h-20 text-2xl shadow-md border-4 border-surface-raised"
            />
            <Badge color="blue">{t("delegates.officialCandidate")}</Badge>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight">
            {name}
          </h1>
          {title && (
            <p className="text-sm font-medium text-text-muted uppercase tracking-wider mt-0.5">
              {title}
            </p>
          )}

          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-info-text hover:underline mt-3 min-h-[36px]"
            >
              <ExternalLink size={14} />
              {safeHostname(websiteUrl)}
            </a>
          )}

          {candidacy.topicScope.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {candidacy.topicScope.map((tId) => (
                <Badge key={tId} color="blue">
                  {topics.find((tt) => tt.id === tId)?.name ?? tId.slice(0, 8)}
                </Badge>
              ))}
            </div>
          )}

          {candidacy.voteTransparencyOptIn && (
            <div className="mt-2">
              <Badge color="green">{t("publicVotes")}</Badge>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Candidate Statement */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-bold font-display text-text-primary">
            {t("delegates.statementTitle")}
          </h2>
        </CardHeader>
        <CardBody>
          {candidacy.content?.markdown ? (
            <Suspense fallback={<div className="py-6 flex justify-center"><Spinner /></div>}>
              <div className="prose prose-sm max-w-none text-text-secondary">
                <MarkdownViewer content={candidacy.content.markdown} />
              </div>
            </Suspense>
          ) : (
            <p className="text-sm text-text-muted italic py-4">No statement provided.</p>
          )}
        </CardBody>
      </Card>

      {/* Community Notes */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-bold font-display text-text-primary">
            Community Notes
          </h2>
        </CardHeader>
        <CardBody>
          <NotesList assemblyId={assemblyId!} targetType="candidacy" targetId={candidacyId!} />
        </CardBody>
      </Card>

      {/* Spacer for sticky footer */}
      <div className="h-16" />

      {/* Sticky action footer */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-surface-raised/95 backdrop-blur-md border-t border-border-default z-40">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <EndorseButton
            assemblyId={assemblyId!}
            targetType="candidacy"
            targetId={candidacyId!}
            counts={endorsement}
            onUpdate={setLocalEndorsement}
          />
          <div className="flex-1" />
          {isOwn && (
            <>
              <Link
                to={`/assembly/${assemblyId}/candidacies`}
                className="text-sm text-accent-text hover:text-accent-strong-text inline-flex items-center gap-1.5 min-h-[36px]"
              >
                <Pencil size={14} />
                {t("candidacies.editProfile")}
              </Link>
              <Button
                variant="danger"
                size="sm"
                onClick={handleWithdraw}
                disabled={withdrawing}
              >
                {withdrawing ? t("candidacies.withdrawing") : t("candidacies.withdraw")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
