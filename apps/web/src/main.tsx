import "./ui/tokens.css";
import "./ui/fonts.css";
import "./ui/styles.css";
import "./screens/spot.css";
import "./screens/admin.css";
import { t } from "@perch/ui-logic";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppProvider } from "./app/AppProvider.tsx";
import { createAppDeps } from "./app/deps.ts";
import { captureInstallPrompt } from "./app/installPrompt.ts";
import { scrollKey } from "./app/scrollKey.ts";
import { defaultViewTransition } from "./app/transitions.ts";
import { parseWebEnv } from "./env.ts";
import { routeTree } from "./routeTree.gen.ts";
import { lockZoomWhenInstalled } from "./ui/appZoom.ts";
import { watchSystemTheme } from "./ui/themePref.ts";

export const router = createRouter({
  routeTree,
  defaultPreload: false,
  scrollRestoration: true,
  getScrollRestorationKey: scrollKey,
  defaultViewTransition,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

watchSystemTheme();
captureInstallPrompt(window);
lockZoomWhenInstalled();
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const parsed = parseWebEnv(import.meta.env);
if (!parsed.ok) {
  // A build without the deploy env cannot reach the API; say so instead of failing quietly.
  root.textContent = `${t("auth.misconfigured")}\n${parsed.error}`;
  throw new Error(parsed.error);
}
const deps = createAppDeps({
  apiBaseUrl: parsed.env.VITE_API_BASE_URL,
  dataBaseUrl: parsed.env.VITE_DATA_BASE_URL,
  pickPing: parsed.env.VITE_PICK_PING === "1",
});
// A hot reload re-runs this module; reuse the first React root rather than mounting twice.
const hot: { root?: Root } = import.meta.hot?.data ?? {};
hot.root ??= createRoot(root);
hot.root.render(
  <StrictMode>
    <AppProvider deps={deps}>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);
