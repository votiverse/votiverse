/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL. Default: "/api" (uses Vite dev proxy). */
  readonly VITE_API_BASE_URL: string;
  /** Set to "true" in mobile builds for mobile-specific UI. */
  readonly VITE_MOBILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
