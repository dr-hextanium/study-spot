# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Bun monorepo with strict TypeScript, linting, CI, the full v0 Postgres schema, sample seed data, the versioned campus bundle schema, `buildBundle()`, and a platform-agnostic bundle client in `packages/ui-logic`.

**Architecture:** Three workspace packages. `packages/core` holds enums, Zod schemas (including the bundle contract), and small pure helpers. `packages/db` holds the Drizzle schema (enums reuse core's value arrays), migrations, seed, and `buildBundle(db, campusId, now)` which turns database rows into a validated bundle. `packages/ui-logic` holds platform adapter interfaces and `loadBundle()`, which fetches, validates, caches, and falls back to the last good bundle. Apps (`apps/server`, `apps/web`) are created by later plans.

**Tech Stack:** Bun 1.3.14 (package manager, workspaces, `bun test`), Node 24+ (fallback runtime, type stripping), TypeScript 7 (`tsc -b`), Zod 4, Drizzle ORM 0.45 + drizzle-kit 0.31 + drizzle-zod 0.8, postgres.js 3, PGlite 0.5 (tests and Node smoke check), Biome 2, lefthook 2, gitleaks, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-perch-v0-design.md` (sections 3, 3a, 4, 8, 9, 10 step 1). Project rules: `CLAUDE.md`, `docs/context/stack.md`, `docs/context/data-model.md`, `docs/context/spot-schema.md`.

## Global Constraints

- TypeScript flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. No `any`. No non-null assertion without a justifying comment. No TS `enum`, `namespace`, or parameter properties.
- Relative imports use explicit `.ts` extensions (required by Node type stripping).
- No `Bun.*` APIs in `packages/*` source. `bun:test` is allowed in test files only.
- `packages/core` and `packages/ui-logic` compile with `lib: ["ES2023"]` and `types: []`: no DOM, no Node globals. Biome blocks `react-dom` and `react-native` imports there.
- Postgres driver is `postgres` (postgres.js). Never Bun's SQL client.
- Zod is the single source of truth for shapes. Use `z.enum` and string literal unions, never TS enums.
- Day of week convention everywhere: `0 = Monday ... 6 = Sunday`, campus local time. Forecast slot index is `day_of_week * 24 + hour`, 168 slots.
- Bundle contains aggregates only: no surveyor IDs, no raw headcounts, no unapproved photos, no draft or archived spots.
- Fullness ratios: `empty 0.1, some 0.35, filling 0.6, nearly_full 0.85, full 1.0`.
- Walk fallback for missing pairs: straight-line meters times 1.3 at 1.3 m/s, rounded up to whole minutes, recorded in `walk.estimated_pairs`.
- No em-dashes in code, comments, docs, or commit messages.
- Commits: Conventional Commits, one logical change each, subject 72 characters or fewer, every commit passes `bun run typecheck`, `bun run lint`, `bun test`. No attribution lines.
- Package scope: `@perch/*`.

## Review Focus

1. **Hours past midnight and "24:00":** a spot open `08:00` to `02:00` or `08:00` to `24:00` must validate in the bundle schema. Test in Task 3.
2. **A building pair missing from the walk matrix:** the bundle must still build, with a fallback time flagged in `estimated_pairs`, never a crash or a missing cell. Test in Task 7.
3. **No term contains "today"** (winter break): `buildBundle` must pick the next upcoming term, and only throw when no current or future term exists. Test in Task 7.
4. **A published spot missing a v0-required field:** it must be skipped with a warning, not crash the whole publish or produce an invalid bundle. Test in Task 7.
5. **A corrupt or older-major cached bundle, or a network failure:** `loadBundle` must fall back to the last valid bundle, and report `update_required` or `offline_no_cache` clearly when none exists. Test in Task 8.

---

## File Structure

```
package.json                      root workspace, scripts
tsconfig.base.json                shared strict compiler options
tsconfig.json                     solution file, references every project
biome.json                        lint and format, restricted imports override
lefthook.yml                      pre-commit hooks
.github/workflows/ci.yml          CI
LICENSE                           MIT (code)
DATA-LICENSE                      CC BY-SA 4.0 notice (spot data and photos)
.env.example                      DATABASE_URL placeholder

packages/core/
  package.json  tsconfig.json  test/tsconfig.json
  src/index.ts          re-exports
  src/enums.ts          enum value arrays, Zod enums, literal types, FULLNESS_RATIO
  src/slots.ts          slot index, day type, time block helpers
  src/time.ts           campusDate(now, tz)
  src/geo.ts            haversineMeters, fallbackWalkMinutes
  src/bundle.ts         Bundle, BundlePointer schemas, parseBundle
  test/enums.test.ts  test/slots.test.ts  test/time.test.ts  test/geo.test.ts
  test/bundle.test.ts  test/fixtures/bundle-v1.ts

packages/db/
  package.json  tsconfig.json  test/tsconfig.json  drizzle.config.ts
  drizzle/                     generated migrations (committed)
  src/index.ts                 re-exports
  src/schema/enums.ts          pgEnum definitions from core arrays
  src/schema/campus.ts         campus, building, term, walk_matrix
  src/schema/spot.ts           spot and spot_* child tables
  src/schema/survey.ts         surveyor, auth, audit, receipts, routes
  src/schema/observations.ts   headcount, noise_sample, forecast, spot_estimate
  src/schema/ops.ts            bundle_state, pick_ping, pick_daily
  src/schema/index.ts          re-exports all tables
  src/client.ts                Db type, createDb(url)
  src/testing.ts               createTestDb() on PGlite with migrations
  src/seed/data.ts             SAMPLE seed data (not surveyed)
  src/seed/seed.ts             seed(db)
  src/bundle/term.ts           pickTerm
  src/bundle/walk.ts           assembleWalk
  src/bundle/busyness.ts       assembleBusyness
  src/bundle/spot.ts           toBundleSpot
  src/bundle/buildBundle.ts    buildBundle
  scripts/migrate.ts           apply migrations to DATABASE_URL
  scripts/seed.ts              seed DATABASE_URL
  scripts/smoke-bundle.ts      Node smoke check: migrate, seed, build, validate
  test/schema.test.ts  test/seed.test.ts  test/term.test.ts  test/walk.test.ts
  test/busyness.test.ts  test/spot.test.ts  test/buildBundle.test.ts

packages/ui-logic/
  package.json  tsconfig.json  test/tsconfig.json
  src/index.ts
  src/adapters.ts              Storage, KeyValueCache, Clock, Geolocation, Share, NetworkStatus, Fetch
  src/bundleClient.ts          loadBundle
  test/fakes.ts                in-memory adapter fakes
  test/bundleClient.test.ts
```

v1 tables from `docs/context/data-model.md` (`live_report`, `session`, `arrival_feedback`, `tip`, `app_user`, `preset`, `device`) are intentionally not created. They belong to the v1 plan.

---

### Task 1: Workspace scaffold, tooling, licenses

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `biome.json`, `lefthook.yml`, `LICENSE`, `DATA-LICENSE`, `.env.example`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/test/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/test/smoke.test.ts`
- Create: `packages/ui-logic/package.json`, `packages/ui-logic/tsconfig.json`, `packages/ui-logic/test/tsconfig.json`, `packages/ui-logic/src/index.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/test/tsconfig.json`, `packages/db/src/index.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: root scripts `typecheck`, `lint`, `fix`, `test`, `smoke:node`; package names `@perch/core`, `@perch/db`, `@perch/ui-logic`, each exporting `./src/index.ts`.

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "perch",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "tsc -b",
    "lint": "biome check .",
    "fix": "biome check --write .",
    "test": "bun test",
    "smoke:node": "node packages/db/scripts/smoke-bundle.ts",
    "db:generate": "cd packages/db && drizzle-kit generate",
    "db:migrate": "node packages/db/scripts/migrate.ts",
    "db:seed": "node packages/db/scripts/seed.ts",
    "prepare": "lefthook install"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.15",
    "@types/bun": "^1.4.2",
    "@types/node": "^24.0.0",
    "lefthook": "^2.1.16",
    "typescript": "^7.0.2"
  },
  "engines": { "node": ">=24", "bun": ">=1.3.14" }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "allowImportingTsExtensions": true,
    "composite": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "skipLibCheck": true,
    "lib": ["ES2023"],
    "types": []
  }
}
```

`tsc -b` requires emit for project references, so declarations go to each project's `dist/` (gitignored). Nothing reads them at runtime; Bun and Node run the `.ts` sources.

- [ ] **Step 3: Write per-package tsconfigs**

`packages/core/tsconfig.json` and `packages/ui-logic/tsconfig.json` (identical):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/core/test/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "../dist-test", "types": ["bun"] },
  "include": ["."],
  "references": [{ "path": ".." }]
}
```

`packages/ui-logic/test/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "../dist-test", "types": ["bun"] },
  "include": ["."],
  "references": [{ "path": ".." }, { "path": "../../core" }]
}
```

`packages/ui-logic/tsconfig.json` adds a reference to core:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}
```

`packages/db/tsconfig.json` (Node globals allowed, needed for `process.env` and `node:url` in scripts):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src", "scripts", "drizzle.config.ts"],
  "references": [{ "path": "../core" }]
}
```

`packages/db/test/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "../dist-test", "types": ["bun", "node"] },
  "include": ["."],
  "references": [{ "path": ".." }, { "path": "../../core" }]
}
```

Root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/core/test" },
    { "path": "packages/ui-logic" },
    { "path": "packages/ui-logic/test" },
    { "path": "packages/db" },
    { "path": "packages/db/test" }
  ]
}
```

- [ ] **Step 4: Write package manifests and empty entry points**

`packages/core/package.json`:

```json
{
  "name": "@perch/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^4.6.5" }
}
```

`packages/ui-logic/package.json`:

```json
{
  "name": "@perch/ui-logic",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@perch/core": "workspace:*", "zod": "^4.6.5" }
}
```

`packages/db/package.json`:

```json
{
  "name": "@perch/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./testing": "./src/testing.ts" },
  "dependencies": {
    "@electric-sql/pglite": "^0.5.8",
    "@perch/core": "workspace:*",
    "drizzle-orm": "^0.45.3",
    "drizzle-zod": "^0.8.3",
    "postgres": "^3.4.9",
    "zod": "^4.6.5"
  },
  "devDependencies": { "drizzle-kit": "^0.31.11" }
}
```

PGlite is a regular dependency because `./testing` is imported by other packages' tests and by the Node smoke script. It is pure WASM, not a native addon.

Each `src/index.ts` starts as:

```ts
export {};
```

- [ ] **Step 5: Write `biome.json`**

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": { "includes": ["**", "!**/dist", "!**/dist-test", "!**/drizzle/meta"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "noNonNullAssertion": "error" }
    }
  },
  "overrides": [
    {
      "includes": ["packages/core/**", "packages/ui-logic/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "react-dom": "Platform code belongs in apps/*, not shared packages.",
                  "react-native": "Platform code belongs in apps/*, not shared packages."
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 6: Write `lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    typecheck:
      run: bun run typecheck
    lint:
      glob: "*.{ts,tsx,js,json}"
      run: bunx biome check --no-errors-on-unmatched {staged_files}
    secrets:
      run: gitleaks git --pre-commit --staged --redact --no-banner
```

Install gitleaks once per machine: `brew install gitleaks`.

- [ ] **Step 7: Licenses, env example, gitignore**

`LICENSE`: the standard MIT license text with `Copyright (c) 2026 perch contributors`.

`DATA-LICENSE`:

```
Spot data and photos

The study spot directory data (spot attributes, hours, busyness forecasts and
estimates) and surveyor photos published by this project are licensed under the
Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0).
https://creativecommons.org/licenses/by-sa/4.0/

Attribution: "Perch surveyors" with a link to this repository.

Source code is licensed separately under the MIT License (see LICENSE).
```

`.env.example`:

```
# Postgres connection string (Neon in production, local Postgres in development)
DATABASE_URL=postgres://user:password@localhost:5432/study_spot
```

Append to `.gitignore`:

```
dist-test/
*.tsbuildinfo
```

- [ ] **Step 8: Write placeholder tests**

Every TypeScript project needs at least one input file, so each `test/` directory gets a placeholder. Later tasks delete them as real tests arrive.

`packages/core/test/smoke.test.ts`, `packages/ui-logic/test/smoke.test.ts`, and `packages/db/test/smoke.test.ts` (identical):

```ts
import { expect, test } from "bun:test";

test("workspace runs tests", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 9: Install and verify everything runs**

Run:
```
bun install
bun run typecheck
bun run lint
bun test
```
Expected: install succeeds and creates `bun.lock`; typecheck exits 0; lint reports no errors (run `bun run fix` first if only formatting differs); `bun test` reports 3 passes.

- [ ] **Step 10: Verify the no-DOM rule bites**

Temporarily add `export const w = typeof window;` to `packages/core/src/index.ts`, run `bun run typecheck`.
Expected: FAIL with `Cannot find name 'window'`. Revert the line and rerun: PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "build: scaffold bun workspace with strict ts and biome"
```

---

### Task 2: Core enums and slot helpers

**Files:**
- Create: `packages/core/src/enums.ts`, `packages/core/src/slots.ts`, `packages/core/src/time.ts`, `packages/core/src/geo.ts`
- Modify: `packages/core/src/index.ts`
- Delete: `packages/core/test/smoke.test.ts`
- Test: `packages/core/test/enums.test.ts`, `packages/core/test/slots.test.ts`, `packages/core/test/time.test.ts`, `packages/core/test/geo.test.ts`

**Interfaces:**
- Produces (enum value arrays, each `as const`): `ELIGIBILITY`, `ENTRY_METHOD`, `SEAT_TYPE`, `TABLE_CONFIG`, `CELL_SIGNAL`, `NOISE_POLICY`, `NOISE_BUCKET`, `LIGHTING`, `TEMPERATURE`, `CALLS_OK`, `FOOD_POLICY`, `AMENITY`, `ATTRIBUTE_GROUP`, `VERIFICATION_SOURCE`, `CONFIDENCE`, `FULLNESS`, `DAY_TYPE`, `TIME_BLOCK`, `FORECAST_PROFILE`, `SLOT_CONFIDENCE`, `SURVEYOR_ROLE`, `SPOT_STATUS`, `NOISE_SAMPLE_SOURCE`.
- Produces matching Zod enums and types with PascalCase names (`Eligibility`, `EntryMethod`, ... `NoiseSampleSource`), plus `FULLNESS_RATIO: Readonly<Record<Fullness, number>>`.
- Produces `SLOTS = 168`, `slotIndex(dow: number, hour: number): number`, `dayTypeOf(dow: number): DayType`, `blockOfHour(hour: number): TimeBlock`.
- Produces `campusDate(now: Date, tz: string): string` (`YYYY-MM-DD`).
- Produces `haversineMeters(a: LatLng, b: LatLng): number`, `fallbackWalkMinutes(a: LatLng, b: LatLng): number`, type `LatLng = { lat: number; lng: number }`.

- [ ] **Step 1: Write failing tests**

`packages/core/test/enums.test.ts`:

```ts
import { expect, test } from "bun:test";
import { FULLNESS, FULLNESS_RATIO, Fullness, NoisePolicy } from "../src/index.ts";

test("fullness ratios match the spec", () => {
  expect(FULLNESS_RATIO).toEqual({
    empty: 0.1,
    some: 0.35,
    filling: 0.6,
    nearly_full: 0.85,
    full: 1.0,
  });
  expect(Object.keys(FULLNESS_RATIO)).toEqual([...FULLNESS]);
});

test("zod enums reject unknown values", () => {
  expect(NoisePolicy.safeParse("quiet").success).toBe(true);
  expect(NoisePolicy.safeParse("loud").success).toBe(false);
  expect(Fullness.safeParse("full").success).toBe(true);
});
```

`packages/core/test/slots.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SLOTS, blockOfHour, dayTypeOf, slotIndex } from "../src/index.ts";

test("slot index is dow * 24 + hour, Monday first", () => {
  expect(SLOTS).toBe(168);
  expect(slotIndex(0, 0)).toBe(0);
  expect(slotIndex(1, 14)).toBe(38);
  expect(slotIndex(6, 23)).toBe(167);
});

test("slot index rejects out of range input", () => {
  expect(() => slotIndex(7, 0)).toThrow(RangeError);
  expect(() => slotIndex(0, 24)).toThrow(RangeError);
  expect(() => slotIndex(-1, 0)).toThrow(RangeError);
  expect(() => slotIndex(0.5, 0)).toThrow(RangeError);
});

test("day type", () => {
  expect(dayTypeOf(0)).toBe("weekday");
  expect(dayTypeOf(4)).toBe("weekday");
  expect(dayTypeOf(5)).toBe("weekend");
  expect(dayTypeOf(6)).toBe("weekend");
});

test("time blocks: morning 6-11, afternoon 12-16, evening 17-21, night 22-5", () => {
  expect(blockOfHour(5)).toBe("night");
  expect(blockOfHour(6)).toBe("morning");
  expect(blockOfHour(11)).toBe("morning");
  expect(blockOfHour(12)).toBe("afternoon");
  expect(blockOfHour(16)).toBe("afternoon");
  expect(blockOfHour(17)).toBe("evening");
  expect(blockOfHour(21)).toBe("evening");
  expect(blockOfHour(22)).toBe("night");
  expect(blockOfHour(0)).toBe("night");
});
```

`packages/core/test/time.test.ts`:

```ts
import { expect, test } from "bun:test";
import { campusDate } from "../src/index.ts";

const NY = "America/New_York";

test("campus date uses campus time zone, not UTC", () => {
  // 03:30 UTC on Nov 1 is 23:30 on Oct 31 in New York (EDT, UTC-4)
  expect(campusDate(new Date("2026-11-01T03:30:00Z"), NY)).toBe("2026-10-31");
  expect(campusDate(new Date("2026-10-13T18:00:00Z"), NY)).toBe("2026-10-13");
});

test("campus date across the DST change", () => {
  // DST ends 2026-11-01 at 06:00 UTC. 05:30 UTC is 01:30 EDT, 06:30 UTC is 01:30 EST.
  expect(campusDate(new Date("2026-11-01T05:30:00Z"), NY)).toBe("2026-11-01");
  expect(campusDate(new Date("2026-11-01T06:30:00Z"), NY)).toBe("2026-11-01");
});
```

`packages/core/test/geo.test.ts`:

```ts
import { expect, test } from "bun:test";
import { fallbackWalkMinutes, haversineMeters } from "../src/index.ts";

test("haversine distance is roughly right", () => {
  // 0.001 degrees of latitude is about 111 meters
  const d = haversineMeters({ lat: 40.9, lng: -73.12 }, { lat: 40.901, lng: -73.12 });
  expect(d).toBeGreaterThan(110);
  expect(d).toBeLessThan(112);
});

test("fallback walk minutes: meters * 1.3 at 1.3 m/s, rounded up", () => {
  const a = { lat: 40.9, lng: -73.12 };
  const b = { lat: 40.901, lng: -73.12 };
  // about 111 m * 1.3 / 1.3 m/s = 111 s, rounds up to 2 minutes
  expect(fallbackWalkMinutes(a, b)).toBe(2);
  expect(fallbackWalkMinutes(a, a)).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/core`
Expected: FAIL, exports not found.

- [ ] **Step 3: Implement `enums.ts`**

```ts
import { z } from "zod";

export const ELIGIBILITY = [
  "all_students",
  "residents_building",
  "residents_quad",
  "grad_only",
  "department",
  "public",
] as const;
export const Eligibility = z.enum(ELIGIBILITY);
export type Eligibility = z.infer<typeof Eligibility>;

export const ENTRY_METHOD = ["open", "card_swipe", "staffed_desk"] as const;
export const EntryMethod = z.enum(ENTRY_METHOD);
export type EntryMethod = z.infer<typeof EntryMethod>;

export const SEAT_TYPE = ["table_chair", "carrel", "soft", "booth", "standing"] as const;
export const SeatType = z.enum(SEAT_TYPE);
export type SeatType = z.infer<typeof SeatType>;

export const TABLE_CONFIG = ["large_shared", "small_2_4", "individual"] as const;
export const TableConfig = z.enum(TABLE_CONFIG);
export type TableConfig = z.infer<typeof TableConfig>;

export const CELL_SIGNAL = ["poor", "ok", "good"] as const;
export const CellSignal = z.enum(CELL_SIGNAL);
export type CellSignal = z.infer<typeof CellSignal>;

export const NOISE_POLICY = ["silent", "quiet", "conversational", "group_friendly"] as const;
export const NoisePolicy = z.enum(NOISE_POLICY);
export type NoisePolicy = z.infer<typeof NoisePolicy>;

export const NOISE_BUCKET = ["silent", "quiet", "conversational", "loud"] as const;
export const NoiseBucket = z.enum(NOISE_BUCKET);
export type NoiseBucket = z.infer<typeof NoiseBucket>;

export const LIGHTING = ["dim", "moderate", "bright"] as const;
export const Lighting = z.enum(LIGHTING);
export type Lighting = z.infer<typeof Lighting>;

export const TEMPERATURE = ["cold", "neutral", "warm"] as const;
export const Temperature = z.enum(TEMPERATURE);
export type Temperature = z.infer<typeof Temperature>;

export const CALLS_OK = ["not_allowed", "allowed_impractical", "allowed"] as const;
export const CallsOk = z.enum(CALLS_OK);
export type CallsOk = z.infer<typeof CallsOk>;

export const FOOD_POLICY = ["none", "covered_drinks", "food_ok"] as const;
export const FoodPolicy = z.enum(FOOD_POLICY);
export type FoodPolicy = z.infer<typeof FoodPolicy>;

export const AMENITY = [
  "bathroom",
  "water",
  "coffee_food",
  "printer",
  "microwave",
  "late_food",
] as const;
export const Amenity = z.enum(AMENITY);
export type Amenity = z.infer<typeof Amenity>;

export const ATTRIBUTE_GROUP = [
  "identity",
  "access",
  "hours",
  "seating",
  "power",
  "environment",
  "use_fit",
  "amenities",
  "accessibility",
  "late_night",
] as const;
export const AttributeGroup = z.enum(ATTRIBUTE_GROUP);
export type AttributeGroup = z.infer<typeof AttributeGroup>;

export const VERIFICATION_SOURCE = ["survey", "official", "user"] as const;
export const VerificationSource = z.enum(VERIFICATION_SOURCE);
export type VerificationSource = z.infer<typeof VerificationSource>;

export const CONFIDENCE = ["measured", "estimated", "reported"] as const;
export const Confidence = z.enum(CONFIDENCE);
export type Confidence = z.infer<typeof Confidence>;

export const FULLNESS = ["empty", "some", "filling", "nearly_full", "full"] as const;
export const Fullness = z.enum(FULLNESS);
export type Fullness = z.infer<typeof Fullness>;

export const FULLNESS_RATIO: Readonly<Record<Fullness, number>> = {
  empty: 0.1,
  some: 0.35,
  filling: 0.6,
  nearly_full: 0.85,
  full: 1.0,
};

export const DAY_TYPE = ["weekday", "weekend"] as const;
export const DayType = z.enum(DAY_TYPE);
export type DayType = z.infer<typeof DayType>;

export const TIME_BLOCK = ["morning", "afternoon", "evening", "night"] as const;
export const TimeBlock = z.enum(TIME_BLOCK);
export type TimeBlock = z.infer<typeof TimeBlock>;

export const FORECAST_PROFILE = ["regular", "exam"] as const;
export const ForecastProfile = z.enum(FORECAST_PROFILE);
export type ForecastProfile = z.infer<typeof ForecastProfile>;

export const SLOT_CONFIDENCE = ["measured", "estimated", "none"] as const;
export const SlotConfidence = z.enum(SLOT_CONFIDENCE);
export type SlotConfidence = z.infer<typeof SlotConfidence>;

export const SURVEYOR_ROLE = ["surveyor", "admin"] as const;
export const SurveyorRole = z.enum(SURVEYOR_ROLE);
export type SurveyorRole = z.infer<typeof SurveyorRole>;

export const SPOT_STATUS = ["draft", "published", "archived"] as const;
export const SpotStatus = z.enum(SPOT_STATUS);
export type SpotStatus = z.infer<typeof SpotStatus>;

export const NOISE_SAMPLE_SOURCE = ["survey", "user"] as const;
export const NoiseSampleSource = z.enum(NOISE_SAMPLE_SOURCE);
export type NoiseSampleSource = z.infer<typeof NoiseSampleSource>;
```

- [ ] **Step 4: Implement `slots.ts`**

```ts
import type { DayType, TimeBlock } from "./enums.ts";

export const DAYS = 7;
export const HOURS = 24;
export const SLOTS = DAYS * HOURS;

/** Day of week: 0 = Monday ... 6 = Sunday, campus local time. */
export function slotIndex(dow: number, hour: number): number {
  if (!Number.isInteger(dow) || dow < 0 || dow >= DAYS) {
    throw new RangeError(`day_of_week out of range: ${dow}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour >= HOURS) {
    throw new RangeError(`hour out of range: ${hour}`);
  }
  return dow * HOURS + hour;
}

export function dayTypeOf(dow: number): DayType {
  return dow >= 5 ? "weekend" : "weekday";
}

export function blockOfHour(hour: number): TimeBlock {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
```

- [ ] **Step 5: Implement `time.ts`**

```ts
/** Calendar date (YYYY-MM-DD) of an instant in the campus time zone. */
export function campusDate(now: Date, tz: string): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
```

- [ ] **Step 6: Implement `geo.ts`**

```ts
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const ROUTE_FACTOR = 1.3;
const WALK_SPEED_MPS = 1.3;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Walking minutes when no footpath route exists: straight line times 1.3 at 1.3 m/s. */
export function fallbackWalkMinutes(a: LatLng, b: LatLng): number {
  const seconds = (haversineMeters(a, b) * ROUTE_FACTOR) / WALK_SPEED_MPS;
  return Math.ceil(seconds / 60);
}
```

- [ ] **Step 7: Export from `index.ts` and remove the smoke test**

```ts
export * from "./enums.ts";
export * from "./geo.ts";
export * from "./slots.ts";
export * from "./time.ts";
```

Delete `packages/core/test/smoke.test.ts`.

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `bun test packages/core && bun run typecheck && bun run lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): add enums, slot, time, and geo helpers"
```

---

### Task 3: Bundle schema and parser

**Files:**
- Create: `packages/core/src/bundle.ts`, `packages/core/test/fixtures/bundle-v1.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/bundle.test.ts`

**Interfaces:**
- Consumes: enums and `SLOTS` from Task 2.
- Produces:
  - `BUNDLE_SCHEMA_MAJOR = 1`, `DATA_LICENSE = "CC BY-SA 4.0"`, `DATA_ATTRIBUTION = "Perch surveyors"`
  - Zod schemas and types: `TimeOfDay`, `BundleBuilding`, `BundleSpot`, `BundleHours`, `BundleBusyness`, `BundleTerm`, `Bundle`, `BundlePointer`
  - `parseBundle(input: unknown): BundleParseResult` where
    `type BundleParseResult = { ok: true; bundle: Bundle } | { ok: false; reason: "schema_mismatch" | "invalid"; detail: string }`

- [ ] **Step 1: Write the fixture builder**

`packages/core/test/fixtures/bundle-v1.ts` (frozen shape of schema version 1; changing it means a schema change):

```ts
const SPOT_ID = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11";

export function makeBundleFixture(): Record<string, unknown> {
  return {
    schema_version: 1,
    generated_at: "2026-10-13T18:00:00.000Z",
    campus: { id: "sbu", name: "Stony Brook University", tz: "America/New_York" },
    term: {
      id: "2026-fall",
      name: "Fall 2026",
      starts: "2026-08-24",
      ends: "2026-12-19",
      exam_starts: "2026-12-10",
      exam_ends: "2026-12-18",
    },
    buildings: [
      { id: "melville-library", name: "Melville Library", lat: 40.9154, lng: -73.1222 },
      { id: "sac", name: "Student Activities Center", lat: 40.9145, lng: -73.1243 },
    ],
    walk: {
      building_ids: ["melville-library", "sac"],
      minutes: [
        [0, 4],
        [4, 0],
      ],
      estimated_pairs: [],
    },
    spots: [
      {
        id: SPOT_ID,
        slug: "central-reading-room",
        building_id: "melville-library",
        floor: "3",
        official_name: "Central Reading Room",
        common_name: null,
        lat: 40.9155,
        lng: -73.1221,
        directions: "Main entrance, stairs to floor 3, straight ahead.",
        eligibility: "all_students",
        eligibility_scope: null,
        eligibility_verified: true,
        entry_method: "open",
        reservable: false,
        reservation_system: null,
        reservation_url: null,
        seat_count: 120,
        seat_types: [{ type: "table_chair", count: 120 }],
        table_configs: ["large_shared"],
        effective_capacity: null,
        max_group_size: 1,
        spread_out_room: true,
        outlet_coverage_pct: 0.6,
        usb_outlets: false,
        wifi_mbps: null,
        cell_signal: "ok",
        noise_policy: "silent",
        natural_light: true,
        lighting: "bright",
        temperature: null,
        temperature_consistent: null,
        windows_view: true,
        calls_ok: "not_allowed",
        group_work_ok: false,
        whiteboard: false,
        food_policy: "covered_drinks",
        amenities: [{ amenity: "bathroom", walk_minutes: 1 }],
        step_free: true,
        elevator: true,
        accessible_seating: null,
        open_past_midnight: false,
        staffed_late: null,
        lit_route_to_residences: null,
        outdoor: false,
        seasonal: false,
        hours_unconfirmed: false,
        verified: { identity: "2026-10-05T15:00:00.000Z", hours: "2026-10-05T15:00:00.000Z" },
        photos: [
          { url: "https://example.org/p/1.jpg", taken_at: "2026-10-05T15:00:00.000Z", is_cover: true },
        ],
      },
    ],
    hours: [
      {
        spot_id: SPOT_ID,
        day_of_week: 0,
        opens: "08:00",
        closes: "02:00",
        last_entry: null,
        is_exam: false,
      },
    ],
    busyness: {
      [SPOT_ID]: {
        regular: Array.from({ length: 168 }, () => 0.35),
        exam: null,
        confidence: Array.from({ length: 168 }, () => "none"),
      },
    },
    data_license: "CC BY-SA 4.0",
    attribution: "Perch surveyors",
  };
}

export const FIXTURE_SPOT_ID = SPOT_ID;
```

- [ ] **Step 2: Write failing tests**

`packages/core/test/bundle.test.ts`:

```ts
import { expect, test } from "bun:test";
import { BundlePointer, TimeOfDay, parseBundle } from "../src/index.ts";
import { FIXTURE_SPOT_ID, makeBundleFixture } from "./fixtures/bundle-v1.ts";

test("schema version 1 fixture parses", () => {
  const result = parseBundle(makeBundleFixture());
  expect(result.ok).toBe(true);
});

test("hours past midnight and 24:00 are valid times", () => {
  expect(TimeOfDay.safeParse("02:00").success).toBe(true);
  expect(TimeOfDay.safeParse("24:00").success).toBe(true);
  expect(TimeOfDay.safeParse("23:59").success).toBe(true);
  expect(TimeOfDay.safeParse("24:30").success).toBe(false);
  expect(TimeOfDay.safeParse("8:00").success).toBe(false);
});

test("a different major version is a schema mismatch, not invalid", () => {
  const b = makeBundleFixture();
  b.schema_version = 2;
  const result = parseBundle(b);
  expect(result).toEqual({ ok: false, reason: "schema_mismatch", detail: "expected 1, got 2" });
});

test("non-object input is invalid", () => {
  expect(parseBundle(null).ok).toBe(false);
  expect(parseBundle("x").ok).toBe(false);
  const r = parseBundle({});
  expect(r.ok === false && r.reason).toBe("invalid");
});

test("forecast arrays must have 168 slots", () => {
  const b = makeBundleFixture();
  const busy = b.busyness as Record<string, { regular: number[] }>;
  const entry = busy[FIXTURE_SPOT_ID];
  if (!entry) throw new Error("fixture missing busyness");
  entry.regular = entry.regular.slice(0, 167);
  expect(parseBundle(b).ok).toBe(false);
});

test("walk matrix must be square and match buildings", () => {
  const b = makeBundleFixture();
  b.walk = { building_ids: ["melville-library", "sac"], minutes: [[0, 4]], estimated_pairs: [] };
  expect(parseBundle(b).ok).toBe(false);
});

test("every spot needs busyness and a known building", () => {
  const b = makeBundleFixture();
  b.busyness = {};
  expect(parseBundle(b).ok).toBe(false);

  const c = makeBundleFixture();
  const spots = c.spots as Array<Record<string, unknown>>;
  const first = spots[0];
  if (!first) throw new Error("fixture missing spot");
  first.building_id = "nowhere";
  expect(parseBundle(c).ok).toBe(false);
});

test("hours must reference a spot in the bundle", () => {
  const b = makeBundleFixture();
  b.hours = [
    {
      spot_id: "00000000-0000-4000-8000-000000000000",
      day_of_week: 0,
      opens: "08:00",
      closes: "17:00",
      last_entry: null,
      is_exam: false,
    },
  ];
  expect(parseBundle(b).ok).toBe(false);
});

test("pointer schema", () => {
  expect(
    BundlePointer.safeParse({
      schema_version: 1,
      hash: "a1b2c3d4e5f60718",
      url: "bundle.a1b2c3d4e5f60718.json",
      generated_at: "2026-10-13T18:00:00.000Z",
    }).success,
  ).toBe(true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test packages/core/test/bundle.test.ts`
Expected: FAIL, `parseBundle` not exported.

- [ ] **Step 4: Implement `bundle.ts`**

```ts
import { z } from "zod";
import {
  Amenity,
  AttributeGroup,
  CallsOk,
  CellSignal,
  Eligibility,
  EntryMethod,
  FoodPolicy,
  Lighting,
  NoisePolicy,
  SeatType,
  SlotConfidence,
  TableConfig,
  Temperature,
} from "./enums.ts";
import { SLOTS } from "./slots.ts";

export const BUNDLE_SCHEMA_MAJOR = 1;
export const DATA_LICENSE = "CC BY-SA 4.0";
export const DATA_ATTRIBUTION = "Perch surveyors";

const IsoDate = z.iso.date();
const IsoDateTime = z.iso.datetime();
const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const Ratio = z.number().min(0).max(1);

/** HH:MM in campus local time. "24:00" means midnight at the end of the day. */
export const TimeOfDay = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);

export const BundleBuilding = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: Lat,
  lng: Lng,
});
export type BundleBuilding = z.infer<typeof BundleBuilding>;

export const BundleSpot = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  building_id: z.string().min(1),
  floor: z.string().min(1),
  official_name: z.string().min(1),
  common_name: z.string().nullable(),
  lat: Lat,
  lng: Lng,
  directions: z.string().min(1),
  eligibility: Eligibility,
  eligibility_scope: z.string().nullable(),
  eligibility_verified: z.boolean(),
  entry_method: EntryMethod.nullable(),
  reservable: z.boolean(),
  reservation_system: z.string().nullable(),
  reservation_url: z.url().nullable(),
  seat_count: z.number().int().positive(),
  seat_types: z.array(z.object({ type: SeatType, count: z.number().int().nonnegative() })),
  table_configs: z.array(TableConfig),
  effective_capacity: z.number().int().positive().nullable(),
  max_group_size: z.number().int().positive().nullable(),
  spread_out_room: z.boolean().nullable(),
  outlet_coverage_pct: Ratio,
  usb_outlets: z.boolean().nullable(),
  wifi_mbps: z.number().nonnegative().nullable(),
  cell_signal: CellSignal.nullable(),
  noise_policy: NoisePolicy,
  natural_light: z.boolean().nullable(),
  lighting: Lighting.nullable(),
  temperature: Temperature.nullable(),
  temperature_consistent: z.boolean().nullable(),
  windows_view: z.boolean().nullable(),
  calls_ok: CallsOk.nullable(),
  group_work_ok: z.boolean(),
  whiteboard: z.boolean().nullable(),
  food_policy: FoodPolicy,
  amenities: z.array(z.object({ amenity: Amenity, walk_minutes: z.number().int().nonnegative() })),
  step_free: z.boolean().nullable(),
  elevator: z.boolean().nullable(),
  accessible_seating: z.boolean().nullable(),
  open_past_midnight: z.boolean().nullable(),
  staffed_late: z.boolean().nullable(),
  lit_route_to_residences: z.boolean().nullable(),
  outdoor: z.boolean(),
  seasonal: z.boolean(),
  hours_unconfirmed: z.boolean(),
  verified: z.partialRecord(AttributeGroup, IsoDateTime),
  photos: z.array(z.object({ url: z.url(), taken_at: IsoDateTime, is_cover: z.boolean() })),
});
export type BundleSpot = z.infer<typeof BundleSpot>;

export const BundleHours = z.object({
  spot_id: z.uuid(),
  day_of_week: z.number().int().min(0).max(6),
  opens: TimeOfDay,
  closes: TimeOfDay,
  last_entry: TimeOfDay.nullable(),
  is_exam: z.boolean(),
});
export type BundleHours = z.infer<typeof BundleHours>;

const SlotArray = z.array(Ratio).length(SLOTS);

export const BundleBusyness = z.object({
  regular: SlotArray,
  exam: SlotArray.nullable(),
  confidence: z.array(SlotConfidence).length(SLOTS),
});
export type BundleBusyness = z.infer<typeof BundleBusyness>;

export const BundleTerm = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  starts: IsoDate,
  ends: IsoDate,
  exam_starts: IsoDate.nullable(),
  exam_ends: IsoDate.nullable(),
});
export type BundleTerm = z.infer<typeof BundleTerm>;

export const Bundle = z
  .object({
    schema_version: z.literal(BUNDLE_SCHEMA_MAJOR),
    generated_at: IsoDateTime,
    campus: z.object({ id: z.string().min(1), name: z.string().min(1), tz: z.string().min(1) }),
    term: BundleTerm,
    buildings: z.array(BundleBuilding),
    walk: z.object({
      building_ids: z.array(z.string().min(1)),
      minutes: z.array(z.array(z.number().int().nonnegative())),
      estimated_pairs: z.array(z.tuple([z.number().int(), z.number().int()])),
    }),
    spots: z.array(BundleSpot),
    hours: z.array(BundleHours),
    busyness: z.record(z.string(), BundleBusyness),
    data_license: z.literal(DATA_LICENSE),
    attribution: z.string().min(1),
  })
  .superRefine((b, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: "custom", message });
    };
    const buildingIds = new Set(b.buildings.map((x) => x.id));
    const n = b.walk.building_ids.length;

    if (n !== buildingIds.size || !b.walk.building_ids.every((id) => buildingIds.has(id))) {
      issue("walk.building_ids must list every building exactly once");
    }
    if (b.walk.minutes.length !== n || b.walk.minutes.some((row) => row.length !== n)) {
      issue("walk.minutes must be a square matrix matching walk.building_ids");
    }
    for (const [i, j] of b.walk.estimated_pairs) {
      if (i < 0 || j < 0 || i >= n || j >= n) issue(`walk.estimated_pairs out of range: ${i},${j}`);
    }

    const spotIds = new Set<string>();
    const slugs = new Set<string>();
    for (const s of b.spots) {
      if (!buildingIds.has(s.building_id)) issue(`spot ${s.slug} has unknown building ${s.building_id}`);
      if (slugs.has(s.slug)) issue(`duplicate slug ${s.slug}`);
      slugs.add(s.slug);
      spotIds.add(s.id);
      if (!b.busyness[s.id]) issue(`spot ${s.slug} has no busyness entry`);
    }
    for (const id of Object.keys(b.busyness)) {
      if (!spotIds.has(id)) issue(`busyness entry for unknown spot ${id}`);
    }
    for (const h of b.hours) {
      if (!spotIds.has(h.spot_id)) issue(`hours for unknown spot ${h.spot_id}`);
    }
  });
export type Bundle = z.infer<typeof Bundle>;

export const BundlePointer = z.object({
  schema_version: z.number().int(),
  hash: z.string().regex(/^[a-f0-9]{16,64}$/),
  url: z.string().min(1),
  generated_at: IsoDateTime,
});
export type BundlePointer = z.infer<typeof BundlePointer>;

export type BundleParseResult =
  | { ok: true; bundle: Bundle }
  | { ok: false; reason: "schema_mismatch" | "invalid"; detail: string };

export function parseBundle(input: unknown): BundleParseResult {
  const version = z.object({ schema_version: z.number().int() }).safeParse(input);
  if (!version.success) {
    return { ok: false, reason: "invalid", detail: "missing schema_version" };
  }
  if (version.data.schema_version !== BUNDLE_SCHEMA_MAJOR) {
    return {
      ok: false,
      reason: "schema_mismatch",
      detail: `expected ${BUNDLE_SCHEMA_MAJOR}, got ${version.data.schema_version}`,
    };
  }
  const parsed = Bundle.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", detail: z.prettifyError(parsed.error) };
  }
  return { ok: true, bundle: parsed.data };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./bundle.ts";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/core && bun run typecheck && bun run lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add versioned campus bundle schema"
```

---

### Task 4: Database schema and first migration

**Files:**
- Create: `packages/db/drizzle.config.ts`, `packages/db/src/schema/enums.ts`, `packages/db/src/schema/campus.ts`, `packages/db/src/schema/spot.ts`, `packages/db/src/schema/survey.ts`, `packages/db/src/schema/observations.ts`, `packages/db/src/schema/ops.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/client.ts`, `packages/db/src/testing.ts`, `packages/db/scripts/migrate.ts`
- Create (generated): `packages/db/drizzle/0000_*.sql`, `packages/db/drizzle/meta/*`
- Modify: `packages/db/src/index.ts`
- Delete: `packages/db/test/smoke.test.ts`
- Test: `packages/db/test/schema.test.ts`

**Interfaces:**
- Consumes: enum value arrays from `@perch/core`.
- Produces:
  - Tables (TS names equal SQL names, snake_case): `campus`, `building`, `term`, `walk_matrix`, `spot`, `spot_seat_type`, `spot_table_config`, `spot_room`, `spot_hours`, `spot_amenity`, `spot_photo`, `spot_verification`, `spot_linked_building`, `surveyor`, `magic_link`, `auth_session`, `audit_log`, `write_receipt`, `route`, `route_spot`, `route_slot`, `headcount`, `noise_sample`, `forecast`, `spot_estimate`, `bundle_state`, `pick_ping`, `pick_daily`.
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>`; `createDb(url: string): Db`.
  - `createTestDb(): Promise<Db>` from `@perch/db/testing` (fresh in-memory PGlite with all migrations applied).
  - drizzle-zod schemas: `spotInsertSchema`, `spotSelectSchema`.

- [ ] **Step 1: Write the failing test**

`packages/db/test/schema.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  building,
  campus,
  spot,
  spot_hours,
  spot_photo,
  spotSelectSchema,
  term,
} from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

async function withSpot() {
  const db = await createTestDb();
  await db.insert(campus).values({ id: "sbu", name: "Stony Brook University", tz: "America/New_York" });
  await db.insert(term).values({
    id: "2026-fall",
    campus_id: "sbu",
    name: "Fall 2026",
    starts: "2026-08-24",
    ends: "2026-12-19",
  });
  await db
    .insert(building)
    .values({ id: "melville-library", campus_id: "sbu", name: "Melville Library", lat: 40.9154, lng: -73.1222 });

  const [row] = await db
    .insert(spot)
    .values({
      slug: "central-reading-room",
      building_id: "melville-library",
      floor: "3",
      official_name: "Central Reading Room",
      lat: 40.9155,
      lng: -73.1221,
      noise_policy: "silent",
    })
    .returning();
  if (!row) throw new Error("insert returned nothing");
  return { db, row };
}

test("migrations apply and enums enforce values", async () => {
  const { db, row } = await withSpot();
  expect(row.status).toBe("draft");
  expect(row.version).toBe(1);
  expect(row.eligibility_verified).toBe(false);
  expect(spotSelectSchema.safeParse(row).success).toBe(true);

  await expect(
    db.execute(sql`insert into spot (slug, building_id, floor, official_name, lat, lng, noise_policy)
      values ('x', 'melville-library', '1', 'X', 0, 0, 'loud')`),
  ).rejects.toThrow();
});

test("spot_hours accepts valid rows and rejects bad day or time", async () => {
  const { db, row } = await withSpot();
  const base = { spot_id: row.id, term_id: "2026-fall", opens: "08:00", closes: "02:00" };
  await db.insert(spot_hours).values({ ...base, day_of_week: 0 });
  await db.insert(spot_hours).values({ ...base, day_of_week: 1, closes: "24:00" });
  await expect(db.insert(spot_hours).values({ ...base, day_of_week: 7 })).rejects.toThrow();
  await expect(db.insert(spot_hours).values({ ...base, day_of_week: 2, opens: "8:00" })).rejects.toThrow();
});

test("a spot has at most one cover photo", async () => {
  const { db, row } = await withSpot();
  const photo = { spot_id: row.id, url: "https://example.org/a.jpg", r2_key: "a.jpg", taken_at: new Date() };
  await db.insert(spot_photo).values({ ...photo, is_cover: true });
  await db.insert(spot_photo).values({ ...photo, is_cover: false });
  await expect(db.insert(spot_photo).values({ ...photo, is_cover: true })).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/db`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `schema/enums.ts`**

```ts
import {
  CALLS_OK,
  CELL_SIGNAL,
  CONFIDENCE,
  DAY_TYPE,
  ELIGIBILITY,
  ENTRY_METHOD,
  FOOD_POLICY,
  FORECAST_PROFILE,
  FULLNESS,
  LIGHTING,
  NOISE_BUCKET,
  NOISE_POLICY,
  NOISE_SAMPLE_SOURCE,
  SEAT_TYPE,
  SPOT_STATUS,
  SURVEYOR_ROLE,
  TABLE_CONFIG,
  TEMPERATURE,
  TIME_BLOCK,
  AMENITY,
  ATTRIBUTE_GROUP,
  VERIFICATION_SOURCE,
} from "@perch/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const eligibility = pgEnum("eligibility", ELIGIBILITY);
export const entry_method = pgEnum("entry_method", ENTRY_METHOD);
export const seat_type = pgEnum("seat_type", SEAT_TYPE);
export const table_config = pgEnum("table_config", TABLE_CONFIG);
export const cell_signal = pgEnum("cell_signal", CELL_SIGNAL);
export const noise_policy = pgEnum("noise_policy", NOISE_POLICY);
export const noise_bucket = pgEnum("noise_bucket", NOISE_BUCKET);
export const lighting = pgEnum("lighting", LIGHTING);
export const temperature = pgEnum("temperature", TEMPERATURE);
export const calls_ok = pgEnum("calls_ok", CALLS_OK);
export const food_policy = pgEnum("food_policy", FOOD_POLICY);
export const amenity = pgEnum("amenity", AMENITY);
export const attribute_group = pgEnum("attribute_group", ATTRIBUTE_GROUP);
export const verification_source = pgEnum("verification_source", VERIFICATION_SOURCE);
export const confidence = pgEnum("confidence", CONFIDENCE);
export const fullness = pgEnum("fullness", FULLNESS);
export const day_type = pgEnum("day_type", DAY_TYPE);
export const time_block = pgEnum("time_block", TIME_BLOCK);
export const forecast_profile = pgEnum("forecast_profile", FORECAST_PROFILE);
export const surveyor_role = pgEnum("surveyor_role", SURVEYOR_ROLE);
export const spot_status = pgEnum("spot_status", SPOT_STATUS);
export const noise_sample_source = pgEnum("noise_sample_source", NOISE_SAMPLE_SOURCE);
```

Run `bun run fix` after writing files; Biome sorts imports.

- [ ] **Step 4: Write `schema/campus.ts`**

```ts
import { date, doublePrecision, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const campus = pgTable("campus", {
  id: text().primaryKey(),
  name: text().notNull(),
  tz: text().notNull(),
});

export const building = pgTable("building", {
  id: text().primaryKey(),
  campus_id: text()
    .notNull()
    .references(() => campus.id),
  name: text().notNull(),
  lat: doublePrecision().notNull(),
  lng: doublePrecision().notNull(),
});

export const term = pgTable("term", {
  id: text().primaryKey(),
  campus_id: text()
    .notNull()
    .references(() => campus.id),
  name: text().notNull(),
  starts: date().notNull(),
  ends: date().notNull(),
  exam_starts: date(),
  exam_ends: date(),
});

export const walk_matrix = pgTable(
  "walk_matrix",
  {
    from_building_id: text()
      .notNull()
      .references(() => building.id),
    to_building_id: text()
      .notNull()
      .references(() => building.id),
    minutes: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.from_building_id, t.to_building_id] })],
);
```

- [ ] **Step 5: Write `schema/spot.ts`**

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { building, term } from "./campus.ts";
import {
  amenity,
  attribute_group,
  calls_ok,
  cell_signal,
  confidence,
  eligibility,
  entry_method,
  food_policy,
  lighting,
  noise_policy,
  seat_type,
  spot_status,
  table_config,
  temperature,
  verification_source,
} from "./enums.ts";
import { surveyor } from "./survey.ts";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/**
 * v0-required fields beyond identity (directions, eligibility, seat_count,
 * outlet_coverage_pct, food_policy, group_work_ok) are nullable here so a
 * surveyor can save a draft section by section. Completeness is checked when
 * building the bundle.
 */
export const spot = pgTable(
  "spot",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    building_id: text()
      .notNull()
      .references(() => building.id),
    floor: text().notNull(),
    official_name: text().notNull(),
    common_name: text(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    directions: text(),
    status: spot_status().notNull().default("draft"),
    version: integer().notNull().default(1),
    eligibility: eligibility(),
    eligibility_scope: text(),
    eligibility_verified: boolean().notNull().default(false),
    entry_method: entry_method(),
    reservable: boolean().notNull().default(false),
    reservation_system: text(),
    reservation_url: text(),
    seat_count: integer(),
    effective_capacity: integer(),
    max_group_size: integer(),
    spread_out_room: boolean(),
    outlet_coverage_pct: real(),
    usb_outlets: boolean(),
    wifi_mbps: real(),
    cell_signal: cell_signal(),
    noise_policy: noise_policy().notNull(),
    natural_light: boolean(),
    lighting: lighting(),
    temperature: temperature(),
    temperature_consistent: boolean(),
    windows_view: boolean(),
    calls_ok: calls_ok(),
    group_work_ok: boolean(),
    whiteboard: boolean(),
    food_policy: food_policy(),
    step_free: boolean(),
    elevator: boolean(),
    accessible_seating: boolean(),
    open_past_midnight: boolean(),
    staffed_late: boolean(),
    lit_route_to_residences: boolean(),
    outdoor: boolean().notNull().default(false),
    seasonal: boolean().notNull().default(false),
    created_at: createdAt(),
    updated_at: createdAt(),
  },
  (t) => [
    check("spot_outlet_pct_range", sql`${t.outlet_coverage_pct} between 0 and 1`),
    check("spot_seat_count_positive", sql`${t.seat_count} > 0`),
  ],
);

export const spot_seat_type = pgTable(
  "spot_seat_type",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    type: seat_type().notNull(),
    count: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.type] })],
);

export const spot_table_config = pgTable(
  "spot_table_config",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    config: table_config().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.config] })],
);

export const spot_room = pgTable("spot_room", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id, { onDelete: "cascade" }),
  name: text().notNull(),
  capacity: integer(),
  reservable: boolean().notNull().default(false),
});

/** Times are "HH:MM" campus local. closes < opens means the spot closes after midnight. */
export const spot_hours = pgTable(
  "spot_hours",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    term_id: text()
      .notNull()
      .references(() => term.id),
    day_of_week: smallint().notNull(),
    opens: text().notNull(),
    closes: text().notNull(),
    last_entry: text(),
    is_exam: boolean().notNull().default(false),
  },
  (t) => [
    check("spot_hours_dow_range", sql`${t.day_of_week} between 0 and 6`),
    check("spot_hours_opens_format", sql`${t.opens} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'`),
    check("spot_hours_closes_format", sql`${t.closes} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'`),
  ],
);

export const spot_amenity = pgTable(
  "spot_amenity",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    amenity: amenity().notNull(),
    walk_minutes: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.amenity] })],
);

