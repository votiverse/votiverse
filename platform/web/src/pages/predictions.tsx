import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Prediction, TrackRecord } from "../api/types.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";

export function Predictions() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;

  const { data: predictionsData, loading: loadingPred, error: errorPred } = useApi(
    () => participantId ? api.listPredictions(assemblyId!, participantId) : Promise.resolve({ predictions: [] }),
    [assemblyId, participantId],
  );
  const { data: trackRecord, loading: loadingTR, error: errorTR } = useApi(
    () => participantId ? api.getTrackRecord(assemblyId!, participantId) : Promise.resolve(null),
    [assemblyId, participantId],
  );

  const loading = loadingPred || loadingTR;
  const error = errorPred || errorTR;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;

  const predictions = predictionsData?.predictions ?? [];

  if (!participantId) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500">{t("predictions.selectIdentity")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{t("predictions.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("predictions.subtitle")}</p>
      </div>

      {/* Track Record Summary */}
      {trackRecord && (
        <TrackRecordCard record={trackRecord} />
      )}

      {/* Predictions List */}
      {predictions.length === 0 ? (
        <EmptyState
          title={t("predictions.noPredictions")}
          description={t("predictions.noPredictionsDesc")}
        />
      ) : (
        <div className="space-y-3">
          {predictions.map((p) => (
            <PredictionCard key={p.id} prediction={p} assemblyId={assemblyId!} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackRecordCard({ record }: { record: TrackRecord }) {
  const { t } = useTranslation("governance");
  const accuracyPct = Math.round(record.averageAccuracy * 100);

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-medium text-gray-900">{t("predictions.yourTrackRecord")}</h2>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-semibold text-gray-900">{record.totalPredictions}</div>
            <div className="text-xs text-gray-500 mt-0.5">{t("predictions.total")}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-900">{record.evaluatedPredictions}</div>
            <div className="text-xs text-gray-500 mt-0.5">{t("predictions.evaluated")}</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${accuracyPct >= 70 ? "text-green-600" : accuracyPct >= 40 ? "text-amber-600" : "text-gray-400"}`}>
              {record.evaluatedPredictions > 0 ? `${accuracyPct}%` : "—"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{t("predictions.accuracy")}</div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function PredictionCard({ prediction }: { prediction: Prediction; assemblyId: string }) {
  const { t } = useTranslation("governance");
  const claim = prediction.claim;
  const patternType = Object.keys(claim.pattern)[0] ?? "unknown";

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900">{claim.variable}</p>
            <p className="text-xs text-gray-500 mt-1">
              <Badge color="gray">{patternType}</Badge>
              {claim.methodology && (
                <span className="ml-2 text-gray-400">{t("predictions.measuredBy", { methodology: claim.methodology })}</span>
              )}
            </p>
          </div>
          <span className="text-xs text-gray-400 shrink-0">
            {formatDate(prediction.committedAt)}
          </span>
        </div>
        <div className="mt-2 text-xs text-gray-400 font-mono truncate">
          {t("predictions.hash", { hash: prediction.commitmentHash.slice(0, 16) })}
        </div>
      </CardBody>
    </Card>
  );
}
