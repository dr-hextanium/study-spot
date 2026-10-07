import type { Page } from "@playwright/test";

/** A large landscape JPEG drawn in the page (gradients and blocks, so it compresses like a photo). */
export async function bigJpeg(page: Page, width = 4000, height = 3000): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      if (g === null) throw new Error("no 2d context");
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#7aa7d9");
      sky.addColorStop(1, "#e9dcc4");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i += 1) {
        g.fillStyle = `hsl(${(i * 37) % 360} 40% ${30 + (i % 5) * 10}%)`;
        g.fillRect((i * 97) % w, (i * 53) % h, w / 8, h / 10);
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.95));
      if (blob === null) throw new Error("no jpeg");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    },
    [width, height] as const,
  );
  return Buffer.from(base64, "base64");
}

export const GPS_MARK = "GPS 40.9154N 73.1222W secret";

/** Inserts an EXIF APP1 segment, with a marker string standing in for GPS, after the JPEG SOI. */
export function withExif(jpeg: Buffer): Buffer {
  const tiff = Buffer.concat([
    Buffer.from("Exif\0\0", "binary"),
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0, 0, 0, 0]),
    Buffer.from(GPS_MARK, "binary"),
  ]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(tiff.length + 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    length,
    tiff,
    jpeg.subarray(2),
  ]);
}

/** The marker bytes of each segment before the scan data, in order (0xe1 is APP1: EXIF or XMP). */
export function jpegMarkers(jpeg: Buffer): number[] {
  const markers: number[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1] ?? 0;
    markers.push(marker);
    if (marker === 0xda) break;
    at += 2 + jpeg.readUInt16BE(at + 2);
  }
  return markers;
}
