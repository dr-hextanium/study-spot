import { expect, test } from "bun:test";
import { pick_daily, pick_ping } from "@perch/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
import { createPingCounter, type PingRow } from "../src/ping/counter.ts";
import { flushPicks } from "../src/ping/flush.ts";
import { createKnownSpots } from "../src/ping/knownSpots.ts";
import { createRateLimiter } from "../src/ping/rateLimit.ts";
import { createPublisher } from "../src/publish/publisher.ts";
import { fakePages, target } from "./fakePages.ts";
import { DATA_BASE_URL, manualTimers, setup, testClock, WEB_ORIGIN } from "./helpers.ts";

const SPOT_A = "11111111-1111-4111-8111-111111111111";
const SPOT_B = "22222222-2222-4222-8222-222222222222";
const MIN = 60_000;

function harness(opts: { fail?: boolean; maxKeys?: number } = {}) {
  const clock = testClock();
  const timers = manualTimers();
  const batches: PingRow[][] = [];
  const state = { fail: opts.fail ?? false };
  const logs: string[] = [];
  const counter = createPingCounter({
    clock,
    timers,
    ...(opts.maxKeys === undefined ? {} : { maxKeys: opts.maxKeys }),
    log: (m) => logs.push(m),
    flush: async (rows) => {
      if (state.fail) throw new Error("secret body with 10.0.0.9");
      batches.push(rows);
    },
  });
  return { clock, timers, batches, state, logs, counter };
}

