import type { IdentitySection, SectionWrite } from "@perch/core";

/** Identity for a new draft in a seed building. */
export function identity(overrides: Partial<IdentitySection> = {}): IdentitySection {
  return {
    slug: "frey-lounge",
    official_name: "Frey Hall Lounge",
    common_name: null,
    building_id: "student-union",
    floor: "2",
    lat: 40.9172,
    lng: -73.122,
    directions: "Second floor, left of the stairs.",
    outdoor: false,
    seasonal: false,
    ...overrides,
  };
}

/** Section writes that make a draft from identity() publishable, in a sensible order. */
export const COMPLETING_SECTIONS: SectionWrite[] = [
  {
    section: "access",
    data: {
      eligibility: "all_students",
      eligibility_scope: null,
      eligibility_verified: true,
      entry_method: "open",
      reservable: false,
      reservation_system: null,
      reservation_url: null,
    },
  },
  {
    section: "seating",
    data: {
      seat_count: 30,
      seat_types: [
        { type: "soft", count: 10 },
        { type: "table_chair", count: 20 },
      ],
      table_configs: ["small_2_4"],
      effective_capacity: null,
      max_group_size: 4,
      spread_out_room: false,
    },
  },
  {
    section: "power",
    data: { outlet_coverage_pct: 0.5, usb_outlets: false, wifi_mbps: null, cell_signal: "ok" },
  },
  {
    section: "environment",
    data: {
      noise_policy: "conversational",
      natural_light: true,
      lighting: "bright",
      temperature: "neutral",
      temperature_consistent: true,
      windows_view: true,
    },
  },
  {
    section: "use_fit",
    data: { calls_ok: "allowed", group_work_ok: true, whiteboard: false, food_policy: "food_ok" },
  },
];
