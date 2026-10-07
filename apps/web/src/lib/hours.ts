import type { HoursRow } from "@study-spot/core";

/** Monday first, as the hours editor lists days; values are day_of_week (0 is Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export type DayOfWeek = (typeof WEEK_ORDER)[number];

export type DayHours =
  | { kind: "closed" }
  | { kind: "all_day" }
  | { kind: "open"; opens: string; closes: string; lastEntry: string | null };

/** One day of the editor. `extra` keeps further blocks the editor does not show, saved unchanged. */
export type DayModel = { day: DayOfWeek; hours: DayHours; extra: HoursRow[] };

const ALL_DAY_OPENS = "00:00";
const ALL_DAY_CLOSES = "24:00";

function toDay(rows: readonly HoursRow[]): Pick<DayModel, "hours" | "extra"> {
  const sorted = [...rows].sort((a, b) => a.opens.localeCompare(b.opens));
  const [first, ...extra] = sorted;
  if (first === undefined) return { hours: { kind: "closed" }, extra: [] };
  if (
    first.opens === ALL_DAY_OPENS &&
    first.closes === ALL_DAY_CLOSES &&
    first.last_entry === null
  ) {
    return { hours: { kind: "all_day" }, extra };
  }
  // A stored 24:00 close stays 24:00, so an unchanged edit writes the same rows back.
  return {
    hours: { kind: "open", opens: first.opens, closes: first.closes, lastEntry: first.last_entry },
    extra,
  };
}

/** The week for regular hours (isExam false) or finals hours (true). */
export function toWeek(rows: readonly HoursRow[], isExam: boolean): DayModel[] {
  return WEEK_ORDER.map((day) => ({
    day,
    ...toDay(rows.filter((r) => r.day_of_week === day && r.is_exam === isExam)),
  }));
}

export function fromWeek(week: readonly DayModel[], isExam: boolean): HoursRow[] {
  return week.flatMap((d): HoursRow[] => {
    const h = d.hours;
    if (h.kind === "closed") return d.extra;
    const block =
      h.kind === "all_day"
        ? { opens: ALL_DAY_OPENS, closes: ALL_DAY_CLOSES, last_entry: null }
        : { opens: h.opens, closes: h.closes, last_entry: h.lastEntry };
    return [{ day_of_week: d.day, ...block, is_exam: isExam }, ...d.extra];
  });
}

/**
 * Copies Monday's hours to Tuesday through Friday. Only `hours` is copied; each
 * target day keeps its own `extra` blocks.
 */
export function copyMonday(week: readonly DayModel[]): DayModel[] {
  const monday = week.find((d) => d.day === 1);
  if (monday === undefined) return [...week];
  return week.map((d) => (d.day >= 2 && d.day <= 5 ? { ...d, hours: monday.hours } : d));
}

export type DayProblem = "same_time" | "missing_time" | null;

export function dayProblem(hours: DayHours): DayProblem {
  if (hours.kind !== "open") return null;
  if (hours.opens === "" || hours.closes === "") return "missing_time";
  return hours.opens === hours.closes ? "same_time" : null;
}

/** Closing before opening means after midnight, shown as "2:00 next day". A stored 24:00 is midnight too. */
export function closesNextDay(hours: DayHours): boolean {
  if (hours.kind !== "open" || hours.closes === "") return false;
  return hours.closes === ALL_DAY_CLOSES || hours.closes < hours.opens;
}

/** A new day's starting hours. A time input yields 00:00, never 24:00, for midnight. */
export const DEFAULT_OPEN: DayHours = {
  kind: "open",
  opens: "08:00",
  closes: "22:00",
  lastEntry: null,
};

/**
 * What a time input can show: it only accepts up to 23:59, so a stored close of
 * 24:00 reads as 00:00 (midnight). The stored value is untouched until edited.
 */
export function timeInputValue(time: string): string {
  return time === ALL_DAY_CLOSES ? ALL_DAY_OPENS : time;
}
