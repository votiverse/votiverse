/**
 * Compact locale picker — used on the login page before authentication.
 *
 * Shows a globe icon + current locale code. Clicking opens a dropdown
 * with all supported locales in their native names.
 */

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { ALL_LOCALES, LOCALE_NAMES, RTL_LOCALES } from "../locales.js";

export function LocalePicker() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLocale = i18n.language?.split("-")[0] ?? "en";
  const displayCode = currentLocale.toUpperCase();

  const handleSelect = (locale: string) => {
    void i18n.changeLanguage(locale);
    localStorage.setItem("i18n-locale", locale);
    document.documentElement.dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors rounded-md hover:bg-interactive-active cursor-pointer"
        aria-label="Change language"
      >
        <Globe size={16} />
        <span className="font-medium">{displayCode}</span>
      </button>
      {open && (
        <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-1 w-56 max-h-80 overflow-y-auto bg-surface-overlay border border-border-default rounded-lg shadow-lg z-30 py-1">
          {ALL_LOCALES.map((locale) => {
            const isActive = i18n.language === locale || i18n.language?.startsWith(locale);
            return (
              <button
                key={locale}
                onClick={() => handleSelect(locale)}
                className={`w-full text-left rtl:text-right px-3 py-2 text-sm transition-colors cursor-pointer ${
                  isActive
                    ? "text-accent-text font-medium bg-accent-subtle"
                    : "text-text-secondary hover:bg-interactive-hover"
                }`}
              >
                {LOCALE_NAMES[locale] ?? locale}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
