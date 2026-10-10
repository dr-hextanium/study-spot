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
import { mulberry32 } from "../prng.ts";

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
  const input = {
    ...base,
    preset: presetById("calls", []),
    extra: [{ attr: "seat_type", target: "carrel" } as const],
  };
  const none = rankSpots(input);
  expect(none.ranked).toEqual([]);
  expect(explainEmpty(input, none)).toEqual({
    closest: { spot: expect.objectContaining({ slug: "quiet-carrels" }), walkMinutes: 0 },
    loosen: { kind: "preset" },
  });
  const night = { ...input, now: new Date("2026-10-14T07:30:00Z") };
  expect(explainEmpty(night, rankSpots(night)).loosen).toEqual({ kind: "preset" });
});

/** Applies a suggestion the way Home does: Surprise me for the preset, else the new input. */
function applied(input: PickInput, help: ReturnType<typeof explainEmpty>) {
  const l = help.loosen;
  if (l === null) throw new Error("no suggestion");
  switch (l.kind) {
    case "preset":
      return surpriseRank({
        ...input,
        group: input.preset.groupDefault === null ? 1 : input.group,
      });
    case "group":
      return rankSpots({ ...input, group: l.group });
    case "time":
      return rankSpots({ ...input, time: l.time });
    case "from":
      return rankSpots({ ...input, from: l.from });
    case "access":
      return rankSpots({ ...input, access: l.access });
  }
}

/** The fixture with every walk from Kelly Quad set to `minutes`. */
function farKelly(minutes: number) {
  const far = structuredClone(bundle);
  const k = far.walk.building_ids.indexOf("kelly-quad");
  far.walk.minutes = far.walk.minutes.map((row, i) =>
    row.map((m, j) => (i === j ? 0 : i === k || j === k ? minutes : m)),
  );
  return far;
}

test("too far for a short window: suggests the shortest longer window that gives a pick", () => {
  const input: PickInput = { ...base, bundle: farKelly(40), from: "kelly-quad", time: "30" };
  const r = rankSpots(input);
  expect(r.ranked).toEqual([]);
  expect(reasonOf(r, SPOT.carrels)).toBe("too_far");
  const help = explainEmpty(input, r);
  expect(help.loosen).toEqual({ kind: "time", time: "60" });
  expect(applied(input, help).ranked.length).toBeGreaterThan(0);
  // Never a shorter time: every window needs the same 30 minutes after arrival.
  const sixty = { ...input, time: "60" as const, bundle: farKelly(70) };
  expect(explainEmpty(sixty, rankSpots(sixty)).loosen).toEqual({ kind: "time", time: "120" });
});

test("too far even till close: suggests starting from the nearest spot's building", () => {
  const input: PickInput = { ...base, bundle: farKelly(500), from: "kelly-quad", time: "close" };
  const r = rankSpots(input);
  expect(r.ranked).toEqual([]);
  const help = explainEmpty(input, r);
  expect(help.loosen).toEqual({ kind: "from", from: "melville-library" });
  expect(applied(input, help).ranked.length).toBeGreaterThan(0);
});

test("closing soon: names the closest open spot and suggests nothing", () => {
  // 01:45 Wed, only carrels-style late spots: drop the 24h room so all that is open closes at 02:00.
  const late = structuredClone(bundle);
  late.hours = late.hours.filter((h) => h.spot_id !== SPOT.reading);
  late.spots = late.spots.filter((s) => s.id !== SPOT.reading);
  delete late.busyness[SPOT.reading];
  for (const time of ["30", "60", "120", "close"] as const) {
    const input: PickInput = {
      ...base,
      bundle: late,
      now: new Date("2026-10-14T05:45:00Z"),
      time,
      // Access already set, so the 24h Kelly room is not offered as a way out either.
      access: { ...DEFAULT_ACCESS, grad: true },
    };
    const r = rankSpots(input);
    expect(r.ranked).toEqual([]);
    expect(reasonOf(r, SPOT.carrels)).toBe("closing_soon");
    const help = explainEmpty(input, r);
    expect(help.closest?.spot.slug).toBe("quiet-carrels");
    expect(help.loosen).toBeNull();
  }
});

