import {
  BUNDLE_SCHEMA_MAJOR,
  Bundle,
  type BundleBusyness,
  BundleHours,
  BundleSpot,
  campusDate,
  DATA_ATTRIBUTION,
  DATA_LICENSE,
} from "@perch/core";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { z } from "zod";
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
  term,
  walk_matrix,
} from "../schema/index.ts";
import { assembleBusyness } from "./busyness.ts";
import { toBundleSpot } from "./spot.ts";
import { pickTerm } from "./term.ts";
import { assembleWalk } from "./walk.ts";

export class NoTermError extends Error {
  override name = "NoTermError";
}
export class UnknownCampusError extends Error {
  override name = "UnknownCampusError";
}

export type BuildBundleResult = { bundle: Bundle; warnings: string[] };

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** Plain code-unit string order, independent of locale. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "unknown issue";
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export async function buildBundle(db: Db, campusId: string, now: Date): Promise<BuildBundleResult> {
  const [campusRow] = await db.select().from(campus).where(eq(campus.id, campusId));
  if (!campusRow) throw new UnknownCampusError(`unknown campus ${campusId}`);

  const terms = await db.select().from(term).where(eq(term.campus_id, campusId));
  const currentTerm = pickTerm(terms, campusDate(now, campusRow.tz));
  if (!currentTerm) throw new NoTermError(`no current or upcoming term for ${campusId}`);

  const buildings = await db.select().from(building).where(eq(building.campus_id, campusId));
  const buildingIds = buildings.map((b) => b.id);
  const walkRows =
    buildingIds.length === 0
      ? []
      : await db
          .select()
          .from(walk_matrix)
          .where(inArray(walk_matrix.from_building_id, buildingIds));

  const spotRows =
    buildingIds.length === 0
      ? []
      : await db
          .select()
          .from(spot)
          .where(and(eq(spot.status, "published"), inArray(spot.building_id, buildingIds)));
  const spotIds = spotRows.map((s) => s.id);
  const has = spotIds.length > 0;

  const [seatTypes, tableConfigs, amenities, verifications, photos, hours, forecasts, estimates] =
    await Promise.all([
      has ? db.select().from(spot_seat_type).where(inArray(spot_seat_type.spot_id, spotIds)) : [],
      has
        ? db.select().from(spot_table_config).where(inArray(spot_table_config.spot_id, spotIds))
        : [],
      has ? db.select().from(spot_amenity).where(inArray(spot_amenity.spot_id, spotIds)) : [],
      has
        ? db.select().from(spot_verification).where(inArray(spot_verification.spot_id, spotIds))
        : [],
      has
        ? db
            .select()
            .from(spot_photo)
            .where(and(inArray(spot_photo.spot_id, spotIds), isNotNull(spot_photo.approved_at)))
            .orderBy(spot_photo.taken_at, spot_photo.id)
        : [],
      has
        ? db
            .select()
            .from(spot_hours)
            .where(
              and(inArray(spot_hours.spot_id, spotIds), eq(spot_hours.term_id, currentTerm.id)),
            )
        : [],
      has ? db.select().from(forecast).where(inArray(forecast.spot_id, spotIds)) : [],
      has ? db.select().from(spot_estimate).where(inArray(spot_estimate.spot_id, spotIds)) : [],
    ]);

  const bySpot = <T extends { spot_id: string }>(rows: T[]) => groupBy(rows, (r) => r.spot_id);
  const seatMap = bySpot(seatTypes);
  const tableMap = bySpot(tableConfigs);
  const amenityMap = bySpot(amenities);
  const verifyMap = bySpot(verifications);
  const photoMap = bySpot(photos);
  const hoursMap = bySpot(hours);
  const forecastMap = bySpot(forecasts);
  const estimateMap = bySpot(estimates);

  const warnings: string[] = [];
  const spots: BundleSpot[] = [];
  const validHours: BundleHours[] = [];
  const busyness: Record<string, BundleBusyness> = {};

  for (const row of [...spotRows].sort((a, b) => cmp(a.slug, b.slug))) {
    // Validate per row so one bad record skips one spot or row, not the whole publish.
    const rowWarnings: string[] = [];
    const spotHours: BundleHours[] = [];
    for (const h of hoursMap.get(row.id) ?? []) {
      const parsed = BundleHours.safeParse({
        spot_id: h.spot_id,
        day_of_week: h.day_of_week,
        opens: h.opens,
        closes: h.closes,
        last_entry: h.last_entry,
        is_exam: h.is_exam,
      });
      if (parsed.success) spotHours.push(parsed.data);
      else
        rowWarnings.push(
          `skipped ${row.slug} hours day ${h.day_of_week}: invalid ${firstIssue(parsed.error)}`,
        );
    }

    const result = toBundleSpot({
      row,
      seatTypes: seatMap.get(row.id) ?? [],
      tableConfigs: tableMap.get(row.id) ?? [],
      amenities: amenityMap.get(row.id) ?? [],
      verifications: verifyMap.get(row.id) ?? [],
      approvedPhotos: photoMap.get(row.id) ?? [],
      hoursUnconfirmed: spotHours.length === 0,
    });
    if (!result.ok) {
      warnings.push(`skipped ${row.slug}: missing ${result.missing.join(", ")}`);
      continue;
    }
    const parsedSpot = BundleSpot.safeParse(result.spot);
    if (!parsedSpot.success) {
      warnings.push(`skipped ${row.slug}: invalid ${firstIssue(parsedSpot.error)}`);
      continue;
    }
    warnings.push(...rowWarnings);
    spots.push(parsedSpot.data);
    validHours.push(...spotHours);
    busyness[row.id] = assembleBusyness(
      forecastMap.get(row.id) ?? [],
      estimateMap.get(row.id) ?? [],
    );
  }

  // Final invariant check: per-spot problems were filtered above, so this only
  // fails on campus-level bugs (buildings, walk matrix, term).
  const bundle = Bundle.parse({
    schema_version: BUNDLE_SCHEMA_MAJOR,
    generated_at: now.toISOString(),
    campus: { id: campusRow.id, name: campusRow.name, tz: campusRow.tz },
    term: {
      id: currentTerm.id,
      name: currentTerm.name,
      starts: currentTerm.starts,
      ends: currentTerm.ends,
      exam_starts: currentTerm.exam_starts,
      exam_ends: currentTerm.exam_ends,
    },
    buildings: [...buildings]
      .sort((a, b) => cmp(a.id, b.id))
      .map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng })),
    walk: assembleWalk(buildings, walkRows),
    spots,
    hours: validHours.sort(
      (a, b) =>
        cmp(a.spot_id, b.spot_id) ||
        a.day_of_week - b.day_of_week ||
        Number(a.is_exam) - Number(b.is_exam) ||
        cmp(a.opens, b.opens),
    ),
    busyness,
    data_license: DATA_LICENSE,
    attribution: DATA_ATTRIBUTION,
  });

  return { bundle, warnings };
}