/** PGlite answers `{ rows }`; parse it instead of trusting an unknown result. */
function rowsOf<T extends z.ZodType>(result: unknown, row: T): z.infer<T>[] {
  return z.object({ rows: z.array(row) }).parse(result).rows;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

test("counter groups by spot and UTC hour; flushNow sends one batch and empties", async () => {
  const h = harness();
  h.counter.add(SPOT_A);
  h.counter.add(SPOT_A);
  h.counter.add(SPOT_B);
  h.clock.advance(60 * MIN);
  h.counter.add(SPOT_A);
  expect(h.counter.pending()).toBe(4);
  await h.counter.flushNow();
  expect(h.batches).toHaveLength(1);
  const rows = [...(h.batches[0] ?? [])].sort((a, b) =>
    `${a.spot_id}${a.at}`.localeCompare(`${b.spot_id}${b.at}`),
  );
  expect(rows).toEqual([
    { spot_id: SPOT_A, at: "2026-10-13T18:00:00.000Z", count: 2 },
    { spot_id: SPOT_A, at: "2026-10-13T19:00:00.000Z", count: 1 },
    { spot_id: SPOT_B, at: "2026-10-13T18:00:00.000Z", count: 1 },
  ]);
  expect(h.counter.pending()).toBe(0);
  await h.counter.flushNow();
  expect(h.batches).toHaveLength(1);
});

test("idle timer flushes once, 10 minutes after the last ping", async () => {
  const h = harness();
  h.counter.add(SPOT_A);
  h.timers.advance(9 * MIN);
  h.counter.add(SPOT_A);
  h.timers.advance(9 * MIN);
  await tick();
  expect(h.batches).toHaveLength(0);
  h.timers.advance(1 * MIN);
  await tick();
  expect(h.batches).toHaveLength(1);
  expect(h.batches[0]?.[0]?.count).toBe(2);
  h.timers.advance(120 * MIN);
  await tick();
  expect(h.batches).toHaveLength(1);
});

test("max-age timer flushes at 60 minutes even with steady pings", async () => {
  const h = harness();
  for (let i = 0; i < 12; i += 1) {
    h.counter.add(SPOT_A);
    h.timers.advance(5 * MIN);
    await tick();
    if (i < 11) expect(h.batches).toHaveLength(0);
  }
  expect(h.batches).toHaveLength(1);
  expect(h.batches[0]?.reduce((n, r) => n + r.count, 0)).toBe(12);
});

test("the 500th key flushes at once", async () => {
  const h = harness({ maxKeys: 500 });
  for (let i = 0; i < 499; i += 1) {
    h.counter.add(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  }
  await tick();
  expect(h.batches).toHaveLength(0);
  h.counter.add("00000000-0000-4000-8000-999999999999");
  await tick();
  expect(h.batches).toHaveLength(1);
  expect(h.batches[0]).toHaveLength(500);
});

test("a failed flush keeps the counts, logs without the error body, and retries", async () => {
  const h = harness({ fail: true });
  h.counter.add(SPOT_A);
  h.counter.add(SPOT_A);
  await h.counter.flushNow();
  expect(h.counter.pending()).toBe(2);
  expect(h.logs).toEqual(["pick flush failed"]);
  h.counter.add(SPOT_A);
  h.state.fail = false;
  await h.counter.flushNow();
  expect(h.batches[0]?.[0]?.count).toBe(3);
  // The failed flush re-armed the idle timer, so a retry happens on its own.
  const h2 = harness({ fail: true });
  h2.counter.add(SPOT_B);
  await h2.counter.flushNow();
  h2.state.fail = false;
  h2.timers.advance(10 * MIN);
  await tick();
  expect(h2.batches[0]?.[0]?.count).toBe(1);
});

test("close flushes what is pending", async () => {
  const h = harness();
  h.counter.add(SPOT_A);
  await h.counter.close();
  expect(h.batches).toHaveLength(1);
  expect(h.timers.pending()).toBe(0);
});

test("rate limiter allows the limit per window per key, then resets", () => {
  const clock = testClock();
  const limiter = createRateLimiter({ clock, limit: 2, windowMs: 3_600_000 });
  expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("a")).toBe(false);
  expect(limiter.allow("b")).toBe(true);
  clock.advance(3_600_001);
  expect(limiter.allow("a")).toBe(true);
});

test("rate limiter stays bounded by maxKeys", () => {
  const limiter = createRateLimiter({ clock: testClock(), limit: 1, windowMs: 60_000, maxKeys: 3 });
  for (const k of ["a", "b", "c", "d"]) expect(limiter.allow(k)).toBe(true);
  // "a" was evicted to stay bounded, so it counts as new.
  expect(limiter.allow("a")).toBe(true);
});

test("flushPicks folds hours into the campus day and drops unknown and draft spots", async () => {
  const ctx = await setup();
  const reading = ctx.ids.spotIds["central-reading-room"];
  const draft = ctx.ids.spotIds["union-draft"];
  const rows: PingRow[] = [
    { spot_id: reading, at: "2026-10-13T18:00:00.000Z", count: 3 },
    { spot_id: reading, at: "2026-10-13T19:00:00.000Z", count: 1 },
    { spot_id: draft, at: "2026-10-13T18:00:00.000Z", count: 5 },
    { spot_id: SPOT_A, at: "2026-10-13T18:00:00.000Z", count: 7 },
  ];
  await flushPicks(ctx.db, "sbu", rows);
  expect(await ctx.db.select().from(pick_daily)).toEqual([
    { spot_id: reading, day: "2026-10-13", count: 4 },
  ]);
  await flushPicks(ctx.db, "sbu", rows);
  expect(await ctx.db.select().from(pick_daily)).toEqual([
    { spot_id: reading, day: "2026-10-13", count: 8 },
  ]);
  await flushPicks(ctx.db, "sbu", []);
});

async function pingApp(opts: { logStream?: { write(m: string): void }; hops?: number } = {}) {
  const ctx = await setup();
  const pings = createPingCounter({
    clock: ctx.clock,
    timers: manualTimers(),
    flush: (rows) => flushPicks(ctx.db, "sbu", rows),
  });
  const app = await buildApp({
    db: ctx.db,
    clock: ctx.clock,
    config: {
      webOrigin: WEB_ORIGIN,
      campusId: "sbu",
      commit: null,
      ...(opts.hops === undefined ? {} : { trustProxyHops: opts.hops }),
    },
    publisher: ctx.publisher,
    photos: ctx.photos,
    pings,
    logger: opts.logStream ? { stream: opts.logStream } : false,
  });
  const ping = (spotId: string, ip: string, extra: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/ping/pick",
      headers: { "content-type": "text/plain", "x-forwarded-for": ip, ...extra },
      payload: JSON.stringify({ spot_id: spotId }),
    });
  return { ctx, app, pings, ping };
}

test("POST /ping/pick answers an empty 204 and counts one", async () => {
  const { ctx, pings, ping } = await pingApp();
  const res = await ping(ctx.ids.spotIds["central-reading-room"], "203.0.113.1");
  expect(res.statusCode).toBe(204);
  expect(res.body).toBe("");
  expect(pings.pending()).toBe(1);
});

