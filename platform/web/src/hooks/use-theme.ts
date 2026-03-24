/**
 * Theme hook — manages light/dark theme state.
 *
 * Supports three modes: "light", "dark", "system" (OS preference).
 * Persists choice to localStorage. Applies `.dark` class to <html>.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeCtx {
  /** User's theme preference. */
  mode: ThemeMode;
  /** What's actually applied (resolves "system" to light or dark). */
  resolved: ResolvedTheme;
  /** Change the theme mode. */
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "votiverse:theme";

function getSystemPreference(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return getSystemPreference();
  return mode;
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // Update color-scheme so native elements (scrollbars, inputs) match
  document.documentElement.style.colorScheme = resolved;
}

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export const ThemeContext = createContext<ThemeCtx>({
  mode: "system",
  resolved: "light",
  setMode: () => {},
});

export function useThemeProvider(): ThemeCtx {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()));

  // Listen for OS preference changes (only matters when mode is "system")
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (mode === "system") {
        const r = getSystemPreference();
        setResolved(r);
        applyTheme(r);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, newMode);
    setModeState(newMode);
    const r = resolveTheme(newMode);
    setResolved(r);
    applyTheme(r);
  }, []);

  return { mode, resolved, setMode };
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}

/**
 * Synchronous theme bootstrap — call before React mounts to prevent FOUC.
 * This reads localStorage and applies the `.dark` class immediately.
 */
export function bootstrapTheme(): void {
  const mode = readStoredMode();
  const resolved = resolveTheme(mode);
  applyTheme(resolved);
}
