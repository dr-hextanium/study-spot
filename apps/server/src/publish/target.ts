/** One file of the data site. Bytes load lazily so unchanged photos are not read. */
export type PublishFile = {
  /** Relative path without a leading slash, e.g. "photos/<sha256>.jpg". */
  path: string;
  contentType: string;
  bytes: () => Promise<Uint8Array>;
  /**
   * The Cloudflare Pages asset key of these bytes at this path, when already known.
   * A Pages deploy lists it in the manifest without reading the bytes, and reads
   * them only if Cloudflare reports the hash missing.
   */
  pagesHash?: string;
};

export type DeployResult = { uploaded: string[]; skipped: string[] };

/**
 * Where the data site lives. `deploy` receives the complete file set: a target
 * that replaces the whole site (Cloudflare Pages) needs all of it, and a target
 * that adds files (a directory) may skip immutable files it already has.
 */
export type PublishTarget = { deploy(files: readonly PublishFile[]): Promise<DeployResult> };

/** Paths whose content can change between publishes. Everything else is content-addressed. */
export const MUTABLE_PATHS: ReadonlySet<string> = new Set(["bundle-latest.json", "_headers"]);

/** Cloudflare Pages headers: CORS for the PWA origin, no-cache pointer, immutable hashed files. */
export const DATA_HEADERS = [
  "/*",
  "  Access-Control-Allow-Origin: *",
  "/bundle-latest.json",
  "  Cache-Control: no-cache",
  "/bundle.*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/photos/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n");
