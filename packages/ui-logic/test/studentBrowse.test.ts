import { expect, test } from "bun:test";
import { DEFAULT_ACCESS } from "@perch/core";
import { makeScoringBundle } from "../../core/test/fixtures/scoring-bundle.ts";
import {
  arrivalAt,
  BROWSE_FILTER_GROUP,
  BROWSE_FILTERS,
  BROWSE_PREFS_KEY,
  type BrowsePrefs,
  browseView,
  DEFAULT_BROWSE_PREFS,
  FILTER_ID,
  FILTERS,
  hiddenLockedText,
  isOn,
  readBrowsePrefs,
  searchBrowse,
  toggle,
  writeBrowsePrefs,
} from "../src/index.ts";
import { MemoryStorage } from "./fakes.ts";

const NY = "America/New_York";
const TUE_2PM = new Date("2026-10-13T18:00:00Z");
const bundle = makeScoringBundle();
const view = (prefs: Partial<BrowsePrefs> = {}, now = TUE_2PM, access = DEFAULT_ACCESS) =>
  browseView(bundle, { ...DEFAULT_BROWSE_PREFS, ...prefs }, "melville-library", access, now);
const names = (v: ReturnType<typeof view>) => v.rows.map((r) => r.name);

test("default rows are sorted by walk and hide locked spots", () => {
  const v = view();
  expect(names(v)).toEqual([
    "Quiet Carrels",
    "Reading Room",
    "Unverified Room",
    "SAC Lounge",
    "Union Study Room",
    "Hours TBD",
  ]);
  expect(v.hiddenLocked).toBe(2);
  expect(v.rows.map((r) => r.walkMinutes)).toEqual([0, 2, 4, 5, 6, 7]);
  expect(v.count).toBe("6 spots");
});

test("show locked adds the locked spots, greyed and labelled", () => {
  const v = view({ showLocked: true });
  expect(v.rows).toHaveLength(8);
  expect(v.hiddenLocked).toBe(0);
  const kelly = v.rows.find((r) => r.name === "Kelly RCC");
  expect(kelly?.locked).toBe(true);
  expect(kelly?.sub).toContain("Residents of Kelly Quad only");
  expect(v.rows.find((r) => r.name === "Grad Lounge")?.sub).toContain("Grad students only");
});

test("a resident of the quad can use the spot, so it is not locked", () => {
  const v = view({}, TUE_2PM, { residence: null, quad: "kelly-quad", grad: false });
  const kelly = v.rows.find((r) => r.name === "Kelly RCC");
  expect(kelly?.locked).toBe(false);
  expect(v.hiddenLocked).toBe(1);
});

test("unverified access and unconfirmed hours say so", () => {
  const v = view();
  const unverified = v.rows.find((r) => r.name === "Unverified Room");
  expect(unverified?.sub).toContain("Access not confirmed yet");
  // Unconfirmed access is labelled but not locked: the spot stays listed.
  expect(unverified?.locked).toBe(false);
  const tbd = v.rows.find((r) => r.name === "Hours TBD");
  expect(tbd?.status).toBe("hours_unknown");
  expect(tbd?.sub).toContain("Hours not confirmed");
});

test("rows read in the chosen arrival time", () => {
  const sac = (v: ReturnType<typeof view>) => v.rows.find((r) => r.name === "SAC Lounge");
  const tonight = sac(view({ arrive: "tonight" }));
  expect(tonight?.status).toBe("open");
  expect(tonight?.sub).toContain("Open till 11:00 PM");
  const late = sac(view({ arrive: "4" }, new Date("2026-10-14T03:30:00Z")));
  expect(late?.status).toBe("closed");
  expect(late?.sub).toContain("Closed then");
  const soon = sac(view({ arrive: "now" }, new Date("2026-10-14T02:30:00Z")));
  expect(soon?.status).toBe("closes_soon");
  expect(soon?.sub).toContain("Closes in 30 min");
});

test("open only drops closed and unconfirmed rows", () => {
  const v = view({ openOnly: true }, new Date("2026-10-13T07:00:00Z"));
  expect(names(v)).toEqual(["Reading Room"]);
});

test("extra filters keep only matching spots", () => {
  const outlets = BROWSE_FILTERS.find((f) => f.id === "outlets");
  if (outlets === undefined) throw new Error("no outlets filter");
  const v = view({ extra: [outlets.criterion] });
  expect(names(v)).toEqual(["Quiet Carrels", "SAC Lounge", "Union Study Room"]);
});

test("the caption names the slot and says not live", () => {
  expect(view().caption).toBe("Busyness is typical for Tue 2 PM, not live.");
  expect(view({ arrive: "2" }).caption).toBe("Busyness is typical for Tue 4 PM, not live.");
});

test("every busyness string names its basis and never claims to be live", () => {
  for (const arrive of ["now", "1", "2", "4", "tonight"] as const) {
    for (const r of view({ arrive, showLocked: true }).rows) {
      expect(r.busy).toMatch(/^Usually|est\.$|^No data/);
      expect(r.busyLong).toMatch(/typical|estimate|No busyness data/);
      expect(r.busyLong).not.toMatch(/\blive\b|\bnow\b|right now/i);
      expect(r.busy).not.toMatch(/\blive\b|\bnow\b/i);
    }
  }
  const byName = new Map(view().rows.map((r) => [r.name, r]));
  expect(byName.get("Quiet Carrels")?.busyLong).toBe("Usually some seats, typical Tue 2 PM");
  expect(byName.get("Quiet Carrels")?.bucket).toBe("some");
  expect(byName.get("SAC Lounge")?.busy).toBe("Filling up, est.");
  expect(byName.get("Hours TBD")?.bucket).toBe("none");
  expect(byName.get("Hours TBD")?.busy).toBe("No data yet");
});

