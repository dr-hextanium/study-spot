import {
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
import { plural, t } from "../copy/index.ts";
import { slotWhen } from "./format.ts";
import { busyLine, checkedText, closesText, lockText, rowBusy, spotName } from "./present.ts";

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
  /** "Checked Oct 6": every spot has one. */
  checked: string;
};
export type BrowseView = {
  rows: BrowseRow[];
  hiddenLocked: number;
  caption: string;
  count: string;
};

function hoursBySpot(bundle: Bundle): Map<string, BundleHours[]> {
  const m = new Map<string, BundleHours[]>();
  for (const h of bundle.hours) {
    const list = m.get(h.spot_id);
    if (list === undefined) m.set(h.spot_id, [h]);
    else list.push(h);
  }
  return m;
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
