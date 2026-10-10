import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // Must come before the React plugin. Writes src/routeTree.gen.ts, which is committed.
    tanstackRouter({ target: "react", autoCodeSplitting: false }),
    react(),
    VitePWA({
      // The app shows an update prompt; it never reloads itself.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Perch",
        short_name: "Perch",
        description: "Find a study spot on campus.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#FBFAF9",
        theme_color: "#FBFAF9",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // One chunk on purpose: the service worker precaches it, so every survey screen opens offline.
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
