import { INSTALL_KEY, PICK_PREFS_KEY, PRESETS_KEY, t } from "@perch/ui-logic";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mulberry32 } from "../../../packages/core/test/prng.ts";
import { captureInstallPrompt } from "../src/app/installPrompt.ts";
import { renderRoute, type TestApp, testApp } from "./harness.tsx";

// Me writes to this phone's storage; Home and Browse read it when they open.

const app = (): TestApp => testApp({ me: null, rand: mulberry32(1) });

async function start(a: TestApp, path: string) {
  const view = renderRoute(a, path);
  await act(async () => {
    await view.router.load();
  });
  return view;
}

async function go(view: Awaited<ReturnType<typeof start>>, to: "/" | "/me" | "/browse") {
  await act(async () => {
    await view.router.navigate({ to });
  });
}

const homeTitle = () => screen.findByRole("heading", { level: 1, name: t("student.home.title") });
const meTitle = () => screen.findByRole("heading", { level: 1, name: t("student.me.title") });
const pickNames = () =>
  [...document.querySelectorAll(".pick-card__name, .pick-alts .row__title")].map(
    (e) => e.textContent,
  );
const chips = () => screen.getByRole("group", { name: t("student.home.preset.label") });
const stored = (a: TestApp, key: string): unknown =>
  JSON.parse(a.deps.prefs.getItem(key) ?? "null");

async function saveOutletsPreset() {
  fireEvent.click(screen.getByRole("button", { name: t("student.me.preset.new") }));
  const sheet = await screen.findByRole("dialog", { name: t("student.me.preset.new") });
  fireEvent.change(within(sheet).getByRole("textbox", { name: t("student.me.preset.name") }), {
    target: { value: "Outlets" },
  });
  fireEvent.click(within(sheet).getByRole("checkbox", { name: t("student.filter.outlets") }));
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.me.preset.save") }));
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});
afterEach(() => {
  cleanup();
  window.dispatchEvent(new Event("appinstalled"));
  vi.unstubAllGlobals();
});

test("a quad set on Me changes Home's picks and drops the access note", async () => {
  const a = app();
  const view = await start(a, "/");
  await homeTitle();
  expect(pickNames()).not.toContain("Kelly RCC");
  expect(screen.getByText(t("student.home.access.note"))).toBeTruthy();

  await go(view, "/me");
  await meTitle();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(t("student.me.quad.label")) }));
  fireEvent.click(await screen.findByRole("button", { name: "Kelly Quad" }));

  await go(view, "/");
  await homeTitle();
  expect(pickNames()).toContain("Kelly RCC");
  expect(screen.queryByText(t("student.home.access.note"))).toBeNull();
});

test("the grad toggle on Me unlocks Grad Lounge in Browse", async () => {
  const a = app();
  const view = await start(a, "/browse");
  await screen.findByRole("heading", { level: 1, name: t("student.browse.title") });
  expect(screen.queryByRole("link", { name: /Grad Lounge/ })).toBeNull();

  await go(view, "/me");
  await meTitle();
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(t("student.me.grad.label")) }));

  await go(view, "/browse");
  const grad = await screen.findByRole("link", { name: /Grad Lounge/ });
  expect(grad.className).not.toContain("row--muted");
  expect(screen.getByRole("button", { name: "1 spot hidden for access" })).toBeTruthy();
});

test("a custom Outlets preset is a chip on Home and picks only spots with outlets", async () => {
  const a = app();
  const view = await start(a, "/me");
  await meTitle();
  await saveOutletsPreset();

  await go(view, "/");
  await homeTitle();
  fireEvent.click(within(chips()).getByRole("button", { name: "Outlets" }));
  expect(
    within(chips()).getByRole("button", { name: "Outlets" }).getAttribute("aria-pressed"),
  ).toBe("true");
  const names = pickNames();
  expect(names.length).toBeGreaterThan(0);
  // Outlets at half the seats or more: Quiet Carrels, Union Study Room, SAC Lounge.
  for (const n of names) expect(["Quiet Carrels", "Union Study Room", "SAC Lounge"]).toContain(n);
  expect(names).not.toContain("Reading Room");
});

test("deleting the chosen custom preset falls back to Silent solo", async () => {
  const a = app();
  const view = await start(a, "/me");
  await meTitle();
  await saveOutletsPreset();
  await go(view, "/");
  await homeTitle();
  fireEvent.click(within(chips()).getByRole("button", { name: "Outlets" }));

  await go(view, "/me");
  await meTitle();
  fireEvent.click(screen.getByRole("button", { name: t("student.me.preset.delete") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("student.me.preset.delete_title", { name: "Outlets" }),
  });
  fireEvent.click(within(confirm).getByRole("button", { name: t("student.me.preset.delete") }));
  expect(stored(a, PRESETS_KEY)).toEqual([]);

  await go(view, "/");
  await homeTitle();
  expect(within(chips()).queryByRole("button", { name: "Outlets" })).toBeNull();
  expect(
    within(chips()).getByRole("button", { name: "Silent solo" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(stored(a, PICK_PREFS_KEY)).toMatchObject({ presetId: "silent_solo" });
});

test("picking on Home counts one visit per tab for the install note", async () => {
  const a = app();
  await start(a, "/");
  await homeTitle();
  expect(stored(a, INSTALL_KEY)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("student.pick.something_else") }));
  expect(stored(a, INSTALL_KEY)).toEqual({ pickVisits: 1, dismissed: false });
  fireEvent.click(screen.getByRole("link", { name: t("student.pick.directions") }));
  fireEvent.click(screen.getByRole("button", { name: t("student.pick.surprise") }));
  expect(stored(a, INSTALL_KEY)).toEqual({ pickVisits: 1, dismissed: false });
});

test("Directions alone counts the visit", async () => {
  const a = app();
  await start(a, "/");
  await homeTitle();
  fireEvent.click(screen.getByRole("link", { name: t("student.pick.directions") }));
  expect(stored(a, INSTALL_KEY)).toEqual({ pickVisits: 1, dismissed: false });
});

test("after two visits Home offers the install note", async () => {
  captureInstallPrompt(window);
  const a = app();
  a.deps.prefs.setItem(INSTALL_KEY, JSON.stringify({ pickVisits: 2, dismissed: false }));
  await start(a, "/");
  await homeTitle();
  act(() => {
    window.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: vi.fn(async () => undefined),
      }),
    );
  });
  await waitFor(() => expect(screen.getByText(t("student.install.note"))).toBeTruthy());
});
