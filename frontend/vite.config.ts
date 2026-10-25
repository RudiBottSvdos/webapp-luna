import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "F.R.I.D.A.Y.",
        short_name: "F.R.I.D.A.Y.",
        description: "F.R.I.D.A.Y. – Sprachassistentin",
        lang: "de",
        display: "standalone",
        display_override: ["fullscreen", "standalone"],
        orientation: "any",
        background_color: "#0b1020",
        theme_color: "#0b1020",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
