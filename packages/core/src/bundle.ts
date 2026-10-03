import { z } from "zod";
import {
  Amenity,
  AttributeGroup,
  CallsOk,
  CellSignal,
  Eligibility,
  EntryMethod,
  FoodPolicy,
  Lighting,
  NoisePolicy,
  SeatType,
  SlotConfidence,
  TableConfig,
  Temperature,
} from "./enums.ts";
import { SLOTS } from "./slots.ts";

export const BUNDLE_SCHEMA_MAJOR = 1;
export const DATA_LICENSE = "CC BY-SA 4.0";
export const DATA_ATTRIBUTION = "Perch surveyors";

const IsoDate = z.iso.date();
const IsoDateTime = z.iso.datetime();
const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const Ratio = z.number().min(0).max(1);

/** HH:MM in campus local time. "24:00" means midnight at the end of the day. */
export const TimeOfDay = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);

export const BundleBuilding = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: Lat,
  lng: Lng,
});
export type BundleBuilding = z.infer<typeof BundleBuilding>;

export const BundleSpot = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  building_id: z.string().min(1),
  floor: z.string().min(1),
  official_name: z.string().min(1),
  common_name: z.string().nullable(),
  lat: Lat,
  lng: Lng,
  directions: z.string().min(1),
  eligibility: Eligibility,
  eligibility_scope: z.string().nullable(),
  eligibility_verified: z.boolean(),
  entry_method: EntryMethod.nullable(),
  reservable: z.boolean(),
  reservation_system: z.string().nullable(),
  reservation_url: z.httpUrl().nullable(),
  seat_count: z.number().int().positive(),
  seat_types: z.array(z.object({ type: SeatType, count: z.number().int().nonnegative() })),
  table_configs: z.array(TableConfig),
  effective_capacity: z.number().int().positive().nullable(),
  max_group_size: z.number().int().positive().nullable(),
  spread_out_room: z.boolean().nullable(),
  outlet_coverage_pct: Ratio,
  usb_outlets: z.boolean().nullable(),
  wifi_mbps: z.number().nonnegative().nullable(),
  cell_signal: CellSignal.nullable(),
  noise_policy: NoisePolicy,
  natural_light: z.boolean().nullable(),
  lighting: Lighting.nullable(),
  temperature: Temperature.nullable(),
  temperature_consistent: z.boolean().nullable(),
  windows_view: z.boolean().nullable(),
  calls_ok: CallsOk.nullable(),
  group_work_ok: z.boolean(),
  whiteboard: z.boolean().nullable(),
  food_policy: FoodPolicy,
  amenities: z.array(z.object({ amenity: Amenity, walk_minutes: z.number().int().nonnegative() })),
  step_free: z.boolean().nullable(),
  elevator: z.boolean().nullable(),
  accessible_seating: z.boolean().nullable(),
  open_past_midnight: z.boolean().nullable(),
  staffed_late: z.boolean().nullable(),
  lit_route_to_residences: z.boolean().nullable(),
  outdoor: z.boolean(),
  seasonal: z.boolean(),
  hours_unconfirmed: z.boolean(),
  verified: z.partialRecord(AttributeGroup, IsoDateTime),
  photos: z.array(z.object({ url: z.httpUrl(), taken_at: IsoDateTime, is_cover: z.boolean() })),
});
export type BundleSpot = z.infer<typeof BundleSpot>;

export const BundleHours = z.object({
  spot_id: z.uuid(),
  day_of_week: z.number().int().min(0).max(6),
  opens: TimeOfDay,
  closes: TimeOfDay,
  last_entry: TimeOfDay.nullable(),
  is_exam: z.boolean(),
});
export type BundleHours = z.infer<typeof BundleHours>;

const SlotArray = z.array(Ratio).length(SLOTS);

export const BundleBusyness = z.object({
  regular: SlotArray,
  exam: SlotArray.nullable(),
  confidence: z.array(SlotConfidence).length(SLOTS),
});
export type BundleBusyness = z.infer<typeof BundleBusyness>;

