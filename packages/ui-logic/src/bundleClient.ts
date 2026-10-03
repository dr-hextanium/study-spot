import { BUNDLE_SCHEMA_MAJOR, type Bundle, BundlePointer, parseBundle } from "@study-spot/core";
import { z } from "zod";
import type { Clock, Fetch, KeyValueCache } from "./adapters.ts";

export const LAST_GOOD_KEY = "bundle:last-good";
const DAY_MS = 86_400_000;

export type BundleClientDeps = { fetch: Fetch; cache: KeyValueCache; clock: Clock };

export type BundleLoad =
  | { status: "fresh" | "cached"; bundle: Bundle; ageDays: number }
  | { status: "unavailable"; reason: "offline_no_cache" | "update_required" };

const CacheEntry = z.object({ hash: z.string(), json: z.string() });
type Cached = { hash: string; bundle: Bundle };

async function readCache(cache: KeyValueCache): Promise<Cached | null> {
  try {
    const raw = await cache.get(LAST_GOOD_KEY);
    if (raw === null) return null;
    const entry = CacheEntry.safeParse(JSON.parse(raw));
    if (!entry.success) return null;
    const parsed = parseBundle(JSON.parse(entry.data.json));
    return parsed.ok ? { hash: entry.data.hash, bundle: parsed.bundle } : null;
  } catch {
    return null;
  }
}

async function getJson(fetch: Fetch, url: string): Promise<unknown> {
  const res = await fetch.getText(url);
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} for ${url}`);
  return JSON.parse(res.text);
}

function ageDays(bundle: Bundle, clock: Clock): number {
  return Math.max(
    0,
    Math.floor((clock.now().getTime() - Date.parse(bundle.generated_at)) / DAY_MS),
  );
}

/**
 * Loads the campus bundle: latest pointer, then the hashed bundle, validated
 * against the core schema. Falls back to the last good cached bundle on any
 * failure. Never throws.
 */
export async function loadBundle(deps: BundleClientDeps, baseUrl: string): Promise<BundleLoad> {
  const cached = await readCache(deps.cache);
  const fromCache = (): BundleLoad =>
    cached
      ? { status: "cached", bundle: cached.bundle, ageDays: ageDays(cached.bundle, deps.clock) }
      : { status: "unavailable", reason: "offline_no_cache" };

  let pointer: BundlePointer;
  try {
    const p = BundlePointer.safeParse(await getJson(deps.fetch, `${baseUrl}/bundle-latest.json`));
    if (!p.success) return fromCache();
    pointer = p.data;
  } catch {
    return fromCache();
  }

  if (pointer.schema_version !== BUNDLE_SCHEMA_MAJOR) {
    return cached ? fromCache() : { status: "unavailable", reason: "update_required" };
  }

  // Tie the fetched path to the content hash: no "..", query strings, or absolute URLs.
  if (pointer.url !== `bundle.${pointer.hash}.json`) return fromCache();

  if (cached && cached.hash === pointer.hash) {
    return { status: "fresh", bundle: cached.bundle, ageDays: ageDays(cached.bundle, deps.clock) };
  }

  try {
    const raw = await getJson(deps.fetch, `${baseUrl}/${pointer.url}`);
    const parsed = parseBundle(raw);
    if (!parsed.ok) return fromCache();
    try {
      await deps.cache.set(
        LAST_GOOD_KEY,
        JSON.stringify({ hash: pointer.hash, json: JSON.stringify(raw) }),
      );
    } catch {
      // A failed cache write must not discard a valid fresh bundle.
    }
    return { status: "fresh", bundle: parsed.bundle, ageDays: ageDays(parsed.bundle, deps.clock) };
  } catch {
    return fromCache();
  }
}
