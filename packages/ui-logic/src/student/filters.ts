import type { Criterion } from "@perch/core";
import { type PlainCopyId, t } from "../copy/index.ts";

export const FILTER_GROUP = ["noise", "rules", "comfort", "access", "nearby"] as const;
export type FilterGroup = (typeof FILTER_GROUP)[number];
export type FilterDef = {
  id: string;
  group: FilterGroup;
  label: PlainCopyId;
  criterion: Criterion;
};

export const FILTERS = [
  {
    id: "silent",
    group: "noise",
    label: "student.filter.silent",
    criterion: { attr: "noise_policy", target: ["silent"] },
  },
  {
    id: "quiet",
    group: "noise",
    label: "student.filter.quiet",
    criterion: { attr: "noise_policy", target: ["silent", "quiet"] },
  },
  {
    id: "talking",
    group: "noise",
    label: "student.filter.talking",
    criterion: { attr: "noise_policy", target: ["conversational", "group_friendly"] },
  },
  {
    id: "outlets",
    group: "rules",
    label: "student.filter.outlets",
    criterion: { attr: "outlet_coverage_pct", target: 0.5 },
  },
  {
    id: "calls",
    group: "rules",
    label: "student.filter.calls",
    criterion: { attr: "calls_ok", target: ["allowed"] },
  },
  {
    id: "food",
    group: "rules",
    label: "student.filter.food",
    criterion: { attr: "food_policy", target: ["food_ok"] },
  },
  {
    id: "drinks",
    group: "rules",
    label: "student.filter.drinks",
    criterion: { attr: "food_policy", target: ["covered_drinks", "food_ok"] },
  },
  {
    id: "group_ok",
    group: "rules",
    label: "student.filter.group_ok",
    criterion: { attr: "flag", flag: "group_work_ok", target: true },
  },
  {
    id: "whiteboard",
    group: "rules",
    label: "student.filter.whiteboard",
    criterion: { attr: "flag", flag: "whiteboard", target: true },
  },
  {
    id: "big_room",
    group: "comfort",
    label: "student.filter.big_room",
    criterion: { attr: "seat_count", target: 50 },
  },
  {
    id: "natural_light",
    group: "comfort",
    label: "student.filter.natural_light",
    criterion: { attr: "flag", flag: "natural_light", target: true },
  },
  {
    id: "step_free",
    group: "access",
    label: "student.filter.step_free",
    criterion: { attr: "flag", flag: "step_free", target: true },
  },
  {
    id: "elevator",
    group: "access",
    label: "student.filter.elevator",
    criterion: { attr: "flag", flag: "elevator", target: true },
  },
  {
    id: "open_late",
    group: "nearby",
    label: "student.filter.open_late",
    criterion: { attr: "flag", flag: "open_past_midnight", target: true },
  },
  {
    id: "printer",
    group: "nearby",
    label: "student.filter.printer",
    criterion: { attr: "amenity", target: "printer" },
  },
  {
    id: "coffee",
    group: "nearby",
    label: "student.filter.coffee",
    criterion: { attr: "amenity", target: "coffee_food" },
  },
] as const satisfies readonly FilterDef[];
export type FilterId = (typeof FILTERS)[number]["id"];

const GROUP_LABEL = {
  noise: "student.filter.group.noise",
  rules: "student.filter.group.rules",
  comfort: "student.filter.group.comfort",
  access: "student.filter.group.access",
  nearby: "student.filter.group.nearby",
} as const satisfies Record<FilterGroup, PlainCopyId>;
export const filterGroupLabel = (g: FilterGroup): string => t(GROUP_LABEL[g]);

const same = (a: Criterion, b: Criterion): boolean => JSON.stringify(a) === JSON.stringify(b);
function criterionOf(id: FilterId): Criterion {
  const def = FILTERS.find((f) => f.id === id);
  if (def === undefined) throw new Error(`unknown filter ${id}`);
  return def.criterion;
}
export const isOn = (extra: readonly Criterion[], id: FilterId): boolean =>
  extra.some((c) => same(c, criterionOf(id)));
export function toggle(extra: readonly Criterion[], id: FilterId): Criterion[] {
  const c = criterionOf(id);
  return isOn(extra, id) ? extra.filter((x) => !same(x, c)) : [...extra, c];
}
