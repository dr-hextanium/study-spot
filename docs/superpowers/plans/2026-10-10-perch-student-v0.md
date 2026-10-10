# Perch Student App v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v0 student app on `dev`: on-device scoring, an offline bundle client, the Home quick pick (Something else and Surprise me), spot pages, Browse with a list and an OpenFreeMap map, Me, an off-by-default pick ping and, last, postcards. It is built in the existing Seawolf system.

**Architecture:** Scoring is pure and DOM-free in `packages/core/src/scoring` and `packages/core/src/campusTime.ts`. Student view models, presenters, preference storage and the stale-while-revalidate bundle store live in `packages/ui-logic` (no DOM, tested with `bun test`). `apps/web` adds a pathless `_student` layout route (`/`, `/browse`, `/spot/$slug`, `/me`) with a tab bar. Screens are thin and render hook output with the existing Seawolf primitives. Student routes read only the static bundle on the data site and never call the API. The one exception is the pick ping, which is behind a build flag.

**Tech Stack:** TypeScript (strict), Zod 4, React 19, TanStack Router (file routes, committed `routeTree.gen.ts`), Vite 8 with vite-plugin-pwa, Vitest (jsdom), Playwright, `bun test`, Fastify and Drizzle for the ping, MapLibre GL JS with OpenFreeMap tiles.

**Spec:** `docs/superpowers/specs/2026-10-03-perch-v0-design.md` (sections 5, 7, 7a, 9 and 10), with the addendum `docs/superpowers/specs/2026-10-10-perch-student-v0.md`. The addendum wins where they differ. Executors read both.

## Global Constraints

- The CLAUDE.md hard rules apply:
  - No `Bun.*` in `apps/server` or `packages/*`.
  - Strict TypeScript: no `any`, and no `!` without a justifying comment.
  - Zod at every trust boundary, including localStorage, sessionStorage, IndexedDB and HTTP.
  - String literal unions, never a TS enum.
- Honesty:
  - Never show a forecast as live. Every busyness string comes from `busyLine()` (Task C2).
  - Every spot shows a last-verified date.
  - No displayed count below 5.
  - No location history. Device coordinates are used once per tap to pick the nearest building and never stored, logged, put in a URL or sent.
- Student routes make zero requests to the API origin. Task C5 pins this with an e2e test. The only allowed exception is `POST /ping/pick` when `VITE_PICK_PING=1` (Task G2).
- Visual: the exact Seawolf system (DESIGN.md, `packages/ui-logic/src/tokens.ts`, `apps/web/.impeccable/surfaces/apps-web.md`):
  - Four colors (paper, ink, red, mist) and their oklab mixes. No status hues, no new visual language.
  - At most one red-filled button per screen.
  - 44 px minimum hit areas.
  - Lucide icons at 1.75 stroke.
  - Exactly one `h1` (the large title) per screen.
  - The document scrolls. There are no inner scroll containers, except the horizontally scrolling chip rows that already exist.
- Copy: every UI string goes through `t()`. Add rows to `docs/design/surveyor-copy.md` under the `## Student: ...` sections this plan names, then run `bun run copy:gen`. Every new `{param}` needs a `SAMPLE` entry in `packages/ui-logic/test/copy.test.ts`, and every row needs a max chars value. Do not create a second deck. No em-dashes and no exclamation marks.
- Free tier:
  - Never push to `main` or merge into it. Everything stays on `dev` (owner decision O6).
  - Never add a Worker script.
  - No new scheduled workflows.
  - No uptime pingers.
  - Map tiles come from OpenFreeMap only.
- Ports:
  - 5173 belongs to another app, and 5199 and 8790 are the owner's live preview. Never touch them.
  - The Playwright suite owns 8787, 4173 and 8788.
  - Procedure V uses web 5299, API 8890 and data 8898.
  - Stop only servers you started, by PID.
- Commits:
  - Conventional Commits, 72 characters or fewer, no attribution, staged by path.
  - Every commit passes `bun run typecheck`, `bun run lint`, the bun tests of the touched packages and web vitest.
  - Never stage `apps/web/scripts/audit-shots.ts`, `HANDOFF.md`, `.claude/*` or `.superpowers/*`.
  - Commit only when the tree holds nothing but that task's changes. The pre-commit typecheck runs on the working tree.
  - Never run `rm` or any shell delete.
- Hooks live in `apps/web/src/hooks`. Pure logic lives in `packages/ui-logic` or `packages/core`. Screens hold no business logic.
- Change tiers (CLAUDE.md): **Logic** gets the full loop (test-first implementer, review, fixes, re-review). **Feature** gets one test-first implementer, unit tests and Procedure V. Each task names its tier.

## Commands

| What | Command |
|---|---|
| typecheck, lint, fix | `bun run typecheck`, `bun run lint`, `bun run fix` |
| core tests | `bun test packages/core --timeout 60000` |
| ui-logic tests | `bun test packages/ui-logic --timeout 60000` |
| server tests | `bun test apps/server --timeout 60000` |
| web unit tests | `bun run --filter '@perch/web' test` (one file: `cd apps/web && bunx vitest run test/<file>`) |
| web e2e | `bun run --filter '@perch/web' e2e` (one file: `cd apps/web && bunx playwright test e2e/<file>`) |
| copy | `bun run copy:gen` |
| routes | `cd apps/web && bunx vite build` (or the dev server) regenerates `src/routeTree.gen.ts`, which is committed |

### Procedure V: visual check (ends every UI task)

```bash
VDIR="${CLAUDE_JOB_DIR:-/tmp}/perch-verify"; mkdir -p "$VDIR"
(cd apps/server && E2E_PORT=8890 E2E_DATA_PORT=8898 E2E_PUBLISH_ON_BOOT=1 \
  E2E_WEB_ORIGIN=http://localhost:5299 E2E_STATE="$VDIR/state.json" \
  nohup node scripts/e2e-server.ts > "$VDIR/api.log" 2>&1 & echo $! > "$VDIR/api.pid")
(cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:8890 VITE_DATA_BASE_URL=http://data.localhost:8898 \
  nohup bunx vite --host 127.0.0.1 --port 5299 --strictPort > "$VDIR/web.log" 2>&1 & echo $! > "$VDIR/web.pid")
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8890/health >/dev/null && curl -sf http://localhost:5299 >/dev/null && curl -sf http://127.0.0.1:8898/bundle-latest.json >/dev/null && break; sleep 1; done
(cd apps/web && VERIFY_WEB=http://localhost:5299 VERIFY_INVITE=1 node scripts/verify-ui.ts "$VDIR/state.json" <routes>)
kill "$(cat "$VDIR/api.pid")" "$(cat "$VDIR/web.pid")"
```

Before Task B3 lands, `E2E_DATA_PORT` and `E2E_PUBLISH_ON_BOOT` do not exist yet, and the student screens have no data. Each invite index is single use, so increase `VERIFY_INVITE` per run. Pass `<routes>` explicitly, for example `/ /browse /me /spot/central-reading-room`.

**Pass:**
- Every line is `PASS`: console clean, no failed requests, no horizontal overflow, zero axe violations, at 375, 768 and 1440 px.
- Shrink the screenshots in `.claude/tmp/screenshots/` with `magick mogrify -resize '1024x>'`. The coordinator gives them to the `visual-reviewer` agent; implementers do not dispatch agents.
- List every deviation from the tokens or the surface contract in the task report.
- `verify-ui.ts` holds owner edits, so do not modify it.

## Review Focus

These are the inputs most likely to bite a real student that no single happy-path test exercises. Each one has its test in the named task.

1. **Late at night, past midnight.** A 01:30 arrival at a spot open 08:00 to 02:00 must count the previous day's row and close at 02:00. It must not read as closed, and it must not read as open until 02:00 the next night. Tests are in A2 and A5.
2. **The DST weekends** (2026-11-01, 2027-03-14). Minutes until close are real elapsed minutes: 150 from 00:30 EDT to 02:00 EST. A nonexistent local time moves forward. Tests are in A1 and A2.
3. **First open offline with no cache, or a bundle with a newer `schema_version`.** The app must show the right sentence, never a blank screen or a spinner forever. Tests are in B2 and C5.
4. **A phone clock that is wrong by hours.** The pick must use corrected time, and a cached response's `Date` must never be trusted. Tests are in B1 and B2.
5. **Corrupt or old localStorage** (prefs, access, presets, a recent history holding a removed spot or building). Each must parse with Zod and fall back to defaults without crashing. A `from` building missing from a new bundle falls back to Melville Library. Tests are in C3, F1 and A5.

---

## File map

```
packages/core/src/campusTime.ts            A1  campus parts, zoned instants, exam dates, clock skew
packages/core/src/scoring/walk.ts          A2  floorPenalty, walkMinutes
packages/core/src/scoring/hours.ts         A2  openSpan (past midnight, chaining, last entry, exam rows)
packages/core/src/scoring/criteria.ts      A3  Criterion, SoftTerm, matchCriterion, fit, topReasons
packages/core/src/scoring/presets.ts       A3  Preset, BUILTIN_PRESETS
packages/core/src/scoring/access.ts        A3  AccessProfile, accessFor
packages/core/src/scoring/seat.ts          A4  slotReading, pSeat, seatWord, busyBucket, timeValue
packages/core/src/scoring/rank.ts          A5  PickInput, rankSpots, surpriseRank, explainEmpty, resolveFrom
packages/core/src/scoring/reroll.ts        A6  weightedSample, rerollPool, reroll, surprise, pushRecent
packages/core/src/scoring/index.ts         A2+ barrel
packages/core/test/prng.ts                 A1  mulberry32
packages/core/test/fixtures/scoring-bundle.ts  A2  8-spot golden fixture
packages/ui-logic/src/bundleStore.ts       B2  SWR store over loadBundle
packages/ui-logic/src/student/*.ts         C2+ presenters, prefs, filters, browse, forecast, me, postcard
apps/server/src/publish/target.ts          B1  expose Date header
apps/server/scripts/e2e-server.ts          B3  data site server, publish on boot
apps/server/src/ping/*.ts, routes/ping.ts  G1  in-memory pick counter and flush
apps/web/src/adapters/fetch.ts             B3  Fetch with Date and timeout
apps/web/src/adapters/share.ts             D2  createWebShare
apps/web/src/hooks/useBundle.ts, useCampusNow.ts, useStudentPrefs.ts ...
apps/web/src/routes/_student*.tsx          C1+ layout, index, browse, spot.$slug, me
apps/web/src/ui/TabBar.tsx                 C1
apps/web/src/screens/student/*.tsx         C4+ Home, PickCard, FromSheet, FiltersSheet, Spot, Browse, Me
apps/web/src/map/MapView.tsx               E3  lazy chunk
apps/web/e2e/student-*.e2e.ts              C5, D2, E2, E3, F2
```

---

## Phase A: scoring core (`packages/core`, DOM-free)

### Task A1: campus time

**Tier:** Logic.

**Files:**
- Create: `packages/core/src/campusTime.ts`, `packages/core/test/prng.ts`, `packages/core/test/campusTime.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./campusTime.ts";`)

**Interfaces:**
- Consumes: `BundleTerm` from `packages/core/src/bundle.ts`.
- Produces:
  - `type CampusParts = { date: string; hour: number; minute: number; slotDow: number; hoursDow: number }`
  - `campusParts(at: Date, tz: string): CampusParts`
  - `weekdayOfDate(date: string): number`, with 0 = Sunday
  - `addDays(date: string, days: number): string`
  - `zonedInstant(date: string, minutes: number, tz: string): Date`, where minutes is 0 to 1440
  - `isExamDate(date: string, term: BundleTerm): boolean`
  - `MAX_CLOCK_DRIFT_MS`
  - `clockSkewMs(deviceAtResponse: Date, serverDate: string | null): number`
  - `correctedNow(device: Date, skewMs: number): Date`
  - `mulberry32(seed: number): () => number`, for tests

- [ ] **Step 1: Write the seeded generator used by every property test**

```ts
// packages/core/test/prng.ts
/** Deterministic [0, 1) generator for property tests and reroll tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/core/test/campusTime.test.ts
import { expect, test } from "bun:test";
import {
  addDays,
  campusParts,
  clockSkewMs,
  correctedNow,
  isExamDate,
  weekdayOfDate,
  zonedInstant,
} from "../src/index.ts";
import { mulberry32 } from "./prng.ts";

const NY = "America/New_York";
const iso = (d: Date): string => d.toISOString();

test("campus parts give both day-of-week conventions", () => {
  // Tue 2026-10-13 14:00 EDT
  expect(campusParts(new Date("2026-10-13T18:00:00Z"), NY)).toEqual({
    date: "2026-10-13", hour: 14, minute: 0, hoursDow: 2, slotDow: 1,
  });
  // 23:30 Sat Oct 31 in New York, already Nov 1 in UTC
  expect(campusParts(new Date("2026-11-01T03:30:00Z"), NY)).toEqual({
    date: "2026-10-31", hour: 23, minute: 30, hoursDow: 6, slotDow: 5,
  });
  // Midnight reads as hour 0, never 24
  expect(campusParts(new Date("2026-10-14T04:00:00Z"), NY).hour).toBe(0);
});

test("weekday and addDays are pure calendar math", () => {
  expect(weekdayOfDate("2026-10-13")).toBe(2);
  expect(weekdayOfDate("2026-11-01")).toBe(0);
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
});

test("zoned instants on ordinary days, end of day included", () => {
  expect(iso(zonedInstant("2026-10-13", 14 * 60, NY))).toBe("2026-10-13T18:00:00.000Z");
  expect(iso(zonedInstant("2026-10-13", 1440, NY))).toBe("2026-10-14T04:00:00.000Z");
});

test("fall back 2026-11-01: ambiguous 01:30 is the earlier instant, 02:00 is EST", () => {
  expect(iso(zonedInstant("2026-11-01", 90, NY))).toBe("2026-11-01T05:30:00.000Z");
  expect(iso(zonedInstant("2026-11-01", 120, NY))).toBe("2026-11-01T07:00:00.000Z");
});

test("spring forward 2027-03-14: nonexistent times move forward by the gap", () => {
  expect(iso(zonedInstant("2027-03-14", 120, NY))).toBe("2027-03-14T07:00:00.000Z");
  expect(iso(zonedInstant("2027-03-14", 150, NY))).toBe("2027-03-14T07:30:00.000Z");
  expect(iso(zonedInstant("2027-03-14", 180, NY))).toBe("2027-03-14T07:00:00.000Z");
});

test("zonedInstant inverts campusParts (property, 2000 instants over two years)", () => {
  const rand = mulberry32(7);
  const start = Date.parse("2026-08-01T00:00:00Z");
  const span = 2 * 365 * 86_400_000;
  for (let i = 0; i < 2000; i += 1) {
    const t = Math.floor((start + rand() * span) / 60_000) * 60_000;
    const p = campusParts(new Date(t), NY);
    const back = zonedInstant(p.date, p.hour * 60 + p.minute, NY).getTime();
    // Equal, or the earlier twin inside the repeated fall-back hour.
    expect(back === t || back === t - 3_600_000).toBe(true);
    const q = campusParts(new Date(back), NY);
    expect([q.date, q.hour, q.minute]).toEqual([p.date, p.hour, p.minute]);
  }
});

test("exam dates are inclusive and need both ends", () => {
  const term = { id: "f", name: "F", starts: "2026-08-24", ends: "2026-12-19",
    exam_starts: "2026-12-10", exam_ends: "2026-12-18" };
  expect(isExamDate("2026-12-10", term)).toBe(true);
  expect(isExamDate("2026-12-18", term)).toBe(true);
  expect(isExamDate("2026-12-19", term)).toBe(false);
  expect(isExamDate("2026-12-12", { ...term, exam_ends: null })).toBe(false);
});

test("clock skew is used only past 5 minutes and only from a real header", () => {
  const device = new Date("2026-10-13T18:00:00Z");
  expect(clockSkewMs(device, null)).toBe(0);
  expect(clockSkewMs(device, "not a date")).toBe(0);
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 18:04:59 GMT")).toBe(0);
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 21:00:00 GMT")).toBe(3 * 3_600_000);
  expect(iso(correctedNow(device, -7_200_000))).toBe("2026-10-13T16:00:00.000Z");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test packages/core/test/campusTime.test.ts`
Expected: FAIL, because `campusParts` is not exported.

- [ ] **Step 4: Implement**

```ts
// packages/core/src/campusTime.ts
import type { BundleTerm } from "./bundle.ts";

/** One instant read in the campus time zone. */
export type CampusParts = {
  /** Campus calendar date, YYYY-MM-DD. */
  date: string;
  hour: number;
  minute: number;
  /** 0 = Monday ... 6 = Sunday: busyness slots (slots.ts). */
  slotDow: number;
  /** 0 = Sunday ... 6 = Saturday: BundleHours.day_of_week. */
  hoursDow: number;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const formats = new Map<string, Intl.DateTimeFormat>();

function formatFor(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz);
  if (f === undefined) {
    // hourCycle h23: hour12:false can print "24" at midnight in some engines.
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(tz, f);
  }
  return f;
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function wallOf(ms: number, tz: string): Wall {
  const parts = formatFor(tz).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    if (p === undefined) throw new Error(`Intl returned no ${type}`);
    return Number(p.value);
  };
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour") % 24,
    mi: get("minute"),
    s: get("second"),
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Day of week of a calendar date: 0 = Sunday. */
export function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function campusParts(at: Date, tz: string): CampusParts {
  const w = wallOf(at.getTime(), tz);
  const date = `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
  const hoursDow = weekdayOfDate(date);
  return { date, hour: w.h, minute: w.mi, hoursDow, slotDow: (hoursDow + 6) % 7 };
}

/** Wall clock minus UTC at an instant, in ms. */
function offsetMs(ms: number, tz: string): number {
  const w = wallOf(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of a campus wall-clock time. `minutes` runs 0 to 1440 (1440 is
 * the end of the day). In the repeated fall-back hour this returns the earlier
 * instant; a time skipped by spring-forward moves forward by the gap.
 */
export function zonedInstant(date: string, minutes: number, tz: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`bad date ${date}`);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new RangeError(`minutes out of range: ${minutes}`);
  }
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE_MS;
  const o1 = offsetMs(wall, tz);
  const t1 = wall - o1;
  const o2 = offsetMs(t1, tz);
  if (o1 === o2) return new Date(t1);
  const t2 = wall - o2;
  if (offsetMs(t2, tz) === o2) return new Date(t2);
  return new Date(t1);
}

export function isExamDate(date: string, term: BundleTerm): boolean {
  if (term.exam_starts === null || term.exam_ends === null) return false;
  return date >= term.exam_starts && date <= term.exam_ends;
}

export const MAX_CLOCK_DRIFT_MS = 5 * MINUTE_MS;

/**
 * Server minus device time from a network response's Date header, or 0 when
 * the header is missing, unreadable, or within 5 minutes. Never pass a cached
 * response's Date.
 */
export function clockSkewMs(deviceAtResponse: Date, serverDate: string | null): number {
  if (serverDate === null) return 0;
  const server = Date.parse(serverDate);
  if (Number.isNaN(server)) return 0;
  const skew = server - deviceAtResponse.getTime();
  return Math.abs(skew) > MAX_CLOCK_DRIFT_MS ? skew : 0;
}

