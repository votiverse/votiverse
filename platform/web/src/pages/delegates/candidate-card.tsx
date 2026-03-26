import { useTranslation } from "react-i18next";
import type { Candidacy, EndorsementCounts } from "../../api/types.js";
import { Card, CardBody, Badge } from "../../components/ui.js";
import { Avatar } from "../../components/avatar.js";
import { EndorseScore } from "../../components/endorse-button.js";

export function CandidateCard({
  candidacy,
  name,
  topicNameMap,
  endorsement,
  onClick,
}: {
  candidacy: Candidacy;
  name: string;
  topicNameMap: Map<string, string>;
  endorsement?: EndorsementCounts;
  onClick: () => void;
}) {
  const { t } = useTranslation("governance");
  const title = candidacy.title ?? null;

  return (
    <Card
      className="group cursor-pointer hover:border-accent-border transition-colors"
      onClick={onClick}
    >
      <CardBody className="p-5">
        {/* Header: avatar + name + badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={name}
              size="md"
              className="shrink-0 group-hover:ring-2 group-hover:ring-accent-border transition-shadow"
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">{name}</h3>
              {title && (
                <p className="text-xs text-text-muted truncate">{title}</p>
              )}
            </div>
          </div>
          <Badge color="blue" className="shrink-0">{t("delegates.candidateLabel")}</Badge>
        </div>

        {/* Footer: topic badges + endorsement score */}
        <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
          <div className="flex flex-wrap gap-1.5">
            {candidacy.topicScope.slice(0, 3).map((tId) => (
              <span
                key={tId}
                className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary bg-surface-sunken px-2 py-0.5 rounded-md border border-border-default truncate max-w-[140px]"
              >
                {topicNameMap.get(tId) ?? tId.slice(0, 8)}
              </span>
            ))}
            {candidacy.topicScope.length > 3 && (
              <span className="text-[10px] text-text-tertiary">
                +{candidacy.topicScope.length - 3}
              </span>
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
