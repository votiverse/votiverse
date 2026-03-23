/**
 * Vitest setup — provides a mock for react-i18next so that `useTranslation()`
 * works in component tests without a full i18n backend.
 *
 * The mock `t()` function loads the English JSON files at startup and returns
 * the English string for each key, supporting interpolation and cross-namespace
 * references (e.g., `t("common:cancel")`).
 */
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Load all English namespace JSON files
const LOCALE_DIR = join(__dirname, "..", "public", "locales", "en");
const namespaces: Record<string, Record<string, string>> = {};

for (const ns of ["common", "governance", "notifications", "onboarding", "auth", "settings"]) {
  try {
    const raw = readFileSync(join(LOCALE_DIR, `${ns}.json`), "utf-8");
    namespaces[ns] = JSON.parse(raw) as Record<string, string>;
  } catch {
    namespaces[ns] = {};
  }
}

function resolve(key: string, defaultNs: string, options?: Record<string, unknown>): string {
  let ns = defaultNs;
  let lookupKey = key;

  // Cross-namespace reference: "governance:notes.title"
  if (key.includes(":")) {
    const [prefix, ...rest] = key.split(":");
    ns = prefix!;
    lookupKey = rest.join(":");
  }

  let value = namespaces[ns]?.[lookupKey] ?? key;

  // Interpolation: replace {{var}} with options values
  if (options) {
    for (const [k, v] of Object.entries(options)) {
      if (k === "defaultValue" || k === "ns") continue;
      value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }

  return value;
}

vi.mock("react-i18next", () => ({
  useTranslation: (nsArg?: string | string[]) => {
    const defaultNs = Array.isArray(nsArg) ? nsArg[0]! : (nsArg ?? "common");
    return {
      t: (key: string, options?: Record<string, unknown>) => resolve(key, defaultNs, options),
      i18n: {
        language: "en",
        changeLanguage: vi.fn(),
      },
    };
  },
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
