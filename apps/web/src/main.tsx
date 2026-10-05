import { tokens } from "@study-spot/ui-logic";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { parseWebEnv } from "./env.ts";
import { routeTree } from "./routeTree.gen.ts";
import { installTheme } from "./ui/theme.ts";

export const router = createRouter({ routeTree });

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
  root.textContent = `Perch is misconfigured:\n${parsed.error}`;
  throw new Error(parsed.error);
}
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