test("a group too big for every spot: suggests the largest group that fits", () => {
  const input: PickInput = {
    ...base,
    from: "sac",
    time: "120",
    preset: presetById("group", []),
    group: 8,
  };
  const r = rankSpots(input);
  expect(r.ranked).toEqual([]);
  const help = explainEmpty(input, r);
  expect(help.loosen).toEqual({ kind: "group", group: 6 });
  expect(applied(input, help).ranked.length).toBeGreaterThan(0);
});

test("only locked spots fit: suggests setting access, with a profile that gives a pick", () => {
  // The carrels are for grad students, and nothing else is confirmed for students.
  const b = structuredClone(bundle);
  b.spots = b.spots.map((s) =>
    s.id === SPOT.carrels
      ? { ...s, eligibility: "grad_only" as const }
      : { ...s, eligibility_verified: false },
  );
  const input: PickInput = { ...base, bundle: b };
  const r = rankSpots(input);
  expect(r.ranked).toEqual([]);
  const help = explainEmpty(input, r);
  expect(help.loosen).toEqual({ kind: "access", access: { ...DEFAULT_ACCESS, grad: true } });
  expect(applied(input, help).ranked.length).toBeGreaterThan(0);
});

test("property: every suggestion, applied, gives a pick (seeded, random inputs)", () => {
  const rand = mulberry32(7);
  const bundles = [bundle, farKelly(40), farKelly(130), farKelly(500)];
  const ids = bundle.buildings.map((x) => x.id);
  const presets = ["silent_solo", "group", "calls", "late_night", "quick_30"];
  const times = ["30", "60", "120", "close"] as const;
  const extras = [[], [{ attr: "seat_type", target: "carrel" } as const]];
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const start = Date.parse("2026-08-01T00:00:00Z");
  let suggested = 0;
  for (let i = 0; i < 600; i += 1) {
    const input: PickInput = {
      ...base,
      bundle: pick(bundles),
      now: new Date(start + Math.floor(rand() * 365 * 24 * 60) * 60_000),
      from: pick(ids),
      time: pick(times),
      group: 1 + Math.floor(rand() * 12),
      preset: presetById(pick(presets), []),
      extra: pick(extras),
    };
    const r = rankSpots(input);
    if (r.ranked.length > 0) continue;
    const help = explainEmpty(input, r);
    if (help.loosen === null) continue;
    suggested += 1;
    expect(applied(input, help).ranked.length).toBeGreaterThan(0);
  }
  expect(suggested).toBeGreaterThan(20);
});

test("Till close: 15 minutes left is closing soon whether or not the walk is zero", () => {
  const now = new Date("2026-10-14T05:45:00Z"); // 01:45 Wed, carrels close at 02:00
  // Carrels are in the library: walk 0, so the old check (min(available, 30)) passed 15 >= 15.
  const fromLibrary = rankSpots({ ...base, now, time: "close" });
  expect(reasonOf(fromLibrary, SPOT.carrels)).toBe("closing_soon");
  expect(slugs(fromLibrary)).toEqual(["reading-room"]);
  const fromSac = rankSpots({ ...base, now, time: "close", from: "sac" });
  expect(reasonOf(fromSac, SPOT.carrels)).toBe("closing_soon");
  // Exactly 30 minutes left is enough
  const enough = rankSpots({ ...base, now: new Date("2026-10-14T05:30:00Z"), time: "close" });
  expect(enough.ranked.some((c) => c.spot.id === SPOT.carrels)).toBe(true);
  expect(enough.ranked.find((c) => c.spot.id === SPOT.carrels)?.available).toBe(30);
});

