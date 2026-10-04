import type {
  AttributeGroup,
  IdentitySection,
  SectionWrite,
  SurveyorRole,
  SurveySpot,
} from "@study-spot/core";
import {
  building,
  type Db,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  type TermRow,
  term,
} from "@study-spot/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { HttpError } from "../http.ts";
import type { WriteOutcome } from "../writes/withWrite.ts";
import { loadSurveySpot } from "./load.ts";

export type SpotWriteContext = {
  surveyorId: string;
  role: SurveyorRole;
  now: Date;
  campusId: string;
  term: TermRow | null;
};

/** Loads a spot or throws 404. */
export async function spotOr404(
  db: Db,
  id: string,
  campusId: string,
  termRow: TermRow | null,
): Promise<SurveySpot> {
  const found = await loadSurveySpot(db, id, campusId, termRow);
  if (!found) throw new HttpError(404, { error: "not_found" });
  return found;
}

/** Throws 409 with the current spot when the client edited an older version. */
export function checkVersion(current: SurveySpot, baseVersion: number): void {
  if (current.version !== baseVersion) {
    throw new HttpError(409, { error: "version_conflict", current });
  }
}

/** Another write committed between our read and update: 409 with the current spot. */
async function conflict(db: Db, ctx: SpotWriteContext, spotId: string): Promise<never> {
  throw new HttpError(409, {
    error: "version_conflict",
    current: await spotOr404(db, spotId, ctx.campusId, ctx.term),
  });
}

async function checkIdentity(
  db: Db,
  ctx: SpotWriteContext,
  identity: IdentitySection,
  spotId: string | null,
): Promise<void> {
  const [b] = await db
    .select({ id: building.id })
    .from(building)
    .where(and(eq(building.id, identity.building_id), eq(building.campus_id, ctx.campusId)));
  if (!b)
    throw new HttpError(422, {
      error: "unknown_building",
      message: "That building is not on this campus.",
    });
  const clash = await db
    .select({ id: spot.id })
    .from(spot)
    .where(
      spotId === null
        ? eq(spot.slug, identity.slug)
        : and(eq(spot.slug, identity.slug), ne(spot.id, spotId)),
    );
  if (clash.length > 0)
    throw new HttpError(422, {
      error: "slug_taken",
      message: "Another spot already uses this short name.",
    });
}

/** Stamps survey verification (confidence measured) for the given groups at ctx.now. */
export async function stampVerified(
  db: Db,
  spotId: string,
  groups: readonly AttributeGroup[],
  now: Date,
): Promise<void> {
  if (groups.length === 0) return;
  await db
    .insert(spot_verification)
    .values(
      groups.map((attribute_group) => ({
        spot_id: spotId,
        attribute_group,
        last_verified_at: now,
        source: "survey" as const,
        confidence: "measured" as const,
      })),
    )
    .onConflictDoUpdate({
      target: [spot_verification.spot_id, spot_verification.attribute_group],
      set: { last_verified_at: now, source: "survey", confidence: "measured" },
    });
}

/** Creates a draft from the identity section. */
export async function createDraft(
  db: Db,
  ctx: SpotWriteContext,
  identity: IdentitySection,
): Promise<WriteOutcome<SurveySpot>> {
  await checkIdentity(db, ctx, identity, null);
  const [created] = await db
    .insert(spot)
    .values({
      ...identity,
      last_edited_by: ctx.surveyorId,
      created_at: ctx.now,
      updated_at: ctx.now,
    })
    .returning({ id: spot.id });
  if (!created) throw new Error("spot insert returned nothing");
  await stampVerified(db, created.id, ["identity"], ctx.now);
  const after = await spotOr404(db, created.id, ctx.campusId, ctx.term);
  return {
    status: 201,
    body: after,
    audit: { entity: "spot", entity_id: after.id, action: "create", before: null, after },
    dirty: false,
  };
}

/**
 * Applies one section. Bumps version, sets updated_at and last_edited_by, resets
 * review_state, and stamps verification for the section's group (not estimates).
 */
