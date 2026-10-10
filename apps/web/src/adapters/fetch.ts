import type { Fetch } from "@perch/ui-logic";
import { withTimeout } from "./timeout.ts";

export const FETCH_TIMEOUT_MS = 10_000;
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** GETs for the static data site: no cookies, always revalidated, bounded in time. */
export function createFetch(
  fetchFn: FetchFn = (i, init) => fetch(i, init),
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Fetch {
  return {
    async getText(url) {
      const res = await withTimeout(
        fetchFn(url, { cache: "no-cache", credentials: "omit" }),
        timeoutMs,
        `GET ${url}`,
      );
      const text = await withTimeout(res.text(), timeoutMs, `body of ${url}`);
      return { status: res.status, text, date: res.headers.get("date") };
    },
  };
}
