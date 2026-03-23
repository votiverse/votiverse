/**
 * i18n configuration — initializes i18next with HTTP backend and browser detection.
 *
 * Called from main.tsx before React mounts. The user's locale is resolved
 * from the backend /me endpoint (if authenticated) or detected from the
 * browser (if not).
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

declare const __APP_VERSION__: string;

/**
 * Initialize i18next with the given locale (from backend) or undefined
 * (falls back to browser language detection).
 */
export function initI18n(userLocale?: string): Promise<void> {
  return i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // If the backend provides a locale, use it. Otherwise, detect from browser.
      lng: userLocale || undefined,

      fallbackLng: {
        "pt-BR": ["pt", "en"],
        "pt-PT": ["pt", "en"],
        "zh-TW": ["zh", "en"],
        "zh-HK": ["zh", "en"],
        default: ["en"],
      },

      // Preload common namespace. It is also the default.
      ns: ["common"],
      defaultNS: "common",

      // Keys use literal dots ("confirm.title"), not nested objects.
      keySeparator: false,

      interpolation: {
        escapeValue: false, // React already escapes
      },

      backend: {
        loadPath: `/locales/{{lng}}/{{ns}}.json?v=${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}`,
      },

      detection: {
        // Only used when lng is not set (pre-auth pages).
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: "i18n-locale",
      },

      react: {
        useSuspense: true,
      },
    }) as unknown as Promise<void>;
}

export default i18n;
