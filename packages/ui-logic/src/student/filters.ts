import type { Criterion } from "@perch/core";
import { type PlainCopyId, t } from "../copy/index.ts";

/** Every filter a student can switch on. Home's sheet shows some; Browse's shows all. */
export const FILTER_ID = [
  "silent",
  "quiet",
  "talking",
  "outlets",
  "usb",
  "signal",
  "wifi",
  "calls",
  "carrels",
  "booths",
  "soft",
  "small_tables",
  "large_tables",
  "solo_tables",
  "big_room",
  "spread_out",
  "natural_light",
  "bright",
  "view",
  "neutral_temp",
  "steady_temp",
  "food",
  "drinks",
  "group_ok",
  "whiteboard",
  "reservable",
  "outdoor",
  "step_free",
  "elevator",
  "accessible_seating",
  "open_entry",
  "open_late",
  "staffed_late",
  "lit_route",
  "late_food",
  "coffee",
  "printer",
  "bathroom",
  "water",
  "microwave",
] as const;
export type FilterId = (typeof FILTER_ID)[number];

const flag = (f: Extract<Criterion, { attr: "flag" }>["flag"]): Criterion => ({
  attr: "flag",
  flag: f,
  target: true,
});

/**
 * Each filter is one exact required criterion: a spot with no answer for it does not
 * match. Access is not here (the lock covers it) and neither are hours.
 */
const DEF = {
  silent: {
    label: "student.filter.silent",
    criterion: { attr: "noise_policy", target: ["silent"] },
  },
  quiet: {
    label: "student.filter.quiet",
    criterion: { attr: "noise_policy", target: ["silent", "quiet"] },
  },
  talking: {
    label: "student.filter.talking",
    criterion: { attr: "noise_policy", target: ["conversational", "group_friendly"] },
  },
  outlets: {
    label: "student.filter.outlets",
    criterion: { attr: "outlet_coverage_pct", target: 0.5 },
  },
  usb: { label: "student.filter.usb", criterion: flag("usb_outlets") },
  signal: { label: "student.filter.signal", criterion: { attr: "cell_signal", target: ["good"] } },
  wifi: { label: "student.filter.wifi", criterion: { attr: "wifi_mbps", target: 50 } },
  calls: { label: "student.filter.calls", criterion: { attr: "calls_ok", target: ["allowed"] } },
  carrels: { label: "student.filter.carrels", criterion: { attr: "seat_type", target: "carrel" } },
  booths: { label: "student.filter.booths", criterion: { attr: "seat_type", target: "booth" } },
  soft: { label: "student.filter.soft", criterion: { attr: "seat_type", target: "soft" } },
  small_tables: {
    label: "student.filter.small_tables",
    criterion: { attr: "table_config", target: "small_2_4" },
  },
  large_tables: {
    label: "student.filter.large_tables",
    criterion: { attr: "table_config", target: "large_shared" },
  },
  solo_tables: {
    label: "student.filter.solo_tables",
    criterion: { attr: "table_config", target: "individual" },
  },
  big_room: { label: "student.filter.big_room", criterion: { attr: "seat_count", target: 50 } },
  spread_out: { label: "student.filter.spread_out", criterion: flag("spread_out_room") },
  natural_light: { label: "student.filter.natural_light", criterion: flag("natural_light") },
  bright: { label: "student.filter.bright", criterion: { attr: "lighting", target: ["bright"] } },
  view: { label: "student.filter.view", criterion: flag("windows_view") },
  neutral_temp: {
    label: "student.filter.neutral_temp",
    criterion: { attr: "temperature", target: ["neutral"] },
  },
  steady_temp: { label: "student.filter.steady_temp", criterion: flag("temperature_consistent") },
  food: { label: "student.filter.food", criterion: { attr: "food_policy", target: ["food_ok"] } },
  drinks: {
    label: "student.filter.drinks",
    criterion: { attr: "food_policy", target: ["covered_drinks", "food_ok"] },
  },
  group_ok: { label: "student.filter.group_ok", criterion: flag("group_work_ok") },
  whiteboard: { label: "student.filter.whiteboard", criterion: flag("whiteboard") },
  reservable: { label: "student.filter.reservable", criterion: flag("reservable") },
  outdoor: { label: "student.filter.outdoor", criterion: flag("outdoor") },
  step_free: { label: "student.filter.step_free", criterion: flag("step_free") },
  elevator: { label: "student.filter.elevator", criterion: flag("elevator") },
  accessible_seating: {
    label: "student.filter.accessible_seating",
    criterion: flag("accessible_seating"),
  },
  open_entry: {
    label: "student.filter.open_entry",
    criterion: { attr: "entry_method", target: ["open"] },
  },
  open_late: { label: "student.filter.open_late", criterion: flag("open_past_midnight") },
  staffed_late: { label: "student.filter.staffed_late", criterion: flag("staffed_late") },
  lit_route: { label: "student.filter.lit_route", criterion: flag("lit_route_to_residences") },
  late_food: {
    label: "student.filter.late_food",
    criterion: { attr: "amenity", target: "late_food" },
  },
  coffee: { label: "student.filter.coffee", criterion: { attr: "amenity", target: "coffee_food" } },
  printer: { label: "student.filter.printer", criterion: { attr: "amenity", target: "printer" } },
  bathroom: {
    label: "student.filter.bathroom",
    criterion: { attr: "amenity", target: "bathroom" },
  },
  water: { label: "student.filter.water", criterion: { attr: "amenity", target: "water" } },
  microwave: {
    label: "student.filter.microwave",
    criterion: { attr: "amenity", target: "microwave" },
  },
} as const satisfies Record<FilterId, { label: PlainCopyId; criterion: Criterion }>;

