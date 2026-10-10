import {
  buildSpotView,
  isLocalId,
  type PublishReadiness,
  publishReadiness,
  reviewAction,
  type SectionStatus,
  type SpotView,
  type StepProgress,
  sectionStatuses,
  stepProgress,
} from "@perch/ui-logic";
import { useIsRestoring } from "@tanstack/react-query";
import { useDeps } from "../app/AppProvider.tsx";
import { useOutboxSnapshot } from "./useOutbox.ts";
import { useCampusTz, useServerSpot, useSpotList } from "./useQueries.ts";
import { useSession } from "./useSession.ts";

export type SpotViewState =
  /** A draft made offline was created on the server; the screen moves to the real id. */
  | { kind: "redirect"; to: string }
  | { kind: "loading" }
  /** Not on this phone and not reachable (never opened, offline). */
  | { kind: "missing" }
  | {
      kind: "ready";
      view: SpotView;
      statuses: SectionStatus[];
      readiness: PublishReadiness;
      progress: StepProgress;
      review: "button" | "own" | "none";
      tz: string;
    };

export function useSpotView(id: string): SpotViewState {
  const { clock } = useDeps();
  const { me } = useSession();
  const snapshot = useOutboxSnapshot();
  const server = useServerSpot(id);
  const list = useSpotList();
  const tz = useCampusTz();
  // While the persisted cache is being read back, "not on this phone" would be a false alarm.
  const restoring = useIsRestoring();
  // Until the queue is read from disk, a local draft or its pending writes could be hiding.
  if (!snapshot.loaded) return { kind: "loading" };
  const real = snapshot.idMap[id];
  if (real !== undefined) return { kind: "redirect", to: real };
  const term = server.data?.term ?? list.data?.term ?? null;
  const view = buildSpotView(server.data ?? null, snapshot.records, id, term);
  if (view === null) {
    if (restoring || (!isLocalId(id) && server.isPending && server.fetchStatus === "fetching")) {
      return { kind: "loading" };
    }
    return { kind: "missing" };
  }
  // A local draft has never been seen by the server, so nobody else could review it yet.
  const review = me === null || view.localOnly ? "none" : reviewAction(view, me);
  return {
    kind: "ready",
    view,
    statuses: sectionStatuses(view, { now: clock.now(), tz }),
    readiness: publishReadiness(view),
    progress: stepProgress(view),
    review,
    tz,
  };
}
