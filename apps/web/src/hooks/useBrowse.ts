import { AccessProfile, type Bundle, DEFAULT_ACCESS } from "@perch/core";
import {
  type BrowsePrefs,
  type BrowseView,
  browseView,
  readBrowsePrefs,
  writeBrowsePrefs,
} from "@perch/ui-logic";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import { useDeps } from "../app/AppProvider.tsx";
import { useBundle } from "./useBundle.ts";
import { useCampusNow } from "./useCampusNow.ts";

/** Home keeps the chosen building in `student:pick`; Browse reads only that one field. */
const PICK_KEY = "student:pick";
const ACCESS_KEY = "student:access";
const FromOnly = z.object({ from: z.string().min(1).nullable() });

function readFrom(storage: { getItem(key: string): string | null }): string | null {
  try {
    const raw = storage.getItem(PICK_KEY);
    if (raw === null) return null;
    const parsed = FromOnly.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.from : null;
  } catch {
    return null;
  }
}

function readAccess(storage: { getItem(key: string): string | null }): AccessProfile {
  try {
    const raw = storage.getItem(ACCESS_KEY);
    if (raw === null) return DEFAULT_ACCESS;
    const parsed = AccessProfile.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_ACCESS;
  } catch {
    return DEFAULT_ACCESS;
  }
}

export type BrowseState = {
  state: "loading" | "unavailable" | "ready";
  unavailable: "offline_no_cache" | "update_required" | null;
  bundle: Bundle | null;
  ageDays: number;
  checkFailed: boolean;
  view: BrowseView | null;
  prefs: BrowsePrefs;
  set(next: Partial<BrowsePrefs>): void;
  from: string | null;
  now: Date;
};

/**
 * Browse's data: the bundle, the saved Browse choices, and the rows for them.
 * Reads only the static bundle and the phone's own storage, never the API.
 */
export function useBrowse(): BrowseState {
  const { prefs: storage } = useDeps();
  const state = useBundle();
  const now = useCampusNow();
  const [prefs, setPrefs] = useState<BrowsePrefs>(() => readBrowsePrefs(storage));
  const [from] = useState<string | null>(() => readFrom(storage));
  const [access] = useState<AccessProfile>(() => readAccess(storage));

  const set = useCallback(
    (next: Partial<BrowsePrefs>) => {
      setPrefs((current) => {
        const merged = { ...current, ...next };
        writeBrowsePrefs(storage, merged);
        return merged;
      });
    },
    [storage],
  );

  const bundle = state.phase === "ready" ? state.load.bundle : null;
  // The clock moves a minute at a time; rows only need to follow it by the minute.
  const minute = Math.floor(now.getTime() / 60_000);
  const atMinute = useMemo(() => new Date(minute * 60_000), [minute]);
  const view = useMemo(
    () => (bundle === null ? null : browseView(bundle, prefs, from ?? "", access, atMinute)),
    [bundle, prefs, from, access, atMinute],
  );

  return {
    state: state.phase === "ready" ? "ready" : state.phase,
    unavailable: state.phase === "unavailable" ? state.reason : null,
    bundle,
    ageDays: state.phase === "ready" ? state.load.ageDays : 0,
    checkFailed: state.phase === "ready" ? state.checkFailed : false,
    view,
    prefs,
    set,
    from,
    now,
  };
}