/** is_cover marks the postcard front photo; at most one per spot. */
export const spot_photo = pgTable(
  "spot_photo",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    url: text().notNull(),
    r2_key: text().notNull(),
    taken_at: timestamp({ withTimezone: true }).notNull(),
    is_cover: boolean().notNull().default(false),
    uploaded_by: uuid().references(() => surveyor.id),
    approved_by: uuid().references(() => surveyor.id),
    approved_at: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("spot_photo_one_cover").on(t.spot_id).where(sql`${t.is_cover}`)],
);

export const spot_verification = pgTable(
  "spot_verification",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    attribute_group: attribute_group().notNull(),
    last_verified_at: timestamp({ withTimezone: true }).notNull(),
    source: verification_source().notNull(),
    confidence: confidence().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.attribute_group] })],
);

export const spot_linked_building = pgTable(
  "spot_linked_building",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    building_id: text()
      .notNull()
      .references(() => building.id),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.building_id] })],
);
```

- [ ] **Step 6: Write `schema/survey.ts`**

```ts
import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { campus } from "./campus.ts";
import { surveyor_role } from "./enums.ts";
import { spot } from "./spot.ts";

const ts = () => timestamp({ withTimezone: true });

export const surveyor = pgTable("surveyor", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  display_name: text().notNull(),
  role: surveyor_role().notNull().default("surveyor"),
  invited_by: uuid().references((): AnyPgColumn => surveyor.id),
  active: boolean().notNull().default(true),
  created_at: ts().notNull().defaultNow(),
});

