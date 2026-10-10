import {
  type Bundle,
  type BundleBusyness,
  type BundleHours,
  type BundleSpot,
  parseBundle,
  type SlotConfidence,
} from "../../src/index.ts";

export const SPOT = {
  carrels: "00000000-0000-4000-8000-000000000001",
  reading: "00000000-0000-4000-8000-000000000002",
  sacLounge: "00000000-0000-4000-8000-000000000003",
  union: "00000000-0000-4000-8000-000000000004",
  kelly: "00000000-0000-4000-8000-000000000005",
  grad: "00000000-0000-4000-8000-000000000006",
  unverified: "00000000-0000-4000-8000-000000000007",
  hoursTbd: "00000000-0000-4000-8000-000000000008",
} as const;

const VERIFIED = { identity: "2026-10-05T15:00:00.000Z", hours: "2026-10-06T15:00:00.000Z" };

type Required = Pick<BundleSpot, "id" | "slug" | "building_id" | "official_name">;
function spot(o: Required & Partial<BundleSpot>): BundleSpot {
  return {
    floor: "1",
    common_name: null,
    lat: 40.9155,
    lng: -73.1221,
    directions: "Main entrance.",
    eligibility: "all_students",
    eligibility_scope: null,
    eligibility_verified: true,
    entry_method: "open",
    reservable: false,
    reservation_system: null,
    reservation_url: null,
    seat_count: 100,
    seat_types: [{ type: "table_chair", count: 100 }],
    table_configs: ["large_shared"],
    effective_capacity: null,
    max_group_size: null,
    spread_out_room: null,
    outlet_coverage_pct: 0.3,
    usb_outlets: null,
    wifi_mbps: null,
    cell_signal: null,
    noise_policy: "quiet",
    natural_light: null,
    lighting: null,
    temperature: null,
    temperature_consistent: null,
    windows_view: null,
    calls_ok: null,
    group_work_ok: false,
    whiteboard: false,
    food_policy: "covered_drinks",
    amenities: [],
    step_free: null,
    elevator: null,
    accessible_seating: null,
    open_past_midnight: null,
    staffed_late: null,
    lit_route_to_residences: null,
    outdoor: false,
    seasonal: false,
    hours_unconfirmed: false,
    verified: VERIFIED,
    photos: [],
    ...o,
  };
}

function daily(spot_id: string, opens: string, closes: string, is_exam = false): BundleHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
    spot_id,
    day_of_week,
    opens,
    closes,
    last_entry: null,
    is_exam,
  }));
}

function flat(
  ratio: number,
  confidence: SlotConfidence,
  exam: number | null = null,
): BundleBusyness {
  return {
    regular: Array.from({ length: 168 }, () => ratio),
    exam: exam === null ? null : Array.from({ length: 168 }, () => exam),
    confidence: Array.from({ length: 168 }, () => confidence),
  };
}

