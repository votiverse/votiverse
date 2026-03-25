/**
 * Handle picker interstitial — shown after first social login.
 *
 * Displays the auto-generated handle and lets the user accept or change it.
 * Real-time availability checking with debounce.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Spinner } from "./ui.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface HandlePickerProps {
  defaultHandle: string | null;
  onComplete: () => void;
}

export function HandlePicker({ defaultHandle, onComplete }: HandlePickerProps) {
  const { t } = useTranslation("auth");
  const [handle, setHandle] = useState(defaultHandle ?? "");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAvailability = useCallback(async (h: string) => {
    if (h.length < 3) { setAvailable(null); return; }
    try {
      const res = await fetch(`${BASE_URL}/auth/check-handle/${encodeURIComponent(h)}`);
      if (res.ok) {
        const data = await res.json() as { available: boolean };
        setAvailable(data.available);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (handle.length < 3) return;
    const timer = setTimeout(() => checkAvailability(handle), 400);
    return () => clearTimeout(timer);
  }, [handle, checkAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle || handle.length < 3) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${BASE_URL}/me/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ handle }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } };
        throw new Error(data.error?.message ?? "Failed to save handle");
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common:error.generic"));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--overlay-backdrop)] flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold font-display text-text-primary">{t("completeProfile")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("chooseHandleDesc")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="handle-picker" className="block text-sm font-medium text-text-secondary mb-1">
              {t("label.handle")}
              {available === true && handle.length >= 3 && (
                <span className="ml-2 text-success-text text-xs font-normal">{t("handle.available")}</span>
              )}
              {available === false && (
                <span className="ml-2 text-error-text text-xs font-normal">{t("handle.taken")}</span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">@</span>
              <Input
                id="handle-picker"
                type="text"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  setAvailable(null);
                }}
                placeholder="your-handle"
                className="pl-7"
                minLength={3}
                maxLength={30}
                autoFocus
              />
            </div>
            <p className="text-xs text-text-tertiary mt-1">{t("handle.hint")}</p>
          </div>

          {error && <p className="text-sm text-error-text">{error}</p>}

          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onComplete} className="flex-1">
              {t("common:skip")}
            </Button>
            <Button type="submit" disabled={submitting || available === false} className="flex-1">
              {submitting ? <Spinner /> : t("handleAccept")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
