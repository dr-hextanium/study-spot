import { beforeEach, expect, test } from "bun:test";
import { makeBundleFixture } from "../../core/test/fixtures/bundle-v1.ts";
import { LAST_GOOD_KEY, loadBundle } from "../src/index.ts";
import { FakeFetch, fixedClock, MemoryCache } from "./fakes.ts";

const BASE = "https://cdn.example/data/sbu";
const HASH = "a1b2c3d4e5f60718";
const pointer = (schema_version = 1, hash = HASH) =>
  JSON.stringify({
    schema_version,
    hash,
    url: `bundle.${hash}.json`,
    generated_at: "2026-10-13T18:00:00.000Z",
  });
const ok = (text: string) => ({ status: 200, text });

let cache: MemoryCache;
const clock = fixedClock("2026-10-16T18:00:00Z");

beforeEach(() => {
  cache = new MemoryCache();
});

test("fresh load fetches pointer then bundle and caches it", async () => {
  const fetch = new FakeFetch(
    new Map([
      [`${BASE}/bundle-latest.json`, ok(pointer())],
      [`${BASE}/bundle.${HASH}.json`, ok(JSON.stringify(makeBundleFixture()))],
    ]),
  );
  const r = await loadBundle({ fetch, cache, clock }, BASE);
  expect(r.status).toBe("fresh");
  if (r.status !== "unavailable") expect(r.ageDays).toBe(3);
  expect(await cache.get(LAST_GOOD_KEY)).not.toBeNull();
});

test("same hash as cache skips the bundle download", async () => {
  const routes = new Map([
    [`${BASE}/bundle-latest.json`, ok(pointer())],
    [`${BASE}/bundle.${HASH}.json`, ok(JSON.stringify(makeBundleFixture()))],
  ]);
  await loadBundle({ fetch: new FakeFetch(routes), cache, clock }, BASE);
  const second = new FakeFetch(routes);
  const r = await loadBundle({ fetch: second, cache, clock }, BASE);
  expect(r.status).toBe("fresh");
  expect(second.calls).toEqual([`${BASE}/bundle-latest.json`]);
});

test("offline with a cached bundle returns it as cached", async () => {
  const routes = new Map([
    [`${BASE}/bundle-latest.json`, ok(pointer())],
    [`${BASE}/bundle.${HASH}.json`, ok(JSON.stringify(makeBundleFixture()))],
  ]);
  await loadBundle({ fetch: new FakeFetch(routes), cache, clock }, BASE);
  const offline = new FakeFetch(routes);
  offline.offline = true;
  const r = await loadBundle({ fetch: offline, cache, clock }, BASE);
  expect(r.status).toBe("cached");
});

test("offline with no cache is unavailable", async () => {
  const offline = new FakeFetch(new Map());
  offline.offline = true;
  expect(await loadBundle({ fetch: offline, cache, clock }, BASE)).toEqual({
    status: "unavailable",
    reason: "offline_no_cache",
  });
});

test("newer major version with no cache asks for an update", async () => {
  const fetch = new FakeFetch(new Map([[`${BASE}/bundle-latest.json`, ok(pointer(2))]]));
  expect(await loadBundle({ fetch, cache, clock }, BASE)).toEqual({
    status: "unavailable",
    reason: "update_required",
  });
});

test("newer major version with a cache keeps using the cache", async () => {
  const routes = new Map([
    [`${BASE}/bundle-latest.json`, ok(pointer())],
    [`${BASE}/bundle.${HASH}.json`, ok(JSON.stringify(makeBundleFixture()))],
  ]);
  await loadBundle({ fetch: new FakeFetch(routes), cache, clock }, BASE);
  const v2 = new FakeFetch(
    new Map([[`${BASE}/bundle-latest.json`, ok(pointer(2, "ffffffffffffffff"))]]),
  );
  const r = await loadBundle({ fetch: v2, cache, clock }, BASE);
  expect(r.status).toBe("cached");
});

test("corrupt cache and corrupt download are both ignored", async () => {
  await cache.set(LAST_GOOD_KEY, "{not json");
  const fetch = new FakeFetch(
    new Map([
      [`${BASE}/bundle-latest.json`, ok(pointer())],
      [`${BASE}/bundle.${HASH}.json`, ok('{"schema_version":1}')],
    ]),
  );
  expect(await loadBundle({ fetch, cache, clock }, BASE)).toEqual({
    status: "unavailable",
    reason: "offline_no_cache",
  });
});

test("http error status is treated like a network failure", async () => {
  const fetch = new FakeFetch(new Map([[`${BASE}/bundle-latest.json`, { status: 503, text: "" }]]));
  expect((await loadBundle({ fetch, cache, clock }, BASE)).status).toBe("unavailable");
});