test("a bad uuid, bad JSON or a missing field answers 400 and is not counted", async () => {
  const { app, pings } = await pingApp();
  const send = (payload: string) =>
    app.inject({
      method: "POST",
      url: "/ping/pick",
      headers: { "content-type": "text/plain" },
      payload,
    });
  expect((await send(JSON.stringify({ spot_id: "nope" }))).statusCode).toBe(400);
  expect((await send("{not json")).statusCode).toBe(400);
  expect((await send("{}")).statusCode).toBe(400);
  expect(pings.pending()).toBe(0);
});

test("the 31st ping an hour from one client is 204 but not counted; clients are separate", async () => {
  const { ctx, pings, ping } = await pingApp();
  const reading = ctx.ids.spotIds["central-reading-room"];
  for (let i = 0; i < 30; i += 1) {
    expect((await ping(reading, "203.0.113.1")).statusCode).toBe(204);
  }
  for (let i = 0; i < 30; i += 1) {
    expect((await ping(reading, "203.0.113.2")).statusCode).toBe(204);
  }
  const over = await ping(reading, "203.0.113.1");
  expect(over.statusCode).toBe(204);
  expect(over.body).toBe("");
  await pings.flushNow();
  const stored = await ctx.db.select().from(pick_daily);
  expect(stored).toEqual([{ spot_id: reading, day: "2026-10-13", count: 60 }]);
});

test("privacy: nothing about the requester is logged", async () => {
  const lines: string[] = [];
  const { ctx, app, ping } = await pingApp({ logStream: { write: (m) => lines.push(m) } });
  const reading = ctx.ids.spotIds["central-reading-room"];
  // Sanity: the sink does capture ordinary routes, so an empty result below means something.
  await app.inject({ method: "GET", url: "/health" });
  const before = lines.length;
  expect(before).toBeGreaterThan(0);
  for (let i = 0; i < 5; i += 1) await ping(reading, "203.0.113.9");
  await ping("not-a-uuid", "203.0.113.9");
  const after = lines.slice(before).join("\n");
  expect(after).not.toContain("203.0.113.9");
  expect(after).not.toContain(reading);
  expect(after).toBe("");
});

test("privacy: nothing about the requester is persisted", async () => {
  const { ctx, pings, ping } = await pingApp();
  const reading = ctx.ids.spotIds["central-reading-room"];
  const ip = "203.0.113.77";
  for (let i = 0; i < 5; i += 1) {
    await ping(reading, ip, {
      "user-agent": "UniqueAgent/9.9",
      authorization: "Bearer device-secret-123",
    });
  }
  await pings.flushNow();
  expect(await ctx.db.select().from(pick_daily)).toEqual([
    { spot_id: reading, day: "2026-10-13", count: 5 },
  ]);
  // The per-ping table stays empty, and pick_daily has no column that could hold a requester.
  expect(await ctx.db.select().from(pick_ping)).toEqual([]);
  const cols = rowsOf(
    await ctx.db.execute(
      sql`select column_name from information_schema.columns where table_name = 'pick_daily' order by column_name`,
    ),
    z.object({ column_name: z.string() }),
  );
  expect(cols.map((r) => r.column_name)).toEqual(["count", "day", "spot_id"]);
  // Dump every table: neither the address, the agent, nor the token appears anywhere.
  const tables = rowsOf(
    await ctx.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    ),
    z.object({ table_name: z.string() }),
  );
  expect(tables.length).toBeGreaterThan(5);
  for (const t of tables) {
    const dump = await ctx.db.execute(
      sql`select row_to_json(x)::text as j from ${sql.identifier(t.table_name)} x`,
    );
    const text = JSON.stringify(dump);
    expect(text).not.toContain(ip);
    expect(text).not.toContain("UniqueAgent");
    expect(text).not.toContain("device-secret-123");
  }
});

test("a client-sent x-forwarded-for entry cannot dodge the limit", async () => {
  const { ctx, pings, ping } = await pingApp();
  const reading = ctx.ids.spotIds["central-reading-room"];
  // The proxy appends the real address last; earlier entries are client-controlled.
  for (let i = 0; i < 31; i += 1) await ping(reading, `10.9.9.${i}, 203.0.113.5`);
  expect(pings.pending()).toBe(30);
});

test("an unknown or draft spot id answers 204 and is not counted", async () => {
  const { ctx, pings, ping } = await pingApp();
  const unknown = await ping(SPOT_A, "203.0.113.1");
  const draft = await ping(ctx.ids.spotIds["union-draft"], "203.0.113.1");
  expect(unknown.statusCode).toBe(204);
  expect(unknown.body).toBe("");
  expect(draft.statusCode).toBe(204);
  expect(pings.pending()).toBe(0);
});

