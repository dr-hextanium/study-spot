import type { BundleState } from "@perch/ui-logic";
import { DEFAULT_PICK_PREFS, PICK_PREFS_KEY, t } from "@perch/ui-logic";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { mulberry32 } from "../../../packages/core/test/prng.ts";
import { readyBundle, renderRoute, type TestApp, testApp } from "./harness.tsx";

async function home(app: TestApp = testApp({ me: null, rand: mulberry32(1) })) {
  const view = renderRoute(app, "/");
  await act(async () => {
    await view.router.load();
  });
  await screen.findByRole("heading", { level: 1, name: t("student.home.title") });
  return { app, view };
}

const card = () => {
  const el = document.querySelector<HTMLElement>(".pick-card");
  if (el === null) throw new Error("no pick card");
  return el;
};
const pickName = () => card().querySelector(".pick-card__name")?.textContent ?? null;
const alternates = () => screen.getByRole("region", { name: t("student.pick.alternates") });
const toast = () => document.querySelector(".toast")?.textContent ?? "";
const click = (name: string) =>
  act(() => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

test("the pick card says where, how far, how busy (typical), and when it closes", async () => {
  await home();
  expect(screen.getByRole("heading", { name: t("student.pick.heading") })).toBeTruthy();
  const c = within(card());
  expect(pickName()).toBe("Quiet Carrels");
  expect(c.getByText("Usually some seats, typical Tue 2 PM")).toBeTruthy();
  expect(card().textContent).toContain("Likely seats");
  expect(card().textContent).toContain("In this building");
  expect(card().textContent).toContain("Open till 2:00 AM");
  expect(card().textContent).toContain("Checked Oct 6");
  const alts = within(alternates()).getAllByRole("link");
  expect(alts.map((a) => a.querySelector(".row__title")?.textContent)).toEqual([
    "Union Study Room",
    "Reading Room",
  ]);
  expect(alts[0]?.getAttribute("href")).toBe("/spot/union-study?via=pick");
  expect(alternates().textContent).toContain("Checked Oct 6");
  expect(within(card()).getByRole("link", { name: "Quiet Carrels" }).getAttribute("href")).toBe(
    "/spot/quiet-carrels?via=pick",
  );
});

test("Directions is the one red button and carries only the spot's point", async () => {
  await home();
  const primaries = document.querySelectorAll(".btn--primary");
  expect(primaries).toHaveLength(1);
  const directions = screen.getByRole("link", { name: t("student.pick.directions") });
  expect(primaries[0]).toBe(directions);
  const href = directions.getAttribute("href") ?? "";
  expect(href.startsWith("https://www.google.com/maps/dir/")).toBe(true);
  expect(href).toContain("40.9155%2C-73.1221");
  expect(directions.getAttribute("target")).toBe("_blank");
  expect(directions.getAttribute("rel")).toBe("noopener noreferrer");
});

test("nothing on screen claims to be live", async () => {
  await home();
  for (const root of [card(), alternates()]) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      expect(n.textContent ?? "").not.toMatch(/\blive\b|right now/i);
    }
  }
  expect(document.body.textContent ?? "").not.toMatch(/\blive\b/i);
});

test("Something else with one good match says so", async () => {
  await home();
  await click(t("student.pick.something_else"));
  expect(toast()).toBe(t("student.pick.only_one"));
  expect(pickName()).toBe("Quiet Carrels");
});

test("Surprise me ignores the preset, keeps the hard rules, and never repeats the spot on screen", async () => {
  await home();
  await click(t("student.pick.surprise"));
  expect(screen.getByRole("heading", { name: t("student.pick.surprise_heading") })).toBeTruthy();
  expect(toast()).not.toContain("only good match");
  const first = pickName();
  expect(["Union Study Room", "SAC Lounge"]).toContain(first);
  let last = first;
  for (let i = 0; i < 5; i += 1) {
    await click(t("student.pick.surprise"));
    const name = pickName();
    expect(["Kelly RCC", "Grad Lounge", "Unverified Room", "Hours TBD"]).not.toContain(name);
    expect(name).not.toBe(last);
    last = name;
  }
});

