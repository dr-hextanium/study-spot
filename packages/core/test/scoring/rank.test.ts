import { expect, test } from "bun:test";
import {
  DEFAULT_ACCESS,
  explainEmpty,
  type PickInput,
  presetById,
  rankSpots,
  resolveFrom,
  slotIndex,
  surpriseRank,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

const bundle = makeScoringBundle();
const TUE_2PM = new Date("2026-10-13T18:00:00Z");
const base: PickInput = {
  bundle,
  now: TUE_2PM,
  from: "melville-library",
  time: "60",
  preset: presetById("silent_solo", []),
  extra: [],
  group: 1,
  access: DEFAULT_ACCESS,
};
const slugs = (r: ReturnType<typeof rankSpots>) => r.ranked.map((c) => c.spot.slug);
const reasonOf = (r: ReturnType<typeof rankSpots>, id: string) =>
  r.excluded.find((e) => e.spot.id === id)?.reason;

test("golden: silent solo from the library, 1 hr, Tue 2 PM", () => {
  const r = rankSpots(base);
  expect(slugs(r)).toEqual(["quiet-carrels", "union-study", "reading-room"]);
  expect(r.ranked[0]?.score).toBeCloseTo(0.924733, 5);
  expect(r.ranked[1]?.score).toBeCloseTo(0.206848, 5);
  expect(r.ranked[2]?.score).toBeCloseTo(0.142095, 5);
  expect(r.ranked[0]?.seat).toBe("likely");
  expect(r.ranked[2]?.seat).toBe("unlikely");
  expect(reasonOf(r, SPOT.sacLounge)).toBe("required");
  expect(reasonOf(r, SPOT.kelly)).toBe("locked");
  expect(reasonOf(r, SPOT.grad)).toBe("locked");
  expect(reasonOf(r, SPOT.unverified)).toBe("unverified");
  expect(reasonOf(r, SPOT.hoursTbd)).toBe("hours_unconfirmed");
});

test("golden: group of 4 from SAC, 2 hr", () => {
  const r = rankSpots({
    ...base,
    from: "sac",
    time: "120",
    preset: presetById("group", []),
    group: 4,
  });
  expect(slugs(r)).toEqual(["union-study", "sac-lounge"]);
  // 0.75 fit * 0.921082 P(seat) * (120 - 5 - 3) / 120 = 0.644757
  expect(r.ranked[0]?.score).toBeCloseTo(0.644757, 5);
  expect(r.ranked[1]?.score).toBeCloseTo(0.301762, 5);
});

test("group of 5 drops the spot that seats 4", () => {
  const r = rankSpots({
    ...base,
    from: "sac",
    time: "120",
    preset: presetById("group", []),
    group: 5,
  });
  expect(slugs(r)).toEqual(["sac-lounge"]);
  expect(reasonOf(r, SPOT.union)).toBe("group_too_big");
});

test("group size is ignored for presets without a group", () => {
  expect(slugs(rankSpots({ ...base, group: 6 }))).toEqual(slugs(rankSpots(base)));
});

test("23:40 Tue: a spot closing at midnight is too soon; past-midnight spots stay", () => {
  const r = rankSpots({ ...base, now: new Date("2026-10-14T03:40:00Z") });
  expect(slugs(r)).toEqual(["quiet-carrels", "reading-room"]);
  expect(reasonOf(r, SPOT.union)).toBe("closing_soon");
});

test("01:45 Wed: carrels close at 02:00, only the 24h room is left", () => {
  const r = rankSpots({ ...base, now: new Date("2026-10-14T05:45:00Z") });
  expect(slugs(r)).toEqual(["reading-room"]);
  expect(reasonOf(r, SPOT.carrels)).toBe("closing_soon");
  expect(reasonOf(r, SPOT.union)).toBe("closed");
});

test("till close uses minutes until each spot closes, capped at 8 hours", () => {
  const r = rankSpots({ ...base, time: "close" });
  const carrels = r.ranked.find((c) => c.spot.id === SPOT.carrels);
  expect(carrels?.available).toBe(480);
  const late = rankSpots({ ...base, time: "close", now: new Date("2026-10-14T03:40:00Z") });
  expect(late.ranked.find((c) => c.spot.id === SPOT.carrels)?.available).toBe(140);
});

test("extra filters add required criteria", () => {
  const r = rankSpots({ ...base, extra: [{ attr: "seat_type", target: "carrel" }] });
  expect(slugs(r)).toEqual(["quiet-carrels"]);
});

test("exam week busyness raises ratios with the 1.25 fallback", () => {
  const r = rankSpots({ ...base, now: new Date("2026-12-15T19:00:00Z") });
  const carrels = r.ranked.find((c) => c.spot.id === SPOT.carrels);
  expect(carrels?.reading).toEqual({ ratio: 0.4375, confidence: "estimated" });
});

test("surprise ignores the preset but never locked, unverified, or unconfirmed spots", () => {
  const r = surpriseRank(base);
  expect(slugs(r).sort()).toEqual(["quiet-carrels", "reading-room", "sac-lounge", "union-study"]);
  expect(r.ranked.every((c) => c.fit === 1)).toBe(true);
  expect(reasonOf(r, SPOT.kelly)).toBe("locked");
  expect(reasonOf(r, SPOT.unverified)).toBe("unverified");
  expect(reasonOf(r, SPOT.hoursTbd)).toBe("hours_unconfirmed");
});

test("from falls back to Melville Library, then the first building by name", () => {
  expect(resolveFrom(bundle, "sac")).toBe("sac");
  expect(resolveFrom(bundle, "gone-building")).toBe("melville-library");
  expect(resolveFrom(bundle, null)).toBe("melville-library");
  const noLib = {
    ...bundle,
    buildings: bundle.buildings.filter((b) => b.id !== "melville-library"),
  };
  expect(resolveFrom(noLib, null)).toBe("kelly-quad");
  expect(resolveFrom({ ...bundle, buildings: [] }, null)).toBeNull();
});

test("empty state names the closest filtered-out open spot and what to loosen", () => {
  const r = rankSpots({ ...base, preset: presetById("calls", []) });
  expect(r.ranked.map((c) => c.spot.slug)).toEqual(["sac-lounge"]);
  const none = rankSpots({
    ...base,
    preset: presetById("calls", []),
    extra: [{ attr: "seat_type", target: "carrel" }],
  });
  expect(none.ranked).toEqual([]);
  expect(explainEmpty(none, DEFAULT_ACCESS)).toEqual({
    closest: { spot: expect.objectContaining({ slug: "quiet-carrels" }), walkMinutes: 0 },
    loosen: "preset",
  });
  const nightAll = rankSpots({
    ...base,
    now: new Date("2026-10-14T07:30:00Z"),
    extra: [{ attr: "seat_type", target: "carrel" }],
  });
  expect(explainEmpty(nightAll, DEFAULT_ACCESS).loosen).toBe("preset");
});

test("busyness slots count from Monday while hours count from Sunday", () => {
  // Make the carrels' busyness differ per slot: ratio = 0.01 * slotDow-hour index / 17 style marker.
  const marked = structuredClone(bundle);
  const carrelsBusy = marked.busyness[SPOT.carrels];
  if (carrelsBusy === undefined) throw new Error("fixture");
  // Mark every slot with its own distinct ratio so the day mapping is observable.
  carrelsBusy.regular = Array.from({ length: 168 }, (_, i) => i / 1000);
  // Tue 2026-10-13 14:00 EDT: slot day 1 (Tuesday), hour 14, walk 0, arrival 14:00.
  const tue = rankSpots({ ...base, bundle: marked });
  expect(tue.ranked.find((c) => c.spot.id === SPOT.carrels)?.reading.ratio).toBeCloseTo(
    slotIndex(1, 14) / 1000,
    10,
  );
  // Sun 2026-10-18 14:00 EDT: slot day 6 (Sunday), not 0.
  const sun = rankSpots({ ...base, bundle: marked, now: new Date("2026-10-18T18:00:00Z") });
  expect(sun.ranked.find((c) => c.spot.id === SPOT.carrels)?.reading.ratio).toBeCloseTo(
    slotIndex(6, 14) / 1000,
    10,
  );
  // The arrival time, not now, picks the slot: a late arrival crosses the hour.
  const late = rankSpots({
    ...base,
    bundle: marked,
    from: "student-union",
    now: new Date("2026-10-13T17:58:00Z"),
  });
  // union walk 6 + carrel floor 0 => arrives 14:04 EDT, still hour 14
  expect(late.ranked.find((c) => c.spot.id === SPOT.carrels)?.reading.ratio).toBeCloseTo(
    slotIndex(1, 14) / 1000,
    10,
  );
});
