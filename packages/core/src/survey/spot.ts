import { z } from "zod";
import {
  Amenity,
  AttributeGroup,
  CallsOk,
  CellSignal,
  DayType,
  Eligibility,
  EntryMethod,
  FoodPolicy,
  Fullness,
  Lighting,
  NoisePolicy,
  ReviewState,
  SeatType,
  SpotStatus,
  SurveyorRole,
  TableConfig,
  Temperature,
  TimeBlock,
} from "../enums.ts";
import { V0_FIELD, type V0Input } from "./missing.ts";
import { HoursRow } from "./sections.ts";

/*
 * Response shapes. They are deliberately looser than the request schemas
 * (plain strings, no URL checks) so a legacy row never makes a read fail.
 */

const IsoDateTime = z.iso.datetime();

export const SurveyorPublic = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: SurveyorRole,
  active: z.boolean(),
});
export type SurveyorPublic = z.infer<typeof SurveyorPublic>;

export const TermRef = z.object({ id: z.string(), name: z.string() });
export type TermRef = z.infer<typeof TermRef>;

export const SurveyPhoto = z.object({
  id: z.uuid(),
  spot_id: z.uuid(),
  /** Absolute data-site URL, null until the first publish after approval. */
  url: z.string().nullable(),
  taken_at: IsoDateTime,
  is_cover: z.boolean(),
  uploaded_by: z.uuid().nullable(),
  approved: z.boolean(),
  approved_at: IsoDateTime.nullable(),
});
export type SurveyPhoto = z.infer<typeof SurveyPhoto>;

export const SurveyEstimate = z.object({
  day_type: DayType,
  block: TimeBlock,
  bucket: Fullness,
  created_at: IsoDateTime,
});
export type SurveyEstimate = z.infer<typeof SurveyEstimate>;

/** Full editable spot for the survey form. */
export const SurveySpot = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: SpotStatus,
  review_state: ReviewState,
  version: z.number().int().positive(),
  last_edited_by: z.uuid().nullable(),
  /** Display name of last_edited_by, for "edited by" and the conflict view. */
  last_edited_by_name: z.string().nullable(),
  reviewed_by: z.uuid().nullable(),
  reviewed_by_name: z.string().nullable(),
  updated_at: IsoDateTime,
  // identity
  official_name: z.string(),
  common_name: z.string().nullable(),
  building_id: z.string(),
  floor: z.string(),
  lat: z.number(),
  lng: z.number(),
  directions: z.string().nullable(),
  outdoor: z.boolean(),
  seasonal: z.boolean(),
  // access
  eligibility: Eligibility.nullable(),
  eligibility_scope: z.string().nullable(),
  eligibility_verified: z.boolean(),
  entry_method: EntryMethod.nullable(),
  reservable: z.boolean(),
  reservation_system: z.string().nullable(),
  reservation_url: z.string().nullable(),
  // seating
  seat_count: z.number().int().nullable(),
  seat_types: z.array(z.object({ type: SeatType, count: z.number().int() })),
  table_configs: z.array(TableConfig),
  effective_capacity: z.number().int().nullable(),
  max_group_size: z.number().int().nullable(),
  spread_out_room: z.boolean().nullable(),
  // power
  outlet_coverage_pct: z.number().nullable(),
  usb_outlets: z.boolean().nullable(),
  wifi_mbps: z.number().nullable(),
  cell_signal: CellSignal.nullable(),
  // environment
  noise_policy: NoisePolicy.nullable(),
  natural_light: z.boolean().nullable(),
  lighting: Lighting.nullable(),
  temperature: Temperature.nullable(),
  temperature_consistent: z.boolean().nullable(),
  windows_view: z.boolean().nullable(),
  // use fit
  calls_ok: CallsOk.nullable(),
  group_work_ok: z.boolean().nullable(),
  whiteboard: z.boolean().nullable(),
  food_policy: FoodPolicy.nullable(),
  // amenities, accessibility, late night
  amenities: z.array(z.object({ amenity: Amenity, walk_minutes: z.number().int() })),
  step_free: z.boolean().nullable(),
  elevator: z.boolean().nullable(),
  accessible_seating: z.boolean().nullable(),
  open_past_midnight: z.boolean().nullable(),
  staffed_late: z.boolean().nullable(),
  lit_route_to_residences: z.boolean().nullable(),
  /** Current or next term (pickTerm); null when the campus has none. */
  term: TermRef.nullable(),
  /** Hours rows for `term` only. */
  hours: z.array(HoursRow),
  /** Latest estimate per day type and time block. */
  estimates: z.array(SurveyEstimate),
  verified: z.partialRecord(AttributeGroup, IsoDateTime),
  photos: z.array(SurveyPhoto),
  /** Server-computed missingV0Fields, so the publish button needs no extra logic. */
  missing: z.array(z.enum(V0_FIELD)),
});
export type SurveySpot = z.infer<typeof SurveySpot>;

/** The missingV0Fields input for a spot as the API returns it. */
export function v0InputOf(spot: SurveySpot): V0Input {
  return {
    floor: spot.floor,
    directions: spot.directions,
    eligibility: spot.eligibility,
    seat_count: spot.seat_count,
    outlet_coverage_pct: spot.outlet_coverage_pct,
    noise_policy: spot.noise_policy,
    group_work_ok: spot.group_work_ok,
    food_policy: spot.food_policy,
    has_verification: Object.keys(spot.verified).length > 0,
  };
}

export const SpotSummary = z.object({
  id: z.uuid(),
  slug: z.string(),
  official_name: z.string(),
  common_name: z.string().nullable(),
  building_id: z.string(),
  building_name: z.string(),
  status: SpotStatus,
  review_state: ReviewState,
  version: z.number().int().positive(),
  last_edited_by: z.uuid().nullable(),
  last_edited_by_name: z.string().nullable(),
  updated_at: IsoDateTime,
  /** Oldest last_verified_at across groups; null when nothing is verified. */
  oldest_verified_at: IsoDateTime.nullable(),
  /** True when the spot has at least one hours row for the current term. */
  hours_confirmed: z.boolean(),
  /** The approved cover photo, for list thumbnails; null when none. Defaulted so lists stored by older app versions still parse. */
  cover_photo_id: z.uuid().nullable().default(null),
});
export type SpotSummary = z.infer<typeof SpotSummary>;

export const SpotList = z.object({ term: TermRef.nullable(), spots: z.array(SpotSummary) });
export type SpotList = z.infer<typeof SpotList>;