test("Surprise me sizes the group at one person unless People is on screen", async () => {
  // Calls puts SAC Lounge on top; Quiet Carrels seats one, so a group of 3 would hide it.
  const app = testApp({ me: null, rand: mulberry32(7) });
  app.deps.prefs.setItem(
    PICK_PREFS_KEY,
    JSON.stringify({ ...DEFAULT_PICK_PREFS, presetId: "calls", group: 3 }),
  );
  await home(app);
  expect(pickName()).toBe("SAC Lounge");
  const seen = new Set<string | null>();
  for (let i = 0; i < 4; i += 1) {
    await click(t("student.pick.surprise"));
    seen.add(pickName());
  }
  expect(seen.has("Quiet Carrels")).toBe(true);
});

test("changing the question returns to the top pick", async () => {
  await home();
  await click(t("student.pick.surprise"));
  expect(screen.getByRole("heading", { name: t("student.pick.surprise_heading") })).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("group", { name: t("student.home.time.label") })).getByRole("button", {
      name: "2 hr",
    }),
  );
  expect(screen.getByRole("heading", { name: t("student.pick.heading") })).toBeTruthy();
});

test("Home sends nothing, Directions sends once", async () => {
  const { app } = await home();
  await click(t("student.pick.something_else"));
  await click(t("student.pick.surprise"));
  expect(app.pings).toEqual([]);
  const id = app.deps.bundle.getSnapshot();
  if (id.phase !== "ready") throw new Error("not ready");
  const shown = id.load.bundle.spots.find((s) => s.official_name === pickName());
  fireEvent.click(screen.getByRole("link", { name: t("student.pick.directions") }));
  expect(app.pings).toEqual([shown?.id]);
  expect(app.server.reads).toEqual([]);
});

test("an empty pick names the closest spot and offers a way out", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem(
    PICK_PREFS_KEY,
    JSON.stringify({
      ...DEFAULT_PICK_PREFS,
      presetId: "calls",
      extra: [{ attr: "seat_type", target: "carrel" }],
    }),
  );
  await home(app);
  expect(screen.getByText(t("student.empty.title"))).toBeTruthy();
  expect(screen.getByText("Closest open spot: Quiet Carrels, 0 min away.")).toBeTruthy();
  expect(document.querySelector(".pick-card")).toBeNull();
  await click(t("student.pick.surprise"));
  expect(screen.getByRole("heading", { name: t("student.pick.surprise_heading") })).toBeTruthy();
  expect(screen.queryByText(t("student.empty.title"))).toBeNull();
});

test("a group too big for every spot offers the largest group that fits, and it picks", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem(
    PICK_PREFS_KEY,
    JSON.stringify({
      ...DEFAULT_PICK_PREFS,
      presetId: "group",
      group: 8,
      from: "sac",
      time: "120",
    }),
  );
  await home(app);
  expect(screen.getByText(t("student.empty.title"))).toBeTruthy();
  expect(screen.getByText(t("student.empty.loosen.group"))).toBeTruthy();
  await click(t("student.empty.try_group", { count: 6 }));
  expect(document.querySelector(".pick-card")).not.toBeNull();
  expect(JSON.parse(app.deps.prefs.getItem(PICK_PREFS_KEY) ?? "{}").group).toBe(6);
});

function aged(ageDays: number, checkFailed: boolean): BundleState {
  const ready = readyBundle();
  if (ready.phase !== "ready") throw new Error("not ready");
  return { ...ready, load: { ...ready.load, ageDays }, checkFailed };
}

test("the data age is always shown, and old data gets a note", async () => {
  await home(testApp({ me: null, bundle: aged(0, false) }));
  expect(screen.getByText("Spots updated today")).toBeTruthy();
  expect(screen.queryByText(/days old/)).toBeNull();
});

