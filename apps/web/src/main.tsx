import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-700.css";
import "./ui/styles.css";
import { tokens } from "@study-spot/ui-logic";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./app/AppProvider.tsx";
import { createAppDeps } from "./app/deps.ts";
import { parseWebEnv } from "./env.ts";
import { routeTree } from "./routeTree.gen.ts";
import { installTheme } from "./ui/theme.ts";

export const router = createRouter({ routeTree, defaultPreload: false, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

installTheme(tokens);
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const parsed = parseWebEnv(import.meta.env);
if (!parsed.ok) {
  // A build without the deploy env cannot reach the API; say so instead of failing quietly.
  root.textContent = `Perch is misconfigured:\n${parsed.error}`;
  throw new Error(parsed.error);
}
const deps = createAppDeps({
  apiBaseUrl: parsed.env.VITE_API_BASE_URL,
  dataBaseUrl: parsed.env.VITE_DATA_BASE_URL,
});
createRoot(root).render(
  <StrictMode>
    <AppProvider deps={deps}>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);