export function correctedNow(device: Date, skewMs: number): Date {
  return new Date(device.getTime() + skewMs);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/core --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS. The existing `time.test.ts` is unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/campusTime.ts packages/core/src/index.ts packages/core/test/prng.ts packages/core/test/campusTime.test.ts
git commit -m "feat(core): campus time, zoned instants and clock skew"
```

### Task A2: golden fixture, walk and opening hours

**Tier:** Logic.

**Files:**
- Create: `packages/core/test/fixtures/scoring-bundle.ts`, `packages/core/src/scoring/walk.ts`, `packages/core/src/scoring/hours.ts`, `packages/core/src/scoring/index.ts`, `packages/core/test/scoring/hours.test.ts`, `packages/core/test/scoring/walk.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./scoring/index.ts";`)

**Interfaces:**
- Consumes: from A1, `campusParts`, `zonedInstant`, `addDays`, `weekdayOfDate`, `isExamDate`; `fallbackWalkMinutes` from `geo.ts`.
- Produces:
  - `floorPenalty(floor: string): number`
  - `STAFFED_DESK_MINUTES = 2`
  - `walkMinutes(bundle: Bundle, from: string, spot: BundleSpot): number`
  - `minutesOf(t: string): number`
  - `type OpenSpan = { open: false } | { open: true; closesAt: Date }`
  - `openSpan(rows: readonly BundleHours[], term: BundleTerm, at: Date, tz: string): OpenSpan`. Here `rows` are the spot's own rows, and the function chooses exam or regular rows per date.
  - Fixture: `makeScoringBundle(): Bundle`, `SPOT` (slug to id), `hoursOf(bundle, id)`

- [ ] **Step 1: Write the fixture.** It must pass `parseBundle`: every spot has busyness, the walk matrix is square, and `verified` is non-empty.

```ts
// packages/core/test/fixtures/scoring-bundle.ts
import {
  type Bundle,
  type BundleBusyness,
  type BundleHours,
  type BundleSpot,
  parseBundle,
  type SlotConfidence,
} from "../../src/index.ts";

export const SPOT = {
  carrels: "00000000-0000-4000-8000-000000000001",
  reading: "00000000-0000-4000-8000-000000000002",
  sacLounge: "00000000-0000-4000-8000-000000000003",
  union: "00000000-0000-4000-8000-000000000004",
  kelly: "00000000-0000-4000-8000-000000000005",
  grad: "00000000-0000-4000-8000-000000000006",
  unverified: "00000000-0000-4000-8000-000000000007",
  hoursTbd: "00000000-0000-4000-8000-000000000008",
} as const;

const VERIFIED = { identity: "2026-10-05T15:00:00.000Z", hours: "2026-10-06T15:00:00.000Z" };

type Required = Pick<BundleSpot, "id" | "slug" | "building_id" | "official_name">;
function spot(o: Required & Partial<BundleSpot>): BundleSpot {
  return {
    floor: "1", common_name: null, lat: 40.9155, lng: -73.1221, directions: "Main entrance.",
    eligibility: "all_students", eligibility_scope: null, eligibility_verified: true,
    entry_method: "open", reservable: false, reservation_system: null, reservation_url: null,
    seat_count: 100, seat_types: [{ type: "table_chair", count: 100 }],
    table_configs: ["large_shared"], effective_capacity: null, max_group_size: null,
    spread_out_room: null, outlet_coverage_pct: 0.3, usb_outlets: null, wifi_mbps: null,
    cell_signal: null, noise_policy: "quiet", natural_light: null, lighting: null,
    temperature: null, temperature_consistent: null, windows_view: null, calls_ok: null,
    group_work_ok: false, whiteboard: false, food_policy: "covered_drinks", amenities: [],
    step_free: null, elevator: null, accessible_seating: null, open_past_midnight: null,
    staffed_late: null, lit_route_to_residences: null, outdoor: false, seasonal: false,
    hours_unconfirmed: false, verified: VERIFIED, photos: [],
    ...o,
  };
}

function daily(spot_id: string, opens: string, closes: string, is_exam = false): BundleHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
    spot_id, day_of_week, opens, closes, last_entry: null, is_exam,
  }));
}

function flat(ratio: number, confidence: SlotConfidence, exam: number | null = null): BundleBusyness {
  return {
    regular: Array.from({ length: 168 }, () => ratio),
    exam: exam === null ? null : Array.from({ length: 168 }, () => exam),
    confidence: Array.from({ length: 168 }, () => confidence),
  };
}

export function makeScoringBundle(): Bundle {
  const raw = {
    schema_version: 1,
    generated_at: "2026-10-13T12:00:00.000Z",
    campus: { id: "sbu", name: "Stony Brook University", tz: "America/New_York" },
    term: { id: "2026-fall", name: "Fall 2026", starts: "2026-08-24", ends: "2026-12-19",
      exam_starts: "2026-12-10", exam_ends: "2026-12-18" },
    buildings: [
      { id: "melville-library", name: "Melville Library", lat: 40.9154, lng: -73.1222 },
      { id: "sac", name: "Student Activities Center", lat: 40.9145, lng: -73.1243 },
      { id: "student-union", name: "Student Union", lat: 40.917, lng: -73.1219 },
      { id: "kelly-quad", name: "Kelly Quad", lat: 40.9104, lng: -73.127 },
    ],
    walk: {
      building_ids: ["melville-library", "sac", "student-union", "kelly-quad"],
      minutes: [[0, 4, 6, 12], [4, 0, 5, 9], [6, 5, 0, 10], [12, 9, 10, 0]],
      estimated_pairs: [],
    },
    spots: [
      spot({ id: SPOT.carrels, slug: "quiet-carrels", building_id: "melville-library",
        official_name: "Quiet Carrels", noise_policy: "silent", seat_count: 100,
        seat_types: [{ type: "carrel", count: 100 }], outlet_coverage_pct: 0.8,
        max_group_size: 1, calls_ok: "not_allowed", open_past_midnight: false }),
      spot({ id: SPOT.reading, slug: "reading-room", building_id: "melville-library",
        official_name: "Reading Room", floor: "3", noise_policy: "silent", seat_count: 120,
        seat_types: [{ type: "table_chair", count: 120 }], outlet_coverage_pct: 0.3 }),
      spot({ id: SPOT.sacLounge, slug: "sac-lounge", building_id: "sac", official_name: "SAC Lounge",
        floor: "2", noise_policy: "conversational", group_work_ok: true, calls_ok: "allowed",
        cell_signal: "good", outlet_coverage_pct: 0.5, seat_count: 40, max_group_size: 6 }),
      spot({ id: SPOT.union, slug: "union-study", building_id: "student-union",
        official_name: "Union Study Room", noise_policy: "quiet", group_work_ok: true,
        whiteboard: true, table_configs: ["small_2_4"], max_group_size: 4, seat_count: 30,
        outlet_coverage_pct: 0.6, calls_ok: "allowed_impractical" }),
      spot({ id: SPOT.kelly, slug: "kelly-rcc", building_id: "kelly-quad", official_name: "Kelly RCC",
        eligibility: "residents_quad", eligibility_scope: "Kelly Quad", outlet_coverage_pct: 0.5 }),
      spot({ id: SPOT.grad, slug: "grad-lounge", building_id: "melville-library",
        official_name: "Grad Lounge", floor: "4", eligibility: "grad_only", noise_policy: "silent" }),
      spot({ id: SPOT.unverified, slug: "unverified-room", building_id: "sac",
        official_name: "Unverified Room", eligibility_verified: false, noise_policy: "silent" }),
      spot({ id: SPOT.hoursTbd, slug: "hours-tbd", building_id: "student-union",
        official_name: "Hours TBD", floor: "2", hours_unconfirmed: true, noise_policy: "silent" }),
    ],
    hours: [
      ...daily(SPOT.carrels, "08:00", "02:00"),
      ...daily(SPOT.carrels, "00:00", "24:00", true),
      ...daily(SPOT.reading, "00:00", "24:00"),
      ...daily(SPOT.sacLounge, "07:00", "23:00"),
      ...daily(SPOT.union, "08:00", "24:00"),
      ...daily(SPOT.kelly, "00:00", "24:00"),
      ...daily(SPOT.grad, "08:00", "22:00"),
      ...daily(SPOT.unverified, "08:00", "22:00"),
    ],
    busyness: {
      [SPOT.carrels]: flat(0.35, "measured"),
      [SPOT.reading]: flat(0.9, "measured"),
      [SPOT.sacLounge]: flat(0.6, "estimated"),
      [SPOT.union]: flat(0.35, "measured", 0.6),
      [SPOT.kelly]: flat(0.1, "measured"),
      [SPOT.grad]: flat(0.1, "measured"),
      [SPOT.unverified]: flat(0.1, "measured"),
      [SPOT.hoursTbd]: flat(0.35, "none"),
    },
    data_license: "CC BY-SA 4.0",
    attribution: "Perch surveyors",
  };
  const parsed = parseBundle(raw);
  if (!parsed.ok) throw new Error(`scoring fixture invalid: ${parsed.detail}`);
  return parsed.bundle;
}

export function hoursOf(bundle: Bundle, spotId: string): BundleHours[] {
  return bundle.hours.filter((h) => h.spot_id === spotId);
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/core/test/scoring/walk.test.ts
import { expect, test } from "bun:test";
import { floorPenalty, walkMinutes } from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

test("floor penalty: 1 per floor above ground, basements 1, labels and junk 0", () => {
  expect(floorPenalty("1")).toBe(0);
  expect(floorPenalty("3")).toBe(2);
  expect(floorPenalty("2M")).toBe(1);
  expect(floorPenalty("0")).toBe(0);
  expect(floorPenalty("-1")).toBe(1);
  expect(floorPenalty("B")).toBe(1);
  expect(floorPenalty("Basement")).toBe(1);
  expect(floorPenalty("LL")).toBe(1);
  expect(floorPenalty("G")).toBe(0);
  expect(floorPenalty("Lobby")).toBe(0);
  expect(floorPenalty("mezzanine")).toBe(0);
});

test("walk is matrix minutes plus floors plus a staffed desk", () => {
  const b = makeScoringBundle();
  const byId = (id: string) => {
    const s = b.spots.find((x) => x.id === id);
    if (s === undefined) throw new Error(id);
    return s;
  };
  expect(walkMinutes(b, "melville-library", byId(SPOT.carrels))).toBe(0);
  expect(walkMinutes(b, "melville-library", byId(SPOT.reading))).toBe(2);
  expect(walkMinutes(b, "sac", byId(SPOT.union))).toBe(5);
  expect(walkMinutes(b, "sac", { ...byId(SPOT.union), entry_method: "staffed_desk" })).toBe(7);
});
```

```ts
// packages/core/test/scoring/hours.test.ts
import { expect, test } from "bun:test";
import { openSpan } from "../../src/index.ts";
import { hoursOf, makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

const b = makeScoringBundle();
const NY = b.campus.tz;
const at = (s: string) => new Date(s);
const span = (id: string, s: string) => openSpan(hoursOf(b, id), b.term, at(s), NY);
const closes = (id: string, s: string): string => {
  const r = span(id, s);
  if (!r.open) throw new Error(`closed at ${s}`);
  return r.closesAt.toISOString();
};

test("open in the middle of the day", () => {
  // Tue 14:00 EDT; carrels close Wed 02:00 EDT
  expect(closes(SPOT.carrels, "2026-10-13T18:00:00Z")).toBe("2026-10-14T06:00:00.000Z");
});

test("past midnight: 01:30 Wed still uses Tuesday's 08:00 to 02:00 row", () => {
  expect(closes(SPOT.carrels, "2026-10-14T05:30:00Z")).toBe("2026-10-14T06:00:00.000Z");
  expect(span(SPOT.carrels, "2026-10-14T06:00:00Z").open).toBe(false);
  expect(span(SPOT.carrels, "2026-10-14T11:59:00Z").open).toBe(false); // 07:59
  expect(span(SPOT.carrels, "2026-10-14T12:00:00Z").open).toBe(true); // 08:00
});

test("24-hour days chain across midnight", () => {
  // Tue 23:30 at the reading room runs through the next 24h rows (3 days ahead max)
  const r = span(SPOT.reading, "2026-10-14T03:30:00Z");
  expect(r.open).toBe(true);
  if (r.open) expect(r.closesAt.getTime()).toBeGreaterThan(Date.parse("2026-10-15T04:00:00Z"));
});

test("08:00 to 24:00 closes at midnight, not later", () => {
  expect(closes(SPOT.union, "2026-10-14T03:40:00Z")).toBe("2026-10-14T04:00:00.000Z");
});

test("DST fall back: 00:30 EDT to 02:00 EST is 150 real minutes", () => {
  const r = span(SPOT.carrels, "2026-11-01T04:30:00Z");
  expect(r.open).toBe(true);
  if (r.open) expect((r.closesAt.getTime() - Date.parse("2026-11-01T04:30:00Z")) / 60_000).toBe(150);
});

test("DST spring forward: 02:00 does not exist, close moves to 03:00 EDT", () => {
  expect(closes(SPOT.carrels, "2027-03-14T06:30:00Z")).toBe("2027-03-14T07:00:00.000Z");
});

test("exam window uses exam rows; outside it the regular rows", () => {
  // Mon 2026-12-14 03:00 EST: exam rows are 24h
  expect(span(SPOT.carrels, "2026-12-14T08:00:00Z").open).toBe(true);
  // Tue 2026-12-01 03:00 EST: regular rows closed at 02:00
  expect(span(SPOT.carrels, "2026-12-01T08:00:00Z").open).toBe(false);
  // A spot without exam rows keeps its regular hours in the exam window
  expect(span(SPOT.union, "2026-12-14T15:00:00Z").open).toBe(true);
});

test("last entry closes the door before closing time", () => {
  const rows = hoursOf(b, SPOT.union).map((h) => ({ ...h, last_entry: "23:00" }));
  expect(openSpan(rows, b.term, at("2026-10-14T02:59:00Z"), NY).open).toBe(true); // 22:59
  expect(openSpan(rows, b.term, at("2026-10-14T03:01:00Z"), NY).open).toBe(false); // 23:01
});

test("no rows means closed", () => {
  expect(span(SPOT.hoursTbd, "2026-10-13T18:00:00Z").open).toBe(false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test packages/core/test/scoring`
Expected: FAIL, because `floorPenalty` and `openSpan` are not exported.

- [ ] **Step 4: Implement**

```ts
// packages/core/src/scoring/walk.ts
import type { Bundle, BundleSpot } from "../bundle.ts";
import { fallbackWalkMinutes } from "../geo.ts";

export const STAFFED_DESK_MINUTES = 2;

/** Extra minutes for stairs or elevators: 1 per floor away from ground. */
export function floorPenalty(floor: string): number {
  const f = floor.trim().toLowerCase();
  if (/^(b\b|b\d|basement|ll\b|lower)/.test(f)) return 1;
  if (/^(g\b|ground|main|lobby)/.test(f)) return 0;
  const n = Number.parseInt(f, 10);
  if (Number.isNaN(n)) return 0;
  if (n >= 1) return n - 1;
  return Math.abs(n);
}

/** Minutes from a building to a spot: matrix (or straight-line fallback), floors, desk. */
export function walkMinutes(bundle: Bundle, from: string, spot: BundleSpot): number {
  const ids = bundle.walk.building_ids;
  const i = ids.indexOf(from);
  const j = ids.indexOf(spot.building_id);
  let base = i >= 0 && j >= 0 ? bundle.walk.minutes[i]?.[j] : undefined;
  if (base === undefined) {
    const a = bundle.buildings.find((x) => x.id === from);
    base = a === undefined ? 0 : fallbackWalkMinutes(a, spot);
  }
  const desk = spot.entry_method === "staffed_desk" ? STAFFED_DESK_MINUTES : 0;
  return base + floorPenalty(spot.floor) + desk;
}
```

Check `floorPenalty("B")`: `^(b\b...` matches "b". `"Basement"` matches `basement`. `"LL"` gives `ll\b`. `"G"` gives `g\b`. `"Lobby"` matches `lobby`. `"2M"` gives `parseInt` 2, so 1.

```ts
// packages/core/src/scoring/hours.ts
import type { BundleHours, BundleTerm } from "../bundle.ts";
import { addDays, campusParts, isExamDate, weekdayOfDate, zonedInstant } from "../campusTime.ts";

export type OpenSpan = { open: false } | { open: true; closesAt: Date };

/** "HH:MM" to minutes; "24:00" is 1440. */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

type Span = { start: number; end: number; lastEntry: number | null };

/** The rows that apply on a campus date: exam rows in the exam window when the spot has any. */
function rowsOn(rows: readonly BundleHours[], date: string, term: BundleTerm): BundleHours[] {
  const exam = isExamDate(date, term) && rows.some((r) => r.is_exam);
  const dow = weekdayOfDate(date); // hours use 0 = Sunday
  return rows.filter((r) => r.is_exam === exam && r.day_of_week === dow);
}

function spansOn(rows: readonly BundleHours[], date: string, tz: string): Span[] {
  return rows.map((r) => {
    const o = minutesOf(r.opens);
    const c = minutesOf(r.closes);
    // A close at or before the open is on the next day.
    const end = zonedInstant(c <= o ? addDays(date, 1) : date, c, tz).getTime();
    let lastEntry: number | null = null;
    if (r.last_entry !== null) {
      const le = minutesOf(r.last_entry);
      lastEntry = zonedInstant(le < o ? addDays(date, 1) : date, le, tz).getTime();
    }
    return { start: zonedInstant(date, o, tz).getTime(), end, lastEntry };
  });
}

/**
 * Whether a spot is open at an instant, and when that stretch ends. Checks
 * the previous day's rows (past-midnight closes) and chains touching spans
 * (24-hour days) up to two days ahead.
 */
export function openSpan(
  rows: readonly BundleHours[],
  term: BundleTerm,
  at: Date,
  tz: string,
): OpenSpan {
  const today = campusParts(at, tz).date;
  const spans: Span[] = [];
  for (const offset of [-1, 0, 1, 2]) {
    const date = addDays(today, offset);
    spans.push(...spansOn(rowsOn(rows, date, term), date, tz));
  }
  spans.sort((a, b) => a.start - b.start);
  const t = at.getTime();
  const current = spans.find(
    (s) => s.start <= t && t < s.end && (s.lastEntry === null || t <= s.lastEntry),
  );
  if (current === undefined) return { open: false };
  let end = current.end;
  for (const s of spans) if (s.start <= end && s.end > end) end = s.end;
  return { open: true, closesAt: new Date(end) };
}
```

```ts
// packages/core/src/scoring/index.ts
export * from "./hours.ts";
export * from "./walk.ts";
```

Add `export * from "./scoring/index.ts";` to `packages/core/src/index.ts`. Before that, run `grep -rn "export .*\b\(minutesOf\|openSpan\|walkMinutes\)\b" packages/core/src` and confirm there is no clash.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/core --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/scoring packages/core/src/index.ts packages/core/test/fixtures/scoring-bundle.ts packages/core/test/scoring
git commit -m "feat(core): walk minutes and opening spans with dst fixtures"
```

### Task A3: criteria, presets and access

**Tier:** Logic.

**Files:**
- Create: `packages/core/src/scoring/criteria.ts`, `packages/core/src/scoring/presets.ts`, `packages/core/src/scoring/access.ts`, `packages/core/test/scoring/criteria.test.ts`, `packages/core/test/scoring/access.test.ts`
- Modify: `packages/core/src/scoring/index.ts`

**Interfaces:**
- Produces:
  - `BOOL_ATTR`, `BoolAttr`
  - `Criterion`, a Zod discriminated union on `attr`, and `type Criterion`
  - `SoftTerm = { when: Criterion; weight: number }`
  - `type Match = "yes" | "no" | "unknown"`
  - `matchCriterion(spot, c): Match`
  - `MATCH_CREDIT`
  - `fit(spot, soft): number`
  - `topReasons(spot, soft, limit?): Criterion[]`
  - `PRESET_ID`, `Preset` (Zod) and `type Preset`
  - `BUILTIN_PRESETS: readonly Preset[]`, `presetById(id, custom): Preset`
  - `AccessProfile` (Zod), `DEFAULT_ACCESS`
  - `scopeKey(s)`
  - `type Access = { kind: "open" } | { kind: "locked"; eligibility: Eligibility; scope: string | null } | { kind: "unverified" }`
  - `accessFor(spot, profile, buildings): Access`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/scoring/criteria.test.ts
import { expect, test } from "bun:test";
import {
  BUILTIN_PRESETS,
  type BundleSpot,
  Criterion,
  fit,
  matchCriterion,
  Preset,
  presetById,
  topReasons,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";
import { mulberry32 } from "../prng.ts";

const b = makeScoringBundle();
const get = (id: string): BundleSpot => {
  const s = b.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(id);
  return s;
};
const silent = presetById("silent_solo", []);
const group = presetById("group", []);

test("matches are yes, no, or unknown for null attributes", () => {
  const carrels = get(SPOT.carrels);
  expect(matchCriterion(carrels, { attr: "noise_policy", target: ["silent"] })).toBe("yes");
  expect(matchCriterion(carrels, { attr: "outlet_coverage_pct", target: 0.5 })).toBe("yes");
  expect(matchCriterion(carrels, { attr: "seat_type", target: "carrel" })).toBe("yes");
  expect(matchCriterion(carrels, { attr: "flag", flag: "natural_light", target: true })).toBe("unknown");
  expect(matchCriterion(carrels, { attr: "flag", flag: "group_work_ok", target: true })).toBe("no");
  expect(matchCriterion(carrels, { attr: "wifi_mbps", target: 10 })).toBe("unknown");
  expect(matchCriterion(carrels, { attr: "amenity", target: "printer" })).toBe("no");
});

test("fit on the golden spots", () => {
  expect(fit(get(SPOT.carrels), silent.soft)).toBe(1);
  expect(fit(get(SPOT.reading), silent.soft)).toBe(0.5);
  expect(fit(get(SPOT.union), silent.soft)).toBe(0.25);
  expect(fit(get(SPOT.sacLounge), group.soft)).toBe(0.5);
  expect(fit(get(SPOT.union), group.soft)).toBe(0.75);
  expect(fit(get(SPOT.union), [])).toBe(1);
});

test("why-this-spot reasons are matched soft terms, heaviest first, at most 2", () => {
  expect(topReasons(get(SPOT.carrels), silent.soft)).toEqual([
    { attr: "noise_policy", target: ["silent"] },
    { attr: "outlet_coverage_pct", target: 0.5 },
  ]);
  expect(topReasons(get(SPOT.union), silent.soft)).toEqual([
    { attr: "outlet_coverage_pct", target: 0.5 },
  ]);
});

test("fit stays in [0, 1] and rises when a spot gains a match (property)", () => {
  const rand = mulberry32(11);
  const flags = ["natural_light", "whiteboard", "step_free", "elevator", "windows_view"] as const;
  for (let i = 0; i < 500; i += 1) {
    const soft = flags.map((flag) => ({
      when: { attr: "flag" as const, flag, target: true },
      weight: 0.5 + Math.floor(rand() * 5),
    }));
    const pickVal = (): boolean | null => (rand() < 0.33 ? null : rand() < 0.5);
    const s: BundleSpot = { ...get(SPOT.carrels), natural_light: pickVal(), whiteboard: rand() < 0.5,
      step_free: pickVal(), elevator: pickVal(), windows_view: pickVal() };
    const before = fit(s, soft);
    expect(before).toBeGreaterThanOrEqual(0);
    expect(before).toBeLessThanOrEqual(1);
    const flag = flags[Math.floor(rand() * flags.length)] ?? "whiteboard";
    const after: BundleSpot = { ...s };
    after[flag] = true;
    expect(fit(after, soft)).toBeGreaterThanOrEqual(before);
  }
});

test("presets and criteria parse; junk does not", () => {
  for (const p of BUILTIN_PRESETS) expect(Preset.safeParse(p).success).toBe(true);
  expect(Criterion.safeParse({ attr: "noise_policy", target: [] }).success).toBe(false);
  expect(Criterion.safeParse({ attr: "flag", flag: "seat_count", target: true }).success).toBe(false);
  expect(presetById("nope", []).id).toBe("silent_solo");
});
```

```ts
// packages/core/test/scoring/access.test.ts
import { expect, test } from "bun:test";
import { AccessProfile, accessFor, DEFAULT_ACCESS, scopeKey } from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

const b = makeScoringBundle();
const get = (id: string) => {
  const s = b.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(id);
  return s;
};

test("scope keys normalize free text", () => {
  expect(scopeKey("  Kelly Quad ")).toBe("kelly-quad");
  expect(scopeKey("Roth (Quad)")).toBe("roth-quad");
});

test("default profile: all-students open, residents and grad locked, unverified flagged", () => {
  expect(accessFor(get(SPOT.carrels), DEFAULT_ACCESS, b.buildings)).toEqual({ kind: "open" });
  expect(accessFor(get(SPOT.kelly), DEFAULT_ACCESS, b.buildings)).toEqual({
    kind: "locked", eligibility: "residents_quad", scope: "Kelly Quad",
  });
  expect(accessFor(get(SPOT.grad), DEFAULT_ACCESS, b.buildings).kind).toBe("locked");
  expect(accessFor(get(SPOT.unverified), DEFAULT_ACCESS, b.buildings)).toEqual({ kind: "unverified" });
});

test("a matching quad or grad flag unlocks; a department is always locked", () => {
  const p = { residence: null, quad: "kelly-quad", grad: true };
  expect(accessFor(get(SPOT.kelly), p, b.buildings)).toEqual({ kind: "open" });
  expect(accessFor(get(SPOT.grad), p, b.buildings)).toEqual({ kind: "open" });
  const dept = { ...get(SPOT.carrels), eligibility: "department" as const, eligibility_scope: "CS" };
  expect(accessFor(dept, p, b.buildings).kind).toBe("locked");
  // A residents spot that is not verified stays unpickable even when it matches
  const kellyUnverified = { ...get(SPOT.kelly), eligibility_verified: false };
  expect(accessFor(kellyUnverified, p, b.buildings)).toEqual({ kind: "unverified" });
});

test("profile schema rejects junk", () => {
  expect(AccessProfile.safeParse({ residence: 3, quad: null, grad: false }).success).toBe(false);
  expect(AccessProfile.safeParse(DEFAULT_ACCESS).success).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/core/test/scoring`
Expected: FAIL, because `matchCriterion`, `presetById` and `accessFor` are missing.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/scoring/criteria.ts
import { z } from "zod";
import type { BundleSpot } from "../bundle.ts";
import {
  Amenity, CallsOk, CellSignal, EntryMethod, FoodPolicy, Lighting, NoisePolicy, SeatType,
  TableConfig, Temperature,
} from "../enums.ts";

export const BOOL_ATTR = [
  "group_work_ok", "natural_light", "windows_view", "whiteboard", "usb_outlets", "step_free",
  "elevator", "accessible_seating", "open_past_midnight", "staffed_late",
  "lit_route_to_residences", "outdoor", "spread_out_room", "reservable", "temperature_consistent",
] as const;
export const BoolAttr = z.enum(BOOL_ATTR);
export type BoolAttr = z.infer<typeof BoolAttr>;

/** One attribute test. Enum targets are "any of"; numeric targets are minimums. */
export const Criterion = z.discriminatedUnion("attr", [
  z.object({ attr: z.literal("noise_policy"), target: z.array(NoisePolicy).min(1) }),
  z.object({ attr: z.literal("calls_ok"), target: z.array(CallsOk).min(1) }),
  z.object({ attr: z.literal("food_policy"), target: z.array(FoodPolicy).min(1) }),
  z.object({ attr: z.literal("lighting"), target: z.array(Lighting).min(1) }),
  z.object({ attr: z.literal("temperature"), target: z.array(Temperature).min(1) }),
  z.object({ attr: z.literal("cell_signal"), target: z.array(CellSignal).min(1) }),
  z.object({ attr: z.literal("entry_method"), target: z.array(EntryMethod).min(1) }),
  z.object({ attr: z.literal("outlet_coverage_pct"), target: z.number().min(0).max(1) }),
  z.object({ attr: z.literal("seat_count"), target: z.number().int().positive() }),
  z.object({ attr: z.literal("wifi_mbps"), target: z.number().nonnegative() }),
  z.object({ attr: z.literal("seat_type"), target: SeatType }),
  z.object({ attr: z.literal("table_config"), target: TableConfig }),
  z.object({ attr: z.literal("amenity"), target: Amenity }),
  z.object({ attr: z.literal("flag"), flag: BoolAttr, target: z.boolean() }),
]);
export type Criterion = z.infer<typeof Criterion>;

export const SoftTerm = z.object({ when: Criterion, weight: z.number().positive().max(5) });
export type SoftTerm = z.infer<typeof SoftTerm>;

export type Match = "yes" | "no" | "unknown";
export const MATCH_CREDIT: Readonly<Record<Match, number>> = { yes: 1, unknown: 0.5, no: 0 };

const yn = (b: boolean): Match => (b ? "yes" : "no");
function inList<T extends string>(v: T | null, list: readonly T[]): Match {
  return v === null ? "unknown" : yn(list.includes(v));
}

export function matchCriterion(spot: BundleSpot, c: Criterion): Match {
  switch (c.attr) {
    case "noise_policy": return inList(spot.noise_policy, c.target);
    case "calls_ok": return inList(spot.calls_ok, c.target);
    case "food_policy": return inList(spot.food_policy, c.target);
    case "lighting": return inList(spot.lighting, c.target);
    case "temperature": return inList(spot.temperature, c.target);
    case "cell_signal": return inList(spot.cell_signal, c.target);
    case "entry_method": return inList(spot.entry_method, c.target);
    case "outlet_coverage_pct": return yn(spot.outlet_coverage_pct >= c.target);
    case "seat_count": return yn(spot.seat_count >= c.target);
    case "wifi_mbps": return spot.wifi_mbps === null ? "unknown" : yn(spot.wifi_mbps >= c.target);
    case "seat_type": return yn(spot.seat_types.some((s) => s.type === c.target && s.count > 0));
    case "table_config": return yn(spot.table_configs.includes(c.target));
    case "amenity": return yn(spot.amenities.some((a) => a.amenity === c.target));
    case "flag": {
      const v = spot[c.flag];
      return v === null ? "unknown" : yn(v === c.target);
    }
  }
}

/** Weighted soft match in [0, 1]; unknown earns half; no terms is a perfect fit. */
export function fit(spot: BundleSpot, soft: readonly SoftTerm[]): number {
  if (soft.length === 0) return 1;
  let total = 0;
  let got = 0;
  for (const term of soft) {
    total += term.weight;
    got += term.weight * MATCH_CREDIT[matchCriterion(spot, term.when)];
  }
  return got / total;
}

/** The matched soft terms that best explain a pick: heaviest first, ties in preset order. */
export function topReasons(spot: BundleSpot, soft: readonly SoftTerm[], limit = 2): Criterion[] {
  return soft
    .map((term, i) => ({ term, i }))
    .filter(({ term }) => matchCriterion(spot, term.when) === "yes")
    .sort((a, b) => b.term.weight - a.term.weight || a.i - b.i)
    .slice(0, limit)
    .map(({ term }) => term.when);
}
```

```ts
// packages/core/src/scoring/presets.ts
import { z } from "zod";
import { Criterion, SoftTerm } from "./criteria.ts";

export const PRESET_ID = ["silent_solo", "group", "calls", "late_night", "quick_30"] as const;
export type BuiltinPresetId = (typeof PRESET_ID)[number];

export const Preset = z.object({
  id: z.string().min(1).max(40),
  /** Null for built-ins: the UI names them from the copy deck. */
  name: z.string().trim().min(1).max(24).nullable(),
  required: z.array(Criterion).max(16),
  soft: z.array(SoftTerm).max(16),
  /** Choosing the preset sets the time chip (Quick 30). */
  minutes: z.union([z.literal(30), z.literal(60), z.literal(120)]).nullable(),
  /** Non-null: the preset is for a group and shows the people stepper. */
  groupDefault: z.number().int().min(2).max(12).nullable(),
});
export type Preset = z.infer<typeof Preset>;

const OUTLETS = { when: { attr: "outlet_coverage_pct", target: 0.5 }, weight: 1 } as const;
const TALKING = { attr: "noise_policy", target: ["conversational", "group_friendly"] } as const;

export const BUILTIN_PRESETS: readonly Preset[] = [
  {
    id: "silent_solo", name: null, minutes: null, groupDefault: null,
    required: [{ attr: "noise_policy", target: ["silent", "quiet"] }],
    soft: [
      { when: { attr: "noise_policy", target: ["silent"] }, weight: 2 },
      OUTLETS,
      { when: { attr: "seat_type", target: "carrel" }, weight: 1 },
    ],
  },
  {
    id: "group", name: null, minutes: null, groupDefault: 3,
    required: [{ attr: "flag", flag: "group_work_ok", target: true }],
    soft: [
      { when: { attr: "flag", flag: "whiteboard", target: true }, weight: 1 },
      { when: { attr: "table_config", target: "small_2_4" }, weight: 1 },
      OUTLETS,
      { when: TALKING, weight: 1 },
    ],
  },
  {
    id: "calls", name: null, minutes: null, groupDefault: null,
    required: [{ attr: "calls_ok", target: ["allowed"] }],
    soft: [
      { when: { attr: "cell_signal", target: ["good"] }, weight: 2 },
      { when: TALKING, weight: 1 },
      OUTLETS,
    ],
  },
  {
    id: "late_night", name: null, minutes: null, groupDefault: null,
    required: [],
    soft: [
      { when: { attr: "flag", flag: "open_past_midnight", target: true }, weight: 2 },
      { when: { attr: "flag", flag: "staffed_late", target: true }, weight: 1 },
      { when: { attr: "flag", flag: "lit_route_to_residences", target: true }, weight: 1 },
      { when: { attr: "amenity", target: "late_food" }, weight: 1 },
    ],
  },
  { id: "quick_30", name: null, minutes: 30, groupDefault: null, required: [], soft: [] },
];

/** A built-in or custom preset by id; unknown ids fall back to Silent solo. */
export function presetById(id: string, custom: readonly Preset[]): Preset {
  const found = BUILTIN_PRESETS.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
  if (found !== undefined) return found;
  const fallback = BUILTIN_PRESETS[0];
  if (fallback === undefined) throw new Error("no built-in presets");
  return fallback;
}
```

If the `as const` literal objects do not fit `Preset` under `exactOptionalPropertyTypes` (readonly tuple versus array), drop the shared consts and write the objects inline. Keep the values identical.

```ts
// packages/core/src/scoring/access.ts
import { z } from "zod";
import type { BundleBuilding, BundleSpot } from "../bundle.ts";
import type { Eligibility } from "../enums.ts";

/** Self-declared, unverified, stored on the phone only. Ids are bundle building ids. */
export const AccessProfile = z.object({
  residence: z.string().min(1).nullable(),
  quad: z.string().min(1).nullable(),
  grad: z.boolean(),
});
export type AccessProfile = z.infer<typeof AccessProfile>;
export const DEFAULT_ACCESS: AccessProfile = { residence: null, quad: null, grad: false };

export type Access =
  | { kind: "open" }
  | { kind: "locked"; eligibility: Eligibility; scope: string | null }
  | { kind: "unverified" };

export function scopeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function matchesScope(
  scope: string | null,
  buildingId: string | null,
  buildings: readonly BundleBuilding[],
): boolean {
  if (scope === null || buildingId === null) return false;
  const key = scopeKey(scope);
  const b = buildings.find((x) => x.id === buildingId);
  return key === buildingId || (b !== undefined && key === scopeKey(b.name));
}

/** Locked beats unverified, so Browse can name who a spot is for. */
export function accessFor(
  spot: BundleSpot,
  profile: AccessProfile,
  buildings: readonly BundleBuilding[],
): Access {
  let eligible: boolean;
  switch (spot.eligibility) {
    case "all_students":
    case "public":
      eligible = true;
      break;
    case "grad_only":
      eligible = profile.grad;
      break;
    case "residents_building":
      eligible = matchesScope(spot.eligibility_scope, profile.residence, buildings);
      break;
    case "residents_quad":
      eligible = matchesScope(spot.eligibility_scope, profile.quad, buildings);
      break;
    case "department":
      eligible = false;
      break;
  }
  if (!eligible) return { kind: "locked", eligibility: spot.eligibility, scope: spot.eligibility_scope };
  if (!spot.eligibility_verified) return { kind: "unverified" };
  return { kind: "open" };
}
```

Add the three modules to `scoring/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/core --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scoring packages/core/test/scoring
git commit -m "feat(core): criteria, built-in presets and access rules"
```

### Task A4: busyness reading, P(seat) and time value

**Tier:** Logic.

**Files:**
- Create: `packages/core/src/scoring/seat.ts`, `packages/core/test/scoring/seat.test.ts`
- Modify: `packages/core/src/scoring/index.ts`

**Interfaces:**
- Produces:
  - `SEAT_A = 8`, `SEAT_B = 0.8`, `EXAM_FALLBACK_FACTOR = 1.25`, `OVERHEAD_MINUTES = 3`
  - `type SlotReading = { ratio: number; confidence: SlotConfidence }`
  - `slotReading(b: BundleBusyness, slot: number, exam: boolean): SlotReading`
  - `effectiveCapacity(spot): number`
  - `pSeat(reading, spot, group): number`
  - `type SeatWord = "likely" | "tight" | "unlikely"`, `seatWord(p): SeatWord`
  - `busyBucket(ratio): Fullness`
  - `timeValue(availableMinutes, walkMinutes): number`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/scoring/seat.test.ts
import { expect, test } from "bun:test";
import {
  type BundleSpot, busyBucket, pSeat, seatWord, type SlotConfidence, slotReading, timeValue,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";
import { mulberry32 } from "../prng.ts";

const b = makeScoringBundle();
const get = (id: string): BundleSpot => {
  const s = b.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(id);
  return s;
};
const busy = (id: string) => {
  const x = b.busyness[id];
  if (x === undefined) throw new Error(id);
  return x;
};

test("P(seat) logistic values on the golden spots", () => {
  const m = (ratio: number) => ({ ratio, confidence: "measured" as const });
  expect(pSeat(m(0.35), get(SPOT.carrels), 1)).toBeCloseTo(0.973403, 5);
  expect(pSeat(m(0.9), get(SPOT.reading), 1)).toBeCloseTo(0.310025, 5);
  // estimate shrink: 0.7 * P + 0.15
  expect(pSeat({ ratio: 0.6, confidence: "estimated" }, get(SPOT.sacLounge), 4)).toBeCloseTo(0.624335, 5);
  // group: r + (g - 1) / (0.7 * seats)
  expect(pSeat(m(0.35), get(SPOT.union), 4)).toBeCloseTo(0.921099, 5);
  // group larger than max_group_size
  expect(pSeat(m(0.35), get(SPOT.union), 5)).toBe(0);
});

test("P(seat) is in [0, 1] and non-increasing in r* (property)", () => {
  const rand = mulberry32(5);
  const confs: SlotConfidence[] = ["measured", "estimated", "none"];
  for (let i = 0; i < 500; i += 1) {
    const r1 = rand();
    const r2 = r1 + rand() * (1 - r1);
    const confidence = confs[i % 3] ?? "measured";
    const g = 1 + Math.floor(rand() * 4);
    const p1 = pSeat({ ratio: r1, confidence }, get(SPOT.sacLounge), g);
    const p2 = pSeat({ ratio: r2, confidence }, get(SPOT.sacLounge), g);
    expect(p1).toBeGreaterThanOrEqual(p2);
    expect(p1).toBeLessThanOrEqual(1);
    expect(p2).toBeGreaterThanOrEqual(0);
  }
});

test("exam slot: exam array when present, else regular times 1.25 capped, estimated", () => {
  expect(slotReading(busy(SPOT.union), 10, true)).toEqual({ ratio: 0.6, confidence: "measured" });
  expect(slotReading(busy(SPOT.reading), 10, true)).toEqual({ ratio: 1, confidence: "estimated" });
  expect(slotReading(busy(SPOT.carrels), 10, true)).toEqual({ ratio: 0.4375, confidence: "estimated" });
  expect(slotReading(busy(SPOT.hoursTbd), 10, true).confidence).toBe("none");
  expect(slotReading(busy(SPOT.carrels), 10, false)).toEqual({ ratio: 0.35, confidence: "measured" });
});

test("words: seat thresholds and bucket midpoints", () => {
  expect(seatWord(0.7)).toBe("likely");
  expect(seatWord(0.69)).toBe("tight");
  expect(seatWord(0.4)).toBe("tight");
  expect(seatWord(0.39)).toBe("unlikely");
  expect(busyBucket(0.1)).toBe("empty");
  expect(busyBucket(0.35)).toBe("some");
  expect(busyBucket(0.6)).toBe("filling");
  expect(busyBucket(0.85)).toBe("nearly_full");
  expect(busyBucket(0.93)).toBe("full");
});

test("time value", () => {
  expect(timeValue(60, 0)).toBeCloseTo(0.95, 10);
  expect(timeValue(60, 2)).toBeCloseTo(55 / 60, 10);
  expect(timeValue(30, 40)).toBe(0);
  expect(timeValue(0, 0)).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/core/test/scoring/seat.test.ts`
Expected: FAIL, because `pSeat` is not exported.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/scoring/seat.ts
import type { BundleBusyness, BundleSpot } from "../bundle.ts";
import type { Fullness, SlotConfidence } from "../enums.ts";

export const SEAT_A = 8;
export const SEAT_B = 0.8;
export const UNCERTAIN_SCALE = 0.7;
export const UNCERTAIN_SHIFT = 0.15;
export const EXAM_FALLBACK_FACTOR = 1.25;
export const OVERHEAD_MINUTES = 3;
const CAPACITY_SHARE = 0.7;

export type SlotReading = { ratio: number; confidence: SlotConfidence };

/** The forecast for one slot, with the exam fallback when the bundle has no exam profile. */
export function slotReading(b: BundleBusyness, slot: number, exam: boolean): SlotReading {
  const regular = b.regular[slot];
  const confidence = b.confidence[slot];
  if (regular === undefined || confidence === undefined) throw new RangeError(`slot ${slot}`);
  if (!exam) return { ratio: regular, confidence };
  const e = b.exam?.[slot];
  if (e !== undefined) return { ratio: e, confidence };
  return {
    ratio: Math.min(1, regular * EXAM_FALLBACK_FACTOR),
    confidence: confidence === "none" ? "none" : "estimated",
  };
}

export function effectiveCapacity(spot: BundleSpot): number {
  return spot.effective_capacity ?? CAPACITY_SHARE * spot.seat_count;
}

/** Chance the right kind of seat is free at arrival. 0 when the group cannot fit. */
export function pSeat(reading: SlotReading, spot: BundleSpot, group: number): number {
  if (spot.max_group_size !== null && group > spot.max_group_size) return 0;
  const r = reading.ratio + (group - 1) / effectiveCapacity(spot);
  const p = 1 / (1 + Math.exp(SEAT_A * (r - SEAT_B)));
  return reading.confidence === "measured" ? p : UNCERTAIN_SCALE * p + UNCERTAIN_SHIFT;
}

export type SeatWord = "likely" | "tight" | "unlikely";
export function seatWord(p: number): SeatWord {
  if (p >= 0.7) return "likely";
  if (p >= 0.4) return "tight";
  return "unlikely";
}

/** Display bucket: midpoints between the fullness ratios (0.1, 0.35, 0.6, 0.85, 1). */
export function busyBucket(ratio: number): Fullness {
  if (ratio < 0.225) return "empty";
  if (ratio < 0.475) return "some";
  if (ratio < 0.725) return "filling";
  if (ratio < 0.925) return "nearly_full";
  return "full";
}

/** Share of the time window left for studying after the walk and settling in. */
export function timeValue(availableMinutes: number, walkMinutes: number): number {
  if (availableMinutes <= 0) return 0;
  return Math.min(1, Math.max(0, availableMinutes - walkMinutes - OVERHEAD_MINUTES) / availableMinutes);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/core --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scoring packages/core/test/scoring/seat.test.ts
git commit -m "feat(core): seat probability, exam fallback and time value"
```

### Task A5: ranking, Surprise candidates and the empty state

**Tier:** Logic.

**Files:**
- Create: `packages/core/src/scoring/rank.ts`, `packages/core/test/scoring/rank.test.ts`
- Modify: `packages/core/src/scoring/index.ts`

**Interfaces:**
- Consumes: everything from A1 to A4.
- Produces:

```ts
export const TIME_CHOICE = ["30", "60", "120", "close"] as const;
export const TimeChoice: z.ZodEnum; export type TimeChoice;
export const MIN_USEFUL_MINUTES = 30; export const TILL_CLOSE_CAP_MINUTES = 480;
export const DEFAULT_FROM = "melville-library"; export const MAX_GROUP = 12;
export type PickInput = { bundle: Bundle; now: Date; from: string; time: TimeChoice;
  preset: Preset; extra: readonly Criterion[]; group: number; access: AccessProfile };
export const EXCLUSION = ["locked", "unverified", "hours_unconfirmed", "closed",
  "closing_soon", "required", "group_too_big", "too_far"] as const;
export type Exclusion = (typeof EXCLUSION)[number];
export type Candidate = { kind: "candidate"; spot: BundleSpot; walkMinutes: number;
  arrival: Date; closesAt: Date; available: number; reading: SlotReading; pSeat: number;
  seat: SeatWord; fit: number; timeValue: number; score: number; reasons: Criterion[] };
export type Excluded = { kind: "excluded"; spot: BundleSpot; reason: Exclusion;
  walkMinutes: number | null };
export type RankResult = { ranked: Candidate[]; excluded: Excluded[] };
export function resolveFrom(bundle: Bundle, from: string | null): string | null;
export function rankSpots(input: PickInput): RankResult;      // preset applied
export function surpriseRank(input: PickInput): RankResult;   // preset and extra ignored, fit 1
export type Loosen = "preset" | "group" | "time" | "access";
export type EmptyHelp = { closest: { spot: BundleSpot; walkMinutes: number } | null; loosen: Loosen | null };
export function explainEmpty(result: RankResult, access: AccessProfile): EmptyHelp;
```

- [ ] **Step 1: Write the failing golden and edge tests.** These numbers are hand-computed in the addendum's terms. Do not regenerate them from the code.

```ts
// packages/core/test/scoring/rank.test.ts
import { expect, test } from "bun:test";
import {
  DEFAULT_ACCESS, explainEmpty, type PickInput, presetById, rankSpots, resolveFrom, surpriseRank,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

const bundle = makeScoringBundle();
const TUE_2PM = new Date("2026-10-13T18:00:00Z");
const base: PickInput = {
  bundle, now: TUE_2PM, from: "melville-library", time: "60",
  preset: presetById("silent_solo", []), extra: [], group: 1, access: DEFAULT_ACCESS,
};
const slugs = (r: ReturnType<typeof rankSpots>) => r.ranked.map((c) => c.spot.slug);
const reasonOf = (r: ReturnType<typeof rankSpots>, id: string) =>
  r.excluded.find((e) => e.spot.id === id)?.reason;

test("golden: silent solo from the library, 1 hr, Tue 2 PM", () => {
  const r = rankSpots(base);
  expect(slugs(r)).toEqual(["quiet-carrels", "union-study", "reading-room"]);
  expect(r.ranked[0]?.score).toBeCloseTo(0.924733, 5);
  expect(r.ranked[1]?.score).toBeCloseTo(0.206848, 5);
  expect(r.ranked[2]?.score).toBeCloseTo(0.142095, 5);
  expect(r.ranked[0]?.seat).toBe("likely");
  expect(r.ranked[2]?.seat).toBe("unlikely");
  expect(reasonOf(r, SPOT.sacLounge)).toBe("required");
  expect(reasonOf(r, SPOT.kelly)).toBe("locked");
  expect(reasonOf(r, SPOT.grad)).toBe("locked");
  expect(reasonOf(r, SPOT.unverified)).toBe("unverified");
  expect(reasonOf(r, SPOT.hoursTbd)).toBe("hours_unconfirmed");
});

test("golden: group of 4 from SAC, 2 hr", () => {
  const r = rankSpots({ ...base, from: "sac", time: "120", preset: presetById("group", []), group: 4 });
  expect(slugs(r)).toEqual(["union-study", "sac-lounge"]);
  expect(r.ranked[0]?.score).toBeCloseTo(0.644769, 5);
  expect(r.ranked[1]?.score).toBeCloseTo(0.301762, 5);
});

test("group of 5 drops the spot that seats 4", () => {
  const r = rankSpots({ ...base, from: "sac", time: "120", preset: presetById("group", []), group: 5 });
  expect(slugs(r)).toEqual(["sac-lounge"]);
  expect(reasonOf(r, SPOT.union)).toBe("group_too_big");
});

test("group size is ignored for presets without a group", () => {
  expect(slugs(rankSpots({ ...base, group: 6 }))).toEqual(slugs(rankSpots(base)));
});

test("23:40 Tue: a spot closing at midnight is too soon; past-midnight spots stay", () => {
  const r = rankSpots({ ...base, now: new Date("2026-10-14T03:40:00Z") });
  expect(slugs(r)).toEqual(["quiet-carrels", "reading-room"]);
  expect(reasonOf(r, SPOT.union)).toBe("closing_soon");
});

test("01:45 Wed: carrels close at 02:00, only the 24h room is left", () => {
  const r = rankSpots({ ...base, now: new Date("2026-10-14T05:45:00Z") });
  expect(slugs(r)).toEqual(["reading-room"]);
  expect(reasonOf(r, SPOT.carrels)).toBe("closing_soon");
  expect(reasonOf(r, SPOT.union)).toBe("closed");
});

test("till close uses minutes until each spot closes, capped at 8 hours", () => {
  const r = rankSpots({ ...base, time: "close" });
  const carrels = r.ranked.find((c) => c.spot.id === SPOT.carrels);
  expect(carrels?.available).toBe(480);
  const late = rankSpots({ ...base, time: "close", now: new Date("2026-10-14T03:40:00Z") });
  expect(late.ranked.find((c) => c.spot.id === SPOT.carrels)?.available).toBe(140);
});

test("extra filters add required criteria", () => {
  const r = rankSpots({ ...base, extra: [{ attr: "seat_type", target: "carrel" }] });
  expect(slugs(r)).toEqual(["quiet-carrels"]);
});

test("exam week busyness raises ratios with the 1.25 fallback", () => {
  const r = rankSpots({ ...base, now: new Date("2026-12-15T19:00:00Z") });
  const carrels = r.ranked.find((c) => c.spot.id === SPOT.carrels);
  expect(carrels?.reading).toEqual({ ratio: 0.4375, confidence: "estimated" });
});

test("surprise ignores the preset but never locked, unverified, or unconfirmed spots", () => {
  const r = surpriseRank(base);
  expect(slugs(r).sort()).toEqual(["quiet-carrels", "reading-room", "sac-lounge", "union-study"]);
  expect(r.ranked.every((c) => c.fit === 1)).toBe(true);
  expect(reasonOf(r, SPOT.kelly)).toBe("locked");
  expect(reasonOf(r, SPOT.unverified)).toBe("unverified");
  expect(reasonOf(r, SPOT.hoursTbd)).toBe("hours_unconfirmed");
});

test("from falls back to Melville Library, then the first building by name", () => {
  expect(resolveFrom(bundle, "sac")).toBe("sac");
  expect(resolveFrom(bundle, "gone-building")).toBe("melville-library");
  expect(resolveFrom(bundle, null)).toBe("melville-library");
  const noLib = { ...bundle, buildings: bundle.buildings.filter((b) => b.id !== "melville-library") };
  expect(resolveFrom(noLib, null)).toBe("kelly-quad");
  expect(resolveFrom({ ...bundle, buildings: [] }, null)).toBeNull();
});

test("empty state names the closest filtered-out open spot and what to loosen", () => {
  const r = rankSpots({ ...base, preset: presetById("calls", []) });
  expect(r.ranked.map((c) => c.spot.slug)).toEqual(["sac-lounge"]);
  const none = rankSpots({ ...base, preset: presetById("calls", []),
    extra: [{ attr: "seat_type", target: "carrel" }] });
  expect(none.ranked).toEqual([]);
  expect(explainEmpty(none, DEFAULT_ACCESS)).toEqual({
    closest: { spot: expect.objectContaining({ slug: "quiet-carrels" }), walkMinutes: 0 },
    loosen: "preset",
  });
  const nightAll = rankSpots({ ...base, now: new Date("2026-10-14T07:30:00Z"),
    extra: [{ attr: "seat_type", target: "carrel" }] });
  expect(explainEmpty(nightAll, DEFAULT_ACCESS).loosen).toBe("preset");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/core/test/scoring/rank.test.ts`
Expected: FAIL, because `rankSpots` is not exported.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/scoring/rank.ts
import { z } from "zod";
import type { Bundle, BundleHours, BundleSpot } from "../bundle.ts";
import { campusParts, isExamDate } from "../campusTime.ts";
import { slotIndex } from "../slots.ts";
import { type AccessProfile, accessFor } from "./access.ts";
import { type Criterion, fit, matchCriterion, topReasons } from "./criteria.ts";
import { openSpan } from "./hours.ts";
import type { Preset } from "./presets.ts";
import { pSeat, type SeatWord, type SlotReading, seatWord, slotReading, timeValue } from "./seat.ts";
import { walkMinutes } from "./walk.ts";

export const TIME_CHOICE = ["30", "60", "120", "close"] as const;
export const TimeChoice = z.enum(TIME_CHOICE);
export type TimeChoice = z.infer<typeof TimeChoice>;
export const MIN_USEFUL_MINUTES = 30;
export const TILL_CLOSE_CAP_MINUTES = 480;
export const DEFAULT_FROM = "melville-library";
export const MAX_GROUP = 12;
const MINUTE_MS = 60_000;

export type PickInput = {
  bundle: Bundle;
  now: Date;
  from: string;
  time: TimeChoice;
  preset: Preset;
  extra: readonly Criterion[];
  group: number;
  access: AccessProfile;
};

export const EXCLUSION = [
  "locked", "unverified", "hours_unconfirmed", "closed", "closing_soon", "required",
  "group_too_big", "too_far",
] as const;
export type Exclusion = (typeof EXCLUSION)[number];

export type Candidate = {
  kind: "candidate";
  spot: BundleSpot;
  walkMinutes: number;
  arrival: Date;
  closesAt: Date;
  /** T: the time window in minutes (per spot for Till close). */
  available: number;
  reading: SlotReading;
  pSeat: number;
  seat: SeatWord;
  fit: number;
  timeValue: number;
  score: number;
  reasons: Criterion[];
};
export type Excluded = {
  kind: "excluded";
  spot: BundleSpot;
  reason: Exclusion;
  walkMinutes: number | null;
};
export type RankResult = { ranked: Candidate[]; excluded: Excluded[] };

/** A building the bundle knows: the saved one, else Melville Library, else the first by name. */
export function resolveFrom(bundle: Bundle, from: string | null): string | null {
  if (from !== null && bundle.buildings.some((b) => b.id === from)) return from;
  if (bundle.buildings.some((b) => b.id === DEFAULT_FROM)) return DEFAULT_FROM;
  const first = [...bundle.buildings].sort((a, b) => a.name.localeCompare(b.name))[0];
  return first?.id ?? null;
}

type Mode = { applyPreset: boolean };

function hoursBySpot(bundle: Bundle): Map<string, BundleHours[]> {
  const m = new Map<string, BundleHours[]>();
  for (const h of bundle.hours) {
    const list = m.get(h.spot_id);
    if (list === undefined) m.set(h.spot_id, [h]);
    else list.push(h);
  }
  return m;
}

function evaluate(
  spot: BundleSpot,
  input: PickInput,
  hours: readonly BundleHours[],
  mode: Mode,
): Candidate | Excluded {
  const out = (reason: Exclusion, walk: number | null): Excluded => ({
    kind: "excluded", spot, reason, walkMinutes: walk,
  });
  const { bundle } = input;
  const access = accessFor(spot, input.access, bundle.buildings);
  if (access.kind === "locked") return out("locked", null);
  if (access.kind === "unverified") return out("unverified", null);
  if (spot.hours_unconfirmed) return out("hours_unconfirmed", null);

  const walk = walkMinutes(bundle, input.from, spot);
  const arrival = new Date(input.now.getTime() + walk * MINUTE_MS);
  const tz = bundle.campus.tz;
  const span = openSpan(hours, bundle.term, arrival, tz);
  if (!span.open) return out("closed", walk);
  const available =
    input.time === "close"
      ? Math.min(TILL_CLOSE_CAP_MINUTES, (span.closesAt.getTime() - input.now.getTime()) / MINUTE_MS)
      : Number(input.time);
  const openAfterArrival = (span.closesAt.getTime() - arrival.getTime()) / MINUTE_MS;
  if (openAfterArrival < Math.min(available, MIN_USEFUL_MINUTES)) return out("closing_soon", walk);

  if (mode.applyPreset) {
    for (const c of [...input.preset.required, ...input.extra]) {
      if (matchCriterion(spot, c) !== "yes") return out("required", walk);
    }
  }

  const busyness = bundle.busyness[spot.id];
  // Bundle.superRefine guarantees an entry for every spot.
  if (busyness === undefined) throw new Error(`no busyness for ${spot.slug}`);
  const parts = campusParts(arrival, tz);
  const reading = slotReading(
    busyness,
    slotIndex(parts.slotDow, parts.hour),
    isExamDate(parts.date, bundle.term),
  );
  const group = input.preset.groupDefault === null ? 1 : input.group;
  const p = pSeat(reading, spot, group);
  if (p === 0) return out("group_too_big", walk);
  const tv = timeValue(available, walk);
  if (tv === 0) return out("too_far", walk);
  const f = mode.applyPreset ? fit(spot, input.preset.soft) : 1;
  return {
    kind: "candidate",
    spot,
    walkMinutes: walk,
    arrival,
    closesAt: span.closesAt,
    available,
    reading,
    pSeat: p,
    seat: seatWord(p),
    fit: f,
    timeValue: tv,
    score: f * p * tv,
    reasons: mode.applyPreset ? topReasons(spot, input.preset.soft) : [],
  };
}

function run(input: PickInput, mode: Mode): RankResult {
  const hours = hoursBySpot(input.bundle);
  const ranked: Candidate[] = [];
  const excluded: Excluded[] = [];
  for (const spot of input.bundle.spots) {
    const r = evaluate(spot, input, hours.get(spot.id) ?? [], mode);
    if (r.kind === "candidate") ranked.push(r);
    else excluded.push(r);
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score || a.walkMinutes - b.walkMinutes || a.spot.slug.localeCompare(b.spot.slug),
  );
  return { ranked, excluded };
}

/** Quick pick: hard filters, the preset's required and extra filters, then fit * P(seat) * time value. */
export function rankSpots(input: PickInput): RankResult {
  return run(input, { applyPreset: true });
}

/** Surprise me: every hard rule, but no preset or extra filters, and fit 1. */
export function surpriseRank(input: PickInput): RankResult {
  return run(input, { applyPreset: false });
}

export type Loosen = "preset" | "group" | "time" | "access";
export type EmptyHelp = {
  closest: { spot: BundleSpot; walkMinutes: number } | null;
  loosen: Loosen | null;
};

const OPEN_BUT_FILTERED: readonly Exclusion[] = ["required", "group_too_big", "closing_soon", "too_far"];

/** For an empty pick: the nearest open, usable spot that was filtered out, and one thing to loosen. */
export function explainEmpty(result: RankResult, access: AccessProfile): EmptyHelp {
  let closest: EmptyHelp["closest"] = null;
  for (const e of result.excluded) {
    if (!OPEN_BUT_FILTERED.includes(e.reason) || e.walkMinutes === null) continue;
    if (closest === null || e.walkMinutes < closest.walkMinutes) {
      closest = { spot: e.spot, walkMinutes: e.walkMinutes };
    }
  }
  const has = (r: Exclusion): boolean => result.excluded.some((e) => e.reason === r);
  const defaultAccess = access.residence === null && access.quad === null && !access.grad;
  const loosen: Loosen | null = has("required")
    ? "preset"
    : has("group_too_big")
      ? "group"
      : has("closing_soon") || has("too_far")
        ? "time"
        : has("locked") && defaultAccess
          ? "access"
          : null;
  return { closest, loosen };
}
```

Check the "calls" golden case. Calls requires `calls_ok` to be allowed, and only `sac-lounge` qualifies. Adding a carrel requirement leaves nothing, and the closest filtered-out open spot from the library is `quiet-carrels` at walk 0. At 03:30 EDT (`2026-10-14T07:30:00Z`), with Silent solo plus a carrel requirement, carrels and union are closed and only the 24-hour reading room is open, but it is filtered out by the carrel requirement, so `loosen` is "preset".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/core --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS. If a golden number disagrees, recheck the formula against spec section 5, not the expectation. Report any disagreement in the task report rather than editing the expected value.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scoring packages/core/test/scoring/rank.test.ts
git commit -m "feat(core): rank spots with golden tests and empty-state help"
```

### Task A6: Something else and Surprise me draws

**Tier:** Logic.

**Files:**
- Create: `packages/core/src/scoring/reroll.ts`, `packages/core/test/scoring/reroll.test.ts`
- Modify: `packages/core/src/scoring/index.ts`

**Interfaces:**
- Produces:
  - `RECENT_LIMIT = 5`
  - `RecentPicks` (Zod array of uuids, at most 5)
  - `pushRecent(recent, id): string[]`, newest first
  - `weightedSample<T>(items, weight, rand): T | null`
  - `rerollPool(ranked, recent): Candidate[]`
  - `type Pick = { primary: Candidate; alternates: Candidate[] }`
  - `topPick(ranked): Pick | null`
  - `draw(ranked, recent, rand, current?: string | null): Pick | null`, used by both Something else (on `rankSpots`) and Surprise me (on `surpriseRank`). `current` is the spot on screen, avoided like the newest recent pick.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/scoring/reroll.test.ts
import { expect, test } from "bun:test";
import {
  DEFAULT_ACCESS, draw, presetById, pushRecent, RecentPicks, rankSpots, rerollPool, surpriseRank,
  topPick, weightedSample,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";
import { mulberry32 } from "../prng.ts";

const bundle = makeScoringBundle();
const input = {
  bundle, now: new Date("2026-10-13T18:00:00Z"), from: "melville-library", time: "60" as const,
  preset: presetById("silent_solo", []), extra: [], group: 1, access: DEFAULT_ACCESS,
};

test("weighted sample walks the cumulative weights", () => {
  const items = ["a", "b", "c"];
  const w = (x: string) => ({ a: 1, b: 2, c: 1 })[x] ?? 0;
  expect(weightedSample(items, w, () => 0)).toBe("a");
  expect(weightedSample(items, w, () => 0.3)).toBe("b");
  expect(weightedSample(items, w, () => 0.99)).toBe("c");
  expect(weightedSample([], w, () => 0.5)).toBeNull();
});

test("pool is the top max(5, 30%) above 40% of the top score", () => {
  const ranked = surpriseRank(input).ranked;
  expect(rerollPool(ranked, []).map((c) => c.spot.slug)).toEqual([
    "quiet-carrels", "union-study", "sac-lounge",
  ]);
});

test("Something else with one good match returns that match", () => {
  const ranked = rankSpots(input).ranked;
  const first = topPick(ranked);
  expect(first?.primary.spot.id).toBe(SPOT.carrels);
  expect(first?.alternates.map((c) => c.spot.slug)).toEqual(["union-study", "reading-room"]);
  const again = draw(ranked, [SPOT.carrels], mulberry32(1));
  expect(again?.primary.spot.id).toBe(SPOT.carrels);
});

test("Surprise me avoids the last picks and falls back to the oldest", () => {
  const ranked = surpriseRank(input).ranked;
  const rand = mulberry32(3);
  const seen = new Set<string>();
  for (let i = 0; i < 300; i += 1) {
    const p = draw(ranked, [SPOT.carrels], rand);
    if (p === null) throw new Error("no pick");
    expect(p.primary.spot.id).not.toBe(SPOT.carrels);
    expect(p.primary.spot.id).not.toBe(SPOT.reading); // below the 40% floor
    seen.add(p.primary.spot.slug);
  }
  expect([...seen].sort()).toEqual(["sac-lounge", "union-study"]);
  // All three pool spots seen recently: the oldest (last in the list) comes back
  const all = [SPOT.carrels, SPOT.union, SPOT.sacLounge];
  expect(draw(ranked, all, rand)?.primary.spot.id).toBe(SPOT.sacLounge);
  expect(draw([], [], rand)).toBeNull();
});

test("a draw never re-shows the spot on screen while others qualify", () => {
  const ranked = surpriseRank(input).ranked;
  const rand = mulberry32(9);
  for (let i = 0; i < 200; i += 1) {
    // Empty Surprise history, but carrels is the current primary (shown by the top pick)
    expect(draw(ranked, [], rand, SPOT.carrels)?.primary.spot.id).not.toBe(SPOT.carrels);
  }
  // With one good match, the current spot comes back (the screen toasts "only good match")
  expect(draw(rankSpots(input).ranked, [], rand, SPOT.carrels)?.primary.spot.id).toBe(SPOT.carrels);
});

test("alternates never repeat the primary", () => {
  const ranked = surpriseRank(input).ranked;
  const p = draw(ranked, [SPOT.carrels], () => 0);
  expect(p?.alternates.some((c) => c.spot.id === p.primary.spot.id)).toBe(false);
  expect(p?.alternates).toHaveLength(2);
});

test("recent history keeps 5, newest first, no duplicates; schema rejects junk", () => {
  let r: string[] = [];
  for (const id of Object.values(SPOT)) r = pushRecent(r, id);
  expect(r).toHaveLength(5);
  expect(r[0]).toBe(SPOT.hoursTbd);
  expect(pushRecent(r, SPOT.grad)[0]).toBe(SPOT.grad);
  expect(new Set(pushRecent(r, SPOT.grad)).size).toBe(5);
  expect(RecentPicks.safeParse(["x"]).success).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/core/test/scoring/reroll.test.ts`
Expected: FAIL, because `draw` is not exported.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/scoring/reroll.ts
import { z } from "zod";
import type { Candidate } from "./rank.ts";

export const RECENT_LIMIT = 5;
export const REROLL_MIN_POOL = 5;
export const REROLL_POOL_SHARE = 0.3;
export const REROLL_FLOOR = 0.4;
const ALTERNATES = 2;

export const RecentPicks = z.array(z.uuid()).max(RECENT_LIMIT);
export type RecentPicks = z.infer<typeof RecentPicks>;

/** Newest first, at most 5, no duplicates. */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
}

export function weightedSample<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rand: () => number,
): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (total <= 0) return items[0] ?? null;
  let x = rand() * total;
  for (const item of items) {
    x -= Math.max(0, weight(item));
    if (x < 0) return item;
  }
  return items[items.length - 1] ?? null;
}

/** Top max(5, 30%) by score, at least 40% of the top score, minus recent picks. */
export function rerollPool(ranked: readonly Candidate[], recent: readonly string[]): Candidate[] {
  const top = ranked[0];
  if (top === undefined) return [];
  const size = Math.max(REROLL_MIN_POOL, Math.ceil(ranked.length * REROLL_POOL_SHARE));
  const pool = ranked.slice(0, size).filter((c) => c.score >= REROLL_FLOOR * top.score);
  const fresh = pool.filter((c) => !recent.includes(c.spot.id));
  if (fresh.length > 0) return fresh;
  // Everything good was shown lately: bring back the one shown longest ago.
  const oldest = [...pool].sort((a, b) => recent.indexOf(b.spot.id) - recent.indexOf(a.spot.id))[0];
  return oldest === undefined ? [] : [oldest];
}

export type Pick = { primary: Candidate; alternates: Candidate[] };

function withAlternates(primary: Candidate, ranked: readonly Candidate[]): Pick {
  return {
    primary,
    alternates: ranked.filter((c) => c.spot.id !== primary.spot.id).slice(0, ALTERNATES),
  };
}

export function topPick(ranked: readonly Candidate[]): Pick | null {
  const first = ranked[0];
  return first === undefined ? null : withAlternates(first, ranked);
}

/**
 * One weighted draw. Something else passes rankSpots().ranked; Surprise me passes
 * surpriseRank().ranked. `current` (the spot on screen) is avoided like the
 * newest recent pick, so a tap never re-shows it while anything else qualifies.
 */
export function draw(
  ranked: readonly Candidate[],
  recent: readonly string[],
  rand: () => number,
  current: string | null = null,
): Pick | null {
  const avoid = current === null ? recent : [current, ...recent.filter((id) => id !== current)];
  const primary = weightedSample(rerollPool(ranked, avoid), (c) => c.score, rand);
  return primary === null ? null : withAlternates(primary, ranked);
}
```

- [ ] **Step 4: Run the whole core suite and the Node smoke**

Run: `bun test packages/core --timeout 60000 && bun run typecheck && bun run lint && bun run smoke:node`
Expected: PASS. The smoke proves that core still runs on Node.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scoring packages/core/test/scoring/reroll.test.ts
git commit -m "feat(core): weighted reroll and surprise draws"
```

---

## Phase B: bundle client

### Task B1: the Date header reaches the client

**Tier:** Logic.

**Files:**
- Modify:
  - `packages/ui-logic/src/adapters.ts` (the `Fetch` contract)
  - `packages/ui-logic/test/fakes.ts` (`FakeFetch`)
  - `packages/ui-logic/src/bundleClient.ts`
  - `packages/ui-logic/test/bundleClient.test.ts`
  - `apps/server/src/publish/target.ts` (`DATA_HEADERS`)
  - `apps/server/test/publisher.test.ts`

**Interfaces:**
- Produces:
  - `type FetchTextResponse = FetchResponse & { date: string | null }`
  - `Fetch.getText(url): Promise<FetchTextResponse>`
  - The ok variants of `BundleLoad` gain `skewMs: number`. It is 0 for cached loads, and for fresh loads it comes from the pointer response's `Date`, through `clockSkewMs`.
  - The ok variants also gain `networkFailed: boolean`. It is true only when a request rejected (offline or timeout) or returned a non-2xx status. A newer schema major, an invalid pointer, a pointer URL that does not match its hash, or an unparseable bundle fall back to the cache with `networkFailed: false`, because the network worked.
  - `readLastGood(deps: BundleClientDeps, baseUrl: string): Promise<(BundleLoad & { status: "cached" }) | null>`

- [ ] **Step 1: Write the failing tests.** Add these to `bundleClient.test.ts`, reusing its existing route and fixture helpers. Give `FakeFetch` a public `date: string | null = null` field, and have it return `{ ...route, date: this.date }`.

```ts
test("a fresh load reports clock skew from the pointer's Date header", async () => {
  // Same setup as the existing "fresh" test, with the device 3 h behind the server
  fetch.date = "Tue, 13 Oct 2026 21:00:00 GMT";
  const load = await loadBundle({ fetch, cache, clock: fixedClock("2026-10-13T18:00:00Z") }, BASE);
  expect(load.status).toBe("fresh");
  if (load.status !== "unavailable") expect(load.skewMs).toBe(3 * 3_600_000);
});

test("a cached load never reports skew", async () => {
  // Seed the cache through one fresh load, then go offline
  fetch.date = "Tue, 13 Oct 2026 21:00:00 GMT";
  await loadBundle(deps, BASE);
  fetch.offline = true;
  const load = await loadBundle(deps, BASE);
  expect(load.status).toBe("cached");
  if (load.status !== "unavailable") expect(load.skewMs).toBe(0);
});

test("networkFailed is true only when the network failed", async () => {
  await loadBundle(deps, BASE); // seed the cache
  fetch.offline = true;
  const offline = await loadBundle(deps, BASE);
  if (offline.status !== "unavailable") expect(offline.networkFailed).toBe(true);
  fetch.offline = false;
  // Point the pointer at a newer schema major (reuse the existing schema-mismatch route helper)
  const newer = await loadBundleWithNewerPointer();
  if (newer.status !== "unavailable") {
    expect(newer.updateAvailable).toBe(true);
    expect(newer.networkFailed).toBe(false);
  }
});

test("readLastGood returns the cached bundle without touching the network", async () => {
  await loadBundle(deps, BASE);
  const before = fetch.calls.length;
  const cached = await readLastGood(deps, BASE);
  expect(cached?.status).toBe("cached");
  expect(fetch.calls.length).toBe(before);
  expect(await readLastGood({ ...deps, cache: new MemoryCache() }, BASE)).toBeNull();
});
```

In `publisher.test.ts`, next to the existing `_headers` assertion, add:

```ts
  expect(readFileSync(join(ctx.publishDir, "_headers"), "utf8")).toContain(
    "Access-Control-Expose-Headers: Date",
  );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/ui-logic/test/bundleClient.test.ts apps/server/test/publisher.test.ts --timeout 60000`
Expected: FAIL, because `skewMs` is undefined and the header is missing.

- [ ] **Step 3: Implement**

`adapters.ts`:

```ts
/** A GET response; `date` is the response's Date header, or null when not exposed. */
export type FetchTextResponse = FetchResponse & { date: string | null };

export interface Fetch {
  /** Rejects on network failure. Non-2xx statuses resolve normally. */
  getText(url: string): Promise<FetchTextResponse>;
}
```

`target.ts`: the first block of `DATA_HEADERS` becomes the following, so that cross-origin clients can read `Date`:

```ts
  "/*",
  "  Access-Control-Allow-Origin: *",
  "  Access-Control-Expose-Headers: Date",
```

`bundleClient.ts`:
1. Add `skewMs: number` to the `"fresh" | "cached"` variant.
2. Make `getJson` return `{ json: unknown; date: string | null }`.
3. Record `const at = deps.clock.now()` right after the pointer response resolves, and compute `skewMs = clockSkewMs(at, res.date)` (from `@perch/core`) only on the pointer request.
4. `fromCache` and `readLastGood` set `skewMs: 0`. The fresh branches set the computed skew.
   `fromCache(updateAvailable, networkFailed)` takes the second flag: `true` from the `catch` branches and non-2xx responses, `false` from the schema, pointer-shape, URL-hash and parse branches. `readLastGood` sets `false`. The fresh branches set `false`.
   `loadBundleWithNewerPointer` in the test stands for the existing test's newer-schema setup; write it inline with the same routes the current schema-mismatch test uses.
5. Export `readLastGood`, built on the existing `readCache` and `ageDays`.

Keep the "never throws" contract.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/ui-logic apps/server --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS. Fix every other `FakeFetch` and `Fetch` user that typecheck reports (only fakes should exist).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-logic/src/adapters.ts packages/ui-logic/src/bundleClient.ts packages/ui-logic/test/fakes.ts packages/ui-logic/test/bundleClient.test.ts apps/server/src/publish/target.ts apps/server/test/publisher.test.ts
git commit -m "feat(ui-logic): read clock skew from the bundle pointer date"
```

### Task B2: stale-while-revalidate bundle store

**Tier:** Logic.

**Files:**
- Create: `packages/ui-logic/src/bundleStore.ts`, `packages/ui-logic/test/bundleStore.test.ts`, `packages/ui-logic/test/fakeBundleStore.ts`
- Modify: `packages/ui-logic/src/index.ts`

**Interfaces:**
- Consumes: `loadBundle` and `readLastGood` from B1, `Foreground`, `NetworkStatus`, `correctedNow`.
- Produces:

```ts
export type ReadyLoad = Extract<BundleLoad, { bundle: Bundle }>;
export type BundleState =
  | { phase: "loading" }
  | { phase: "ready"; load: ReadyLoad; refreshing: boolean; checkFailed: boolean }
  | { phase: "unavailable"; reason: "offline_no_cache" | "update_required" };
export type BundleStoreDeps = BundleClientDeps & { foreground: Foreground; network: NetworkStatus };
export const REVALIDATE_AFTER_MS = 300_000;
export type BundleStore = {
  getSnapshot(): BundleState; subscribe(listener: () => void): () => void;
  start(): Promise<void>; refresh(): Promise<void>; now(): Date; stop(): void;
};
export function createBundleStore(deps: BundleStoreDeps, baseUrl: string): BundleStore;
// test helper (packages/ui-logic/test/fakeBundleStore.ts)
export function staticBundleStore(state: BundleState, now: () => Date): BundleStore;
```

- [ ] **Step 1: Write the failing tests** (`bundleStore.test.ts`). Use `MemoryCache`, `FakeFetch`, `mutableClock`, `FakeForeground` and `FakeNetwork` from `fakes.ts`, and the routes and fixture helpers that `bundleClient.test.ts` already builds. Move those helpers into a shared `test/bundleRoutes.ts` if they are local today.
  - "shows the cached bundle at once, then the fresh one": seed the cache with hash A and point the pointer at hash B. Call `start()` without awaiting it. Once `readLastGood` has resolved (await a microtask flush), the snapshot is `ready` with A and `refreshing: true`. After `await start()`, it is `ready` with B, `status: "fresh"` and `checkFailed: false`.
  - "offline with no cache": the result is `{ phase: "unavailable", reason: "offline_no_cache" }`.
  - "offline with cache": the result is `ready`, `status: "cached"`, `checkFailed: true`.
  - "a newer schema with cache": the result is `ready` with `load.updateAvailable: true` and `checkFailed: false`. It is not shown as offline. Without a cache, it is `unavailable`, `update_required`.
  - "corrects time only from a network Date": with `fetch.date` 3 h ahead, `store.now()` equals the device time plus 3 h. A store whose network failed on its only load has `now()` equal to the device time.
  - "revalidates on foreground only after 5 minutes": after start, `foreground.fire()` makes no new pointer request. After `clock.set(+6 min)` and `fire()`, it makes exactly one.
  - "revalidates when the network comes back": `network.set(true)` triggers one new pointer request.
  - "concurrent refreshes share one request": `await Promise.all([store.refresh(), store.refresh()])` makes one pointer request.
  - "a failed refresh keeps the bundle on screen": go from ready to offline. `refresh()` stays `ready` with `checkFailed: true`. It is never `unavailable`.
  - "stop unsubscribes": after `stop()`, foreground and network events trigger nothing.

Check the `FakeForeground` and `FakeNetwork` method names in `fakes.ts` (lines 160 to 190), and use them as they are.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/ui-logic/test/bundleStore.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/ui-logic/src/bundleStore.ts
import { type Bundle, correctedNow } from "@perch/core";
import type { Foreground, NetworkStatus } from "./adapters.ts";
import { type BundleClientDeps, type BundleLoad, loadBundle, readLastGood } from "./bundleClient.ts";

export type ReadyLoad = Extract<BundleLoad, { bundle: Bundle }>;
export type BundleState =
  | { phase: "loading" }
  | { phase: "ready"; load: ReadyLoad; refreshing: boolean; checkFailed: boolean }
  | { phase: "unavailable"; reason: "offline_no_cache" | "update_required" };
export type BundleStoreDeps = BundleClientDeps & { foreground: Foreground; network: NetworkStatus };
export const REVALIDATE_AFTER_MS = 5 * 60_000;

export type BundleStore = {
  getSnapshot(): BundleState;
  subscribe(listener: () => void): () => void;
  /** Idempotent: the cached bundle first, then one revalidation. */
  start(): Promise<void>;
  refresh(): Promise<void>;
  /** Device time corrected by the last network clock skew (0 until one arrives). */
  now(): Date;
  stop(): void;
};

export function createBundleStore(deps: BundleStoreDeps, baseUrl: string): BundleStore {
  let state: BundleState = { phase: "loading" };
  let skewMs = 0;
  let lastCheck = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;
  let started: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const unsubscribers: (() => void)[] = [];
  const set = (next: BundleState): void => {
    state = next;
    for (const l of listeners) l();
  };

  function refresh(): Promise<void> {
    if (inflight !== null) return inflight;
    inflight = (async () => {
      if (state.phase === "ready") set({ ...state, refreshing: true });
      const load = await loadBundle(deps, baseUrl);
      lastCheck = deps.clock.now().getTime();
      if (load.status === "unavailable") {
        // A bundle already on screen beats an error message.
        if (state.phase === "ready") set({ ...state, refreshing: false, checkFailed: true });
        else set({ phase: "unavailable", reason: load.reason });
        return;
      }
      if (load.status === "fresh") skewMs = load.skewMs;
      set({ phase: "ready", load, refreshing: false, checkFailed: load.networkFailed });
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      started ??= (async () => {
        const cached = await readLastGood(deps, baseUrl);
        if (cached !== null && state.phase === "loading") {
          set({ phase: "ready", load: cached, refreshing: true, checkFailed: false });
        }
        unsubscribers.push(
          deps.foreground.subscribe(() => {
            if (deps.clock.now().getTime() - lastCheck > REVALIDATE_AFTER_MS) void refresh();
          }),
          deps.network.subscribe((online) => {
            if (online) void refresh();
          }),
        );
        await refresh();
      })();
      return started;
    },
    refresh,
    now: () => correctedNow(deps.clock.now(), skewMs),
    stop() {
      for (const u of unsubscribers.splice(0)) u();
    },
  };
}
```

`fakeBundleStore.ts`: `staticBundleStore(state, now)` returns that state forever. `start` and `refresh` resolve at once, and `subscribe` returns a no-op.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-logic/src/bundleStore.ts packages/ui-logic/src/index.ts packages/ui-logic/test/bundleStore.test.ts packages/ui-logic/test/fakeBundleStore.ts packages/ui-logic/test/bundleRoutes.ts
git commit -m "feat(ui-logic): stale-while-revalidate bundle store"
```

(Leave out `bundleRoutes.ts` if you did not create it.)

### Task B3: web wiring: fetch adapter, deps and hooks

**Tier:** Logic, because this is the data path.

**Files:**
- Create:
  - `apps/web/src/adapters/fetch.ts`
  - `apps/web/src/hooks/useBundle.ts`
  - `apps/web/src/hooks/useCampusNow.ts`
  - `apps/web/test/fetchAdapter.test.ts`
  - `apps/web/test/useBundle.test.tsx`
- Modify:
  - `apps/web/src/adapters/browser.ts` (add `createSessionStorage`)
  - `apps/web/src/app/deps.ts` (`AppDeps` gains `bundle`, `prefs`, `tab` and `rand`)
  - `apps/web/test/harness.tsx` (`testApp` gains `opts.bundle` and `opts.rand`, and fills the new deps)

**Interfaces:**
- Produces:
  - `createFetch(fetchFn?, timeoutMs?): Fetch`
  - `createSessionStorage(win?): KeyValueStorage`, the same probe and fallback as `createLocalStorage`, on `win.sessionStorage`
  - `AppDeps` gains:
    - `bundle: BundleStore`
    - `prefs: KeyValueStorage` (localStorage)
    - `tab: KeyValueStorage` (sessionStorage)
    - `rand: () => number`
  - `useBundle(): BundleState`, which starts the store on first mount
  - `useCampusNow(): Date`, which re-renders every 60 s and on `visibilitychange` back to visible, using `deps.bundle.now()`
  - `testApp(opts)` takes `bundle?: BundleState` (default: ready with `makeScoringBundle()`, fresh, age 0), `rand?: () => number` (default `mulberry32(1)`) and `now?`. It builds `deps.bundle = staticBundleStore(state, () => clock.now())`, and `prefs` and `tab` as `MemoryStorage`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/fetchAdapter.test.ts
import { expect, test } from "vitest";
import { createFetch } from "../src/adapters/fetch.ts";

test("returns status, text and the Date header, without credentials", async () => {
  const seen: RequestInit[] = [];
  const f = createFetch(async (_url, init) => {
    seen.push(init ?? {});
    return new Response("{}", { status: 200, headers: { date: "Tue, 13 Oct 2026 18:00:00 GMT" } });
  });
  expect(await f.getText("https://data.example/bundle-latest.json")).toEqual({
    status: 200, text: "{}", date: "Tue, 13 Oct 2026 18:00:00 GMT",
  });
  expect(seen[0]?.credentials).toBe("omit");
  expect(seen[0]?.cache).toBe("no-cache");
});

test("a missing Date is null and a hung request times out", async () => {
  const f = createFetch(async () => new Response("x"));
  expect((await f.getText("https://d/x")).date).toBeNull();
  const hung = createFetch(() => new Promise<Response>(() => {}), 20);
  await expect(hung.getText("https://d/x")).rejects.toThrow(/timed out/);
});
```

`useBundle.test.tsx`: render a component that shows `useBundle().phase` under `renderApp(testApp({ me: null }))`. Expect "ready". With `bundle: { phase: "unavailable", reason: "offline_no_cache" }`, expect "unavailable". Spy on `deps.bundle.start`, and expect it to be called once.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run test/fetchAdapter.test.ts test/useBundle.test.tsx`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/adapters/fetch.ts
import type { Fetch } from "@perch/ui-logic";
import { withTimeout } from "./timeout.ts";

export const FETCH_TIMEOUT_MS = 10_000;
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** GETs for the static data site: no cookies, always revalidated, bounded in time. */
export function createFetch(
  fetchFn: FetchFn = (i, init) => fetch(i, init),
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Fetch {
  return {
    async getText(url) {
      const res = await withTimeout(
        fetchFn(url, { cache: "no-cache", credentials: "omit" }),
        timeoutMs,
        `GET ${url}`,
      );
      const text = await withTimeout(res.text(), timeoutMs, `body of ${url}`);
      return { status: res.status, text, date: res.headers.get("date") };
    },
  };
}
```

In `buildAppDeps`:

```ts
    bundle: createBundleStore(
      { fetch: createFetch(), cache: stores.cache, clock: systemClock,
        foreground: createForeground(), network },
      env.dataBaseUrl,
    ),
    prefs: createLocalStorage(),
    tab: createSessionStorage(),
    rand: Math.random,
```

`useBundle`:

```ts
export function useBundle(): BundleState {
  const { bundle } = useDeps();
  useEffect(() => {
    void bundle.start();
  }, [bundle]);
  return useSyncExternalStore(bundle.subscribe, bundle.getSnapshot);
}
```

`useCampusNow`: `useState(() => bundle.now())`. Run a `setInterval` of 60 s and a `visibilitychange` listener, and both set `bundle.now()`. Clean up on unmount.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --filter '@perch/web' test && bun run typecheck && bun run lint`
Expected: PASS, with all existing web tests still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/adapters/fetch.ts apps/web/src/adapters/browser.ts apps/web/src/app/deps.ts apps/web/src/hooks/useBundle.ts apps/web/src/hooks/useCampusNow.ts apps/web/test/harness.tsx apps/web/test/fetchAdapter.test.ts apps/web/test/useBundle.test.tsx
git commit -m "feat(web): bundle store, data fetch adapter and campus clock"
```

### Task B4: local data site for the preview and Playwright

**Tier:** Feature (test infrastructure).

**Files:**
- Modify: `apps/server/scripts/e2e-server.ts`, `apps/web/playwright.config.ts`, `CLAUDE.md` (the Visual Verification "Servers" commands)

**Interfaces:**
- Produces:
  - Env `E2E_DATA_PORT` (default 8788). The publisher's `dataBaseUrl` becomes `http://data.localhost:${E2E_DATA_PORT}`.
  - Env `E2E_PUBLISH_ON_BOOT` (`"1"` publishes once after seeding).
  - A static server for `publishDir` on 127.0.0.1 and ::1. It sends:
    - `Access-Control-Allow-Origin: *`
    - `Access-Control-Expose-Headers: Date`
    - a `Date` header from the e2e clock (`res.sendDate = false`, then set it by hand)
    - `no-cache` on `bundle-latest.json` and immutable caching on everything else

- [ ] **Step 1: Add the server.** After `publisher` is created:

```ts
const EnvData = z.object({
  E2E_DATA_PORT: z.coerce.number().int().positive().default(8788),
  E2E_PUBLISH_ON_BOOT: z.enum(["0", "1"]).default("0"),
});
const dataEnv = EnvData.parse(process.env);
// use `http://data.localhost:${dataEnv.E2E_DATA_PORT}` for createPublisher's dataBaseUrl

const TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json", ".jpg": "image/jpeg", ".txt": "text/plain",
};
const serveData = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const path = new URL(req.url ?? "/", "http://data.local").pathname;
  res.sendDate = false;
  const headers: Record<string, string> = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "Date",
    date: clock.now().toUTCString(),
  };
  if (path.includes("..") || path === "/") {
    res.writeHead(404, headers).end();
    return;
  }
  try {
    const body = await readFile(join(publishDir, path));
    headers["content-type"] = TYPES[extname(path)] ?? "application/octet-stream";
    headers["cache-control"] = path === "/bundle-latest.json"
      ? "no-cache" : "public, max-age=31536000, immutable";
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404, headers).end();
  }
};
const dataServers = ["127.0.0.1", "::1"].map((host) => {
  const s = createServer((req, res) => void serveData(req, res));
  s.on("error", (e) => console.error(`data server on ${host}:`, e.message));
  s.listen(dataEnv.E2E_DATA_PORT, host);
  return s;
});
if (dataEnv.E2E_PUBLISH_ON_BOOT === "1") {
  const out = await publisher.runNow();
  if (!out.ok) console.error("boot publish failed:", out.error);
}
```

Import `createServer`, `IncomingMessage` and `ServerResponse` from `node:http`, `readFile` from `node:fs/promises`, and `extname` from `node:path`. In `shutdown`, close every data server before `app.close()`. Never use `Bun.*`.

- [ ] **Step 2: Wire it up.** In `playwright.config.ts`, add `E2E_DATA_PORT: "8788"` and `E2E_PUBLISH_ON_BOOT: "1"` to the API webServer `env`. In `CLAUDE.md`, change the two Visual Verification server commands to the Procedure V form at the top of this plan: API with `E2E_DATA_PORT=8898 E2E_PUBLISH_ON_BOOT=1`, and web with `VITE_DATA_BASE_URL=http://data.localhost:8898`.

