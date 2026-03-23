/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Tauri plugin packages are only available at runtime inside the WebView.
      // Mark as external so the bundler doesn't try to resolve them.
      external: ["@choochmeque/tauri-plugin-notifications-api"],
    },
  },
  optimizeDeps: {
    exclude: ["@choochmeque/tauri-plugin-notifications-api"],
  },
  resolve: {
    alias: {
      // Stub Tauri-only packages in browser dev mode so Vite import analysis doesn't fail.
      ...(!process.env.TAURI_ENV_PLATFORM && {
        "@choochmeque/tauri-plugin-notifications-api": "/src/lib/tauri-stub.ts",
      }),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: false,
  },
  server: {
    host: process.env.TAURI_DEV_HOST || "localhost",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
