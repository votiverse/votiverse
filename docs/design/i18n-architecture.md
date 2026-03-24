# Votiverse i18n Architecture

## Overview

This document defines the internationalization (i18n) strategy for the Votiverse web client.

### Application Context

- **SPA architecture**: The app is a single-page application built with Vite 8, React 19, and TypeScript. There is no server-side rendering (SSR) and no static site generation (SSG). All routing is client-side.
- **Auth-gated**: The entire app requires authentication except for the login page and public invite previews. There is a backend with a `users` table that will store each user's locale preference.
- **Current state**: The codebase is English-only with hardcoded strings across ~30 page components and ~50 shared UI components. It needs to support 20+ languages.
- **Translation management**: Translations will be managed via AI pipelines operating on plain JSON files. The format must be LLM-friendly (flat key-value JSON, no ICU MessageFormat).

### Key Design Assumption: Reload on Language Switch Is Acceptable

When the user changes their language in settings, the app performs a full page reload (`window.location.reload()`). This is an intentional simplification that eliminates the need for reactive locale switching — no global state subscriptions, no re-renders cascading through the component tree, no risk of stale translations in unmounted-but-cached components. The reload guarantees a clean slate: the app re-bootstraps, fetches the user's updated locale from the backend, loads the correct translation files, and renders from scratch. This assumption shaped every decision in this document, from library choice to initialization flow.

## Stack

| Component | Choice | Why |
|---|---|---|
| Core library | `i18next` | Framework-agnostic, mature, supports namespaces, fallback chains, and lazy loading |
| React binding | `react-i18next` | De facto standard; supports React 19, Suspense, hooks API |
| Translation loading | `i18next-http-backend` | Loads only the active locale's JSON files on demand — no locale data in the JS bundle |
| Language detection (pre-auth) | `i18next-browser-languagedetector` | Detects `navigator.language` for pages rendered before the user is authenticated |

## Install

```bash
cd platform/web
pnpm add i18next react-i18next i18next-http-backend i18next-browser-languagedetector
```

## Directory Structure

All i18n artifacts live inside `platform/web/`, since the engine packages and VCP have no user-facing strings.

```
platform/web/
  locales.json                    ← single source of truth for supported languages
  public/
    locales/
      en/
        common.json               ← source of truth for all translations
        auth.json
        governance.json
        settings.json
        onboarding.json
        notifications.json
      fr/
        common.json               ← translated values
        auth.json
        governance.json
        settings.json
        onboarding.json
        notifications.json
        _manifest.json            ← tracks which en hash each translation was derived from
      ja/
        ...
        _manifest.json
  scripts/
    i18n/
      translate.ts                ← translation pipeline CLI script
      translation-prompt.md       ← LLM prompt template
```

Each locale gets its own directory. Each namespace is a separate JSON file. The `en` locale is the source of truth and must always be complete. Target locale directories also contain a `_manifest.json` for staleness tracking (see Translation Pipeline section).

## Namespace Strategy

Namespaces are organized by **domain concern**, not by route or component. Components are reused across pages, so route-based splitting would create ambiguity.

| Namespace | Contents |
|---|---|
| `common` | Shared UI: buttons, labels, form validation messages, errors, confirmations, empty states, date/time labels |
| `auth` | Login, signup, password reset, email verification |
| `governance` | Proposals, voting, delegates, delegation, surveys, predictions, community notes, topics, awareness |
| `onboarding` | Invite pages, join requests, handle setup, avatar picker, multi-step onboarding dialog, group preview |
| `notifications` | Notification bell, notification feed, notification preferences, notification types and urgency labels |
| `settings` | Account settings, profile editing, language picker |

Add new namespaces as the domain grows. A namespace should map to a bounded context, not a UI surface.

### Namespace Loading

- `common` is preloaded on every page via the i18next config (`ns` and `defaultNS`).
- Other namespaces are loaded on demand when a component calls `useTranslation('governance')`.
- Most components only need `useTranslation()` with no arguments (uses `defaultNS: 'common'`).

## Key Convention

Flat keys with dot notation. Keys are literal strings in the JSON — no nested objects.

