import {
  AMENITY,
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  type BundleSpot,
  missingV0Fields,
  SEAT_TYPE,
  TABLE_CONFIG,
  type V0Field,
  type V0Input,
} from "@perch/core";
import type {
  spot,
  spot_amenity,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
} from "../schema/index.ts";

export type SpotRow = typeof spot.$inferSelect;
export type SeatTypeRow = typeof spot_seat_type.$inferSelect;
export type TableConfigRow = typeof spot_table_config.$inferSelect;
export type AmenityRow = typeof spot_amenity.$inferSelect;
export type VerificationRow = typeof spot_verification.$inferSelect;
export type PhotoRow = typeof spot_photo.$inferSelect;

export type SpotAssemblyInput = {
  row: SpotRow;
  seatTypes: SeatTypeRow[];
  tableConfigs: TableConfigRow[];
  amenities: AmenityRow[];
  verifications: VerificationRow[];
  approvedPhotos: PhotoRow[];
  hoursUnconfirmed: boolean;
};

/** The completeness-relevant columns of a spot row. */
export function pickV0(r: SpotRow): Omit<V0Input, "has_verification"> {
  return {
    floor: r.floor,
    directions: r.directions,
    eligibility: r.eligibility,
    seat_count: r.seat_count,
    outlet_coverage_pct: r.outlet_coverage_pct,
    noise_policy: r.noise_policy,
    group_work_ok: r.group_work_ok,
    food_policy: r.food_policy,
  };
}

/** Sorts by position in an enum value array so output order never depends on row order. */
function byEnumOrder<T, K extends string>(order: readonly K[], key: (item: T) => K) {
  return (a: T, b: T): number => order.indexOf(key(a)) - order.indexOf(key(b));
}

export type SpotAssemblyResult = { ok: true; spot: BundleSpot } | { ok: false; missing: V0Field[] };

export function toBundleSpot(input: SpotAssemblyInput): SpotAssemblyResult {
  const r = input.row;
  const missing = missingV0Fields({
    ...pickV0(r),
    has_verification: input.verifications.length > 0,
  });
  const {
    directions,
    eligibility,
    seat_count,
    outlet_coverage_pct,
    noise_policy,
    group_work_ok,
    food_policy,
  } = r;
  // The null checks repeat missingV0Fields so TypeScript narrows the row's types.
  if (
    missing.length > 0 ||
    directions === null ||
    eligibility === null ||
    seat_count === null ||
    outlet_coverage_pct === null ||
    noise_policy === null ||
    group_work_ok === null ||
    food_policy === null
  ) {
    return { ok: false, missing };
  }

  // Insert keys in ATTRIBUTE_GROUP order so the serialized bundle is byte-stable.
  const verified: Partial<Record<AttributeGroup, string>> = {};
  for (const group of ATTRIBUTE_GROUP) {
    const v = input.verifications.find((x) => x.attribute_group === group);
    if (v) verified[group] = v.last_verified_at.toISOString();
  }

  return {
    ok: true,
    spot: {
      id: r.id,
      slug: r.slug,
      building_id: r.building_id,
      floor: r.floor,
      official_name: r.official_name,
      common_name: r.common_name,
      lat: r.lat,
      lng: r.lng,
      directions,
      eligibility,
      eligibility_scope: r.eligibility_scope,
      eligibility_verified: r.eligibility_verified,
      entry_method: r.entry_method,
      reservable: r.reservable,
      reservation_system: r.reservation_system,
      reservation_url: r.reservation_url,
      seat_count,
      seat_types: [...input.seatTypes]
        .sort(byEnumOrder(SEAT_TYPE, (s) => s.type))
        .map((s) => ({ type: s.type, count: s.count })),
      table_configs: input.tableConfigs
        .map((t) => t.config)
        .sort(byEnumOrder(TABLE_CONFIG, (c) => c)),
      effective_capacity: r.effective_capacity,
      max_group_size: r.max_group_size,
      spread_out_room: r.spread_out_room,
      outlet_coverage_pct,
      usb_outlets: r.usb_outlets,
      wifi_mbps: r.wifi_mbps,
      cell_signal: r.cell_signal,
      noise_policy,
      natural_light: r.natural_light,
      lighting: r.lighting,
      temperature: r.temperature,
      temperature_consistent: r.temperature_consistent,
      windows_view: r.windows_view,
      calls_ok: r.calls_ok,
      group_work_ok,
      whiteboard: r.whiteboard,
      food_policy,
      amenities: [...input.amenities]
        .sort(byEnumOrder(AMENITY, (a) => a.amenity))
        .map((a) => ({ amenity: a.amenity, walk_minutes: a.walk_minutes })),
      step_free: r.step_free,
      elevator: r.elevator,
      accessible_seating: r.accessible_seating,
      open_past_midnight: r.open_past_midnight,
      staffed_late: r.staffed_late,
      lit_route_to_residences: r.lit_route_to_residences,
      outdoor: r.outdoor,
      seasonal: r.seasonal,
      hours_unconfirmed: input.hoursUnconfirmed,
      verified,
      // A photo without a url has not been through a publish yet, so it is left out.
      photos: [...input.approvedPhotos]
        .sort((a, b) => Number(b.is_cover) - Number(a.is_cover))
        .flatMap((p) =>
          p.url === null
            ? []
            : [{ url: p.url, taken_at: p.taken_at.toISOString(), is_cover: p.is_cover }],
        ),
    },
  };
}
