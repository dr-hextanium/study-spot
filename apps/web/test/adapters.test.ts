// @vitest-environment node
import "fake-indexeddb/auto";
import type { HttpRequest } from "@perch/ui-logic";
import { openDB } from "idb";
import { expect, test, vi } from "vitest";
import { createBroadcastSignal } from "../src/adapters/browser.ts";
import { createFetchHttp, JSON_TIMEOUT_MS } from "../src/adapters/http.ts";
import { openStores } from "../src/adapters/idb.ts";
import {
  createWebLiveness,
  createWebLock,
  type LockApi,
  TAB_LOCK_PREFIX,
} from "../src/adapters/locks.ts";
import { withTimeout } from "../src/adapters/timeout.ts";

let n = 0;
const fresh = () => {
  n += 1;
  return openStores(`test-${n}`);
};

test("the IndexedDB cache stores strings and lists keys by prefix", async () => {
  const { cache } = fresh();
  await cache.set("outbox:w:1", "a");
  await cache.set("outbox:w:2", "b");
  await cache.set("outbox:v:x", "3");
  expect(await cache.get("outbox:w:1")).toBe("a");
  expect((await cache.keys("outbox:w:")).sort()).toEqual(["outbox:w:1", "outbox:w:2"]);
  await cache.delete("outbox:w:1");
  expect(await cache.get("outbox:w:1")).toBeNull();
  expect(await cache.get("missing")).toBeNull();
});

test("the binary store hands back an independent Uint8Array copy", async () => {
  const { blobs } = fresh();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  await blobs.set("photo:1", bytes);
  const got = await blobs.get("photo:1");
  expect(got).toBeInstanceOf(Uint8Array);
  expect([...(got ?? [])]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  await blobs.delete("photo:1");
  expect(await blobs.get("photo:1")).toBeNull();
});

test("a storage call that never settles rejects instead of freezing the queue", async () => {
  vi.useFakeTimers();
  const stuck = withTimeout(new Promise<never>(() => {}), 10, "kv get");
  vi.advanceTimersByTime(10);
  await expect(stuck).rejects.toThrow("kv get timed out after 10 ms");
  vi.useRealTimers();
});

const request = (over: Partial<HttpRequest>): HttpRequest => ({
  method: "GET",
  url: "https://api.example/survey/spots",
  headers: { accept: "application/json" },
  body: null,
  ...over,
});

test("http resolves every status and sends JSON as given", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = createFetchHttp(async (url, init) => {
    calls.push({ url, init });
    return new Response('{"error":"version_conflict"}', { status: 409 });
  });
  const res = await http.send(request({ method: "PUT", body: { kind: "json", json: '{"a":1}' } }));
  expect(res).toEqual({ status: 409, text: '{"error":"version_conflict"}' });
  expect(calls[0]?.init.method).toBe("PUT");
  expect(calls[0]?.init.body).toBe('{"a":1}');
});

test("http sends multipart with the file part and lets FormData set the boundary", async () => {
  let sent: BodyInit | null | undefined;
  const http = createFetchHttp(async (_url, init) => {
    sent = init.body;
    return new Response("{}", { status: 201 });
  });
  await http.send(
    request({
      method: "POST",
      url: "https://api.example/survey/photos",
      headers: { authorization: "Bearer x" },
      body: {
        kind: "multipart",
        fields: { spot_id: "s", client_write_id: "w" },
        file: {
          field: "file",
          filename: "photo.jpg",
          contentType: "image/jpeg",
          bytes: new Uint8Array([1, 2, 3]),
        },
      },
    }),
  );
  expect(sent).toBeInstanceOf(FormData);
  const form = sent as FormData;
  expect(form.get("spot_id")).toBe("s");
  const file = form.get("file");
  expect(file).toBeInstanceOf(Blob);
  expect((file as Blob).type).toBe("image/jpeg");
  expect((file as Blob).size).toBe(3);
});

test("http rejects on a network failure and aborts after the timeout", async () => {
  const down = createFetchHttp(async () => {
    throw new TypeError("Failed to fetch");
  });
  await expect(down.send(request({}))).rejects.toThrow("Failed to fetch");
  vi.useFakeTimers();
  const slow = createFetchHttp(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );
  const pending = slow.send(request({}));
  vi.advanceTimersByTime(JSON_TIMEOUT_MS);
  await expect(pending).rejects.toThrow("aborted");
  vi.useRealTimers();
});

/** Web Locks in memory: exclusive per name, held until the callback settles. */
class FakeLocks implements LockApi {
  private readonly tails = new Map<string, Promise<unknown>>();
  readonly heldNames = new Set<string>();
  request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(name) ?? Promise.resolve();
    const run = prev.then(async () => {
      this.heldNames.add(name);
      try {
        return await callback();
      } finally {
        this.heldNames.delete(name);
      }
    });
    this.tails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  }
  async query(): Promise<{ held: { name: string }[] }> {
    return { held: [...this.heldNames].map((name) => ({ name })) };
  }
}

