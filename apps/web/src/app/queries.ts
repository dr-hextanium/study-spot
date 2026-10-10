import type { CampusInfo, SpotList, SurveySpot } from "@perch/core";
import { type ApiResult, isLocalId, type SurveyApi } from "@perch/ui-logic";
import { queryOptions } from "@tanstack/react-query";
import { keys } from "./keys.ts";
import { mergeList, newerSpot } from "./serverCache.ts";

/** A failed read. `unauthorized` sends the app to "Sign in again". */
export class ApiFailure extends Error {
  readonly kind: Exclude<ApiResult<unknown>["kind"], "ok">;
  constructor(kind: Exclude<ApiResult<unknown>["kind"], "ok">) {
    super(`survey api: ${kind}`);
    this.kind = kind;
  }
}

/** The value of an ok result; anything else throws an ApiFailure for TanStack Query. */
export function unwrap<T>(result: ApiResult<T>, onUnauthorized: () => void): T {
  if (result.kind === "ok") return result.value;
  if (result.kind === "unauthorized") onUnauthorized();
  throw new ApiFailure(result.kind);
}

export type QueryDeps = { api: SurveyApi; onUnauthorized: () => void };

// structuralSharing is typed (unknown, unknown) => unknown; the values are this query's own
// queryFn results (or its restored copy, checked by sanitizePersisted), hence the casts.

export const listQuery = (d: QueryDeps) =>
  queryOptions({
    queryKey: keys.list,
    queryFn: async (): Promise<SpotList> => unwrap(await d.api.listSpots(), d.onUnauthorized),
    structuralSharing: (old: unknown, next: unknown) =>
      mergeList(old as SpotList | undefined, next as SpotList),
  });

export const spotQuery = (d: QueryDeps, id: string) =>
  queryOptions({
    queryKey: keys.spot(id),
    queryFn: async (): Promise<SurveySpot> => unwrap(await d.api.getSpot(id), d.onUnauthorized),
    // A draft that only exists on this phone has nothing to fetch.
    enabled: !isLocalId(id),
    structuralSharing: (old: unknown, next: unknown) =>
      newerSpot(old as SurveySpot | undefined, next as SurveySpot),
  });

export const campusQuery = (d: QueryDeps) =>
  queryOptions({
    queryKey: keys.campus,
    queryFn: async (): Promise<CampusInfo> => unwrap(await d.api.campus(), d.onUnauthorized),
    staleTime: 24 * 60 * 60 * 1000,
  });
