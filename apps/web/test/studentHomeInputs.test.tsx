import { DEFAULT_PICK_PREFS, PICK_PREFS_KEY, t } from "@perch/ui-logic";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MemoryStorage } from "../../../packages/ui-logic/test/fakes.ts";
import { renderRoute, type TestApp, testApp } from "./harness.tsx";

async function home(app: TestApp = testApp({ me: null })) {
  const view = renderRoute(app, "/");
  await act(async () => {
    await view.router.load();
  });
  await screen.findByRole("heading", { level: 1, name: t("student.home.title") });
  return { app, view };
}

function stored(app: TestApp): unknown {
  const raw = app.deps.prefs.getItem(PICK_PREFS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

function everything(app: TestApp): string {
  const all: string[] = [];
  for (const s of [app.deps.prefs, app.deps.tab] as MemoryStorage[]) {
    for (const [k, v] of s.data) all.push(k, v);
  }
  return all.join("\n");
}

const fromRow = () => screen.getByRole("button", { name: /^From/ });
const presets = () => screen.getByRole("group", { name: t("student.home.preset.label") });
const times = () => screen.getByRole("group", { name: t("student.home.time.label") });
const pressed = (group: HTMLElement, name: string) =>
  within(group).getByRole("button", { name }).getAttribute("aria-pressed");

test("defaults: From Melville Library, 1 hr, Silent solo, no People stepper", async () => {
  await home();
  expect(fromRow().textContent).toContain("Melville Library");
  expect(pressed(times(), "1 hr")).toBe("true");
  expect(
    within(presets()).getByRole("button", { name: "Silent solo" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByRole("group", { name: t("student.home.group.label") })).toBeNull();
  expect(screen.queryByText(/^Starting from/)).toBeNull();
});

test("Group shows People at 3; Quick 30 sets 30 min", async () => {
  await home();
  fireEvent.click(within(presets()).getByRole("button", { name: "Group" }));
  const people = screen.getByRole("group", { name: t("student.home.group.label") });
  expect(within(people).getByRole("textbox")).toHaveProperty("value", "3");
  fireEvent.click(within(presets()).getByRole("button", { name: "Quick 30" }));
  expect(pressed(times(), "30 min")).toBe("true");
  expect(screen.queryByRole("group", { name: t("student.home.group.label") })).toBeNull();
});

test("choosing 2 hr is saved on this phone", async () => {
  const { app } = await home();
  fireEvent.click(within(times()).getByRole("button", { name: "2 hr" }));
  expect(stored(app)).toMatchObject({ time: "120" });
});

test("Use my location snaps to the nearest building and keeps no coordinates", async () => {
  const app = testApp({ me: null });
  app.deps.geolocation = {
    current: async () => ({ lat: 40.9146, lng: -73.1242, accuracyMeters: 20 }),
  };
  await home(app);
  fireEvent.click(fromRow());
  const sheet = screen.getByRole("dialog", { name: t("student.home.from.sheet") });
  expect(within(sheet).getByText(t("student.home.from.privacy"))).toBeTruthy();
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.from.locate") }));
  });
  expect(
    await within(sheet).findByText("Nearest building: Student Activities Center"),
  ).toBeTruthy();
  expect(fromRow().textContent).toContain("Student Activities Center");
  expect(stored(app)).toMatchObject({ from: "sac" });
  expect(everything(app)).not.toMatch(/40\.91|73\.12|lat|lng/);
});

test("a refused or rough fix says to pick a building", async () => {
  const app = testApp({ me: null });
  let fix: { lat: number; lng: number; accuracyMeters: number } | null = null;
  app.deps.geolocation = { current: async () => fix };
  await home(app);
  fireEvent.click(fromRow());
  const sheet = screen.getByRole("dialog", { name: t("student.home.from.sheet") });
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.from.locate") }));
  });
  expect(await within(sheet).findByText("Location is off. Pick a building instead.")).toBeTruthy();
  fix = { lat: 40.9146, lng: -73.1242, accuracyMeters: 4000 };
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.from.locate") }));
  });
  expect(
    await within(sheet).findByText("Location too rough. Pick a building instead."),
  ).toBeTruthy();
});

test("a fix far from campus keeps the current From and says so", async () => {
  const app = testApp({ me: null });
  app.deps.geolocation = {
    current: async () => ({ lat: 40.9465, lng: -73.0693, accuracyMeters: 20 }),
  };
  await home(app);
  fireEvent.click(fromRow());
  const sheet = screen.getByRole("dialog", { name: t("student.home.from.sheet") });
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.from.locate") }));
  });
  expect(await within(sheet).findByText(t("student.home.from.far"))).toBeTruthy();
  expect(fromRow().textContent).toContain("Melville Library");
});

test("a building from the list becomes From and closes the sheet", async () => {
  const { app } = await home();
  fireEvent.click(fromRow());
  const sheet = screen.getByRole("dialog", { name: t("student.home.from.sheet") });
  fireEvent.change(within(sheet).getByRole("searchbox"), { target: { value: "union" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Student Union" }));
  expect(fromRow().textContent).toContain("Student Union");
  expect(stored(app)).toMatchObject({ from: "student-union" });
  expect(sheet.hasAttribute("open")).toBe(false);
});

test("More filters counts what is on, and Clear resets it", async () => {
  await home();
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  const sheet = screen.getByRole("dialog", { name: t("student.home.filters.title") });
  fireEvent.click(within(sheet).getByRole("checkbox", { name: "Outlets at most seats" }));
  expect(screen.getByRole("button", { name: "More filters, 1 on" })).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.filters.clear") }));
  expect(screen.getByRole("button", { name: "More filters" })).toBeTruthy();
  expect(within(sheet).getByRole("checkbox", { name: "Outlets at most seats" })).toHaveProperty(
    "checked",
    false,
  );
});

test("corrupt saved inputs fall back to the defaults", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem(PICK_PREFS_KEY, '{"time":"forever"');
  await home(app);
  expect(pressed(times(), "1 hr")).toBe("true");
  expect(fromRow().textContent).toContain("Melville Library");
});

test("a saved building missing from the spots says where it starts instead", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem(
    PICK_PREFS_KEY,
    JSON.stringify({ ...DEFAULT_PICK_PREFS, from: "torn-down-hall" }),
  );
  const { view } = await home(app);
  expect(screen.getByText("Starting from Melville Library")).toBeTruthy();
  expect(fromRow().textContent).toContain("Melville Library");
  // The stand-in is saved once, so the note does not come back on the next visit.
  expect(JSON.parse(app.deps.prefs.getItem(PICK_PREFS_KEY) ?? "{}").from).toBe("melville-library");
  view.unmount();
  await home(app);
  expect(screen.queryByText(/^Starting from/)).toBeNull();
});
