import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initI18n } from "./i18n.js";
import { RTL_LOCALES } from "./locales.js";
import { App } from "./app.js";
import { ErrorBoundary } from "./components/error-boundary.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function bootstrap() {
  // 1. Attempt to resolve the user's locale before React mounts.
  //    If authenticated, /me returns the user profile including locale.
  //    If not (login page, expired session), this fails silently and
  //    i18next falls back to browser language detection.
  let userLocale: string | undefined;
  try {
    const res = await fetch(`${BASE_URL}/me`, { credentials: "include" });
    if (res.ok) {
      const me = (await res.json()) as { locale?: string };
      userLocale = me.locale;
    }
  } catch {
    // Not authenticated or network error — browser detection will handle it.
  }

  // 2. Initialize i18n with the resolved locale (or undefined for detection).
  await initI18n(userLocale);

  // 3. Set document direction for RTL locales.
  const resolvedLocale = userLocale || navigator.language?.split("-")[0] || "en";
  document.documentElement.dir = RTL_LOCALES.has(resolvedLocale) ? "rtl" : "ltr";
  document.documentElement.lang = resolvedLocale;

  // 4. Mount React. Translations are ready — no flash of wrong language.
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrap();
