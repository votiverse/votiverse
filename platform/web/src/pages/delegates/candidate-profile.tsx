import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../../hooks/use-api.js";
import * as api from "../../api/client.js";
import type { Candidacy, EndorsementCounts } from "../../api/types.js";
import { Card, CardBody, CardHeader, Badge, Button, Spinner } from "../../components/ui.js";
import { Avatar } from "../../components/avatar.js";
import { NotesList } from "../../components/community-notes.js";
import { EndorseButton } from "../../components/endorse-button.js";
import { ChevronLeft, ExternalLink, Link2 } from "lucide-react";
import { CandidateNavigator } from "./candidate-navigator.js";
import { bannerGradient } from "./utils.js";

const MarkdownViewer = lazy(() =>
  import("../../components/markdown-editor.js").then((m) => ({ default: m.MarkdownViewer })),
);

export function CandidateProfile({
  groupId,
  candidacyId,
  candidacies,
  nameMap,
  topicNameMap,
  onDelegate,
  onNavigate,
  onBack,
}: {
  groupId: string;
  candidacyId: string;
  candidacies: Candidacy[];
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  onDelegate: (targetId: string, targetName: string, candidacyTopics: string[]) => void;
  onNavigate: (candidacyId: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("governance");

  // Endorsement state — fetched per candidacy, with optimistic local updates
  const { data: endorsementData } = useApi(
    () => api.getEndorsements(groupId, "candidacy", [candidacyId]),
    [groupId, candidacyId],
  );
  const [localEndorsement, setLocalEndorsement] = useState<EndorsementCounts | null>(null);
  const endorsement: EndorsementCounts = localEndorsement
    ?? endorsementData?.endorsements?.[candidacyId]
    ?? { endorse: 0, dispute: 0, my: null };

  // List-level candidacy data (immediate — from parent)
  const listCandidacy = candidacies.find((c) => c.id === candidacyId);
  const participantId = listCandidacy?.participantId ?? "";
  const name = nameMap.get(participantId) ?? "";
  const title = listCandidacy?.title ?? null;
  const firstName = name.split(" ")[0] ?? name;

  // Full content (lazy-loaded)
  const { data: fullCandidacy, loading } = useApi(
    () => api.getCandidacy(groupId, candidacyId),
    [groupId, candidacyId],
  );

  const websiteUrl = fullCandidacy?.websiteUrl ?? listCandidacy?.websiteUrl ?? null;
  const topicScope = listCandidacy?.topicScope ?? [];
  const linkCopiedKey = `link-copied-${candidacyId}`;

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/group/${groupId}/candidacies/${candidacyId}`;
    await navigator.clipboard.writeText(url);
    // Brief visual feedback via button text change handled by state if needed
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Top nav: back + navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
        >
          <ChevronLeft size={16} />
          {t("delegates.allCandidates")}
        </button>
        <CandidateNavigator
          candidacies={candidacies}
          currentId={candidacyId}
          nameMap={nameMap}
          onNavigate={onNavigate}
        />
      </div>

      {/* Profile header card */}
      <Card className="overflow-hidden">
        {/* Banner gradient */}
        <div
          className="h-20 opacity-80"
          style={{ background: bannerGradient(name) }}
        />
        <CardBody className="relative px-5 pb-5 pt-0">
          {/* Avatar overlapping banner */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 -mt-10 mb-4">
            <Avatar
              name={name}
              size="xl"
              className="w-20 h-20 text-2xl shadow-md border-4 border-surface-raised"
            />
            <Badge color="blue">{t("delegates.officialCandidate")}</Badge>
          </div>

          {/* Name + title */}
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight">
            {name}
          </h1>
          {title && (
            <p className="text-sm font-medium text-text-muted uppercase tracking-wider mt-0.5">
              {title}
            </p>
          )}

          {/* Website link */}
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

          {/* Topic badges */}
          {topicScope.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {topicScope.map((tId) => (
                <Badge key={tId} color="blue">
                  {topicNameMap.get(tId) ?? tId.slice(0, 8)}
                </Badge>
              ))}
            </div>
          )}

          {/* Vote transparency */}
          {listCandidacy?.voteTransparencyOptIn && (
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
          {loading ? (
            <div className="py-6 flex justify-center"><Spinner /></div>
          ) : fullCandidacy?.content?.markdown ? (
            <Suspense fallback={<div className="py-6 flex justify-center"><Spinner /></div>}>
              <div className="prose prose-sm max-w-none text-text-secondary">
                <MarkdownViewer content={fullCandidacy.content.markdown} />
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
          <NotesList groupId={groupId} targetType="candidacy" targetId={candidacyId} />
        </CardBody>
      </Card>

      {/* Sticky action footer */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-surface-raised/95 backdrop-blur-md border-t border-border-default z-40">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <EndorseButton
            groupId={groupId}
            targetType="candidacy"
            targetId={candidacyId}
            counts={endorsement}
            onUpdate={setLocalEndorsement}
          />
          <div className="flex-1" />
          <Button variant="secondary" onClick={handleCopyLink} className="flex items-center gap-1.5">
            <Link2 size={14} />
            {t("delegates.copyLink")}
          </Button>
          <Button onClick={() => onDelegate(participantId, name, topicScope)}>
            {t("delegates.delegateTo", { name: firstName })}
          </Button>
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