export function makeScoringBundle(): Bundle {
  const raw = {
    schema_version: 1,
    generated_at: "2026-10-13T12:00:00.000Z",
    campus: { id: "sbu", name: "Stony Brook University", tz: "America/New_York" },
    term: {
      id: "2026-fall",
      name: "Fall 2026",
      starts: "2026-08-24",
      ends: "2026-12-19",
      exam_starts: "2026-12-10",
      exam_ends: "2026-12-18",
    },
    buildings: [
      { id: "melville-library", name: "Melville Library", lat: 40.9154, lng: -73.1222 },
      { id: "sac", name: "Student Activities Center", lat: 40.9145, lng: -73.1243 },
      { id: "student-union", name: "Student Union", lat: 40.917, lng: -73.1219 },
      { id: "kelly-quad", name: "Kelly Quad", lat: 40.9104, lng: -73.127 },
    ],
    walk: {
      building_ids: ["melville-library", "sac", "student-union", "kelly-quad"],
      minutes: [
        [0, 4, 6, 12],
        [4, 0, 5, 9],
        [6, 5, 0, 10],
        [12, 9, 10, 0],
      ],
      estimated_pairs: [],
    },
    spots: [
      spot({
        id: SPOT.carrels,
        slug: "quiet-carrels",
        building_id: "melville-library",
        official_name: "Quiet Carrels",
        noise_policy: "silent",
        seat_count: 100,
        seat_types: [{ type: "carrel", count: 100 }],
        outlet_coverage_pct: 0.8,
        max_group_size: 1,
        calls_ok: "not_allowed",
        open_past_midnight: false,
      }),
      spot({
        id: SPOT.reading,
        slug: "reading-room",
        building_id: "melville-library",
        official_name: "Reading Room",
        floor: "3",
        noise_policy: "silent",
        seat_count: 120,
        seat_types: [{ type: "table_chair", count: 120 }],
        outlet_coverage_pct: 0.3,
      }),
      spot({
        id: SPOT.sacLounge,
        slug: "sac-lounge",
        building_id: "sac",
        official_name: "SAC Lounge",
        floor: "2",
        noise_policy: "conversational",
        group_work_ok: true,
        calls_ok: "allowed",
        cell_signal: "good",
        outlet_coverage_pct: 0.5,
        seat_count: 40,
        max_group_size: 6,
      }),
      spot({
        id: SPOT.union,
        slug: "union-study",
        building_id: "student-union",
        official_name: "Union Study Room",
        noise_policy: "quiet",
        group_work_ok: true,
        whiteboard: true,
        table_configs: ["small_2_4"],
        max_group_size: 4,
        seat_count: 30,
        outlet_coverage_pct: 0.6,
        calls_ok: "allowed_impractical",
      }),
      spot({
        id: SPOT.kelly,
        slug: "kelly-rcc",
        building_id: "kelly-quad",
        official_name: "Kelly RCC",
        eligibility: "residents_quad",
        eligibility_scope: "Kelly Quad",
        outlet_coverage_pct: 0.5,
      }),
      spot({
        id: SPOT.grad,
        slug: "grad-lounge",
        building_id: "melville-library",
        official_name: "Grad Lounge",
        floor: "4",
        eligibility: "grad_only",
        noise_policy: "silent",
      }),
      spot({
        id: SPOT.unverified,
        slug: "unverified-room",
        building_id: "sac",
        official_name: "Unverified Room",
        eligibility_verified: false,
        noise_policy: "silent",
      }),
      spot({
        id: SPOT.hoursTbd,
        slug: "hours-tbd",
        building_id: "student-union",
        official_name: "Hours TBD",
        floor: "2",
        hours_unconfirmed: true,
        noise_policy: "silent",
      }),
    ],
    hours: [
      ...daily(SPOT.carrels, "08:00", "02:00"),
      ...daily(SPOT.carrels, "00:00", "24:00", true),
      ...daily(SPOT.reading, "00:00", "24:00"),
      ...daily(SPOT.sacLounge, "07:00", "23:00"),
      ...daily(SPOT.union, "08:00", "24:00"),
      ...daily(SPOT.kelly, "00:00", "24:00"),
      ...daily(SPOT.grad, "08:00", "22:00"),
      ...daily(SPOT.unverified, "08:00", "22:00"),
    ],
    busyness: {
      [SPOT.carrels]: flat(0.35, "measured"),
      [SPOT.reading]: flat(0.9, "measured"),
      [SPOT.sacLounge]: flat(0.6, "estimated"),
      [SPOT.union]: flat(0.35, "measured", 0.6),
      [SPOT.kelly]: flat(0.1, "measured"),
      [SPOT.grad]: flat(0.1, "measured"),
      [SPOT.unverified]: flat(0.1, "measured"),
      [SPOT.hoursTbd]: flat(0.35, "none"),
    },
    data_license: "CC BY-SA 4.0",
    attribution: "Perch surveyors",
  };
  const parsed = parseBundle(raw);
  if (!parsed.ok) throw new Error(`scoring fixture invalid: ${parsed.detail}`);
  return parsed.bundle;
}

export function hoursOf(bundle: Bundle, spotId: string): BundleHours[] {
  return bundle.hours.filter((h) => h.spot_id === spotId);
}
