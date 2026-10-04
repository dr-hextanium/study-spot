import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, surveyor } from "@study-spot/db";
import { type SeedIds, seed } from "@study-spot/db/seed";
import { createTestDb } from "@study-spot/db/testing";
import type { LightMyRequestResponse } from "fastify";
import { type App, buildApp } from "../src/app.ts";
import { createSession } from "../src/auth/sessions.ts";
import type { Clock } from "../src/clock.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher, type Publisher, type Timers } from "../src/publish/publisher.ts";
import type { PublishTarget } from "../src/publish/target.ts";

export const NOW = new Date("2026-10-13T18:00:00Z");
export const WEB_ORIGIN = "https://study-spot.pages.dev";
export const DATA_BASE_URL = "https://study-spot-data.pages.dev";

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

/** Timers that only fire when the test says so. */
export type ManualTimers = Timers & { pending(): number; fire(): void };

export function manualTimers(): ManualTimers {
  let queue: { fn: () => void; live: boolean }[] = [];
  return {
    after(_ms, fn) {
      const entry = { fn, live: true };
      queue.push(entry);
      return () => {
        entry.live = false;
      };
    },
    pending: () => queue.filter((e) => e.live).length,
    fire() {
      const due = queue.filter((e) => e.live);
      queue = [];
      for (const e of due) e.fn();
    },
  };
}

/** A real Publisher that also counts schedule() calls from the routes. */
export type CountingPublisher = Publisher & { readonly scheduled: number };

function counting(inner: Publisher): CountingPublisher {
  let scheduled = 0;
  return {
    get scheduled() {
      return scheduled;
    },
    schedule() {
      scheduled += 1;
      inner.schedule();
    },
    runNow: () => inner.runNow(),
    start: () => inner.start(),
    status: () => inner.status(),
    close: () => inner.close(),
  };
}

export type TestContext = {
  app: App;
  db: Db;
  ids: SeedIds;
  clock: TestClock;
  timers: ManualTimers;
  publisher: CountingPublisher;
  publishDir: string;
};

/** Seeded PGlite database, an FsTarget in a temp dir, manual timers, a controllable clock. */
export async function setup(opts: { target?: PublishTarget } = {}): Promise<TestContext> {
  const db = await createTestDb();
  const ids = await seed(db);
  const clock = testClock();
  const timers = manualTimers();
  const publishDir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const photos = postgresPhotoStore(db);
  const publisher = counting(
    createPublisher({
      db,
      campusId: "sbu",
      target: opts.target ?? fsTarget(publishDir),
      photos,
      dataBaseUrl: DATA_BASE_URL,
      clock,
      timers,
    }),
  );
  const app = await buildApp({
    db,
    clock,
    config: { webOrigin: WEB_ORIGIN, campusId: "sbu" },
    publisher,
    photos,
  });
  return { app, db, ids, clock, timers, publisher, publishDir };
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
