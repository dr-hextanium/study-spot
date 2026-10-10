import type { BundleHours, BundleTerm } from "../bundle.ts";
import { addDays, campusParts, isExamDate, weekdayOfDate, zonedInstant } from "../campusTime.ts";

export type OpenSpan = { open: false } | { open: true; closesAt: Date };

/** "HH:MM" to minutes; "24:00" is 1440. */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

type Span = { start: number; end: number; lastEntry: number | null };

/**
 * The rows that apply on a campus date. In the exam window a weekday uses its
 * exam rows when it has any, and otherwise falls back to its regular rows.
 */
function rowsOn(rows: readonly BundleHours[], date: string, term: BundleTerm): BundleHours[] {
  const dow = weekdayOfDate(date); // hours use 0 = Sunday
  if (isExamDate(date, term)) {
    const exam = rows.filter((r) => r.is_exam && r.day_of_week === dow);
    if (exam.length > 0) return exam;
  }
  return rows.filter((r) => !r.is_exam && r.day_of_week === dow);
}

function spansOn(rows: readonly BundleHours[], date: string, tz: string): Span[] {
  return rows.map((r) => {
    const o = minutesOf(r.opens);
    const c = minutesOf(r.closes);
    // A close at or before the open is on the next day.
    const end = zonedInstant(c <= o ? addDays(date, 1) : date, c, tz).getTime();
    let lastEntry: number | null = null;
    if (r.last_entry !== null) {
      const le = minutesOf(r.last_entry);
      lastEntry = zonedInstant(le < o ? addDays(date, 1) : date, le, tz).getTime();
    }
    return { start: zonedInstant(date, o, tz).getTime(), end, lastEntry };
  });
}

/**
 * Whether a spot is open at an instant, and when that stretch ends. Checks
 * the previous day's rows (past-midnight closes) and chains touching spans
 * (24-hour days) up to two days ahead.
 */
export function openSpan(
  rows: readonly BundleHours[],
  term: BundleTerm,
  at: Date,
  tz: string,
): OpenSpan {
  const today = campusParts(at, tz).date;
  const spans: Span[] = [];
  for (const offset of [-1, 0, 1, 2]) {
    const date = addDays(today, offset);
    spans.push(...spansOn(rowsOn(rows, date, term), date, tz));
  }
  spans.sort((a, b) => a.start - b.start);
  const t = at.getTime();
  const current = spans.find(
    (s) => s.start <= t && t < s.end && (s.lastEntry === null || t <= s.lastEntry),
  );
  if (current === undefined) return { open: false };
  let end = current.end;
  for (const s of spans) if (s.start <= end && s.end > end) end = s.end;
  return { open: true, closesAt: new Date(end) };
}
