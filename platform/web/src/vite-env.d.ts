/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL. Default: "/api" (uses Vite dev proxy). */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