export const magic_link = pgTable("magic_link", {
  token_hash: text().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  expires_at: ts().notNull(),
  used_at: ts(),
});

export const auth_session = pgTable("auth_session", {
  id: text().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  created_at: ts().notNull().defaultNow(),
  expires_at: ts().notNull(),
});

export const audit_log = pgTable("audit_log", {
  id: uuid().primaryKey().defaultRandom(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  entity: text().notNull(),
  entity_id: text().notNull(),
  action: text().notNull(),
  before_json: jsonb(),
  after_json: jsonb(),
  at: ts().notNull().defaultNow(),
});

export const write_receipt = pgTable("write_receipt", {
  client_write_id: uuid().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  received_at: ts().notNull().defaultNow(),
});

export const route = pgTable("route", {
  id: uuid().primaryKey().defaultRandom(),
  campus_id: text()
    .notNull()
    .references(() => campus.id),
  name: text().notNull(),
});

export const route_spot = pgTable(
  "route_spot",
  {
    route_id: uuid()
      .notNull()
      .references(() => route.id, { onDelete: "cascade" }),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.route_id, t.position] })],
);

export const route_slot = pgTable("route_slot", {
  id: uuid().primaryKey().defaultRandom(),
  route_id: uuid()
    .notNull()
    .references(() => route.id, { onDelete: "cascade" }),
  starts_at: ts().notNull(),
  claimed_by: uuid().references(() => surveyor.id),
  completed_at: ts(),
});
```

`spot.ts` imports `surveyor` from `survey.ts` and `survey.ts` imports `spot` from `spot.ts`. ES modules handle this cycle because both references are inside callbacks (`() => surveyor.id`), evaluated after both modules load.

- [ ] **Step 7: Write `schema/observations.ts`**

```ts
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  day_type,
  forecast_profile,
  fullness,
  noise_bucket,
  noise_sample_source,
  time_block,
} from "./enums.ts";
import { spot } from "./spot.ts";
import { surveyor } from "./survey.ts";

