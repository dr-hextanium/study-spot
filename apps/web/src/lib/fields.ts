import {
  AMENITY,
  type Amenity,
  type CallsOk,
  type CellSignal,
  type Eligibility,
  type EntryMethod,
  type FoodPolicy,
  type Fullness,
  type Lighting,
  type NoisePolicy,
  type SeatType,
  type TableConfig,
  type Temperature,
} from "@perch/core";
import { COPY, type PlainCopyId, t } from "@perch/ui-logic";
import type { Option } from "../ui/Segmented.tsx";

// Object.keys widens to string[]; the keys of a Record<V, ...> are V.
const opts = <V extends string>(ids: Record<V, PlainCopyId>): Option<V>[] =>
  (Object.keys(ids) as V[]).map((value) => ({ value, label: COPY[ids[value]] }));

export const ELIGIBILITY_COPY: Record<Eligibility, PlainCopyId> = {
  all_students: "access.eligibility.all_students",
  residents_building: "access.eligibility.residents_building",
  residents_quad: "access.eligibility.residents_quad",
  grad_only: "access.eligibility.grad_only",
  department: "access.eligibility.department",
  public: "access.eligibility.public",
};
export const ENTRY_COPY: Record<EntryMethod, PlainCopyId> = {
  open: "access.entry.open",
  card_swipe: "access.entry.card_swipe",
  staffed_desk: "access.entry.staffed_desk",
};
export const SEAT_TYPE_COPY: Record<SeatType, PlainCopyId> = {
  table_chair: "seating.type.table_chair",
  carrel: "seating.type.carrel",
  soft: "seating.type.soft",
  booth: "seating.type.booth",
  standing: "seating.type.standing",
};
export const TABLE_COPY: Record<TableConfig, PlainCopyId> = {
  large_shared: "seating.table.large_shared",
  small_2_4: "seating.table.small_2_4",
  individual: "seating.table.individual",
};
export const CELL_COPY: Record<CellSignal, PlainCopyId> = {
  poor: "power.cell.poor",
  ok: "power.cell.ok",
  good: "power.cell.good",
};
export const NOISE_COPY: Record<NoisePolicy, PlainCopyId> = {
  silent: "env.noise.silent",
  quiet: "env.noise.quiet",
  conversational: "env.noise.conversational",
  group_friendly: "env.noise.group_friendly",
};
export const LIGHTING_COPY: Record<Lighting, PlainCopyId> = {
  dim: "env.lighting.dim",
  moderate: "env.lighting.moderate",
  bright: "env.lighting.bright",
};
export const TEMPERATURE_COPY: Record<Temperature, PlainCopyId> = {
  cold: "env.temperature.cold",
  neutral: "env.temperature.neutral",
  warm: "env.temperature.warm",
};
export const FOOD_COPY: Record<FoodPolicy, PlainCopyId> = {
  none: "use.food.none",
  covered_drinks: "use.food.covered_drinks",
  food_ok: "use.food.food_ok",
};
export const CALLS_COPY: Record<CallsOk, PlainCopyId> = {
  not_allowed: "use.calls.not_allowed",
  allowed_impractical: "use.calls.allowed_impractical",
  allowed: "use.calls.allowed",
};
export const AMENITY_COPY: Record<Amenity, PlainCopyId> = {
  bathroom: "amenity.bathroom",
  water: "amenity.water",
  coffee_food: "amenity.coffee_food",
  printer: "amenity.printer",
  microwave: "amenity.microwave",
  late_food: "amenity.late_food",
};
export const BUCKET_COPY: Record<Fullness, PlainCopyId> = {
  empty: "estimates.bucket.empty",
  some: "estimates.bucket.some",
  filling: "estimates.bucket.filling",
  nearly_full: "estimates.bucket.nearly_full",
  full: "estimates.bucket.full",
};

export const ELIGIBILITY_OPTIONS = opts(ELIGIBILITY_COPY);
export const ENTRY_OPTIONS = opts(ENTRY_COPY);
export const CELL_OPTIONS = opts(CELL_COPY);
export const NOISE_OPTIONS = opts(NOISE_COPY);
export const LIGHTING_OPTIONS = opts(LIGHTING_COPY);
export const TEMPERATURE_OPTIONS = opts(TEMPERATURE_COPY);
export const FOOD_OPTIONS = opts(FOOD_COPY);
export const CALLS_OPTIONS = opts(CALLS_COPY);
export { AMENITY };

