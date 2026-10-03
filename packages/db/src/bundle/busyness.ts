import {
  type BundleBusyness,
  blockOfHour,
  dayTypeOf,
  FULLNESS_RATIO,
  SLOTS,
  type SlotConfidence,
  slotIndex,
} from "@study-spot/core";
import type { forecast, spot_estimate } from "../schema/index.ts";

export type ForecastRow = typeof forecast.$inferSelect;
export type EstimateRow = typeof spot_estimate.$inferSelect;

/**
 * Ratio used for slots with no measurement and no estimate. The scoring plan
 * replaces this with the fitted campus profile.
 */
export const NO_DATA_RATIO = 0.35;

/** Busyness for one spot. Forecast rows beat surveyor estimates, which beat no data. */
export function assembleBusyness(
  forecasts: ForecastRow[],
  estimates: EstimateRow[],
): BundleBusyness {
  const latest = new Map<string, EstimateRow>();
  for (const e of estimates) {
    const key = `${e.day_type}|${e.block}`;
    const prev = latest.get(key);
    if (!prev || e.created_at > prev.created_at) latest.set(key, e);
  }

  const regular: number[] = new Array<number>(SLOTS);
  const confidence: SlotConfidence[] = new Array<SlotConfidence>(SLOTS);
  const measured = new Map<number, number>();
  const exam = new Map<number, number>();
  for (const f of forecasts) {
    const target = f.profile === "regular" ? measured : exam;
    target.set(slotIndex(f.day_of_week, f.hour), f.ratio);
  }

  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const i = slotIndex(dow, hour);
      const m = measured.get(i);
      if (m !== undefined) {
        regular[i] = m;
        confidence[i] = "measured";
        continue;
      }
      const est = latest.get(`${dayTypeOf(dow)}|${blockOfHour(hour)}`);
      if (est) {
        regular[i] = FULLNESS_RATIO[est.bucket];
        confidence[i] = "estimated";
        continue;
      }
      regular[i] = NO_DATA_RATIO;
      confidence[i] = "none";
    }
  }

  const examArray = exam.size === 0 ? null : regular.map((r, i) => exam.get(i) ?? r);
  return { regular, exam: examArray, confidence };
}
