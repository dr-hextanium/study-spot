import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export const E2E_STATE = fileURLToPath(new URL("e2e/.state/server.json", import.meta.url));
// Ports and the build dir can be moved off the defaults so a run never collides with
// another local server: E2E_API_PORT, E2E_WEB_PORT, E2E_DATA_PORT, E2E_OUT_DIR.
const API_PORT = process.env.E2E_API_PORT ?? "8787";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "4173";
const DATA_PORT = process.env.E2E_DATA_PORT ?? "8788";
const OUT_DIR = process.env.E2E_OUT_DIR;
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
export const DATA_ORIGIN = `http://data.localhost:${DATA_PORT}`;

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
      env: {
        E2E_STATE,
        E2E_WEB_ORIGIN: WEB_ORIGIN,
        E2E_PORT: API_PORT,
        E2E_DATA_PORT: DATA_PORT,
        E2E_PUBLISH_ON_BOOT: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        OUT_DIR === undefined
          ? `bun run build && bun run preview --port ${WEB_PORT} --strictPort`
          : `bun run build --outDir ${OUT_DIR} && bun run preview --outDir ${OUT_DIR} --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      env: { VITE_API_BASE_URL: API_ORIGIN, VITE_DATA_BASE_URL: DATA_ORIGIN },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