test("known spots load lazily, are cached for an hour, and keep the old set on failure", async () => {
  const clock = testClock();
  let loads = 0;
  let fail = false;
  const known = createKnownSpots({
    clock,
    load: async () => {
      loads += 1;
      if (fail) throw new Error("db asleep");
      return [SPOT_A];
    },
  });
  expect(loads).toBe(0);
  expect(await known.has(SPOT_A)).toBe(true);
  expect(await known.has(SPOT_B)).toBe(false);
  expect(loads).toBe(1);
  // An hour, so steady pings wake the database at most hourly; a publish invalidates sooner.
  clock.advance(59 * MIN);
  await known.has(SPOT_A);
  expect(loads).toBe(1);
  clock.advance(2 * MIN);
  fail = true;
  expect(await known.has(SPOT_A)).toBe(true);
  expect(loads).toBe(2);
  // A failed refresh waits out the interval too, so a down database is not hammered.
  await known.has(SPOT_A);
  expect(loads).toBe(2);
  known.invalidate();
  fail = false;
  await known.has(SPOT_A);
  expect(loads).toBe(3);
});

test("with no known set and a failing load, nothing counts", async () => {
  const known = createKnownSpots({
    clock: testClock(),
    load: async () => {
      throw new Error("db asleep");
    },
  });
  expect(await known.has(SPOT_A)).toBe(false);
});

test("after a failed flush, key-count flushes back off until the idle timer", async () => {
  const h = harness();
  let attempts = 0;
  const failing = createPingCounter({
    clock: h.clock,
    timers: h.timers,
    maxKeys: 3,
    flush: async () => {
      attempts += 1;
      throw new Error("down");
    },
  });
  for (let i = 0; i < 3; i += 1) failing.add(`00000000-0000-4000-8000-00000000000${i}`);
  await tick();
  expect(attempts).toBe(1);
  for (let i = 3; i < 10; i += 1) failing.add(`00000000-0000-4000-8000-00000000000${i}`);
  await tick();
  expect(attempts).toBe(1);
  h.timers.advance(10 * MIN);
  await tick();
  expect(attempts).toBe(2);
});

test("retained keys are capped, dropping the oldest", async () => {
  const batches: PingRow[][] = [];
  let down = true;
  const counter = createPingCounter({
    clock: testClock(),
    timers: manualTimers(),
    maxKeys: 3,
    maxRetainedKeys: 5,
    flush: async (rows) => {
      if (down) throw new Error("down");
      batches.push(rows);
    },
  });
  const id = (i: number) => `00000000-0000-4000-8000-00000000000${i}`;
  for (let i = 0; i < 3; i += 1) counter.add(id(i));
  await tick();
  for (let i = 3; i < 9; i += 1) counter.add(id(i));
  await tick();
  down = false;
  await counter.flushNow();
  const kept = (batches[0] ?? []).map((r) => r.spot_id).sort();
  expect(kept).toEqual([4, 5, 6, 7, 8].map(id));
});

test("a flush succeeding again resumes key-count flushes", async () => {
  const h = harness({ maxKeys: 2 });
  h.state.fail = true;
  h.counter.add(SPOT_A);
  h.counter.add(SPOT_B);
  await tick();
  expect(h.counter.pending()).toBe(2);
  h.state.fail = false;
  await h.counter.flushNow();
  h.counter.add(SPOT_A);
  h.counter.add(SPOT_B);
  await tick();
  expect(h.batches).toHaveLength(2);
});

test("TRUST_PROXY_HOPS: 0 ignores x-forwarded-for, 2 skips one more proxy", async () => {
  const direct = await pingApp({ hops: 0 });
  const reading = direct.ctx.ids.spotIds["central-reading-room"];
  for (let i = 0; i < 31; i += 1) await direct.ping(reading, `203.0.113.${i}`);
  expect(direct.pings.pending()).toBe(30);

  const two = await pingApp({ hops: 2 });
  const r2 = two.ctx.ids.spotIds["central-reading-room"];
  // Edge appended last, proxy before it: the client is the entry two hops from the socket.
  for (let i = 0; i < 31; i += 1) await two.ping(r2, `203.0.113.5, 10.1.1.${i}`);
  expect(two.pings.pending()).toBe(30);
});