test("every row shows when it was last checked", () => {
  for (const r of view().rows) expect(r.checked).toBe("Checked Oct 6");
});

test("arrival times", () => {
  expect(arrivalAt(TUE_2PM, "now", NY).toISOString()).toBe("2026-10-13T18:00:00.000Z");
  expect(arrivalAt(TUE_2PM, "2", NY).toISOString()).toBe("2026-10-13T20:00:00.000Z");
  expect(arrivalAt(TUE_2PM, "tonight", NY).toISOString()).toBe("2026-10-14T01:00:00.000Z");
  const lateNight = new Date("2026-10-14T03:30:00Z");
  expect(arrivalAt(lateNight, "tonight", NY).toISOString()).toBe(lateNight.toISOString());
});

test("an unknown from building falls back instead of a zero walk", () => {
  const v = browseView(bundle, DEFAULT_BROWSE_PREFS, "gone-building", DEFAULT_ACCESS, TUE_2PM);
  expect(v.rows[0]?.name).toBe("Quiet Carrels");
});

test("browse prefs: corrupt storage reads as defaults, good values round trip", () => {
  const s = new MemoryStorage();
  expect(readBrowsePrefs(s)).toEqual(DEFAULT_BROWSE_PREFS);
  s.setItem(BROWSE_PREFS_KEY, "{not json");
  expect(readBrowsePrefs(s)).toEqual(DEFAULT_BROWSE_PREFS);
  s.setItem(BROWSE_PREFS_KEY, JSON.stringify({ ...DEFAULT_BROWSE_PREFS, arrive: "9" }));
  expect(readBrowsePrefs(s)).toEqual(DEFAULT_BROWSE_PREFS);
  const next = { ...DEFAULT_BROWSE_PREFS, view: "map", showLocked: true } as const;
  writeBrowsePrefs(s, next);
  expect(readBrowsePrefs(s)).toEqual(next);
});

test("the filter list covers every filterable v0 attribute, once each", () => {
  const ids = BROWSE_FILTERS.map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length);
  // Browse shows every shared filter, and Home's short list is a part of it.
  expect([...ids].sort()).toEqual([...FILTER_ID].sort());
  for (const f of FILTERS) {
    expect(BROWSE_FILTERS.find((b) => b.id === f.id)?.criterion).toEqual(f.criterion);
  }
  for (const g of BROWSE_FILTER_GROUP) {
    expect(BROWSE_FILTERS.some((f) => f.group === g)).toBe(true);
  }
  const flags = new Set(
    BROWSE_FILTERS.flatMap((f) => (f.criterion.attr === "flag" ? [f.criterion.flag] : [])),
  );
  for (const flag of [
    "group_work_ok",
    "natural_light",
    "windows_view",
    "whiteboard",
    "usb_outlets",
    "step_free",
    "elevator",
    "accessible_seating",
    "open_past_midnight",
    "staffed_late",
    "lit_route_to_residences",
    "outdoor",
    "spread_out_room",
    "reservable",
    "temperature_consistent",
  ] as const) {
    expect(flags.has(flag)).toBe(true);
  }
  const attrs = new Set(BROWSE_FILTERS.map((f) => f.criterion.attr));
  for (const attr of [
    "noise_policy",
    "calls_ok",
    "food_policy",
    "lighting",
    "temperature",
    "cell_signal",
    "entry_method",
    "outlet_coverage_pct",
    "seat_count",
    "wifi_mbps",
    "seat_type",
    "table_config",
    "amenity",
  ] as const) {
    expect(attrs.has(attr)).toBe(true);
  }
  const amenities = BROWSE_FILTERS.flatMap((f) =>
    f.criterion.attr === "amenity" ? [f.criterion.target] : [],
  );
  expect(amenities.sort()).toEqual([
    "bathroom",
    "coffee_food",
    "late_food",
    "microwave",
    "printer",
    "water",
  ]);
});

test("toggling a filter adds and removes its exact criterion", () => {
  const on = toggle([], "outlets");
  expect(isOn(on, "outlets")).toBe(true);
  expect(toggle(on, "outlets")).toEqual([]);
  expect(isOn(toggle(on, "carrels"), "outlets")).toBe(true);
});

test("search narrows by name or building, and the count follows", () => {
  const v = view();
  expect(searchBrowse(v, "").rows).toHaveLength(6);
  expect(names(searchBrowse(v, "sac"))).toEqual(["SAC Lounge"]);
  const activities = searchBrowse(v, "activities center");
  expect(names(activities)).toEqual(["Unverified Room", "SAC Lounge"]);
  expect(activities.count).toBe("2 spots");
  expect(searchBrowse(v, "carrels").count).toBe("1 spot");
  expect(searchBrowse(v, "library lounge").rows).toHaveLength(0);
});

test("hidden locked note wording", () => {
  expect(hiddenLockedText(0)).toBeNull();
  expect(hiddenLockedText(1)).toBe("1 spot hidden for access");
  expect(hiddenLockedText(2)).toBe("2 spots hidden for access");
});
