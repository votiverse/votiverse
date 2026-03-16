/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** VCP API base URL. Default: "/api" (uses Vite dev proxy). */
  readonly VITE_API_BASE_URL: string;
  /** VCP API key. Default: dev key. */
  readonly VITE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
