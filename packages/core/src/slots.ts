import type { DayType, TimeBlock } from "./enums.ts";

export const DAYS = 7;
export const HOURS = 24;
export const SLOTS = DAYS * HOURS;

/** Day of week: 0 = Monday ... 6 = Sunday, campus local time. */
export function slotIndex(dow: number, hour: number): number {
  if (!Number.isInteger(dow) || dow < 0 || dow >= DAYS) {
    throw new RangeError(`day_of_week out of range: ${dow}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour >= HOURS) {
    throw new RangeError(`hour out of range: ${hour}`);
  }
  return dow * HOURS + hour;
}

export function dayTypeOf(dow: number): DayType {
  return dow >= 5 ? "weekend" : "weekday";
}

export function blockOfHour(hour: number): TimeBlock {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