- [ ] **Step 3: Verify**

```bash
VDIR="${CLAUDE_JOB_DIR:-/tmp}/perch-b4"; mkdir -p "$VDIR"
(cd apps/server && E2E_PORT=8890 E2E_DATA_PORT=8898 E2E_PUBLISH_ON_BOOT=1 E2E_STATE="$VDIR/s.json" \
  nohup node scripts/e2e-server.ts > "$VDIR/api.log" 2>&1 & echo $! > "$VDIR/api.pid")
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8898/bundle-latest.json >/dev/null && break; sleep 1; done
curl -si http://127.0.0.1:8898/bundle-latest.json | grep -i -E "^(date|access-control)"
kill "$(cat "$VDIR/api.pid")"
```

Expected: the headers print, and `date` is the e2e clock (2026-10-13). Then run the full Playwright suite: `bun run --filter '@perch/web' e2e`. Expected: all green. If a survey test assumed that nothing was published at boot, update its expectation to the published state, and say so in the report.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/e2e-server.ts apps/web/playwright.config.ts CLAUDE.md
git commit -m "test(server): serve the e2e data site and publish on boot"
```

---

## Phase C: student Home quick pick at `/`

### Task C1: student shell, tab bar and routes

**Tier:** Feature.

**Files:**
- Move: `git mv apps/web/src/routes/index.tsx apps/web/src/routes/_student.index.tsx`, then rewrite it. Never run `rm`.
- Create:
  - `apps/web/src/routes/_student.tsx`
  - `apps/web/src/routes/_student.browse.tsx`
  - `apps/web/src/routes/_student.me.tsx`
  - `apps/web/src/routes/_student.spot.$slug.tsx`
  - `apps/web/src/ui/TabBar.tsx`
  - `apps/web/src/screens/student/Placeholder.tsx`
  - `apps/web/test/studentShell.test.tsx`
- Modify:
  - `apps/web/src/routes/__root.tsx`: the not-found screen is the student one outside `/survey`
  - `apps/web/src/ui/FilterChips.tsx`: `count` becomes optional
  - `apps/web/src/ui/styles.css`: `.tabbar` and `.student`
  - `apps/web/vite.config.ts`: manifest `start_url: "/"`, description "Find a study spot on campus."
  - `apps/web/src/routeTree.gen.ts`: regenerated
  - `docs/design/surveyor-copy.md` and `copy.gen.ts`
  - `apps/web/e2e/layout-entry.e2e.ts`: `/nope` now leads back to `/`

**Interfaces:**
- Produces:
  - `TabBar()`
  - The `_student` layout, which renders `<div className="student"><Outlet/></div><TabBar/>`
  - The routes `/`, `/browse`, `/me` and `/spot/$slug`. Each renders `Placeholder` until its phase replaces it. `Placeholder` is a `Screen` with the route's title and `t("student.data.loading")`.
  - The spot route's `validateSearch: z.object({ via: z.literal("pick").optional() })`
  - `FilterChips` option `count?: number`, whose count span renders only when it is set

- [ ] **Step 1: Add the copy.** Append this section to `docs/design/surveyor-copy.md` and run `bun run copy:gen`.

```markdown
## Student: shell

