import {
  BUNDLE_SCHEMA_MAJOR,
  type Bundle,
  BundlePointer,
  clockSkewMs,
  parseBundle,
} from "@perch/core";
import { z } from "zod";
import type { Clock, Fetch, KeyValueCache } from "./adapters.ts";

/** Cache key for the last good bundle, one per campus base URL. */
export function lastGoodKey(baseUrl: string): string {
  return `bundle:last-good:${baseUrl}`;
}
const DAY_MS = 86_400_000;

export type BundleClientDeps = { fetch: Fetch; cache: KeyValueCache; clock: Clock };

export type BundleLoad =
  | {
      status: "fresh" | "cached";
      bundle: Bundle;
      ageDays: number;
      /** True when the server publishes a newer schema major than this app reads. */
      updateAvailable: boolean;
      /**
       * Server time minus device time, from the pointer response's Date. 0 for
       * cached loads, and when the gap is small or the header is missing.
       */
      skewMs: number;
      /** True only when a request rejected (offline, timeout) or returned a non-2xx status. */
      networkFailed: boolean;
    }
  | { status: "unavailable"; reason: "offline_no_cache" | "update_required" };

const CacheEntry = z.object({ hash: z.string(), json: z.string() });
type Cached = { hash: string; bundle: Bundle };

async function readCache(cache: KeyValueCache, key: string): Promise<Cached | null> {
  try {
    const raw = await cache.get(key);
    if (raw === null) return null;
    const entry = CacheEntry.safeParse(JSON.parse(raw));
    if (!entry.success) return null;
    const parsed = parseBundle(JSON.parse(entry.data.json));
    return parsed.ok ? { hash: entry.data.hash, bundle: parsed.bundle } : null;
  } catch {
    return null;
  }
}

/** `failed` means the network failed; `text` is a 2xx body that may still be junk. */
type Got = { ok: true; text: string; date: string | null } | { ok: false };

async function get(fetch: Fetch, url: string): Promise<Got> {
  try {
    const res = await fetch.getText(url);
    if (res.status < 200 || res.status >= 300) return { ok: false };
    return { ok: true, text: res.text, date: res.date };
  } catch {
    return { ok: false };
  }
}

function parseJson(text: string): { ok: true; json: unknown } | { ok: false } {
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function ageDays(bundle: Bundle, clock: Clock): number {
  return Math.max(
    0,
    Math.floor((clock.now().getTime() - Date.parse(bundle.generated_at)) / DAY_MS),
  );
}

function cachedLoad(
  cached: Cached,
  clock: Clock,
  updateAvailable: boolean,
  networkFailed: boolean,
): BundleLoad & { status: "cached" } {
  return {
    status: "cached",
    bundle: cached.bundle,
    ageDays: ageDays(cached.bundle, clock),
    updateAvailable,
    skewMs: 0,
    networkFailed,
  };
}

/**
 * The last good bundle from the cache alone, with no network. Null when there
 * is none or it no longer parses.
 */
export async function readLastGood(
  deps: BundleClientDeps,
  baseUrl: string,
): Promise<(BundleLoad & { status: "cached" }) | null> {
  const cached = await readCache(deps.cache, lastGoodKey(baseUrl));
  return cached === null ? null : cachedLoad(cached, deps.clock, false, false);
}

/**
 * Loads the campus bundle: latest pointer, then the hashed bundle, validated
 * against the core schema. Falls back to the last good cached bundle on any
 * failure. Never throws.
 */
export async function loadBundle(deps: BundleClientDeps, baseUrl: string): Promise<BundleLoad> {
  const key = lastGoodKey(baseUrl);
  const cached = await readCache(deps.cache, key);
  const fromCache = (updateAvailable: boolean, networkFailed: boolean): BundleLoad =>
    cached
      ? cachedLoad(cached, deps.clock, updateAvailable, networkFailed)
      : { status: "unavailable", reason: "offline_no_cache" };

  const pointerRes = await get(deps.fetch, `${baseUrl}/bundle-latest.json`);
  const at = deps.clock.now();
  if (!pointerRes.ok) return fromCache(false, true);
  const pointerJson = parseJson(pointerRes.text);
  if (!pointerJson.ok) return fromCache(false, false);
  const p = BundlePointer.safeParse(pointerJson.json);
  if (!p.success) return fromCache(false, false);
  const pointer = p.data;
  const skewMs = clockSkewMs(at, pointerRes.date);

  if (pointer.schema_version !== BUNDLE_SCHEMA_MAJOR) {
    if (!cached) return { status: "unavailable", reason: "update_required" };
    // Only a newer major means this app is out of date.
    return fromCache(pointer.schema_version > BUNDLE_SCHEMA_MAJOR, false);
  }

  // Tie the fetched path to the content hash: no "..", query strings, or absolute URLs.
  if (pointer.url !== `bundle.${pointer.hash}.json`) return fromCache(false, false);

  if (cached && cached.hash === pointer.hash) {
    return {
      status: "fresh",
      bundle: cached.bundle,
      ageDays: ageDays(cached.bundle, deps.clock),
      updateAvailable: false,
      skewMs,
      networkFailed: false,
    };
  }

  const bundleRes = await get(deps.fetch, `${baseUrl}/${pointer.url}`);
  if (!bundleRes.ok) return fromCache(false, true);
  const raw = parseJson(bundleRes.text);
  if (!raw.ok) return fromCache(false, false);
  const parsed = parseBundle(raw.json);
  if (!parsed.ok) return fromCache(false, false);
  try {
    await deps.cache.set(
      key,
      JSON.stringify({ hash: pointer.hash, json: JSON.stringify(raw.json) }),
    );
  } catch {
    // A failed cache write must not discard a valid fresh bundle.
  }
  return {
    status: "fresh",
    bundle: parsed.bundle,
    ageDays: ageDays(parsed.bundle, deps.clock),
    updateAvailable: false,
    skewMs,
    networkFailed: false,
  };
}
