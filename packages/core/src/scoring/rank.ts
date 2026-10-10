import { z } from "zod";
import type { Bundle, BundleHours, BundleSpot } from "../bundle.ts";
import { campusParts, isExamDate } from "../campusTime.ts";
import { slotIndex } from "../slots.ts";
import { type AccessProfile, accessFor, scopeKey } from "./access.ts";
import { type Criterion, fit, matchCriterion, topReasons } from "./criteria.ts";
import { openSpan } from "./hours.ts";
import type { Preset } from "./presets.ts";
import {
  pSeat,
  type SeatWord,
  type SlotReading,
  seatWord,
  slotReading,
  timeValue,
} from "./seat.ts";
import { walkMinutes } from "./walk.ts";

export const TIME_CHOICE = ["30", "60", "120", "close"] as const;
export const TimeChoice = z.enum(TIME_CHOICE);
export type TimeChoice = z.infer<typeof TimeChoice>;
export const MIN_USEFUL_MINUTES = 30;
export const TILL_CLOSE_CAP_MINUTES = 480;
export const DEFAULT_FROM = "melville-library";
export const MAX_GROUP = 12;
const MINUTE_MS = 60_000;

export type PickInput = {
  bundle: Bundle;
  now: Date;
  from: string;
  time: TimeChoice;
  preset: Preset;
  extra: readonly Criterion[];
  group: number;
  access: AccessProfile;
};

export const EXCLUSION = [
  "locked",
  "unverified",
  "hours_unconfirmed",
  "closed",
  "closing_soon",
  "required",
  "group_too_big",
  "too_far",
] as const;
export type Exclusion = (typeof EXCLUSION)[number];

export type Candidate = {
  kind: "candidate";
  spot: BundleSpot;
  walkMinutes: number;
  arrival: Date;
  closesAt: Date;
  /** T: the time window in minutes (per spot for Till close). */
  available: number;
  reading: SlotReading;
  pSeat: number;
  seat: SeatWord;
  fit: number;
  timeValue: number;
  score: number;
  reasons: Criterion[];
};
export type Excluded = {
  kind: "excluded";
  spot: BundleSpot;
  reason: Exclusion;
  walkMinutes: number | null;
};
export type RankResult = {
  ranked: Candidate[];
  excluded: Excluded[];
  /** The building walks were measured from, or null when the bundle has no buildings. */
  from: string | null;
  /** True when the asked-for building is not in the bundle and `from` replaced it. */
  fromFallback: boolean;
};

/** A building the bundle knows: the saved one, else Melville Library, else the first by name. */
export function resolveFrom(bundle: Bundle, from: string | null): string | null {
  if (from !== null && bundle.buildings.some((b) => b.id === from)) return from;
  if (bundle.buildings.some((b) => b.id === DEFAULT_FROM)) return DEFAULT_FROM;
  const first = [...bundle.buildings].sort((a, b) => a.name.localeCompare(b.name))[0];
  return first?.id ?? null;
}

type Mode = { applyPreset: boolean };

function hoursBySpot(bundle: Bundle): Map<string, BundleHours[]> {
  const m = new Map<string, BundleHours[]>();
  for (const h of bundle.hours) {
    const list = m.get(h.spot_id);
    if (list === undefined) m.set(h.spot_id, [h]);
    else list.push(h);
  }
  return m;
}

