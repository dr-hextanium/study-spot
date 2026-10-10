import type {
  BinaryCache,
  Clock,
  Fetch,
  FetchResponse,
  FetchTextResponse,
  Foreground,
  Http,
  HttpRequest,
  Ids,
  KeyValueCache,
  KeyValueStorage,
  Lock,
  NetworkStatus,
  Timers,
} from "../src/index.ts";
import { createLocalLock } from "../src/index.ts";

export class MemoryCache implements KeyValueCache {
  readonly data = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
}

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

/** Routes URL to a response. Missing routes and "offline" mode reject like a network error. */
export class FakeFetch implements Fetch {
  offline = false;
  /** The Date header every response carries. */
  date: string | null = null;
  readonly calls: string[] = [];
  readonly routes: Map<string, FetchResponse>;
  constructor(routes: Map<string, FetchResponse>) {
    this.routes = routes;
  }
  async getText(url: string): Promise<FetchTextResponse> {
    this.calls.push(url);
    if (this.offline) throw new Error("network down");
    const r = this.routes.get(url);
    if (!r) throw new Error(`no route for ${url}`);
    return { ...r, date: this.date };
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
  async delete(_key: string): Promise<void> {
    if (this.failSet) throw new Error("quota exceeded");
  }
  async keys(_prefix: string): Promise<string[]> {
    if (this.failGet) throw new Error("cache read failed");
    return [];
  }
}

/** A clock tests can move, including backwards. */
export function mutableClock(iso: string): Clock & { set(iso: string): void } {
  let now = new Date(iso);
  return {
    now: () => now,
    set: (next) => {
      now = new Date(next);
    },
  };
}

export class MemoryBinary implements BinaryCache {
  readonly data = new Map<string, Uint8Array>();
  async get(key: string): Promise<Uint8Array | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, bytes: Uint8Array): Promise<void> {
    this.data.set(key, bytes);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Valid v4 uuids in sequence; `prefix` keeps two generators apart. */
export function sequentialIds(prefix = "8000"): Ids {
  let n = 0;
  return {
    uuid: () => {
      n += 1;
      return `00000000-0000-4000-${prefix}-${n.toString(16).padStart(12, "0")}`;
    },
  };
}

/** Manual timers: nothing fires until `advance`. */
export class FakeTimers implements Timers {
  private time = 0;
  private seq = 0;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();
  after(ms: number, fn: () => void): () => void {
    this.seq += 1;
    const id = this.seq;
    this.pending.set(id, { at: this.time + ms, fn });
    return () => {
      this.pending.delete(id);
    };
  }
  /** Delays of the scheduled timers from now, soonest first. */
  scheduled(): number[] {
    return [...this.pending.values()].map((p) => p.at - this.time).sort((a, b) => a - b);
  }
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let next: { id: number; at: number; fn: () => void } | null = null;
      for (const [id, p] of this.pending) {
        if (p.at <= end && (next === null || p.at < next.at)) next = { id, ...p };
      }
      if (next === null) break;
      this.pending.delete(next.id);
      this.time = next.at;
      next.fn();
    }
    this.time = end;
  }
}

export class FakeNetwork implements NetworkStatus {
  private state = true;
  private readonly listeners = new Set<(online: boolean) => void>();
  online(): boolean {
    return this.state;
  }
  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  set(online: boolean): void {
    this.state = online;
    for (const l of this.listeners) l(online);
  }
}

export class FakeForeground implements Foreground {
  private readonly listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  fire(): void {
    for (const l of this.listeners) l();
  }
}

/** Answers requests from a queue of replies; "offline" or an empty queue rejects. */
export class ScriptedHttp implements Http {
  readonly requests: HttpRequest[] = [];
  readonly replies: (FetchResponse | "offline")[] = [];
  async send(request: HttpRequest): Promise<FetchResponse> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined || reply === "offline") throw new Error("network down");
    return reply;
  }
}

/** An in-process lock that records every hold and fails if two holds overlap. */
export class RecordingLock implements Lock {
  readonly names: string[] = [];
  private inner = createLocalLock();
  private held = false;
  run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this.inner.run(name, async () => {
      if (this.held) throw new Error("lock held twice");
      this.held = true;
      this.names.push(name);
      try {
        return await fn();
      } finally {
        this.held = false;
      }
    });
  }
}
