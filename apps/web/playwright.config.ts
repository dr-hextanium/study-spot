import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export const E2E_STATE = fileURLToPath(new URL("e2e/.state/server.json", import.meta.url));
export const API_ORIGIN = "http://127.0.0.1:8787";
export const WEB_ORIGIN = "http://localhost:4173";

/**
 * Phone-sized Chromium against the real server (PGlite, publish to a temp dir)
 * and the production build under `vite preview`, service worker included.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI === undefined ? 0 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Pixel 7"],
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  webServer: [
    {
      command: "node ../server/scripts/e2e-server.ts",
      url: `${API_ORIGIN}/health`,
      env: { E2E_STATE, E2E_WEB_ORIGIN: WEB_ORIGIN },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "bun run build && bun run preview",
      url: WEB_ORIGIN,
      env: { VITE_API_BASE_URL: API_ORIGIN, VITE_DATA_BASE_URL: "http://data.localhost:8788" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