/** The label of every field a section editor shows, for the conflict view's rows. */
export const FIELD_LABEL: Readonly<Record<string, PlainCopyId>> = {
  official_name: "new.official_name.label",
  common_name: "new.common_name.label",
  building_id: "new.building.label",
  floor: "new.floor.label",
  directions: "new.directions.label",
  outdoor: "identity.outdoor.label",
  seasonal: "identity.seasonal.label",
  eligibility: "access.eligibility.label",
  eligibility_scope: "access.scope.label.building",
  eligibility_verified: "access.verified.label",
  entry_method: "access.entry.label",
  reservable: "access.reservable.label",
  reservation_url: "access.reservation_url.label",
  rows: "section.hours.name",
  seat_count: "seating.seat_count.label",
  seat_types: "seating.types.label",
  table_configs: "seating.tables.label",
  max_group_size: "seating.max_group.label",
  spread_out_room: "seating.spread_out.label",
  outlet_coverage_pct: "power.outlets.label",
  usb_outlets: "power.usb.label",
  wifi_mbps: "power.wifi.label",
  cell_signal: "power.cell.label",
  noise_policy: "env.noise.label",
  natural_light: "env.light.natural",
  lighting: "env.lighting.label",
  temperature: "env.temperature.label",
  temperature_consistent: "env.temperature_consistent.label",
  windows_view: "env.windows.label",
  food_policy: "use.food.label",
  group_work_ok: "use.group.label",
  calls_ok: "use.calls.label",
  whiteboard: "use.whiteboard.label",
  amenities: "section.amenities.name",
  step_free: "a11y.step_free",
  elevator: "a11y.elevator",
  accessible_seating: "a11y.seating",
  open_past_midnight: "late.past_midnight",
  staffed_late: "late.staffed",
  lit_route_to_residences: "late.lit_route",
  cells: "section.estimates.name",
};

export function fieldName(field: string): string {
  const id = FIELD_LABEL[field];
  return id === undefined ? field : COPY[id];
}

const ENUM_COPY: Readonly<Record<string, PlainCopyId>> = {
  ...ELIGIBILITY_COPY,
  ...ENTRY_COPY,
  ...SEAT_TYPE_COPY,
  ...TABLE_COPY,
  ...CELL_COPY,
  ...NOISE_COPY,
  ...LIGHTING_COPY,
  ...TEMPERATURE_COPY,
  ...FOOD_COPY,
  ...CALLS_COPY,
  ...AMENITY_COPY,
  ...BUCKET_COPY,
};

const DAY_COPY: readonly PlainCopyId[] = [
  "hours.day.sun",
  "hours.day.mon",
  "hours.day.tue",
  "hours.day.wed",
  "hours.day.thu",
  "hours.day.fri",
  "hours.day.sat",
];

function item(value: unknown): string {
  if (typeof value !== "object" || value === null) return valueText(value);
  // A non-null object, checked just above; its fields are read as unknown.
  const v = value as Record<string, unknown>;
  if (typeof v.type === "string") return valueText(v.type);
  if (typeof v.amenity === "string" && typeof v.walk_minutes === "number") {
    return `${valueText(v.amenity)} ${t("amenity.minutes", { minutes: v.walk_minutes })}`;
  }
  if (typeof v.day_of_week === "number" && typeof v.opens === "string") {
    const day = COPY[DAY_COPY[v.day_of_week] ?? "hours.day.mon"];
    return `${day} ${v.opens}-${String(v.closes)}`;
  }
  if (typeof v.day_type === "string" && typeof v.block === "string") {
    return valueText(v.bucket);
  }
  return JSON.stringify(value);
}

/** A field's value as the surveyor would read it: option labels, Yes or No, Not sure for empty. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return t("common.unknown");
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const id = ENUM_COPY[value];
    return id === undefined ? value : COPY[id];
  }
  if (Array.isArray(value))
    return value.length === 0 ? t("common.unknown") : value.map(item).join(", ");
  return item(value);
}

/** valueText with the units a field needs (outlet coverage is stored 0 to 1, shown as a percent). */
export function fieldValueText(field: string, value: unknown): string {
  if (field === "outlet_coverage_pct" && typeof value === "number") {
    return t("power.outlets.value", { percent: Math.round(value * 100) });
  }
  return valueText(value);
}