/** Home's sheet groups. */
export const FILTER_GROUP = ["noise", "rules", "comfort", "access", "nearby"] as const;
/** Browse's sheet groups: every filter, sorted finer. */
export const BROWSE_FILTER_GROUP = [
  "noise",
  "power",
  "seats",
  "comfort",
  "house",
  "access",
  "nearby",
] as const;
export type FilterGroup = (typeof FILTER_GROUP)[number] | (typeof BROWSE_FILTER_GROUP)[number];

export type FilterDef = {
  id: FilterId;
  group: FilterGroup;
  label: PlainCopyId;
  criterion: Criterion;
};

function layout(groups: readonly (readonly [FilterGroup, readonly FilterId[]])[]): FilterDef[] {
  return groups.flatMap(([group, ids]) => ids.map((id) => ({ id, group, ...DEF[id] })));
}

/** The More filters switches on Home. */
export const FILTERS: readonly FilterDef[] = layout([
  ["noise", ["silent", "quiet", "talking"]],
  ["rules", ["outlets", "calls", "food", "drinks", "group_ok", "whiteboard"]],
  ["comfort", ["big_room", "natural_light"]],
  ["access", ["step_free", "elevator"]],
  ["nearby", ["open_late", "printer", "coffee"]],
]);

/** Browse's filter sheet: every filter in FILTER_ID. */
export const BROWSE_FILTERS: readonly FilterDef[] = layout([
  ["noise", ["silent", "quiet", "talking"]],
  ["power", ["outlets", "usb", "signal", "wifi", "calls"]],
  [
    "seats",
    [
      "carrels",
      "booths",
      "soft",
      "small_tables",
      "large_tables",
      "solo_tables",
      "big_room",
      "spread_out",
    ],
  ],
  ["comfort", ["natural_light", "bright", "view", "neutral_temp", "steady_temp"]],
  ["house", ["food", "drinks", "group_ok", "whiteboard", "reservable", "outdoor"]],
  ["access", ["step_free", "elevator", "accessible_seating", "open_entry"]],
  [
    "nearby",
    [
      "open_late",
      "staffed_late",
      "lit_route",
      "late_food",
      "coffee",
      "printer",
      "bathroom",
      "water",
      "microwave",
    ],
  ],
]);

const GROUP_LABEL = {
  noise: "student.filter.group.noise",
  rules: "student.filter.group.rules",
  comfort: "student.filter.group.comfort",
  access: "student.filter.group.access",
  nearby: "student.filter.group.nearby",
  power: "student.filter.group.power",
  seats: "student.filter.group.seats",
  house: "student.filter.group.house",
} as const satisfies Record<FilterGroup, PlainCopyId>;

export const filterGroupLabel = (g: FilterGroup): string => t(GROUP_LABEL[g]);

const same = (a: Criterion, b: Criterion): boolean => JSON.stringify(a) === JSON.stringify(b);

export const isOn = (extra: readonly Criterion[], id: FilterId): boolean =>
  extra.some((c) => same(c, DEF[id].criterion));

export function toggle(extra: readonly Criterion[], id: FilterId): Criterion[] {
  const c = DEF[id].criterion;
  return isOn(extra, id) ? extra.filter((x) => !same(x, c)) : [...extra, c];
}
