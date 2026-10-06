import type { SurveySpot } from "@study-spot/core";
import { type SurveyHome, surveyHome } from "@study-spot/ui-logic";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "../app/keys.ts";
import { useOutboxSnapshot } from "./useOutbox.ts";
import { useSpotList } from "./useQueries.ts";
import { useSession } from "./useSession.ts";

export type HomeState = {
  home: SurveyHome | null;
  /** True before any list has been loaded or restored (first run offline). */
  noList: boolean;
  refreshing: boolean;
};

export function useSurveyHome(): HomeState {
  const { me } = useSession();
  const list = useSpotList();
  const snapshot = useOutboxSnapshot();
  const qc = useQueryClient();
  if (me === null) return { home: null, noList: true, refreshing: false };
  const details = new Map<string, SurveySpot>();
  for (const [key, data] of qc.getQueriesData<SurveySpot>({ queryKey: keys.spotPrefix })) {
    const id = key[2];
    if (typeof id === "string" && data !== undefined) details.set(id, data);
  }
  return {
    home: surveyHome(list.data ?? null, snapshot.records, me, details, snapshot.unreadable),
    noList: list.data === undefined,
    refreshing: list.isFetching,
  };
}
