/**
 * Notification settings page — manage notification preferences.
 */

import { useState, useCallback } from "react";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { NotificationPreferences } from "../api/types.js";
import { Card, CardHeader, CardBody, Label, Select, Spinner, ErrorBox } from "../components/ui.js";

export function NotificationSettings() {
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
        setSaveError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(null);
      }
    },
    [refetch],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;
  if (!prefs) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
        Notification Settings
      </h1>

      {saveError && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{saveError}</p>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-medium text-gray-900">Voting Notifications</h2>
          <p className="text-sm text-gray-500 mt-1">Control when you hear about voting events</p>
        </CardHeader>
        <CardBody className="space-y-5">
          <PreferenceSelect
            label="New voting events"
            description="When a new vote is created in your assembly"
            value={prefs.notify_new_votes}
            saving={saving === "notify_new_votes"}
            options={[
              { value: "always", label: "Always notify me" },
              { value: "undelegated_only", label: "Only if I haven't delegated" },
              { value: "never", label: "Never" },
            ]}
            onChange={(v) => handleChange("notify_new_votes", v)}
          />

          <PreferenceSelect
            label="Deadline reminders"
            description="24-hour warning before voting or surveys close"
            value={prefs.notify_deadlines}
            saving={saving === "notify_deadlines"}
            options={[
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
            ]}
            onChange={(v) => handleChange("notify_deadlines", v)}
          />

          <PreferenceSelect
            label="Results available"
            description="When voting results become available"
            value={prefs.notify_results}
            saving={saving === "notify_results"}
            options={[
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
            ]}
            onChange={(v) => handleChange("notify_results", v)}
          />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-medium text-gray-900">Survey Notifications</h2>
          <p className="text-sm text-gray-500 mt-1">
            Surveys are how your community collects observations from the ground
          </p>
        </CardHeader>
        <CardBody>
          <PreferenceSelect
            label="New surveys"
            description="When a new survey is created in your assembly"
            value={prefs.notify_new_surveys}
            saving={saving === "notify_new_surveys"}
            options={[
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
            ]}
            onChange={(v) => handleChange("notify_new_surveys", v)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-gray-900">Delivery Channel</h2>
          <p className="text-sm text-gray-500 mt-1">How you want to receive notifications</p>
        </CardHeader>
        <CardBody>
          <PreferenceSelect
            label="Channel"
            description="Choose how notifications reach you"
            value={prefs.notify_channel}
            saving={saving === "notify_channel"}
            options={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
              { value: "both", label: "Email + SMS" },
              { value: "none", label: "None (disable all)" },
            ]}
            onChange={(v) => handleChange("notify_channel", v)}
          />
          {prefs.notify_channel === "none" && (
            <p className="mt-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
              All outbound notifications are disabled. You can still see pending items on your dashboard.
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
      <p className="text-xs text-gray-500 mb-1.5">{description}</p>
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
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-brand" />
          </div>
        )}
      </div>
    </div>
  );
}
