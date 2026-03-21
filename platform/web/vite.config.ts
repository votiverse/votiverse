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
