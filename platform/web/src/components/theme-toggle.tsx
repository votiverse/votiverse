/**
 * Compact theme toggle — three-state (light / system / dark).
 * Designed for use in dropdown menus and settings.
 */

import { Sun, Monitor, Moon } from "lucide-react";
import { useTheme, type ThemeMode } from "../hooks/use-theme.js";
import { useTranslation } from "react-i18next";

const MODES: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "system", Icon: Monitor },
  { mode: "dark", Icon: Moon },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation("settings");

  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-sunken p-1">
      {MODES.map(({ mode: m, Icon }) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
            mode === m
              ? "bg-surface-raised text-accent-text shadow-sm"
              : "text-text-muted hover:text-text-secondary"
          }`}
          title={t(`appearance.${m}`)}
          aria-label={t(`appearance.${m}`)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
