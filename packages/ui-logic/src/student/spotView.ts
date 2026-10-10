import {
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  type Bundle,
  type BundleHours,
  type BundleSpot,
  campusParts,
  isExamDate,
  type SlotConfidence,
  slotIndex,
  slotReading,
  zonedInstant,
} from "@perch/core";
import { type PlainCopyId, t } from "../copy/index.ts";
import { dayShortName, hourText, shortDay, timeOfDayText, weekdayLong } from "./format.ts";
import { busyLine, checkedText } from "./present.ts";

export type Bar = {
  hour: number;
  ratio: number;
  confidence: SlotConfidence;
  current: boolean;
  label: string;
};
export type ForecastView =
  | { kind: "bars"; bars: Bar[]; caption: string; exam: boolean; nowLine: string }
  | { kind: "none"; caption: string };

/** The 24 hours of today's forecast. Never live: the caption says typical and not live. */
export function dayForecast(bundle: Bundle, spotId: string, now: Date): ForecastView {
  const tz = bundle.campus.tz;
  const p = campusParts(now, tz);
  const exam = isExamDate(p.date, bundle.term);
  const b = bundle.busyness[spotId];
  if (b === undefined) return { kind: "none", caption: t("student.spot.no_data") };
  const bars: Bar[] = Array.from({ length: 24 }, (_, hour) => {
    const r = slotReading(b, slotIndex(p.slotDow, hour), exam);
    return {
      hour,
      ratio: r.ratio,
      confidence: r.confidence,
      current: hour === p.hour,
      label: hourText(zonedInstant(p.date, hour * 60, tz), tz),
    };
  });
  if (bars.every((x) => x.confidence === "none")) {
    return { kind: "none", caption: t("student.spot.no_data") };
  }
  const weekday = weekdayLong(now, tz);
  return {
    kind: "bars",
    bars,
    exam,
    caption: exam
      ? t("student.spot.busy_caption_exam", { weekday })
      : t("student.spot.busy_caption", { weekday }),
    nowLine: busyLine(slotReading(b, slotIndex(p.slotDow, p.hour), exam), now, tz),
  };
}

export type HoursDay = { dow: number; name: string; text: string; today: boolean };
export type WeekHoursView = { heading: string; unconfirmed: boolean; days: HoursDay[] };
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

function rowText(r: BundleHours): string {
  if (r.opens === "00:00" && r.closes === "24:00" && r.last_entry === null) {
    return t("student.spot.open_all_day");
  }
  const opens = timeOfDayText(r.opens);
  const closes = timeOfDayText(r.closes);
  return r.last_entry === null
    ? t("student.spot.hours_span", { opens, closes })
    : t("student.spot.hours_span_entry", { opens, closes, entry: timeOfDayText(r.last_entry) });
}

export function weekHours(bundle: Bundle, spot: BundleSpot, now: Date): WeekHoursView {
  const p = campusParts(now, bundle.campus.tz);
  const own = bundle.hours.filter((h) => h.spot_id === spot.id);
  const exam = isExamDate(p.date, bundle.term) && own.some((h) => h.is_exam);
  const rows = own.filter((h) => h.is_exam === exam);
  return {
    heading: t(exam ? "student.spot.hours_exam_heading" : "student.spot.hours_heading"),
    unconfirmed: spot.hours_unconfirmed,
    days: MONDAY_FIRST.map((dow) => {
      const list = rows
        .filter((r) => r.day_of_week === dow)
        .sort((a, b) => a.opens.localeCompare(b.opens));
      return {
        dow,
        name: dayShortName(dow),
        text: list.length === 0 ? t("student.spot.closed_day") : list.map(rowText).join(", "),
        today: dow === p.hoursDow,
      };
    }),
  };
}

const GROUP_NAME = {
  identity: "student.group.identity",
  access: "student.group.access",
  hours: "student.group.hours",
  seating: "student.group.seating",
  power: "student.group.power",
  environment: "student.group.environment",
  use_fit: "student.group.use_fit",
  amenities: "student.group.amenities",
  accessibility: "student.group.accessibility",
  late_night: "student.group.late_night",
} as const satisfies Record<AttributeGroup, PlainCopyId>;

export type CheckedView = {
  latest: string;
  groups: { group: AttributeGroup; name: string; date: string }[];
};

/** Every spot shows a last-verified date: the newest one, then each group's own. */
export function checkedView(spot: BundleSpot, tz: string): CheckedView {
  const groups: CheckedView["groups"] = [];
  for (const group of ATTRIBUTE_GROUP) {
    const iso = spot.verified[group];
    if (iso === undefined) continue;
    groups.push({ group, name: t(GROUP_NAME[group]), date: shortDay(iso, tz) });
  }
  return { latest: checkedText(spot, tz), groups };
}