const ts = () => timestamp({ withTimezone: true });

export const headcount = pgTable("headcount", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id),
  observed_at: ts().notNull(),
  count: integer().notNull(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
});

export const noise_sample = pgTable("noise_sample", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id),
  observed_at: ts().notNull(),
  bucket: noise_bucket().notNull(),
  source: noise_sample_source().notNull(),
});

/** Fitted occupancy ratio per slot. Written by the forecast fitter (scoring plan). */
export const forecast = pgTable(
  "forecast",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    profile: forecast_profile().notNull(),
    day_of_week: smallint().notNull(),
    hour: smallint().notNull(),
    ratio: real().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spot_id, t.profile, t.day_of_week, t.hour] }),
    check("forecast_dow_range", sql`${t.day_of_week} between 0 and 6`),
    check("forecast_hour_range", sql`${t.hour} between 0 and 23`),
    check("forecast_ratio_range", sql`${t.ratio} between 0 and 1`),
  ],
);

/** Surveyor busyness estimate per day type and time block. Latest row per cell wins. */
export const spot_estimate = pgTable("spot_estimate", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id, { onDelete: "cascade" }),
  day_type: day_type().notNull(),
  block: time_block().notNull(),
  bucket: fullness().notNull(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  created_at: ts().notNull().defaultNow(),
});
```

- [ ] **Step 8: Write `schema/ops.ts` and `schema/index.ts`**

`schema/ops.ts`:

```ts
import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { campus } from "./campus.ts";
import { spot } from "./spot.ts";

