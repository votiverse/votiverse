/**
 * Language settings page — select preferred language.
 *
 * Saves the locale to the backend via PUT /me/profile, then reloads
 * the page so the bootstrap picks up the new locale from /me.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardBody, Spinner } from "../components/ui.js";
import { ALL_LOCALES, LOCALE_NAMES } from "../locales.js";
import * as api from "../api/client.js";

export function LanguageSettings() {
  const { t, i18n } = useTranslation("settings");
  const currentLocale = i18n.language;
  const [saving, setSaving] = useState(false);

  const handleChange = async (newLocale: string) => {
    if (newLocale === currentLocale) return;
    setSaving(true);
    try {
      await api.updateProfile({ locale: newLocale });
      // Reload — the bootstrap will fetch /me and init i18n with the new locale
      window.location.reload();
    } catch {
      setSaving(false);
    }
  };

  if (saving) return <Spinner />;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
        {t("language.title")}
      </h1>

      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-gray-900">{t("language.preferred")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("language.description")}</p>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_LOCALES.map((locale) => (
              <button
                key={locale}
                onClick={() => handleChange(locale)}
                className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                  locale === currentLocale
                    ? "border-brand bg-brand-50 text-brand-dark font-medium"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                }`}
              >
                <span className="text-sm">{LOCALE_NAMES[locale] ?? locale}</span>
                {locale === currentLocale && (
                  <span className="ml-2 text-xs text-brand">✓</span>
                )}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
