import {
  CampusInfo,
  type SpotList,
  SpotList as SpotListSchema,
  type SpotSummary,
  SurveySpot,
} from "@study-spot/core";
import type { QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { z } from "zod";
import { keys } from "./keys.ts";

/**
 * The server copy this phone keeps (decision 18): never replace a spot with an
 * older version, whether the older one comes from a refetch that raced a write,
 * a replayed answer, or another tab's persisted snapshot.
 */
export function newerSpot(old: SurveySpot | undefined, next: SurveySpot): SurveySpot {
  return old !== undefined && old.id === next.id && old.version > next.version ? old : next;
}

function oldestVerified(spot: SurveySpot): string | null {
  const dates = Object.values(spot.verified).filter((d): d is string => d !== undefined);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

/** The list row for a spot the server returned, keeping what only the list knows. */
export function summaryOf(
  spot: SurveySpot,
  prev: SpotSummary | undefined,
  buildingName: string | undefined,
): SpotSummary {
  return {
    id: spot.id,
    slug: spot.slug,
    official_name: spot.official_name,
    common_name: spot.common_name,
    building_id: spot.building_id,
    building_name:
      prev?.building_id === spot.building_id
        ? prev.building_name
        : (buildingName ?? prev?.building_name ?? spot.building_id),
    status: spot.status,
    review_state: spot.review_state,
    version: spot.version,
    last_edited_by: spot.last_edited_by,
    last_edited_by_name: spot.last_edited_by_name,
    updated_at: spot.updated_at,
    oldest_verified_at: oldestVerified(spot),
    hours_confirmed: spot.hours.length > 0,
  };
}

/** A fetched list, with any row this phone already holds at a newer version kept. */
export function mergeList(old: SpotList | undefined, next: SpotList): SpotList {
  if (old === undefined) return next;
  const held = new Map(old.spots.map((s) => [s.id, s]));
  return {
    term: next.term,
    spots: next.spots.map((s) => {
      const mine = held.get(s.id);
      return mine !== undefined && mine.version > s.version ? mine : s;
    }),
  };
}

/** Puts a spot the server returned (an applied write, Keep theirs) into the detail and the list. */
export function applyServerSpot(qc: QueryClient, spot: SurveySpot): void {
  qc.setQueryData<SurveySpot>(keys.spot(spot.id), (old) => newerSpot(old, spot));
  const campus = qc.getQueryData<CampusInfo>(keys.campus);
  const buildingName = campus?.buildings.find((b) => b.id === spot.building_id)?.name;
  qc.setQueryData<SpotList>(keys.list, (old) => {
    if (old === undefined) return old;
    const prev = old.spots.find((s) => s.id === spot.id);
    if (prev !== undefined && prev.version > spot.version) return old;
    const row = summaryOf(spot, prev, buildingName);
    return {
      ...old,
      spots:
        prev === undefined
          ? [...old.spots, row]
          : old.spots.map((s) => (s.id === spot.id ? row : s)),
    };
  });
}

const KEY_SCHEMAS: readonly { match: (k: readonly unknown[]) => boolean; schema: z.ZodType }[] = [
  { match: (k) => k[0] === "survey" && k[1] === "spots", schema: SpotListSchema },
  { match: (k) => k[0] === "survey" && k[1] === "spot", schema: SurveySpot },
  { match: (k) => k[0] === "survey" && k[1] === "campus", schema: CampusInfo },
];

const Envelope = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({
    queries: z.array(
      z.looseObject({
        queryKey: z.array(z.unknown()),
        state: z.looseObject({ data: z.unknown() }),
      }),
    ),
  }),
});

const EMPTY: PersistedClient = {
  timestamp: 0,
  buster: "",
  clientState: { mutations: [], queries: [] },
};

/**
 * IndexedDB is a trust boundary: a persisted query from an older app version,
 * or a damaged one, is dropped instead of reaching a screen. Only survey
 * queries are kept; admin data is always fetched fresh.
 */
export function sanitizePersisted(raw: unknown): PersistedClient {
  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) return EMPTY;
  const kept = parsed.data.clientState.queries.filter((q) => {
    const entry = KEY_SCHEMAS.find((e) => e.match(q.queryKey));
    return entry?.schema.safeParse(q.state.data).success === true;
  });
  // The envelope and every kept query's data are checked above; the other fields
  // are TanStack's own dehydrated query state, passed through as stored.
  return {
    timestamp: parsed.data.timestamp,
    buster: parsed.data.buster,
    clientState: { mutations: [], queries: kept },
  } as unknown as PersistedClient;
}

/**
 * Survey queries that hold data are persisted, including one whose last refetch
 * failed: the copy kept for offline use must outlive a failed refresh.
 */
export function shouldPersistQuery(q: {
  queryKey: readonly unknown[];
  state: { data: unknown };
}): boolean {
  return q.queryKey[0] === "survey" && q.state.data !== undefined;
}