const ts = () => timestamp({ withTimezone: true });

export const bundle_state = pgTable("bundle_state", {
  campus_id: text()
    .primaryKey()
    .references(() => campus.id),
  dirty: boolean().notNull().default(false),
  last_published_at: ts(),
  last_hash: text(),
  last_deploy_hook_at: ts(),
});

/** Anonymous pick event: spot, day, hour only. No device or IP. Rolled up nightly then deleted. */
export const pick_ping = pgTable("pick_ping", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id, { onDelete: "cascade" }),
  day: date().notNull(),
  hour_bucket: smallint().notNull(),
});

export const pick_daily = pgTable(
  "pick_daily",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    day: date().notNull(),
    count: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.day] })],
);
```

`schema/index.ts`:

```ts
export * from "./campus.ts";
export * from "./enums.ts";
export * from "./observations.ts";
export * from "./ops.ts";
export * from "./spot.ts";
export * from "./survey.ts";
```

- [ ] **Step 9: Write `client.ts`, `testing.ts`, `index.ts`, drizzle config**

`src/client.ts`:

```ts
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export type Schema = typeof schema;

/** Any Drizzle Postgres database over our schema (postgres.js in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export function createDb(url: string): Db {
  return drizzle(postgres(url), { schema });
}

export const spotSelectSchema = createSelectSchema(schema.spot);
export const spotInsertSchema = createInsertSchema(schema.spot);
```

`src/testing.ts`:

```ts
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";
import * as schema from "./schema/index.ts";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Fresh in-memory Postgres (PGlite) with every migration applied. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}
```

`src/index.ts`:

```ts
export * from "./client.ts";
export * from "./schema/index.ts";
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
});
```

`scripts/migrate.ts`:

```ts
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
await sql.end();
console.log("migrations applied");
```

- [ ] **Step 10: Generate the first migration**

Run: `bun run db:generate`
Expected: `drizzle/0000_<name>.sql` created with `CREATE TYPE` for each enum and `CREATE TABLE` for all 28 tables. Open the SQL and confirm the `spot_hours` check constraints and the `noise_policy` enum are present.

- [ ] **Step 11: Run tests to verify they pass**

Run: `bun test packages/db && bun run typecheck && bun run lint`
Expected: PASS. If `PgDatabase` assignability fails for the PGlite instance in `testing.ts`, the fix is in `Db` typing, not a cast: confirm both drivers are from the same `drizzle-orm` version (`bun pm ls drizzle-orm` shows one copy).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(db): add v0 drizzle schema and first migration"
```

---

### Task 5: Sample seed data

**Files:**
- Create: `packages/db/src/seed/data.ts`, `packages/db/src/seed/seed.ts`, `packages/db/scripts/seed.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/seed.test.ts`

**Interfaces:**
- Consumes: tables from Task 4, `createTestDb`.
- Produces: `seed(db: Db): Promise<SeedIds>` where `type SeedIds = { adminId: string; spotIds: Record<SeedSpotSlug, string> }` and `type SeedSpotSlug = "central-reading-room" | "north-reading-room" | "sac-lounge" | "kelly-rcc" | "union-draft"`.

Seed contents (all SAMPLE, not surveyed; coordinates approximate):
- Campus `sbu` (`America/New_York`).
- Terms: `2026-fall` (2026-08-24 to 2026-12-19, exams 2026-12-10 to 2026-12-18), `2027-spring` (2027-01-25 to 2027-05-21, exams 2027-05-13 to 2027-05-20).
- Buildings: `melville-library`, `sac`, `student-union`, `kelly-quad`, with a full symmetric walk matrix.
- Spots:
  1. `central-reading-room`: published, silent, all students, verified, fall hours, two photos (one approved, one not), a few regular forecast rows, a weekday afternoon estimate.
  2. `north-reading-room`: published, quiet, fall hours.
  3. `sac-lounge`: published, group friendly, food ok, fall hours.
  4. `kelly-rcc`: published, `residents_quad` scope "Kelly Quad", `eligibility_verified: false`, fall hours.
  5. `union-draft`: draft, incomplete.
- One admin surveyor `seed-admin@example.invalid`.

- [ ] **Step 1: Write the failing test**

`packages/db/test/seed.test.ts`:

```ts
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { building, spot, spot_hours, walk_matrix } from "../src/index.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

test("seed inserts sample campus data", async () => {
  const db = await createTestDb();
  const ids = await seed(db);

  expect(await db.select().from(building)).toHaveLength(4);
  expect(await db.select().from(walk_matrix)).toHaveLength(16);
  expect(await db.select().from(spot)).toHaveLength(5);

  const [draft] = await db.select().from(spot).where(eq(spot.id, ids.spotIds["union-draft"]));
  expect(draft?.status).toBe("draft");

  const hours = await db
    .select()
    .from(spot_hours)
    .where(eq(spot_hours.spot_id, ids.spotIds["central-reading-room"]));
  expect(hours).toHaveLength(7);
});

test("seed is rejected on a non-empty database", async () => {
  const db = await createTestDb();
  await seed(db);
  await expect(seed(db)).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/db/test/seed.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `seed/data.ts`**

```ts
/**
 * SAMPLE DATA for development and tests. Not surveyed. Coordinates, hours,
 * and attributes are approximate placeholders, not facts about these spaces.
 */
export const SEED_CAMPUS = { id: "sbu", name: "Stony Brook University", tz: "America/New_York" };

export const SEED_TERMS = [
  {
    id: "2026-fall",
    campus_id: "sbu",
    name: "Fall 2026",
    starts: "2026-08-24",
    ends: "2026-12-19",
    exam_starts: "2026-12-10",
    exam_ends: "2026-12-18",
  },
  {
    id: "2027-spring",
    campus_id: "sbu",
    name: "Spring 2027",
    starts: "2027-01-25",
    ends: "2027-05-21",
    exam_starts: "2027-05-13",
    exam_ends: "2027-05-20",
  },
];

export const SEED_BUILDINGS = [
  { id: "melville-library", campus_id: "sbu", name: "Melville Library", lat: 40.9154, lng: -73.1222 },
  { id: "sac", campus_id: "sbu", name: "Student Activities Center", lat: 40.9145, lng: -73.1243 },
  { id: "student-union", campus_id: "sbu", name: "Student Union", lat: 40.917, lng: -73.1219 },
  { id: "kelly-quad", campus_id: "sbu", name: "Kelly Quad", lat: 40.9104, lng: -73.127 },
];

/** Symmetric walking minutes between seed buildings, in SEED_BUILDINGS order. */
export const SEED_WALK: number[][] = [
  [0, 4, 3, 9],
  [4, 0, 6, 7],
  [3, 6, 0, 11],
  [9, 7, 11, 0],
];

export const SEED_ADMIN = {
  email: "seed-admin@example.invalid",
  display_name: "Seed Admin",
  role: "admin" as const,
};
```

- [ ] **Step 4: Write `seed/seed.ts`**

```ts
import type { Db } from "../client.ts";
import {
  building,
  campus,
  forecast,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  surveyor,
  term,
  walk_matrix,
} from "../schema/index.ts";
import { SEED_ADMIN, SEED_BUILDINGS, SEED_CAMPUS, SEED_TERMS, SEED_WALK } from "./data.ts";

export type SeedSpotSlug =
  | "central-reading-room"
  | "north-reading-room"
  | "sac-lounge"
  | "kelly-rcc"
  | "union-draft";

export type SeedIds = { adminId: string; spotIds: Record<SeedSpotSlug, string> };

const VERIFIED_AT = new Date("2026-10-05T15:00:00Z");
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function weekHours(spotId: string, opens: string, closes: string) {
  return ALL_DAYS.map((day_of_week) => ({
    spot_id: spotId,
    term_id: "2026-fall",
    day_of_week,
    opens,
    closes,
    is_exam: false,
  }));
}

/** Inserts SAMPLE data. Throws if the campus already exists. */
export async function seed(db: Db): Promise<SeedIds> {
  return db.transaction(async (tx) => {
    await tx.insert(campus).values(SEED_CAMPUS);
    await tx.insert(term).values(SEED_TERMS);
    await tx.insert(building).values(SEED_BUILDINGS);
    await tx.insert(walk_matrix).values(
      SEED_BUILDINGS.flatMap((from, i) =>
        SEED_BUILDINGS.map((to, j) => ({
          from_building_id: from.id,
          to_building_id: to.id,
          minutes: SEED_WALK[i]?.[j] ?? 0,
        })),
      ),
    );

    const [admin] = await tx.insert(surveyor).values(SEED_ADMIN).returning({ id: surveyor.id });
    if (!admin) throw new Error("failed to insert seed admin");

    const inserted = await tx
      .insert(spot)
      .values([
        {
          slug: "central-reading-room",
          building_id: "melville-library",
          floor: "3",
          official_name: "Central Reading Room",
          lat: 40.9155,
          lng: -73.1221,
          directions: "SAMPLE: main entrance, stairs to floor 3, straight ahead.",
          status: "published",
          eligibility: "all_students",
          eligibility_verified: true,
          entry_method: "open",
          seat_count: 120,
          max_group_size: 1,
          spread_out_room: true,
          outlet_coverage_pct: 0.6,
          noise_policy: "silent",
          natural_light: true,
          lighting: "bright",
          calls_ok: "not_allowed",
          group_work_ok: false,
          food_policy: "covered_drinks",
          step_free: true,
          elevator: true,
          open_past_midnight: false,
        },
        {
          slug: "north-reading-room",
          building_id: "melville-library",
          floor: "1",
          official_name: "North Reading Room",
          lat: 40.9158,
          lng: -73.1222,
          directions: "SAMPLE: main entrance, turn left past the circulation desk.",
          status: "published",
          eligibility: "all_students",
          eligibility_verified: true,
          entry_method: "open",
          seat_count: 60,
          max_group_size: 4,
          outlet_coverage_pct: 0.4,
          noise_policy: "quiet",
          group_work_ok: false,
          food_policy: "covered_drinks",
        },
        {
          slug: "sac-lounge",
          building_id: "sac",
          floor: "2",
          official_name: "SAC Second Floor Lounge",
          lat: 40.9146,
          lng: -73.1242,
          directions: "SAMPLE: main stairs to floor 2, lounge on the right.",
          status: "published",
          eligibility: "all_students",
          eligibility_verified: true,
          entry_method: "open",
          seat_count: 40,
          max_group_size: 8,
          outlet_coverage_pct: 0.3,
          noise_policy: "group_friendly",
          calls_ok: "allowed",
          group_work_ok: true,
          whiteboard: false,
          food_policy: "food_ok",
        },
        {
          slug: "kelly-rcc",
          building_id: "kelly-quad",
          floor: "1",
          official_name: "Kelly Quad RCC",
          lat: 40.9105,
          lng: -73.1269,
          directions: "SAMPLE: ground floor, card swipe door by the mailroom.",
          status: "published",
          eligibility: "residents_quad",
          eligibility_scope: "Kelly Quad",
          eligibility_verified: false,
          entry_method: "card_swipe",
          seat_count: 24,
          max_group_size: 2,
          outlet_coverage_pct: 1,
          noise_policy: "quiet",
          group_work_ok: false,
          food_policy: "none",
        },
        {
          slug: "union-draft",
          building_id: "student-union",
          floor: "1",
          official_name: "Union Lobby Tables",
          lat: 40.9171,
          lng: -73.1218,
          noise_policy: "conversational",
        },
      ])
      .returning({ id: spot.id, slug: spot.slug });

    const idOf = (slug: SeedSpotSlug): string => {
      const found = inserted.find((s) => s.slug === slug);
      if (!found) throw new Error(`seed spot missing: ${slug}`);
      return found.id;
    };
    const spotIds: Record<SeedSpotSlug, string> = {
      "central-reading-room": idOf("central-reading-room"),
      "north-reading-room": idOf("north-reading-room"),
      "sac-lounge": idOf("sac-lounge"),
      "kelly-rcc": idOf("kelly-rcc"),
      "union-draft": idOf("union-draft"),
    };
    const crr = spotIds["central-reading-room"];

    await tx.insert(spot_hours).values([
      ...weekHours(crr, "08:00", "02:00"),
      ...weekHours(spotIds["north-reading-room"], "08:00", "22:00"),
      ...weekHours(spotIds["sac-lounge"], "07:00", "24:00"),
      ...weekHours(spotIds["kelly-rcc"], "00:00", "24:00"),
    ]);

    await tx.insert(spot_seat_type).values({ spot_id: crr, type: "table_chair", count: 120 });
    await tx.insert(spot_table_config).values({ spot_id: crr, config: "large_shared" });
    await tx.insert(spot_amenity).values({ spot_id: crr, amenity: "bathroom", walk_minutes: 1 });

    await tx.insert(spot_verification).values([
      { spot_id: crr, attribute_group: "identity", last_verified_at: VERIFIED_AT, source: "survey", confidence: "measured" },
      { spot_id: crr, attribute_group: "hours", last_verified_at: VERIFIED_AT, source: "official", confidence: "measured" },
    ]);

    await tx.insert(spot_photo).values([
      {
        spot_id: crr,
        url: "https://example.org/sample/crr-1.jpg",
        r2_key: "sample/crr-1.jpg",
        taken_at: VERIFIED_AT,
        is_cover: true,
        uploaded_by: admin.id,
        approved_by: admin.id,
        approved_at: VERIFIED_AT,
      },
      {
        spot_id: crr,
        url: "https://example.org/sample/crr-2-unapproved.jpg",
        r2_key: "sample/crr-2-unapproved.jpg",
        taken_at: VERIFIED_AT,
        uploaded_by: admin.id,
      },
    ]);

    // Tuesday (dow 1) 14:00 and 15:00 measured; everything else falls back.
    await tx.insert(forecast).values([
      { spot_id: crr, profile: "regular", day_of_week: 1, hour: 14, ratio: 0.7 },
      { spot_id: crr, profile: "regular", day_of_week: 1, hour: 15, ratio: 0.75 },
    ]);
    await tx.insert(spot_estimate).values({
      spot_id: crr,
      day_type: "weekday",
      block: "afternoon",
      bucket: "filling",
      surveyor_id: admin.id,
    });

    return { adminId: admin.id, spotIds };
  });
}
```

`scripts/seed.ts`:

```ts
import { createDb } from "../src/client.ts";
import { seed } from "../src/seed/seed.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const ids = await seed(createDb(url));
console.log(`seeded ${Object.keys(ids.spotIds).length} sample spots`);
process.exit(0);
```

Add to `src/index.ts`:

```ts
export * from "./seed/seed.ts";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/db && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add sample seed data"
```

---

### Task 6: Bundle assembly helpers (pure)

**Files:**
- Create: `packages/db/src/bundle/term.ts`, `packages/db/src/bundle/walk.ts`, `packages/db/src/bundle/busyness.ts`, `packages/db/src/bundle/spot.ts`
- Test: `packages/db/test/term.test.ts`, `packages/db/test/walk.test.ts`, `packages/db/test/busyness.test.ts`, `packages/db/test/spot.test.ts`

**Interfaces:**
- Consumes: `slotIndex`, `SLOTS`, `dayTypeOf`, `blockOfHour`, `FULLNESS_RATIO`, `fallbackWalkMinutes`, `BundleSpot`, `BundleBusyness`, `BundleTerm` from core; row types from db schema (`typeof spot.$inferSelect` and so on).
- Produces:
  - `pickTerm(terms: TermRow[], today: string): TermRow | null`. Term containing `today` (inclusive), else the earliest term starting after `today`, else `null`.
  - `assembleWalk(buildings: BuildingRow[], pairs: WalkRow[]): { building_ids: string[]; minutes: number[][]; estimated_pairs: [number, number][] }`. Buildings sorted by id.
  - `NO_DATA_RATIO = 0.35`
  - `assembleBusyness(forecasts: ForecastRow[], estimates: EstimateRow[]): BundleBusyness` for one spot.
  - `toBundleSpot(input: SpotAssemblyInput): { ok: true; spot: BundleSpot } | { ok: false; missing: string[] }`, where `SpotAssemblyInput = { row: SpotRow; seatTypes: SeatTypeRow[]; tableConfigs: TableConfigRow[]; amenities: AmenityRow[]; verifications: VerificationRow[]; approvedPhotos: PhotoRow[]; hoursUnconfirmed: boolean }`.

- [ ] **Step 1: Write failing tests**

`packages/db/test/term.test.ts`:

```ts
import { expect, test } from "bun:test";
import { pickTerm } from "../src/bundle/term.ts";

