import { PHOTO_MAX_BYTES } from "@perch/core";

export const MAX_SIDE = 1600;
export const QUALITY = 0.8;
export const RETRY_QUALITY = 0.7;

/** The size that fits within `max` on its longest side, never enlarging. */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type Shrunk =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: "unreadable" | "too_big" };

/** The browser pieces the pipeline uses, so the size logic is testable without a canvas. */
export type ImageKit = {
  decode(file: Blob): Promise<{ width: number; height: number; image: CanvasImageSource } | null>;
  /** Frees the decoded image once encoding is done. */
  release?(image: CanvasImageSource): void;
  encode(
    image: CanvasImageSource,
    size: { width: number; height: number },
    quality: number,
  ): Promise<Blob | null>;
};

export const browserImageKit: ImageKit = {
  release(image) {
    if (image instanceof ImageBitmap) image.close();
  },
  async decode(file) {
    try {
      // from-image applies the EXIF rotation before the pixels are redrawn.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, image: bitmap };
    } catch {
      return null;
    }
  },
  encode(image, size, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return Promise.resolve(null);
    // JPEG has no alpha; without a fill, transparent PNG pixels come out black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(image, 0, 0, size.width, size.height);
    return new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", quality);
      } catch {
        resolve(null);
      }
    });
  },
};

/**
 * On-device resize (spec section 7): decode, redraw at most 1600 px on the
 * longest side, encode JPEG at 0.8. Redrawing drops EXIF, GPS included. Over
 * 1.5 MB, one retry at 0.7; still over, refuse.
 */
export async function shrinkPhoto(file: Blob, kit: ImageKit = browserImageKit): Promise<Shrunk> {
  const decoded = await kit.decode(file);
  if (decoded === null) return { ok: false, reason: "unreadable" };
  try {
    const size = fitWithin(decoded.width, decoded.height);
    for (const quality of [QUALITY, RETRY_QUALITY]) {
      const blob = await kit.encode(decoded.image, size, quality);
      if (blob === null) return { ok: false, reason: "unreadable" };
      if (blob.size <= PHOTO_MAX_BYTES) {
        return { ok: true, bytes: new Uint8Array(await blob.arrayBuffer()), ...size };
      }
    }
    return { ok: false, reason: "too_big" };
  } finally {
    kit.release?.(decoded.image);
  }
}
