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
  if (first.opens === ALL_DAY_OPENS && first.closes === ALL_DAY_CLOSES) {
    return { hours: { kind: "all_day" }, extra };
  }
  // A time input cannot show 24:00; midnight at the end of the day is 00:00 there.
  const closes = first.closes === ALL_DAY_CLOSES ? "00:00" : first.closes;
  return {
    hours: { kind: "open", opens: first.opens, closes, lastEntry: first.last_entry },
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

/** Copies Monday's hours to Tuesday through Friday. */
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

/** Closing before opening means after midnight, shown as "2:00 next day". */
export function closesNextDay(hours: DayHours): boolean {
  return hours.kind === "open" && hours.closes !== "" && hours.closes < hours.opens;
}

/** A time input never yields 24:00; midnight at the end of the day is entered as 00:00. */
export const DEFAULT_OPEN: DayHours = {
  kind: "open",
  opens: "08:00",
  closes: "22:00",
  lastEntry: null,
};