const t = (id: string, starts: string, ends: string) => ({
  id,
  campus_id: "sbu",
  name: id,
  starts,
  ends,
  exam_starts: null,
  exam_ends: null,
});
const terms = [t("fall", "2026-08-24", "2026-12-19"), t("spring", "2027-01-25", "2027-05-21")];

test("picks the term containing today, inclusive", () => {
  expect(pickTerm(terms, "2026-10-13")?.id).toBe("fall");
  expect(pickTerm(terms, "2026-08-24")?.id).toBe("fall");
  expect(pickTerm(terms, "2026-12-19")?.id).toBe("fall");
});

test("between terms picks the next upcoming term", () => {
  expect(pickTerm(terms, "2027-01-02")?.id).toBe("spring");
});

test("after the last term returns null", () => {
  expect(pickTerm(terms, "2027-06-01")).toBeNull();
});
```

`packages/db/test/walk.test.ts`:

```ts
import { expect, test } from "bun:test";
import { assembleWalk } from "../src/bundle/walk.ts";

const b = (id: string, lat: number) => ({ id, campus_id: "sbu", name: id, lat, lng: -73.12 });

test("builds a sorted square matrix with zero diagonal", () => {
  const walk = assembleWalk(
    [b("sac", 40.901), b("lib", 40.9)],
    [
      { from_building_id: "lib", to_building_id: "sac", minutes: 4 },
      { from_building_id: "sac", to_building_id: "lib", minutes: 5 },
    ],
  );
  expect(walk.building_ids).toEqual(["lib", "sac"]);
  expect(walk.minutes).toEqual([
    [0, 4],
    [5, 0],
  ]);
  expect(walk.estimated_pairs).toEqual([]);
});

test("missing pairs fall back to straight-line time and are flagged", () => {
  const walk = assembleWalk([b("lib", 40.9), b("sac", 40.901)], []);
  // about 111 m, fallback rounds up to 2 minutes
  expect(walk.minutes).toEqual([
    [0, 2],
    [2, 0],
  ]);
  expect(walk.estimated_pairs).toEqual([
    [0, 1],
    [1, 0],
  ]);
});
```

`packages/db/test/busyness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { slotIndex } from "@perch/core";
import { NO_DATA_RATIO, assembleBusyness } from "../src/bundle/busyness.ts";

const SPOT = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11";

test("measured forecast beats estimate beats no data", () => {
  const b = assembleBusyness(
    [{ spot_id: SPOT, profile: "regular", day_of_week: 1, hour: 14, ratio: 0.7 }],
    [
      {
        id: "e1",
        spot_id: SPOT,
        day_type: "weekday",
        block: "afternoon",
        bucket: "filling",
        surveyor_id: "s",
        created_at: new Date("2026-10-01T00:00:00Z"),
      },
    ],
  );
  expect(b.regular[slotIndex(1, 14)]).toBe(0.7);
  expect(b.confidence[slotIndex(1, 14)]).toBe("measured");
  expect(b.regular[slotIndex(1, 15)]).toBe(0.6);
  expect(b.confidence[slotIndex(1, 15)]).toBe("estimated");
  expect(b.regular[slotIndex(1, 3)]).toBe(NO_DATA_RATIO);
  expect(b.confidence[slotIndex(1, 3)]).toBe("none");
  expect(b.regular[slotIndex(5, 14)]).toBe(NO_DATA_RATIO);
  expect(b.exam).toBeNull();
});

test("latest estimate per cell wins", () => {
  const b = assembleBusyness(
    [],
    [
      {
        id: "old",
        spot_id: SPOT,
        day_type: "weekend",
        block: "evening",
        bucket: "full",
        surveyor_id: "s",
        created_at: new Date("2026-10-01T00:00:00Z"),
      },
      {
        id: "new",
        spot_id: SPOT,
        day_type: "weekend",
        block: "evening",
        bucket: "empty",
        surveyor_id: "s",
        created_at: new Date("2026-10-02T00:00:00Z"),
      },
    ],
  );
  expect(b.regular[slotIndex(6, 19)]).toBe(0.1);
});

test("exam profile is filled from regular where exam slots are missing", () => {
  const b = assembleBusyness(
    [
      { spot_id: SPOT, profile: "regular", day_of_week: 0, hour: 10, ratio: 0.5 },
      { spot_id: SPOT, profile: "exam", day_of_week: 0, hour: 11, ratio: 0.9 },
    ],
    [],
  );
  expect(b.exam?.[slotIndex(0, 11)]).toBe(0.9);
  expect(b.exam?.[slotIndex(0, 10)]).toBe(0.5);
  expect(b.exam).toHaveLength(168);
});
```

`packages/db/test/spot.test.ts`:

```ts
import { expect, test } from "bun:test";
import { BundleSpot } from "@perch/core";
import { toBundleSpot } from "../src/bundle/spot.ts";
import type { SpotRow } from "../src/bundle/spot.ts";

const base: SpotRow = {
  id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
  slug: "crr",
  building_id: "lib",
  floor: "3",
  official_name: "Central Reading Room",
  common_name: null,
  lat: 40.9,
  lng: -73.12,
  directions: "Floor 3.",
  status: "published",
  version: 1,
  eligibility: "all_students",
  eligibility_scope: null,
  eligibility_verified: true,
  entry_method: null,
  reservable: false,
  reservation_system: null,
  reservation_url: null,
  seat_count: 100,
  effective_capacity: null,
  max_group_size: null,
  spread_out_room: null,
  outlet_coverage_pct: 0.5,
  usb_outlets: null,
  wifi_mbps: null,
  cell_signal: null,
  noise_policy: "silent",
  natural_light: null,
  lighting: null,
  temperature: null,
  temperature_consistent: null,
  windows_view: null,
  calls_ok: null,
  group_work_ok: false,
  whiteboard: null,
  food_policy: "none",
  step_free: null,
  elevator: null,
  accessible_seating: null,
  open_past_midnight: null,
  staffed_late: null,
  lit_route_to_residences: null,
  outdoor: false,
  seasonal: false,
  created_at: new Date("2026-10-01T00:00:00Z"),
  updated_at: new Date("2026-10-01T00:00:00Z"),
};

const empty = {
  seatTypes: [],
  tableConfigs: [],
  amenities: [],
  verifications: [],
  approvedPhotos: [],
  hoursUnconfirmed: false,
};

test("complete spot maps to a valid bundle spot", () => {
  const r = toBundleSpot({ row: base, ...empty });
  expect(r.ok).toBe(true);
  if (r.ok) expect(BundleSpot.safeParse(r.spot).success).toBe(true);
});

test("missing v0-required fields are reported, not thrown", () => {
  const r = toBundleSpot({
    row: { ...base, directions: null, seat_count: null, food_policy: null },
    ...empty,
  });
  expect(r).toEqual({ ok: false, missing: ["directions", "seat_count", "food_policy"] });
});

