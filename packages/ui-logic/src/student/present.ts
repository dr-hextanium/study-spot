import {
  type Access,
  type BoolAttr,
  type Bundle,
  type BundleSpot,
  busyBucket,
  type Candidate,
  type Criterion,
  type Fullness,
  type SeatWord,
  type SlotReading,
} from "@perch/core";
import { type CopyId, type PlainCopyId, t } from "../copy/index.ts";
import { clockText, shortDay, slotWhen } from "./format.ts";

const TYPICAL = {
  empty: "student.busy.typical.empty",
  some: "student.busy.typical.some",
  filling: "student.busy.typical.filling",
  nearly_full: "student.busy.typical.nearly_full",
  full: "student.busy.typical.full",
} as const satisfies Record<Fullness, CopyId>;
const ESTIMATE = {
  empty: "student.busy.estimate.empty",
  some: "student.busy.estimate.some",
  filling: "student.busy.estimate.filling",
  nearly_full: "student.busy.estimate.nearly_full",
  full: "student.busy.estimate.full",
} as const satisfies Record<Fullness, CopyId>;
const ROW = {
  empty: "student.busy.row.empty",
  some: "student.busy.row.some",
  filling: "student.busy.row.filling",
  nearly_full: "student.busy.row.nearly_full",
  full: "student.busy.row.full",
} as const satisfies Record<Fullness, CopyId>;
const ROW_EST = {
  empty: "student.busy.row_estimate.empty",
  some: "student.busy.row_estimate.some",
  filling: "student.busy.row_estimate.filling",
  nearly_full: "student.busy.row_estimate.nearly_full",
  full: "student.busy.row_estimate.full",
} as const satisfies Record<Fullness, CopyId>;
const SEAT = {
  likely: "student.seat.likely",
  tight: "student.seat.tight",
  unlikely: "student.seat.unlikely",
} as const satisfies Record<SeatWord, CopyId>;

/** The one sentence for a forecast slot. Never says live: typical, estimate, or no data. */
export function busyLine(reading: SlotReading, at: Date, tz: string): string {
  if (reading.confidence === "none") return t("student.busy.none");
  const bucket = busyBucket(reading.ratio);
  if (reading.confidence === "estimated") return t(ESTIMATE[bucket]);
  return t(TYPICAL[bucket], { when: slotWhen(at, tz) });
}

/** Short form for list rows; the list caption says "typical ..., not live". */
export function rowBusy(reading: SlotReading): string {
  if (reading.confidence === "none") return t("student.busy.row_none");
  const bucket = busyBucket(reading.ratio);
  return t(reading.confidence === "estimated" ? ROW_EST[bucket] : ROW[bucket]);
}

export const seatText = (seat: SeatWord): string => t(SEAT[seat]);

export function walkText(minutes: number): string {
  return minutes === 0 ? t("student.pick.walk_here") : t("student.pick.walk", { minutes });
}

const HOUR_MS = 3_600_000;

export function closesText(closesAt: Date, now: Date, tz: string): string {
  const left = closesAt.getTime() - now.getTime();
  if (left >= 20 * HOUR_MS) return t("student.pick.open_all_day");
  if (left < HOUR_MS) {
    return t("student.pick.closes_in", { minutes: Math.max(0, Math.round(left / 60_000)) });
  }
  return t("student.pick.open_till", { closes: clockText(closesAt, tz) });
}

const FLAG_REASON: Partial<Record<BoolAttr, PlainCopyId>> = {
  whiteboard: "student.reason.whiteboard",
  open_past_midnight: "student.reason.open_late",
  staffed_late: "student.reason.staffed_late",
  lit_route_to_residences: "student.reason.lit_route",
  group_work_ok: "student.reason.group_ok",
  natural_light: "student.reason.natural_light",
  step_free: "student.reason.step_free",
  elevator: "student.reason.elevator",
};

