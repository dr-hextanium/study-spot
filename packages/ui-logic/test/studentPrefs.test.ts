import { expect, test } from "bun:test";
import { makeScoringBundle, SPOT } from "../../core/test/fixtures/scoring-bundle.ts";
import {
  DEFAULT_PICK_PREFS,
  directionsUrl,
  FILTER_GROUP,
  FILTER_ID,
  FILTERS,
  filterGroupLabel,
  isOn,
  MAX_BUILDING_METERS,
  nearestBuilding,
  PICK_PREFS_KEY,
  PickPrefs,
  readJson,
  readRecent,
  toggle,
  writeJson,
  writeRecent,
} from "../src/index.ts";
import { MemoryStorage } from "./fakes.ts";

test("missing prefs are defaults without a reset; corrupt ones reset", () => {
  const s = new MemoryStorage();
  expect(readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS)).toEqual({
    value: DEFAULT_PICK_PREFS,
    reset: false,
  });
  s.setItem(PICK_PREFS_KEY, "{not json");
  expect(readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS)).toEqual({
    value: DEFAULT_PICK_PREFS,
    reset: true,
  });
  s.setItem(PICK_PREFS_KEY, JSON.stringify({ ...DEFAULT_PICK_PREFS, group: 99 }));
  expect(readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS).reset).toBe(true);
});

test("a storage that throws reads as defaults and a failed write reports false", () => {
  const broken = {
    getItem(): string | null {
      throw new Error("blocked");
    },
    setItem(): void {
      throw new Error("quota");
    },
    removeItem(): void {
      throw new Error("blocked");
    },
  };
  expect(readJson(broken, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS).value).toEqual(
    DEFAULT_PICK_PREFS,
  );
  expect(writeJson(broken, PICK_PREFS_KEY, DEFAULT_PICK_PREFS)).toBe(false);
});

test("prefs never keep coordinates, even if something wrote them", () => {
  const s = new MemoryStorage();
  s.setItem(
    PICK_PREFS_KEY,
    JSON.stringify({ ...DEFAULT_PICK_PREFS, from: "sac", lat: 40.9, lng: -73.1 }),
  );
  const read = readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS);
  expect(read.value.from).toBe("sac");
  writeJson(s, PICK_PREFS_KEY, read.value);
  expect(s.getItem(PICK_PREFS_KEY)).not.toMatch(/lat|lng|40\.9/);
});

test("recent histories are per kind, Zod-checked, and drop junk", () => {
  const tab = new MemoryStorage();
  writeRecent(tab, "pick", [SPOT.carrels]);
  expect(readRecent(tab, "pick")).toEqual([SPOT.carrels]);
  expect(readRecent(tab, "surprise")).toEqual([]);
  tab.setItem("student:recent:surprise", JSON.stringify(["junk"]));
  expect(readRecent(tab, "surprise")).toEqual([]);
});

test("filters toggle exact criteria", () => {
  const on = toggle([], "outlets");
  expect(isOn(on, "outlets")).toBe(true);
  expect(isOn(on, "calls")).toBe(false);
  expect(toggle(on, "outlets")).toEqual([]);
  expect(FILTERS.map((f) => f.id)).toEqual([
    "silent",
    "quiet",
    "talking",
    "outlets",
    "calls",
    "food",
    "drinks",
    "group_ok",
    "whiteboard",
    "big_room",
    "natural_light",
    "step_free",
    "elevator",
    "open_late",
    "printer",
    "coffee",
  ]);
  for (const f of FILTERS) expect(FILTER_ID).toContain(f.id);
  for (const g of FILTER_GROUP) {
    expect(filterGroupLabel(g).length).toBeGreaterThan(0);
    expect(FILTERS.some((f) => f.group === g)).toBe(true);
  }
});

test("nearest building snaps a fix, refuses a rough one, and one far from campus", () => {
  const { buildings } = makeScoringBundle();
  const near = nearestBuilding(buildings, { lat: 40.9146, lng: -73.1242, accuracyMeters: 20 });
  expect(near.kind === "near" ? near.building.id : null).toBe("sac");
  expect(nearestBuilding(buildings, { lat: 40.9146, lng: -73.1242, accuracyMeters: 5000 })).toEqual(
    { kind: "rough" },
  );
  // Port Jefferson, about 8 km away: no building is close enough to stand in for it.
  expect(nearestBuilding(buildings, { lat: 40.9465, lng: -73.0693, accuracyMeters: 20 })).toEqual({
    kind: "far",
  });
  // Just inside the limit still snaps.
  expect(
    nearestBuilding(buildings, { lat: 40.9154 + 0.017, lng: -73.1222, accuracyMeters: 20 }).kind,
  ).toBe("near");
  expect(MAX_BUILDING_METERS).toBe(2000);
  expect(nearestBuilding([], { lat: 0, lng: 0, accuracyMeters: 1 })).toEqual({ kind: "far" });
});

test("directions carry only the spot's point", () => {
  expect(directionsUrl({ lat: 40.9155, lng: -73.1221 }, false)).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=40.9155%2C-73.1221&travelmode=walking",
  );
  expect(directionsUrl({ lat: 40.9155, lng: -73.1221 }, true)).toBe(
    "https://maps.apple.com/?daddr=40.9155%2C-73.1221&dirflg=w",
  );
});