function evaluate(
  spot: BundleSpot,
  input: PickInput,
  hours: readonly BundleHours[],
  mode: Mode,
): Candidate | Excluded {
  const out = (reason: Exclusion, walk: number | null): Excluded => ({
    kind: "excluded",
    spot,
    reason,
    walkMinutes: walk,
  });
  const { bundle } = input;
  const access = accessFor(spot, input.access, bundle.buildings);
  if (access.kind === "locked") return out("locked", null);
  if (access.kind === "unverified") return out("unverified", null);
  if (spot.hours_unconfirmed) return out("hours_unconfirmed", null);

  const walk = walkMinutes(bundle, input.from, spot);
  const arrival = new Date(input.now.getTime() + walk * MINUTE_MS);
  const tz = bundle.campus.tz;
  const span = openSpan(hours, bundle.term, arrival, tz);
  if (!span.open) return out("closed", walk);
  const available =
    input.time === "close"
      ? Math.min(
          TILL_CLOSE_CAP_MINUTES,
          (span.closesAt.getTime() - input.now.getTime()) / MINUTE_MS,
        )
      : Number(input.time);
  const openAfterArrival = (span.closesAt.getTime() - arrival.getTime()) / MINUTE_MS;
  // Till close has no fixed window to compare with, so it needs the full useful minimum
  // after arrival; otherwise a zero walk would let a spot closing in 15 minutes through.
  const needed =
    input.time === "close" ? MIN_USEFUL_MINUTES : Math.min(available, MIN_USEFUL_MINUTES);
  if (openAfterArrival < needed) return out("closing_soon", walk);

  if (mode.applyPreset) {
    for (const c of [...input.preset.required, ...input.extra]) {
      if (matchCriterion(spot, c) !== "yes") return out("required", walk);
    }
  }

  const busyness = bundle.busyness[spot.id];
  // Bundle.superRefine guarantees an entry for every spot.
  if (busyness === undefined) throw new Error(`no busyness for ${spot.slug}`);
  const parts = campusParts(arrival, tz);
  const reading = slotReading(
    busyness,
    // Busyness slots count from Monday (slotDow), unlike opening hours.
    slotIndex(parts.slotDow, parts.hour),
    isExamDate(parts.date, bundle.term),
  );
  // Quick pick sizes the group only for group presets. Surprise me ignores the preset
  // entirely, so it always uses the Home group size (1 when none is set).
  const group = mode.applyPreset && input.preset.groupDefault === null ? 1 : input.group;
  if (spot.max_group_size !== null && group > spot.max_group_size) {
    return out("group_too_big", walk);
  }
  const p = pSeat(reading, spot, group);
  const tv = timeValue(available, walk);
  if (tv === 0) return out("too_far", walk);
  const f = mode.applyPreset ? fit(spot, input.preset.soft) : 1;
  return {
    kind: "candidate",
    spot,
    walkMinutes: walk,
    arrival,
    closesAt: span.closesAt,
    available,
    reading,
    pSeat: p,
    seat: seatWord(p),
    fit: f,
    timeValue: tv,
    score: f * p * tv,
    reasons: mode.applyPreset ? topReasons(spot, input.preset.soft) : [],
  };
}

function run(rawInput: PickInput, mode: Mode): RankResult {
  // An unknown building must not read as a zero-minute walk: use the default and say so.
  const from = resolveFrom(rawInput.bundle, rawInput.from);
  const fromFallback = from !== rawInput.from;
  if (from === null) return { ranked: [], excluded: [], from: null, fromFallback };
  const input = { ...rawInput, from };
  const hours = hoursBySpot(input.bundle);
  const ranked: Candidate[] = [];
  const excluded: Excluded[] = [];
  for (const spot of input.bundle.spots) {
    const r = evaluate(spot, input, hours.get(spot.id) ?? [], mode);
    if (r.kind === "candidate") ranked.push(r);
    else excluded.push(r);
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score || a.walkMinutes - b.walkMinutes || a.spot.slug.localeCompare(b.spot.slug),
  );
  return { ranked, excluded, from, fromFallback };
}

/** Quick pick: hard filters, the preset's required and extra filters, then fit * P(seat) * time value. */
export function rankSpots(input: PickInput): RankResult {
  return run(input, { applyPreset: true });
}

/** Surprise me: every hard rule, but no preset or extra filters, and fit 1. */
export function surpriseRank(input: PickInput): RankResult {
  return run(input, { applyPreset: false });
}

/**
 * One change that turns an empty pick into a pick. Each one is checked by ranking again with
 * it applied, so Home never offers a way out that leads nowhere. `access` carries a profile
 * that would do it; Home only sends the student to Me, since access is theirs to declare.
 */
export type Loosen =
  | { kind: "group"; group: number }
  | { kind: "time"; time: TimeChoice }
  | { kind: "from"; from: string }
  | { kind: "preset" }
  | { kind: "access"; access: AccessProfile };
export type EmptyHelp = {
  closest: { spot: BundleSpot; walkMinutes: number } | null;
  loosen: Loosen | null;
};

