import { z } from "zod";
import { TimeOfDay } from "../bundle.ts";
import {
  Amenity,
  ATTRIBUTE_GROUP,
  CallsOk,
  CellSignal,
  DayType,
  Eligibility,
  EntryMethod,
  FoodPolicy,
  Fullness,
  Lighting,
  NoisePolicy,
  SeatType,
  TableConfig,
  Temperature,
  TimeBlock,
} from "../enums.ts";

/** Every attribute group is a section, plus busyness estimates (no verification stamp). */
export const SURVEY_SECTION = [...ATTRIBUTE_GROUP, "estimates"] as const;
export const SurveySection = z.enum(SURVEY_SECTION);
export type SurveySection = z.infer<typeof SurveySection>;

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const ShortText = z.string().trim().min(1).max(200);
export const Slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase words joined by single dashes");

function distinct(keys: string[]): boolean {
  return new Set(keys).size === keys.length;
}

export const IdentitySection = z.object({
  slug: Slug,
  official_name: ShortText,
  common_name: ShortText.nullable(),
  building_id: z.string().min(1),
  floor: z.string().trim().min(1).max(20),
  lat: Lat,
  lng: Lng,
  directions: z.string().trim().min(1).max(2000).nullable(),
  outdoor: z.boolean(),
  seasonal: z.boolean(),
});
export type IdentitySection = z.infer<typeof IdentitySection>;

export const AccessSection = z.object({
  eligibility: Eligibility,
  eligibility_scope: ShortText.nullable(),
  eligibility_verified: z.boolean(),
  entry_method: EntryMethod.nullable(),
  reservable: z.boolean(),
  reservation_system: ShortText.nullable(),
  reservation_url: z.httpUrl().nullable(),
});
export type AccessSection = z.infer<typeof AccessSection>;

export const HoursRow = z.object({
  day_of_week: z.number().int().min(0).max(6),
  opens: TimeOfDay.refine((t) => t !== "24:00", "opens cannot be 24:00"),
  closes: TimeOfDay,
  last_entry: TimeOfDay.nullable(),
  is_exam: z.boolean(),
});
export type HoursRow = z.infer<typeof HoursRow>;

/** Replaces every hours row of this spot for `term_id`. An empty list clears them (hours unconfirmed). */
export const HoursSection = z.object({
  term_id: z.string().min(1),
  rows: z
    .array(HoursRow)
    .max(56)
    .refine(
      (xs) => distinct(xs.map((r) => `${r.day_of_week}|${r.is_exam}|${r.opens}`)),
      "two rows open at the same time on the same day",
    ),
});
export type HoursSection = z.infer<typeof HoursSection>;

export const SeatingSection = z.object({
  seat_count: z.number().int().positive(),
  seat_types: z
    .array(z.object({ type: SeatType, count: z.number().int().nonnegative() }))
    .refine((xs) => distinct(xs.map((s) => s.type)), "each seat type once"),
  table_configs: z
    .array(TableConfig)
    .refine((xs) => distinct(xs.map((c) => c)), "each table config once"),
  effective_capacity: z.number().int().positive().nullable(),
  max_group_size: z.number().int().positive().nullable(),
  spread_out_room: z.boolean().nullable(),
});
export type SeatingSection = z.infer<typeof SeatingSection>;

export const PowerSection = z.object({
  outlet_coverage_pct: z.number().min(0).max(1),
  usb_outlets: z.boolean().nullable(),
  wifi_mbps: z.number().nonnegative().nullable(),
  cell_signal: CellSignal.nullable(),
});
export type PowerSection = z.infer<typeof PowerSection>;

export const EnvironmentSection = z.object({
  noise_policy: NoisePolicy,
  natural_light: z.boolean().nullable(),
  lighting: Lighting.nullable(),
  temperature: Temperature.nullable(),
  temperature_consistent: z.boolean().nullable(),
  windows_view: z.boolean().nullable(),
});
export type EnvironmentSection = z.infer<typeof EnvironmentSection>;

export const UseFitSection = z.object({
  calls_ok: CallsOk.nullable(),
  group_work_ok: z.boolean(),
  whiteboard: z.boolean().nullable(),
  food_policy: FoodPolicy,
});
export type UseFitSection = z.infer<typeof UseFitSection>;

export const AmenitiesSection = z.object({
  amenities: z
    .array(z.object({ amenity: Amenity, walk_minutes: z.number().int().min(0).max(60) }))
    .refine((xs) => distinct(xs.map((a) => a.amenity)), "each amenity once"),
});
export type AmenitiesSection = z.infer<typeof AmenitiesSection>;

export const AccessibilitySection = z.object({
  step_free: z.boolean().nullable(),
  elevator: z.boolean().nullable(),
  accessible_seating: z.boolean().nullable(),
});
export type AccessibilitySection = z.infer<typeof AccessibilitySection>;

export const LateNightSection = z.object({
  open_past_midnight: z.boolean().nullable(),
  staffed_late: z.boolean().nullable(),
  lit_route_to_residences: z.boolean().nullable(),
});
export type LateNightSection = z.infer<typeof LateNightSection>;

export const EstimateCell = z.object({ day_type: DayType, block: TimeBlock, bucket: Fullness });
export type EstimateCell = z.infer<typeof EstimateCell>;

/** Adds one estimate per cell; the latest estimate per cell wins in the bundle. */
export const EstimatesSection = z.object({
  cells: z
    .array(EstimateCell)
    .min(1)
    .max(8)
    .refine((xs) => distinct(xs.map((c) => `${c.day_type}|${c.block}`)), "each cell once"),
});
export type EstimatesSection = z.infer<typeof EstimatesSection>;

export const SECTION_SCHEMAS = {
  identity: IdentitySection,
  access: AccessSection,
  hours: HoursSection,
  seating: SeatingSection,
  power: PowerSection,
  environment: EnvironmentSection,
  use_fit: UseFitSection,
  amenities: AmenitiesSection,
  accessibility: AccessibilitySection,
  late_night: LateNightSection,
  estimates: EstimatesSection,
} as const satisfies Record<SurveySection, z.ZodType>;

export type SectionPayload<S extends SurveySection> = z.infer<(typeof SECTION_SCHEMAS)[S]>;

/** A section name with its payload, so a switch on `section` narrows `data`. */
export const SectionWrite = z.discriminatedUnion("section", [
  z.object({ section: z.literal("identity"), data: IdentitySection }),
  z.object({ section: z.literal("access"), data: AccessSection }),
  z.object({ section: z.literal("hours"), data: HoursSection }),
  z.object({ section: z.literal("seating"), data: SeatingSection }),
  z.object({ section: z.literal("power"), data: PowerSection }),
  z.object({ section: z.literal("environment"), data: EnvironmentSection }),
  z.object({ section: z.literal("use_fit"), data: UseFitSection }),
  z.object({ section: z.literal("amenities"), data: AmenitiesSection }),
  z.object({ section: z.literal("accessibility"), data: AccessibilitySection }),
  z.object({ section: z.literal("late_night"), data: LateNightSection }),
  z.object({ section: z.literal("estimates"), data: EstimatesSection }),
]);
export type SectionWrite = z.infer<typeof SectionWrite>;
