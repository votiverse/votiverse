/**
 * Appearance settings page — select theme (light / dark / system).
 */

import { useTranslation } from "react-i18next";
import { Sun, Monitor, Moon } from "lucide-react";
import { Card, CardHeader, CardBody } from "../components/ui.js";
import { useTheme, type ThemeMode } from "../hooks/use-theme.js";

const MODES: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "system", Icon: Monitor },
  { mode: "dark", Icon: Moon },
];

export function AppearanceSettings() {
  const { t } = useTranslation("settings");
  const { mode, setMode } = useTheme();

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-text-primary mb-6">
        {t("appearance.title")}
      </h1>

      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-text-primary">{t("appearance.theme")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("appearance.description")}</p>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MODES.map(({ mode: m, Icon }) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  m === mode
                    ? "border-accent bg-accent-subtle text-accent-strong-text font-medium"
                    : "border-border-default hover:border-border-strong hover:bg-interactive-hover text-text-secondary"
                }`}
              >
                <Icon size={20} />
                <span className="text-sm">{t(`appearance.${m}`)}</span>
                {m === mode && (
                  <span className="ml-auto text-xs text-accent-text">✓</span>
                )}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
