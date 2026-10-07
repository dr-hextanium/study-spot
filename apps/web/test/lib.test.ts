import { PHOTO_MAX_BYTES } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { expect, test } from "vitest";
import { cellsOf, nextBucket, toGrid } from "../src/lib/estimates.ts";
import { fieldValueText, valueText } from "../src/lib/fields.ts";
import {
  closesNextDay,
  copyMonday,
  type DayHours,
  dayProblem,
  fromWeek,
  toWeek,
} from "../src/lib/hours.ts";
import { GOOD_FIX_METERS, spotPoint } from "../src/lib/location.ts";
import { fitWithin, type ImageKit, shrinkPhoto } from "../src/lib/photo.ts";
import { slugify, spotSlug } from "../src/lib/slug.ts";

test("slugs are lowercase words with single dashes, at most 80 characters", () => {
  expect(slugify("  Café 3rd-Floor  Reading Room! ")).toBe("cafe-3rd-floor-reading-room");
  expect(spotSlug("Central Reading Room", "melville-library")).toBe(
    "central-reading-room-melville-library",
  );
  const long = slugify("word ".repeat(40));
  expect(long.length).toBeLessThanOrEqual(80);
  expect(long.endsWith("-")).toBe(false);
});

test("hours round-trip through the week model, Monday first", () => {
  const rows = [
    { day_of_week: 1, opens: "08:00", closes: "02:00", last_entry: null, is_exam: false },
    { day_of_week: 0, opens: "00:00", closes: "24:00", last_entry: null, is_exam: false },
    { day_of_week: 2, opens: "08:00", closes: "12:00", last_entry: null, is_exam: false },
    { day_of_week: 2, opens: "13:00", closes: "22:00", last_entry: null, is_exam: false },
  ];
  const week = toWeek(rows, false);
  expect(week.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  expect(week[0]?.hours).toEqual({
    kind: "open",
    opens: "08:00",
    closes: "02:00",
    lastEntry: null,
  });
  expect(week[6]?.hours).toEqual({ kind: "all_day" });
  expect(week[2]?.hours).toEqual({ kind: "closed" });
  expect(fromWeek(week, false)).toHaveLength(4);
  expect(closesNextDay(week[0]?.hours ?? { kind: "closed" })).toBe(true);
});

test("copy Monday fills Tuesday to Friday only", () => {
  const week = copyMonday(
    toWeek(
      [{ day_of_week: 1, opens: "09:00", closes: "17:00", last_entry: null, is_exam: false }],
      false,
    ),
  );
  expect(week.filter((d) => d.hours.kind === "open").map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
});

test("a day cannot open and close at the same time; a stored 24:00 close stays 24:00", () => {
  expect(dayProblem({ kind: "open", opens: "09:00", closes: "09:00", lastEntry: null })).toBe(
    "same_time",
  );
  expect(dayProblem({ kind: "open", opens: "", closes: "09:00", lastEntry: null })).toBe(
    "missing_time",
  );
  const late = toWeek(
    [{ day_of_week: 3, opens: "18:00", closes: "24:00", last_entry: null, is_exam: true }],
    true,
  );
  expect(late[2]?.hours).toEqual({
    kind: "open",
    opens: "18:00",
    closes: "24:00",
    lastEntry: null,
  });
  expect(closesNextDay(late[2]?.hours ?? { kind: "closed" })).toBe(true);
});

test("an unchanged edit writes the stored hours back identically", () => {
  const rows = [
    { day_of_week: 1, opens: "08:00", closes: "12:00", last_entry: "11:30", is_exam: false },
    { day_of_week: 1, opens: "13:00", closes: "24:00", last_entry: null, is_exam: false },
    { day_of_week: 2, opens: "00:00", closes: "24:00", last_entry: "23:00", is_exam: false },
    { day_of_week: 3, opens: "00:00", closes: "24:00", last_entry: null, is_exam: false },
    { day_of_week: 4, opens: "18:00", closes: "24:00", last_entry: null, is_exam: false },
    { day_of_week: 5, opens: "08:00", closes: "02:00", last_entry: null, is_exam: false },
  ];
  expect(fromWeek(toWeek(rows, false), false)).toEqual(rows);
});

test("estimate cells cycle upward and only set cells are sent", () => {
  expect(nextBucket(null)).toBe("empty");
  expect(nextBucket("nearly_full")).toBe("full");
  expect(nextBucket("full")).toBe("empty");
  const grid = toGrid([
    {
      day_type: "weekday",
      block: "evening",
      bucket: "filling",
      created_at: "2026-10-01T00:00:00Z",
    },
  ]);
  expect(cellsOf(grid)).toEqual([{ day_type: "weekday", block: "evening", bucket: "filling" }]);
});

test("values read as the surveyor would say them", () => {
  expect(valueText(null)).toBe(t("common.unknown"));
  expect(valueText(true)).toBe(t("common.yes"));
  expect(valueText("covered_drinks")).toBe(t("use.food.covered_drinks"));
  expect(valueText([{ type: "carrel", count: 0 }])).toBe(t("seating.type.carrel"));
  expect(fieldValueText("outlet_coverage_pct", 0.6)).toBe("60%");
});

test("a rough fix falls back to the building's point", () => {
  const building = { lat: 1, lng: 2 };
  const fix = (accuracyMeters: number) => ({
    kind: "fix" as const,
    fix: { lat: 9, lng: 9, accuracyMeters },
  });
  expect(spotPoint(fix(GOOD_FIX_METERS), building)).toEqual({ lat: 9, lng: 9 });
  expect(spotPoint(fix(GOOD_FIX_METERS + 1), building)).toEqual(building);
  expect(spotPoint({ kind: "denied" }, building)).toEqual(building);
});

test("photos fit within 1600 px on the longest side and never grow", () => {
  expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
});

function kit(sizes: number[], decodes = true): ImageKit & { qualities: number[] } {
  const qualities: number[] = [];
  return {
    qualities,
    decode: async () =>
      decodes ? { width: 4000, height: 3000, image: {} as CanvasImageSource } : null,
    encode: async (_image, _size, quality) => {
      qualities.push(quality);
      const n = sizes.shift() ?? 0;
      return new Blob([new Uint8Array(n)], { type: "image/jpeg" });
    },
  };
}

test("an encode over 1.5 MB retries once at 0.7, then gives up", async () => {
  const once = kit([PHOTO_MAX_BYTES + 1, 900_000]);
  const ok = await shrinkPhoto(new Blob(), once);
  expect(ok.ok && ok.width).toBe(1600);
  expect(once.qualities).toEqual([0.8, 0.7]);
  expect(await shrinkPhoto(new Blob(), kit([PHOTO_MAX_BYTES + 1, PHOTO_MAX_BYTES + 1]))).toEqual({
    ok: false,
    reason: "too_big",
  });
  expect(await shrinkPhoto(new Blob(), kit([], false))).toEqual({
    ok: false,
    reason: "unreadable",
  });
});

test("a stored 24:00 close reads as next day, like a typed midnight", () => {
  const open = (closes: string): DayHours => ({
    kind: "open",
    opens: "08:00",
    closes,
    lastEntry: null,
  });
  expect(closesNextDay(open("24:00"))).toBe(true);
  expect(closesNextDay(open("00:00"))).toBe(true);
  expect(closesNextDay(open("22:00"))).toBe(false);
});
