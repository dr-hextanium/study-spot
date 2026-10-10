import { t } from "@perch/ui-logic";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { settableBundleStore } from "../../../packages/ui-logic/test/fakeBundleStore.ts";
import { readyBundle, renderRoute, testApp } from "./harness.tsx";

// The real map needs WebGL.
vi.mock("../src/map/MapView.tsx", () => ({ default: () => <div data-testid="map" /> }));

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Every student screen renders while the spots load, then again once they are ready. A
 * hook after an early return would throw "Rendered more hooks than during the previous
 * render" on the second pass.
 */
const SCREENS: { path: string; ready: () => unknown; map?: true }[] = [
  { path: "/", ready: () => document.querySelector(".pick-card") },
  { path: "/browse", ready: () => screen.getAllByRole("link", { name: /Quiet Carrels/ })[0] },
  { path: "/browse", map: true, ready: () => screen.getByTestId("map") },
  {
    path: "/spot/quiet-carrels",
    ready: () => screen.getByRole("heading", { level: 1, name: "Quiet Carrels" }),
  },
  {
    path: "/me",
    ready: () => screen.getByRole("heading", { level: 1, name: t("student.me.title") }),
  },
];

for (const s of SCREENS) {
  test(`${s.path}${s.map ? " (map)" : ""} goes from loading to ready without a hooks error`, async () => {
    const app = testApp({ me: null });
    const store = settableBundleStore({ phase: "loading" }, () => app.clock.now());
    app.deps.bundle = store;
    if (s.map) {
      app.deps.prefs.setItem(
        "student:browse",
        JSON.stringify({
          view: "map",
          arrive: "now",
          extra: [],
          showLocked: false,
          openOnly: false,
        }),
      );
    }
    const view = renderRoute(app, s.path);
    await act(async () => {
      await view.router.load();
    });
    await act(async () => {
      store.set(readyBundle());
    });
    expect(
      await vi.waitFor(() => s.ready() ?? Promise.reject(new Error("not ready"))),
    ).toBeTruthy();
    expect(errors.map((e) => String(e[0]))).toEqual([]);
  });
}
