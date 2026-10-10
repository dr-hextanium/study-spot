import {
  type Access,
  type AccessProfile,
  accessFor,
  type Bundle,
  type BundleHours,
  type BundleSpot,
  busyBucket,
  Criterion,
  campusParts,
  type Fullness,
  isExamDate,
  matchCriterion,
  openSpan,
  resolveFrom,
  type SlotReading,
  slotIndex,
  slotReading,
  walkMinutes,
  zonedInstant,
} from "@perch/core";
import { z } from "zod";
import type { KeyValueStorage } from "../adapters.ts";
import { type CopyId, plural, t } from "../copy/index.ts";

export const ARRIVE = ["now", "1", "2", "4", "tonight"] as const;
export const Arrive = z.enum(ARRIVE);
export type Arrive = z.infer<typeof Arrive>;

export const BROWSE_PREFS_KEY = "student:browse";
/** Every filter in the sheet can be on at once, so the cap is the size of the list. */
export const BrowsePrefs = z.object({
  view: z.enum(["list", "map"]),
  arrive: Arrive,
  extra: z.array(Criterion).max(48),
  showLocked: z.boolean(),
  openOnly: z.boolean(),
});
export type BrowsePrefs = z.infer<typeof BrowsePrefs>;
export const DEFAULT_BROWSE_PREFS: BrowsePrefs = {
  view: "list",
  arrive: "now",
  extra: [],
  showLocked: false,
  openOnly: false,
};

/** The saved Browse choices; anything missing or unreadable is the defaults. */
export function readBrowsePrefs(storage: KeyValueStorage): BrowsePrefs {
  try {
    const raw = storage.getItem(BROWSE_PREFS_KEY);
    if (raw === null) return DEFAULT_BROWSE_PREFS;
    const parsed = BrowsePrefs.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to the defaults
  }
  try {
    storage.removeItem(BROWSE_PREFS_KEY);
  } catch {
    // nothing more to do
  }
  return DEFAULT_BROWSE_PREFS;
}

