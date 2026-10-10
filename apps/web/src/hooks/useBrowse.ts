import type { AccessProfile, Bundle } from "@perch/core";
import {
  type BrowsePrefs,
  type BrowseView,
  browseView,
  DEFAULT_PICK_PREFS,
  PICK_PREFS_KEY,
  PickPrefs,
  readAccess,
  readBrowsePrefs,
  readJson,
  writeBrowsePrefs,
} from "@perch/ui-logic";
import { useCallback, useMemo, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useBundle } from "./useBundle.ts";
import { useCampusNow } from "./useCampusNow.ts";

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
  // Home keeps the chosen building in its prefs; Browse reads only that field.
  const [from] = useState<string | null>(
    () => readJson(storage, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS).value.from,
  );
  const [access] = useState<AccessProfile>(() => readAccess(storage).value);

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