/** Plain words for a matched criterion, or null when it has no short name. */
export function reasonText(c: Criterion): string | null {
  switch (c.attr) {
    case "noise_policy":
      if (c.target.length === 1 && c.target[0] === "silent") return t("student.reason.silent");
      if (c.target.every((x) => x === "silent" || x === "quiet")) return t("student.reason.quiet");
      return t("student.reason.talking");
    case "outlet_coverage_pct":
      return t("student.reason.outlets");
    case "seat_type":
      return c.target === "carrel" ? t("student.reason.carrels") : null;
    case "table_config":
      return c.target === "small_2_4" ? t("student.reason.small_tables") : null;
    case "calls_ok":
      return t("student.reason.calls");
    case "cell_signal":
      return t("student.reason.signal");
    case "food_policy":
      return c.target.includes("covered_drinks")
        ? t("student.reason.drinks_ok")
        : t("student.reason.food_ok");
    case "seat_count":
      return t("student.reason.big_room");
    case "amenity":
      if (c.target === "late_food") return t("student.reason.late_food");
      if (c.target === "printer") return t("student.reason.printer");
      if (c.target === "coffee_food") return t("student.reason.coffee");
      return null;
    case "flag": {
      if (!c.target) return null;
      const id = FLAG_REASON[c.flag];
      return id === undefined ? null : t(id);
    }
    default:
      return null;
  }
}

export const spotName = (spot: BundleSpot): string => spot.common_name ?? spot.official_name;

export function placeText(spot: BundleSpot, bundle: Bundle): string {
  const building =
    bundle.buildings.find((b) => b.id === spot.building_id)?.name ?? spot.building_id;
  return t("student.pick.place", { building, floor: spot.floor });
}

/** "Checked Oct 6": the newest verified date of any group, or null when there is none. */
export function checkedText(spot: Pick<BundleSpot, "verified">, tz: string): string | null {
  const dates = Object.values(spot.verified).filter((d): d is string => typeof d === "string");
  const newest = dates.sort().at(-1);
  return newest === undefined ? null : t("student.pick.checked", { date: shortDay(newest, tz) });
}

export function lockText(access: Access): string | null {
  if (access.kind === "open") return null;
  if (access.kind === "unverified") return t("student.lock.unverified");
  const { eligibility, scope } = access;
  if (eligibility === "grad_only") return t("student.lock.grad");
  if (eligibility === "department") {
    return scope === null
      ? t("student.lock.department_unknown")
      : t("student.lock.department", { scope });
  }
  if (scope === null) return t("student.lock.residents_unknown");
  return eligibility === "residents_quad"
    ? t("student.lock.quad", { scope })
    : t("student.lock.building", { scope });
}

export type PickCardView = {
  id: string;
  slug: string;
  name: string;
  place: string;
  walk: string;
  busy: string;
  seat: string;
  closes: string;
  reasons: string[];
  /** "Checked Oct 6": every spot shows its last-verified date. */
  checked: string | null;
};

export function pickCardView(c: Candidate, bundle: Bundle, now: Date): PickCardView {
  const tz = bundle.campus.tz;
  return {
    id: c.spot.id,
    slug: c.spot.slug,
    name: spotName(c.spot),
    place: placeText(c.spot, bundle),
    walk: walkText(c.walkMinutes),
    busy: busyLine(c.reading, c.arrival, tz),
    seat: seatText(c.seat),
    closes: closesText(c.closesAt, now, tz),
    reasons: c.reasons.map(reasonText).filter((x): x is string => x !== null),
    checked: checkedText(c.spot, tz),
  };
}

export type DataAgeView = { line: string; prominent: string | null; offline: boolean };

export function dataAgeView(ageDays: number, checkFailed: boolean): DataAgeView {
  const line =
    ageDays === 0
      ? t("student.data.today")
      : ageDays === 1
        ? t("student.data.yesterday")
        : t("student.data.days", { days: ageDays });
  return {
    line,
    prominent: ageDays > 3 ? t("student.data.old", { days: ageDays }) : null,
    offline: checkFailed,
  };
}
