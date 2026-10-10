import {
  AccessProfile,
  type BundleBuilding,
  type Criterion,
  DEFAULT_ACCESS,
  Preset,
} from "@perch/core";
import { z } from "zod";
import type { Ids, KeyValueStorage } from "../adapters.ts";

export const ACCESS_KEY = "student:access";
export const PRESETS_KEY = "student:presets";
export const INSTALL_KEY = "student:install";
/** In the tab (sessionStorage): this tab already counted as one pick visit. */
export const VISIT_KEY = "student:visit-counted";
export const MAX_CUSTOM_PRESETS = 10;
const MAX_NAME = 24;

/** What a stored value read as; `reset` is true when it was unreadable and was replaced. */
type Stored<T> = { value: T; reset: boolean };

/**
 * Parses a stored JSON value. Missing gives the fallback quietly; unreadable gives the
 * fallback, drops the bad value and reports it; a storage that throws gives the fallback.
 */
function readStored<T>(
  storage: KeyValueStorage,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): Stored<T> {
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
    // Not JSON: reset below.
  }
  try {
    storage.removeItem(key);
  } catch {
    // Nothing more to do.
  }
  return { value: fallback, reset: true };
}

function writeStored(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store costs only the memory of the setting.
  }
}

export function readAccess(prefs: KeyValueStorage): Stored<AccessProfile> {
  return readStored(prefs, ACCESS_KEY, AccessProfile, DEFAULT_ACCESS);
}

export function writeAccess(prefs: KeyValueStorage, p: AccessProfile): void {
  writeStored(prefs, ACCESS_KEY, p);
}

export const CustomPresets = z
  .array(Preset.refine((p) => p.name !== null && p.id.startsWith("custom-")))
  .max(MAX_CUSTOM_PRESETS);

export function readCustomPresets(prefs: KeyValueStorage): Stored<Preset[]> {
  return readStored(prefs, PRESETS_KEY, CustomPresets, []);
}

export type SaveResult =
  | { ok: true; list: Preset[]; preset: Preset }
  | { ok: false; error: "name_required" | "filters_required" | "full" };

export function saveCustomPreset(
  prefs: KeyValueStorage,
  list: readonly Preset[],
  input: { name: string; extra: readonly Criterion[] },
  ids: Ids,
): SaveResult {
  const name = input.name.trim().slice(0, MAX_NAME).trim();
  if (name === "") return { ok: false, error: "name_required" };
  if (input.extra.length === 0) return { ok: false, error: "filters_required" };
  if (list.length >= MAX_CUSTOM_PRESETS) return { ok: false, error: "full" };
  const preset: Preset = {
    // Dashes dropped: "custom-" plus a 36 character uuid is 43, and an id holds 40.
    id: `custom-${ids.uuid().replaceAll("-", "")}`,
    name,
    required: [...input.extra],
    soft: [],
    minutes: null,
    groupDefault: null,
  };
  const next = [...list, preset];
  writeStored(prefs, PRESETS_KEY, next);
  return { ok: true, list: next, preset };
}

export function deleteCustomPreset(
  prefs: KeyValueStorage,
  list: readonly Preset[],
  id: string,
): Preset[] {
  const next = list.filter((p) => p.id !== id);
  writeStored(prefs, PRESETS_KEY, next);
  return next;
}

const byName = (a: BundleBuilding, b: BundleBuilding): number => a.name.localeCompare(b.name);

/** Every building, by name: where a student can say they live. */
export function residenceOptions(buildings: readonly BundleBuilding[]): BundleBuilding[] {
  return [...buildings].sort(byName);
}

/** The quads: building ids ending "-quad", by name. */
export function quadOptions(buildings: readonly BundleBuilding[]): BundleBuilding[] {
  return buildings.filter((b) => b.id.endsWith("-quad")).sort(byName);
}

export const InstallState = z.object({
  pickVisits: z.number().int().min(0).max(1000),
  dismissed: z.boolean(),
});
export type InstallState = z.infer<typeof InstallState>;
const FRESH_INSTALL: InstallState = { pickVisits: 0, dismissed: false };

/** Adds one visit the first time a tab picks; later picks in that tab change nothing. */
export function notePickAction(prefs: KeyValueStorage, tab: KeyValueStorage): InstallState {
  const state = readStored(prefs, INSTALL_KEY, InstallState, FRESH_INSTALL).value;
  try {
    if (tab.getItem(VISIT_KEY) !== null) return state;
    tab.setItem(VISIT_KEY, "1");
  } catch {
    return state;
  }
  const next = { ...state, pickVisits: Math.min(state.pickVisits + 1, 1000) };
  writeStored(prefs, INSTALL_KEY, next);
  return next;
}

export function shouldOfferInstall(state: InstallState, standalone: boolean): boolean {
  return !state.dismissed && !standalone && state.pickVisits >= 2;
}

export function dismissInstall(prefs: KeyValueStorage): void {
  const state = readStored(prefs, INSTALL_KEY, InstallState, FRESH_INSTALL).value;
  writeStored(prefs, INSTALL_KEY, { ...state, dismissed: true });
}

/** The install state as stored now, for a screen to read. */
export function readInstall(prefs: KeyValueStorage): InstallState {
  return readStored(prefs, INSTALL_KEY, InstallState, FRESH_INSTALL).value;
}