```json
{
  "save": "Save",
  "cancel": "Cancel",
  "confirm.title": "Are you sure?",
  "confirm.message": "This action cannot be undone.",
  "error.generic": "Something went wrong. Please try again.",
  "error.network": "Unable to connect. Check your internet connection."
}
```

### Key Naming Rules

- Use dot notation to express hierarchy: `section.element.variant`
- Use lowercase with dots as separators
- Keep keys descriptive but concise
- Plurals use i18next's suffix convention: `items_one`, `items_other`
- Interpolation uses double braces in values: `"greeting": "Hello, {{name}}"`

## i18next Configuration

```typescript
// src/i18n.ts

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

// The locale resolved from the backend user profile.
// Injected by the bootstrap layer in main.tsx before React mounts.
// Falls back to undefined for pre-auth pages (login), where the detector takes over.
export function initI18n(userLocale?: string) {
  return i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // If the backend provides a locale, use it. Otherwise, detect from browser.
      lng: userLocale || undefined,

      fallbackLng: {
        'pt-BR': ['pt', 'en'],
        'pt-PT': ['pt', 'en'],
        'zh-TW': ['zh', 'en'],
        'zh-HK': ['zh', 'en'],
        default: ['en'],
      },

      // Preload common namespace. It is also the default.
      ns: ['common'],
      defaultNS: 'common',

      // Keys use literal dots ("confirm.title"), not nested objects.
      keySeparator: false,

      interpolation: {
        escapeValue: false, // React already escapes
      },

      backend: {
        loadPath: '/locales/{{lng}}/{{ns}}.json',
      },

      detection: {
        // Only used when lng is not set (pre-auth pages).
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18n-locale',
      },

      react: {
        useSuspense: true,
      },
    });
}
```

## App Integration

### Bootstrap: Locale Resolution Before React

The critical constraint is: **i18next must be initialized with the user's locale before React renders any translated content.** This avoids a flash of the wrong language.

The solution is a vanilla JavaScript layer that runs before `createRoot()`. The bootstrap fetches `/me` (which succeeds if the user has a valid session cookie/token), extracts the locale, and initializes i18n. Only then does React mount.

```tsx
// src/main.tsx

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from './i18n';
import { App } from './app';
import { ErrorBoundary } from './components/error-boundary';
import './index.css';

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

async function bootstrap() {
  // 1. Attempt to resolve the user's locale before React mounts.
  //    If authenticated, /me returns the user profile including locale.
  //    If not (login page, expired session), this fails silently
  //    and i18next falls back to browser language detection.
  let userLocale: string | undefined;
  try {
    const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
    const res = await fetch(`${BASE_URL}/me`, { credentials: 'include' });
    if (res.ok) {
      const me = await res.json();
      userLocale = me.locale;
    }
  } catch {
    // Not authenticated or network error — browser detection will handle it.
  }

  // 2. Initialize i18n with the resolved locale (or undefined for detection).
  await initI18n(userLocale);

  // 3. Set document direction for RTL locales.
  const resolvedLocale = userLocale || navigator.language?.split('-')[0] || 'en';
  document.documentElement.dir = RTL_LOCALES.has(resolvedLocale) ? 'rtl' : 'ltr';
  document.documentElement.lang = resolvedLocale;

  // 4. Mount React. Translations are ready — no flash of wrong language.
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrap();
```

**Why this works:** The current identity hook (`use-identity.ts`) already calls `getMe()` on mount to check for an existing session. The bootstrap's `/me` call is a small duplication (same lightweight JSON payload), but it runs in vanilla JS before React exists, guaranteeing the locale is known before any component renders. The identity hook's second call is still needed for React state (user name, memberships, etc.) — it will hit the browser's HTTP cache on the second request.

**Optimization opportunity:** If the double `/me` fetch matters, the bootstrap can stash the full response (e.g., on `window.__VOTIVERSE_BOOTSTRAP__`) and the identity hook can read it instead of re-fetching. This is an implementation detail, not an architectural decision.

### Language Switch

When the user changes their language in settings:

```typescript
async function changeLanguage(newLocale: string) {
  // 1. Persist to backend
  await patchUserProfile({ locale: newLocale });

  // 2. Reload the page. On reload, the bootstrap flow will
  //    fetch the updated profile and init i18next with the new locale.
  window.location.reload();
}
```