| id | text | max chars | notes |
|---|---|---|---|
| student.nav.label | Sections | 12 | tab bar landmark name |
| student.nav.home | Home | 8 | tab |
| student.nav.browse | Browse | 8 | tab |
| student.nav.me | Me | 8 | tab |
| student.notfound.back | Back to Home | 16 | student not-found link |
| student.home.title | Find a spot | 20 | Home large title |
| student.browse.title | Browse | 10 | large title |
| student.me.title | Me | 6 | large title |
| student.data.loading | Loading spots | 20 | skeleton status |
```

- [ ] **Step 2: Write the failing tests** (`studentShell.test.tsx`, with `testApp({ me: null })` and `renderRoute`):
  - At `/`, the h1 is "Find a spot", and the navigation landmark "Sections" holds the links Home, Browse and Me. Home has `aria-current="page"`.
  - At `/browse`, Browse has `aria-current="page"`.
  - At `/survey`, there is no "Sections" navigation, and the signed-out survey screen still renders. That proves the redirect is gone and survey is untouched.
  - At `/nope`, "Back to Home" links to `/`. At `/survey/nope`, "Back to spots" links to `/survey`.
  - At `/spot/quiet-carrels?via=pick`, the route renders, and the search parses.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run test/studentShell.test.tsx`
Expected: FAIL, because `/` still redirects.

- [ ] **Step 4: Implement**

`TabBar.tsx`:

```tsx
import { t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { CircleUser, House, List } from "lucide-react";
import { Icon } from "./Icon.tsx";

const TABS = [
  { to: "/", label: "student.nav.home", icon: House, exact: true },
  { to: "/browse", label: "student.nav.browse", icon: List, exact: false },
  { to: "/me", label: "student.nav.me", icon: CircleUser, exact: false },
] as const;

/** Bottom navigation for student mode: paper bar, top hairline, ink when current. Never red. */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label={t("student.nav.label")}>
      <ul className="tabbar__inner">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              className="tabbar__item"
              activeOptions={{ exact: tab.exact }}
              activeProps={{ "aria-current": "page" }}
            >
              <Icon icon={tab.icon} />
              <span>{t(tab.label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

CSS:
- `.tabbar` is fixed to the bottom, full width, and translucent paper with blur (the same recipe as `.topbar--scrolled`). It has a top hairline `var(--line)` and padding-bottom `env(safe-area-inset-bottom)`.
- `.tabbar__inner` is a grid of 3 equal columns, max-width 680 px, centered.
- `.tabbar__item` is a 56 px tall column with the icon over a 13 px label. It is `muted` by default, `ink` with weight 600 when `[aria-current="page"]`, and gets the hover wash `var(--hover)`.
- `.student` reserves `padding-bottom: calc(56px + env(safe-area-inset-bottom) + 24px)`.

Use only existing variables.

In `__root.tsx`, read the pathname with `useRouterState`. For the root `notFoundComponent`, render the existing `NotFound` when the path starts with `/survey`, and otherwise a `Screen` with `nav.not_found.body` and a link to `/` ("Back to Home").

- [ ] **Step 5: Regenerate routes and run everything**

Run: `cd apps/web && bunx vite build --outDir "${CLAUDE_JOB_DIR:-/tmp}/perch-c1-dist" && cd ../.. && bun run typecheck && bun run lint && bun run --filter '@perch/web' test && bun test packages/ui-logic --timeout 60000`
Expected: PASS, and `src/routeTree.gen.ts` changed. Then run `cd apps/web && bunx playwright test e2e/layout-entry.e2e.ts e2e/nav.e2e.ts`, after updating the `/nope` expectation to `toHaveURL(/\/$/)` with the link name "Back to Home". Run Procedure V for `/ /browse /me /survey`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes apps/web/src/routeTree.gen.ts apps/web/src/ui/TabBar.tsx apps/web/src/ui/FilterChips.tsx apps/web/src/ui/styles.css apps/web/src/screens/student/Placeholder.tsx apps/web/vite.config.ts apps/web/test/studentShell.test.tsx apps/web/e2e/layout-entry.e2e.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(web): student shell with tab bar at the root"
```

### Task C2: honest presenters for picks and data age

**Tier:** Logic (honesty rules).

**Files:**
- Create: `packages/ui-logic/src/student/format.ts`, `packages/ui-logic/src/student/present.ts`, `packages/ui-logic/src/student/index.ts`, `packages/ui-logic/test/studentPresent.test.ts`
- Modify: `packages/ui-logic/src/index.ts`, `docs/design/surveyor-copy.md`, `copy.gen.ts`, `packages/ui-logic/test/copy.test.ts` (`SAMPLE`)

**Interfaces:**
- Produces:
  - `slotWhen(at, tz): string`, for example "Tue 2 PM"
  - `clockText(at, tz): string`, for example "2:00 AM"
  - `shortDay(iso, tz): string`, for example "Oct 5"
  - `weekdayLong(at, tz): string`, for example "Tuesday"
  - `busyLine(reading, at, tz): string`
  - `rowBusy(reading): string`
  - `seatText(seat): string`
  - `walkText(minutes): string`
  - `closesText(closesAt, now, tz): string`
  - `reasonText(c: Criterion): string | null`
  - `placeText(spot, bundle): string`
  - `spotName(spot): string`
  - `lockText(access: Access): string | null`
  - `type PickCardView = { id; slug; name; place; walk; busy; seat; closes; reasons: string[] }`
  - `pickCardView(c: Candidate, bundle: Bundle, now: Date): PickCardView`
  - `type DataAgeView = { line: string; prominent: string | null; offline: boolean }`
  - `dataAgeView(ageDays: number, checkFailed: boolean): DataAgeView`

- [ ] **Step 1: Add the copy rows** (new sections in `surveyor-copy.md`), then run `bun run copy:gen`. Add these `SAMPLE` entries to `copy.test.ts`: `when: "Tue 2 PM"`, `days: "4"`, `weekday: "Wednesday"`, `scope: "Kelly Quad"`, `busy: "Usually some seats, typical Tue 2 PM"`, `license: "CC BY-SA 4.0"`, `attribution: "Perch surveyors"`.

