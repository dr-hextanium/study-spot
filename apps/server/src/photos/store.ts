import { createHash } from "node:crypto";
import { type Db, photo_blob } from "@perch/db";
import { eq } from "drizzle-orm";

export type PhotoBlob = { sha256: string; bytes: Uint8Array; contentType: string };

/** Content-addressed photo bytes. Postgres today; R2 can replace it behind this interface. */
export type PhotoStore = {
  /** Idempotent: storing the same bytes twice keeps one copy. */
  put(blob: PhotoBlob): Promise<void>;
  get(sha256: string): Promise<Uint8Array | null>;
};

export function postgresPhotoStore(db: Db): PhotoStore {
  return {
    async put(blob) {
      await db
        .insert(photo_blob)
        .values({
          sha256: blob.sha256,
          bytes: blob.bytes,
          content_type: blob.contentType,
          byte_size: blob.bytes.byteLength,
        })
        .onConflictDoNothing();
    },
    async get(sha256) {
      const [row] = await db
        .select({ bytes: photo_blob.bytes })
        .from(photo_blob)
        .where(eq(photo_blob.sha256, sha256));
      return row ? row.bytes : null;
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
