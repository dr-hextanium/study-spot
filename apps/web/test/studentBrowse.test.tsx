import { t } from "@perch/ui-logic";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { readyBundle, renderRoute, type TestApp, testApp } from "./harness.tsx";

async function open(app: TestApp = testApp({ me: null })) {
  const view = renderRoute(app, "/browse");
  await act(async () => {
    await view.router.load();
  });
  await screen.findByRole("heading", { level: 1, name: t("student.browse.title") });
  return { app, view };
}

const titles = () => [...document.querySelectorAll(".row__title")].map((e) => e.textContent);
const stored = (app: TestApp) => JSON.parse(app.deps.prefs.getItem("student:browse") ?? "null");

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  return await screen.findByRole("dialog", { name: t("student.browse.filters.title") });
}

test("rows are sorted by walk, with busyness, status and the check date", async () => {
  await open();
  expect(titles()).toEqual([
    "Quiet Carrels",
    "Reading Room",
    "Unverified Room",
    "SAC Lounge",
    "Union Study Room",
    "Hours TBD",
  ]);
  const carrels = screen.getByRole("link", { name: /Quiet Carrels/ });
  expect(carrels.getAttribute("href")).toBe("/spot/quiet-carrels");
  expect(within(carrels).getByText("Usually some seats")).toBeTruthy();
  expect(within(carrels).getByText("Open till 2:00 AM", { exact: false })).toBeTruthy();
  expect(within(carrels).getByText("Checked Oct 6")).toBeTruthy();
  expect(screen.getByText("6 spots")).toBeTruthy();
  expect(screen.getByText("Spots updated today")).toBeTruthy();
});

test("the caption says typical and not live, and nothing says live", async () => {
  await open();
  expect(screen.getByText("Busyness is typical for Tue 2 PM, not live.")).toBeTruthy();
  const list = document.querySelector(".row-list");
  expect(list?.textContent ?? "").not.toMatch(/\blive\b|right now/i);
});

test("locked spots are hidden until Show spots I can't use is on, then greyed and labelled", async () => {
  const { app } = await open();
  expect(titles()).not.toContain("Kelly RCC");
  const note = screen.getByRole("button", { name: "2 spots hidden for access" });
  expect(note).toBeTruthy();
  const sheet = await openSheet();
  fireEvent.click(within(sheet).getByRole("checkbox", { name: t("student.browse.show_locked") }));
  await waitFor(() => expect(titles()).toContain("Kelly RCC"));
  const kelly = screen.getByRole("link", { name: /Kelly RCC/ });
  expect(kelly.className).toContain("row--muted");
  expect(kelly.textContent).toContain("Residents of Kelly Quad only");
  expect(screen.queryByRole("button", { name: /hidden for access/ })).toBeNull();
  expect(stored(app).showLocked).toBe(true);
});

test("the hidden-for-access note turns locked spots on", async () => {
  const { app } = await open();
  fireEvent.click(screen.getByRole("button", { name: "2 spots hidden for access" }));
  await waitFor(() => expect(titles()).toContain("Grad Lounge"));
  expect(stored(app).showLocked).toBe(true);
});

test("Tonight reads every row at 9 PM", async () => {
  const { app } = await open();
  fireEvent.click(screen.getByRole("button", { name: t("student.browse.arrive.tonight") }));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: /SAC Lounge/ }).textContent).toContain(
      "Open till 11:00 PM",
    ),
  );
  expect(stored(app).arrive).toBe("tonight");
  expect(screen.getByText("Busyness is typical for Tue 9 PM, not live.")).toBeTruthy();
});

test("the filter count follows the filters, and every group is in the sheet", async () => {
  await open();
  expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  const sheet = await openSheet();
  for (const group of [
    "Noise",
    "Power and signal",
    "Seating",
    "Room",
    "Rules",
    "Getting in",
    "Late and nearby",
  ]) {
    expect(within(sheet).getByText(group)).toBeTruthy();
  }
  fireEvent.click(within(sheet).getByRole("checkbox", { name: "Outlets at most seats" }));
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Filters, 1 on" }).length).toBeGreaterThan(0),
  );
  expect(titles()).toEqual(["Quiet Carrels", "SAC Lounge", "Union Study Room"]);
  fireEvent.click(within(sheet).getByRole("checkbox", { name: "Open when I get there" }));
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Filters, 2 on" }).length).toBeGreaterThan(0),
  );
});

test("no match says so, and Clear filters brings the rows back", async () => {
  await open();
  const sheet = await openSheet();
  fireEvent.click(within(sheet).getByRole("checkbox", { name: "Silent only" }));
  fireEvent.click(within(sheet).getByRole("checkbox", { name: "Talking is fine" }));
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.filters.done") }));
  expect(await screen.findByText(t("student.browse.empty"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("student.browse.clear") }));
  await waitFor(() => expect(titles()).toHaveLength(6));
});

test("Clear in the sheet also turns off both switches", async () => {
  const { app } = await open();
  const sheet = await openSheet();
  fireEvent.click(within(sheet).getByRole("checkbox", { name: t("student.browse.show_locked") }));
  fireEvent.click(within(sheet).getByRole("checkbox", { name: t("student.browse.open_only") }));
  fireEvent.click(within(sheet).getByRole("checkbox", { name: "USB outlets" }));
  await waitFor(() => expect(stored(app).extra).toHaveLength(1));
  fireEvent.click(within(sheet).getByRole("button", { name: t("student.home.filters.clear") }));
  await waitFor(() =>
    expect(stored(app)).toMatchObject({ extra: [], openOnly: false, showLocked: false }),
  );
});

test("search narrows by name and building", async () => {
  await open();
  fireEvent.change(screen.getByRole("searchbox", { name: t("student.browse.search.label") }), {
    target: { value: "activities" },
  });
  await waitFor(() => expect(titles()).toEqual(["Unverified Room", "SAC Lounge"]));
  expect(screen.getByText("2 spots")).toBeTruthy();
});

test("corrupt saved prefs fall back to the defaults", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem("student:browse", "{nope");
  await open(app);
  expect(titles()).toHaveLength(6);
});

test("an old bundle says how old, and an offline check says it is using saved spots", async () => {
  const state = readyBundle();
  if (state.phase !== "ready") throw new Error("not ready");
  const app = testApp({
    me: null,
    bundle: { ...state, checkFailed: true, load: { ...state.load, ageDays: 5 } },
  });
  await open(app);
  expect(
    screen.getByText("These spots are 5 days old. Hours and busyness may have changed."),
  ).toBeTruthy();
  expect(screen.getByText("Offline. Using spots saved on this phone.")).toBeTruthy();
});

test("no bundle and no signal says so", async () => {
  const app = testApp({ me: null, bundle: { phase: "unavailable", reason: "offline_no_cache" } });
  const view = renderRoute(app, "/browse");
  await act(async () => {
    await view.router.load();
  });
  expect(
    await screen.findByText("Can't load spots offline yet. Open once with signal."),
  ).toBeTruthy();
});
