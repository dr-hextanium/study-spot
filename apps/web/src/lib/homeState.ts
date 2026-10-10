import { HOME_FILTER } from "@perch/ui-logic";
import { useState } from "react";
import { z } from "zod";

const KEY = "perch.home";
const HomeState = z.object({ filter: z.enum(HOME_FILTER), query: z.string().max(100) });
export type HomeState = z.infer<typeof HomeState>;
const FRESH: HomeState = { filter: "all", query: "" };

/** sessionStorage is a trust boundary: anything unreadable starts fresh. */
export function readHomeState(raw: unknown): HomeState {
  if (typeof raw !== "string") return FRESH;
  try {
    const parsed = HomeState.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : FRESH;
  } catch {
    return FRESH;
  }
}

/** Home's filter and search, kept for this tab so Back lands on the same list. */
export function useHomeState(): [HomeState, (next: HomeState) => void] {
  const [state, setState] = useState<HomeState>(() => {
    try {
      return readHomeState(sessionStorage.getItem(KEY));
    } catch {
      return FRESH;
    }
  });
  const set = (next: HomeState) => {
    setState(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the state still holds for this visit.
    }
  };
  return [state, set];
}
