import { type Db, surveyor } from "@study-spot/db";
import { type SeedIds, seed } from "@study-spot/db/seed";
import { createTestDb } from "@study-spot/db/testing";
import type { LightMyRequestResponse } from "fastify";
import { type App, buildApp } from "../src/app.ts";
import { createSession } from "../src/auth/sessions.ts";
import type { Clock } from "../src/clock.ts";

export const NOW = new Date("2026-10-13T18:00:00Z");
export const WEB_ORIGIN = "https://study-spot.pages.dev";

export type TestClock = Clock & { set(at: Date): void; advance(ms: number): void };

export function testClock(start: Date = NOW): TestClock {
  let current = start;
  return {
    now: () => current,
    set: (at) => {
      current = at;
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

/** Counts schedule() calls instead of publishing. */
export type FakePublisher = { schedule(): void; scheduled: number };

export function fakePublisher(): FakePublisher {
  const fake = {
    scheduled: 0,
    schedule: () => {
      fake.scheduled += 1;
    },
  };
  return fake;
}

export type TestContext = {
  app: App;
  db: Db;
  ids: SeedIds;
  clock: TestClock;
  publisher: FakePublisher;
};

/** Seeded PGlite database plus an app on a controllable clock. */
export async function setup(): Promise<TestContext> {
  const db = await createTestDb();
  const ids = await seed(db);
  const clock = testClock();
  const publisher = fakePublisher();
  const app = await buildApp({
    db,
    clock,
    config: { webOrigin: WEB_ORIGIN, campusId: "sbu" },
    publisher,
  });
  return { app, db, ids, clock, publisher };
}

export type SignedIn = { id: string; token: string; headers: { authorization: string } };

/** Creates an active surveyor with a session. */
export async function signIn(
  ctx: TestContext,
  role: "surveyor" | "admin" = "surveyor",
  name = "Test Surveyor",
): Promise<SignedIn> {
  const [row] = await ctx.db
    .insert(surveyor)
    .values({ display_name: name, role })
    .returning({ id: surveyor.id });
  if (!row) throw new Error("insert returned nothing");
  const token = await createSession(ctx.db, row.id, ctx.clock.now());
  return { id: row.id, token, headers: { authorization: `Bearer ${token}` } };
}

/** Response body as unknown, for assertions. */
export function body(res: LightMyRequestResponse): unknown {
  return JSON.parse(res.body);
}

/** Fresh client write ids for tests. */
export function writeId(): string {
  return crypto.randomUUID();
}
