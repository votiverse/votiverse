/**
 * Locale-aware formatting helpers.
 *
 * All functions derive the locale from i18next's resolved language.
 * Replace any hardcoded toLocaleDateString() or manual "X days ago"
 * logic with these helpers.
 */

import i18n from "i18next";

/** Current resolved locale (falls back to "en"). */
function lang(): string {
  return i18n.language || "en";
}

/** Format a date as "Mar 23, 2026" (medium date style). */
export function formatDate(date: Date | string | number): string {
  return new Intl.DateTimeFormat(lang(), {
    dateStyle: "medium",
  }).format(new Date(date));
}

/** Format a date + time as "Mar 23, 2026, 3:45 PM". */
export function formatDateTime(date: Date | string | number): string {
  return new Intl.DateTimeFormat(lang(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Format a number with locale-appropriate grouping (e.g., 1,234 or 1.234). */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(lang()).format(n);
}

/** Format a number as a percentage (e.g., 0.75 → "75%"). */
export function formatPercent(n: number): string {
  return new Intl.NumberFormat(lang(), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * Format a relative time ("in 3 days", "2 hours ago", "yesterday").
 * Uses Intl.RelativeTimeFormat with `numeric: "auto"` for natural phrasing.
 */
export function formatRelativeTime(date: Date | string | number): string {
  const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: "auto" });
  const diff = new Date(date).getTime() - Date.now();
  const absDiff = Math.abs(diff);

  if (absDiff < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (absDiff < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (absDiff < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}
