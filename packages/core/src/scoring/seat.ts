import type { BundleBusyness, BundleSpot } from "../bundle.ts";
import type { Fullness, SlotConfidence } from "../enums.ts";

export const SEAT_A = 8;
export const SEAT_B = 0.8;
export const UNCERTAIN_SCALE = 0.7;
export const UNCERTAIN_SHIFT = 0.15;
export const EXAM_FALLBACK_FACTOR = 1.25;
export const OVERHEAD_MINUTES = 3;
const CAPACITY_SHARE = 0.7;

export type SlotReading = { ratio: number; confidence: SlotConfidence };

/** The forecast for one slot, with the exam fallback when the bundle has no exam profile. */
export function slotReading(b: BundleBusyness, slot: number, exam: boolean): SlotReading {
  const regular = b.regular[slot];
  const confidence = b.confidence[slot];
  if (regular === undefined || confidence === undefined) throw new RangeError(`slot ${slot}`);
  if (!exam) return { ratio: regular, confidence };
  const e = b.exam?.[slot];
  if (e !== undefined) return { ratio: e, confidence };
  return {
    ratio: Math.min(1, regular * EXAM_FALLBACK_FACTOR),
    confidence: confidence === "none" ? "none" : "estimated",
  };
}

export function effectiveCapacity(spot: BundleSpot): number {
  return spot.effective_capacity ?? CAPACITY_SHARE * spot.seat_count;
}

/** Chance the right kind of seat is free at arrival. 0 when the group cannot fit. */
export function pSeat(reading: SlotReading, spot: BundleSpot, group: number): number {
  if (spot.max_group_size !== null && group > spot.max_group_size) return 0;
  const r = reading.ratio + (group - 1) / effectiveCapacity(spot);
  const p = 1 / (1 + Math.exp(SEAT_A * (r - SEAT_B)));
  return reading.confidence === "measured" ? p : UNCERTAIN_SCALE * p + UNCERTAIN_SHIFT;
}

export type SeatWord = "likely" | "tight" | "unlikely";
export function seatWord(p: number): SeatWord {
  if (p >= 0.7) return "likely";
  if (p >= 0.4) return "tight";
  return "unlikely";
}

/** Display bucket: midpoints between the fullness ratios (0.1, 0.35, 0.6, 0.85, 1). */
export function busyBucket(ratio: number): Fullness {
  if (ratio < 0.225) return "empty";
  if (ratio < 0.475) return "some";
  if (ratio < 0.725) return "filling";
  if (ratio < 0.925) return "nearly_full";
  return "full";
}

/** Share of the time window left for studying after the walk and settling in. */
export function timeValue(availableMinutes: number, walkMinutes: number): number {
  if (availableMinutes <= 0) return 0;
  return Math.min(
    1,
    Math.max(0, availableMinutes - walkMinutes - OVERHEAD_MINUTES) / availableMinutes,
  );
}
