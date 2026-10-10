import { expect, test } from "bun:test";
import {
  BUILTIN_PRESETS,
  type BundleSpot,
  Criterion,
  fit,
  matchCriterion,
  Preset,
  presetById,
  topReasons,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";
import { mulberry32 } from "../prng.ts";

const b = makeScoringBundle();
const get = (id: string): BundleSpot => {
  const s = b.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(id);
  return s;
};
const silent = presetById("silent_solo", []);
const group = presetById("group", []);

test("matches are yes, no, or unknown for null attributes", () => {
  const carrels = get(SPOT.carrels);
  expect(matchCriterion(carrels, { attr: "noise_policy", target: ["silent"] })).toBe("yes");
  expect(matchCriterion(carrels, { attr: "outlet_coverage_pct", target: 0.5 })).toBe("yes");
  expect(matchCriterion(carrels, { attr: "seat_type", target: "carrel" })).toBe("yes");
  expect(matchCriterion(carrels, { attr: "flag", flag: "natural_light", target: true })).toBe(
    "unknown",
  );
  expect(matchCriterion(carrels, { attr: "flag", flag: "group_work_ok", target: true })).toBe("no");
  expect(matchCriterion(carrels, { attr: "wifi_mbps", target: 10 })).toBe("unknown");
  expect(matchCriterion(carrels, { attr: "amenity", target: "printer" })).toBe("no");
});

test("fit on the golden spots", () => {
  expect(fit(get(SPOT.carrels), silent.soft)).toBe(1);
  expect(fit(get(SPOT.reading), silent.soft)).toBe(0.5);
  expect(fit(get(SPOT.union), silent.soft)).toBe(0.25);
  expect(fit(get(SPOT.sacLounge), group.soft)).toBe(0.5);
  expect(fit(get(SPOT.union), group.soft)).toBe(0.75);
  expect(fit(get(SPOT.union), [])).toBe(1);
});

test("why-this-spot reasons are matched soft terms, heaviest first, at most 2", () => {
  expect(topReasons(get(SPOT.carrels), silent.soft)).toEqual([
    { attr: "noise_policy", target: ["silent"] },
    { attr: "outlet_coverage_pct", target: 0.5 },
  ]);
  expect(topReasons(get(SPOT.union), silent.soft)).toEqual([
    { attr: "outlet_coverage_pct", target: 0.5 },
  ]);
});

test("fit stays in [0, 1] and rises when a spot gains a match (property)", () => {
  const rand = mulberry32(11);
  const flags = ["natural_light", "whiteboard", "step_free", "elevator", "windows_view"] as const;
  for (let i = 0; i < 500; i += 1) {
    const soft = flags.map((flag) => ({
      when: { attr: "flag" as const, flag, target: true },
      weight: 0.5 + Math.floor(rand() * 5),
    }));
    const pickVal = (): boolean | null => (rand() < 0.33 ? null : rand() < 0.5);
    const s: BundleSpot = {
      ...get(SPOT.carrels),
      natural_light: pickVal(),
      whiteboard: rand() < 0.5,
      step_free: pickVal(),
      elevator: pickVal(),
      windows_view: pickVal(),
    };
    const before = fit(s, soft);
    expect(before).toBeGreaterThanOrEqual(0);
    expect(before).toBeLessThanOrEqual(1);
    const flag = flags[Math.floor(rand() * flags.length)] ?? "whiteboard";
    const after: BundleSpot = { ...s };
    after[flag] = true;
    expect(fit(after, soft)).toBeGreaterThanOrEqual(before);
  }
});

test("presets and criteria parse; junk does not", () => {
  for (const p of BUILTIN_PRESETS) expect(Preset.safeParse(p).success).toBe(true);
  expect(Criterion.safeParse({ attr: "noise_policy", target: [] }).success).toBe(false);
  expect(Criterion.safeParse({ attr: "flag", flag: "seat_count", target: true }).success).toBe(
    false,
  );
  expect(presetById("nope", []).id).toBe("silent_solo");
});
