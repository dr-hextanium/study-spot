import type { BundleSpot } from "@perch/core";
import { fieldName, fieldValueText } from "./fields.ts";

/** The spot's own fields the page lists under Details, in reading order. Null values are skipped. */
const FACT_FIELDS = [
  "seat_count",
  "noise_policy",
  "food_policy",
  "group_work_ok",
  "calls_ok",
  "outlet_coverage_pct",
  "usb_outlets",
  "wifi_mbps",
  "cell_signal",
  "natural_light",
  "lighting",
  "temperature",
  "whiteboard",
  "entry_method",
  "reservable",
  "step_free",
  "elevator",
  "accessible_seating",
  "open_past_midnight",
  "staffed_late",
  "lit_route_to_residences",
] as const satisfies readonly (keyof BundleSpot)[];

export function spotFacts(spot: BundleSpot): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const field of FACT_FIELDS) {
    const value = spot[field];
    if (value === null) continue;
    out.push({ label: fieldName(field), value: fieldValueText(field, value) });
  }
  return out;
}
