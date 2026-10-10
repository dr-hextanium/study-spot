import {
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  campusDate,
  missingV0Fields,
  type SpotList,
  type SurveyEstimate,
  type SurveySpot,
} from "@perch/core";
import {
  building,
  campus,
  type Db,
  pickTerm,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  surveyor,
  type TermRow,
  term,
} from "@perch/db";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";

/** The campus's current term, else the next one, else null (pickTerm in campus local time). */
export async function currentTerm(db: Db, campusId: string, now: Date): Promise<TermRow | null> {
  const [c] = await db.select().from(campus).where(eq(campus.id, campusId));
  if (!c) return null;
  const terms = await db.select().from(term).where(eq(term.campus_id, campusId));
  return pickTerm(terms, campusDate(now, c.tz));
}

/** Display names for surveyor ids (missing ids are left out). */
async function namesOf(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: surveyor.id, name: surveyor.display_name })
    .from(surveyor)
    .where(inArray(surveyor.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Full editable spot with child rows, or null when the id is unknown. */
export async function loadSurveySpot(
  db: Db,
  id: string,
  campusId: string,
  currentTermRow: TermRow | null,
): Promise<SurveySpot | null> {
  const [found] = await db
    .select({ spot })
    .from(spot)
    .innerJoin(building, eq(building.id, spot.building_id))
    .where(and(eq(spot.id, id), eq(building.campus_id, campusId)));
  if (!found) return null;
  const row = found.spot;

  const [seatTypes, tableConfigs, amenities, verifications, photos, hours, estimates, names] =
    await Promise.all([
      db.select().from(spot_seat_type).where(eq(spot_seat_type.spot_id, id)),
      db.select().from(spot_table_config).where(eq(spot_table_config.spot_id, id)),
      db.select().from(spot_amenity).where(eq(spot_amenity.spot_id, id)),
      db.select().from(spot_verification).where(eq(spot_verification.spot_id, id)),
      db
        .select()
        .from(spot_photo)
        .where(eq(spot_photo.spot_id, id))
        .orderBy(asc(spot_photo.taken_at), asc(spot_photo.id)),
      currentTermRow === null
        ? []
        : db
            .select()
            .from(spot_hours)
            .where(and(eq(spot_hours.spot_id, id), eq(spot_hours.term_id, currentTermRow.id)))
            .orderBy(asc(spot_hours.day_of_week), asc(spot_hours.is_exam), asc(spot_hours.opens)),
      db
        .select()
        .from(spot_estimate)
        .where(eq(spot_estimate.spot_id, id))
        .orderBy(desc(spot_estimate.created_at)),
      namesOf(db, [row.last_edited_by, row.reviewed_by]),
    ]);

  const verified: Partial<Record<AttributeGroup, string>> = {};
  for (const group of ATTRIBUTE_GROUP) {
    const v = verifications.find((x) => x.attribute_group === group);
    if (v) verified[group] = v.last_verified_at.toISOString();
  }

  const latest = new Map<string, SurveyEstimate>();
  for (const e of estimates) {
    const key = `${e.day_type}|${e.block}`;
    if (!latest.has(key)) {
      latest.set(key, {
        day_type: e.day_type,
        block: e.block,
        bucket: e.bucket,
        created_at: e.created_at.toISOString(),
      });
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    review_state: row.review_state,
    version: row.version,
    last_edited_by: row.last_edited_by,
    last_edited_by_name: row.last_edited_by ? (names.get(row.last_edited_by) ?? null) : null,
    reviewed_by: row.reviewed_by,
    reviewed_by_name: row.reviewed_by ? (names.get(row.reviewed_by) ?? null) : null,
    updated_at: row.updated_at.toISOString(),
    official_name: row.official_name,
    common_name: row.common_name,
    building_id: row.building_id,
    floor: row.floor,
    lat: row.lat,
    lng: row.lng,
    directions: row.directions,
    outdoor: row.outdoor,
    seasonal: row.seasonal,
    eligibility: row.eligibility,
    eligibility_scope: row.eligibility_scope,
    eligibility_verified: row.eligibility_verified,
    entry_method: row.entry_method,
    reservable: row.reservable,
    reservation_system: row.reservation_system,
    reservation_url: row.reservation_url,
    seat_count: row.seat_count,
    seat_types: seatTypes.map((s) => ({ type: s.type, count: s.count })),
    table_configs: tableConfigs.map((t) => t.config),
    effective_capacity: row.effective_capacity,
    max_group_size: row.max_group_size,
    spread_out_room: row.spread_out_room,
    outlet_coverage_pct: row.outlet_coverage_pct,
    usb_outlets: row.usb_outlets,
    wifi_mbps: row.wifi_mbps,
    cell_signal: row.cell_signal,
    noise_policy: row.noise_policy,
    natural_light: row.natural_light,
    lighting: row.lighting,
    temperature: row.temperature,
    temperature_consistent: row.temperature_consistent,
    windows_view: row.windows_view,
    calls_ok: row.calls_ok,
    group_work_ok: row.group_work_ok,
    whiteboard: row.whiteboard,
    food_policy: row.food_policy,
    amenities: amenities.map((a) => ({ amenity: a.amenity, walk_minutes: a.walk_minutes })),
    step_free: row.step_free,
    elevator: row.elevator,
    accessible_seating: row.accessible_seating,
    open_past_midnight: row.open_past_midnight,
    staffed_late: row.staffed_late,
    lit_route_to_residences: row.lit_route_to_residences,
    term: currentTermRow ? { id: currentTermRow.id, name: currentTermRow.name } : null,
    hours: hours.map((h) => ({
      day_of_week: h.day_of_week,
      opens: h.opens,
      closes: h.closes,
      last_entry: h.last_entry,
      is_exam: h.is_exam,
    })),
    estimates: [...latest.values()],
    verified,
    photos: photos.map((p) => ({
      id: p.id,
      spot_id: p.spot_id,
      url: p.url,
      taken_at: p.taken_at.toISOString(),
      is_cover: p.is_cover,
      uploaded_by: p.uploaded_by,
      approved: p.approved_at !== null,
      approved_at: p.approved_at ? p.approved_at.toISOString() : null,
    })),
    missing: missingV0Fields({
      floor: row.floor,
      directions: row.directions,
      eligibility: row.eligibility,
      seat_count: row.seat_count,
      outlet_coverage_pct: row.outlet_coverage_pct,
      noise_policy: row.noise_policy,
      group_work_ok: row.group_work_ok,
      food_policy: row.food_policy,
      has_verification: verifications.length > 0,
    }),
  };
}

/** Survey home list for one campus, sorted by name. */
export async function listSurveySpots(db: Db, campusId: string, now: Date): Promise<SpotList> {
  const termRow = await currentTerm(db, campusId, now);
  const rows = await db
    .select({ spot, building_name: building.name })
    .from(spot)
    .innerJoin(building, eq(building.id, spot.building_id))
    .where(eq(building.campus_id, campusId))
    .orderBy(asc(spot.official_name), asc(spot.id));
  const verifications = await db
    .select({ spot_id: spot_verification.spot_id, at: spot_verification.last_verified_at })
    .from(spot_verification);
  const hours =
    termRow === null
      ? []
      : await db
          .select({ spot_id: spot_hours.spot_id })
          .from(spot_hours)
          .where(eq(spot_hours.term_id, termRow.id));

  // Only this campus, only an approved cover whose bytes are stored.
  const covers = await db
    .select({ spot_id: spot_photo.spot_id, id: spot_photo.id })
    .from(spot_photo)
    .innerJoin(spot, eq(spot.id, spot_photo.spot_id))
    .innerJoin(building, eq(building.id, spot.building_id))
    .where(
      and(
        eq(building.campus_id, campusId),
        eq(spot_photo.is_cover, true),
        isNotNull(spot_photo.approved_at),
        isNotNull(spot_photo.blob_sha256),
      ),
    );
  const coverOf = new Map(covers.map((c) => [c.spot_id, c.id]));

  const oldest = new Map<string, Date>();
  for (const v of verifications) {
    const prev = oldest.get(v.spot_id);
    if (!prev || v.at < prev) oldest.set(v.spot_id, v.at);
  }
  const withHours = new Set(hours.map((h) => h.spot_id));
  const names = await namesOf(
    db,
    rows.map((r) => r.spot.last_edited_by),
  );

  return {
    term: termRow ? { id: termRow.id, name: termRow.name } : null,
    spots: rows.map(({ spot: s, building_name }) => ({
      id: s.id,
      slug: s.slug,
      official_name: s.official_name,
      common_name: s.common_name,
      building_id: s.building_id,
      building_name,
      status: s.status,
      review_state: s.review_state,
      version: s.version,
      last_edited_by: s.last_edited_by,
      last_edited_by_name: s.last_edited_by ? (names.get(s.last_edited_by) ?? null) : null,
      updated_at: s.updated_at.toISOString(),
      oldest_verified_at: oldest.get(s.id)?.toISOString() ?? null,
      hours_confirmed: withHours.has(s.id),
      cover_photo_id: coverOf.get(s.id) ?? null,
    })),
  };
}
