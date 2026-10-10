import { notePickAction, PRESETS_KEY, t } from "@perch/ui-logic";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryStorage } from "../../../packages/ui-logic/test/fakes.ts";
import { AppProvider } from "../src/app/AppProvider.tsx";
import { captureInstallPrompt } from "../src/app/installPrompt.ts";
import { InstallNote } from "../src/screens/student/InstallNote.tsx";
import { renderRoute, type TestApp, testApp } from "./harness.tsx";

async function open(app: TestApp) {
  const view = renderRoute(app, "/me");
  await act(async () => {
    await view.router.load();
  });
  await screen.findByRole("heading", { level: 1, name: t("student.me.title") });
  return view;
}

const stored = (app: TestApp, key: string): unknown =>
  JSON.parse(app.deps.prefs.getItem(key) ?? "null");

test("no surveyor session: no Surveyor tools row", async () => {
  await open(testApp({ me: null }));
  expect(screen.queryByText(t("student.me.surveyor"))).toBeNull();
});

test("a surveyor session shows Surveyor tools, linking to /survey", async () => {
  await open(testApp());
  const row = screen.getByRole("link", { name: t("student.me.surveyor") });
  expect(row.getAttribute("href")).toBe("/survey");
});

test("the privacy sentence is shown verbatim with the links", async () => {
  await open(testApp({ me: null }));
  expect(
    screen.getByText("Nothing about you is stored on our servers. Settings live on this phone."),
  ).toBeTruthy();
  const href = (name: string): string | null =>
    screen.getByRole("link", { name }).getAttribute("href");
  // The policy ships inside the app, so it opens offline too.
  expect(href(t("student.me.data_policy"))).toBe("/data-policy");
  expect(href(t("student.me.source"))).toBe("https://github.com/dr-hextanium/perch");
  expect(href(t("student.me.licenses"))).toContain("github.com/dr-hextanium/perch");
  expect(screen.getByText(t("student.me.licenses_body"))).toBeTruthy();
});

test("the data policy page renders the policy from the docs", async () => {
  const view = renderRoute(testApp({ me: null }), "/data-policy");
  await act(async () => {
    await view.router.load();
  });
  expect(await screen.findByRole("heading", { level: 1, name: "Data policy" })).toBeTruthy();
  for (const h of ["Kept on your phone only", "Kept on our server", "Never kept", "Licenses"]) {
    expect(screen.getByRole("heading", { level: 2, name: h })).toBeTruthy();
  }
  expect(screen.getByText(/Your IP address\./)).toBeTruthy();
  const repo = screen.getByRole("link", { name: "https://github.com/dr-hextanium/perch" });
  expect(repo.getAttribute("href")).toBe("https://github.com/dr-hextanium/perch");
  expect(document.body.textContent ?? "").not.toMatch(/\*\*|^#/m);
});

test("the theme switch is here", async () => {
  await open(testApp({ me: null }));
  expect(screen.getByRole("radio", { name: t("theme.dark") })).toBeTruthy();
});

test("choosing a quad stores the access profile", async () => {
  const app = testApp({ me: null });
  await open(app);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(t("student.me.quad.label")) }));
  fireEvent.click(await screen.findByRole("button", { name: "Kelly Quad" }));
  expect(stored(app, "student:access")).toEqual({
    residence: null,
    quad: "kelly-quad",
    grad: false,
  });
  expect(screen.getByRole("button", { name: /Quad.*Kelly Quad/ })).toBeTruthy();
});

test("Where you live starts with Off campus, then every building", async () => {
  const app = testApp({ me: null });
  await open(app);
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(t("student.me.residence.label")) }),
  );
  const dialog = await screen.findByRole("dialog", { name: t("student.me.residence.label") });
  const rows = within(dialog)
    .getAllByRole("button")
    .map((b) => b.textContent);
  expect(rows[1]).toBe(t("student.me.residence.none"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Melville Library" }));
  expect(stored(app, "student:access")).toMatchObject({ residence: "melville-library" });
});

test("the grad toggle is stored", async () => {
  const app = testApp({ me: null });
  await open(app);
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(t("student.me.grad.label")) }));
  expect(stored(app, "student:access")).toMatchObject({ grad: true });
});

