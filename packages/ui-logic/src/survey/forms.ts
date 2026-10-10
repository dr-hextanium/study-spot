import {
  type SectionPayload,
  SectionWrite,
  type SurveySection,
  type SurveySpot,
} from "@perch/core";
import type { WriteRecord } from "./writes.ts";

/** A section's payload while being edited: any field may still be empty. */
export type SectionDraft<S extends SurveySection> = {
  [K in keyof SectionPayload<S>]: SectionPayload<S>[K] | null;
};

const DRAFT_OF: { [S in SurveySection]: (spot: SurveySpot) => SectionDraft<S> } = {
  identity: (s) => ({
    slug: s.slug,
    official_name: s.official_name,
    common_name: s.common_name,
    building_id: s.building_id,
    floor: s.floor,
    lat: s.lat,
    lng: s.lng,
    directions: s.directions,
    outdoor: s.outdoor,
    seasonal: s.seasonal,
  }),
  access: (s) => ({
    eligibility: s.eligibility,
    eligibility_scope: s.eligibility_scope,
    eligibility_verified: s.eligibility_verified,
    entry_method: s.entry_method,
    reservable: s.reservable,
    reservation_system: s.reservation_system,
    reservation_url: s.reservation_url,
  }),
  hours: (s) => ({ term_id: s.term?.id ?? null, rows: s.hours }),
  seating: (s) => ({
    seat_count: s.seat_count,
    seat_types: s.seat_types,
    table_configs: s.table_configs,
    effective_capacity: s.effective_capacity,
    max_group_size: s.max_group_size,
    spread_out_room: s.spread_out_room,
  }),
  power: (s) => ({
    outlet_coverage_pct: s.outlet_coverage_pct,
    usb_outlets: s.usb_outlets,
    wifi_mbps: s.wifi_mbps,
    cell_signal: s.cell_signal,
  }),
  environment: (s) => ({
    noise_policy: s.noise_policy,
    natural_light: s.natural_light,
    lighting: s.lighting,
    temperature: s.temperature,
    temperature_consistent: s.temperature_consistent,
    windows_view: s.windows_view,
  }),
  use_fit: (s) => ({
    calls_ok: s.calls_ok,
    group_work_ok: s.group_work_ok,
    whiteboard: s.whiteboard,
    food_policy: s.food_policy,
  }),
  amenities: (s) => ({ amenities: s.amenities }),
  accessibility: (s) => ({
    step_free: s.step_free,
    elevator: s.elevator,
    accessible_seating: s.accessible_seating,
  }),
  late_night: (s) => ({
    open_past_midnight: s.open_past_midnight,
    staffed_late: s.staffed_late,
    lit_route_to_residences: s.lit_route_to_residences,
  }),
  estimates: (s) => ({
    cells: s.estimates.map(({ day_type, block, bucket }) => ({ day_type, block, bucket })),
  }),
};

/**
 * A stable string for a value: object keys sorted, and arrays sorted by their
 * elements' canonical form. Every array in a section payload is a collection
 * (hours rows, seat types, table configs, amenities, estimate cells) whose
 * order carries no meaning, so the server may return them in any order.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Deep equality that ignores object key order and collection order. */
function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** The editor's starting values for one section of a spot (use the SpotView's merged spot). */
export function draftOf<S extends SurveySection>(section: S, spot: SurveySpot): SectionDraft<S> {
  return DRAFT_OF[section](spot);
}

export type SectionForm<S extends SurveySection> = {
  section: S;
  initial: SectionDraft<S>;
  values: SectionDraft<S>;
  /** Field name to message; "" holds errors not tied to one field. */
  errors: Readonly<Record<string, string>>;
  dirty: boolean;
};

export function initForm<S extends SurveySection>(section: S, spot: SurveySpot): SectionForm<S> {
  const initial = draftOf(section, spot);
  return { section, initial, values: initial, errors: {}, dirty: false };
}

export function setField<S extends SurveySection, K extends keyof SectionDraft<S>>(
  form: SectionForm<S>,
  field: K,
  value: SectionDraft<S>[K],
): SectionForm<S> {
  const values = { ...form.values, [field]: value };
  const { [String(field)]: _cleared, ...errors } = form.errors;
  return {
    ...form,
    values,
    errors,
    dirty: !sameValue(values, form.initial),
  };
}

export type SubmitResult<S extends SurveySection> =
  | { ok: true; write: SectionWrite }
  | { ok: false; form: SectionForm<S> };

/** Validates with the shared section schema; on failure, errors land on their fields. */
export function submitForm<S extends SurveySection>(form: SectionForm<S>): SubmitResult<S> {
  const parsed = SectionWrite.safeParse({ section: form.section, data: form.values });
  if (parsed.success) return { ok: true, write: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key =
      issue.path[0] === "data" && issue.path[1] !== undefined ? String(issue.path[1]) : "";
    errors[key] ??= issue.message;
  }
  return { ok: false, form: { ...form, errors } };
}

export type FieldDiff = { field: string; yours: unknown; theirs: unknown };

/**
 * The conflict view's rows: each field of the queued section write that differs
 * from the server's spot. Verify and review conflicts have no field rows.
 */
export function conflictDiff(record: WriteRecord): FieldDiff[] {
  if (record.kind !== "spot.section" || record.current === null) return [];
  const yours: Record<string, unknown> = record.payload.data;
  const theirs: Record<string, unknown> = draftOf(record.payload.section, record.current);
  return Object.keys(yours).flatMap((field) =>
    sameValue(yours[field], theirs[field])
      ? []
      : [{ field, yours: yours[field], theirs: theirs[field] }],
  );
}
