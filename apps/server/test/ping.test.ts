import { expect, test } from "bun:test";
import { pick_daily, pick_ping } from "@perch/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { createPingCounter, type PingRow } from "../src/ping/counter.ts";
import { flushPicks } from "../src/ping/flush.ts";
import { createRateLimiter } from "../src/ping/rateLimit.ts";
import { manualTimers, setup, testClock, WEB_ORIGIN } from "./helpers.ts";

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

async function pingApp(opts: { logStream?: { write(m: string): void } } = {}) {
  const ctx = await setup();
  const pings = createPingCounter({
    clock: ctx.clock,
    timers: manualTimers(),
    flush: (rows) => flushPicks(ctx.db, "sbu", rows),
  });
  const app = await buildApp({
    db: ctx.db,
    clock: ctx.clock,
    config: { webOrigin: WEB_ORIGIN, campusId: "sbu", commit: null },
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
  const { pings, ping } = await pingApp();
  const res = await ping(SPOT_A, "203.0.113.1");
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
  const { pings, ping } = await pingApp();
  // The proxy appends the real address last; earlier entries are client-controlled.
  for (let i = 0; i < 31; i += 1) await ping(SPOT_A, `10.9.9.${i}, 203.0.113.5`);
  expect(pings.pending()).toBe(30);
});