export const BundleTerm = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  starts: IsoDate,
  ends: IsoDate,
  exam_starts: IsoDate.nullable(),
  exam_ends: IsoDate.nullable(),
});
export type BundleTerm = z.infer<typeof BundleTerm>;

export const Bundle = z
  .object({
    schema_version: z.literal(BUNDLE_SCHEMA_MAJOR),
    generated_at: IsoDateTime,
    campus: z.object({ id: z.string().min(1), name: z.string().min(1), tz: z.string().min(1) }),
    term: BundleTerm,
    buildings: z.array(BundleBuilding),
    walk: z.object({
      building_ids: z.array(z.string().min(1)),
      minutes: z.array(z.array(z.number().int().nonnegative())),
      estimated_pairs: z.array(z.tuple([z.number().int(), z.number().int()])),
    }),
    spots: z.array(BundleSpot),
    hours: z.array(BundleHours),
    busyness: z.record(z.string(), BundleBusyness),
    data_license: z.literal(DATA_LICENSE),
    attribution: z.string().min(1),
  })
  .superRefine((b, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: "custom", message });
    };
    const buildingIds = new Set<string>();
    for (const x of b.buildings) {
      if (buildingIds.has(x.id)) issue(`duplicate building id ${x.id}`);
      buildingIds.add(x.id);
    }
    const n = b.walk.building_ids.length;

    if (n !== buildingIds.size || !b.walk.building_ids.every((id) => buildingIds.has(id))) {
      issue("walk.building_ids must list every building exactly once");
    }
    if (b.walk.minutes.length !== n || b.walk.minutes.some((row) => row.length !== n)) {
      issue("walk.minutes must be a square matrix matching walk.building_ids");
    }
    for (const [i, j] of b.walk.estimated_pairs) {
      if (i < 0 || j < 0 || i >= n || j >= n) issue(`walk.estimated_pairs out of range: ${i},${j}`);
    }

    const spotIds = new Set<string>();
    const slugs = new Set<string>();
    for (const s of b.spots) {
      if (!buildingIds.has(s.building_id))
        issue(`spot ${s.slug} has unknown building ${s.building_id}`);
      if (slugs.has(s.slug)) issue(`duplicate slug ${s.slug}`);
      slugs.add(s.slug);
      if (spotIds.has(s.id)) issue(`duplicate spot id ${s.id}`);
      spotIds.add(s.id);
      if (!b.busyness[s.id]) issue(`spot ${s.slug} has no busyness entry`);
    }
    for (const id of Object.keys(b.busyness)) {
      if (!spotIds.has(id)) issue(`busyness entry for unknown spot ${id}`);
    }
    for (const h of b.hours) {
      if (!spotIds.has(h.spot_id)) issue(`hours for unknown spot ${h.spot_id}`);
    }
  });
export type Bundle = z.infer<typeof Bundle>;

export const BundlePointer = z.object({
  schema_version: z.number().int(),
  hash: z.string().regex(/^[a-f0-9]{16,64}$/),
  url: z.string().min(1),
  generated_at: IsoDateTime,
});
export type BundlePointer = z.infer<typeof BundlePointer>;

export type BundleParseResult =
  | { ok: true; bundle: Bundle }
  | { ok: false; reason: "schema_mismatch" | "invalid"; detail: string };

export function parseBundle(input: unknown): BundleParseResult {
  const version = z.object({ schema_version: z.number().int() }).safeParse(input);
  if (!version.success) {
    return { ok: false, reason: "invalid", detail: "missing schema_version" };
  }
  if (version.data.schema_version !== BUNDLE_SCHEMA_MAJOR) {
    return {
      ok: false,
      reason: "schema_mismatch",
      detail: `expected ${BUNDLE_SCHEMA_MAJOR}, got ${version.data.schema_version}`,
    };
  }
  const parsed = Bundle.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", detail: z.prettifyError(parsed.error) };
  }
  return { ok: true, bundle: parsed.data };
}
