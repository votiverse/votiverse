/**
 * Locale constants — derived from locales.json (single source of truth).
 */

import localesConfig from "../locales.json";

export const SOURCE_LOCALE = localesConfig.sourceLocale;
export const TARGET_LOCALES = localesConfig.targetLocales;
export const ALL_LOCALES = [SOURCE_LOCALE, ...TARGET_LOCALES] as const;
export type Locale = (typeof ALL_LOCALES)[number];

/** RTL locales — set dir="rtl" on <html> when active. */
export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

/** Native language names for the language picker (always displayed in own language). */
export const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  "pt-BR": "Português (Brasil)",
  de: "Deutsch",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  uk: "Українська",
  ru: "Русский",
  tr: "Türkçe",
  ar: "العربية",
  hi: "हिन्दी",
  zh: "中文",
  "zh-TW": "中文 (繁體)",
  ja: "日本語",
  ko: "한국어",
  th: "ไทย",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
};