```markdown
## Student: busyness (honesty: every line says typical, estimate, or no data)

| id | text | max chars | notes |
|---|---|---|---|
| student.busy.typical.empty | Usually empty, typical {when} | 40 | measured slot |
| student.busy.typical.some | Usually some seats, typical {when} | 44 | |
| student.busy.typical.filling | Usually filling up, typical {when} | 44 | |
| student.busy.typical.nearly_full | Usually nearly full, typical {when} | 44 | |
| student.busy.typical.full | Usually full, typical {when} | 40 | |
| student.busy.estimate.empty | Empty, estimate | 24 | surveyor estimate |
| student.busy.estimate.some | Some seats, estimate | 24 | |
| student.busy.estimate.filling | Filling up, estimate | 24 | |
| student.busy.estimate.nearly_full | Nearly full, estimate | 24 | |
| student.busy.estimate.full | Full, estimate | 24 | |
| student.busy.none | No busyness data yet | 24 | |
| student.busy.row.empty | Usually empty | 20 | Browse row end; list caption carries "typical" |
| student.busy.row.some | Usually some seats | 20 | |
| student.busy.row.filling | Usually filling up | 20 | |
| student.busy.row.nearly_full | Usually nearly full | 20 | |
| student.busy.row.full | Usually full | 20 | |
| student.busy.row_estimate.empty | Empty, est. | 16 | |
| student.busy.row_estimate.some | Some seats, est. | 16 | |
| student.busy.row_estimate.filling | Filling up, est. | 16 | |
| student.busy.row_estimate.nearly_full | Nearly full, est. | 18 | |
| student.busy.row_estimate.full | Full, est. | 16 | |
| student.busy.row_none | No data yet | 12 | |
| student.seat.likely | Likely seats | 16 | P(seat) >= 0.7 |
| student.seat.tight | Might be tight | 16 | >= 0.4 |
| student.seat.unlikely | Probably full | 16 | below 0.4 |

## Student: pick card and data age

| id | text | max chars | notes |
|---|---|---|---|
| student.pick.place | {building} · Floor {floor} | 44 | |
| student.pick.walk | {minutes} min walk | 14 | |
| student.pick.walk_here | In this building | 18 | walk 0 |
| student.pick.closes_in | Closes in {minutes} min | 22 | under an hour |
| student.pick.open_till | Open till {closes} | 20 | |
| student.pick.open_all_day | Open all day | 14 | 20 h or more left |
| student.reason.silent | Silent | 14 | |
| student.reason.quiet | Quiet | 14 | |
| student.reason.talking | Talking is fine | 18 | |
| student.reason.outlets | Outlets at most seats | 22 | |
| student.reason.carrels | Carrels | 14 | |
| student.reason.small_tables | Small tables | 14 | |
| student.reason.whiteboard | Whiteboard | 14 | |
| student.reason.calls | Calls OK | 12 | |
| student.reason.signal | Good signal | 14 | |
| student.reason.open_late | Open past midnight | 20 | |
| student.reason.staffed_late | Staffed late | 14 | |
| student.reason.lit_route | Lit walk home | 14 | |
| student.reason.late_food | Late food nearby | 18 | |
| student.reason.group_ok | Group work OK | 16 | |
| student.reason.natural_light | Natural light | 14 | |
| student.reason.step_free | Step-free | 12 | |
| student.reason.elevator | Elevator | 10 | |
| student.reason.food_ok | Food OK | 10 | |
| student.reason.drinks_ok | Drinks OK | 10 | |
| student.reason.big_room | 50+ seats | 10 | |
| student.reason.printer | Printer nearby | 16 | |
| student.reason.coffee | Coffee nearby | 16 | |
| student.lock.building | Residents of {scope} only | 40 | |
| student.lock.quad | Residents of {scope} only | 40 | |
| student.lock.grad | Grad students only | 20 | |
| student.lock.department | {scope} only | 36 | |
| student.lock.department_unknown | One department only | 20 | |
| student.lock.residents_unknown | Residents only | 16 | scope missing |
| student.lock.unverified | Access not confirmed yet | 26 | |
| student.data.today | Spots updated today | 24 | meta line |
| student.data.yesterday | Spots updated yesterday | 28 | |
| student.data.days | Spots updated {days} days ago | 32 | |
| student.data.old | These spots are {days} days old. Hours and busyness may have changed. | 80 | note banner over 3 days |
| student.data.offline | Offline. Using spots saved on this phone. | 48 | |
| student.data.unavailable | Can't load spots offline yet. Open once with signal. | 60 | spec wording |
| student.data.update_required | Update Perch to load spots. | 32 | spec wording |
| student.data.update_available | A newer Perch reads newer spots. Reload to update. | 60 | |
```

- [ ] **Step 2: Write the failing tests** (`studentPresent.test.ts`, using `makeScoringBundle` from `../../core/test/fixtures/scoring-bundle.ts`)

```ts
import { expect, test } from "bun:test";
import {
  DEFAULT_ACCESS, FULLNESS, presetById, rankSpots, type SlotConfidence,
} from "@perch/core";
import {
  busyLine, clockText, closesText, dataAgeView, lockText, pickCardView, rowBusy, slotWhen,
} from "../src/index.ts";
import { makeScoringBundle } from "../../core/test/fixtures/scoring-bundle.ts";

const NY = "America/New_York";
const TUE_2PM = new Date("2026-10-13T18:00:00Z");
const RATIOS = [0.1, 0.35, 0.6, 0.85, 1];

test("every busyness string names its basis and never claims to be live", () => {
  const confs: SlotConfidence[] = ["measured", "estimated", "none"];
  for (const confidence of confs) {
    for (const ratio of RATIOS) {
      for (const at of [TUE_2PM, new Date("2026-10-14T05:30:00Z")]) {
        const line = busyLine({ ratio, confidence }, at, NY);
        expect(line).toMatch(/typical|estimate|No busyness data/);
        expect(line).not.toMatch(/\blive\b|\bnow\b|right now/i);
        const row = rowBusy({ ratio, confidence });
        expect(row).toMatch(/^Usually|est\.$|^No data/);
        expect(row).not.toMatch(/\blive\b|\bnow\b/i);
      }
    }
  }
  expect(FULLNESS).toHaveLength(5);
});

test("measured lines carry the slot; estimates and no data do not", () => {
  expect(busyLine({ ratio: 0.35, confidence: "measured" }, TUE_2PM, NY))
    .toBe("Usually some seats, typical Tue 2 PM");
  expect(busyLine({ ratio: 0.6, confidence: "estimated" }, TUE_2PM, NY)).toBe("Filling up, estimate");
  expect(busyLine({ ratio: 0.6, confidence: "none" }, TUE_2PM, NY)).toBe("No busyness data yet");
});

test("times read in campus time", () => {
  expect(slotWhen(new Date("2026-10-14T04:30:00Z"), NY)).toBe("Wed 12 AM");
  expect(clockText(new Date("2026-10-14T06:00:00Z"), NY)).toBe("2:00 AM");
  expect(closesText(new Date("2026-10-13T18:40:00Z"), TUE_2PM, NY)).toBe("Closes in 40 min");
  expect(closesText(new Date("2026-10-14T06:00:00Z"), TUE_2PM, NY)).toBe("Open till 2:00 AM");
  expect(closesText(new Date("2026-10-15T06:00:00Z"), TUE_2PM, NY)).toBe("Open all day");
});

test("pick card view for the golden top pick", () => {
  const bundle = makeScoringBundle();
  const r = rankSpots({ bundle, now: TUE_2PM, from: "melville-library", time: "60",
    preset: presetById("silent_solo", []), extra: [], group: 1, access: DEFAULT_ACCESS });
  const top = r.ranked[0];
  if (top === undefined) throw new Error("no pick");
  expect(pickCardView(top, bundle, TUE_2PM)).toEqual({
    id: top.spot.id, slug: "quiet-carrels", name: "Quiet Carrels",
    place: "Melville Library · Floor 1", walk: "In this building",
    busy: "Usually some seats, typical Tue 2 PM", seat: "Likely seats",
    closes: "Open till 2:00 AM", reasons: ["Silent", "Outlets at most seats"],
  });
});

test("lock labels", () => {
  expect(lockText({ kind: "open" })).toBeNull();
  expect(lockText({ kind: "unverified" })).toBe("Access not confirmed yet");
  expect(lockText({ kind: "locked", eligibility: "residents_quad", scope: "Kelly Quad" }))
    .toBe("Residents of Kelly Quad only");
  expect(lockText({ kind: "locked", eligibility: "department", scope: null })).toBe("One department only");
});

test("data age", () => {
  expect(dataAgeView(0, false)).toEqual({ line: "Spots updated today", prominent: null, offline: false });
  expect(dataAgeView(4, true)).toEqual({
    line: "Spots updated 4 days ago",
    prominent: "These spots are 4 days old. Hours and busyness may have changed.",
    offline: true,
  });
  expect(dataAgeView(3, false).prominent).toBeNull();
});
```

`FULLNESS` is already exported by core `enums.ts`. If it is not, import `FULLNESS_RATIO` and use `Object.keys`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test packages/ui-logic/test/studentPresent.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 4: Implement** (`format.ts` and `present.ts`)

```ts
// packages/ui-logic/src/student/format.ts
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${tz}|${key}`;
  let f = cache.get(k);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    cache.set(k, f);
  }
  return f;
}
function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}
/** "Tue 2 PM": the weekday and hour of a forecast slot. */
export function slotWhen(at: Date, tz: string): string {
  const p = fmt(tz, "when", { weekday: "short", hour: "numeric", hourCycle: "h12" }).formatToParts(at);
  return `${part(p, "weekday")} ${part(p, "hour")} ${part(p, "dayPeriod")}`;
}
/** "2:00 AM". */
export function clockText(at: Date, tz: string): string {
  const p = fmt(tz, "clock", { hour: "numeric", minute: "2-digit", hourCycle: "h12" }).formatToParts(at);
  return `${part(p, "hour")}:${part(p, "minute")} ${part(p, "dayPeriod")}`;
}
/** "Oct 5". */
export function shortDay(iso: string, tz: string): string {
  return fmt(tz, "day", { month: "short", day: "numeric" }).format(new Date(iso));
}
/** "Tuesday". */
export function weekdayLong(at: Date, tz: string): string {
  return fmt(tz, "weekday", { weekday: "long" }).format(at);
}
/** "2 PM", for bar labels. */
export function hourText(at: Date, tz: string): string {
  const p = fmt(tz, "hour", { hour: "numeric", hourCycle: "h12" }).formatToParts(at);
  return `${part(p, "hour")} ${part(p, "dayPeriod")}`;
}
```

```ts
// packages/ui-logic/src/student/present.ts
import {
  type Access, type Bundle, type BundleSpot, busyBucket, type Candidate, type Criterion,
  type Fullness, type SeatWord, type SlotReading,
} from "@perch/core";
import { type CopyId, t } from "../copy/index.ts";
import { clockText, slotWhen } from "./format.ts";

const TYPICAL = {
  empty: "student.busy.typical.empty", some: "student.busy.typical.some",
  filling: "student.busy.typical.filling", nearly_full: "student.busy.typical.nearly_full",
  full: "student.busy.typical.full",
} as const satisfies Record<Fullness, CopyId>;
const ESTIMATE = {
  empty: "student.busy.estimate.empty", some: "student.busy.estimate.some",
  filling: "student.busy.estimate.filling", nearly_full: "student.busy.estimate.nearly_full",
  full: "student.busy.estimate.full",
} as const satisfies Record<Fullness, CopyId>;
const ROW = {
  empty: "student.busy.row.empty", some: "student.busy.row.some",
  filling: "student.busy.row.filling", nearly_full: "student.busy.row.nearly_full",
  full: "student.busy.row.full",
} as const satisfies Record<Fullness, CopyId>;
const ROW_EST = {
  empty: "student.busy.row_estimate.empty", some: "student.busy.row_estimate.some",
  filling: "student.busy.row_estimate.filling", nearly_full: "student.busy.row_estimate.nearly_full",
  full: "student.busy.row_estimate.full",
} as const satisfies Record<Fullness, CopyId>;
const SEAT = {
  likely: "student.seat.likely", tight: "student.seat.tight", unlikely: "student.seat.unlikely",
} as const satisfies Record<SeatWord, CopyId>;

/** The one sentence for a forecast slot. Never says live: typical, estimate, or no data. */
export function busyLine(reading: SlotReading, at: Date, tz: string): string {
  if (reading.confidence === "none") return t("student.busy.none");
  const bucket = busyBucket(reading.ratio);
  if (reading.confidence === "estimated") return t(ESTIMATE[bucket]);
  return t(TYPICAL[bucket], { when: slotWhen(at, tz) });
}

/** Short form for list rows; the list caption says "typical ..., not live". */
export function rowBusy(reading: SlotReading): string {
  if (reading.confidence === "none") return t("student.busy.row_none");
  const bucket = busyBucket(reading.ratio);
  return t(reading.confidence === "estimated" ? ROW_EST[bucket] : ROW[bucket]);
}

export const seatText = (seat: SeatWord): string => t(SEAT[seat]);

export function walkText(minutes: number): string {
  return minutes === 0 ? t("student.pick.walk_here") : t("student.pick.walk", { minutes });
}

const HOUR_MS = 3_600_000;
export function closesText(closesAt: Date, now: Date, tz: string): string {
  const left = closesAt.getTime() - now.getTime();
  if (left >= 20 * HOUR_MS) return t("student.pick.open_all_day");
  if (left < HOUR_MS) return t("student.pick.closes_in", { minutes: Math.max(0, Math.round(left / 60_000)) });
  return t("student.pick.open_till", { closes: clockText(closesAt, tz) });
}

/** Plain words for a matched criterion, or null when it has no short name. */
export function reasonText(c: Criterion): string | null {
  switch (c.attr) {
    case "noise_policy":
      if (c.target.length === 1 && c.target[0] === "silent") return t("student.reason.silent");
      if (c.target.every((x) => x === "silent" || x === "quiet")) return t("student.reason.quiet");
      return t("student.reason.talking");
    case "outlet_coverage_pct": return t("student.reason.outlets");
    case "seat_type": return c.target === "carrel" ? t("student.reason.carrels") : null;
    case "table_config": return c.target === "small_2_4" ? t("student.reason.small_tables") : null;
    case "calls_ok": return t("student.reason.calls");
    case "cell_signal": return t("student.reason.signal");
    case "food_policy":
      return c.target.includes("covered_drinks") ? t("student.reason.drinks_ok") : t("student.reason.food_ok");
    case "seat_count": return t("student.reason.big_room");
    case "amenity":
      if (c.target === "late_food") return t("student.reason.late_food");
      if (c.target === "printer") return t("student.reason.printer");
      if (c.target === "coffee_food") return t("student.reason.coffee");
      return null;
    case "flag": {
      if (!c.target) return null;
      const id = FLAG_REASON[c.flag];
      return id === undefined ? null : t(id);
    }
    default:
      return null;
  }
}

const FLAG_REASON: Partial<Record<BoolAttr, PlainCopyId>> = {
  whiteboard: "student.reason.whiteboard",
  open_past_midnight: "student.reason.open_late",
  staffed_late: "student.reason.staffed_late",
  lit_route_to_residences: "student.reason.lit_route",
  group_work_ok: "student.reason.group_ok",
  natural_light: "student.reason.natural_light",
  step_free: "student.reason.step_free",
  elevator: "student.reason.elevator",
};
```

Import `BoolAttr` from `@perch/core` and `PlainCopyId` from `../copy/index.ts` in `present.ts`. Declare `FLAG_REASON` above `reasonText`, or keep it below, since a `const` used inside a function body is fine.

```ts
export const spotName = (spot: BundleSpot): string => spot.common_name ?? spot.official_name;

export function placeText(spot: BundleSpot, bundle: Bundle): string {
  const building = bundle.buildings.find((b) => b.id === spot.building_id)?.name ?? spot.building_id;
  return t("student.pick.place", { building, floor: spot.floor });
}

export function lockText(access: Access): string | null {
  if (access.kind === "open") return null;
  if (access.kind === "unverified") return t("student.lock.unverified");
  const { eligibility, scope } = access;
  if (eligibility === "grad_only") return t("student.lock.grad");
  if (eligibility === "department") {
    return scope === null ? t("student.lock.department_unknown") : t("student.lock.department", { scope });
  }
  if (scope === null) return t("student.lock.residents_unknown");
  return eligibility === "residents_quad" ? t("student.lock.quad", { scope }) : t("student.lock.building", { scope });
}

export type PickCardView = {
  id: string; slug: string; name: string; place: string; walk: string;
  busy: string; seat: string; closes: string; reasons: string[];
};

export function pickCardView(c: Candidate, bundle: Bundle, now: Date): PickCardView {
  const tz = bundle.campus.tz;
  return {
    id: c.spot.id,
    slug: c.spot.slug,
    name: spotName(c.spot),
    place: placeText(c.spot, bundle),
    walk: walkText(c.walkMinutes),
    busy: busyLine(c.reading, c.arrival, tz),
    seat: seatText(c.seat),
    closes: closesText(c.closesAt, now, tz),
    reasons: c.reasons.map(reasonText).filter((x): x is string => x !== null),
  };
}

export type DataAgeView = { line: string; prominent: string | null; offline: boolean };
export function dataAgeView(ageDays: number, checkFailed: boolean): DataAgeView {
  const line =
    ageDays === 0 ? t("student.data.today")
      : ageDays === 1 ? t("student.data.yesterday")
        : t("student.data.days", { days: ageDays });
  return { line, prominent: ageDays > 3 ? t("student.data.old", { days: ageDays }) : null, offline: checkFailed };
}
```

`lockText(access)` with `eligibility` `all_students` or `public` cannot occur for a locked access, but the switch must stay exhaustive. Fall through to the building wording.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS, including `copy.test.ts`, with no em-dash and every row within its max chars.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-logic/src/student packages/ui-logic/src/index.ts packages/ui-logic/test/studentPresent.test.ts packages/ui-logic/test/copy.test.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(ui-logic): honest pick presenters and data age"
```

### Task C3: pick preferences, histories, filters and nearest building

**Tier:** Logic (trust boundary and location privacy).

**Files:**
- Create:
  - `packages/ui-logic/src/student/prefs.ts`
  - `packages/ui-logic/src/student/filters.ts`
  - `packages/ui-logic/src/student/nearest.ts`
  - `packages/ui-logic/src/student/directions.ts`
  - `packages/ui-logic/test/studentPrefs.test.ts`
- Modify: `packages/ui-logic/src/student/index.ts`, the copy deck (the filter labels), `copy.gen.ts`

**Interfaces:**
- Produces:

```ts
export const PICK_PREFS_KEY = "student:pick";
export const PickPrefs: z.ZodObject; export type PickPrefs = {
  from: string | null; time: TimeChoice; presetId: string; group: number;
  extra: Criterion[]; accessNoteDismissed: boolean };
export const DEFAULT_PICK_PREFS: PickPrefs; // { from: null, time: "60", presetId: "silent_solo", group: 3, extra: [], accessNoteDismissed: false }
export type Read<T> = { value: T; reset: boolean };
export function readJson<T>(storage: KeyValueStorage, key: string, schema: z.ZodType<T>, fallback: T): Read<T>;
export function writeJson(storage: KeyValueStorage, key: string, value: unknown): boolean;
export const RECENT_KEY = { pick: "student:recent:pick", surprise: "student:recent:surprise" } as const;
export function readRecent(tab: KeyValueStorage, kind: keyof typeof RECENT_KEY): string[];
export function writeRecent(tab: KeyValueStorage, kind: keyof typeof RECENT_KEY, ids: readonly string[]): void;
export const FILTER_ID = [...] as const; export type FilterId;
export const FILTERS: readonly { id: FilterId; group: FilterGroup; label: PlainCopyId; criterion: Criterion }[];
export const FILTER_GROUPS: readonly FilterGroup[]; export function filterLabel(group): string;
export function isOn(extra: readonly Criterion[], id: FilterId): boolean;
export function toggle(extra: readonly Criterion[], id: FilterId): Criterion[];
export const MAX_FIX_METERS = 1000;
export function nearestBuilding(buildings: readonly BundleBuilding[], fix: LatLngFix): BundleBuilding | null;
export function directionsUrl(spot: { lat: number; lng: number }, ios: boolean): string;
```

- [ ] **Step 1: Add the copy rows** (section `## Student: filters`), then run `copy:gen`.

```markdown
## Student: filters

| id | text | max chars | notes |
|---|---|---|---|
| student.filter.group.noise | Noise | 10 | |
| student.filter.group.rules | Power and rules | 18 | |
| student.filter.group.comfort | Room | 10 | |
| student.filter.group.access | Getting in | 12 | |
| student.filter.group.nearby | Late and nearby | 18 | |
| student.filter.silent | Silent only | 14 | |
| student.filter.quiet | Quiet or silent | 16 | |
| student.filter.talking | Talking is fine | 16 | |
| student.filter.outlets | Outlets at most seats | 22 | |
| student.filter.calls | Calls OK | 10 | |
| student.filter.food | Food OK | 10 | |
| student.filter.drinks | Drinks OK | 10 | |
| student.filter.group_ok | Group work OK | 14 | |
| student.filter.whiteboard | Whiteboard | 12 | |
| student.filter.big_room | 50+ seats | 10 | |
| student.filter.natural_light | Natural light | 14 | |
| student.filter.step_free | Step-free | 12 | |
| student.filter.elevator | Elevator | 10 | |
| student.filter.open_late | Open past midnight | 20 | |
| student.filter.printer | Printer nearby | 16 | |
| student.filter.coffee | Coffee nearby | 16 | |
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/ui-logic/test/studentPrefs.test.ts
import { expect, test } from "bun:test";
import {
  DEFAULT_PICK_PREFS, directionsUrl, FILTERS, isOn, nearestBuilding, PICK_PREFS_KEY, PickPrefs,
  readJson, readRecent, toggle, writeJson, writeRecent,
} from "../src/index.ts";
import { MemoryStorage } from "./fakes.ts";
import { makeScoringBundle, SPOT } from "../../core/test/fixtures/scoring-bundle.ts";

test("missing prefs are defaults without a reset; corrupt ones reset", () => {
  const s = new MemoryStorage();
  expect(readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS)).toEqual({ value: DEFAULT_PICK_PREFS, reset: false });
  s.setItem(PICK_PREFS_KEY, "{not json");
  expect(readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS)).toEqual({ value: DEFAULT_PICK_PREFS, reset: true });
  s.setItem(PICK_PREFS_KEY, JSON.stringify({ ...DEFAULT_PICK_PREFS, group: 99 }));
  expect(readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS).reset).toBe(true);
});

test("prefs never keep coordinates, even if something wrote them", () => {
  const s = new MemoryStorage();
  s.setItem(PICK_PREFS_KEY, JSON.stringify({ ...DEFAULT_PICK_PREFS, from: "sac", lat: 40.9, lng: -73.1 }));
  const read = readJson(s, PICK_PREFS_KEY, PickPrefs, DEFAULT_PICK_PREFS);
  expect(read.value.from).toBe("sac");
  writeJson(s, PICK_PREFS_KEY, read.value);
  expect(s.getItem(PICK_PREFS_KEY)).not.toMatch(/lat|lng|40\.9/);
});

test("recent histories are per kind, Zod-checked, and drop junk", () => {
  const tab = new MemoryStorage();
  writeRecent(tab, "pick", [SPOT.carrels]);
  expect(readRecent(tab, "pick")).toEqual([SPOT.carrels]);
  expect(readRecent(tab, "surprise")).toEqual([]);
  tab.setItem("student:recent:surprise", JSON.stringify(["junk"]));
  expect(readRecent(tab, "surprise")).toEqual([]);
});

test("filters toggle exact criteria", () => {
  const on = toggle([], "outlets");
  expect(isOn(on, "outlets")).toBe(true);
  expect(toggle(on, "outlets")).toEqual([]);
  expect(new Set(FILTERS.map((f) => f.id)).size).toBe(FILTERS.length);
});

test("nearest building snaps a fix and refuses a rough one", () => {
  const { buildings } = makeScoringBundle();
  expect(nearestBuilding(buildings, { lat: 40.9146, lng: -73.1242, accuracyMeters: 20 })?.id).toBe("sac");
  expect(nearestBuilding(buildings, { lat: 40.9146, lng: -73.1242, accuracyMeters: 5000 })).toBeNull();
  expect(nearestBuilding([], { lat: 0, lng: 0, accuracyMeters: 1 })).toBeNull();
});

test("directions carry only the spot's point", () => {
  expect(directionsUrl({ lat: 40.9155, lng: -73.1221 }, false))
    .toBe("https://www.google.com/maps/dir/?api=1&destination=40.9155%2C-73.1221&travelmode=walking");
  expect(directionsUrl({ lat: 40.9155, lng: -73.1221 }, true))
    .toBe("https://maps.apple.com/?daddr=40.9155%2C-73.1221&dirflg=w");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test packages/ui-logic/test/studentPrefs.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
// packages/ui-logic/src/student/prefs.ts
import { Criterion, MAX_GROUP, RecentPicks, TimeChoice } from "@perch/core";
import { z } from "zod";
import type { KeyValueStorage } from "../adapters.ts";

export const PICK_PREFS_KEY = "student:pick";
/** Home inputs. Holds a building id only: coordinates never reach storage. */
export const PickPrefs = z.object({
  from: z.string().min(1).nullable(),
  time: TimeChoice,
  presetId: z.string().min(1).max(40),
  group: z.number().int().min(2).max(MAX_GROUP),
  extra: z.array(Criterion).max(16),
  accessNoteDismissed: z.boolean(),
});
export type PickPrefs = z.infer<typeof PickPrefs>;
export const DEFAULT_PICK_PREFS: PickPrefs = {
  from: null, time: "60", presetId: "silent_solo", group: 3, extra: [], accessNoteDismissed: false,
};

export type Read<T> = { value: T; reset: boolean };

/** Parses a stored JSON value; anything unreadable is replaced by the fallback and reported. */
export function readJson<T>(
  storage: KeyValueStorage,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): Read<T> {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { value: fallback, reset: false };
  }
  if (raw === null) return { value: fallback, reset: false };
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return { value: parsed.data, reset: false };
  } catch {
    // fall through to reset
  }
  try {
    storage.removeItem(key);
  } catch {
    // nothing more to do
  }
  return { value: fallback, reset: true };
}

export function writeJson(storage: KeyValueStorage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const RECENT_KEY = { pick: "student:recent:pick", surprise: "student:recent:surprise" } as const;
export function readRecent(tab: KeyValueStorage, kind: keyof typeof RECENT_KEY): string[] {
  return readJson(tab, RECENT_KEY[kind], RecentPicks, []).value;
}
export function writeRecent(tab: KeyValueStorage, kind: keyof typeof RECENT_KEY, ids: readonly string[]): void {
  writeJson(tab, RECENT_KEY[kind], ids);
}
```

Because `PickPrefs` is a non-strict `z.object`, unknown keys such as `lat` are stripped on parse. Keep it non-strict on purpose; the "never keep coordinates" test pins that behavior.

```ts
// packages/ui-logic/src/student/filters.ts
import type { Criterion } from "@perch/core";
import { type PlainCopyId, t } from "../copy/index.ts";

export const FILTER_GROUP = ["noise", "rules", "comfort", "access", "nearby"] as const;
export type FilterGroup = (typeof FILTER_GROUP)[number];
export type FilterDef = { id: string; group: FilterGroup; label: PlainCopyId; criterion: Criterion };

export const FILTERS = [
  { id: "silent", group: "noise", label: "student.filter.silent", criterion: { attr: "noise_policy", target: ["silent"] } },
  { id: "quiet", group: "noise", label: "student.filter.quiet", criterion: { attr: "noise_policy", target: ["silent", "quiet"] } },
  { id: "talking", group: "noise", label: "student.filter.talking", criterion: { attr: "noise_policy", target: ["conversational", "group_friendly"] } },
  { id: "outlets", group: "rules", label: "student.filter.outlets", criterion: { attr: "outlet_coverage_pct", target: 0.5 } },
  { id: "calls", group: "rules", label: "student.filter.calls", criterion: { attr: "calls_ok", target: ["allowed"] } },
  { id: "food", group: "rules", label: "student.filter.food", criterion: { attr: "food_policy", target: ["food_ok"] } },
  { id: "drinks", group: "rules", label: "student.filter.drinks", criterion: { attr: "food_policy", target: ["covered_drinks", "food_ok"] } },
  { id: "group_ok", group: "rules", label: "student.filter.group_ok", criterion: { attr: "flag", flag: "group_work_ok", target: true } },
  { id: "whiteboard", group: "rules", label: "student.filter.whiteboard", criterion: { attr: "flag", flag: "whiteboard", target: true } },
  { id: "big_room", group: "comfort", label: "student.filter.big_room", criterion: { attr: "seat_count", target: 50 } },
  { id: "natural_light", group: "comfort", label: "student.filter.natural_light", criterion: { attr: "flag", flag: "natural_light", target: true } },
  { id: "step_free", group: "access", label: "student.filter.step_free", criterion: { attr: "flag", flag: "step_free", target: true } },
  { id: "elevator", group: "access", label: "student.filter.elevator", criterion: { attr: "flag", flag: "elevator", target: true } },
  { id: "open_late", group: "nearby", label: "student.filter.open_late", criterion: { attr: "flag", flag: "open_past_midnight", target: true } },
  { id: "printer", group: "nearby", label: "student.filter.printer", criterion: { attr: "amenity", target: "printer" } },
  { id: "coffee", group: "nearby", label: "student.filter.coffee", criterion: { attr: "amenity", target: "coffee_food" } },
] as const satisfies readonly FilterDef[];
export type FilterId = (typeof FILTERS)[number]["id"];

const GROUP_LABEL = {
  noise: "student.filter.group.noise", rules: "student.filter.group.rules",
  comfort: "student.filter.group.comfort", access: "student.filter.group.access",
  nearby: "student.filter.group.nearby",
} as const satisfies Record<FilterGroup, PlainCopyId>;
export const filterGroupLabel = (g: FilterGroup): string => t(GROUP_LABEL[g]);

const same = (a: Criterion, b: Criterion): boolean => JSON.stringify(a) === JSON.stringify(b);
function criterionOf(id: FilterId): Criterion {
  const def = FILTERS.find((f) => f.id === id);
  if (def === undefined) throw new Error(`unknown filter ${id}`);
  return def.criterion;
}
export const isOn = (extra: readonly Criterion[], id: FilterId): boolean =>
  extra.some((c) => same(c, criterionOf(id)));
export function toggle(extra: readonly Criterion[], id: FilterId): Criterion[] {
  const c = criterionOf(id);
  return isOn(extra, id) ? extra.filter((x) => !same(x, c)) : [...extra, c];
}
```

