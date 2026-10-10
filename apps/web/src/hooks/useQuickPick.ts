import {
  type AccessProfile,
  BUILTIN_PRESETS,
  type Bundle,
  type Candidate,
  DEFAULT_FROM,
  draw,
  type EmptyHelp,
  explainEmpty,
  type PickInput,
  type Preset,
  presetById,
  pushRecent,
  type RankResult,
  rankSpots,
  type SpotPick,
  surpriseGroup,
  surpriseRank,
  TimeChoice,
  topPick,
} from "@perch/core";
import {
  type BundleState,
  DEFAULT_PICK_PREFS,
  notePickAction,
  PICK_PREFS_KEY,
  PickPrefs,
  type RECENT_KEY,
  readAccess,
  readJson,
  readRecent,
  writeJson,
  writeRecent,
} from "@perch/ui-logic";
import { useEffect, useMemo, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useBundle } from "./useBundle.ts";
import { useCampusNow } from "./useCampusNow.ts";

const ALTERNATES = 2;

export type PickMode = "top" | "reroll" | "surprise";
export type DrawResult = "new" | "same" | "none";

export type QuickPick = {
  state: "loading" | "unavailable" | "ready";
  unavailable: "offline_no_cache" | "update_required" | null;
  /** The store's state, for the data age line and notes. */
  load: BundleState;
  bundle: Bundle | null;
  now: Date;
  prefs: PickPrefs;
  /** The building walks are measured from, or null when the bundle has none. */
  from: string | null;
  /** The saved building is not in the bundle, so `from` replaced it. */
  fromFallback: boolean;
  access: AccessProfile;
  presets: readonly Preset[];
  preset: Preset;
  mode: PickMode;
  pick: SpotPick | null;
  empty: EmptyHelp | null;
  set(next: Partial<PickPrefs>): void;
  somethingElse(): DrawResult;
  surprise(): DrawResult;
  showTop(): void;
  /** A pick action (Directions, a reroll, a surprise): counts this tab's visit once. */
  notePick(): void;
};

type Shown = { mode: Exclude<PickMode, "top">; spotId: string };
type Kind = keyof typeof RECENT_KEY;

function withAlternates(primary: Candidate, ranked: readonly Candidate[]): SpotPick {
  return {
    primary,
    alternates: ranked.filter((c) => c.spot.id !== primary.spot.id).slice(0, ALTERNATES),
  };
}

/**
 * Home's query and its answer. Ranking is pure core scoring over the cached bundle; nothing
 * here touches the network. The spot on screen is looked up again in each new ranking, so a
 * pick that stops qualifying (the clock moved, an input changed) falls back to the top pick.
 */
export function useQuickPick(custom: readonly Preset[]): QuickPick {
  const deps = useDeps();
  const load = useBundle();
  const now = useCampusNow();
  const [prefs, setPrefs] = useState<PickPrefs>(() => {
    const saved = readJson(deps.prefs, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS).value;
    // A custom preset deleted on Me leaves its id behind: go back to the first built-in.
    const known = [...BUILTIN_PRESETS, ...custom].some((p) => p.id === saved.presetId);
    if (known) return saved;
    const fixed = { ...saved, presetId: DEFAULT_PICK_PREFS.presetId };
    writeJson(deps.prefs, PICK_PREFS_KEY, fixed);
    return fixed;
  });
  // Written by Me; Home only reads it.
  const [access] = useState<AccessProfile>(() => readAccess(deps.prefs).value);
  const [shown, setShown] = useState<Shown | null>(null);
  const bundle = load.phase === "ready" ? load.load.bundle : null;
  const preset = presetById(prefs.presetId, custom);
  const presets = useMemo(() => [...BUILTIN_PRESETS, ...custom], [custom]);

  const ranks = useMemo((): {
    input: PickInput;
    quick: RankResult;
    surprise: RankResult;
  } | null => {
    if (bundle === null) return null;
    const input: PickInput = {
      bundle,
      now,
      // The saved id as is: core resolves it and flags one that is gone from the bundle.
      from: prefs.from ?? DEFAULT_FROM,
      time: prefs.time,
      preset,
      extra: prefs.extra,
      group: prefs.group,
      access,
    };
    return {
      input,
      quick: rankSpots(input),
      // Surprise me ignores the preset, its group size included: the People stepper's
      // value when it is on screen, else one person.
      surprise: surpriseRank({ ...input, group: surpriseGroup(input) }),
    };
  }, [bundle, now, prefs, preset, access]);

  let mode: PickMode = "top";
  let pick: SpotPick | null = null;
  if (ranks !== null) {
    if (shown !== null) {
      const list = shown.mode === "surprise" ? ranks.surprise.ranked : ranks.quick.ranked;
      const primary = list.find((c) => c.spot.id === shown.spotId);
      if (primary !== undefined) {
        pick = withAlternates(primary, list);
        mode = shown.mode;
      }
    }
    pick ??= topPick(ranks.quick.ranked);
  }
  const primaryId = pick?.primary.spot.id ?? null;
  // Each way out is checked by ranking again, so this only runs for an empty pick.
  const empty = useMemo(
    () => (ranks !== null && pick === null ? explainEmpty(ranks.input, ranks.quick) : null),
    [ranks, pick],
  );

  // Every primary shown goes into its own last-5 history, so the next draw avoids it.
  useEffect(() => {
    if (primaryId === null) return;
    const kind: Kind = mode === "surprise" ? "surprise" : "pick";
    writeRecent(deps.tab, kind, pushRecent(readRecent(deps.tab, kind), primaryId));
  }, [deps.tab, mode, primaryId]);

  const set = (next: Partial<PickPrefs>): void => {
    const merged: PickPrefs = { ...prefs, ...next };
    if (next.presetId !== undefined) {
      const chosen = presetById(next.presetId, custom);
      if (chosen.minutes !== null) merged.time = TimeChoice.parse(String(chosen.minutes));
    }
    writeJson(deps.prefs, PICK_PREFS_KEY, merged);
    setPrefs(merged);
    // A new question gets the top answer; dismissing a note is not a new question.
    if (Object.keys(next).some((k) => k !== "accessNoteDismissed")) setShown(null);
  };

  const notePick = (): void => {
    notePickAction(deps.prefs, deps.tab);
  };

  const drawFrom = (ranked: readonly Candidate[] | undefined, kind: Kind): DrawResult => {
    notePick();
    if (ranked === undefined || ranked.length === 0) return "none";
    const next = draw(ranked, readRecent(deps.tab, kind), deps.rand, primaryId);
    if (next === null) return "none";
    if (next.primary.spot.id === primaryId) return "same";
    setShown({ mode: kind === "surprise" ? "surprise" : "reroll", spotId: next.primary.spot.id });
    return "new";
  };

  return {
    state: load.phase,
    unavailable: load.phase === "unavailable" ? load.reason : null,
    load,
    bundle,
    now,
    prefs,
    from: ranks?.quick.from ?? null,
    fromFallback: ranks?.quick.fromFallback ?? false,
    access,
    presets,
    preset,
    mode,
    pick,
    // A surprise pick can stand in for an empty quick pick: then there is nothing to explain.
    empty,
    set,
    somethingElse: () => drawFrom(ranks?.quick.ranked, "pick"),
    surprise: () => drawFrom(ranks?.surprise.ranked, "surprise"),
    showTop: () => setShown(null),
    notePick,
  };
}
