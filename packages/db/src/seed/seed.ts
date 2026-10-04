import type { Db } from "../client.ts";
import {
  building,
  campus,
  forecast,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  surveyor,
  term,
  walk_matrix,
} from "../schema/index.ts";
import { SEED_ADMIN, SEED_BUILDINGS, SEED_CAMPUS, SEED_TERMS, SEED_WALK } from "./data.ts";

export type SeedSpotSlug =
  | "central-reading-room"
  | "north-reading-room"
  | "sac-lounge"
  | "kelly-rcc"
  | "union-draft";

export type SeedIds = { adminId: string; spotIds: Record<SeedSpotSlug, string> };

const VERIFIED_AT = new Date("2026-10-01T15:00:00Z");
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function weekHours(spotId: string, opens: string, closes: string) {
  return ALL_DAYS.map((day_of_week) => ({
    spot_id: spotId,
    term_id: "2026-fall",
    day_of_week,
    opens,
    closes,
    is_exam: false,
  }));
}

/** Inserts SAMPLE data. Throws if the campus already exists. */
export async function seed(db: Db): Promise<SeedIds> {
  return db.transaction(async (tx) => {
    await tx.insert(campus).values(SEED_CAMPUS);
    await tx.insert(term).values(SEED_TERMS);
    await tx.insert(building).values(SEED_BUILDINGS);
    await tx.insert(walk_matrix).values(
      SEED_BUILDINGS.flatMap((from, i) =>
        SEED_BUILDINGS.map((to, j) => ({
          from_building_id: from.id,
          to_building_id: to.id,
          minutes: SEED_WALK[i]?.[j] ?? 0,
        })),
      ),
    );

    const [admin] = await tx.insert(surveyor).values(SEED_ADMIN).returning({ id: surveyor.id });
    if (!admin) throw new Error("failed to insert seed admin");

    const inserted = await tx
      .insert(spot)
      .values([
        {
          slug: "central-reading-room",
          building_id: "melville-library",
          floor: "3",
          official_name: "Central Reading Room",
          lat: 40.9155,
          lng: -73.1221,
          directions: "SAMPLE: main entrance, stairs to floor 3, straight ahead.",
          status: "published",
          eligibility: "all_students",
          eligibility_verified: true,
          entry_method: "open",
          seat_count: 120,
          max_group_size: 1,
          spread_out_room: true,
          outlet_coverage_pct: 0.6,
          noise_policy: "silent",
          natural_light: true,
          lighting: "bright",
          calls_ok: "not_allowed",
          group_work_ok: false,
          food_policy: "covered_drinks",
          step_free: true,
          elevator: true,
          open_past_midnight: false,
        },
        {
          slug: "north-reading-room",
          building_id: "melville-library",
          floor: "1",
          official_name: "North Reading Room",
          lat: 40.9158,
          lng: -73.1222,
          directions: "SAMPLE: main entrance, turn left past the circulation desk.",
          status: "published",
          eligibility: "all_students",
          eligibility_verified: true,
          entry_method: "open",
          seat_count: 60,
          max_group_size: 4,
          outlet_coverage_pct: 0.4,
          noise_policy: "quiet",
          group_work_ok: false,
          food_policy: "covered_drinks",
        },
        {
          slug: "sac-lounge",
          building_id: "sac",
          floor: "2",
          official_name: "SAC Second Floor Lounge",
          lat: 40.9146,
          lng: -73.1242,
          directions: "SAMPLE: main stairs to floor 2, lounge on the right.",
          status: "published",
          eligibility: "all_students",
          eligibility_verified: true,
          entry_method: "open",
          seat_count: 40,
          max_group_size: 8,
          outlet_coverage_pct: 0.3,
          noise_policy: "group_friendly",
          calls_ok: "allowed",
          group_work_ok: true,
          whiteboard: false,
          food_policy: "food_ok",
        },
        {
          slug: "kelly-rcc",
          building_id: "kelly-quad",
          floor: "1",
          official_name: "Kelly Quad RCC",
          lat: 40.9105,
          lng: -73.1269,
          directions: "SAMPLE: ground floor, card swipe door by the mailroom.",
          status: "published",
          eligibility: "residents_quad",
          eligibility_scope: "Kelly Quad",
          eligibility_verified: false,
          entry_method: "card_swipe",
          seat_count: 24,
          max_group_size: 2,
          outlet_coverage_pct: 1,
          noise_policy: "quiet",
          group_work_ok: false,
          food_policy: "none",
        },
        {
          slug: "union-draft",
          building_id: "student-union",
          floor: "1",
          official_name: "Union Lobby Tables",
          lat: 40.9171,
          lng: -73.1218,
          noise_policy: "conversational",
        },
      ])
      .returning({ id: spot.id, slug: spot.slug });

    const idOf = (slug: SeedSpotSlug): string => {
      const found = inserted.find((s) => s.slug === slug);
      if (!found) throw new Error(`seed spot missing: ${slug}`);
      return found.id;
    };
    const spotIds: Record<SeedSpotSlug, string> = {
      "central-reading-room": idOf("central-reading-room"),
      "north-reading-room": idOf("north-reading-room"),
      "sac-lounge": idOf("sac-lounge"),
      "kelly-rcc": idOf("kelly-rcc"),
      "union-draft": idOf("union-draft"),
    };
    const crr = spotIds["central-reading-room"];

    await tx
      .insert(spot_hours)
      .values([
        ...weekHours(crr, "08:00", "02:00"),
        ...weekHours(spotIds["north-reading-room"], "08:00", "22:00"),
        ...weekHours(spotIds["sac-lounge"], "07:00", "24:00"),
        ...weekHours(spotIds["kelly-rcc"], "00:00", "24:00"),
      ]);

    await tx.insert(spot_seat_type).values({ spot_id: crr, type: "table_chair", count: 120 });
    await tx.insert(spot_table_config).values({ spot_id: crr, config: "large_shared" });
    await tx.insert(spot_amenity).values({ spot_id: crr, amenity: "bathroom", walk_minutes: 1 });

    // Sample data is not official: every row is an estimated survey verification.
    const published: SeedSpotSlug[] = [
      "central-reading-room",
      "north-reading-room",
      "sac-lounge",
      "kelly-rcc",
    ];
    await tx.insert(spot_verification).values(
      published.flatMap((slug) =>
        (["identity", "hours"] as const).map((attribute_group) => ({
          spot_id: spotIds[slug],
          attribute_group,
          last_verified_at: VERIFIED_AT,
          source: "survey" as const,
          confidence: "estimated" as const,
        })),
      ),
    );

    await tx.insert(spot_photo).values([
      {
        spot_id: crr,
        url: "https://example.org/sample/crr-1.jpg",
        taken_at: VERIFIED_AT,
        is_cover: true,
        uploaded_by: admin.id,
        approved_by: admin.id,
        approved_at: VERIFIED_AT,
      },
      {
        spot_id: crr,
        url: "https://example.org/sample/crr-2-unapproved.jpg",
        taken_at: VERIFIED_AT,
        uploaded_by: admin.id,
      },
    ]);

    // Tuesday (dow 1) 14:00 and 15:00 measured; everything else falls back.
    await tx.insert(forecast).values([
      { spot_id: crr, profile: "regular", day_of_week: 1, hour: 14, ratio: 0.7 },
      { spot_id: crr, profile: "regular", day_of_week: 1, hour: 15, ratio: 0.75 },
    ]);
    await tx.insert(spot_estimate).values({
      spot_id: crr,
      day_type: "weekday",
      block: "afternoon",
      bucket: "filling",
      surveyor_id: admin.id,
    });

    return { adminId: admin.id, spotIds };
  });
}