test("privacy: a request logged by the server carries no address or forwarded header", async () => {
  const lines: string[] = [];
  const { app } = await pingApp({ logStream: { write: (m) => lines.push(m) } });
  await app.inject({
    method: "GET",
    url: "/health",
    remoteAddress: "198.51.100.7",
    headers: { "x-forwarded-for": "203.0.113.50", forwarded: "for=203.0.113.51" },
  });
  const out = lines.join("\n");
  expect(out).toContain("/health");
  expect(out).not.toContain("198.51.100.7");
  expect(out).not.toContain("203.0.113.50");
  expect(out).not.toContain("203.0.113.51");
  expect(out).not.toContain("remoteAddress");
});

/** One ping a minute for `minutes`, moving the clock and the timers together. */
async function steadyPings(
  h: ReturnType<typeof harness>,
  minutes: number,
  onMinute?: (m: number) => void,
) {
  for (let m = 1; m <= minutes; m += 1) {
    h.counter.add(SPOT_A);
    h.clock.advance(MIN);
    h.timers.advance(MIN);
    await tick();
    onMinute?.(m);
  }
}

test("continuous pings never starve the flush, even across a failed one", async () => {
  const h = harness({ fail: true });
  let failedAt = 0;
  let okAt = 0;
  await steadyPings(h, 90, (m) => {
    if (h.logs.length > 0 && failedAt === 0) {
      failedAt = m;
      h.state.fail = false;
    }
    if (h.batches.length > 0 && okAt === 0) okAt = m;
  });
  // The 60-minute cap fires despite a ping every minute, and fails.
  expect(failedAt).toBe(60);
  // Backing off does not push the idle timer back: the retry lands 10 minutes later.
  expect(okAt).toBe(70);
});

test("after a failed flush, steady pings do not push the retry back", async () => {
  const h = harness();
  h.state.fail = true;
  h.counter.add(SPOT_A);
  await h.counter.flushNow();
  expect(h.logs).toEqual(["pick flush failed"]);
  h.state.fail = false;
  await steadyPings(h, 9);
  expect(h.batches).toHaveLength(0);
  await steadyPings(h, 1);
  expect(h.batches).toHaveLength(1);
});

test("the retained-key cap drops the oldest hour, not the first inserted", async () => {
  const clock = testClock();
  const batches: PingRow[][] = [];
  let down = true;
  const counter = createPingCounter({
    clock,
    timers: manualTimers(),
    maxRetainedKeys: 2,
    maxKeys: 1000,
    flush: async (rows) => {
      if (down) throw new Error("down");
      batches.push(rows);
    },
  });
  clock.advance(2 * 60 * MIN);
  counter.add(SPOT_A); // newest hour, inserted first
  clock.advance(-2 * 60 * MIN);
  counter.add(SPOT_A); // oldest hour
  clock.advance(60 * MIN);
  counter.add(SPOT_A); // middle hour
  await counter.flushNow();
  down = false;
  await counter.flushNow();
  expect((batches[0] ?? []).map((r) => r.at).sort()).toEqual([
    "2026-10-13T19:00:00.000Z",
    "2026-10-13T20:00:00.000Z",
  ]);
});

test("a successful publish invalidates the known spots, a failed one does not", async () => {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  let loads = 0;
  const known = createKnownSpots({
    clock: ctx.clock,
    load: async () => {
      loads += 1;
      return [SPOT_A];
    },
  });
  const publisherWith = (t: ReturnType<typeof target>) =>
    createPublisher({
      db: ctx.db,
      campusId: "sbu",
      target: t,
      photos: postgresPhotoStore(ctx.db, pages.site),
      dataSite: pages.site,
      dataBaseUrl: DATA_BASE_URL,
      clock: ctx.clock,
      timers: manualTimers(),
      knownSpots: known,
    });
  await known.has(SPOT_A);
  await known.has(SPOT_A);
  expect(loads).toBe(1);

  const failing = publisherWith({
    deploy: async () => {
      throw new Error("deploy down");
    },
  });
  expect((await failing.runNow()).ok).toBe(false);
  failing.close();
  await known.has(SPOT_A);
  expect(loads).toBe(1);

  const working = publisherWith(target(pages));
  expect((await working.runNow()).ok).toBe(true);
  working.close();
  await known.has(SPOT_A);
  expect(loads).toBe(2);
});
