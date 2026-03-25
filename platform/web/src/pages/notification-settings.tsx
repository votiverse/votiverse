/**
 * Notification settings page — manage notification preferences.
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { NotificationPreferences } from "../api/types.js";
import { Card, CardHeader, CardBody, Label, Select, Spinner, ErrorBox } from "../components/ui.js";

export function NotificationSettings() {
  const { t } = useTranslation("settings");
  const { data, loading, error, refetch } = useApi(
    () => api.getNotificationPreferences(),
    [],
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const prefs = data?.preferences ?? null;

  const handleChange = useCallback(
    async (key: keyof NotificationPreferences, value: string) => {
      setSaving(key);
      setSaveError(null);
      try {
        await api.setNotificationPreference(key, value);
        refetch();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t("saveFailed"));
      } finally {
        setSaving(null);
      }
    },
    [refetch, t],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;
  if (!prefs) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">
        {t("notificationSettings")}
      </h1>

      {saveError && (
        <div className="mb-4 rounded-md bg-error-subtle border border-error p-3">
          <p className="text-sm text-error">{saveError}</p>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-medium text-text-primary">{t("voting.title")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("voting.description")}</p>
        </CardHeader>
        <CardBody className="space-y-5">
          <PreferenceSelect
            label={t("voting.newEvents")}
            description={t("voting.newEventsDescription")}
            value={prefs.notify_new_votes}
            saving={saving === "notify_new_votes"}
            options={[
              { value: "always", label: t("voting.newEventsAlways") },
              { value: "undelegated_only", label: t("voting.newEventsUndelegated") },
              { value: "never", label: t("voting.newEventsNever") },
            ]}
            onChange={(v) => handleChange("notify_new_votes", v)}
          />

          <PreferenceSelect
            label={t("voting.deadlines")}
            description={t("voting.deadlinesDescription")}
            value={prefs.notify_deadlines}
            saving={saving === "notify_deadlines"}
            options={[
              { value: "true", label: t("enabled") },
              { value: "false", label: t("disabled") },
            ]}
            onChange={(v) => handleChange("notify_deadlines", v)}
          />

          <PreferenceSelect
            label={t("voting.results")}
            description={t("voting.resultsDescription")}
            value={prefs.notify_results}
            saving={saving === "notify_results"}
            options={[
              { value: "true", label: t("enabled") },
              { value: "false", label: t("disabled") },
            ]}
            onChange={(v) => handleChange("notify_results", v)}
          />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-medium text-text-primary">{t("surveys.title")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("surveys.description")}</p>
        </CardHeader>
        <CardBody>
          <PreferenceSelect
            label={t("surveys.newSurveys")}
            description={t("surveys.newSurveysDescription")}
            value={prefs.notify_new_surveys}
            saving={saving === "notify_new_surveys"}
            options={[
              { value: "true", label: t("enabled") },
              { value: "false", label: t("disabled") },
            ]}
            onChange={(v) => handleChange("notify_new_surveys", v)}
          />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-medium text-text-primary">{t("admin.title")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("admin.description")}</p>
        </CardHeader>
        <CardBody className="space-y-5">
          <PreferenceSelect
            label={t("admin.joinRequests")}
            description={t("admin.joinRequestsDescription")}
            value={prefs.notify_admin_join_requests}
            saving={saving === "notify_admin_join_requests"}
            options={[
              { value: "true", label: t("enabled") },
              { value: "false", label: t("disabled") },
            ]}
            onChange={(v) => handleChange("notify_admin_join_requests", v)}
          />

          <PreferenceSelect
            label={t("admin.newMembers")}
            description={t("admin.newMembersDescription")}
            value={prefs.notify_admin_new_members}
            saving={saving === "notify_admin_new_members"}
            options={[
              { value: "true", label: t("enabled") },
              { value: "false", label: t("disabled") },
            ]}
            onChange={(v) => handleChange("notify_admin_new_members", v)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-text-primary">{t("channel.title")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("channel.description")}</p>
        </CardHeader>
        <CardBody>
          <PreferenceSelect
            label={t("channel.label")}
            description={t("channel.labelDescription")}
            value={prefs.notify_channel}
            saving={saving === "notify_channel"}
            options={[
              { value: "email", label: t("channel.email") },
              { value: "sms", label: t("channel.sms") },
              { value: "both", label: t("channel.both") },
              { value: "none", label: t("channel.none") },
            ]}
            onChange={(v) => handleChange("notify_channel", v)}
          />
          {prefs.notify_channel === "none" && (
            <p className="mt-3 text-sm text-warning-text bg-warning-subtle border border-warning-border rounded-md p-3">
              {t("channel.disabledWarning")}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function PreferenceSelect({
  label,
  description,
  value,
  options,
  saving,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  saving: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="text-xs text-text-muted mb-1.5">{description}</p>
      <div className="relative">
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          className={saving ? "opacity-60" : ""}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        {saving && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-accent" />
          </div>
        )}
      </div>
    </div>
  );
}