export async function writeSection(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
  baseVersion: number,
  write: SectionWrite,
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  checkVersion(before, baseVersion);

  let columns: Partial<typeof spot.$inferInsert> = {};
  switch (write.section) {
    case "identity":
      await checkIdentity(db, ctx, write.data, spotId);
      columns = write.data;
      break;
    case "hours": {
      const [t] = await db
        .select({ id: term.id })
        .from(term)
        .where(and(eq(term.id, write.data.term_id), eq(term.campus_id, ctx.campusId)));
      if (!t)
        throw new HttpError(422, {
          error: "unknown_term",
          message: "That term is not on this campus.",
        });
      break;
    }
    case "seating": {
      const { seat_types: _seatTypes, table_configs: _tableConfigs, ...rest } = write.data;
      columns = rest;
      break;
    }
    case "access":
    case "power":
    case "environment":
    case "use_fit":
    case "accessibility":
    case "late_night":
      columns = write.data;
      break;
    case "amenities":
    case "estimates":
      break;
  }

  const bumped = await db
    .update(spot)
    .set({
      ...columns,
      version: sql`${spot.version} + 1`,
      updated_at: ctx.now,
      last_edited_by: ctx.surveyorId,
      review_state: "unreviewed",
      reviewed_by: null,
    })
    .where(and(eq(spot.id, spotId), eq(spot.version, baseVersion)))
    .returning({ id: spot.id });
  if (bumped.length === 0) await conflict(db, ctx, spotId);

  switch (write.section) {
    case "hours":
      await db
        .delete(spot_hours)
        .where(and(eq(spot_hours.spot_id, spotId), eq(spot_hours.term_id, write.data.term_id)));
      if (write.data.rows.length > 0) {
        await db
          .insert(spot_hours)
          .values(
            write.data.rows.map((r) => ({ ...r, spot_id: spotId, term_id: write.data.term_id })),
          );
      }
      break;
    case "seating":
      await db.delete(spot_seat_type).where(eq(spot_seat_type.spot_id, spotId));
      if (write.data.seat_types.length > 0) {
        await db
          .insert(spot_seat_type)
          .values(write.data.seat_types.map((s) => ({ ...s, spot_id: spotId })));
      }
      await db.delete(spot_table_config).where(eq(spot_table_config.spot_id, spotId));
      if (write.data.table_configs.length > 0) {
        await db
          .insert(spot_table_config)
          .values(write.data.table_configs.map((config) => ({ config, spot_id: spotId })));
      }
      break;
    case "amenities":
      await db.delete(spot_amenity).where(eq(spot_amenity.spot_id, spotId));
      if (write.data.amenities.length > 0) {
        await db
          .insert(spot_amenity)
          .values(write.data.amenities.map((a) => ({ ...a, spot_id: spotId })));
      }
      break;
    case "estimates":
      await db.insert(spot_estimate).values(
        write.data.cells.map((c) => ({
          ...c,
          spot_id: spotId,
          surveyor_id: ctx.surveyorId,
          created_at: ctx.now,
        })),
      );
      break;
    default:
      break;
  }

  if (write.section !== "estimates") await stampVerified(db, spotId, [write.section], ctx.now);

  const after = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: `section.${write.section}`, before, after },
    dirty: after.status === "published",
  };
}

/** Re-stamps verification for groups without changing data or version. */
export async function verifyGroups(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
  baseVersion: number,
  groups: readonly AttributeGroup[],
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  checkVersion(before, baseVersion);
  // No-op update that locks the row and re-checks the version, so a section
  // write committing since the read causes a 409 instead of a stale stamp.
  const locked = await db
    .update(spot)
    .set({ version: sql`${spot.version}` })
    .where(and(eq(spot.id, spotId), eq(spot.version, baseVersion)))
    .returning({ id: spot.id });
  if (locked.length === 0) await conflict(db, ctx, spotId);
  await stampVerified(db, spotId, groups, ctx.now);
  const after = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "verify", before, after },
    dirty: after.status === "published",
  };
}

/** Publishes when complete, else 422 with the missing fields. */
export async function publishSpot(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  if (before.missing.length > 0) {
    throw new HttpError(422, { error: "incomplete", missing: before.missing });
  }
  await db.update(spot).set({ status: "published" }).where(eq(spot.id, spotId));
  const after = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "publish", before, after },
    dirty: true,
  };
}

/** Admin only: back to draft, so the next bundle drops the spot. */
export async function unpublishSpot(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
): Promise<WriteOutcome<SurveySpot>> {
  if (ctx.role !== "admin") throw new HttpError(403, { error: "forbidden" });
  const before = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  await db.update(spot).set({ status: "draft" }).where(eq(spot.id, spotId));
  const after = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "unpublish", before, after },
    dirty: before.status === "published",
  };
}

/** Marks reviewed. Admins always may; a surveyor may not review their own last edit. */
export async function reviewSpot(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
  baseVersion: number,
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  checkVersion(before, baseVersion);
  if (ctx.role !== "admin" && before.last_edited_by === ctx.surveyorId) {
    throw new HttpError(403, { error: "forbidden", message: "someone else reviews your edits" });
  }
  const reviewed = await db
    .update(spot)
    .set({ review_state: "reviewed", reviewed_by: ctx.surveyorId })
    .where(and(eq(spot.id, spotId), eq(spot.version, baseVersion)))
    .returning({ id: spot.id });
  if (reviewed.length === 0) await conflict(db, ctx, spotId);
  const after = await spotOr404(db, spotId, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "review", before, after },
    dirty: false,
  };
}