test("property: scores are in [0, 1] and the list is sorted (seeded, random inputs)", () => {
  const rand = mulberry32(2026);
  const ids = [...bundle.buildings.map((x) => x.id), "gone-building"];
  const presets = ["silent_solo", "group", "calls", "late_night", "quick_30"];
  const times = ["30", "60", "120", "close"] as const;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const start = Date.parse("2026-08-01T00:00:00Z");
  for (let i = 0; i < 400; i += 1) {
    const input: PickInput = {
      ...base,
      now: new Date(start + Math.floor(rand() * 365 * 24 * 60) * 60_000),
      from: pick(ids),
      time: pick(times),
      group: 1 + Math.floor(rand() * 12),
      preset: presetById(pick(presets), []),
    };
    for (const result of [rankSpots(input), surpriseRank(input)]) {
      for (const c of result.ranked) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(1);
        expect(c.pSeat).toBeGreaterThanOrEqual(0);
        expect(c.pSeat).toBeLessThanOrEqual(1);
        expect(c.timeValue).toBeGreaterThan(0);
        expect(c.timeValue).toBeLessThanOrEqual(1);
        expect(c.fit).toBeGreaterThanOrEqual(0);
        expect(c.fit).toBeLessThanOrEqual(1);
      }
      for (let j = 1; j < result.ranked.length; j += 1) {
        const a = result.ranked[j - 1];
        const b = result.ranked[j];
        if (a === undefined || b === undefined) throw new Error("index");
        const ordered =
          a.score > b.score ||
          (a.score === b.score &&
            (a.walkMinutes < b.walkMinutes ||
              (a.walkMinutes === b.walkMinutes && a.spot.slug.localeCompare(b.spot.slug) <= 0)));
        expect(ordered).toBe(true);
      }
      expect(result.ranked.length + result.excluded.length).toBe(bundle.spots.length);
    }
  }
});

test("a huge group that underflows P(seat) to 0 is not reported as too big", () => {
  const tiny = structuredClone(bundle);
  const lounge = tiny.spots.find((s) => s.id === SPOT.sacLounge);
  if (lounge === undefined) throw new Error("fixture");
  lounge.max_group_size = null;
  lounge.effective_capacity = 0.001;
  // Measured slots skip the 0.7 * P + 0.15 shrink, so P underflows to exactly 0.
  const loungeBusy = tiny.busyness[SPOT.sacLounge];
  if (loungeBusy === undefined) throw new Error("fixture");
  loungeBusy.confidence = loungeBusy.confidence.map(() => "measured" as const);
  const r = rankSpots({
    ...base,
    bundle: tiny,
    from: "sac",
    time: "120",
    preset: presetById("group", []),
    group: 12,
  });
  // The only group_too_big exclusion is the real one: max_group_size 4 at the union
  expect(reasonOf(r, SPOT.union)).toBe("group_too_big");
  expect(reasonOf(r, SPOT.sacLounge)).toBeUndefined();
  expect(r.ranked.find((c) => c.spot.id === SPOT.sacLounge)?.pSeat).toBe(0);
});

test("Surprise me ignores the preset's group default and uses the Home group size", () => {
  const groupPreset = presetById("group", []); // groupDefault 3
  // Home group is 1: the preset's default of 3 must not apply, so the 1-seat carrels qualify.
  const solo = surpriseRank({ ...base, preset: groupPreset, group: 1 });
  expect(solo.ranked.some((c) => c.spot.id === SPOT.carrels)).toBe(true);
  // Home group is 5 with a preset that has no group at all: the size still applies.
  const five = surpriseRank({ ...base, preset: presetById("silent_solo", []), group: 5 });
  expect(reasonOf(five, SPOT.union)).toBe("group_too_big");
  expect(reasonOf(five, SPOT.carrels)).toBe("group_too_big");
  expect(slugs(five).sort()).toEqual(["reading-room", "sac-lounge"]);
  // Quick pick keeps the old rule: no group preset, no group.
  expect(rankSpots({ ...base, group: 5 }).ranked.some((c) => c.spot.id === SPOT.carrels)).toBe(
    true,
  );
});

test("an unknown from building falls back to the default and says so", () => {
  const known = rankSpots(base);
  expect(known.from).toBe("melville-library");
  expect(known.fromFallback).toBe(false);
  const gone = rankSpots({ ...base, from: "gone-building" });
  expect(gone.from).toBe("melville-library");
  expect(gone.fromFallback).toBe(true);
  // Same result as asking from the default building, not a 0-minute walk from nowhere
  expect(gone.ranked.map((c) => [c.spot.slug, c.walkMinutes])).toEqual(
    known.ranked.map((c) => [c.spot.slug, c.walkMinutes]),
  );
  // Melville to the union is 6 minutes in the matrix; from nowhere it would have been 0
  expect(gone.ranked.find((c) => c.spot.id === SPOT.union)?.walkMinutes).toBe(6);
  expect(surpriseRank({ ...base, from: "gone-building" }).fromFallback).toBe(true);
  // No buildings at all: an empty result, flagged, never a crash
  const none = rankSpots({ ...base, bundle: { ...bundle, buildings: [] }, from: "x" });
  expect(none).toEqual({ ranked: [], excluded: [], from: null, fromFallback: true });
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
