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

/** Cache whose reads and/or writes reject, like a failing IndexedDB. */
export class FailingCache implements KeyValueCache {
  readonly failGet: boolean;
  readonly failSet: boolean;
  constructor(failGet: boolean, failSet: boolean) {
    this.failGet = failGet;
    this.failSet = failSet;
  }
  async get(_key: string): Promise<string | null> {
    if (this.failGet) throw new Error("cache read failed");
    return null;
  }
  async set(_key: string, _value: string): Promise<void> {
    if (this.failSet) throw new Error("quota exceeded");
  }
}