test("verification dates and photos are included, cover first", () => {
  const at = new Date("2026-10-05T15:00:00Z");
  const r = toBundleSpot({
    row: base,
    ...empty,
    verifications: [
      { spot_id: base.id, attribute_group: "hours", last_verified_at: at, source: "official", confidence: "measured" },
    ],
    approvedPhotos: [
      {
        id: "p1",
        spot_id: base.id,
        url: "https://example.org/a.jpg",
        r2_key: "a.jpg",
        taken_at: at,
        is_cover: false,
        uploaded_by: null,
        approved_by: "s",
        approved_at: at,
      },
      {
        id: "p2",
        spot_id: base.id,
        url: "https://example.org/cover.jpg",
        r2_key: "cover.jpg",
        taken_at: at,
        is_cover: true,
        uploaded_by: null,
        approved_by: "s",
        approved_at: at,
      },
    ],
  });
  if (!r.ok) throw new Error("expected ok");
  expect(r.spot.verified).toEqual({ hours: "2026-10-05T15:00:00.000Z" });
  expect(r.spot.photos.map((p) => p.url)).toEqual([
    "https://example.org/cover.jpg",
    "https://example.org/a.jpg",
  ]);
  expect(r.spot.photos[0]?.is_cover).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/db`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `bundle/term.ts`**

```ts
import type { term } from "../schema/index.ts";

export type TermRow = typeof term.$inferSelect;

/** Term containing today (inclusive), else the next term to start, else null. Dates are YYYY-MM-DD. */
export function pickTerm(terms: TermRow[], today: string): TermRow | null {
  const current = terms.find((t) => t.starts <= today && today <= t.ends);
  if (current) return current;
  const upcoming = terms
    .filter((t) => t.starts > today)
    .sort((a, b) => (a.starts < b.starts ? -1 : 1));
  return upcoming[0] ?? null;
}
```

- [ ] **Step 4: Implement `bundle/walk.ts`**

```ts
import { fallbackWalkMinutes } from "@perch/core";
import type { building, walk_matrix } from "../schema/index.ts";

export type BuildingRow = typeof building.$inferSelect;
export type WalkRow = typeof walk_matrix.$inferSelect;

export type AssembledWalk = {
  building_ids: string[];
  minutes: number[][];
  estimated_pairs: [number, number][];
};

export function assembleWalk(buildings: BuildingRow[], pairs: WalkRow[]): AssembledWalk {
  const sorted = [...buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const known = new Map(pairs.map((p) => [`${p.from_building_id}|${p.to_building_id}`, p.minutes]));
  const estimated_pairs: [number, number][] = [];

  const minutes = sorted.map((from, i) =>
    sorted.map((to, j) => {
      if (i === j) return 0;
      const m = known.get(`${from.id}|${to.id}`);
      if (m !== undefined) return m;
      estimated_pairs.push([i, j]);
      return fallbackWalkMinutes(from, to);
    }),
  );

  return { building_ids: sorted.map((b) => b.id), minutes, estimated_pairs };
}
```

- [ ] **Step 5: Implement `bundle/busyness.ts`**

```ts
import {
  type BundleBusyness,
  FULLNESS_RATIO,
  SLOTS,
  type SlotConfidence,
  blockOfHour,
  dayTypeOf,
  slotIndex,
} from "@perch/core";
import type { forecast, spot_estimate } from "../schema/index.ts";

export type ForecastRow = typeof forecast.$inferSelect;
export type EstimateRow = typeof spot_estimate.$inferSelect;

/**
 * Ratio used for slots with no measurement and no estimate. The scoring plan
 * replaces this with the fitted campus profile.
 */
export const NO_DATA_RATIO = 0.35;

/** Busyness for one spot. Forecast rows beat surveyor estimates, which beat no data. */
export function assembleBusyness(forecasts: ForecastRow[], estimates: EstimateRow[]): BundleBusyness {
  const latest = new Map<string, EstimateRow>();
  for (const e of estimates) {
    const key = `${e.day_type}|${e.block}`;
    const prev = latest.get(key);
    if (!prev || e.created_at > prev.created_at) latest.set(key, e);
  }

  const regular: number[] = new Array<number>(SLOTS);
  const confidence: SlotConfidence[] = new Array<SlotConfidence>(SLOTS);
  const measured = new Map<number, number>();
  const exam = new Map<number, number>();
  for (const f of forecasts) {
    const target = f.profile === "regular" ? measured : exam;
    target.set(slotIndex(f.day_of_week, f.hour), f.ratio);
  }

  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const i = slotIndex(dow, hour);
      const m = measured.get(i);
      if (m !== undefined) {
        regular[i] = m;
        confidence[i] = "measured";
        continue;
      }
      const est = latest.get(`${dayTypeOf(dow)}|${blockOfHour(hour)}`);
      if (est) {
        regular[i] = FULLNESS_RATIO[est.bucket];
        confidence[i] = "estimated";
        continue;
      }
      regular[i] = NO_DATA_RATIO;
      confidence[i] = "none";
    }
  }

  const examArray = exam.size === 0 ? null : regular.map((r, i) => exam.get(i) ?? r);
  return { regular, exam: examArray, confidence };
}
```

- [ ] **Step 6: Implement `bundle/spot.ts`**

```ts
import type { AttributeGroup, BundleSpot } from "@perch/core";
import type {
  spot,
  spot_amenity,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
} from "../schema/index.ts";

export type SpotRow = typeof spot.$inferSelect;
export type SeatTypeRow = typeof spot_seat_type.$inferSelect;
export type TableConfigRow = typeof spot_table_config.$inferSelect;
export type AmenityRow = typeof spot_amenity.$inferSelect;
export type VerificationRow = typeof spot_verification.$inferSelect;
export type PhotoRow = typeof spot_photo.$inferSelect;

export type SpotAssemblyInput = {
  row: SpotRow;
  seatTypes: SeatTypeRow[];
  tableConfigs: TableConfigRow[];
  amenities: AmenityRow[];
  verifications: VerificationRow[];
  approvedPhotos: PhotoRow[];
  hoursUnconfirmed: boolean;
};

export type SpotAssemblyResult = { ok: true; spot: BundleSpot } | { ok: false; missing: string[] };

export function toBundleSpot(input: SpotAssemblyInput): SpotAssemblyResult {
  const r = input.row;
  const missing: string[] = [];
  if (r.directions === null) missing.push("directions");
  if (r.eligibility === null) missing.push("eligibility");
  if (r.seat_count === null) missing.push("seat_count");
  if (r.outlet_coverage_pct === null) missing.push("outlet_coverage_pct");
  if (r.group_work_ok === null) missing.push("group_work_ok");
  if (r.food_policy === null) missing.push("food_policy");
  if (
    r.directions === null ||
    r.eligibility === null ||
    r.seat_count === null ||
    r.outlet_coverage_pct === null ||
    r.group_work_ok === null ||
    r.food_policy === null
  ) {
    return { ok: false, missing };
  }

  const verified: Partial<Record<AttributeGroup, string>> = {};
  for (const v of input.verifications) verified[v.attribute_group] = v.last_verified_at.toISOString();

  return {
    ok: true,
    spot: {
      id: r.id,
      slug: r.slug,
      building_id: r.building_id,
      floor: r.floor,
      official_name: r.official_name,
      common_name: r.common_name,
      lat: r.lat,
      lng: r.lng,
      directions: r.directions,
      eligibility: r.eligibility,
      eligibility_scope: r.eligibility_scope,
      eligibility_verified: r.eligibility_verified,
      entry_method: r.entry_method,
      reservable: r.reservable,
      reservation_system: r.reservation_system,
      reservation_url: r.reservation_url,
      seat_count: r.seat_count,
      seat_types: input.seatTypes.map((s) => ({ type: s.type, count: s.count })),
      table_configs: input.tableConfigs.map((t) => t.config),
      effective_capacity: r.effective_capacity,
      max_group_size: r.max_group_size,
      spread_out_room: r.spread_out_room,
      outlet_coverage_pct: r.outlet_coverage_pct,
      usb_outlets: r.usb_outlets,
      wifi_mbps: r.wifi_mbps,
      cell_signal: r.cell_signal,
      noise_policy: r.noise_policy,
      natural_light: r.natural_light,
      lighting: r.lighting,
      temperature: r.temperature,
      temperature_consistent: r.temperature_consistent,
      windows_view: r.windows_view,
      calls_ok: r.calls_ok,
      group_work_ok: r.group_work_ok,
      whiteboard: r.whiteboard,
      food_policy: r.food_policy,
      amenities: input.amenities.map((a) => ({ amenity: a.amenity, walk_minutes: a.walk_minutes })),
      step_free: r.step_free,
      elevator: r.elevator,
      accessible_seating: r.accessible_seating,
      open_past_midnight: r.open_past_midnight,
      staffed_late: r.staffed_late,
      lit_route_to_residences: r.lit_route_to_residences,
      outdoor: r.outdoor,
      seasonal: r.seasonal,
      hours_unconfirmed: input.hoursUnconfirmed,
      verified,
      photos: [...input.approvedPhotos]
        .sort((a, b) => Number(b.is_cover) - Number(a.is_cover))
        .map((p) => ({ url: p.url, taken_at: p.taken_at.toISOString(), is_cover: p.is_cover })),
    },
  };
}
```

The `missing` list and the narrowing `if` repeat the same six checks on purpose: the list gives the warning text, the `if` lets TypeScript narrow each field to non-null without assertions.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test packages/db && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): add pure bundle assembly helpers"
```

---

### Task 7: `buildBundle` and the Node smoke check

**Files:**
- Create: `packages/db/src/bundle/buildBundle.ts`, `packages/db/scripts/smoke-bundle.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/buildBundle.test.ts`

**Interfaces:**
- Consumes: Tasks 3 to 6.
- Produces:
  - `buildBundle(db: Db, campusId: string, now: Date): Promise<BuildBundleResult>` where `type BuildBundleResult = { bundle: Bundle; warnings: string[] }`.
  - Throws `NoTermError` when no current or upcoming term exists, and `UnknownCampusError` for a missing campus.

- [ ] **Step 1: Write the failing test**

`packages/db/test/buildBundle.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseBundle, slotIndex } from "@perch/core";
import { and, eq } from "drizzle-orm";
import { NoTermError, buildBundle } from "../src/bundle/buildBundle.ts";
import { spot, spot_hours, term, walk_matrix } from "../src/index.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

const NOW = new Date("2026-10-13T18:00:00Z");

async function seeded() {
  const db = await createTestDb();
  const ids = await seed(db);
  return { db, ids };
}

test("seed bundle is valid and contains only published spots", async () => {
  const { db } = await seeded();
  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);

  expect(parseBundle(bundle).ok).toBe(true);
  expect(warnings).toEqual([]);
  expect(bundle.term.id).toBe("2026-fall");
  expect(bundle.campus.tz).toBe("America/New_York");
  expect(bundle.spots.map((s) => s.slug).sort()).toEqual([
    "central-reading-room",
    "kelly-rcc",
    "north-reading-room",
    "sac-lounge",
  ]);
});

test("unverified eligibility is carried through for the client to filter", async () => {
  const { db } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const rcc = bundle.spots.find((s) => s.slug === "kelly-rcc");
  expect(rcc?.eligibility_verified).toBe(false);
  expect(rcc?.eligibility_scope).toBe("Kelly Quad");
});

test("bundle holds no surveyor ids and no unapproved photos", async () => {
  const { db, ids } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const json = JSON.stringify(bundle);
  expect(json).not.toContain(ids.adminId);
  expect(json).not.toContain("unapproved");
  const crr = bundle.spots.find((s) => s.slug === "central-reading-room");
  expect(crr?.photos).toHaveLength(1);
  expect(crr?.photos[0]?.is_cover).toBe(true);
});

test("busyness uses measured, estimated, then none", async () => {
  const { db, ids } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const b = bundle.busyness[ids.spotIds["central-reading-room"]];
  expect(b?.confidence[slotIndex(1, 14)]).toBe("measured");
  expect(b?.confidence[slotIndex(2, 13)]).toBe("estimated");
  expect(b?.confidence[slotIndex(2, 3)]).toBe("none");
});

test("hours include only the current term, past-midnight closes survive", async () => {
  const { db, ids } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const crrHours = bundle.hours.filter((h) => h.spot_id === ids.spotIds["central-reading-room"]);
  expect(crrHours).toHaveLength(7);
  expect(crrHours[0]?.closes).toBe("02:00");
});

test("a spot with no hours this term is marked hours_unconfirmed", async () => {
  const { db, ids } = await seeded();
  await db.delete(spot_hours).where(eq(spot_hours.spot_id, ids.spotIds["sac-lounge"]));
  const { bundle } = await buildBundle(db, "sbu", NOW);
  expect(bundle.spots.find((s) => s.slug === "sac-lounge")?.hours_unconfirmed).toBe(true);
  expect(bundle.spots.find((s) => s.slug === "north-reading-room")?.hours_unconfirmed).toBe(false);
});

test("a missing walk pair falls back and is flagged", async () => {
  const { db } = await seeded();
  await db
    .delete(walk_matrix)
    .where(and(eq(walk_matrix.from_building_id, "sac"), eq(walk_matrix.to_building_id, "kelly-quad")));
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const i = bundle.walk.building_ids.indexOf("sac");
  const j = bundle.walk.building_ids.indexOf("kelly-quad");
  expect(bundle.walk.estimated_pairs).toContainEqual([i, j]);
  expect(bundle.walk.minutes[i]?.[j]).toBeGreaterThan(0);
});

test("an incomplete published spot is skipped with a warning", async () => {
  const { db, ids } = await seeded();
  await db
    .update(spot)
    .set({ status: "published" })
    .where(eq(spot.id, ids.spotIds["union-draft"]));
  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);
  expect(bundle.spots.some((s) => s.slug === "union-draft")).toBe(false);
  expect(warnings).toEqual([
    "skipped union-draft: missing directions, eligibility, seat_count, outlet_coverage_pct, group_work_ok, food_policy",
  ]);
});

test("between terms the next term is used; after all terms it throws", async () => {
  const { db } = await seeded();
  const winter = await buildBundle(db, "sbu", new Date("2027-01-05T17:00:00Z"));
  expect(winter.bundle.term.id).toBe("2027-spring");
  // Spring has no hours seeded, so every spot is unconfirmed for that term
  expect(winter.bundle.spots.every((s) => s.hours_unconfirmed)).toBe(true);

  await db.delete(term).where(eq(term.id, "2027-spring"));
  await expect(buildBundle(db, "sbu", new Date("2027-01-05T17:00:00Z"))).rejects.toThrow(NoTermError);
});
```

Note on the second-to-last test: deleting the `2027-spring` term requires no rows referencing it; the seed inserts no spring hours, so the delete succeeds.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/db/test/buildBundle.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `bundle/buildBundle.ts`**

```ts
import {
  BUNDLE_SCHEMA_MAJOR,
  Bundle,
  type BundleBusyness,
  type BundleSpot,
  DATA_ATTRIBUTION,
  DATA_LICENSE,
  campusDate,
} from "@perch/core";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "../client.ts";
import {
  building,
  campus,
  forecast,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  term,
  walk_matrix,
} from "../schema/index.ts";
import { assembleBusyness } from "./busyness.ts";
import { toBundleSpot } from "./spot.ts";
import { pickTerm } from "./term.ts";
import { assembleWalk } from "./walk.ts";

export class NoTermError extends Error {
  override name = "NoTermError";
}
export class UnknownCampusError extends Error {
  override name = "UnknownCampusError";
}

export type BuildBundleResult = { bundle: Bundle; warnings: string[] };

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export async function buildBundle(db: Db, campusId: string, now: Date): Promise<BuildBundleResult> {
  const [campusRow] = await db.select().from(campus).where(eq(campus.id, campusId));
  if (!campusRow) throw new UnknownCampusError(`unknown campus ${campusId}`);

  const terms = await db.select().from(term).where(eq(term.campus_id, campusId));
  const currentTerm = pickTerm(terms, campusDate(now, campusRow.tz));
  if (!currentTerm) throw new NoTermError(`no current or upcoming term for ${campusId}`);

  const buildings = await db.select().from(building).where(eq(building.campus_id, campusId));
  const buildingIds = buildings.map((b) => b.id);
  const walkRows =
    buildingIds.length === 0
      ? []
      : await db.select().from(walk_matrix).where(inArray(walk_matrix.from_building_id, buildingIds));

  const spotRows =
    buildingIds.length === 0
      ? []
      : await db
          .select()
          .from(spot)
          .where(and(eq(spot.status, "published"), inArray(spot.building_id, buildingIds)));
  const spotIds = spotRows.map((s) => s.id);
  const has = spotIds.length > 0;

  const [seatTypes, tableConfigs, amenities, verifications, photos, hours, forecasts, estimates] =
    await Promise.all([
      has ? db.select().from(spot_seat_type).where(inArray(spot_seat_type.spot_id, spotIds)) : [],
      has ? db.select().from(spot_table_config).where(inArray(spot_table_config.spot_id, spotIds)) : [],
      has ? db.select().from(spot_amenity).where(inArray(spot_amenity.spot_id, spotIds)) : [],
      has ? db.select().from(spot_verification).where(inArray(spot_verification.spot_id, spotIds)) : [],
      has
        ? db
            .select()
            .from(spot_photo)
            .where(and(inArray(spot_photo.spot_id, spotIds), isNotNull(spot_photo.approved_at)))
        : [],
      has
        ? db
            .select()
            .from(spot_hours)
            .where(and(inArray(spot_hours.spot_id, spotIds), eq(spot_hours.term_id, currentTerm.id)))
        : [],
      has ? db.select().from(forecast).where(inArray(forecast.spot_id, spotIds)) : [],
      has ? db.select().from(spot_estimate).where(inArray(spot_estimate.spot_id, spotIds)) : [],
    ]);

  const bySpot = <T extends { spot_id: string }>(rows: T[]) => groupBy(rows, (r) => r.spot_id);
  const seatMap = bySpot(seatTypes);
  const tableMap = bySpot(tableConfigs);
  const amenityMap = bySpot(amenities);
  const verifyMap = bySpot(verifications);
  const photoMap = bySpot(photos);
  const hoursMap = bySpot(hours);
  const forecastMap = bySpot(forecasts);
  const estimateMap = bySpot(estimates);

  const warnings: string[] = [];
  const spots: BundleSpot[] = [];
  const busyness: Record<string, BundleBusyness> = {};
  const includedIds = new Set<string>();

  for (const row of [...spotRows].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    const result = toBundleSpot({
      row,
      seatTypes: seatMap.get(row.id) ?? [],
      tableConfigs: tableMap.get(row.id) ?? [],
      amenities: amenityMap.get(row.id) ?? [],
      verifications: verifyMap.get(row.id) ?? [],
      approvedPhotos: photoMap.get(row.id) ?? [],
      hoursUnconfirmed: (hoursMap.get(row.id) ?? []).length === 0,
    });
    if (!result.ok) {
      warnings.push(`skipped ${row.slug}: missing ${result.missing.join(", ")}`);
      continue;
    }
    spots.push(result.spot);
    includedIds.add(row.id);
    busyness[row.id] = assembleBusyness(forecastMap.get(row.id) ?? [], estimateMap.get(row.id) ?? []);
  }

  const bundle = Bundle.parse({
    schema_version: BUNDLE_SCHEMA_MAJOR,
    generated_at: now.toISOString(),
    campus: { id: campusRow.id, name: campusRow.name, tz: campusRow.tz },
    term: {
      id: currentTerm.id,
      name: currentTerm.name,
      starts: currentTerm.starts,
      ends: currentTerm.ends,
      exam_starts: currentTerm.exam_starts,
      exam_ends: currentTerm.exam_ends,
    },
    buildings: [...buildings]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng })),
    walk: assembleWalk(buildings, walkRows),
    spots,
    hours: hours
      .filter((h) => includedIds.has(h.spot_id))
      .map((h) => ({
        spot_id: h.spot_id,
        day_of_week: h.day_of_week,
        opens: h.opens,
        closes: h.closes,
        last_entry: h.last_entry,
        is_exam: h.is_exam,
      })),
    busyness,
    data_license: DATA_LICENSE,
    attribution: DATA_ATTRIBUTION,
  });

  return { bundle, warnings };
}
```

`Bundle.parse` throws if assembly produced an invalid bundle. That is a bug in this code, not bad data, so throwing is correct; the publish job (surveyor plan) catches it and leaves `dirty` set.

Add to `src/index.ts`:

```ts
export * from "./bundle/buildBundle.ts";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/db && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Write the Node smoke check**

`packages/db/scripts/smoke-bundle.ts`:

```ts
import { parseBundle } from "@perch/core";
import { buildBundle } from "../src/bundle/buildBundle.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

const db = await createTestDb();
await seed(db);
const { bundle, warnings } = await buildBundle(db, "sbu", new Date("2026-10-13T18:00:00Z"));
const parsed = parseBundle(JSON.parse(JSON.stringify(bundle)));
if (!parsed.ok) {
  console.error(`smoke: invalid bundle: ${parsed.detail}`);
  process.exit(1);
}
const runtime = process.versions.bun ? "bun" : "node";
console.log(`smoke ok on ${runtime}: ${bundle.spots.length} spots, ${warnings.length} warnings`);
process.exit(0);
```

- [ ] **Step 6: Run the smoke check on both runtimes**

Run: `bun run smoke:node` then `bun packages/db/scripts/smoke-bundle.ts`
Expected: `smoke ok on node: 4 spots, 0 warnings` then `smoke ok on bun: 4 spots, 0 warnings`, both exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): build validated campus bundle from database"
```

---

### Task 8: `packages/ui-logic` adapters and bundle client

**Files:**
- Create: `packages/ui-logic/src/adapters.ts`, `packages/ui-logic/src/bundleClient.ts`, `packages/ui-logic/test/fakes.ts`
- Modify: `packages/ui-logic/src/index.ts`, `packages/ui-logic/test/tsconfig.json`
- Delete: `packages/ui-logic/test/smoke.test.ts`
- Test: `packages/ui-logic/test/bundleClient.test.ts`

**Interfaces:**
- Consumes: `parseBundle`, `BundlePointer`, `Bundle`, `BUNDLE_SCHEMA_MAJOR` from core.
- Produces:
  - Adapter interfaces: `Storage`, `KeyValueCache`, `Clock`, `Geolocation`, `Share`, `NetworkStatus`, `Fetch` (signatures below).
  - `loadBundle(deps: BundleClientDeps, baseUrl: string): Promise<BundleLoad>` where
    - `type BundleClientDeps = { fetch: Fetch; cache: KeyValueCache; clock: Clock }`
    - `type BundleLoad = { status: "fresh" | "cached"; bundle: Bundle; ageDays: number } | { status: "unavailable"; reason: "offline_no_cache" | "update_required" }`
  - `LAST_GOOD_KEY = "bundle:last-good"`.

- [ ] **Step 1: Write fakes**

`packages/ui-logic/test/fakes.ts`:

```ts
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
```

- [ ] **Step 2: Write failing tests**

`packages/ui-logic/test/bundleClient.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { makeBundleFixture } from "../../core/test/fixtures/bundle-v1.ts";
import { LAST_GOOD_KEY, loadBundle } from "../src/index.ts";
import { FakeFetch, MemoryCache, fixedClock } from "./fakes.ts";

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
  const v2 = new FakeFetch(new Map([[`${BASE}/bundle-latest.json`, ok(pointer(2, "ffffffffffffffff"))]]));
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
  const fetch = new FakeFetch(
    new Map([[`${BASE}/bundle-latest.json`, { status: 503, text: "" }]]),
  );
  expect((await loadBundle({ fetch, cache, clock }, BASE)).status).toBe("unavailable");
});
```

The test file imports the core fixture by relative path. Add `{ "path": "../../core/test" }` to `references` in `packages/ui-logic/test/tsconfig.json` so `tsc -b` resolves it.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test packages/ui-logic`
Expected: FAIL, exports not found.

- [ ] **Step 4: Implement `adapters.ts`**

```ts
/**
 * Platform adapters. apps/web implements these with browser APIs; a future
 * Expo app implements them with React Native modules. Shared code depends
 * only on these interfaces.
 */

/** Synchronous small key-value store (localStorage, MMKV). */
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Asynchronous larger store (IndexedDB, AsyncStorage). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export type LatLngFix = { lat: number; lng: number; accuracyMeters: number };

export interface Geolocation {
  /** Resolves null when permission is denied or no fix is available. */
  current(): Promise<LatLngFix | null>;
}

export interface Share {
  share(data: { title: string; url: string }): Promise<"shared" | "copied" | "failed">;
}

export interface NetworkStatus {
  online(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type FetchResponse = { status: number; text: string };

export interface Fetch {
  /** Rejects on network failure. Non-2xx statuses resolve normally. */
  getText(url: string): Promise<FetchResponse>;
}
```

- [ ] **Step 5: Implement `bundleClient.ts`**

```ts
import { BUNDLE_SCHEMA_MAJOR, type Bundle, BundlePointer, parseBundle } from "@perch/core";
import { z } from "zod";
import type { Clock, Fetch, KeyValueCache } from "./adapters.ts";

export const LAST_GOOD_KEY = "bundle:last-good";
const DAY_MS = 86_400_000;

export type BundleClientDeps = { fetch: Fetch; cache: KeyValueCache; clock: Clock };

export type BundleLoad =
  | { status: "fresh" | "cached"; bundle: Bundle; ageDays: number }
  | { status: "unavailable"; reason: "offline_no_cache" | "update_required" };

const CacheEntry = z.object({ hash: z.string(), json: z.string() });
type Cached = { hash: string; bundle: Bundle };

async function readCache(cache: KeyValueCache): Promise<Cached | null> {
  const raw = await cache.get(LAST_GOOD_KEY);
  if (raw === null) return null;
  try {
    const entry = CacheEntry.safeParse(JSON.parse(raw));
    if (!entry.success) return null;
    const parsed = parseBundle(JSON.parse(entry.data.json));
    return parsed.ok ? { hash: entry.data.hash, bundle: parsed.bundle } : null;
  } catch {
    return null;
  }
}

async function getJson(fetch: Fetch, url: string): Promise<unknown> {
  const res = await fetch.getText(url);
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} for ${url}`);
  return JSON.parse(res.text);
}

function ageDays(bundle: Bundle, clock: Clock): number {
  return Math.floor((clock.now().getTime() - Date.parse(bundle.generated_at)) / DAY_MS);
}

/**
 * Loads the campus bundle: latest pointer, then the hashed bundle, validated
 * against the core schema. Falls back to the last good cached bundle on any
 * failure. Never throws.
 */
export async function loadBundle(deps: BundleClientDeps, baseUrl: string): Promise<BundleLoad> {
  const cached = await readCache(deps.cache);
  const fromCache = (): BundleLoad =>
    cached
      ? { status: "cached", bundle: cached.bundle, ageDays: ageDays(cached.bundle, deps.clock) }
      : { status: "unavailable", reason: "offline_no_cache" };

  let pointer: BundlePointer;
  try {
    const p = BundlePointer.safeParse(await getJson(deps.fetch, `${baseUrl}/bundle-latest.json`));
    if (!p.success) return fromCache();
    pointer = p.data;
  } catch {
    return fromCache();
  }

  if (pointer.schema_version !== BUNDLE_SCHEMA_MAJOR) {
    return cached ? fromCache() : { status: "unavailable", reason: "update_required" };
  }

  if (cached && cached.hash === pointer.hash) {
    return { status: "fresh", bundle: cached.bundle, ageDays: ageDays(cached.bundle, deps.clock) };
  }

  try {
    const raw = await getJson(deps.fetch, `${baseUrl}/${pointer.url}`);
    const parsed = parseBundle(raw);
    if (!parsed.ok) return fromCache();
    await deps.cache.set(
      LAST_GOOD_KEY,
      JSON.stringify({ hash: pointer.hash, json: JSON.stringify(raw) }),
    );
    return { status: "fresh", bundle: parsed.bundle, ageDays: ageDays(parsed.bundle, deps.clock) };
  } catch {
    return fromCache();
  }
}
```

`packages/ui-logic/src/index.ts`:

```ts
export * from "./adapters.ts";
export * from "./bundleClient.ts";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test packages/ui-logic && bun run typecheck && bun run lint`
Expected: PASS. Typecheck also proves `ui-logic` uses no DOM APIs.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui-logic): add platform adapters and bundle client"
```

---

### Task 9: CI workflow and pre-commit hook

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (add a short "Commands" section)

**Interfaces:**
- Consumes: root scripts from Task 1, smoke script from Task 7.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Test
        run: bun test

      - name: Smoke (Node)
        run: bun run smoke:node

      - name: Smoke (Bun)
        run: bun packages/db/scripts/smoke-bundle.ts

      - name: Migrations are up to date
        run: |
          bun run db:generate
          git diff --exit-code packages/db/drizzle || (echo "Schema changed without a migration. Run bun run db:generate." && exit 1)

      - name: Secret scan
        run: docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo --no-banner --redact
```

The gitleaks Docker image is used instead of `gitleaks-action` because the action needs a paid license key for organization repositories.

- [ ] **Step 2: Verify the pre-commit hook locally**

Run: `brew install gitleaks` (if missing), then `bunx lefthook install`, then make a trivial whitespace change to `packages/core/src/slots.ts`, `git add` it, and run `bunx lefthook run pre-commit`.
Expected: typecheck, lint, and secrets commands all pass. Revert the whitespace change.

- [ ] **Step 3: Verify the migration drift check locally**

Run: `bun run db:generate && git status --short packages/db/drizzle`
Expected: no changes ("No schema changes, nothing to migrate").

- [ ] **Step 4: Add commands to `CLAUDE.md`**

Insert after the "Context files" table:

```markdown
## Commands

- `bun install`: install workspaces (also installs the lefthook pre-commit hook)
- `bun run typecheck`, `bun run lint`, `bun run fix`, `bun test`
- `bun run smoke:node`: build the seed bundle under Node to prove the fallback runtime works
- `bun run db:generate`: create a migration after changing `packages/db/src/schema`
- `bun run db:migrate`, `bun run db:seed`: apply to `DATABASE_URL` (see `.env.example`)
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: add typecheck, lint, test, smoke, and secret scan"
```

---

## Done criteria

- `bun run typecheck`, `bun run lint`, `bun test`, `bun run smoke:node` all pass from a clean clone.
- 9 commits on `main`, one per task, each passing the checks above.
- Adding `window` or importing `react-dom` in `packages/core` or `packages/ui-logic` fails typecheck or lint.
- The seed bundle validates against the core schema on both Bun and Node.
