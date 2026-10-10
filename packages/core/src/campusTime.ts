import type { BundleTerm } from "./bundle.ts";

/** One instant read in the campus time zone. */
export type CampusParts = {
  /** Campus calendar date, YYYY-MM-DD. */
  date: string;
  hour: number;
  minute: number;
  /** 0 = Monday ... 6 = Sunday: busyness slots (slots.ts). */
  slotDow: number;
  /** 0 = Sunday ... 6 = Saturday: BundleHours.day_of_week. */
  hoursDow: number;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const formats = new Map<string, Intl.DateTimeFormat>();

function formatFor(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz);
  if (f === undefined) {
    // hourCycle h23: hour12:false can print "24" at midnight in some engines.
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(tz, f);
  }
  return f;
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function wallOf(ms: number, tz: string): Wall {
  const parts = formatFor(tz).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    if (p === undefined) throw new Error(`Intl returned no ${type}`);
    return Number(p.value);
  };
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour") % 24,
    mi: get("minute"),
    s: get("second"),
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Day of week of a calendar date: 0 = Sunday. */
export function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function campusParts(at: Date, tz: string): CampusParts {
  const w = wallOf(at.getTime(), tz);
  const date = `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
  const hoursDow = weekdayOfDate(date);
  return { date, hour: w.h, minute: w.mi, hoursDow, slotDow: (hoursDow + 6) % 7 };
}

/** Wall clock minus UTC at an instant, in ms. */
function offsetMs(ms: number, tz: string): number {
  const w = wallOf(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of a campus wall-clock time. `minutes` runs 0 to 1440 (1440 is
 * the end of the day). In the repeated fall-back hour this returns the earlier
 * instant; a time skipped by spring-forward moves forward by the gap.
 */
export function zonedInstant(date: string, minutes: number, tz: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`bad date ${date}`);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new RangeError(`minutes out of range: ${minutes}`);
  }
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE_MS;
  const o1 = offsetMs(wall, tz);
  const t1 = wall - o1;
  const o2 = offsetMs(t1, tz);
  if (o1 === o2) return new Date(t1);
  const t2 = wall - o2;
  if (offsetMs(t2, tz) === o2) return new Date(t2);
  return new Date(t1);
}

export function isExamDate(date: string, term: BundleTerm): boolean {
  if (term.exam_starts === null || term.exam_ends === null) return false;
  return date >= term.exam_starts && date <= term.exam_ends;
}

export const MAX_CLOCK_DRIFT_MS = 5 * MINUTE_MS;

/**
 * Server minus device time from a network response's Date header, or 0 when
 * the header is missing, unreadable, or within 5 minutes. Never pass a cached
 * response's Date.
 */
export function clockSkewMs(deviceAtResponse: Date, serverDate: string | null): number {
  if (serverDate === null) return 0;
  const server = Date.parse(serverDate);
  if (Number.isNaN(server)) return 0;
  const skew = server - deviceAtResponse.getTime();
  return Math.abs(skew) > MAX_CLOCK_DRIFT_MS ? skew : 0;
}

export function correctedNow(device: Date, skewMs: number): Date {
  return new Date(device.getTime() + skewMs);
}