test("five-day-old spots say so", async () => {
  await home(testApp({ me: null, bundle: aged(5, false) }));
  expect(screen.getByText("Spots updated 5 days ago")).toBeTruthy();
  expect(
    screen.getByText("These spots are 5 days old. Hours and busyness may have changed."),
  ).toBeTruthy();
});

test("a failed check says the spots come from this phone", async () => {
  await home(testApp({ me: null, bundle: aged(0, true) }));
  expect(screen.getByText("Offline. Using spots saved on this phone.")).toBeTruthy();
  expect(document.querySelector(".pick-card")).not.toBeNull();
});

test("a newer Perch is offered with a reload", async () => {
  const ready = readyBundle();
  if (ready.phase !== "ready") throw new Error("not ready");
  await home(
    testApp({ me: null, bundle: { ...ready, load: { ...ready.load, updateAvailable: true } } }),
  );
  expect(screen.getByText("A newer Perch reads newer spots. Reload to update.")).toBeTruthy();
  expect(screen.getByRole("button", { name: t("student.data.reload") })).toBeTruthy();
});

test("with every notice on, the pick still comes first and the notes follow it", async () => {
  const ready = readyBundle();
  if (ready.phase !== "ready") throw new Error("not ready");
  const app = testApp({
    me: null,
    bundle: {
      ...ready,
      load: { ...ready.load, ageDays: 5, updateAvailable: true },
      checkFailed: true,
    },
  });
  app.deps.prefs.setItem(
    PICK_PREFS_KEY,
    JSON.stringify({ ...DEFAULT_PICK_PREFS, from: "torn-down-hall" }),
  );
  await home(app);
  const go = screen.getByRole("link", { name: t("student.pick.directions") });
  const after = (text: string | RegExp) => {
    const el = screen.getByText(text);
    // DOCUMENT_POSITION_FOLLOWING: the note comes after Directions.
    expect(go.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  };
  after("These spots are 5 days old. Hours and busyness may have changed.");
  after("A newer Perch reads newer spots. Reload to update.");
  after("Starting from Melville Library");
  after("Offline. Using spots saved on this phone.");
  // The offline word shares the one meta line under the title with the age.
  const meta = screen.getByText("Spots updated 5 days ago").closest(".meta");
  expect(meta?.textContent).toBe("Spots updated 5 days ago · Offline");
  expect(document.querySelectorAll("main .meta")).toHaveLength(1);
});

test("no cached spots offline says so, with no pick", async () => {
  await home(testApp({ me: null, bundle: { phase: "unavailable", reason: "offline_no_cache" } }));
  expect(screen.getByText("Can't load spots offline yet. Open once with signal.")).toBeTruthy();
  expect(document.querySelector(".pick-card")).toBeNull();
  expect(screen.queryByRole("button", { name: "1 hr" })).toBeNull();
});

test("a bundle too new for this app asks for an update", async () => {
  await home(testApp({ me: null, bundle: { phase: "unavailable", reason: "update_required" } }));
  expect(screen.getByText("Update Perch to load spots.")).toBeTruthy();
});

test("loading shows the skeleton, not a pick", async () => {
  await home(testApp({ me: null, bundle: { phase: "loading" } }));
  expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
  expect(document.querySelector(".pick-card")).toBeNull();
});

test("the access note shows by default and Not now hides it for good", async () => {
  const { app } = await home();
  expect(screen.getByText(t("student.home.access.note"))).toBeTruthy();
  expect(
    screen.getByRole("link", { name: t("student.home.access.action") }).getAttribute("href"),
  ).toBe("/me");
  fireEvent.click(screen.getByRole("button", { name: t("student.home.access.dismiss") }));
  expect(screen.queryByText(t("student.home.access.note"))).toBeNull();
  expect(JSON.parse(app.deps.prefs.getItem(PICK_PREFS_KEY) ?? "{}")).toMatchObject({
    accessNoteDismissed: true,
  });
});
