import { createHash } from "node:crypto";
import { type Db, photo_blob } from "@perch/db";
import { eq, isNull, sql } from "drizzle-orm";
import type { DataSite } from "../publish/dataSite.ts";
import { pagesHash } from "../publish/pagesTarget.ts";

export type PhotoBlob = { sha256: string; bytes: Uint8Array; contentType: string };

/** Where a photo is published on the data site. */
export function photoPath(sha256: string): string {
  return `photos/${sha256}.jpg`;
}

/**
 * Content-addressed photo bytes. Pending and not yet confirmed photos are in
 * Postgres; a photo the publisher confirmed on the data site keeps only its
 * row and hash there, and its bytes are read back from the data site.
 */
export type PhotoStore = {
  /**
   * Idempotent: storing the same bytes twice keeps one copy. Storing the bytes of a
   * blob that was cleared puts them back. `db` may be a transaction.
   */
  put(blob: PhotoBlob, db?: Db): Promise<void>;
  /** Postgres bytes, or an offloaded photo's data-site copy if its sha256 matches; else null. */
  get(sha256: string): Promise<Uint8Array | null>;
};

export function postgresPhotoStore(db: Db, dataSite: DataSite): PhotoStore {
  return {
    async put(blob, tx = db) {
      await tx
        .insert(photo_blob)
        .values({
          sha256: blob.sha256,
          bytes: blob.bytes,
          content_type: blob.contentType,
          byte_size: blob.bytes.byteLength,
          pages_hash: pagesHash(blob.bytes, photoPath(blob.sha256)),
        })
        .onConflictDoUpdate({
          target: photo_blob.sha256,
          set: { bytes: sql`excluded.bytes`, offloaded_at: null },
          where: isNull(photo_blob.bytes),
        });
    },
    async get(sha256) {
      const [row] = await db
        .select({ bytes: photo_blob.bytes })
        .from(photo_blob)
        .where(eq(photo_blob.sha256, sha256));
      if (!row) return null;
      if (row.bytes !== null) return row.bytes;
      const published = await dataSite.get(photoPath(sha256));
      return published !== null && sha256Hex(published) === sha256 ? published : null;
    },
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** JPEG files start with the SOI marker FF D8 followed by another marker FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