const OPEN_BUT_FILTERED: readonly Exclusion[] = [
  "required",
  "group_too_big",
  "closing_soon",
  "too_far",
];

/** The group size Surprise me uses: the Home group only when the preset has one. */
export function surpriseGroup(input: Pick<PickInput, "preset" | "group">): number {
  return input.preset.groupDefault === null ? 1 : input.group;
}

function* loosenings(input: PickInput, result: RankResult): Generator<Loosen> {
  const has = (r: Exclusion): boolean => result.excluded.some((e) => e.reason === r);
  if (has("group_too_big") && input.preset.groupDefault !== null) {
    // The largest group that still fits, down to the People stepper's floor of 2.
    for (let group = input.group - 1; group >= 2; group -= 1) yield { kind: "group", group };
  }
  // Every window needs the same 30 minutes after arrival, so a shorter one never helps a
  // spot closing soon. A longer one leaves time after a long walk.
  if (has("too_far")) {
    for (const time of TIME_CHOICE.slice(TIME_CHOICE.indexOf(input.time) + 1)) {
      yield { kind: "time", time };
    }
    const far = result.excluded
      .filter((e) => e.reason === "too_far")
      .sort((a, b) => (a.walkMinutes ?? 0) - (b.walkMinutes ?? 0));
    const tried = new Set<string>([input.from]);
    for (const e of far) {
      if (tried.has(e.spot.building_id)) continue;
      tried.add(e.spot.building_id);
      yield { kind: "from", from: e.spot.building_id };
    }
  }
  if (has("required")) yield { kind: "preset" };
  const defaultAccess =
    input.access.residence === null && input.access.quad === null && !input.access.grad;
  if (defaultAccess) {
    for (const e of result.excluded) {
      if (e.reason !== "locked") continue;
      const access = unlocking(e.spot, input.bundle);
      if (access !== null) yield { kind: "access", access };
    }
  }
}

/** The smallest declared profile that opens a locked spot, or null when none can. */
function unlocking(spot: BundleSpot, bundle: Bundle): AccessProfile | null {
  const none: AccessProfile = { residence: null, quad: null, grad: false };
  if (spot.eligibility === "grad_only") return { ...none, grad: true };
  const scope = spot.eligibility_scope;
  if (scope === null) return null;
  const b = bundle.buildings.find(
    (x) => x.id === scopeKey(scope) || scopeKey(x.name) === scopeKey(scope),
  );
  if (b === undefined) return null;
  if (spot.eligibility === "residents_building") return { ...none, residence: b.id };
  if (spot.eligibility === "residents_quad") return { ...none, quad: b.id };
  return null;
}

function picks(input: PickInput, l: Loosen): boolean {
  switch (l.kind) {
    case "group":
      return rankSpots({ ...input, group: l.group }).ranked.length > 0;
    case "time":
      return rankSpots({ ...input, time: l.time }).ranked.length > 0;
    case "from":
      return rankSpots({ ...input, from: l.from }).ranked.length > 0;
    case "preset":
      return surpriseRank({ ...input, group: surpriseGroup(input) }).ranked.length > 0;
    case "access":
      return rankSpots({ ...input, access: l.access }).ranked.length > 0;
  }
}

/**
 * For an empty pick: the nearest open, usable spot that was filtered out, and the first
 * change that, applied, gives a pick. Null when no single change does (spots closing soon).
 */
export function explainEmpty(input: PickInput, result: RankResult): EmptyHelp {
  let closest: EmptyHelp["closest"] = null;
  for (const e of result.excluded) {
    if (!OPEN_BUT_FILTERED.includes(e.reason) || e.walkMinutes === null) continue;
    if (closest === null || e.walkMinutes < closest.walkMinutes) {
      closest = { spot: e.spot, walkMinutes: e.walkMinutes };
    }
  }
  // Rank from the building the result used, so a fallback From is not suggested back.
  const from = result.from ?? input.from;
  const resolved = { ...input, from };
  let loosen: Loosen | null = null;
  for (const l of loosenings(resolved, result)) {
    if (picks(resolved, l)) {
      loosen = l;
      break;
    }
  }
  return { closest, loosen };
}
