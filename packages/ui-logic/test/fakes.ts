import type { Clock, Fetch, FetchResponse, KeyValueCache } from "../src/index.ts";

export class MemoryCache implements KeyValueCache {
  readonly data = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
}

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

/** Routes URL to a response. Missing routes and "offline" mode reject like a network error. */
export class FakeFetch implements Fetch {
  offline = false;
  readonly calls: string[] = [];
  readonly routes: Map<string, FetchResponse>;
  constructor(routes: Map<string, FetchResponse>) {
    this.routes = routes;
  }
  async getText(url: string): Promise<FetchResponse> {
    this.calls.push(url);
    if (this.offline) throw new Error("network down");
    const r = this.routes.get(url);
    if (!r) throw new Error(`no route for ${url}`);
    return r;
  }
}
