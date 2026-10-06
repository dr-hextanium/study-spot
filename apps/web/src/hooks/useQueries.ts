import { useQuery } from "@tanstack/react-query";
import { useDeps } from "../app/AppProvider.tsx";
import { campusQuery, listQuery, type QueryDeps, spotQuery } from "../app/queries.ts";

export function useQueryDeps(): QueryDeps {
  const { api, auth } = useDeps();
  return { api, onUnauthorized: auth.markSignedOut };
}

export const useSpotList = () => useQuery(listQuery(useQueryDeps()));
export const useServerSpot = (id: string) => useQuery(spotQuery(useQueryDeps(), id));
export const useCampus = () => useQuery(campusQuery(useQueryDeps()));

/** The campus time zone for "checked today"; the phone's zone until the campus has loaded. */
export function useCampusTz(): string {
  const campus = useCampus();
  return campus.data?.campus.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
