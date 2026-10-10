import { z } from "zod";
import type { BundleSpot } from "../bundle.ts";
import {
  Amenity,
  CallsOk,
  CellSignal,
  EntryMethod,
  FoodPolicy,
  Lighting,
  NoisePolicy,
  SeatType,
  TableConfig,
  Temperature,
} from "../enums.ts";

export const BOOL_ATTR = [
  "group_work_ok",
  "natural_light",
  "windows_view",
  "whiteboard",
  "usb_outlets",
  "step_free",
  "elevator",
  "accessible_seating",
  "open_past_midnight",
  "staffed_late",
  "lit_route_to_residences",
  "outdoor",
  "spread_out_room",
  "reservable",
  "temperature_consistent",
] as const;
export const BoolAttr = z.enum(BOOL_ATTR);
export type BoolAttr = z.infer<typeof BoolAttr>;

/** One attribute test. Enum targets are "any of"; numeric targets are minimums. */
export const Criterion = z.discriminatedUnion("attr", [
  z.object({ attr: z.literal("noise_policy"), target: z.array(NoisePolicy).min(1) }),
  z.object({ attr: z.literal("calls_ok"), target: z.array(CallsOk).min(1) }),
  z.object({ attr: z.literal("food_policy"), target: z.array(FoodPolicy).min(1) }),
  z.object({ attr: z.literal("lighting"), target: z.array(Lighting).min(1) }),
  z.object({ attr: z.literal("temperature"), target: z.array(Temperature).min(1) }),
  z.object({ attr: z.literal("cell_signal"), target: z.array(CellSignal).min(1) }),
  z.object({ attr: z.literal("entry_method"), target: z.array(EntryMethod).min(1) }),
  z.object({ attr: z.literal("outlet_coverage_pct"), target: z.number().min(0).max(1) }),
  z.object({ attr: z.literal("seat_count"), target: z.number().int().positive() }),
  z.object({ attr: z.literal("wifi_mbps"), target: z.number().nonnegative() }),
  z.object({ attr: z.literal("seat_type"), target: SeatType }),
  z.object({ attr: z.literal("table_config"), target: TableConfig }),
  z.object({ attr: z.literal("amenity"), target: Amenity }),
  z.object({ attr: z.literal("flag"), flag: BoolAttr, target: z.boolean() }),
]);
export type Criterion = z.infer<typeof Criterion>;

export const SoftTerm = z.object({ when: Criterion, weight: z.number().positive().max(5) });
export type SoftTerm = z.infer<typeof SoftTerm>;

export type Match = "yes" | "no" | "unknown";
export const MATCH_CREDIT: Readonly<Record<Match, number>> = { yes: 1, unknown: 0.5, no: 0 };

const yn = (b: boolean): Match => (b ? "yes" : "no");
function inList<T extends string>(v: T | null, list: readonly T[]): Match {
  return v === null ? "unknown" : yn(list.includes(v));
}

export function matchCriterion(spot: BundleSpot, c: Criterion): Match {
  switch (c.attr) {
    case "noise_policy":
      return inList(spot.noise_policy, c.target);
    case "calls_ok":
      return inList(spot.calls_ok, c.target);
    case "food_policy":
      return inList(spot.food_policy, c.target);
    case "lighting":
      return inList(spot.lighting, c.target);
    case "temperature":
      return inList(spot.temperature, c.target);
    case "cell_signal":
      return inList(spot.cell_signal, c.target);
    case "entry_method":
      return inList(spot.entry_method, c.target);
    case "outlet_coverage_pct":
      return yn(spot.outlet_coverage_pct >= c.target);
    case "seat_count":
      return yn(spot.seat_count >= c.target);
    case "wifi_mbps":
      return spot.wifi_mbps === null ? "unknown" : yn(spot.wifi_mbps >= c.target);
    case "seat_type":
      return yn(spot.seat_types.some((s) => s.type === c.target && s.count > 0));
    case "table_config":
      return yn(spot.table_configs.includes(c.target));
    case "amenity":
      return yn(spot.amenities.some((a) => a.amenity === c.target));
    case "flag": {
      const v = spot[c.flag];
      return v === null ? "unknown" : yn(v === c.target);
    }
  }
}

/** Weighted soft match in [0, 1]; unknown earns half; no terms is a perfect fit. */
export function fit(spot: BundleSpot, soft: readonly SoftTerm[]): number {
  if (soft.length === 0) return 1;
  let total = 0;
  let got = 0;
  for (const term of soft) {
    total += term.weight;
    got += term.weight * MATCH_CREDIT[matchCriterion(spot, term.when)];
  }
  return got / total;
}

/** The matched soft terms that best explain a pick: heaviest first, ties in preset order. */
export function topReasons(spot: BundleSpot, soft: readonly SoftTerm[], limit = 2): Criterion[] {
  return soft
    .map((term, i) => ({ term, i }))
    .filter(({ term }) => matchCriterion(spot, term.when) === "yes")
    .sort((a, b) => b.term.weight - a.term.weight || a.i - b.i)
    .slice(0, limit)
    .map(({ term }) => term.when);
}
