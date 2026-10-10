import type { SurveySpot } from "@perch/core";
import { building, type Db, photo_blob, spot, spot_photo } from "@perch/db";
import { and, eq, isNull, notExists } from "drizzle-orm";
import { HttpError } from "../http.ts";
import { type SpotWriteContext, spotOr404 } from "../spots/write.ts";
import type { WriteOutcome } from "../writes/withWrite.ts";

export type PhotoRow = typeof spot_photo.$inferSelect;

/** Loads a photo or throws 404; a photo whose spot is in another campus is 404. */
export async function photoOr404(db: Db, id: string, campusId: string): Promise<PhotoRow> {
  const [found] = await db
    .select({ photo: spot_photo })
    .from(spot_photo)
    .innerJoin(spot, eq(spot.id, spot_photo.spot_id))
    .innerJoin(building, eq(building.id, spot.building_id))
    .where(and(eq(spot_photo.id, id), eq(building.campus_id, campusId)));
  if (!found) throw new HttpError(404, { error: "not_found" });
  return found.photo;
}

/** Adds an unapproved photo whose bytes are already in the PhotoStore. */
export async function addPhoto(
  db: Db,
  ctx: SpotWriteContext,
  opts: { spotId: string; sha256: string; takenAt: Date },
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, opts.spotId, ctx.campusId, ctx.term);
  const [row] = await db
    .insert(spot_photo)
    .values({
      spot_id: opts.spotId,
      blob_sha256: opts.sha256,
      taken_at: opts.takenAt,
      uploaded_by: ctx.surveyorId,
    })
    .returning({ id: spot_photo.id });
  if (!row) throw new Error("photo insert returned nothing");
  const after = await spotOr404(db, opts.spotId, ctx.campusId, ctx.term);
  return {
    status: 201,
    body: after,
    audit: { entity: "spot_photo", entity_id: row.id, action: "upload", before, after },
    dirty: false,
  };
}

/** Makes one photo the cover, unsetting the previous cover first (one cover per spot). */
export async function setCover(
  db: Db,
  ctx: SpotWriteContext,
  photoId: string,
): Promise<WriteOutcome<SurveySpot>> {
  const photo = await photoOr404(db, photoId, ctx.campusId);
  const before = await spotOr404(db, photo.spot_id, ctx.campusId, ctx.term);
  await db
    .update(spot_photo)
    .set({ is_cover: false })
    .where(and(eq(spot_photo.spot_id, photo.spot_id), eq(spot_photo.is_cover, true)));
  await db.update(spot_photo).set({ is_cover: true }).where(eq(spot_photo.id, photoId));
  const after = await spotOr404(db, photo.spot_id, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot_photo", entity_id: photoId, action: "cover", before, after },
    dirty: after.status === "published",
  };
}

/** Admins approve anything; a surveyor approves only photos someone else uploaded. */
export async function approvePhoto(
  db: Db,
  ctx: SpotWriteContext,
  photoId: string,
): Promise<WriteOutcome<SurveySpot>> {
  const photo = await photoOr404(db, photoId, ctx.campusId);
  if (ctx.role !== "admin" && photo.uploaded_by === ctx.surveyorId) {
    throw new HttpError(403, { error: "forbidden", message: "someone else approves your photos" });
  }
  const before = await spotOr404(db, photo.spot_id, ctx.campusId, ctx.term);
  await db
    .update(spot_photo)
    .set({ approved_by: ctx.surveyorId, approved_at: ctx.now })
    .where(eq(spot_photo.id, photoId));
  const after = await spotOr404(db, photo.spot_id, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot_photo", entity_id: photoId, action: "approve", before, after },
    dirty: after.status === "published",
  };
}

/**
 * Admin only, pending photos only (the admin screen offers Reject in the pending
 * queue alone). An approved photo may have no copy but the data site, so it is a
 * 409. Deletes the photo row and, when no other photo row uses the same bytes
 * (blobs are content-addressed and shared), the blob with its bytes.
 */
export async function rejectPhoto(
  db: Db,
  ctx: SpotWriteContext,
  photoId: string,
): Promise<WriteOutcome<SurveySpot>> {
  if (ctx.role !== "admin") throw new HttpError(403, { error: "forbidden" });
  const photo = await photoOr404(db, photoId, ctx.campusId);
  const before = await spotOr404(db, photo.spot_id, ctx.campusId, ctx.term);
  // Re-checked in the DELETE, in case an approval landed after the read above.
  const deleted = await db
    .delete(spot_photo)
    .where(and(eq(spot_photo.id, photoId), isNull(spot_photo.approved_at)))
    .returning({ id: spot_photo.id });
  if (deleted.length === 0) {
    throw new HttpError(409, {
      error: "invalid_request",
      message: "Approved photos cannot be rejected.",
    });
  }
  if (photo.blob_sha256 !== null) {
    await db
      .delete(photo_blob)
      .where(
        and(
          eq(photo_blob.sha256, photo.blob_sha256),
          notExists(
            db
              .select({ id: spot_photo.id })
              .from(spot_photo)
              .where(eq(spot_photo.blob_sha256, photo_blob.sha256)),
          ),
        ),
      );
  }
  const after = await spotOr404(db, photo.spot_id, ctx.campusId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot_photo", entity_id: photoId, action: "reject", before, after },
    // A pending photo was never in the bundle.
    dirty: false,
  };
}