test("a custom preset is saved, listed and deleted after a confirm", async () => {
  const app = testApp({ me: null });
  await open(app);
  fireEvent.click(screen.getByRole("button", { name: t("student.me.preset.new") }));
  const sheet = await screen.findByRole("dialog", { name: t("student.me.preset.new") });
  fireEvent.change(within(sheet).getByRole("textbox", { name: t("student.me.preset.name") }), {
    target: { value: "Outlets" },
  });
  fireEvent.click(within(sheet).getByRole("checkbox", { name: t("student.filter.outlets") }));
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.me.preset.save") }));
  expect(stored(app, PRESETS_KEY)).toMatchObject([
    { name: "Outlets", required: [{ attr: "outlet_coverage_pct", target: 0.5 }] },
  ]);
  expect(screen.getByText("Outlets")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: t("student.me.preset.delete") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("student.me.preset.delete_title", { name: "Outlets" }),
  });
  fireEvent.click(within(confirm).getByRole("button", { name: t("student.me.preset.delete") }));
  expect(stored(app, PRESETS_KEY)).toEqual([]);
  expect(screen.queryByText("Outlets")).toBeNull();
});

test("saving without a name or a filter shows the field errors", async () => {
  const app = testApp({ me: null });
  await open(app);
  fireEvent.click(screen.getByRole("button", { name: t("student.me.preset.new") }));
  const sheet = await screen.findByRole("dialog", { name: t("student.me.preset.new") });
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.me.preset.save") }));
  expect(within(sheet).getByText(t("student.me.preset.name_required"))).toBeTruthy();
  fireEvent.change(within(sheet).getByRole("textbox", { name: t("student.me.preset.name") }), {
    target: { value: "Empty" },
  });
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.me.preset.save") }));
  expect(within(sheet).getByText(t("student.me.preset.filters_required"))).toBeTruthy();
  expect(app.deps.prefs.getItem(PRESETS_KEY)).toBeNull();
});

test("corrupt presets reset and say so", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem(PRESETS_KEY, JSON.stringify([{ id: "silent_solo", name: "x" }]));
  await open(app);
  expect(screen.getByText(t("student.me.reset_note"))).toBeTruthy();
});

test("clean storage shows no reset note", async () => {
  await open(testApp({ me: null }));
  expect(screen.queryByText(t("student.me.reset_note"))).toBeNull();
});

// ---- install note ----

type FakeInstall = Event & { prompt: ReturnType<typeof vi.fn> };
function installEvent(): FakeInstall {
  const e = new Event("beforeinstallprompt", { cancelable: true });
  return Object.assign(e, { prompt: vi.fn(async () => undefined) });
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});
afterEach(() => {
  // Unmount first: the next event would re-render a note whose stubs are already gone.
  cleanup();
  window.dispatchEvent(new Event("appinstalled"));
  vi.unstubAllGlobals();
});

function renderNote(app: TestApp) {
  return render(
    <AppProvider deps={app.deps}>
      <InstallNote />
    </AppProvider>,
  );
}

test("the install note appears after picks in two separate tabs and stays gone after No thanks", async () => {
  captureInstallPrompt(window);
  const app = testApp({ me: null });
  notePickAction(app.deps.prefs, new MemoryStorage());
  const first = renderNote(app);
  act(() => {
    window.dispatchEvent(installEvent());
  });
  expect(screen.queryByText(t("student.install.note"))).toBeNull();
  first.unmount();

  notePickAction(app.deps.prefs, new MemoryStorage());
  const second = renderNote(app);
  expect(screen.getByText(t("student.install.note"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("student.install.dismiss") }));
  expect(screen.queryByText(t("student.install.note"))).toBeNull();
  second.unmount();
  renderNote(app);
  expect(screen.queryByText(t("student.install.note"))).toBeNull();
});

test("Add opens the held browser prompt once", async () => {
  captureInstallPrompt(window);
  const app = testApp({ me: null });
  notePickAction(app.deps.prefs, new MemoryStorage());
  notePickAction(app.deps.prefs, new MemoryStorage());
  renderNote(app);
  const event = installEvent();
  act(() => {
    window.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: t("student.install.add") }));
  });
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: t("student.install.add") })).toBeNull();
});

test("no prompt and not iOS: nothing shows", () => {
  const app = testApp({ me: null });
  notePickAction(app.deps.prefs, new MemoryStorage());
  notePickAction(app.deps.prefs, new MemoryStorage());
  renderNote(app);
  expect(screen.queryByRole("status")).toBeNull();
});

test("an installed app is never asked", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
  );
  captureInstallPrompt(window);
  const app = testApp({ me: null });
  notePickAction(app.deps.prefs, new MemoryStorage());
  notePickAction(app.deps.prefs, new MemoryStorage());
  renderNote(app);
  act(() => {
    window.dispatchEvent(installEvent());
  });
  expect(screen.queryByText(t("student.install.note"))).toBeNull();
});

test("iOS gets the Share instructions", () => {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
  const app = testApp({ me: null });
  notePickAction(app.deps.prefs, new MemoryStorage());
  notePickAction(app.deps.prefs, new MemoryStorage());
  renderNote(app);
  expect(screen.getByText(t("student.install.ios"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("student.install.add") })).toBeNull();
});
