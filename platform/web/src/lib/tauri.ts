/**
 * Tauri runtime detection — safe for both browser and mobile contexts.
 */

/** True when running inside a Tauri WebView (mobile or desktop). */
export const isTauri =
  typeof window !== "undefined" && "__TAURI__" in window;

/** True when built with VITE_MOBILE=true (mobile-specific UI). */
export const isMobile = import.meta.env.VITE_MOBILE === "true";