No need for client-side reactive language switching. The reload ensures a clean state.

## Usage in Components

### Basic (90% of cases)

```tsx
import { useTranslation } from 'react-i18next';

function SaveButton() {
  const { t } = useTranslation();
  return <button>{t('save')}</button>;
}
```

No arguments needed. Uses `common` namespace by default.

### With a specific namespace

```tsx
function ProposalHeader({ title }: { title: string }) {
  const { t } = useTranslation('governance');
  return (
    <header>
      <h1>{title}</h1>
      <span>{t('proposal.status.active')}</span>
    </header>
  );
}
```

### With interpolation

```tsx
// common.json: { "welcome": "Welcome, {{name}}" }
const { t } = useTranslation();
return <p>{t('welcome', { name: user.displayName })}</p>;
```

### With plurals

```json
{
  "vote_one": "{{count}} vote",
  "vote_other": "{{count}} votes"
}
```

```tsx
const { t } = useTranslation('governance');
return <span>{t('vote', { count: proposal.voteCount })}</span>;
```

**Important:** The English source files only need `_one` and `_other` suffixes. The translation pipeline is responsible for generating all plural forms required by the target language (e.g., Arabic has six: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`; Polish has three). The LLM prompt template instructs the translator to expand plural forms as needed.

### With rich markup (rare — use sparingly)

```tsx
import { Trans } from 'react-i18next';

// common.json: { "terms": "By continuing you agree to the <link>terms of service</link>." }
<Trans
  i18nKey="terms"
  components={{ link: <a href="/terms" /> }}
/>
```

## Type-Safe Translation Keys

This is a strict TypeScript codebase (`"strict": true`, no `any` types). Translation keys should be type-checked at compile time so that `t('nonexistent.key')` is a compile error.

`react-i18next` supports this via module augmentation. Add a type declaration file:

```typescript
// src/i18n.d.ts

import 'i18next';
import type common from '../public/locales/en/common.json';
import type auth from '../public/locales/en/auth.json';
import type governance from '../public/locales/en/governance.json';
import type onboarding from '../public/locales/en/onboarding.json';
import type notifications from '../public/locales/en/notifications.json';
import type settings from '../public/locales/en/settings.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
      governance: typeof governance;
      onboarding: typeof onboarding;
      notifications: typeof notifications;
      settings: typeof settings;
    };
  }
}
```

When a new namespace is added, add its type import here. The English JSON files are the single source of truth for both translations and types.

## Locale Source of Truth

| Context | Source | Mechanism |
|---|---|---|
| Authenticated user | Backend `users` table | `locale` column, returned in `/me` profile response |
| Pre-auth (login, invite preview) | Browser | `navigator.language`, cached in `localStorage` |
| Language switch | Backend | PATCH user profile → reload page |

The backend is the single source of truth for authenticated users. Do not store the locale in JWT (immutable until reissued) or cookies (parallel state channel). The backend sends the locale as part of the `/me` response, and the bootstrap layer initializes i18next with that value before React mounts.

### Backend Changes Required

The backend `users` table currently has no `locale` column. The following changes are needed:

1. **New migration** (`NNN_add_locale.sqlite.sql` + `NNN_add_locale.postgres.sql`):
   ```sql
   ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
   ```
2. **Update `UserService`** to include `locale` in the `User` type and queries.
3. **Update `GET /me`** to include `locale` in the response.
4. **Update `PUT /me/profile`** to accept `locale` as a writable field (validated against `locales.json`).
5. **Update `MeResponse`** type in `platform/web/src/api/auth.ts` to include `locale`.

## Fallback Strategy

i18next resolves translations in this order:

1. Exact locale match (e.g., `pt-BR`)
2. Base language (e.g., `pt`)
3. English (`en`)

If a key is missing in the active locale, the user sees the English fallback — never a raw key. The `en` locale must be 100% complete at all times.

## Date, Number, and Relative Time Formatting

String translation is only part of i18n. The app displays dates (voting timelines, event windows, notification timestamps), numbers (vote counts, delegation weights, quorum percentages), and relative times ("3 days left", "closes tomorrow") throughout the UI.

Use the browser's built-in `Intl` APIs, passing the active locale:

```typescript
// src/lib/format.ts