`as const` makes the `target` arrays readonly tuples. If `satisfies readonly FilterDef[]` rejects them, type `FilterDef.criterion` as `Criterion` and drop `as const` on the inner arrays, keeping `as const` only on the outer array for the `FilterId` union. Equivalently, declare `FILTER_ID` as a separate `as const` tuple and type `FILTERS` as `readonly (FilterDef & { id: FilterId })[]`. Pick whichever typechecks cleanly; the values must not change.

```ts
// packages/ui-logic/src/student/nearest.ts
import { type BundleBuilding, haversineMeters } from "@perch/core";
import type { LatLngFix } from "../adapters.ts";

/** Worse than this, the guess would mislead; ask for a building instead. */
export const MAX_FIX_METERS = 1000;

/** Snaps a one-off fix to the nearest building. The caller drops the fix right after. */
export function nearestBuilding(buildings: readonly BundleBuilding[], fix: LatLngFix): BundleBuilding | null {
  if (fix.accuracyMeters > MAX_FIX_METERS) return null;
  let best: BundleBuilding | null = null;
  let bestM = Number.POSITIVE_INFINITY;
  for (const b of buildings) {
    const m = haversineMeters(fix, b);
    if (m < bestM) {
      best = b;
      bestM = m;
    }
  }
  return best;
}
```

```ts
// packages/ui-logic/src/student/directions.ts
/** Walking directions to the spot. Only the spot's coordinates are in the link. */
export function directionsUrl(spot: { lat: number; lng: number }, ios: boolean): string {
  const point = encodeURIComponent(`${spot.lat},${spot.lng}`);
  return ios
    ? `https://maps.apple.com/?daddr=${point}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=walking`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-logic/src/student packages/ui-logic/test/studentPrefs.test.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(ui-logic): pick prefs, histories, filters and nearest building"
```

### Task C4: Home query inputs (the centerpiece)

**Tier:** Feature.

**Files:**
- Create:
  - `apps/web/src/hooks/useQuickPick.ts`
  - `apps/web/src/screens/student/Home.tsx`
  - `apps/web/src/screens/student/QueryPanel.tsx`
  - `apps/web/src/screens/student/FromSheet.tsx`
  - `apps/web/src/screens/student/FiltersSheet.tsx`
  - `apps/web/src/screens/student/student.css` (imported in `main.tsx`)
  - `apps/web/test/studentHomeInputs.test.tsx`
- Modify: `apps/web/src/routes/_student.index.tsx`, `apps/web/src/main.tsx`, the copy deck and `copy.gen.ts`

**Interfaces:**
- Consumes:
  - From core: `rankSpots`, `surpriseRank`, `topPick`, `draw`, `pushRecent`, `resolveFrom`, `presetById`, `BUILTIN_PRESETS`, `DEFAULT_ACCESS`, `AccessProfile`
  - From ui-logic: `readJson`, `writeJson`, `PickPrefs`, `readRecent`, `writeRecent`, `FILTERS`, `toggle`, `isOn`, `nearestBuilding`
  - `useBundle` and `useCampusNow`
- Produces:

```ts
export type PickMode = "top" | "reroll" | "surprise";
export type QuickPick = {
  state: "loading" | "unavailable" | "ready";
  unavailable: "offline_no_cache" | "update_required" | null;
  bundle: Bundle | null; now: Date; prefs: PickPrefs; from: string | null;
  presets: readonly Preset[]; preset: Preset; mode: PickMode;
  pick: Pick | null; empty: EmptyHelp | null;
  set(next: Partial<PickPrefs>): void;          // persists via writeJson(deps.prefs, PICK_PREFS_KEY, ...)
  somethingElse(): "new" | "same" | "none";
  surprise(): "new" | "same" | "none";
  showTop(): void;
};
export function useQuickPick(custom: readonly Preset[]): QuickPick;
```

`custom` is `[]` until Phase F. F2 passes the stored custom presets. The access profile is read from `deps.prefs` key `student:access` with `AccessProfile` and `DEFAULT_ACCESS`. F1 owns the writer.

Behavior:
- `from` is `resolveFrom(bundle, prefs.from)`.
- The ranking is `useMemo` over (bundle, now in whole minutes, prefs, access, custom).
- The current primary is stored as `{ mode, spotId }` in component state. On each render it is looked up in the current ranking: `rank.ranked` for top and reroll, `surpriseRank(...).ranked` for surprise. When it is gone, the hook falls back to `topPick` with mode "top". This keeps a pick honest as the clock moves.
- Every primary shown (top, reroll or surprise) is pushed with `pushRecent` into its own history, through `writeRecent(deps.tab, kind, ...)`. Top and reroll use `"pick"`, and surprise uses `"surprise"`.
- `somethingElse` and `surprise` call `draw(ranked, history, deps.rand, currentPrimaryId)`, always passing the spot on screen as `current`. They return `"same"` when the draw still returns the current spot (the screen toasts `student.pick.only_one`), and `"none"` when there is nothing to draw.
- Any `set()` resets the mode to `"top"`.
- When the preset has `minutes`, choosing it also sets `time` (Quick 30 sets "30").

Layout, top to bottom, all existing primitives:
1. `Screen` with the large title `student.home.title`, and `meta` holding the data age line (C5).
2. **From**: a `Row` titled `student.home.from.label`, with the chosen building name as `end` and a chevron. It opens `FromSheet`.
3. **How long**: `Segmented` with the options `30 min`, `1 hr`, `2 hr` and `Till close`, value `prefs.time`.
4. **What for**: `FilterChips`, without counts, over the built-ins plus the custom presets. The value is `prefs.presetId`.
5. **People**: a `Stepper` from 2 to 12, shown only when `preset.groupDefault !== null`. Its value is `prefs.group`.
6. **More filters**: a quiet `Button` with the `SlidersHorizontal` icon. Its label is `student.home.filters.button`, or `..._count` when `prefs.extra.length > 0`. It opens `FiltersSheet`.

`FromSheet` (a `Sheet` titled `student.home.from.sheet`):
- A ghost `Button` with the `LocateFixed` icon and the label `student.home.from.locate` (`..._locating` while pending). It calls `deps.geolocation.current()` once. A null result or a rough fix shows `student.home.from.denied` or `student.home.from.imprecise`. Otherwise it calls `nearestBuilding`, sets `from` to the building id, and shows `student.home.from.located`.
- The fix lives only inside the click handler. Never put it in state, a ref, a log or storage.
- Under the button, a helper `student.home.from.privacy`.
- A `Search` field, then building `Row`s. Use `matchBuildings` from `screens/BuildingPicker.tsx`. Show the first 8 matches; the chosen one gets `pressed` and an ink check.

`FiltersSheet` (a `Sheet` titled `student.home.filters.title`):
- One `TagGroup` per `FILTER_GROUP` (`filterGroupLabel`), with `Check variant="tag"` per filter.
- Actions: a quiet `Clear` and an ink `Done`.
- The props are `{ open; extra: Criterion[]; onChange(extra): void; onClose(): void; children?: ReactNode }`. Browse passes its extra switches as `children`.

- [ ] **Step 1: Add the copy rows** (section `## Student: Home inputs`), then run `copy:gen`.

```markdown
## Student: Home inputs

| id | text | max chars | notes |
|---|---|---|---|
| student.home.from.label | From | 8 | row title |
| student.home.from.sheet | Where are you? | 20 | sheet title |
| student.home.from.locate | Use my location | 20 | |
| student.home.from.locating | Finding you | 16 | |
| student.home.from.denied | Location is off. Pick a building instead. | 48 | |
| student.home.from.imprecise | Location too rough. Pick a building instead. | 48 | |
| student.home.from.located | Nearest building: {building} | 48 | |
| student.home.from.privacy | Used once to find the nearest building. Never saved or sent. | 64 | |
| student.home.from.search | Search buildings | 20 | |
| student.home.time.label | How long | 12 | |
| student.home.time.30 | 30 min | 8 | |
| student.home.time.60 | 1 hr | 6 | |
| student.home.time.120 | 2 hr | 6 | |
| student.home.time.close | Till close | 12 | |
| student.home.preset.label | What for | 12 | |
| student.preset.silent_solo | Silent solo | 14 | |
| student.preset.group | Group | 10 | |
| student.preset.calls | Calls | 10 | |
| student.preset.late_night | Late night | 12 | |
| student.preset.quick_30 | Quick 30 | 10 | |
| student.home.group.label | People | 10 | |
| student.home.filters.button | More filters | 16 | |
| student.home.filters.button_count | More filters, {count} on | 26 | |
| student.home.filters.title | More filters | 16 | |
| student.home.filters.clear | Clear | 8 | |
| student.home.filters.done | Done | 8 | |
```

- [ ] **Step 2: Write the failing tests** (`studentHomeInputs.test.tsx`, `testApp({ me: null })` with the scoring fixture at Tue 2 PM, `renderRoute(app, "/")`):
  - The defaults show "From" with "Melville Library", "1 hr" checked and "Silent solo" pressed. There is no People stepper.
  - Choosing "Group" shows People at 3. Choosing "Quick 30" checks "30 min".
  - Choosing "2 hr" stores `time: "120"` in `app.deps.prefs` under `student:pick`.
  - "Use my location" with `deps.geolocation.current` resolving `{ lat: 40.9146, lng: -73.1242, accuracyMeters: 20 }` shows "Nearest building: Student Activities Center" and sets From. Afterwards every value in `app.deps.prefs` and `app.deps.tab`, joined, does not match `/40\.91|73\.12|lat|lng/`.
  - With a null fix it shows "Location is off. Pick a building instead."
  - More filters: toggling "Outlets at most seats" changes the button to "More filters, 1 on". Clear resets it.
  - Corrupt `student:pick` in prefs before render: Home still renders with the defaults.

Make `MemoryStorage` expose its entries if it does not already, or read each key with `getItem`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run test/studentHomeInputs.test.tsx`
Expected: FAIL, because Home is still the placeholder.

- [ ] **Step 4: Implement** the hook and the components exactly as described. Keep screen files free of scoring logic, so everything goes through `useQuickPick`. `student.css` holds only layout glue (gaps between groups, using the `group`, `heading` and `field` spacing tokens as CSS variables). It adds no new colors, radii or shadows.

- [ ] **Step 5: Run the tests to verify they pass, then Procedure V**

Run: `bun run --filter '@perch/web' test && bun run typecheck && bun run lint`, then Procedure V for `/`, with the From sheet and the Filters sheet open in screenshots (use `verify-ui.ts` route captures plus one throwaway Playwright snippet in `$CLAUDE_JOB_DIR/tmp` for open sheets). Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useQuickPick.ts apps/web/src/screens/student apps/web/src/routes/_student.index.tsx apps/web/src/main.tsx apps/web/test/studentHomeInputs.test.tsx docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(web): home quick pick inputs, from sheet and filters"
```

### Task C5: Home results: pick card, Something else, Surprise me, empty and data states

**Tier:** Logic (the honesty-critical screen). It gets the full loop with review.

**Files:**
- Create:
  - `apps/web/src/screens/student/PickCard.tsx`
  - `apps/web/src/screens/student/EmptyPick.tsx`
  - `apps/web/src/screens/student/DataState.tsx`
  - `apps/web/test/studentHomeResults.test.tsx`
  - `apps/web/e2e/student-home.e2e.ts`
- Modify: `apps/web/src/screens/student/Home.tsx`, the copy deck and `copy.gen.ts`

**Interfaces:**
- Consumes: `useQuickPick`, `pickCardView`, `dataAgeView`, `explainEmpty` (via the hook), `directionsUrl`, `isIos` from `lib/platform.ts`, `useToasts`.
- Produces:
  - `PickCard(props: { view: PickCardView; heading: string; directions: string; onSomethingElse(): void; onSurprise(): void })`
  - `AltRows(props: { views: PickCardView[] })`
  - `EmptyPick(props: { help: EmptyHelp; bundle: Bundle; onSurprise(): void; onShortTime(): void })`
  - `DataState(props: { state: BundleState })`, which renders the meta line, the prominent note `Banner tone="note"`, the update note, or the full-screen unavailable message

Pick card layout:
- It uses the existing `.keep` card classes (outlined, radius 20; see `screens/Home.tsx`).
- The heading is `student.pick.heading`, or `student.pick.surprise_heading` in surprise mode, as a `GroupHeading`.
- The card contents, top to bottom:
  1. The spot name in Newsreader 20 (the Group style). The name is a `Link` to `/spot/$slug?via=pick`.
  2. The place line (Small, muted).
  3. A facts line: walk, then seat word, then closes, separated by ` · `.
  4. The busy line on its own line. It is required and never truncated.
  5. Reasons as mist `Pill`s.
- Actions:
  - Directions is the one red primary on the screen. It is an `<a className="btn btn--primary">` to `directionsUrl` with `target="_blank" rel="noopener noreferrer"`.
  - Something else is a quiet `Button` with the `Shuffle` icon.
  - Surprise me is a quiet `Button` with the `Sparkles` icon.
- Alternates: `GroupHeading` `student.pick.alternates`, then two `Row`s with the title name, sub `{walk} · {busy}`, linked to `/spot/$slug?via=pick`.

Toasts:
- `somethingElse()` or `surprise()` returning "same" toasts `student.pick.only_one`.
- "none" toasts `student.pick.none_left`.

Empty state (`ranked` empty): a `Banner tone="note"` with `student.empty.title`.
- With a closest spot, it adds `student.empty.closest`. With none, `student.empty.none_open`.
- Then one suggestion line, `student.empty.loosen.<loosen>`.
- Actions, by `loosen`:
  - `preset`: a quiet "Surprise me" `Button` (it ignores the preset).
  - `time`: a quiet "Try 30 min" button that sets time "30".
  - `access`: an ink link "Set access" to `/me`.
  - `group`: no button.

Access note: when `prefs.accessNoteDismissed` is false and the access profile is the default, a `Banner tone="note"` shows `student.home.access.note`. It has a "Set access" link to `/me` and a ghost "Not now", which sets `accessNoteDismissed: true`.

Data states:
- Loading: the existing `Loading` skeleton with `student.data.loading`.
- `unavailable`: `offline_no_cache` shows `student.data.unavailable`, and `update_required` shows `student.data.update_required`, as a `Screen` body paragraph. The query inputs are hidden.
- Ready: meta line `dataAgeView(...).line`. With `checkFailed`, it also shows `student.data.offline` as a second meta line. The prominent `Banner tone="note"` appears when it is non-null. `load.updateAvailable` adds a note with `student.data.update_available` and a Reload button (`location.reload()`).

- [ ] **Step 1: Add the copy rows** (section `## Student: Home results`), then run `copy:gen`.

```markdown
## Student: Home results

| id | text | max chars | notes |
|---|---|---|---|
| student.pick.heading | Your pick | 12 | |
| student.pick.surprise_heading | Surprise pick | 16 | |
| student.pick.alternates | Or try | 10 | |
| student.pick.directions | Directions | 12 | primary |
| student.pick.something_else | Something else | 16 | |
| student.pick.surprise | Surprise me | 14 | |
| student.pick.only_one | That's the only good match right now. | 44 | toast |
| student.pick.none_left | Nothing else is open for that long. | 40 | toast |
| student.empty.title | Nothing fits right now. | 28 | |
| student.empty.closest | Closest open spot: {spot}, {minutes} min away. | 60 | |
| student.empty.none_open | Nothing on campus is open for that long. | 48 | |
| student.empty.loosen.preset | Try fewer filters, or let Perch surprise you. | 52 | |
| student.empty.loosen.group | Try a smaller group. | 28 | |
| student.empty.loosen.time | Try a shorter time. | 28 | |
| student.empty.loosen.access | Set your access to see more spots. | 40 | |
| student.empty.try_short | Try 30 min | 12 | |
| student.home.access.note | Live on campus or a grad student? Set your access. | 60 | |
| student.home.access.action | Set access | 12 | |
| student.home.access.dismiss | Not now | 10 | |
| student.data.reload | Reload | 8 | |
```

- [ ] **Step 2: Write the failing unit tests** (`studentHomeResults.test.tsx`, scoring fixture, Tue 2 PM, `me: null`, `rand: mulberry32(1)`):
  - The pick card shows "Quiet Carrels", "Usually some seats, typical Tue 2 PM", "Likely seats", "In this building" and "Open till 2:00 AM". The alternates are "Union Study Room" and "Reading Room".
  - There is exactly one element with the class `btn--primary`, and it is Directions. Its `href` starts with `https://www.google.com/maps/dir/` and contains `40.9155%2C-73.1221`.
  - "Something else" toasts "That's the only good match right now.", because the pool has one spot.
  - "Surprise me" shows "Surprise pick", with a primary that is never Quiet Carrels: core `draw` avoids the spot on screen, so this holds for any seed. Assert that it is one of Union Study Room or SAC Lounge, and that no "only good match" toast appears. Clicking it again five times never shows Kelly RCC, Grad Lounge, Unverified Room or Hours TBD, and never repeats the spot on screen.
  - Changing the time to "2 hr" returns to "Your pick".
  - Empty state: Calls preset plus the extra filter carrels (seeded in prefs) shows "Nothing fits right now.", "Closest open spot: Quiet Carrels, 0 min away." and the Surprise me action.
  - The bundle `ageDays: 5` shows the note "These spots are 5 days old. Hours and busyness may have changed."
  - `checkFailed: true` shows "Offline. Using spots saved on this phone."
  - `{ phase: "unavailable", reason: "offline_no_cache" }` shows "Can't load spots offline yet. Open once with signal." and no pick card. With `update_required`, it shows "Update Perch to load spots."
  - The access note is shown by default. "Not now" hides it and persists `accessNoteDismissed: true`.
  - Honesty sweep: for every rendered text node inside `.keep` and the alternates list, none matches `/\blive\b|right now/i`. "right now" is allowed only in the toast, so check before clicking.

- [ ] **Step 3: Run the tests to verify they fail, implement, and run them to verify they pass**

Run: `cd apps/web && bunx vitest run test/studentHomeResults.test.tsx`
Expected: FAIL first, then PASS after implementing. Then `bun run --filter '@perch/web' test && bun run typecheck && bun run lint`.

- [ ] **Step 4: Write the e2e test** (`apps/web/e2e/student-home.e2e.ts`, using the `test` from `./fixtures.ts`, which pins the clock to E2E_NOW, Tue 12:00 EDT):

```ts
import { API_ORIGIN } from "../playwright.config.ts";
import { expectRoutesClean } from "./layout.ts";
import { expect, test } from "./fixtures.ts";

test("quick pick from the seed bundle, offline after one visit, no API traffic", async ({ page, context }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(API_ORIGIN)) apiCalls.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find a spot", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(page.getByText(/typical|estimate|No busyness data/).first()).toBeVisible();
  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(page.getByText("Surprise pick")).toBeVisible();
  await page.getByRole("button", { name: "Something else" }).click();
  expect(apiCalls).toEqual([]);

  // Wait for the service worker to control the page before going offline (same pattern as finish.e2e.ts).
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(page.getByText("Offline. Using spots saved on this phone.")).toBeVisible();
  await context.setOffline(false);
  await expectRoutesClean(page, ["/"]);
});

test("first open offline with nothing cached says so", async ({ browser }) => {
  // A fresh context has no cached bundle; block only the data site before the first load.
  const context = await browser.newContext();
  const page = await context.newPage();
  await pinClock(page);
  await page.route("http://data.localhost:8788/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByText("Can't load spots offline yet. Open once with signal.")).toBeVisible();
  await context.close();
});
```

Import `pinClock` from `./fixtures.ts` next to `test` and `expect`.

Move the service-worker wait from `finish.e2e.ts` (lines 170 to 180: `navigator.serviceWorker.ready`, then poll `navigator.serviceWorker.controller !== null`, reloading once if needed) into `export async function waitForServiceWorker(page: Page): Promise<void>` in `e2e/fixtures.ts`. Have `finish.e2e.ts` call the helper, and reuse it here and in D2 before every `setOffline(true)`. Re-run `finish.e2e.ts` to show that the refactor changed nothing.

- [ ] **Step 5: Run the e2e test and Procedure V**

Run: `cd apps/web && bunx playwright test e2e/student-home.e2e.ts`, then Procedure V for `/`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/student apps/web/test/studentHomeResults.test.tsx apps/web/e2e/student-home.e2e.ts apps/web/e2e/fixtures.ts apps/web/e2e/finish.e2e.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(web): pick card with something else and surprise me"
```

---

## Phase D: spot page `/spot/$slug`

### Task D1: spot view models (forecast bars, week hours, last checked)

**Tier:** Logic (honesty: never live, and the last-verified date always shows).

**Files:**
- Create: `packages/ui-logic/src/student/spotView.ts`, `packages/ui-logic/test/studentSpotView.test.ts`
- Modify: `packages/ui-logic/src/student/format.ts` (add `timeOfDayText` and `dayShortName`), `packages/ui-logic/src/student/index.ts`, the copy deck and `copy.gen.ts`, `copy.test.ts` (`SAMPLE`: `entry: "11:30 PM"`)

**Interfaces:**
- Produces:

```ts
export type Bar = { hour: number; ratio: number; confidence: SlotConfidence; current: boolean; label: string };
export type ForecastView =
  | { kind: "bars"; bars: Bar[]; caption: string; exam: boolean; nowLine: string }
  | { kind: "none"; caption: string };
export function dayForecast(bundle: Bundle, spotId: string, now: Date): ForecastView;
export type HoursDay = { dow: number; name: string; text: string; today: boolean };
export type WeekHoursView = { heading: string; unconfirmed: boolean; days: HoursDay[] };
export function weekHours(bundle: Bundle, spot: BundleSpot, now: Date): WeekHoursView;
export type CheckedView = { latest: string; groups: { group: AttributeGroup; name: string; date: string }[] };
export function checkedView(spot: BundleSpot, tz: string): CheckedView;
export function timeOfDayText(hhmm: string): string;   // "02:00" -> "2:00 AM", "24:00" -> "12:00 AM"
export function dayShortName(dow: number): string;      // 0 = Sun -> "Sun"
```

`nowLine` is `busyLine(slotReading(this hour), now, tz)`. It is the screen reader summary for the current hour, and it says typical or estimate.

- [ ] **Step 1: Add the copy rows** (section `## Student: spot page`), then run `copy:gen`.

```markdown
## Student: spot page

| id | text | max chars | notes |
|---|---|---|---|
| student.spot.checked | Checked {date} | 20 | meta line, newest verified date |
| student.spot.last_checked | Last checked | 16 | group heading |
| student.spot.directions | Directions | 12 | primary |
| student.spot.share | Share | 8 | |
| student.spot.shared | Link copied | 14 | toast |
| student.spot.share_failed | Couldn't share. Copy the address bar instead. | 50 | toast |
| student.spot.getting_there | Getting there | 16 | heading |
| student.spot.busy_heading | Busyness | 12 | heading |
| student.spot.busy_caption | Typical {weekday}, not live. | 34 | |
| student.spot.busy_caption_exam | Typical {weekday} in finals, not live. | 44 | |
| student.spot.this_hour | This hour | 10 | over the current bar; never "Now" |
| student.spot.legend.measured | Counted | 10 | |
| student.spot.legend.estimate | Estimate | 10 | hatched |
| student.spot.legend.none | No data | 10 | outlined |
| student.spot.no_data | No data yet | 14 | whole day without data |
| student.spot.hours_heading | This week | 12 | |
| student.spot.hours_exam_heading | Finals hours | 14 | |
| student.spot.hours_unconfirmed | Hours not confirmed | 22 | |
| student.spot.closed_day | Closed | 8 | |
| student.spot.open_all_day | Open 24 hours | 16 | |
| student.spot.hours_span | {opens} to {closes} | 24 | |
| student.spot.hours_span_entry | {opens} to {closes}, last entry {entry} | 48 | |
| student.spot.today | Today | 8 | hours row sub |
| student.spot.details | Details | 10 | heading |
| student.spot.photo_none | No photo yet | 14 | |
| student.spot.photo_unavailable | Image unavailable | 18 | |
| student.spot.license | Spot data {license}, {attribution}. | 48 | |
| student.spot.not_found | That spot isn't in Perch. | 30 | |
| student.spot.back_to_browse | Browse spots | 14 | |
| student.group.identity | Name and place | 16 | |
| student.group.access | Access | 10 | |
| student.group.hours | Hours | 8 | |
| student.group.seating | Seating | 10 | |
| student.group.power | Power and signal | 18 | |
| student.group.environment | Noise and feel | 16 | |
| student.group.use_fit | House rules | 14 | |
| student.group.amenities | Nearby | 10 | |
| student.group.accessibility | Accessibility | 14 | |
| student.group.late_night | Late night | 12 | |
```

- [ ] **Step 2: Write the failing tests** (`studentSpotView.test.ts`, with the scoring fixture):
  - `dayForecast` for carrels at Tue 2 PM: 24 bars, `bars[14].current === true` with exactly one current bar, every confidence `"measured"`, caption "Typical Tuesday, not live.", `nowLine` "Usually some seats, typical Tue 2 PM".
  - `dayForecast` for SAC Lounge: every bar is `"estimated"`.
  - `dayForecast` for Hours TBD: `{ kind: "none", caption: "No data yet" }`.
  - In the exam window (`2026-12-15T19:00:00Z`): `exam: true`, caption "Typical Tuesday in finals, not live.", and carrels bars at ratio 0.4375, `"estimated"`.
  - For every caption and `nowLine` in these cases, the text does not match `/\blive\b(?!\.)|\bnow\b/i` except the literal "not live." ending. Assert `caption.endsWith("not live.")`.
  - `weekHours` for carrels on Tue: days in the order Mon to Sun, each "8:00 AM to 2:00 AM". Tue has `today: true`. The heading is "This week". In the exam window, the heading is "Finals hours" and the text is "Open 24 hours".
  - `weekHours` for Hours TBD: `unconfirmed: true`, every day "Closed".
  - A row with `last_entry` "23:30" reads "8:00 AM to 12:00 AM, last entry 11:30 PM".
  - `checkedView(carrels, NY)`: `latest` is "Checked Oct 6" (the newest of identity Oct 5 and hours Oct 6). The groups are `[{ identity, "Name and place", "Oct 5" }, { hours, "Hours", "Oct 6" }]` in `ATTRIBUTE_GROUP` order.
  - `timeOfDayText("00:00")` is "12:00 AM", `"12:30"` is "12:30 PM", `"24:00"` is "12:00 AM", and `"07:05"` is "7:05 AM".

- [ ] **Step 3: Run the tests to verify they fail, then implement**

```ts
// additions to packages/ui-logic/src/student/format.ts
export function timeOfDayText(hhmm: string): string {
  const [hs, ms] = hhmm.split(":");
  const h = Number(hs) % 24;
  const period = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${ms ?? "00"} ${period}`;
}
const SUNDAY = Date.UTC(2026, 0, 4); // a Sunday
export function dayShortName(dow: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" })
    .format(new Date(SUNDAY + dow * 86_400_000));
}
```

```ts
// packages/ui-logic/src/student/spotView.ts
import {
  ATTRIBUTE_GROUP, type AttributeGroup, type Bundle, type BundleHours, type BundleSpot,
  campusParts, isExamDate, type SlotConfidence, slotIndex, slotReading, zonedInstant,
} from "@perch/core";
import { type PlainCopyId, t } from "../copy/index.ts";
import { dayShortName, hourText, shortDay, timeOfDayText, weekdayLong } from "./format.ts";
import { busyLine } from "./present.ts";

export type Bar = { hour: number; ratio: number; confidence: SlotConfidence; current: boolean; label: string };
export type ForecastView =
  | { kind: "bars"; bars: Bar[]; caption: string; exam: boolean; nowLine: string }
  | { kind: "none"; caption: string };

export function dayForecast(bundle: Bundle, spotId: string, now: Date): ForecastView {
  const tz = bundle.campus.tz;
  const p = campusParts(now, tz);
  const exam = isExamDate(p.date, bundle.term);
  const b = bundle.busyness[spotId];
  if (b === undefined) return { kind: "none", caption: t("student.spot.no_data") };
  const bars: Bar[] = Array.from({ length: 24 }, (_, hour) => {
    const r = slotReading(b, slotIndex(p.slotDow, hour), exam);
    return {
      hour, ratio: r.ratio, confidence: r.confidence, current: hour === p.hour,
      label: hourText(zonedInstant(p.date, hour * 60, tz), tz),
    };
  });
  if (bars.every((x) => x.confidence === "none")) {
    return { kind: "none", caption: t("student.spot.no_data") };
  }
  const weekday = weekdayLong(now, tz);
  return {
    kind: "bars",
    bars,
    exam,
    caption: exam ? t("student.spot.busy_caption_exam", { weekday }) : t("student.spot.busy_caption", { weekday }),
    nowLine: busyLine(slotReading(b, slotIndex(p.slotDow, p.hour), exam), now, tz),
  };
}

export type HoursDay = { dow: number; name: string; text: string; today: boolean };
export type WeekHoursView = { heading: string; unconfirmed: boolean; days: HoursDay[] };
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

function rowText(r: BundleHours): string {
  if (r.opens === "00:00" && r.closes === "24:00" && r.last_entry === null) return t("student.spot.open_all_day");
  const opens = timeOfDayText(r.opens);
  const closes = timeOfDayText(r.closes);
  return r.last_entry === null
    ? t("student.spot.hours_span", { opens, closes })
    : t("student.spot.hours_span_entry", { opens, closes, entry: timeOfDayText(r.last_entry) });
}

