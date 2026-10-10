import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { FetchLike } from "./pagesTarget.ts";

/** Cloudflare Pages' per-file limit; nothing larger can be on the data site. */
export const DATA_SITE_MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Relative data-site paths only: plain segments, no "..", no leading slash. */
const DataPath = z
  .string()
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/)
  .refine((p) => !p.split("/").includes(".."));

/**
 * Reads files back from the published data site. Every failure (not found, a
 * network error, a timeout, a bad path) is null, so callers treat "could not
 * read" the same as "not there" and never clear bytes on a guess.
 */
export type DataSite = {
  /** `fresh` skips any cache between here and the site, for confirming a deploy. */
  get(path: string, opts?: { fresh?: boolean }): Promise<Uint8Array | null>;
};

/** The live data site over HTTP, e.g. https://perch-data.pages.dev. */
export function httpDataSite(baseUrl: string, fetchImpl?: FetchLike): DataSite {
  const doFetch: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async get(path, opts) {
      if (!DataPath.safeParse(path).success) return null;
      // Pages serves a file whatever the query string; a new one misses any edge cache.
      const url = opts?.fresh ? `${base}/${path}?check=${Date.now()}` : `${base}/${path}`;
      try {
        const res = await doFetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status !== 200) return null;
        const length = Number(res.headers.get("content-length") ?? "0");
        if (length > DATA_SITE_MAX_BYTES) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength > DATA_SITE_MAX_BYTES ? null : bytes;
      } catch {
        return null;
      }
    },
  };
}

/** A data site written by fsTarget into a directory (tests, local dev, VPS fallback). */
export function fsDataSite(dir: string): DataSite {
  return {
    async get(path) {
      if (!DataPath.safeParse(path).success) return null;
      try {
        return new Uint8Array(await readFile(join(dir, path)));
      } catch {
        return null;
      }
    },
  };
}
