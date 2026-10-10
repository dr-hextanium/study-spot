import { beforeEach, expect, test } from "bun:test";
import { type BundleState, createBundleStore, lastGoodKey, loadBundle } from "../src/index.ts";
import { BASE, HASH_A, HASH_B, routesFor } from "./bundleRoutes.ts";
import { FakeFetch, FakeForeground, FakeNetwork, MemoryCache, mutableClock } from "./fakes.ts";

const T0 = "2026-10-13T18:00:00Z";
const pointerCalls = (f: FakeFetch): number =>
  f.calls.filter((u) => u.endsWith("/bundle-latest.json")).length;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** Holds every request until `open()`, like a slow network. */
class GatedFetch extends FakeFetch {
  private release: () => void = () => {};
  private readonly gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  open(): void {
    this.release();
  }
  override async getText(url: string) {
    await this.gate;
    return super.getText(url);
  }
}

let cache: MemoryCache;
let clock: ReturnType<typeof mutableClock>;
let foreground: FakeForeground;
let network: FakeNetwork;

beforeEach(() => {
  cache = new MemoryCache();
  clock = mutableClock(T0);
  foreground = new FakeForeground();
  network = new FakeNetwork();
});

const make = (fetch: FakeFetch) =>
  createBundleStore({ fetch, cache, clock, foreground, network }, BASE);
const seed = async (hash: string): Promise<void> => {
  await loadBundle({ fetch: new FakeFetch(routesFor(hash)), cache, clock }, BASE);
};
const ready = (s: BundleState) => {
  if (s.phase !== "ready") throw new Error(`expected ready, got ${s.phase}`);
  return s;
};
const hashOf = async (): Promise<string> => {
  const raw = await cache.get(lastGoodKey(BASE));
  return raw === null ? "" : (JSON.parse(raw) as { hash: string }).hash;
};

test("shows the cached bundle at once, then the fresh one", async () => {
  await seed(HASH_A);
  const fetch = new GatedFetch(routesFor(HASH_B));
  const store = make(fetch);
  expect(store.getSnapshot()).toEqual({ phase: "loading" });
  const started = store.start();
  await flush();
  const first = ready(store.getSnapshot());
  expect(first.load.status).toBe("cached");
  expect(first.refreshing).toBe(true);
  fetch.open();
  await started;
  const done = ready(store.getSnapshot());
  expect(done.load.status).toBe("fresh");
  expect(done.refreshing).toBe(false);
  expect(done.checkFailed).toBe(false);
  expect(await hashOf()).toBe(HASH_B);
});

test("offline with no cache", async () => {
  const fetch = new FakeFetch(new Map());
  fetch.offline = true;
  const store = make(fetch);
  await store.start();
  expect(store.getSnapshot()).toEqual({ phase: "unavailable", reason: "offline_no_cache" });
});

test("offline with cache", async () => {
  await seed(HASH_A);
  const fetch = new FakeFetch(routesFor(HASH_A));
  fetch.offline = true;
  const store = make(fetch);
  await store.start();
  const s = ready(store.getSnapshot());
  expect(s.load.status).toBe("cached");
  expect(s.checkFailed).toBe(true);
});

test("a newer schema with cache is an update, not offline", async () => {
  await seed(HASH_A);
  const routes = routesFor(HASH_A);
  routes.set(`${BASE}/bundle-latest.json`, {
    status: 200,
    text: JSON.stringify({
      schema_version: 2,
      hash: HASH_B,
      url: `bundle.${HASH_B}.json`,
      generated_at: "2026-10-13T18:00:00.000Z",
    }),
  });
  const store = make(new FakeFetch(routes));
  await store.start();
  const s = ready(store.getSnapshot());
  expect(s.load.updateAvailable).toBe(true);
  expect(s.checkFailed).toBe(false);

  cache = new MemoryCache();
  const bare = make(new FakeFetch(routes));
  await bare.start();
  expect(bare.getSnapshot()).toEqual({ phase: "unavailable", reason: "update_required" });
});

test("corrects time only from a network Date", async () => {
  const fetch = new FakeFetch(routesFor(HASH_A));
  fetch.date = "Tue, 13 Oct 2026 21:00:00 GMT";
  const store = make(fetch);
  await store.start();
  expect(store.now().getTime()).toBe(clock.now().getTime() + 3 * 3_600_000);

  cache = new MemoryCache();
  await seed(HASH_A);
  const down = new FakeFetch(routesFor(HASH_A));
  down.offline = true;
  down.date = "Tue, 13 Oct 2026 21:00:00 GMT";
  const offline = make(down);
  await offline.start();
  expect(offline.now().getTime()).toBe(clock.now().getTime());
});

test("revalidates on foreground only after 5 minutes", async () => {
  const fetch = new FakeFetch(routesFor(HASH_A));
  const store = make(fetch);
  await store.start();
  expect(pointerCalls(fetch)).toBe(1);
  foreground.fire();
  await flush();
  expect(pointerCalls(fetch)).toBe(1);
  clock.set("2026-10-13T18:06:00Z");
  foreground.fire();
  await flush();
  expect(pointerCalls(fetch)).toBe(2);
});

test("revalidates when the network comes back", async () => {
  const fetch = new FakeFetch(routesFor(HASH_A));
  const store = make(fetch);
  await store.start();
  network.set(true);
  await flush();
  expect(pointerCalls(fetch)).toBe(2);
});

test("concurrent refreshes share one request", async () => {
  const fetch = new FakeFetch(routesFor(HASH_A));
  const store = make(fetch);
  await store.start();
  await Promise.all([store.refresh(), store.refresh()]);
  expect(pointerCalls(fetch)).toBe(2);
});

test("a failed refresh keeps the bundle on screen", async () => {
  const fetch = new FakeFetch(routesFor(HASH_A));
  const store = make(fetch);
  await store.start();
  fetch.offline = true;
  await store.refresh();
  const s = ready(store.getSnapshot());
  expect(s.checkFailed).toBe(true);
  expect(s.refreshing).toBe(false);
});

test("stop unsubscribes", async () => {
  const fetch = new FakeFetch(routesFor(HASH_A));
  const store = make(fetch);
  await store.start();
  store.stop();
  clock.set("2026-10-13T19:00:00Z");
  foreground.fire();
  network.set(true);
  await flush();
  expect(pointerCalls(fetch)).toBe(1);
});