import i18n from 'i18next';

export function formatDate(date: Date | string | number): string {
  return new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | number): string {
  return new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(i18n.language).format(n);
}

export function formatPercent(n: number): string {
  return new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatRelativeTime(date: Date | string | number): string {
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  const diff = new Date(date).getTime() - Date.now();
  const absDiff = Math.abs(diff);

  if (absDiff < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (absDiff < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (absDiff < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}
```

These functions derive the locale from i18next's resolved language — no extra parameter passing needed. Replace any hardcoded `toLocaleDateString()` calls or manual "X days ago" logic with these helpers during migration.

## Translation Pipeline

### Principles

- English (`en`) is always the source of truth. All other locales are derived from it.
- Staleness is detected by **content-addressable hashing**: a short hash of the English source value is stored in a per-locale manifest. When the English value changes, the hash misses, and the key is marked stale.
- The pipeline is a single CLI script that can translate all locales, a single locale, or a single namespace. It supports `--dry-run` for inspection.
- The LLM translation prompt is stored as a separate template file so it can be iterated on without changing script code.

### Translation File Format

Each JSON file is a flat key-value map. This format is optimized for AI translation — no nesting, no ICU syntax, just plain strings with optional interpolation placeholders:

```json
{
  "save": "Save",
  "cancel": "Cancel",
  "confirm.title": "Are you sure?",
  "confirm.message": "This action cannot be undone.",
  "vote_one": "{{count}} vote",
  "vote_other": "{{count}} votes",
  "welcome": "Welcome, {{name}}"
}
```

### Directory Structure with Manifests

Each target locale directory contains its translation JSON files plus a `_manifest.json` that tracks translation provenance. The `en` locale has no manifest — it is the source.

```
platform/web/public/locales/
  en/
    common.json
    auth.json
    governance.json
    settings.json
    onboarding.json
    notifications.json
  fr/
    common.json
    auth.json
    governance.json
    settings.json
    onboarding.json
    notifications.json
    _manifest.json
  ja/
    common.json
    ...
    _manifest.json
```

### Manifest Format

The manifest maps each translated key to the hash of the English source value it was translated from:

```json
{
  "common": {
    "save": { "hash": "a1b2c3d4" },
    "cancel": { "hash": "e5f6a7b8" },
    "confirm.title": { "hash": "c9d0e1f2" }
  },
  "governance": {
    "proposal.status.active": { "hash": "a3b4c5d6" }
  }
}
```

The `hash` is the first 8 characters of the SHA-256 of the English source value. This is deterministic, collision-resistant at this scale, and trivially computable.

### Key Classification Logic

For each key in each target locale, the script classifies it by comparing the current English value's hash against the manifest:

| Condition | Classification | Action |
|---|---|---|
| Key exists in `en`, not in manifest | `new` | Translate and add to manifest |
| Key exists in both, hashes match | `up-to-date` | Skip |
| Key exists in both, hashes differ | `stale` | Re-translate and update manifest |
| Key exists in manifest, not in `en` | `deleted` | Remove from locale JSON and manifest |

### Translation Script

Location: `platform/web/scripts/i18n/translate.ts`

```bash
# Translate all stale and new keys across all target locales
pnpm run translate

# Translate only French
pnpm run translate --locale fr

# Translate only French governance namespace
pnpm run translate --locale fr --namespace governance

# Show what would be translated without making changes
pnpm run translate --dry-run

# Show what would be translated for a specific locale
pnpm run translate --locale ja --dry-run
```

The script's execution flow:

1. Read `locales.json` to determine source and target locales.
2. Load all `en/*.json` namespace files.
3. For each target locale (or the one specified by `--locale`):
   a. Load the locale's `_manifest.json` (create empty if missing).
   b. For each namespace (or the one specified by `--namespace`):
      - Compute the SHA-256 hash (first 8 chars) of each English value.
      - Classify every key as `new`, `stale`, `up-to-date`, or `deleted`.
      - Remove `deleted` keys from the locale's namespace JSON and manifest.
   c. Batch all `new` + `stale` keys and their English values.
   d. If `--dry-run`, print the report and stop.
   e. Send the batch to the LLM with the translation prompt template.
   f. Write the translated values into the locale's namespace JSON files.
   g. Update the manifest with the new hashes.
4. Print a summary per locale: `fr: 3 new, 7 stale, 2 deleted, 140 up-to-date`.

### Translation Prompt Template

Location: `platform/web/scripts/i18n/translation-prompt.md`

This file is loaded by the translation script and interpolated with context for each LLM call. Storing it as a separate file allows iterating on translation quality without changing code.

```markdown
You are a professional translator. Translate the following JSON key-value pairs
from English to {{targetLanguage}}.

Context: These strings belong to the "{{namespace}}" section of a governance
platform called Votiverse — a tool for democratic decision-making within communities
and organizations.

Rules:
- Translate ONLY the values. Return the keys exactly as provided.
- Preserve all `{{placeholder}}` interpolation tokens exactly as-is.
- For plural keys (suffixed `_one`, `_other`, `_zero`, `_few`, `_many`),
  generate all plural forms required by {{targetLanguage}}'s grammar rules,
  even if the English source only has `_one` and `_other`.
- Use a formal register for UI text (e.g., "vous" not "tu" in French,
  "usted" not "tú" in Spanish).
- Output valid JSON only. No markdown fences, no commentary, no trailing commas.

Input:
{{sourceJson}}
```

### Rules for AI Translation (Reference)

These rules are embedded in the prompt template above but listed here for human reference:

- Preserve all keys exactly as-is.
- Preserve all `{{interpolation}}` placeholders exactly as-is.
- Preserve plural suffixes (`_one`, `_other`, `_zero`, `_few`, `_many`) and generate all forms required by the target language's plural rules.
- Translate only the values.
- Output valid JSON with no trailing commas.
- The `en` files are the source of truth. All other locales are derived from them.

## Supported Languages

The single source of truth for which locales exist is a plain JSON file inside the web package. This file is consumed by the app (via import), the translation script, CI, and any other tooling.

```jsonc
// platform/web/locales.json
{
  "sourceLocale": "en",
  "targetLocales": [
    "fr", "es", "pt", "pt-BR", "de", "it", "nl",
    "pl", "uk", "ru", "tr", "ar", "hi", "zh", "zh-TW",
    "ja", "ko", "th", "vi", "id", "ms"
  ]
}
```

The app-side TypeScript type is derived from this file, not the other way around:

```typescript
// src/locales.ts
import localesConfig from '../locales.json';

export const SOURCE_LOCALE = localesConfig.sourceLocale;
export const TARGET_LOCALES = localesConfig.targetLocales;
export const ALL_LOCALES = [SOURCE_LOCALE, ...TARGET_LOCALES] as const;
export type Locale = (typeof ALL_LOCALES)[number];
```

To add or remove a language, edit `locales.json`. Everything else — the language picker, the translation pipeline, validation — derives from it.

## RTL Support

Arabic (`ar`) is included in the supported locales. When the active locale is RTL:

- The bootstrap sets `dir="rtl"` on the `<html>` element before React mounts.
- Tailwind CSS 4.2 (used via `@tailwindcss/vite`) automatically supports the `dir` attribute — `rtl:` variants work without additional configuration.
- The language switch reload ensures the `dir` attribute is set cleanly on initialization.

```typescript
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

function getDirection(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
```

This runs during the bootstrap phase (see App Integration above), before `createRoot()`.

### Known Issue: Bidirectional Text in Interpolated Strings

When Arabic (or another RTL language) is active, translated strings that embed LTR content via interpolation (e.g., `"2 votes need you"` where the number and English event title are injected) can produce mixed-directionality rendering. The browser's Unicode Bidirectional Algorithm handles most cases, but complex interpolations — especially those mixing numbers, English proper nouns, and Arabic text — can appear visually disordered.

**Potential fixes (not yet implemented):**
- Add `dir="auto"` on specific elements that contain interpolated mixed-direction content (e.g., the attention banner, countdown strings, event titles). This lets the browser infer direction from the first strong character.
- Wrap LTR interpolation values with Unicode bidi isolation characters (`U+2066` LRI / `U+2069` PDI) in the translation strings themselves, e.g., `"⁦{{count}}⁩ أصوات تحتاج إليك"`.
- Use the `<bdi>` HTML element around interpolated values when rendering with `<Trans>` components.

This is a cosmetic polish issue, not a functional blocker. The translated text is correct — only the visual ordering is occasionally off in specific interpolation patterns.

## Cache-Busting for Translation Files

Translation JSON files are served from `public/locales/` as static assets. After a deploy with updated translations, users may receive stale cached versions from their browser or a CDN.

**Strategy:** Append a build-time version hash to the `loadPath`. Vite exposes `import.meta.env` which can carry a build identifier:

```typescript
// In i18n.ts
backend: {
  loadPath: `/locales/{{lng}}/{{ns}}.json?v=${__APP_VERSION__}`,
},
```

Define `__APP_VERSION__` in `vite.config.ts`:

```typescript
// vite.config.ts
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  // ...
});
```

Each build produces a unique version string. When the app is redeployed, the query parameter changes, bypassing any cached translation files. This does not affect Vite's own asset hashing for JS/CSS — it only covers the `public/` directory which Vite serves as-is.

## Migration Steps

To migrate the existing English-only codebase:

1. **Backend: add `locale` column.** Create migration files for both SQLite and PostgreSQL. Update `UserService`, `GET /me`, and `PUT /me/profile`.
2. **Install dependencies** and create `src/i18n.ts`, `src/i18n.d.ts`, `src/locales.ts`, and `src/lib/format.ts` as specified above.
3. **Create `platform/web/locales.json`** — the supported languages registry.
4. **Create `public/locales/en/common.json`** by extracting all user-facing strings from shared components (`ui.tsx`, `layout.tsx`, form components, error boundary). This is the largest namespace and covers all shared UI.
5. **Create remaining English namespace files** (`auth.json`, `governance.json`, `onboarding.json`, `notifications.json`, `settings.json`) by extracting strings from the corresponding page components.
6. **Replace hardcoded strings** with `t()` calls, component by component. Start with shared components (they're imported everywhere), then pages.
7. **Replace date/number formatting** with the locale-aware helpers from `src/lib/format.ts`.
8. **Wire the bootstrap** — update `main.tsx` with the pre-React locale resolution flow.
9. **Add the language picker** to the settings page (alongside existing notification preferences).
10. **Run the AI translation pipeline** to generate the initial set of locale files from `en`.
11. **Test with high-contrast languages** (Japanese for layout/text overflow, Arabic for RTL) to catch layout issues and hardcoded strings that were missed.

## Summary

- **App type**: SPA (Vite 8 + React 19 + TypeScript), no SSR/SSG, auth-gated
- **Reload on language switch**: Acceptable and intentional — simplifies the entire architecture
- **Library**: `react-i18next` + `i18next-http-backend`
- **Namespaces**: By domain concern (`common`, `auth`, `governance`, `onboarding`, `notifications`, `settings`)
- **Keys**: Flat with dot notation, type-checked via module augmentation
- **Locale source of truth**: Backend `users` table (pre-auth: browser detection)
- **Bootstrap**: Vanilla JS fetches `/me` for locale before `createRoot()` — no flash of wrong language
- **Language switch**: PATCH backend → `window.location.reload()`
- **Fallback**: Regional variant → base language → English
- **Supported languages**: `platform/web/locales.json` — single source of truth for app, scripts, and CI
- **Translation files**: Flat JSON in `public/locales/`, optimized for AI pipelines, cache-busted per deploy
- **Staleness detection**: Content-addressable hashing with per-locale `_manifest.json`
- **Translation script**: `platform/web/scripts/i18n/translate.ts` with `--locale`, `--namespace`, and `--dry-run` flags
- **LLM prompt**: Stored as `platform/web/scripts/i18n/translation-prompt.md`, separate from script code
- **Date/number formatting**: `Intl` APIs with the active locale, via shared helpers in `src/lib/format.ts`
- **RTL**: `dir` attribute set on `<html>` during bootstrap; Tailwind 4.2 handles layout mirroring automatically
