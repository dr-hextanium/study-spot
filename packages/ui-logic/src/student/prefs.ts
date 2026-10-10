import { Criterion, MAX_GROUP, RecentPicks, TimeChoice } from "@perch/core";
import { z } from "zod";
import type { KeyValueStorage } from "../adapters.ts";

export const PICK_PREFS_KEY = "student:pick";

/**
 * Home inputs. Holds a building id only: coordinates never reach storage. Not strict on
 * purpose, so unknown keys (a stray lat or lng) are stripped on parse instead of kept.
 */
export const PickPrefs = z.object({
  from: z.string().min(1).nullable(),
  time: TimeChoice,
  presetId: z.string().min(1).max(40),
  group: z.number().int().min(2).max(MAX_GROUP),
  extra: z.array(Criterion).max(16),
  accessNoteDismissed: z.boolean(),
});
export type PickPrefs = z.infer<typeof PickPrefs>;

export const DEFAULT_PICK_PREFS: PickPrefs = {
  from: null,
  time: "60",
  presetId: "silent_solo",
  group: 3,
  extra: [],
  accessNoteDismissed: false,
};

export type Read<T> = { value: T; reset: boolean };

/** Parses a stored JSON value; anything unreadable is replaced by the fallback and reported. */
export function readJson<T>(
  storage: KeyValueStorage,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): Read<T> {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { value: fallback, reset: false };
  }
  if (raw === null) return { value: fallback, reset: false };
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return { value: parsed.data, reset: false };
  } catch {
    // Not JSON: fall through to the reset.
  }
  try {
    storage.removeItem(key);
  } catch {
    // Nothing more to do: the fallback is used either way.
  }
  return { value: fallback, reset: true };
}

export function writeJson(storage: KeyValueStorage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const RECENT_KEY = {
  pick: "student:recent:pick",
  surprise: "student:recent:surprise",
} as const;

export function readRecent(tab: KeyValueStorage, kind: keyof typeof RECENT_KEY): string[] {
  return readJson(tab, RECENT_KEY[kind], RecentPicks, []).value;
}

export function writeRecent(
  tab: KeyValueStorage,
  kind: keyof typeof RECENT_KEY,
  ids: readonly string[],
): void {
  writeJson(tab, RECENT_KEY[kind], ids);
}
