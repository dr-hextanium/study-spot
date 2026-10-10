import { expect, test } from "bun:test";
import {
  type BundleSpot,
  busyBucket,
  pSeat,
  type SlotConfidence,
  seatWord,
  slotReading,
  timeValue,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";
import { mulberry32 } from "../prng.ts";

const b = makeScoringBundle();
const get = (id: string): BundleSpot => {
  const s = b.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(id);
  return s;
};
const busy = (id: string) => {
  const x = b.busyness[id];
  if (x === undefined) throw new Error(id);
  return x;
};

test("P(seat) logistic values on the golden spots", () => {
  const m = (ratio: number) => ({ ratio, confidence: "measured" as const });
  expect(pSeat(m(0.35), get(SPOT.carrels), 1)).toBeCloseTo(0.973403, 5);
  expect(pSeat(m(0.9), get(SPOT.reading), 1)).toBeCloseTo(0.310025, 5);
  // estimate shrink: 0.7 * P + 0.15
  expect(pSeat({ ratio: 0.6, confidence: "estimated" }, get(SPOT.sacLounge), 4)).toBeCloseTo(
    0.624335,
    5,
  );
  // group: r + (g - 1) / (0.7 * seats)
  // r* = 0.35 + 3 / 21 = 0.492857; 1 / (1 + e^(8 * (r* - 0.8))) = 0.921082
  expect(pSeat(m(0.35), get(SPOT.union), 4)).toBeCloseTo(0.921082, 5);
  // group larger than max_group_size
  expect(pSeat(m(0.35), get(SPOT.union), 5)).toBe(0);
});

test("P(seat) is in [0, 1] and non-increasing in r* (property)", () => {
  const rand = mulberry32(5);
  const confs: SlotConfidence[] = ["measured", "estimated", "none"];
  for (let i = 0; i < 500; i += 1) {
    const r1 = rand();
    const r2 = r1 + rand() * (1 - r1);
    const confidence = confs[i % 3] ?? "measured";
    const g = 1 + Math.floor(rand() * 4);
    const p1 = pSeat({ ratio: r1, confidence }, get(SPOT.sacLounge), g);
    const p2 = pSeat({ ratio: r2, confidence }, get(SPOT.sacLounge), g);
    expect(p1).toBeGreaterThanOrEqual(p2);
    expect(p1).toBeLessThanOrEqual(1);
    expect(p2).toBeGreaterThanOrEqual(0);
  }
});

test("exam slot: exam array when present, else regular times 1.25 capped, estimated", () => {
  expect(slotReading(busy(SPOT.union), 10, true)).toEqual({ ratio: 0.6, confidence: "measured" });
  expect(slotReading(busy(SPOT.reading), 10, true)).toEqual({
    ratio: 1,
    confidence: "estimated",
  });
  expect(slotReading(busy(SPOT.carrels), 10, true)).toEqual({
    ratio: 0.4375,
    confidence: "estimated",
  });
  expect(slotReading(busy(SPOT.hoursTbd), 10, true).confidence).toBe("none");
  expect(slotReading(busy(SPOT.carrels), 10, false)).toEqual({
    ratio: 0.35,
    confidence: "measured",
  });
});

test("words: seat thresholds and bucket midpoints", () => {
  expect(seatWord(0.7)).toBe("likely");
  expect(seatWord(0.69)).toBe("tight");
  expect(seatWord(0.4)).toBe("tight");
  expect(seatWord(0.39)).toBe("unlikely");
  expect(busyBucket(0.1)).toBe("empty");
  expect(busyBucket(0.35)).toBe("some");
  expect(busyBucket(0.6)).toBe("filling");
  expect(busyBucket(0.85)).toBe("nearly_full");
  expect(busyBucket(0.93)).toBe("full");
});

test("time value", () => {
  expect(timeValue(60, 0)).toBeCloseTo(0.95, 10);
  expect(timeValue(60, 2)).toBeCloseTo(55 / 60, 10);
  expect(timeValue(30, 40)).toBe(0);
  expect(timeValue(0, 0)).toBe(0);
});