export function weekHours(bundle: Bundle, spot: BundleSpot, now: Date): WeekHoursView {
  const p = campusParts(now, bundle.campus.tz);
  const own = bundle.hours.filter((h) => h.spot_id === spot.id);
  const exam = isExamDate(p.date, bundle.term) && own.some((h) => h.is_exam);
  const rows = own.filter((h) => h.is_exam === exam);
  return {
    heading: t(exam ? "student.spot.hours_exam_heading" : "student.spot.hours_heading"),
    unconfirmed: spot.hours_unconfirmed,
    days: MONDAY_FIRST.map((dow) => {
      const list = rows.filter((r) => r.day_of_week === dow).sort((a, b) => a.opens.localeCompare(b.opens));
      return {
        dow,
        name: dayShortName(dow),
        text: list.length === 0 ? t("student.spot.closed_day") : list.map(rowText).join(", "),
        today: dow === p.hoursDow,
      };
    }),
  };
}

const GROUP_NAME = {
  identity: "student.group.identity", access: "student.group.access", hours: "student.group.hours",
  seating: "student.group.seating", power: "student.group.power", environment: "student.group.environment",
  use_fit: "student.group.use_fit", amenities: "student.group.amenities",
  accessibility: "student.group.accessibility", late_night: "student.group.late_night",
} as const satisfies Record<AttributeGroup, PlainCopyId>;

export type CheckedView = { latest: string; groups: { group: AttributeGroup; name: string; date: string }[] };