test("navigator.locks fits the LockApi the adapters take", () => {
  const fits = (api: LockApi) => api;
  if (typeof navigator !== "undefined" && "locks" in navigator) fits(navigator.locks);
  expect(typeof fits).toBe("function");
});

test("the web lock runs holders of one name one at a time", async () => {
  const lock = createWebLock(new FakeLocks());
  const order: string[] = [];
  let release = () => {};
  const first = lock.run(
    "x",
    () =>
      new Promise<void>((resolve) => {
        release = () => {
          order.push("a");
          resolve();
        };
      }),
  );
  const second = lock.run("x", async () => {
    order.push("b");
  });
  await Promise.resolve();
  expect(order).toEqual([]);
  release();
  await Promise.all([first, second]);
  expect(order).toEqual(["a", "b"]);
});

test("a tab's liveness lock is visible to other tabs until it releases", async () => {
  const locks = new FakeLocks();
  let id = 0;
  const ids = {
    uuid: () => {
      id += 1;
      return `tab-${id}`;
    },
  };
  const a = createWebLiveness(locks, ids);
  const b = createWebLiveness(locks, ids);
  const owner = await a.hold();
  expect(owner).toBe("tab-1");
  expect(locks.heldNames.has(`${TAB_LOCK_PREFIX}tab-1`)).toBe(true);
  expect(await b.alive(owner)).toBe(true);
  a.release();
  await Promise.resolve();
  await Promise.resolve();
  expect(await b.alive(owner)).toBe(false);
  expect(await b.alive("never")).toBe(false);
});

test("hold rejects, without hanging or leaking, when the lock request fails", async () => {
  const failing: LockApi = {
    request: () => Promise.reject(new DOMException("denied", "SecurityError")),
    query: async () => ({}),
  };
  const liveness = createWebLiveness(failing, { uuid: () => "t" });
  await expect(liveness.hold()).rejects.toThrow("denied");
  await expect(liveness.hold()).rejects.toThrow("denied");
});

test("release before the grant releases the lock once it is granted", async () => {
  const locks = new FakeLocks();
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const gated: LockApi = {
    request: (name, cb) => gate.then(() => locks.request(name, cb)),
    query: () => locks.query(),
  };
  const liveness = createWebLiveness(gated, { uuid: () => "t" });
  const held = liveness.hold();
  liveness.release();
  open();
  await held;
  await new Promise((r) => setTimeout(r, 0));
  expect(locks.heldNames.size).toBe(0);
});

test("the stores reopen after the browser terminates or blocks the connection", async () => {
  type Opts = Parameters<typeof openDB>[2];
  let opens = 0;
  let opts: Opts | undefined;
  const open = ((name: string, version: number, o: Opts) => {
    opens += 1;
    opts = o;
    return openDB(name, version, o);
  }) as typeof openDB;
  n += 1;
  const { cache } = openStores(`test-${n}`, open);
  await cache.set("a", "1");
  opts?.terminated?.();
  expect(await cache.get("a")).toBe("1");
  expect(opens).toBe(2);
  // blocking(): the connection is closed so an upgrade can proceed, then reopened.
  opts?.blocking?.(1, 2, undefined as never);
  expect(await cache.get("a")).toBe("1");
  expect(opens).toBe(3);
});

test("a failed or timed-out open is not cached", async () => {
  let opens = 0;
  const open = ((name: string, version: number, o: Parameters<typeof openDB>[2]) => {
    opens += 1;
    if (opens === 1) return Promise.reject(new Error("open failed"));
    return openDB(name, version, o);
  }) as typeof openDB;
  n += 1;
  const { cache } = openStores(`test-${n}`, open);
  await expect(cache.get("a")).rejects.toThrow("open failed");
  await cache.set("a", "1");
  expect(await cache.get("a")).toBe("1");
  expect(opens).toBe(2);

  vi.useFakeTimers();
  let hang = true;
  const slowOpen = ((name: string, version: number, o: Parameters<typeof openDB>[2]) =>
    hang ? new Promise(() => {}) : openDB(name, version, o)) as typeof openDB;
  n += 1;
  const slow = openStores(`test-${n}`, slowOpen).cache;
  const stuck = slow.get("a");
  const assertion = expect(stuck).rejects.toThrow("timed out");
  vi.advanceTimersByTime(10_000);
  await assertion;
  vi.useRealTimers();
  hang = false;
  expect(await slow.get("a")).toBeNull();
});

test("a BroadcastChannel that throws leaves a no-op signal", () => {
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw new Error("blocked");
      }
    },
  );
  try {
    const signal = createBroadcastSignal("x");
    expect(() => signal.post()).not.toThrow();
    expect(() => signal.subscribe(() => {})()).not.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
