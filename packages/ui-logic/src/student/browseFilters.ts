import type { Criterion } from "@perch/core";
import { type PlainCopyId, t } from "../copy/index.ts";

export const BROWSE_FILTER_GROUPS = [
  "noise",
  "power",
  "seats",
  "room",
  "rules",
  "access",
  "nearby",
] as const;
export type BrowseFilterGroup = (typeof BROWSE_FILTER_GROUPS)[number];

export const BROWSE_FILTER_IDS = [
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
export type BrowseFilterId = (typeof BROWSE_FILTER_IDS)[number];

export type BrowseFilterDef = {
  id: BrowseFilterId;
  group: BrowseFilterGroup;
  label: PlainCopyId;
  criterion: Criterion;
};

const flag = (flag: Extract<Criterion, { attr: "flag" }>["flag"]): Criterion => ({
  attr: "flag",
  flag,
  target: true,
});

/**
 * Every v0 attribute a student can sensibly filter on. Each is a required
 * criterion: a spot with no answer for it (null) does not match. Access is not
 * here (the lock and "show spots I can't use" cover it) and neither are hours
 * ("Open when I get there" covers them).
 */
export const BROWSE_FILTERS: readonly BrowseFilterDef[] = [
  {
    id: "silent",
    group: "noise",
    label: "student.browse.filter.silent",
    criterion: { attr: "noise_policy", target: ["silent"] },
  },
  {
    id: "quiet",
    group: "noise",
    label: "student.browse.filter.quiet",
    criterion: { attr: "noise_policy", target: ["silent", "quiet"] },
  },
  {
    id: "talking",
    group: "noise",
    label: "student.browse.filter.talking",
    criterion: { attr: "noise_policy", target: ["conversational", "group_friendly"] },
  },
  {
    id: "outlets",
    group: "power",
    label: "student.browse.filter.outlets",
    criterion: { attr: "outlet_coverage_pct", target: 0.5 },
  },
  { id: "usb", group: "power", label: "student.browse.filter.usb", criterion: flag("usb_outlets") },
  {
    id: "signal",
    group: "power",
    label: "student.browse.filter.signal",
    criterion: { attr: "cell_signal", target: ["good"] },
  },
  {
    id: "wifi",
    group: "power",
    label: "student.browse.filter.wifi",
    criterion: { attr: "wifi_mbps", target: 50 },
  },
  {
    id: "calls",
    group: "power",
    label: "student.browse.filter.calls",
    criterion: { attr: "calls_ok", target: ["allowed"] },
  },
  {
    id: "carrels",
    group: "seats",
    label: "student.browse.filter.carrels",
    criterion: { attr: "seat_type", target: "carrel" },
  },
  {
    id: "booths",
    group: "seats",
    label: "student.browse.filter.booths",
    criterion: { attr: "seat_type", target: "booth" },
  },
  {
    id: "soft",
    group: "seats",
    label: "student.browse.filter.soft",
    criterion: { attr: "seat_type", target: "soft" },
  },
  {
    id: "small_tables",
    group: "seats",
    label: "student.browse.filter.small_tables",
    criterion: { attr: "table_config", target: "small_2_4" },
  },
  {
    id: "large_tables",
    group: "seats",
    label: "student.browse.filter.large_tables",
    criterion: { attr: "table_config", target: "large_shared" },
  },
  {
    id: "solo_tables",
    group: "seats",
    label: "student.browse.filter.solo_tables",
    criterion: { attr: "table_config", target: "individual" },
  },
  {
    id: "big_room",
    group: "seats",
    label: "student.browse.filter.big_room",
    criterion: { attr: "seat_count", target: 50 },
  },
  {
    id: "spread_out",
    group: "seats",
    label: "student.browse.filter.spread_out",
    criterion: flag("spread_out_room"),
  },
  {
    id: "natural_light",
    group: "room",
    label: "student.browse.filter.natural_light",
    criterion: flag("natural_light"),
  },
  {
    id: "bright",
    group: "room",
    label: "student.browse.filter.bright",
    criterion: { attr: "lighting", target: ["bright"] },
  },
  {
    id: "view",
    group: "room",
    label: "student.browse.filter.view",
    criterion: flag("windows_view"),
  },
  {
    id: "neutral_temp",
    group: "room",
    label: "student.browse.filter.neutral_temp",
    criterion: { attr: "temperature", target: ["neutral"] },
  },
  {
    id: "steady_temp",
    group: "room",
    label: "student.browse.filter.steady_temp",
    criterion: flag("temperature_consistent"),
  },
  {
    id: "food",
    group: "rules",
    label: "student.browse.filter.food",
    criterion: { attr: "food_policy", target: ["food_ok"] },
  },
  {
    id: "drinks",
    group: "rules",
    label: "student.browse.filter.drinks",
    criterion: { attr: "food_policy", target: ["covered_drinks", "food_ok"] },
  },
  {
    id: "group_ok",
    group: "rules",
    label: "student.browse.filter.group_ok",
    criterion: flag("group_work_ok"),
  },
  {
    id: "whiteboard",
    group: "rules",
    label: "student.browse.filter.whiteboard",
    criterion: flag("whiteboard"),
  },
  {
    id: "reservable",
    group: "rules",
    label: "student.browse.filter.reservable",
    criterion: flag("reservable"),
  },
  {
    id: "outdoor",
    group: "rules",
    label: "student.browse.filter.outdoor",
    criterion: flag("outdoor"),
  },
  {
    id: "step_free",
    group: "access",
    label: "student.browse.filter.step_free",
    criterion: flag("step_free"),
  },
  {
    id: "elevator",
    group: "access",
    label: "student.browse.filter.elevator",
    criterion: flag("elevator"),
  },
  {
    id: "accessible_seating",
    group: "access",
    label: "student.browse.filter.accessible_seating",
    criterion: flag("accessible_seating"),
  },
  {
    id: "open_entry",
    group: "access",
    label: "student.browse.filter.open_entry",
    criterion: { attr: "entry_method", target: ["open"] },
  },
  {
    id: "open_late",
    group: "nearby",
    label: "student.browse.filter.open_late",
    criterion: flag("open_past_midnight"),
  },
  {
    id: "staffed_late",
    group: "nearby",
    label: "student.browse.filter.staffed_late",
    criterion: flag("staffed_late"),
  },
  {
    id: "lit_route",
    group: "nearby",
    label: "student.browse.filter.lit_route",
    criterion: flag("lit_route_to_residences"),
  },
  {
    id: "late_food",
    group: "nearby",
    label: "student.browse.filter.late_food",
    criterion: { attr: "amenity", target: "late_food" },
  },
  {
    id: "coffee",
    group: "nearby",
    label: "student.browse.filter.coffee",
    criterion: { attr: "amenity", target: "coffee_food" },
  },
  {
    id: "printer",
    group: "nearby",
    label: "student.browse.filter.printer",
    criterion: { attr: "amenity", target: "printer" },
  },
  {
    id: "bathroom",
    group: "nearby",
    label: "student.browse.filter.bathroom",
    criterion: { attr: "amenity", target: "bathroom" },
  },
  {
    id: "water",
    group: "nearby",
    label: "student.browse.filter.water",
    criterion: { attr: "amenity", target: "water" },
  },
  {
    id: "microwave",
    group: "nearby",
    label: "student.browse.filter.microwave",
    criterion: { attr: "amenity", target: "microwave" },
  },
];

const GROUP_LABEL = {
  noise: "student.browse.filter.group.noise",
  power: "student.browse.filter.group.power",
  seats: "student.browse.filter.group.seats",
  room: "student.browse.filter.group.room",
  rules: "student.browse.filter.group.rules",
  access: "student.browse.filter.group.access",
  nearby: "student.browse.filter.group.nearby",
} as const satisfies Record<BrowseFilterGroup, PlainCopyId>;

export const browseFilterGroupLabel = (g: BrowseFilterGroup): string => t(GROUP_LABEL[g]);

const same = (a: Criterion, b: Criterion): boolean => JSON.stringify(a) === JSON.stringify(b);

function criterionOf(id: BrowseFilterId): Criterion {
  const def = BROWSE_FILTERS.find((f) => f.id === id);
  if (def === undefined) throw new Error(`unknown filter ${id}`);
  return def.criterion;
}

export const isBrowseFilterOn = (extra: readonly Criterion[], id: BrowseFilterId): boolean =>
  extra.some((c) => same(c, criterionOf(id)));

export function toggleBrowseFilter(extra: readonly Criterion[], id: BrowseFilterId): Criterion[] {
  const c = criterionOf(id);
  return isBrowseFilterOn(extra, id) ? extra.filter((x) => !same(x, c)) : [...extra, c];
}