export function checkedView(spot: BundleSpot, tz: string): CheckedView {
  const groups: CheckedView["groups"] = [];
  let newest = "";
  for (const group of ATTRIBUTE_GROUP) {
    const iso = spot.verified[group];
    if (iso === undefined) continue;
    if (iso > newest) newest = iso;
    groups.push({ group, name: t(GROUP_NAME[group]), date: shortDay(iso, tz) });
  }
  // BundleSpot.verified is refined to be non-empty, so newest is set.
  return { latest: t("student.spot.checked", { date: shortDay(newest, tz) }), groups };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-logic/src/student packages/ui-logic/test/studentSpotView.test.ts packages/ui-logic/test/copy.test.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(ui-logic): spot forecast bars, week hours and check dates"
```

### Task D2: spot page screen, share and photo caching

**Tier:** Feature, with the honesty assertions reviewed as in Logic.

**Files:**
- Create:
  - `apps/web/src/screens/student/SpotPage.tsx`
  - `apps/web/src/screens/student/ForecastBars.tsx`
  - `apps/web/src/screens/student/SpotPhoto.tsx`
  - `apps/web/src/adapters/share.ts`
  - `apps/web/src/hooks/useIsIos.ts`
  - `apps/web/src/lib/spotFacts.ts`
  - `apps/web/test/studentSpot.test.tsx`
  - `apps/web/e2e/student-spot.e2e.ts`
- Modify:
  - `apps/web/src/routes/_student.spot.$slug.tsx`
  - `apps/web/src/app/deps.ts` (`webShare: Share`), and the harness (a fake share that records)
  - `apps/web/vite.config.ts` (photo runtime cache)
  - `apps/web/src/screens/student/student.css`

**Interfaces:**
- Consumes: `dayForecast`, `weekHours`, `checkedView`, `placeText`, `spotName`, `lockText`, `accessFor`, `directionsUrl`, `fieldName` and `fieldValueText` from `lib/fields.ts`.
- Produces:
  - `createWebShare(nav?): Share`. It tries the share sheet first and copies the link as a fallback. An `AbortError` (the user cancelled) resolves `"shared"`, so there is no toast.
  - `spotFacts(spot): { label: string; value: string }[]`. It covers these fields in this order, skipping null values: `seat_count`, `noise_policy`, `food_policy`, `group_work_ok`, `calls_ok`, `outlet_coverage_pct`, `usb_outlets`, `wifi_mbps`, `cell_signal`, `natural_light`, `lighting`, `temperature`, `whiteboard`, `entry_method`, `reservable`, `step_free`, `elevator`, `accessible_seating`, `open_past_midnight`, `staffed_late`, `lit_route_to_residences`. Use `fieldName` and `fieldValueText`; if a field has no label in `FIELD_LABEL`, add one there, from existing survey copy where it exists.
  - `ForecastBars(props: { view: ForecastView })`
  - `SpotPhoto(props: { photo: { url: string } | null; alt: string })`

Layout, top to bottom, all existing primitives:
1. `Screen`:
   - title: `spotName(spot)`
   - back: `{ to: "/" }` when `via=pick`, else `{ to: "/browse" }`
   - meta: `placeText`, then ` · `, then `checkedView.latest`
2. A lock or unverified `Banner tone="note"` with the `Lock` icon, when `lockText(access)` is not null.
3. The cover photo: `SpotPhoto`, with the cover first, in a 4:3 frame with 12 px radius. Other approved photos go in the existing survey photo grid classes.
   - `onError` shows a mist frame with `student.spot.photo_unavailable`.
   - With no photos, a mist frame with `student.spot.photo_none`.
   - Never show a broken image.
4. An inline actions row:
   - Directions: `<a className="btn btn--primary">`, the only red fill on the page.
   - Share: a quiet `Button` with the `Share` icon. It shares `{ title: name, url: ${location.origin}/spot/${slug} }`. `"copied"` toasts `student.spot.shared`, and `"failed"` toasts `student.spot.share_failed`.
5. Getting there: a `GroupHeading`, then the directions text as a body paragraph.
6. Busyness: a `GroupHeading`, then `ForecastBars`.
   - Bars run in a 96 px row. Height is `max(6%, ratio * 100%)`.
   - Fills:
     - measured: `color-mix(in oklab, var(--ink) 55%, var(--paper))`
     - current: `var(--ink)`
     - estimated: the same mix as measured, with `repeating-linear-gradient(135deg, ... 0 2px, transparent 2px 5px)`
     - none: a transparent fill with a 1 px dashed `var(--edge)` border at 8% height
   - "This hour" sits over the current bar. Hour labels show at 12 AM, 6 AM, 12 PM and 6 PM.
   - The legend lists Counted, Estimate and No data as swatches with words.
   - The caption is a `figcaption`. Bars are `aria-hidden`, and a visually hidden `p` carries `view.nowLine`.
   - For `kind: "none"`, show only "No data yet".
7. Hours: a `GroupHeading` with `view.heading`, then `Row compact` per day. The title is the day name, the end is the text, and today's sub is "Today". Under the heading, `student.spot.hours_unconfirmed` when unconfirmed.
8. Details: `Row compact` per `spotFacts` entry.
9. Last checked: `Row compact` per group (name and date).
10. License: a Small, muted paragraph with `student.spot.license` (from `bundle.data_license` and `bundle.attribution`).

Not found (an unknown slug, once the bundle is ready): a `Screen` with `student.spot.not_found` and a link "Browse spots" to `/browse`. While the bundle is loading, show the existing `Loading` skeleton. When it is unavailable, show the same unavailable sentence as Home (reuse `DataState`).

Photo cache (`vite.config.ts` `workbox`):

```ts
        runtimeCaching: [
          {
            // Approved spot photos on the data site: visited spot pages keep their pictures offline.
            urlPattern: ({ url }) => url.origin !== self.location.origin && url.pathname.startsWith("/photos/"),
            handler: "CacheFirst",
            options: {
              cacheName: "perch-photos",
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
```

- [ ] **Step 1: Write the failing unit tests** (`studentSpot.test.tsx`, scoring fixture, Tue 2 PM, `me: null`):
  - `/spot/quiet-carrels`:
    - h1 "Quiet Carrels"
    - meta containing "Melville Library · Floor 1" and "Checked Oct 6"
    - "Typical Tuesday, not live."
    - "This hour"
    - one `btn--primary` (Directions)
    - hours rows Mon to Sun with "Today" on Tue
    - "Last checked" holding "Name and place" (Oct 5) and "Hours" (Oct 6)
    - "No photo yet"
    - the license line "Spot data CC BY-SA 4.0, Perch surveyors."
  - `/spot/kelly-rcc`: a note "Residents of Kelly Quad only".
  - `/spot/unverified-room`: "Access not confirmed yet".
  - `/spot/hours-tbd`: "Hours not confirmed" and "No data yet".
  - `/spot/sac-lounge`: the legend shows "Estimate", and the bars have the estimated class.
  - `/spot/nope`: "That spot isn't in Perch." with a link to `/browse`.
  - Share with the fake share returning "copied" toasts "Link copied". With "failed", it toasts "Couldn't share. Copy the address bar instead."
  - The back link is `/` with `?via=pick`, and `/browse` without it.
  - A photo with `url` set fires `error`, and the frame shows "Image unavailable".

- [ ] **Step 2: Run the tests to verify they fail, implement, and run them to verify they pass**

Run: `cd apps/web && bunx vitest run test/studentSpot.test.tsx`, then `bun run --filter '@perch/web' test && bun run typecheck && bun run lint`.
Expected: FAIL first, then PASS.

- [ ] **Step 3: Write the e2e test** (`student-spot.e2e.ts`). From `/`, click the pick card's spot name. The URL matches `/\/spot\/[a-z0-9-]+\?via=pick$/`, and "Checked" and "not live." are visible. Call `waitForServiceWorker(page)` (from C5), then reload offline (`context.setOffline(true)`), and the page still shows the h1. Then run `expectRoutesClean(page, ["/spot/central-reading-room"])`. Assert no request went to `API_ORIGIN`.

- [ ] **Step 4: Run Procedure V** for `/spot/central-reading-room /spot/kelly-rcc`, then run the e2e test: `cd apps/web && bunx playwright test e2e/student-spot.e2e.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/student apps/web/src/adapters/share.ts apps/web/src/hooks/useIsIos.ts apps/web/src/lib/spotFacts.ts apps/web/src/lib/fields.ts apps/web/src/routes/_student.spot.\$slug.tsx apps/web/src/app/deps.ts apps/web/test/harness.tsx apps/web/test/studentSpot.test.tsx apps/web/e2e/student-spot.e2e.ts apps/web/vite.config.ts
git commit -m "feat(web): spot page with forecast bars, hours and check dates"
```

---

## Phase E: Browse `/browse`

### Task E1: browse view model

**Tier:** Logic (eligibility display and honesty).

**Files:**
- Create: `packages/ui-logic/src/student/browse.ts`, `packages/ui-logic/test/studentBrowse.test.ts`
- Modify: the student index, the copy deck and `copy.gen.ts`, `copy.test.ts` (`SAMPLE`: `status: "Open till 2:00 AM"`)

**Interfaces:**
- Produces:

```ts
export const ARRIVE = ["now", "1", "2", "4", "tonight"] as const;
export const Arrive = z.enum(ARRIVE); export type Arrive = z.infer<typeof Arrive>;
export const BROWSE_PREFS_KEY = "student:browse";
export const BrowsePrefs = z.object({ view: z.enum(["list", "map"]), arrive: Arrive,
  extra: z.array(Criterion).max(16), showLocked: z.boolean(), openOnly: z.boolean() });
export type BrowsePrefs = z.infer<typeof BrowsePrefs>;
export const DEFAULT_BROWSE_PREFS: BrowsePrefs = { view: "list", arrive: "now", extra: [], showLocked: false, openOnly: false };
export function arrivalAt(now: Date, arrive: Arrive, tz: string): Date;
export type RowStatus = "open" | "closes_soon" | "closed" | "hours_unknown";
export type BrowseRow = { spot: BundleSpot; name: string; building: string; walkMinutes: number;
  status: RowStatus; sub: string; busy: string; busyLong: string; bucket: Fullness | "none";
  locked: boolean; checked: string };
export type BrowseView = { rows: BrowseRow[]; hiddenLocked: number; caption: string; count: string };
export function browseView(bundle: Bundle, prefs: BrowsePrefs, from: string, access: AccessProfile, now: Date): BrowseView;
```

`sub` is `student.browse.row.sub` with `{ building, minutes, status }`. Here `status` is the status text, or the `lockText` for locked and unverified spots. `busy` is `rowBusy` (the short form), and `busyLong` is `busyLine` (map labels and pin names).

- [ ] **Step 1: Add the copy rows** (section `## Student: Browse`).

```markdown
## Student: Browse

| id | text | max chars | notes |
|---|---|---|---|
| student.browse.view.label | View | 8 | segmented, label hidden |
| student.browse.view.list | List | 6 | |
| student.browse.view.map | Map | 6 | |
| student.browse.arrive.label | Arriving | 10 | chips legend |
| student.browse.arrive.now | Now | 6 | arrival time, not busyness |
| student.browse.arrive.1 | In 1 hr | 8 | |
| student.browse.arrive.2 | In 2 hr | 8 | |
| student.browse.arrive.4 | In 4 hr | 8 | |
| student.browse.arrive.tonight | Tonight 9 PM | 14 | |
| student.browse.filters | Filters | 10 | |
| student.browse.filters_count | Filters, {count} on | 20 | |
| student.browse.open_only | Open when I get there | 24 | sheet switch |
| student.browse.show_locked | Show spots I can't use | 28 | sheet switch |
| student.browse.caption | Busyness is typical for {when}, not live. | 52 | above the list |
| student.browse.count | {count} spots | 14 | meta |
| student.browse.count_one | 1 spot | 8 | meta |
| student.browse.hidden_locked | {count} spots hidden for access | 34 | |
| student.browse.hidden_locked_one | 1 spot hidden for access | 30 | |
| student.browse.empty | No spots match. Clear a filter. | 40 | |
| student.browse.clear | Clear filters | 16 | |
| student.browse.row.sub | {building} · {minutes} min · {status} | 70 | |
| student.browse.status.closed | Closed then | 12 | at the chosen arrival time |
| student.browse.status.hours_unknown | Hours not confirmed | 22 | |
| student.bucket.empty | Empty | 8 | map legend |
| student.bucket.some | Some seats | 12 | |
| student.bucket.filling | Filling up | 12 | |
| student.bucket.nearly_full | Nearly full | 12 | |
| student.bucket.full | Full | 6 | |
| student.bucket.none | No data | 8 | |
```

The open and closing-soon statuses reuse `student.pick.open_till`, `student.pick.closes_in` and `student.pick.open_all_day`, through `closesText(closesAt, arrival, tz)`.

- [ ] **Step 2: Write the failing tests** (scoring fixture, Tue 2 PM, from the library, default access):
  - The default prefs give 6 rows: carrels, reading, grad hidden, sac, unverified, union, hours-tbd, kelly hidden. Expect `hiddenLocked: 2`, and rows sorted by walk: Quiet Carrels (0), Reading Room (2), SAC Lounge (5), Unverified Room (4 + 0 = 4), Union Study Room (6), Hours TBD (7). Compute the order from walk ascending and then name, and assert the exact list:

    ```
    ["Quiet Carrels", "Reading Room", "Unverified Room", "SAC Lounge", "Union Study Room", "Hours TBD"]
    ```

    Unverified Room is sac floor 1, so 4 + 0 = 4. SAC Lounge is sac floor 2, so 4 + 1 = 5. Hours TBD is the union, floor 2, so 6 + 1 = 7.
  - `showLocked: true` gives 8 rows. Kelly RCC has `locked: true`, and its sub contains "Residents of Kelly Quad only".
  - The sub of Unverified Room contains "Access not confirmed yet". Hours TBD has `status: "hours_unknown"`.
  - `arrive: "tonight"` (21:00 EDT): SAC Lounge, which closes at 23:00, has the status "open" with the sub "Open till 11:00 PM". At `arrive: "4"` from 23:30 EDT, it is "closed".
  - `openOnly: true` at 03:00 EDT drops the closed rows and keeps Reading Room.
  - `extra: [outlets]` keeps only spots with outlets of 0.5 or more.
  - The caption is "Busyness is typical for Tue 2 PM, not live.", with `arrive` now.
  - Every `busy` matches `/^Usually|est\.$|^No data/`.
  - Corrupt `student:browse` reads as the defaults (through `readJson`).

- [ ] **Step 3: Run the tests to verify they fail, implement, and run them to verify they pass.** Implement `browseView` with `accessFor`, `walkMinutes`, `openSpan`, `slotReading`, `rowBusy`, `busyLine`, `busyBucket`, `closesText` and `checkedView(spot, tz).latest`. For `closes_soon`, the spot closes within 60 minutes of arrival. `arrivalAt("tonight")` is `zonedInstant(campusParts(now).date, 1260, tz)` if that is later than now, else now.

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-logic/src/student packages/ui-logic/test/studentBrowse.test.ts packages/ui-logic/test/copy.test.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(ui-logic): browse rows with access, hours and arrival time"
```

### Task E2: Browse list screen and filter sheet

**Tier:** Feature.

**Files:**
- Create: `apps/web/src/screens/student/Browse.tsx`, `apps/web/src/hooks/useBrowse.ts`, `apps/web/test/studentBrowse.test.tsx`, `apps/web/e2e/student-browse.e2e.ts`
- Modify: `apps/web/src/routes/_student.browse.tsx`, `apps/web/src/screens/student/FiltersSheet.tsx` (if Browse needs `children`)

**Interfaces:**
- Produces: `useBrowse(): { state; view: BrowseView | null; prefs: BrowsePrefs; set(next: Partial<BrowsePrefs>): void; from: string | null }`. `from` is shared with Home, read from `student:pick`. Prefs persist under `student:browse`.

Layout:
1. `Screen` titled `student.browse.title`, with the meta `count` and, when the bundle is old, the data age line (reuse `DataState`).
2. `Segmented`: List or Map, `hideLabel`.
3. `FilterChips` for Arriving, without counts.
4. A quiet "Filters" button (`..._count`) that opens `FiltersSheet`. Its `children` are two `Check` rows: `student.browse.open_only` and `student.browse.show_locked`.
5. A Small, muted caption paragraph.
6. A `ul` of `Row`s linking to `/spot/$slug`:
   - title: the name
   - sub: `row.sub`
   - end: `row.busy` (Small, muted)
   - lead: the `Lock` icon when locked, else nothing
   - locked rows add `className` modifier `row--muted`, which sets the title color to `var(--muted)`. Add it to `styles.css`; it is the only new class.
7. Hidden note: `student.browse.hidden_locked` in Small, muted, as a button that turns on `showLocked`.
8. Empty: `student.browse.empty` and a quiet "Clear filters" button.

The Map view is a placeholder `p` until E3.

- [ ] **Step 1: Write the failing unit tests**:
  - The rows appear in the E1 order.
  - Turning on Show spots I can't use adds Kelly RCC with the "Residents of Kelly Quad only" sub, and persists `showLocked: true`.
  - Tonight changes SAC Lounge's sub to "Open till 11:00 PM".
  - The filter count label updates.
  - Empty, then Clear filters, restores the rows.
  - A row links to `/spot/quiet-carrels`.

- [ ] **Step 2: Run the tests to verify they fail, implement, and run them to verify they pass**

Run: `cd apps/web && bunx vitest run test/studentBrowse.test.tsx`, then the full web unit suite, typecheck and lint.
Expected: FAIL first, then PASS.

- [ ] **Step 3: Write the e2e test** (`student-browse.e2e.ts`). The list shows seed spots, and the caption contains "not live.". Opening Filters and turning on "Show spots I can't use" reveals Kelly RCC. Clicking a row opens its spot page. There are no API requests. Finish with `expectRoutesClean(page, ["/browse"])`.

- [ ] **Step 4: Run Procedure V** for `/browse`, with the Filters sheet open in one capture. Then commit.

```bash
git add apps/web/src/screens/student apps/web/src/hooks/useBrowse.ts apps/web/src/routes/_student.browse.tsx apps/web/src/ui/styles.css apps/web/test/studentBrowse.test.tsx apps/web/e2e/student-browse.e2e.ts
git commit -m "feat(web): browse list with filters and locked spots"
```

### Task E3: lazy MapLibre map on OpenFreeMap

**Tier:** Feature.

**Free-tier check (do first and record it in the report):**
- OpenFreeMap needs no key, no account and no card. Tiles and styles are served from `tiles.openfreemap.org`, so nothing counts against Cloudflare.
- MapLibre adds about 1 MB of JS as one file in the PWA assets, well under 25 MiB per file and 20,000 files per version.
- No Worker script is involved.

Run `curl -sf https://tiles.openfreemap.org/styles/positron | head -c 200`. Then try `.../styles/dark` and `.../styles/fiord`. Use `positron` for light, and the first dark style that returns JSON for dark (else `positron`). Record the URLs and the attribution string from the style in the report.

**Files:**
- Create:
  - `apps/web/src/map/MapView.tsx` (the default export; the only module that imports `maplibre-gl`)
  - `apps/web/src/map/map.css`
  - `apps/web/src/map/styles.ts`, which exports `MAP_STYLE: { light: string; dark: string }`
  - `apps/web/src/screens/student/BrowseMap.tsx` (lazy wrapper, legend, selected card)
  - `apps/web/scripts/check-chunks.ts`
  - `apps/web/test/studentMap.test.tsx`
- Modify:
  - `apps/web/package.json`: `bun add maplibre-gl` at the newest 5.x released at least 14 days ago (`npm view maplibre-gl time --json`), plus the script `"check:chunks": "node scripts/check-chunks.ts dist"`
  - `apps/web/vite.config.ts`: `workbox.globIgnores` for the map chunk
  - `Browse.tsx`: the Map view
  - `apps/web/e2e/student-browse.e2e.ts`: the map test

**Interfaces:**
- Produces:
  - `type Pin = { id: string; slug: string; lat: number; lng: number; bucket: Fullness | "none"; label: string }`, where `label` is `t("student.map.pin_label", { spot, busy: busyLong })`
  - `MapView(props: { pins: Pin[]; center: { lat: number; lng: number }; selected: string | null; onSelect(id: string): void; theme: "light" | "dark"; onError(): void })`
  - `BrowseMap(props: { view: BrowseView; from: BundleBuilding | null })`. It uses `lazy(() => import("../../map/MapView.tsx"))` inside `Suspense` with the fallback `Loading` "Loading map".
    - When `deps.network.online()` is false, it never imports the map and shows `student.map.offline`.
    - A failed import or `onError` shows `student.map.failed`. Use a small class error boundary.

Copy rows (section `## Student: map`):

```markdown
| student.map.loading | Loading map | 14 | |
| student.map.offline | The map needs a connection. The list works offline. | 56 | |
| student.map.failed | The map didn't load. The list has every spot. | 52 | |
| student.map.legend | Typical busyness, not live | 28 | legend title |
| student.map.pin_label | {spot}, {busy} | 80 | pin aria-label |
| student.map.open | Open spot | 12 | selected card link |
```

Map behavior:
- `new maplibregl.Map({ container, style: MAP_STYLE[theme], center: [lng, lat], zoom: 16, attributionControl: { compact: false } })`.
- A `try`/`catch` around construction calls `onError`, and so does `map.on("error")` before the first `load`.
- Pins are `maplibregl.Marker({ element })` with a `button.pin.pin--<bucket>` element, `aria-label` set to the label, and `aria-pressed` for the selected pin. A click calls `onSelect`.
- On unmount, call `map.remove()`. On a theme change, call `map.setStyle(MAP_STYLE[theme])`.
- The theme comes from `useThemePref` and the resolved scheme. Read `document.documentElement.dataset.theme` the same way `ThemeSwitch` does.

Pin CSS (`map.css`, with existing variables only):

```css
.pin { width: 28px; height: 28px; border-radius: 999px; border: 1px solid var(--edge); position: relative; cursor: pointer; }
.pin::after { content: ""; position: absolute; inset: -8px; } /* 44 px hit area */
.pin--empty { background: var(--paper); }
.pin--some { background: var(--mist); }
.pin--filling { background: color-mix(in oklab, var(--ink) 45%, var(--paper)); }
.pin--nearly_full { background: color-mix(in oklab, var(--ink) 75%, var(--paper)); }
.pin--full { background: var(--ink); }
.pin--none { background: var(--paper); border-style: dashed; }
.pin[aria-pressed="true"] { outline: 3px solid var(--red); outline-offset: 2px; }
.pin:focus-visible { outline: 3px solid var(--red); outline-offset: 2px; }
.map { height: min(60vh, 520px); min-height: 320px; border-radius: 12px; overflow: hidden; }
```

The legend sits under the map: a `ul` of six swatches (`.pin` look, `aria-hidden`), each with its `student.bucket.*` word, under the title `student.map.legend`. Selecting a pin shows a `.keep` card under the map with the name, `busyLong`, `sub` and a link "Open spot".

`check-chunks.ts`:
1. List `dist/assets`.
2. Find the JS files whose contents include `maplibregl`.
3. Assert that there is at least one, and that none of them is the entry chunk referenced by `dist/index.html`.
4. Assert that `dist/sw.js` does not mention any of those file names.
5. Exit 1 with a message otherwise.

Set `globIgnores` to the actual chunk file pattern seen after one build (for example `**/MapView-*.js` and `**/MapView-*.css`).

- [ ] **Step 1: Write the failing unit tests** (`studentMap.test.tsx`, mocking `../src/map/MapView.tsx` with a stub that renders pin buttons from props):
  - The Map view lists one pin per visible row.
  - Pin labels match `/typical|estimate|No busyness data/`.
  - The legend has six entries with words.
  - Offline (`network.set(false)`) shows the offline sentence, and the stub is never rendered.
  - Selecting a pin shows the card with "Open spot" linking to its page.

- [ ] **Step 2: Run the tests to verify they fail, implement, and run them to verify they pass.** Then check the build:

```bash
cd apps/web && bunx vite build --outDir "${CLAUDE_JOB_DIR:-/tmp}/perch-e3/dist" && node scripts/check-chunks.ts "${CLAUDE_JOB_DIR:-/tmp}/perch-e3/dist"
```

Expected: unit tests PASS, and `check-chunks` prints OK.

- [ ] **Step 3: Write the e2e test.** Add `test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } })` in a `describe` block. Route `https://tiles.openfreemap.org/**` to a minimal style JSON:

```json
{ "version": 8, "sources": {}, "layers": [{ "id": "bg", "type": "background", "paint": { "background-color": "#ECE8E6" } }] }
```

Tests never hit the real tile server. Switch to Map and expect a pin per row. Click a pin and expect the card. Offline, Map shows the offline sentence.

- [ ] **Step 4: Run Procedure V** for `/browse`, with Map selected in one capture. Expect real OpenFreeMap tiles in the dev preview, and check that the attribution shows. Then commit.

```bash
git add apps/web/src/map apps/web/src/screens/student apps/web/scripts/check-chunks.ts apps/web/package.json bun.lock apps/web/vite.config.ts apps/web/test/studentMap.test.tsx apps/web/e2e/student-browse.e2e.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts packages/ui-logic/test/copy.test.ts
git commit -m "feat(web): lazy openfreemap map in browse with busyness pins"
```

---

## Phase F: Me `/me`

### Task F1: access, custom presets and install state storage

**Tier:** Logic (trust boundary).

**Files:**
- Create: `packages/ui-logic/src/student/me.ts`, `packages/ui-logic/test/studentMe.test.ts`
- Modify: the student index

**Interfaces:**
- Produces:

```ts
export const ACCESS_KEY = "student:access";
export const PRESETS_KEY = "student:presets";
export const INSTALL_KEY = "student:install";
export const VISIT_KEY = "student:visit-counted";      // in tab (sessionStorage)
export const MAX_CUSTOM_PRESETS = 10;
export const CustomPresets = z.array(Preset.refine((p) => p.name !== null && p.id.startsWith("custom-"))).max(MAX_CUSTOM_PRESETS);
export function readAccess(prefs: KeyValueStorage): Read<AccessProfile>;
export function writeAccess(prefs: KeyValueStorage, p: AccessProfile): void;
export function readCustomPresets(prefs: KeyValueStorage): Read<Preset[]>;
export type SaveResult = { ok: true; list: Preset[]; preset: Preset } | { ok: false; error: "name_required" | "filters_required" | "full" };
export function saveCustomPreset(prefs: KeyValueStorage, list: readonly Preset[], input: { name: string; extra: readonly Criterion[] }, ids: Ids): SaveResult;
export function deleteCustomPreset(prefs: KeyValueStorage, list: readonly Preset[], id: string): Preset[];
export function residenceOptions(buildings: readonly BundleBuilding[]): BundleBuilding[]; // by name
export function quadOptions(buildings: readonly BundleBuilding[]): BundleBuilding[];      // id ends "-quad", by name
export const InstallState = z.object({ pickVisits: z.number().int().min(0).max(1000), dismissed: z.boolean() });
export function notePickAction(prefs: KeyValueStorage, tab: KeyValueStorage): InstallState; // +1 once per tab session
export function shouldOfferInstall(state: InstallState, standalone: boolean): boolean;      // !dismissed && !standalone && pickVisits >= 2
export function dismissInstall(prefs: KeyValueStorage): void;
```

A custom preset is `{ id: "custom-" + ids.uuid(), name: input.name.trim(), required: [...extra], soft: [], minutes: null, groupDefault: null }`. The name is trimmed and cut to 24 characters.

- [ ] **Step 1: Write the failing tests**:
  - Access round-trips. Corrupt access resets with `reset: true`.
  - Custom presets with a built-in id (`"silent_solo"`) or a null name are rejected, and the whole list resets.
  - `saveCustomPreset`:
    - An empty name gives `name_required`.
    - No filters gives `filters_required`.
    - An 11th preset gives `full`.
    - Success stores and returns the list with an id starting `custom-`.
  - `deleteCustomPreset` removes it.
  - `quadOptions` on the bootstrap-like list `[kelly-quad, sac, roth-quad]` returns Kelly Quad, then Roth Quad.
  - `notePickAction` twice in the same tab counts 1. With a new tab storage, it counts 2. `shouldOfferInstall` is true at 2 and false once dismissed or standalone.

- [ ] **Step 2: Run the tests to verify they fail, implement (using `readJson` and `writeJson` from C3), and run them to verify they pass**

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: FAIL first, then PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-logic/src/student packages/ui-logic/test/studentMe.test.ts
git commit -m "feat(ui-logic): access profile, custom presets and install state"
```

### Task F2: Me screen, Surveyor tools row and install note

**Tier:** Feature.

**Files:**
- Create:
  - `apps/web/src/screens/student/Me.tsx`
  - `apps/web/src/screens/student/BuildingSheet.tsx` (a shared search-and-pick sheet; refactor `FromSheet`'s list into it)
  - `apps/web/src/screens/student/PresetSheet.tsx`
  - `apps/web/src/screens/student/InstallNote.tsx`
  - `apps/web/src/app/installPrompt.ts`
  - `apps/web/test/studentMe.test.tsx`
  - `apps/web/e2e/student-me.e2e.ts`
- Modify:
  - `apps/web/src/routes/_student.me.tsx`
  - `apps/web/src/hooks/useQuickPick.ts`: read access with `readAccess`, read the custom presets, and call `notePickAction` on Directions, card taps, Something else and Surprise me
  - `apps/web/src/screens/student/Home.tsx`: render `InstallNote`
  - `apps/web/src/app/deps.ts`: `ids: Ids`, using `browserIds`, with the harness using `sequentialIds`
  - `main.tsx`: `captureInstallPrompt(window)`
  - The copy deck and `copy.gen.ts`

**Interfaces:**
- Produces:
  - `captureInstallPrompt(win)`. It stores the `beforeinstallprompt` event (after `preventDefault`) in a module holder.
  - `installPromptAvailable(): boolean`
  - `promptInstall(): Promise<void>`

Layout:
1. `Screen` titled `student.me.title`.
2. When any read reset, a `Banner tone="note"` with `student.me.reset_note`.
3. Access group:
   - A `Row` "Where you live" with the end set to the building name or "Off campus". It opens `BuildingSheet` over `residenceOptions`, with an "Off campus" row first.
   - A `Row` "Quad" with the end set to the quad name or "None", over `quadOptions`.
   - A `Check` row "Grad student".
   - A helper paragraph with `student.me.access_helper`.
4. Presets group:
   - Built-in rows, sub "Built in".
   - Custom rows, each with an `IconButton` `Trash2` labeled `student.me.preset.delete`. It opens the existing `ConfirmSheet`. The confirm is a danger button, and no red primary is beside it.
   - A quiet "New preset" button. It opens `PresetSheet`: a `TextField` (Name, max 24) plus the filter tag groups, with the primary "Save preset" and a quiet "Cancel". Errors use the field error.
5. Look group: the existing `ThemeSwitch`.
6. Privacy group:
   - `student.me.privacy` paragraph.
   - A `Row` link "Data policy" (external) to `https://github.com/dr-hextanium/perch/blob/main/docs/data-policy.md`.
   - A `Row` link "Source code" to `https://github.com/dr-hextanium/perch`.
   - `student.me.licenses_body` as a Small paragraph.
7. When `deps.session.token() !== null` (subscribe through `deps.session.subscribe`), one more group: a `Row` with the `Wrench` icon, the title "Surveyor tools" and a link to `/survey`. Nothing else in student mode mentions surveying.

Install note (Home, under the alternates):
- It shows when `shouldOfferInstall(state, isStandalone(window))`.
- If `installPromptAvailable()`, it is a `Banner tone="note"` with `student.install.note`, an ink "Add" (`promptInstall`) and a ghost "No thanks" (`dismissInstall`).
- On iOS (`isIos`), it shows `student.install.ios` with "No thanks".
- Otherwise it is not shown.

Copy rows (section `## Student: Me`):

```markdown
| student.me.access_heading | Access | 10 | |
| student.me.residence.label | Where you live | 16 | |
| student.me.residence.none | Off campus | 12 | |
| student.me.quad.label | Quad | 6 | |
| student.me.quad.none | None | 6 | |
| student.me.grad.label | Grad student | 14 | |
| student.me.access_helper | Unlocks spots for residents and grad students. Nobody checks this. | 72 | |
| student.me.presets_heading | Presets | 10 | |
| student.me.preset.builtin | Built in | 10 | |
| student.me.preset.new | New preset | 14 | |
| student.me.preset.name | Name | 8 | |
| student.me.preset.save | Save preset | 14 | |
| student.me.preset.delete | Delete preset | 14 | |
| student.me.preset.delete_title | Delete {name}? | 34 | |
| student.me.preset.delete_body | It goes away on this phone only. | 40 | |
| student.me.preset.name_required | Give it a name. | 20 | |
| student.me.preset.filters_required | Pick at least one filter. | 28 | |
| student.me.preset.full | You can keep up to 10 presets. | 34 | |
| student.me.look_heading | Look | 6 | |
| student.me.privacy_heading | Privacy | 10 | |
| student.me.privacy | Nothing about you is stored on our servers. Settings live on this phone. | 80 | spec wording |
| student.me.data_policy | Data policy | 14 | |
| student.me.source | Source code | 14 | |
| student.me.licenses_body | Code is MIT. Spot data and photos are CC BY-SA 4.0. Map data is OpenStreetMap. | 90 | |
| student.me.surveyor | Surveyor tools | 16 | only with a surveyor session |
| student.me.reset_note | Your settings couldn't be read, so they were reset. | 56 | |
| student.install.note | Add Perch to your home screen to open it faster. | 52 | |
| student.install.add | Add | 6 | |
| student.install.dismiss | No thanks | 10 | |
| student.install.ios | In Safari, tap Share, then Add to Home Screen. | 52 | |
```

- [ ] **Step 1: Write the failing unit tests**:
  - With `me: null`: there is no "Surveyor tools". With the default `me` (session present): "Surveyor tools" links to `/survey`.
  - Choosing quad "Kelly Quad" persists `student:access`. Back on `/`, the access note is gone, and Browse shows Kelly RCC unlocked (no lock sub).
  - The grad toggle unlocks Grad Lounge in Browse.
  - New preset "Outlets" with the Outlets filter appears in Home's preset chips. Choosing it ranks only spots with outlets of 0.5 or more.
  - Deleting a custom preset that Home had selected falls back to Silent solo.
  - Corrupt `student:presets` shows the reset note.
  - The privacy sentence is shown verbatim.
  - The install note: two pick actions in two separate tab storages, then Home shows the note when a fake install prompt is available. "No thanks" hides it for good.

- [ ] **Step 2: Run the tests to verify they fail, implement, and run them to verify they pass**

Run: `cd apps/web && bunx vitest run test/studentMe.test.tsx`, then the full web unit suite, typecheck and lint.
Expected: FAIL first, then PASS.

- [ ] **Step 3: Write the e2e test** (`student-me.e2e.ts`):
  - `/me` without a session has no "Surveyor tools".
  - After `signIn(page)` (fixtures), `/me` shows it, and it opens `/survey`.
  - Theme switch to dark persists across reload.
  - `expectRoutesClean(page, ["/me"])`.

- [ ] **Step 4: Run Procedure V** for `/me` and `/`, then commit.

```bash
git add apps/web/src/screens/student apps/web/src/app apps/web/src/hooks/useQuickPick.ts apps/web/src/routes/_student.me.tsx apps/web/src/main.tsx apps/web/test apps/web/e2e/student-me.e2e.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(web): me screen with access, presets and surveyor tools"
```

---

## Phase G: pick ping

### Task G1: `POST /ping/pick` with in-memory counts

**Tier:** Logic (server, database, privacy).

**Files:**
- Create:
  - `apps/server/src/ping/counter.ts`
  - `apps/server/src/ping/rateLimit.ts`
  - `apps/server/src/ping/flush.ts`
  - `apps/server/src/routes/ping.ts`
  - `apps/server/test/ping.test.ts`
- Modify: `apps/server/src/app.ts` (`AppDeps.pings?: PingCounter`, register `pingRoutes`, `onClose` flush), `apps/server/src/main.ts` (build the counter with `realTimers`)

**Privacy and free tier:**
- Nothing per ping is ever written. The counter keeps `Map<"spotId|hourStartIso", count>` in memory.
- It flushes:
  - 10 minutes after the last ping (before Render's 15-minute sleep)
  - at most 60 minutes after the first unflushed ping
  - at 500 keys
  - on shutdown
- A flush is one SQL statement that upserts into `pick_daily`, so each flush wakes Neon at most once.
- The IP is used only as a key in an in-memory rate limiter (30 per hour) and is never logged: the route sets `logLevel: "silent"`.
- A rate-limited or unknown spot still gets `204`, so nothing leaks.
- No device id. The body is only `{ spot_id }`, sent as `text/plain` JSON so the browser sends no preflight.

**Interfaces:**

```ts
// counter.ts
export const PING_IDLE_MS = 600_000; export const PING_MAX_AGE_MS = 3_600_000; export const PING_MAX_KEYS = 500;
export type PingRow = { spot_id: string; at: string /* ISO, start of the UTC hour */; count: number };
export type PingCounter = { add(spotId: string): void; flushNow(): Promise<void>; pending(): number; close(): Promise<void> };
export function createPingCounter(deps: { clock: Clock; timers: Timers; flush(rows: PingRow[]): Promise<void>;
  idleMs?: number; maxAgeMs?: number; maxKeys?: number; log?: (m: string) => void }): PingCounter;
// rateLimit.ts
export type RateLimiter = { allow(key: string): boolean };
export function createRateLimiter(opts: { clock: Clock; limit: number; windowMs: number; maxKeys?: number }): RateLimiter;
// flush.ts
export function flushPicks(db: Db, campusId: string, rows: readonly PingRow[]): Promise<void>;
// routes/ping.ts
export const pingRoutes: (deps: { pings: PingCounter; limiter: RateLimiter }) => FastifyPluginAsyncZod;
```

The flush SQL (drizzle `sql` template; hours fold into the campus day in SQL):

```ts
export async function flushPicks(db: Db, campusId: string, rows: readonly PingRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values = sql.join(
    rows.map((r) => sql`(${r.spot_id}::uuid, ${r.at}::timestamptz, ${r.count}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    insert into pick_daily (spot_id, day, count)
    select v.spot_id, (v.at at time zone c.tz)::date as day, sum(v.count)::int
    from (values ${values}) as v(spot_id, at, count)
    join spot s on s.id = v.spot_id and s.status = 'published'
    join building b on b.id = s.building_id
    join campus c on c.id = b.campus_id and c.id = ${campusId}
    group by v.spot_id, day
    on conflict (spot_id, day) do update set count = pick_daily.count + excluded.count`);
}
```

Before using them, check the column names in `packages/db/src/schema` (`spot.status`, `spot.building_id`, `building.campus_id`, `campus.tz`).

The counter's `flush` failure path puts the rows back into the map (adding counts), reschedules the idle timer, and logs `pick flush failed` without the error body. That keeps it from dumping data into logs.

- [ ] **Step 1: Write the failing tests** (`ping.test.ts`, with `createTestDb` and `seed` from `@perch/db`, the helpers in `apps/server/test/helpers.ts`, and a manual timers fake like the publisher's):
  - The counter groups by spot and UTC hour. `flushNow` sends one batch and empties the map.
  - The idle timer fires once after 10 minutes. The max-age timer fires at 60 minutes, even with steady pings. The 500th key flushes at once.
  - A failed flush keeps the counts. The next flush sends the sum.
  - `close()` flushes.
  - `flushPicks` on the seeded db: 3 pings for `central-reading-room` plus 1 in the next hour on the same campus day gives `pick_daily.count = 4`. An unknown uuid and the draft `union-draft` are dropped, with no error. A second flush adds to the counts.
  - Route, through `app.inject`:
    - `POST /ping/pick` with `content-type: text/plain` and the body `{"spot_id":"<uuid>"}` returns 204, and `pings.pending()` is 1.
    - A bad uuid returns 400.
    - The 31st request in an hour from the same IP returns 204 but is not counted. Different `x-forwarded-for` clients are counted separately (`trustProxy: 1`).
    - The response has no body.
  - Privacy: capture the Fastify logger output (`logger: true` with a stream sink in the test) for 5 pings. It contains no IP address and no `spot_id`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test apps/server/test/ping.test.ts --timeout 60000`
Expected: FAIL.

- [ ] **Step 3: Implement.** First, client IPs. Render terminates TLS at its proxy, so without `trustProxy` every request's `req.ip` is the proxy, and the 30-per-hour cap would apply to the whole campus.
  - Add `trustProxy: 1` to `Fastify({...})` in `buildApp`. With 1, Fastify trusts one hop and takes the address the nearest proxy appended (the rightmost `x-forwarded-for` entry), so a client-supplied header cannot spoof it.
  - Add a route test: two injects with `x-forwarded-for: 203.0.113.1` and `203.0.113.2`, each sent 30 times, are both fully counted, and a 31st from the first is not.
  - Run `grep -rn "req.ip\|request.ip" apps/server/src`, and make sure any existing limiter still passes its tests with `trustProxy` on.

  Then register a scoped `text/plain` content-type parser in `pingRoutes` that `JSON.parse`s the string, and have a parse error answer 400. In `buildApp`, use `deps.pings ?? createPingCounter({ clock, timers: realTimers, flush: (rows) => flushPicks(db, campusId, rows) })`, plus `createRateLimiter({ clock, limit: 30, windowMs: 3_600_000, maxKeys: 5000 })`, and `app.addHook("onClose", () => pings.close())`. Use no `Bun.*` APIs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/server --timeout 60000 && bun run typecheck && bun run lint && bun run smoke:server`
Expected: PASS. The smoke proves it runs on Node.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ping apps/server/src/routes/ping.ts apps/server/src/app.ts apps/server/src/main.ts apps/server/test/ping.test.ts
git commit -m "feat(server): anonymous pick ping counted in memory"
```

### Task G2: client ping behind `VITE_PICK_PING`

**Tier:** Logic (privacy).

**Files:**
- Create: `packages/ui-logic/src/student/ping.ts`, `packages/ui-logic/test/studentPing.test.ts`
- Modify:
  - `apps/web/src/env.ts` (optional `VITE_PICK_PING: z.enum(["0", "1"]).default("0")`), and `apps/web/test/env.test.ts`
  - `apps/web/src/app/deps.ts` (`pickPing: PickPing`), and the harness (a recording fake)
  - `PickCard.tsx` and `SpotPage.tsx` (call sites)

**Interfaces:**
- Produces:
  - `type PickPing = (spotId: string) => void`
  - `createPickPing(deps: { send(url: string, body: string): void; tab: KeyValueStorage; enabled: boolean }, apiBaseUrl: string): PickPing`
  - It sends at most once per spot per tab session (key `student:pinged`, at most 50 ids, Zod-parsed). It never throws. When disabled, it does nothing.
  - The web `send` is `void fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "content-type": "text/plain" } }).catch(() => {})`.

Call sites: Directions on the pick card and on the spot page, and the spot page mount when `via=pick`. Never on render of the pick card.

- [ ] **Step 1: Write the failing tests**:
  - Disabled: no sends.
  - Enabled: the first call sends `{"spot_id":"<id>"}` to `${api}/ping/pick`. A second call for the same spot sends nothing, and another spot sends.
  - A throwing `send` is swallowed.
  - Web unit test: rendering Home sends nothing. Clicking Directions sends once with the enabled fake.
  - Env test: missing `VITE_PICK_PING` parses as `"0"`.

- [ ] **Step 2: Run the tests to verify they fail, implement, and run them to verify they pass**

Run: `bun test packages/ui-logic --timeout 60000 && bun run --filter '@perch/web' test && bun run typecheck && bun run lint`
Expected: FAIL first, then PASS. The Playwright no-API-traffic assertions from C5 and D2 still pass, because the default build has pings off.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-logic/src/student/ping.ts packages/ui-logic/test/studentPing.test.ts apps/web/src/env.ts apps/web/test/env.test.ts apps/web/src/app/deps.ts apps/web/test/harness.tsx apps/web/src/screens/student
git commit -m "feat(web): pick ping behind an off-by-default flag"
```

---

## Phase H: postcards (spec 7a), only if time allows

The visual is Seawolf (owner decision O1): a paper card, an ink border, Newsreader lettering, a red postmark ring, and a mist photo frame. It adds no new hues and no university marks.

### Task H1: postcard layout model

**Tier:** Feature.

**Files:**
- Create: `packages/ui-logic/src/student/postcard.ts`, `packages/ui-logic/test/studentPostcard.test.ts`
- Modify: the student index, the copy deck (section `## Student: postcards`)

**Interfaces:**

```ts
export const POSTCARD = { width: 1600, height: 1000, margin: 64 } as const;
export const NOTE_MAX = 60;
export type PostcardInput = { spotName: string; place: string; noise: NoisePolicy; checkedIso: string;
  today: Date; tz: string; note: string; hasPhoto: boolean; url: string };
export type TextBox = { text: string; x: number; y: number; size: number; font: "serif" | "sans"; weight: 400 | 500 | 600; maxWidth: number };
export type PostcardModel = {
  width: number; height: number;
  photo: { x: number; y: number; w: number; h: number; kind: "photo" | "placeholder" };
  greeting: TextBox; perched: TextBox; address: TextBox[]; note: TextBox | null; footer: TextBox;
  stamp: { x: number; y: number; size: number; noise: NoisePolicy; label: string };
  postmark: { cx: number; cy: number; r: number; date: string; checked: string; opacity: number };
};
export function postcardModel(input: PostcardInput): PostcardModel;
```

Rules:
- `perched` is `t("student.postcard.perched", { spot })`.
- The note is trimmed and cut to `NOTE_MAX`, and an empty note gives `null`.
- The postmark date is today, in campus time (`shortDay`).
- `checked` is the last verified date.
- `opacity` is 1 for a check at most 30 days old, falling linearly to 0.4 at 180 days or more.
- The photo takes the left 55% of the card; the address block, stamp and postmark sit on the right.

Copy rows:

```markdown
| student.postcard.send | Send a postcard | 18 | |
| student.postcard.title | Send a postcard | 18 | sheet title |
| student.postcard.greeting | Greetings from | 16 | |
| student.postcard.perched | Perched at {spot} | 44 | |
| student.postcard.photo | Add a photo | 14 | |
| student.postcard.photo_change | Change photo | 14 | |
| student.postcard.note | Note | 6 | |
| student.postcard.note_helper | Up to 60 characters. | 24 | |
| student.postcard.share | Share postcard | 16 | |
| student.postcard.save | Save image | 12 | fallback |
| student.postcard.privacy | Your photo stays on this phone unless you share it. | 56 | |
| student.postcard.checked | Checked {date} | 20 | on the postmark |
```

- [ ] **Step 1: Write the failing tests**:
  - The geometry stays inside the card (every box within `margin`).
  - A 70-character note is cut to 60. A whitespace-only note gives `null`.
  - Postmark opacity is 1 at 10 days, 0.4 at 200 days, and about 0.7 at 105 days.
  - `hasPhoto` false gives `kind: "placeholder"`.
  - The stamp label is the noise policy word, reusing the survey `NOISE_COPY` ids if they are exported from ui-logic. Otherwise add `student.stamp.<policy>` rows.

- [ ] **Step 2: Run the tests to verify they fail, implement, run them to verify they pass, and commit**

Run: `bun test packages/ui-logic --timeout 60000 && bun run typecheck && bun run lint`
Expected: FAIL first, then PASS.

```bash
git add packages/ui-logic/src/student/postcard.ts packages/ui-logic/test/studentPostcard.test.ts packages/ui-logic/src/student/index.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(ui-logic): postcard layout model"
```

### Task H2: canvas renderer

**Tier:** Feature.

**Files:**
- Create: `apps/web/src/lib/postcardCanvas.ts`, `apps/web/test/postcardCanvas.test.ts`

**Interfaces:**
- Produces: `renderPostcard(model: PostcardModel, photo: ImageBitmap | null, palette: Palette, canvas?: HTMLCanvasElement): Promise<Blob>` (PNG).
- It draws:
  1. A paper background with a 2 px ink border.
  2. The photo, cover-cropped into the frame, or a mist frame with the "P" mark.
  3. The text boxes, in Newsreader for the serif boxes and Instrument Sans for the sans ones. It awaits `document.fonts.load` for both first.
  4. The stamp: a mist rectangle with a perforated edge drawn as small paper circles, the noise label, and the Lucide `Volume`, `VolumeX` or `Users` path for the policy.
  5. The postmark: two red rings with the date text along the top arc, at `opacity`.
- Colors come from `tokens.palette.light` (the share image is always light).

- [ ] **Step 1: Write the tests** (jsdom has no canvas, so inject a fake 2D context through the `canvas` parameter with a recording proxy). Assert that `fillText` is called with the greeting, the spot name and the date, and that `drawImage` is called once with a photo and never without one.
- [ ] **Step 2: Implement, run the tests to verify they pass, and commit**

Run: `cd apps/web && bunx vitest run test/postcardCanvas.test.ts`, then typecheck and lint.
Expected: PASS.

```bash
git add apps/web/src/lib/postcardCanvas.ts apps/web/test/postcardCanvas.test.ts
git commit -m "feat(web): render postcards on a canvas"
```

### Task H3: share flow

**Tier:** Feature (privacy: nothing uploads).

**Files:**
- Create: `apps/web/src/screens/student/PostcardSheet.tsx`, `apps/web/test/postcardSheet.test.tsx`, `apps/web/e2e/student-postcard.e2e.ts`
- Modify: `SpotPage.tsx` and `PickCard.tsx` (a quiet "Send a postcard" button)

**Behavior:**
1. The sheet holds a photo button: a `label` around `<input type="file" accept="image/*" capture="user">`, read with `createImageBitmap` and never uploaded.
2. Then a note `TextField` with `maxLength=60`.
3. Then a live preview `<img>` from the rendered blob's object URL, revoked on change and close.
4. Then the privacy line.
5. The primary "Share postcard" calls `navigator.share({ files: [new File([blob], "perch-postcard.png", { type: "image/png" })], title })` when `navigator.canShare?.({ files })`. Otherwise it falls back to a "Save image" `<a download>`.
6. No `fetch` of any kind.

- [ ] **Step 1: Write the tests**:
  - Unit: the note counter caps at 60. The share path uses the file when `canShare` is true, and the download link otherwise.
  - e2e: open the sheet on `/spot/central-reading-room`, type a note, and the preview `img` appears. Record every request during the flow; there are none to any origin except `blob:` and `data:`.
- [ ] **Step 2: Implement, run the tests to verify they pass, run Procedure V for the open sheet, and commit**

```bash
git add apps/web/src/screens/student apps/web/test/postcardSheet.test.tsx apps/web/e2e/student-postcard.e2e.ts
git commit -m "feat(web): send a postcard from a spot"
```

---

## Phase Z: docs and the final gate

### Task Z1: decisions, design record and data policy

**Tier:** Tweak (docs).

**Files:**
- Modify:
  - `docs/context/overview.md`: append decision 22
  - `docs/context/product-design.md`: Surprise me versus Something else
  - `docs/context/models.md`: exam fallback, unknown counted as half, floor penalty, Till close cap
  - `DESIGN.md`: a "Student mode" section listing the composed components (tab bar, pick card, forecast bars, map pins, legend), with their token recipes and no new tokens
  - `apps/web/.impeccable/surfaces/apps-web.md`: the scope adds the student routes, and Unresolved now says student mode uses Seawolf per O1
  - `docs/context/roadmap.md`: next tasks are the pick ping decision, the quad list and prerender (deferred)
- Create: `docs/data-policy.md`, the plain-language policy:
  - what is stored on the phone
  - what the server sees (only the optional pick ping: spot and day counts)
  - location used once and never sent
  - photos in postcards never uploaded
  - map tiles loaded from OpenFreeMap (which sees the requester's IP, like any website)
  - contact

Decision 22 text, to append in `overview.md` with the same style as entries 20 and 21:

```markdown
22. Student app v0 (2026-10-10, owner decisions relayed overnight), detail in `docs/superpowers/specs/2026-10-10-perch-student-v0.md` and `docs/superpowers/plans/2026-10-10-perch-student-v0.md`: students use the exact Seawolf system (decision 12's postcard look is retired from student screens; the share-a-postcard flow stays as the last phase); `/` is student Home with a tab bar (Home, Browse, Me) under a pathless `_student` layout, `/survey` and invite links unchanged, and a Surveyor tools row in Me only on phones with a survey session; Home has Something else (reroll within filters) and Surprise me (ignores the preset, keeps every hard rule, own last-5 history); scoring runs in `packages/core/src/scoring` with campus-time instants (two day-of-week conventions named), past-midnight and chained hours, the exam busyness fallback on the client, unknown attributes counted as half a match, and a seeded generator in tests; the bundle store is stale-while-revalidate and trusts only a network `Date` for clock skew (the data site exposes `Date`); Browse has a lazy MapLibre map on OpenFreeMap with pins in the four colors plus a word legend, kept out of the precache; prerendered spot pages and the static map image are deferred; the pick ping counts in memory and upserts straight into `pick_daily` (no raw rows, no nightly job), and the client call ships off behind `VITE_PICK_PING`.
```

- [ ] **Step 1: Write the docs.** Check them with `grep -rn "$(printf '\342\200\224')" docs DESIGN.md`, which must return nothing new.
- [ ] **Step 2: Run** `bun run lint`. Then commit:

```bash
git add docs/context/overview.md docs/context/product-design.md docs/context/models.md docs/context/roadmap.md DESIGN.md apps/web/.impeccable/surfaces/apps-web.md docs/data-policy.md
git commit -m "docs: record student app decisions and the data policy"
```

### Task Z2: final gate on `dev`

**Tier:** Logic (it is the last review).

- [ ] **Step 1: Run every suite**

```bash
bun run typecheck && bun run lint && bun test --timeout 60000 && bun run --filter '@perch/web' test && bun run smoke:node && bun run smoke:server
cd apps/web && bunx vite build --outDir "${CLAUDE_JOB_DIR:-/tmp}/perch-z2/dist" && node scripts/check-chunks.ts "${CLAUDE_JOB_DIR:-/tmp}/perch-z2/dist"
cd apps/web && bunx playwright test
```

Expected: everything PASS, including the survey suites, unchanged.

- [ ] **Step 2: Run Procedure V** on `/ /browse /me /spot/central-reading-room /spot/kelly-rcc /survey`, plus the visual-reviewer verdict.
- [ ] **Step 3: Run Lighthouse** on a production build in its own directory (CLAUDE.md loop step 3) for `/`, `/browse` and `/spot/central-reading-room`. Record the performance and accessibility scores. Accessibility must be 100. Investigate a performance score below 90 on `/`; the map chunk must not load there.
- [ ] **Step 4: Request the code review** with `superpowers:requesting-code-review`, over the whole branch range of this plan. Fix findings in their own commits.
- [ ] **Step 5: Leave it on `dev`.** Do not merge or push to `main` (owner decision O6). The owner reviews it in their own localhost preview (ports 5199 and 8790, which are never touched). Report the commit range, the test counts before and after, the Lighthouse scores and the deviations list.

---

## Self-review (done while writing)

- **Spec coverage:** every item maps to a task.
  - Section 5, items 3 to 9: A2 (hours and walk), A3 (filters, fit, eligibility), A4 (P(seat), time value), A5 (score, filters, empty state), A6 (reroll), A1 (time handling).
  - Section 5 tests: the property tests in A1, A3 and A4; the golden tests in A5; the DST, past-midnight and exam fixtures in A1, A2 and A5.
  - Section 7:
    - First open: C4 defaults and the C5 access note.
    - Quick pick: C4 and C5.
    - Browse: E1 to E3.
    - Spot page: D1 and D2, minus prerender and the static map (deferred in the addendum).
    - Me: F1 and F2.
    - PWA: the B2 and B3 offline bundle, the C1 manifest, the D2 photo cache, the F2 install prompt, the C5 schema mismatch text, and the existing update prompt.
    - Locked spots: A5 never picks them; E1 and E2 show them.
  - Section 6, pick ping: G1 and G2.
  - Section 7a, postcards: H1 to H3.
  - Section 9, errors: C5 states.
  - Roadmap v0 acceptance:
    - "3 ranked, eligible, open spots with walking time and confidence label": C5.
    - "Browse filters on every v0 attribute and eligibility": the E1 filters cover noise, food, group work, outlets, seat count (50+), hours (open at arrival) and eligibility (show locked).
    - "last-verified and forecast or no data yet": D2.
- **Owner decisions:**
  - O1: global constraints and every UI task.
  - O2: A5, A6 and C5.
  - O3: C4.
  - O4: E3.
  - O5: F2.
  - O6: Z2.
  - O7: phase order.
- **Type names used across tasks:** `rankSpots`, `surpriseRank`, `draw`, `topPick`, `pushRecent`, `Candidate`, `RankResult`, `EmptyHelp`, `PickInput`, `TimeChoice`, `Preset`, `Criterion`, `AccessProfile`, `BundleState`, `BundleStore`, `PickPrefs`, `readJson`, `writeJson`, `FILTERS`, `toggle`, `isOn`, `busyLine`, `rowBusy`, `pickCardView`, `dataAgeView`, `dayForecast`, `weekHours`, `checkedView`, `browseView`, `BrowsePrefs`, `readAccess`, `readCustomPresets`, `createPickPing`. Each is defined once, in the task named in its Interfaces block.
- **Known judgment calls for the reviewer:** the floor-penalty regex (A2), that Surprise keeps the group size only for the Group preset (A5), and that fit-0 candidates stay ranked last (A5; only P = 0 or time value = 0 exclude).

## Execution

Recommended: **subagent-driven** (`superpowers:subagent-driven-development`).
- Phase A and the Logic-tier tasks need the full review loop.
- The later tasks depend on the exact names in each Interfaces block, so a fresh reviewer per task catches drift early.

Order:
1. Run A1 to A6, then B1 to B4, in sequence.
2. C1 can start once B3 has landed. C2 and C3 can then run in parallel, because they touch different files, but both edit the copy deck: let the controller serialize their copy-deck commits, or run them one after the other.
3. D1 and E1 can run in parallel after C3.
4. G1 is independent of the web work and can run any time after A6.
5. H runs last, and only if time allows.

Every task stays on `dev`. Do not push or merge to `main`.