export function writeBrowsePrefs(storage: KeyValueStorage, prefs: BrowsePrefs): boolean {
  try {
    storage.setItem(BROWSE_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

const HOUR_MS = 3_600_000;
const NINE_PM = 21 * 60;

/** The time the student picked, which is when every row is read. "Tonight" is 9 PM, or now if that has passed. */
export function arrivalAt(now: Date, arrive: Arrive, tz: string): Date {
  if (arrive === "now") return now;
  if (arrive === "tonight") {
    const nine = zonedInstant(campusParts(now, tz).date, NINE_PM, tz);
    return nine.getTime() > now.getTime() ? nine : now;
  }
  return new Date(now.getTime() + Number(arrive) * HOUR_MS);
}

export type RowStatus = "open" | "closes_soon" | "closed" | "hours_unknown";
export type BrowseRow = {
  spot: BundleSpot;
  name: string;
  building: string;
  walkMinutes: number;
  status: RowStatus;
  sub: string;
  busy: string;
  busyLong: string;
  bucket: Fullness | "none";
  locked: boolean;
  checked: string;
};
export type BrowseView = {
  rows: BrowseRow[];
  hiddenLocked: number;
  caption: string;
  count: string;
};

// Formatting and honest busyness wording, kept private to Browse.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${tz}|${key}`;
  let f = fmtCache.get(k);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    fmtCache.set(k, f);
  }
  return f;
}
const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((p) => p.type === type)?.value ?? "";

/** "Tue 2 PM". */
function slotWhen(at: Date, tz: string): string {
  const p = fmt(tz, "when", { weekday: "short", hour: "numeric", hourCycle: "h12" }).formatToParts(
    at,
  );
  return `${part(p, "weekday")} ${part(p, "hour")} ${part(p, "dayPeriod")}`;
}
/** "2:00 AM". */
function clockText(at: Date, tz: string): string {
  const p = fmt(tz, "clock", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(at);
  return `${part(p, "hour")}:${part(p, "minute")} ${part(p, "dayPeriod")}`;
}
/** "Oct 6". */
function shortDay(iso: string, tz: string): string {
  return fmt(tz, "day", { month: "short", day: "numeric" }).format(new Date(iso));
}

const BUSY_TYPICAL = {
  empty: "student.browse.busy.typical.empty",
  some: "student.browse.busy.typical.some",
  filling: "student.browse.busy.typical.filling",
  nearly_full: "student.browse.busy.typical.nearly_full",
  full: "student.browse.busy.typical.full",
} as const satisfies Record<Fullness, CopyId>;
const BUSY_ESTIMATE = {
  empty: "student.browse.busy.estimate.empty",
  some: "student.browse.busy.estimate.some",
  filling: "student.browse.busy.estimate.filling",
  nearly_full: "student.browse.busy.estimate.nearly_full",
  full: "student.browse.busy.estimate.full",
} as const satisfies Record<Fullness, CopyId>;
const BUSY_ROW = {
  empty: "student.browse.busy.row.empty",
  some: "student.browse.busy.row.some",
  filling: "student.browse.busy.row.filling",
  nearly_full: "student.browse.busy.row.nearly_full",
  full: "student.browse.busy.row.full",
} as const satisfies Record<Fullness, CopyId>;
const BUSY_ROW_ESTIMATE = {
  empty: "student.browse.busy.row_estimate.empty",
  some: "student.browse.busy.row_estimate.some",
  filling: "student.browse.busy.row_estimate.filling",
  nearly_full: "student.browse.busy.row_estimate.nearly_full",
  full: "student.browse.busy.row_estimate.full",
} as const satisfies Record<Fullness, CopyId>;

/** The one sentence for a forecast slot: typical, estimate, or no data. Never live. */
function busyLine(reading: SlotReading, at: Date, tz: string): string {
  if (reading.confidence === "none") return t("student.browse.busy.none");
  const bucket = busyBucket(reading.ratio);
  if (reading.confidence === "estimated") return t(BUSY_ESTIMATE[bucket]);
  return t(BUSY_TYPICAL[bucket], { when: slotWhen(at, tz) });
}

function rowBusy(reading: SlotReading): string {
  if (reading.confidence === "none") return t("student.browse.busy.row_none");
  const bucket = busyBucket(reading.ratio);
  return t(reading.confidence === "estimated" ? BUSY_ROW_ESTIMATE[bucket] : BUSY_ROW[bucket]);
}

function closesText(closesAt: Date, at: Date, tz: string): string {
  const left = closesAt.getTime() - at.getTime();
  if (left >= 20 * HOUR_MS) return t("student.browse.open_all_day");
  if (left < HOUR_MS) {
    return t("student.browse.closes_in", { minutes: Math.max(0, Math.round(left / 60_000)) });
  }
  return t("student.browse.open_till", { closes: clockText(closesAt, tz) });
}

function lockText(access: Access): string | null {
  if (access.kind === "open") return null;
  if (access.kind === "unverified") return t("student.browse.lock.unverified");
  const { eligibility, scope } = access;
  if (eligibility === "grad_only") return t("student.browse.lock.grad");
  if (eligibility === "department") {
    return scope === null
      ? t("student.browse.lock.department_unknown")
      : t("student.browse.lock.department", { scope });
  }
  if (scope === null) return t("student.browse.lock.residents_unknown");
  return eligibility === "residents_quad"
    ? t("student.browse.lock.quad", { scope })
    : t("student.browse.lock.building", { scope });
}

function hoursBySpot(bundle: Bundle): Map<string, BundleHours[]> {
  const m = new Map<string, BundleHours[]>();
  for (const h of bundle.hours) {
    const list = m.get(h.spot_id);
    if (list === undefined) m.set(h.spot_id, [h]);
    else list.push(h);
  }
  return m;
}

const spotName = (spot: BundleSpot): string => spot.common_name ?? spot.official_name;

/** The newest date any group of the spot was checked, as "Checked Oct 6". */
function checkedText(spot: BundleSpot, tz: string): string {
  const newest = Object.values(spot.verified)
    .filter((v): v is string => v !== undefined)
    .sort()
    .at(-1);
  return newest === undefined ? "" : t("student.browse.checked", { date: shortDay(newest, tz) });
}

/**
 * Browse rows: every spot read at the chosen arrival time, nearest first.
 * Locked spots are marked (and hidden unless `showLocked`); busyness is the
 * forecast slot at that time, never live.
 */
export function browseView(
  bundle: Bundle,
  prefs: BrowsePrefs,
  from: string,
  access: AccessProfile,
  now: Date,
): BrowseView {
  const tz = bundle.campus.tz;
  const origin = resolveFrom(bundle, from) ?? from;
  const arrival = arrivalAt(now, prefs.arrive, tz);
  const parts = campusParts(arrival, tz);
  const slot = slotIndex(parts.slotDow, parts.hour);
  const exam = isExamDate(parts.date, bundle.term);
  const hours = hoursBySpot(bundle);
  const buildingName = new Map(bundle.buildings.map((b) => [b.id, b.name]));

  const all: BrowseRow[] = [];
  for (const spot of bundle.spots) {
    const acc = accessFor(spot, access, bundle.buildings);
    const lock = lockText(acc);
    const span = openSpan(hours.get(spot.id) ?? [], bundle.term, arrival, tz);
    let status: RowStatus;
    let statusText: string;
    if (spot.hours_unconfirmed) {
      status = "hours_unknown";
      statusText = t("student.browse.status.hours_unknown");
    } else if (!span.open) {
      status = "closed";
      statusText = t("student.browse.status.closed");
    } else {
      status = span.closesAt.getTime() - arrival.getTime() < HOUR_MS ? "closes_soon" : "open";
      statusText = closesText(span.closesAt, arrival, tz);
    }
    const busyness = bundle.busyness[spot.id];
    const reading: SlotReading =
      busyness === undefined ? { ratio: 0, confidence: "none" } : slotReading(busyness, slot, exam);
    const minutes = walkMinutes(bundle, origin, spot);
    const building = buildingName.get(spot.building_id) ?? spot.building_id;
    all.push({
      spot,
      name: spotName(spot),
      building,
      walkMinutes: minutes,
      status,
      sub: t("student.browse.row.sub", { building, minutes, status: lock ?? statusText }),
      busy: rowBusy(reading),
      busyLong: busyLine(reading, arrival, tz),
      bucket: reading.confidence === "none" ? "none" : busyBucket(reading.ratio),
      locked: acc.kind === "locked",
      checked: checkedText(spot, tz),
    });
  }

  const passes = (r: BrowseRow): boolean => {
    if (prefs.openOnly && r.status !== "open" && r.status !== "closes_soon") return false;
    return prefs.extra.every((c) => matchCriterion(r.spot, c) === "yes");
  };
  const matching = all.filter(passes);
  const hiddenLocked = prefs.showLocked ? 0 : matching.filter((r) => r.locked).length;
  const rows = matching
    .filter((r) => prefs.showLocked || !r.locked)
    .sort((a, b) => a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name));
  return {
    rows,
    hiddenLocked,
    caption: t("student.browse.caption", { when: slotWhen(arrival, tz) }),
    count: plural(rows.length, "student.browse.count_one", "student.browse.count"),
  };
}

/** Narrows a view to rows whose name or building has every typed word. */
export function searchBrowse(view: BrowseView, query: string): BrowseView {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return view;
  const rows = view.rows.filter((r) => {
    const hay = `${r.name} ${r.building}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return {
    ...view,
    rows,
    count: plural(rows.length, "student.browse.count_one", "student.browse.count"),
  };
}

/** The "hidden for access" note, or null when none are hidden. */
export function hiddenLockedText(count: number): string | null {
  return count === 0
    ? null
    : plural(count, "student.browse.hidden_locked_one", "student.browse.hidden_locked");
}

/** How old the bundle is, in words, and a note when it is old enough to matter. */
export function browseDataAge(
  ageDays: number,
  checkFailed: boolean,
): { line: string; prominent: string | null; offline: string | null } {
  const line =
    ageDays <= 0
      ? t("student.browse.data.today")
      : ageDays === 1
        ? t("student.browse.data.yesterday")
        : t("student.browse.data.days", { days: ageDays });
  return {
    line,
    prominent: ageDays > 3 ? t("student.browse.data.old", { days: ageDays }) : null,
    offline: checkFailed ? t("student.browse.data.offline") : null,
  };
}
