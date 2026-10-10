# Surveyor 2a Server Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Fastify server in `apps/server` that lets invited surveyors sign in with a bearer token, read and edit spots section by section with version checks and idempotent retries, upload and approve photos, publish complete spots, and push the campus bundle and photos to the data site (Cloudflare Pages, or a directory), plus the shared survey API contract in `packages/core` that plans B and D build on.

**Architecture:** `packages/core/src/survey/` holds every request, response, and section payload schema and `missingV0Fields`, shared with the client. `packages/db` gains migrations 0002 and 0003. `apps/server` is a `buildApp(deps)` factory (tests use `inject` on PGlite) with injected `Clock`, `Publisher`, and `PhotoStore`. Every survey mutation goes through `withWrite`, which claims a `write_receipt` row first, runs the change, writes `audit_log`, stores the response for replay, marks the bundle dirty, and schedules a debounced publish. The publisher builds the bundle with the existing `buildBundle`, hashes it, and deploys the complete file set through a `PublishTarget` (`PagesTarget` for Cloudflare Pages direct upload, `FsTarget` for tests, dev, and a VPS).

**Tech Stack:** Fastify 5.12, fastify-type-provider-zod 7.0 (Zod 4.6), @fastify/cors 11.3, @fastify/multipart 10.1, @noble/hashes 2.4 (blake3 for Pages asset keys), Drizzle ORM 0.45 and drizzle-kit 0.31, postgres.js 3 (production) and PGlite 0.5 (tests), Bun 1.3.14 test runner, Node 24+ (Render runtime, type stripping), TypeScript 7 (`tsc -b`), Biome 2.

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (phase 2a server: sections 2, 3, 4, 5, 6, 10, 11, 12). Index: `docs/superpowers/plans/2026-10-04-surveyor-2a-index.md` (this is plan A; Task 2 is the shared contract plan B waits for). Copy deck consulted for server-visible data: `docs/design/surveyor-copy.md`. Rules: `CLAUDE.md`, `docs/context/stack.md`.

## Global Constraints

- TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (from `tsconfig.base.json`, unchanged).
- No `any`. No non-null assertion (`!`) without a justifying comment (this plan uses none). No TS `enum`, `namespace`, or parameter properties.
- Relative imports use explicit `.ts` extensions.
- No `Bun.*` APIs in `apps/server` or `packages/*`; `bun:test` only in test files. Hashing and randomness use `node:crypto` and `@noble/hashes`.
- Postgres driver is `postgres` (postgres.js) via `openDb`; never Bun's SQL client.
- Zod at every trust boundary: env, request bodies, params, multipart fields, stored `response_json` and `last_warnings` JSON, Cloudflare responses, the data-site pointer.
- Request schemas are strict; response schemas are lenient (plain strings, nullable), because the Zod serializer parses every response.
- All server times come from the injected `Clock`; never compare against Postgres `now()`.
- No em-dashes in code, comments, docs, UI copy, or commit messages. Use commas or colons.
- Commits: Conventional Commits, subject 72 characters or fewer, imperative, lowercase, no trailing period, no attribution or co-author lines. Breaking changes use `!` and a `BREAKING CHANGE:` footer.
- Every commit passes `bun run typecheck && bun run lint && bun test`. Run `bun run fix` before committing.
- Package scope `@perch/*`; the server package is `@perch/server`.

## Review Focus

1. **A write replayed after the server crashed mid-transaction, or a retry that overlaps the original.** The receipt must roll back with everything else, the retry must then run for real, and two concurrent sends of one `client_write_id` must run the change once. Tests in Task 5 ("a crash mid-transaction leaves no receipt, audit, or partial data", "two concurrent sends of the same id run the write once").
2. **An invite accepted twice at once, or a re-login link issued before a revoke.** Exactly one accept may win, and revoking must void the surveyor's open links. Tests in Task 4 ("an invite cannot be reused, even by two concurrent accepts", "revoke ends sessions, voids open invites, and blocks the surveyor").
3. **A publish triggered while another publish runs, and a write that lands mid-publish.** Deploys must never overlap, extra requests must collapse into one rerun, and a mid-publish write must keep `dirty` set and publish again. Tests in Task 8 ("a publish requested while one runs never overlaps and collapses into one rerun", "a write that lands mid-publish keeps dirty and schedules another publish").
4. **A photo upload for a spot that does not exist yet, or still has its offline `local:` id, with the file part sent first.** It must fail without leaving an orphan blob, and field order must not matter. Tests in Task 7 ("an unknown spot or an offline local id stores no blob"; the upload helper always sends `file` first).
5. **Clock skew.** Invite expiry (exactly 48 hours), session expiry (exactly 30 days), and renewal (one millisecond past halfway) are judged by the server clock only, and a phone clock running ahead cannot date a photo in the future. Tests in Task 4 ("an invite expires exactly 48 hours after creation by the server clock", "sessions expire at 30 days exactly and renew past the halfway point") and Task 7 ("taken_at from a phone clock in the future is clamped to the server clock").

## Decisions where the spec is silent or the code disagrees

These are resolved here and recorded in `docs/context/overview.md` (decision 16) by Task 9.

- **Migration 0002 is two migrations.** drizzle-kit asks interactively whether `invite` is a rename of `magic_link` (and `blob_sha256` of `r2_key`), which crashes without a TTY. 0002 holds only the drops, 0003 the additions.
- **`spot.noise_policy` becomes nullable** and joins `missingV0Fields`. A draft is created from identity only, and noise policy belongs to the environment section; `docs/context/spot-schema.md` already lists it as v0-required. The existing warning strings in `buildBundle.test.ts` do not change.
- **Hours stay out of `missingV0Fields`.** The foundation publishes spots without hours as `hours_unconfirmed`, and the spec requires all three callers to agree.
- **`surveyor.email` becomes nullable** (invites carry no email). **`invite.created_by` is nullable** for the bootstrap invite. `admin:invite "<name>"` creates the admin and prints a re-login link for them.
- **`bundle_state` gains `write_seq`, `last_attempt_at`, `last_warnings`, `last_error`.** The spec's admin status needs warnings and the last error; `write_seq` prevents a publish from clearing a write that landed while it ran.
- **`spot.reviewed_by` is added**, and `SurveySpot` carries `last_edited_by_name` and `reviewed_by_name`. The copy deck shows "Reviewed by {name}", "Unreviewed, edited by {name}", and the last editor's name in the conflict view.
- **Version semantics.** Only section PUTs bump `version` (and reset review). Verify and review check `base_version` but do not bump it. Publish, unpublish, and photo actions neither check nor bump it. That way they never cause conflicts for someone editing a section.
- **Every mutating survey route takes a `client_write_id`** (publish, unpublish, review, and the photo actions too), so the outbox can retry any of them safely. A write id reused by another surveyor or for another kind of write gets 422 `write_id_reused`.
- **Invite failures are `invite_used`, `invite_expired`, or `invite_invalid` (410)**, matching the copy deck's three invite messages. A revoked surveyor gets a plain 401, like an expired session, because the spec deletes their sessions.
- **Unapproved photos have no public URL**, so signed-in surveyors read bytes from `GET /survey/photos/:id/image` (the admin approval screen needs it). The publisher sets `spot_photo.url` to `DATA_BASE_URL/photos/<sha256>.jpg` for approved photos before each build.
- **The hours payload requires `term_id`.** The server does not default it; the client takes it from `SurveySpot.term` (current or next term by `pickTerm`), which satisfies the spec's default without a hidden server rule. An empty `rows` list clears that term's hours (shown as unconfirmed).
- **The survey contract schemas are hand-written Zod in `packages/core`,** not composed from drizzle-zod, because `packages/core` cannot import `packages/db` (the client imports core). Server loaders map rows to them explicitly, and the tests parse every response with them.
- **Photo upload accepts an optional `taken_at`** (offline capture time), clamped to the server clock. The JPEG check reads magic bytes, not the client's content type. `PHOTO_MAX_BYTES` is 1,500,000.
- **Data site layout:** `bundle-latest.json`, `bundle.<hash>.json`, `photos/<sha256>.jpg`, and `_headers`, all at the root of `perch-data`; the client's base URL is `DATA_BASE_URL`. Each Pages deployment lists the current files only. `_headers` sets CORS `*`, `no-cache` on the pointer, and immutable caching on hashed files.
- **New env `CAMPUS_ID`** (default `sbu`) names the campus whose bundle is published. `DATA_BASE_URL` must be a dotted host (bundle `httpUrl`), so local dev uses `http://data.localhost:8788`. `WEB_ORIGIN` may be `http://localhost:5173`.
- **`requireSurveyor` and `requireAdmin` are functions called at the top of each handler**, not Fastify hooks. They return the typed surveyor without request decoration or module augmentation.
- **`/health` never touches the database**, so Render health checks do not keep Neon awake. The server also starts while the database is unreachable (postgres.js connects lazily, and the publisher's startup check only logs).
- **For plan D:** `V0_FIELD` has 8 entries (7 fields plus `last_verified`), and `V0_FIELD_SECTION` maps 7 of them onto 6 sections. The copy deck's "{count} of 7 required parts" should count from `V0_FIELD`.

## Probes run (2026-10-04, in `/private/tmp`, nothing left in the repo)

- **fastify 5.12.5 + fastify-type-provider-zod 7.0.0 + Zod 4.6.5.** `validatorCompiler`, `serializerCompiler`, `ZodTypeProvider`, `FastifyPluginAsyncZod`, and `hasZodFastifySchemaValidationErrors` all exist. Body and params validation return 400. The serializer parses with the response schema and strips unknown keys. Typed under TS 7 with the repo's strict flags; the error handler's `err` is `unknown`.
- **@fastify/multipart 10.1.2 under Bun 1.3.14 and Node 26.** `inject` with a `FormData` payload and a real `fetch` upload both work. The `fileSize` limit makes `toBuffer()` throw a 413. Parts arrive in client order.
- **@fastify/cors 11.3.0.** An array origin echoes only the allowed origin. Default methods are `GET,HEAD,POST`, so `PUT` must be listed.
- **Drizzle 0.45 `customType` bytea.** Round-trips exact bytes on PGlite (`Uint8Array`), and through postgres.js on Node and Bun via a pglite-socket wire server (`Buffer`).
- **drizzle-kit 0.31.11.** Generating a table drop plus a table add in one migration hits the interactive rename prompt and crashes without a TTY. Drops-only and adds-only migrations generate cleanly. `--name` passes through `bun run db:generate`, and the enum add is emitted as `CREATE TYPE`.
- **PGlite.** `Promise.all` over two `db.transaction` calls with the same receipt id serializes and does not hang, so the Task 5 test passes there but cannot show the race. On real Postgres the claim-first receipt relies on the second `INSERT ... ON CONFLICT DO NOTHING` waiting for the first transaction's row; that is design reasoning, not a probe (pglite-socket cannot host concurrent transactions), and `smoke-publish.ts` checks it against Postgres in CI.
- **Cloudflare Pages direct upload.** Read wrangler 4.147.0's bundled source for the endpoints and payloads, and the API docs for `branch` (omitted means production). `@noble/hashes` blake3 matches `blake3-wasm` (wrangler's hasher) on a 200 KB file; reference hashes are in Task 8.
- **Node type stripping through Bun's isolated-linker symlinks.** `node apps/server/src/main.ts` resolves `@perch/*` and serves `/health`.
- **The whole plan was replayed** on a fresh export of the current `main`. Every task's code was applied as written here, each "expected FAIL" step failed, and every commit passed `bun run fix`, `typecheck`, `lint`, and `bun test` (187 tests at the end), plus both server smokes.

---

## File Structure

```
package.json                           + smoke:server, admin:invite scripts
tsconfig.json                          + apps/server and apps/server/test references
.github/workflows/ci.yml               + server smoke (Node, Bun); Postgres job: admin:invite, server smoke, publish smoke

packages/core/src/enums.ts             + REVIEW_STATE
packages/core/src/index.ts             + survey re-export
packages/core/src/survey/sections.ts   section names, payload schemas, SectionWrite
packages/core/src/survey/missing.ts    V0_FIELD, V0_FIELD_SECTION, missingV0Fields
packages/core/src/survey/spot.ts       SurveySpot, SpotSummary, SpotList, SurveyPhoto, SurveyorPublic, v0InputOf
packages/core/src/survey/api.ts        request schemas, PublishStatus, error codes and bodies
packages/core/src/survey/index.ts      re-exports
packages/core/test/fixtures/survey-spot.ts   surveySpotFixture (shared with plans B and D)
packages/core/test/survey.test.ts

packages/db/src/schema/types.ts        bytea custom type
packages/db/src/schema/enums.ts        + review_state
packages/db/src/schema/survey.ts       - magic_link; + invite; email nullable; write_receipt.response_json
packages/db/src/schema/spot.ts         + review_state, reviewed_by, last_edited_by; noise_policy nullable; + photo_blob; spot_photo blob_sha256, url nullable, - r2_key
packages/db/src/schema/ops.ts          bundle_state + write_seq, last_attempt_at, last_warnings, last_error
packages/db/drizzle/0002_drop_magic_link_and_r2_key.sql, 0003_surveyor_tooling.sql, meta/*   generated
packages/db/src/bundle/spot.ts         uses core missingV0Fields; skips photos without a url
packages/db/src/seed/seed.ts           - r2_key
packages/db/src/index.ts               + pickTerm export
packages/db/test/schema.test.ts, spot.test.ts   updated and extended

apps/server/package.json, tsconfig.json, test/tsconfig.json
apps/server/src/env.ts                 Zod env (PUBLISH_TARGET union)
apps/server/src/clock.ts               Clock, systemClock
apps/server/src/http.ts                HttpError
apps/server/src/app.ts                 buildApp(deps): type provider, error handler, CORS, routes
apps/server/src/main.ts                env, db, photo store, target, publisher, listen, shutdown (Node and Bun)
apps/server/src/auth/tokens.ts         newToken, hashToken
apps/server/src/auth/sessions.ts       createSession, authenticate (expiry, renewal), deleteSession
apps/server/src/auth/invites.ts        createInvite, acceptInvite, revokeSurveyor, bootstrapAdminInvite
apps/server/src/auth/guards.ts         requireSurveyor, requireAdmin
apps/server/src/writes/withWrite.ts    receipt-first idempotent write pipeline
apps/server/src/writes/spotWrite.ts    spotWriter: withWrite for writes answering with SurveySpot
apps/server/src/spots/load.ts          currentTerm, loadSurveySpot, listSurveySpots
apps/server/src/spots/write.ts         createDraft, writeSection, verifyGroups, publishSpot, unpublishSpot, reviewSpot
apps/server/src/photos/store.ts        PhotoStore, postgresPhotoStore, sha256Hex, isJpeg
apps/server/src/photos/write.ts        addPhoto, setCover, approvePhoto, rejectPhoto
apps/server/src/publish/target.ts      PublishTarget, PublishFile, DATA_HEADERS
apps/server/src/publish/fsTarget.ts    directory target
apps/server/src/publish/pagesTarget.ts Cloudflare Pages direct upload target, pagesHash
apps/server/src/publish/publisher.ts   debounce, lock, build, hash, deploy, state
apps/server/src/routes/health.ts       GET /health
apps/server/src/routes/auth.ts         /auth/accept, /auth/me, /auth/logout
apps/server/src/routes/admin.ts        /admin/invites, /admin/surveyors, revoke, /admin/photos/pending
apps/server/src/routes/spots.ts        /survey/spots...
apps/server/src/routes/photos.ts       /survey/photos...
apps/server/src/routes/publish.ts      /admin/publish
apps/server/scripts/smoke-server.ts    start main.ts under node or bun, hit /health, SIGTERM
apps/server/scripts/admin-invite.ts    bootstrap admin invite link
apps/server/scripts/smoke-publish.ts   concurrent same-id write and publish on postgres.js (CI Postgres job)
apps/server/test/helpers.ts            setup, signIn, clocks, timers, counting publisher
apps/server/test/fixtures.ts           identity(), COMPLETING_SECTIONS
apps/server/test/{env,health,auth,withWrite,spots,photos,pagesTarget,publisher,admin}.test.ts

docs/context/data-model.md             surveyor tooling tables
docs/context/overview.md               decision 16
```

Out of scope (phase 2b): pick ping, headcounts, routes and route slots, maintenance jobs (including orphan blob cleanup), audit log view.

---

### Task 1: `apps/server` scaffold: env, app, health, CORS, smoke

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/test/tsconfig.json`
- Create: `apps/server/src/env.ts`, `apps/server/src/clock.ts`, `apps/server/src/http.ts`, `apps/server/src/app.ts`, `apps/server/src/main.ts`, `apps/server/src/routes/health.ts`
- Create: `apps/server/scripts/smoke-server.ts`
- Create: `apps/server/test/env.test.ts`, `apps/server/test/health.test.ts`
- Modify: `tsconfig.json` (references), `package.json` (`smoke:server`), `.github/workflows/ci.yml` (server smoke steps), `bun.lock`

**Interfaces:**
- Produces: `parseEnv(source: Record<string, string | undefined>): EnvResult` where `EnvResult = { ok: true; env: Env } | { ok: false; error: string }`; `Env` is the Zod-inferred union on `PUBLISH_TARGET` (`"pages"` adds `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_DATA_PROJECT`; `"fs"` adds `FS_PUBLISH_DIR`), plus `DATABASE_URL`, `WEB_ORIGIN`, `DATA_BASE_URL`, `PORT` (default 3000), `CAMPUS_ID` (default `"sbu"`).
- Produces: `type Clock = { now(): Date }`, `systemClock: Clock`.
- Produces: `class HttpError extends Error { readonly status: number; readonly body: ErrorBody }`, `type ErrorBody = { error: string } & Record<string, unknown>`.
- Produces: `type AppConfig = { webOrigin: string; campusId: string }`, `type AppDeps = { db: Db; clock: Clock; config: AppConfig; logger?: boolean }` (later tasks add `publisher` and `photos`), `buildApp(deps: AppDeps): Promise<App>`, `type App`.
- Produces: root script `smoke:server` (`node apps/server/scripts/smoke-server.ts node|bun`).
- Consumes: `Db`, `openDb(url): { db: Db; close(): Promise<void> }` from `@perch/db`; `createTestDb()` from `@perch/db/testing`.

- [ ] **Step 1: Check current versions**

These were current on 2026-10-04; use them unless `npm view` shows a newer minor of the same major:

Run: `npm view fastify version && npm view fastify-type-provider-zod version && npm view @fastify/cors version && npm view @fastify/multipart version`
Expected: `5.12.5`, `7.0.0`, `11.3.0`, `10.1.2` (or newer within the same major).

- [ ] **Step 2: Write the workspace manifest and tsconfigs**

`apps/server/package.json`:

```json
{
  "name": "@perch/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/app.ts"
  },
  "dependencies": {
    "@fastify/cors": "^11.3.0",
    "@fastify/multipart": "^10.1.2",
    "@perch/core": "workspace:*",
    "@perch/db": "workspace:*",
    "drizzle-orm": "^0.45.3",
    "fastify": "^5.12.5",
    "fastify-type-provider-zod": "^7.0.0",
    "zod": "^4.6.5"
  }
}
```

`fastify-type-provider-zod` 7 lists `@fastify/swagger` and `openapi-types` as peers; Bun installs them automatically. `@fastify/multipart` is used in Task 7; installing it now keeps the lockfile change in one place.

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src", "scripts"],
  "references": [{ "path": "../../packages/core" }, { "path": "../../packages/db" }]
}
```

`apps/server/test/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "../dist-test", "types": ["bun", "node"] },
  "include": ["."],
  "references": [
    { "path": ".." },
    { "path": "../../../packages/core" },
    { "path": "../../../packages/db" }
  ]
}
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/core/test" },
    { "path": "packages/ui-logic" },
    { "path": "packages/ui-logic/test" },
    { "path": "packages/db" },
    { "path": "packages/db/test" },
    { "path": "apps/server" },
    { "path": "apps/server/test" }
  ]
}
```

Run: `bun install`
Expected: installs fastify, the type provider, cors, multipart; `bun.lock` changes.

- [ ] **Step 3: Write the failing tests**

`apps/server/test/env.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseEnv } from "../src/env.ts";

const fsEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  WEB_ORIGIN: "https://perch.pages.dev",
  DATA_BASE_URL: "https://perch-data.pages.dev/",
  PUBLISH_TARGET: "fs",
  FS_PUBLISH_DIR: "/tmp/publish",
};

test("a valid fs environment parses with defaults", () => {
  const r = parseEnv(fsEnv);
  if (!r.ok) throw new Error(r.error);
  expect(r.env.PORT).toBe(3000);
  expect(r.env.CAMPUS_ID).toBe("sbu");
  expect(r.env.DATA_BASE_URL).toBe("https://perch-data.pages.dev");
});

test("pages target requires Cloudflare credentials", () => {
  const r = parseEnv({ ...fsEnv, PUBLISH_TARGET: "pages", CF_ACCOUNT_ID: "acc" });
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toContain("CF_API_TOKEN");
    expect(r.error).toContain("CF_DATA_PROJECT");
  }
});

test("a localhost web origin is allowed for development", () => {
  expect(parseEnv({ ...fsEnv, WEB_ORIGIN: "http://localhost:5173" }).ok).toBe(true);
});

test("a web origin with a path or trailing slash is rejected", () => {
  expect(parseEnv({ ...fsEnv, WEB_ORIGIN: "https://perch.pages.dev/" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, WEB_ORIGIN: "https://x.dev/app" }).ok).toBe(false);
});

test("empty strings count as missing and bad values are rejected", () => {
  expect(parseEnv({ ...fsEnv, DATABASE_URL: "" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, DATABASE_URL: "mysql://x" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, PORT: "0" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, PUBLISH_TARGET: "r2" }).ok).toBe(false);
});
```

`apps/server/test/health.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createTestDb } from "@perch/db/testing";
import { buildApp } from "../src/app.ts";

const WEB = "https://perch.pages.dev";

async function app() {
  return buildApp({
    db: await createTestDb(),
    clock: { now: () => new Date("2026-10-13T18:00:00Z") },
    config: { webOrigin: WEB, campusId: "sbu" },
  });
}

function body(res: { body: string }): unknown {
  return JSON.parse(res.body);
}

test("GET /health answers ok", async () => {
  const res = await (await app()).inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toEqual({ ok: true });
});

test("unknown routes return a not_found code", async () => {
  const res = await (await app()).inject({ method: "GET", url: "/nope" });
  expect(res.statusCode).toBe(404);
  expect(body(res)).toEqual({ error: "not_found" });
});

test("CORS allows only the web origin, with Authorization and PUT", async () => {
  const a = await app();
  const preflight = (origin: string) =>
    a.inject({
      method: "OPTIONS",
      url: "/survey/spots/x/identity",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const ok = await preflight(WEB);
  expect(ok.headers["access-control-allow-origin"]).toBe(WEB);
  expect(String(ok.headers["access-control-allow-methods"])).toContain("PUT");
  expect(String(ok.headers["access-control-allow-headers"])).toContain("authorization");
  expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();

  const evil = await preflight("https://evil.example");
  expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
});
```

Run: `bun test apps/server`
Expected: FAIL: `Cannot find module '../src/env.ts'` and `'../src/app.ts'`.

- [ ] **Step 4: Implement env, clock, HttpError**

`WEB_ORIGIN` accepts `http://localhost:5173` for development. `DATA_BASE_URL` must pass Zod's `httpUrl` (a dotted host) because the bundle schema checks photo URLs with `httpUrl`; local dev uses `http://data.localhost:8788`.

`apps/server/src/env.ts`:

```ts
import { z } from "zod";

/** An origin such as https://perch.pages.dev: scheme, host, port, no path or trailing slash. */
const Origin = z
  .url({ protocol: /^https?$/ })
  .refine((u) => new URL(u).origin === u, "must be an origin with no path");

const Base = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  WEB_ORIGIN: Origin,
  /**
   * Public base URL of the data site. Must pass the bundle's httpUrl check (a dotted
   * host), so local dev uses http://data.localhost:8788. Trailing slashes are removed.
   */
  DATA_BASE_URL: z.httpUrl().transform((u) => u.replace(/\/+$/, "")),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CAMPUS_ID: z.string().min(1).default("sbu"),
});

const PagesEnv = Base.extend({
  PUBLISH_TARGET: z.literal("pages"),
  CF_ACCOUNT_ID: z.string().min(1),
  CF_API_TOKEN: z.string().min(1),
  CF_DATA_PROJECT: z.string().min(1),
});

const FsEnv = Base.extend({
  PUBLISH_TARGET: z.literal("fs"),
  FS_PUBLISH_DIR: z.string().min(1),
});

export const Env = z.discriminatedUnion("PUBLISH_TARGET", [PagesEnv, FsEnv]);
export type Env = z.infer<typeof Env>;

export type EnvResult = { ok: true; env: Env } | { ok: false; error: string };

/** Validates the process environment. Empty strings count as unset. */
export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") cleaned[key] = value;
  }
  const parsed = Env.safeParse(cleaned);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, error: z.prettifyError(parsed.error) };
}
```

`apps/server/src/clock.ts`:

```ts
export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };
```

`apps/server/src/http.ts`:

```ts
/** Error body sent to clients. `error` is a stable code from the survey contract. */
export type ErrorBody = { error: string } & Record<string, unknown>;

/** Thrown by handlers and the write pipeline; the app error handler sends it as is. */
export class HttpError extends Error {
  override name = "HttpError";
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, body: ErrorBody) {
    super(`${status} ${body.error}`);
    this.status = status;
    this.body = body;
  }
}
```

- [ ] **Step 5: Implement the app and the health route**

Fastify 5.12 types the error handler's `err` as `unknown`, so `statusOf` narrows it. The serializer compiler parses responses with the route's Zod schema (unknown keys are stripped), so response schemas must never be stricter than stored data.

`apps/server/src/routes/health.ts`:

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

/** Liveness only. Never touches the database, so health checks do not keep Neon awake. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async () => ({ ok: true as const }),
  );
};
```

`apps/server/src/app.ts`:

```ts
import cors from "@fastify/cors";
import type { Db } from "@perch/db";
import Fastify from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Clock } from "./clock.ts";
import { HttpError } from "./http.ts";
import { healthRoutes } from "./routes/health.ts";

export type AppConfig = {
  /** The PWA origin, the only origin CORS allows. */
  webOrigin: string;
  campusId: string;
};

export type AppDeps = {
  db: Db;
  clock: Clock;
  config: AppConfig;
  logger?: boolean;
};

/** Status carried by Fastify and plugin errors (400 bad JSON, 413 too large, 415 type), else 500. */
function statusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = err.statusCode;
    if (typeof code === "number" && code >= 400 && code < 600) return code;
  }
  return 500;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send(err.body);
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: "invalid_request", message: err.message });
    }
    const status = statusOf(err);
    if (status >= 500) {
      req.log.error(err);
      return reply.code(500).send({ error: "internal" });
    }
    const message = err instanceof Error ? err.message : "bad request";
    return reply.code(status).send({ error: "invalid_request", message });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not_found" }));

  await app.register(cors, {
    origin: [deps.config.webOrigin],
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["authorization", "content-type"],
    maxAge: 600,
  });

  await app.register(healthRoutes);
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
```

`apps/server/src/main.ts`:

```ts
import { openDb } from "@perch/db";
import { buildApp } from "./app.ts";
import { systemClock } from "./clock.ts";
import { parseEnv } from "./env.ts";

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`invalid environment:\n${parsed.error}`);
  process.exit(1);
}
const env = parsed.env;

// postgres.js connects lazily, so the server starts even while the database sleeps.
const { db, close } = openDb(env.DATABASE_URL);
const app = await buildApp({
  db,
  clock: systemClock,
  config: { webOrigin: env.WEB_ORIGIN, campusId: env.CAMPUS_ID },
  logger: true,
});

async function shutdown(): Promise<void> {
  await app.close();
  await close();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

await app.listen({ port: env.PORT, host: "0.0.0.0" });
```

- [ ] **Step 6: Run the tests**

Run: `bun test apps/server`
Expected: PASS (8 tests).

- [ ] **Step 7: Write the server smoke script and wire scripts and CI**

The smoke starts the real `main.ts` under a runtime, waits for `/health`, sends SIGTERM, and expects exit code 0. Without `DATABASE_URL` it uses an unreachable URL: `/health` never touches the database, so the check job can run it without Postgres.

`apps/server/scripts/smoke-server.ts`:

```ts
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Starts the real server under the given runtime, waits for /health, then
 * sends SIGTERM and expects a clean exit. Usage: node apps/server/scripts/smoke-server.ts node|bun
 */
const runtime = process.argv[2] ?? "node";
if (runtime !== "node" && runtime !== "bun") {
  console.error(`unknown runtime ${runtime}, expected node or bun`);
  process.exit(1);
}

const port = "3999";
const child = spawn(runtime, ["apps/server/src/main.ts"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    PORT: port,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://smoke:smoke@127.0.0.1:1/smoke",
    WEB_ORIGIN: "http://localhost:5173",
    DATA_BASE_URL: "http://data.localhost:8788",
    PUBLISH_TARGET: "fs",
    FS_PUBLISH_DIR: mkdtempSync(join(tmpdir(), "smoke-publish-")),
  },
});
const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));

async function healthy(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const ok = await healthy();
child.kill("SIGTERM");
const code = await exited;
if (!ok) {
  console.error(`server smoke on ${runtime}: /health never answered`);
  process.exit(1);
}
if (code !== 0) {
  console.error(`server smoke on ${runtime}: exit code ${code} after SIGTERM`);
  process.exit(1);
}
console.log(`server smoke ok on ${runtime}`);
```

In `package.json`, replace:

```json
    "smoke:node": "node packages/db/scripts/smoke-bundle.ts",
```

with:

```json
    "smoke:node": "node packages/db/scripts/smoke-bundle.ts",
    "smoke:server": "node apps/server/scripts/smoke-server.ts",
```

In `.github/workflows/ci.yml`, replace:

```yaml
      - name: Smoke (Bun)
        run: bun packages/db/scripts/smoke-bundle.ts
```

with:

```yaml
      - name: Smoke (Bun)
        run: bun packages/db/scripts/smoke-bundle.ts

      - name: Server smoke (Node)
        run: bun run smoke:server node

      - name: Server smoke (Bun)
        run: bun run smoke:server bun
```

In `.github/workflows/ci.yml`, replace:

```yaml
      - name: Smoke (postgres.js on Node)
        run: node packages/db/scripts/smoke-postgres.ts
```

with:

```yaml
      - name: Smoke (postgres.js on Node)
        run: node packages/db/scripts/smoke-postgres.ts

      - name: Server smoke against Postgres (Node)
        run: bun run smoke:server node
```

Run: `bun run smoke:server node && bun run smoke:server bun`
Expected: `server smoke ok on node` then `server smoke ok on bun` (request logs in between are normal). This also proves Node type stripping resolves `@perch/*` through the workspace symlinks.

- [ ] **Step 8: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server tsconfig.json package.json bun.lock .github/workflows/ci.yml
git commit -m "feat(server): scaffold fastify app with env, health, and cors"
```

---

### Task 2: Shared survey contract in `packages/core/src/survey/`

**Files:**
- Create: `packages/core/src/survey/sections.ts`, `missing.ts`, `spot.ts`, `api.ts`, `index.ts`
- Create: `packages/core/test/fixtures/survey-spot.ts`, `packages/core/test/survey.test.ts`
- Modify: `packages/core/src/enums.ts` (add `REVIEW_STATE`), `packages/core/src/index.ts`
- Modify: `packages/db/src/bundle/spot.ts` (use core `missingV0Fields`)

**Interfaces:**
- Produces (sections): `SURVEY_SECTION` (the 10 attribute groups plus `"estimates"`), `SurveySection`, `Slug`, `IdentitySection`, `AccessSection`, `HoursRow`, `HoursSection` (`{ term_id, rows }`), `SeatingSection`, `PowerSection`, `EnvironmentSection`, `UseFitSection`, `AmenitiesSection`, `AccessibilitySection`, `LateNightSection`, `EstimateCell`, `EstimatesSection`, `SECTION_SCHEMAS: Record<SurveySection, ZodType>`, `SectionPayload<S>`, `SectionWrite` (discriminated union `{ section, data }`).
- Produces (completeness): `V0_FIELD` (`directions, eligibility, seat_count, outlet_coverage_pct, noise_policy, group_work_ok, food_policy, last_verified`), `V0Field`, `V0_FIELD_SECTION: Record<V0Field, AttributeGroup | null>`, `type V0Input`, `missingV0Fields(spot: V0Input): V0Field[]`.
- Produces (responses): `SurveyorPublic`, `TermRef`, `SurveyPhoto`, `SurveyEstimate`, `SurveySpot` (includes `last_edited_by_name`, `reviewed_by`, `reviewed_by_name`, `term`, `hours`, `estimates`, `verified`, `photos`, `missing`), `v0InputOf(spot: SurveySpot): V0Input`, `SpotSummary`, `SpotList`.
- Produces (requests and errors): `ClientWriteId`, `BaseVersion`, `PHOTO_MAX_BYTES = 1_500_000`, `PHOTO_CONTENT_TYPE`, `IdParams`, `OpaqueToken`, `AcceptInviteRequest`, `AcceptInviteResponse`, `CreateInviteRequest`, `CreateInviteResponse`, `SurveyorList`, `SectionParams`, `CreateSpotRequest`, `SectionWriteRequest`, `VerifyRequest`, `ReviewRequest`, `WriteRequest`, `PhotoUploadFields`, `PendingPhotoList`, `PublishStatus`, `API_ERROR`, `ApiErrorCode`, `ApiError`, `VersionConflict` (409), `Incomplete` (422).
- Produces (enums): `REVIEW_STATE`, `ReviewState`.
- Produces (db): `pickV0(r: SpotRow): Omit<V0Input, "has_verification">`; `SpotAssemblyResult` failure now carries `missing: V0Field[]`.
- Consumes: `TimeOfDay` from `packages/core/src/bundle.ts`; enum schemas from `packages/core/src/enums.ts`.

- [ ] **Step 1: Write the fixture and failing tests**

Plans B and D import `surveySpotFixture` for their own tests, so it lives in `packages/core/test/fixtures/`.

`packages/core/test/fixtures/survey-spot.ts`:

```ts
import type { SurveySpot } from "../../src/index.ts";

/** A complete, publishable survey spot as the API returns it. */
export function surveySpotFixture(overrides: Partial<SurveySpot> = {}): SurveySpot {
  return {
    id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    slug: "central-reading-room",
    status: "draft",
    review_state: "unreviewed",
    version: 3,
    last_edited_by: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    last_edited_by_name: "Ana",
    reviewed_by: null,
    reviewed_by_name: null,
    updated_at: "2026-10-05T15:00:00.000Z",
    official_name: "Central Reading Room",
    common_name: null,
    building_id: "melville-library",
    floor: "3",
    lat: 40.9155,
    lng: -73.1221,
    directions: "Main entrance, stairs to floor 3.",
    outdoor: false,
    seasonal: false,
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
    usb_outlets: null,
    wifi_mbps: null,
    cell_signal: null,
    noise_policy: "silent",
    natural_light: true,
    lighting: "bright",
    temperature: null,
    temperature_consistent: null,
    windows_view: null,
    calls_ok: "not_allowed",
    group_work_ok: false,
    whiteboard: null,
    food_policy: "covered_drinks",
    amenities: [{ amenity: "bathroom", walk_minutes: 1 }],
    step_free: true,
    elevator: true,
    accessible_seating: null,
    open_past_midnight: false,
    staffed_late: null,
    lit_route_to_residences: null,
    term: { id: "2026-fall", name: "Fall 2026" },
    hours: [{ day_of_week: 0, opens: "08:00", closes: "02:00", last_entry: null, is_exam: false }],
    estimates: [
      {
        day_type: "weekday",
        block: "afternoon",
        bucket: "filling",
        created_at: "2026-10-05T15:00:00.000Z",
      },
    ],
    verified: { identity: "2026-10-05T15:00:00.000Z" },
    photos: [],
    missing: [],
    ...overrides,
  };
}
```

`packages/core/test/survey.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  AcceptInviteRequest,
  HoursSection,
  IdentitySection,
  Incomplete,
  missingV0Fields,
  SECTION_SCHEMAS,
  SectionWrite,
  SURVEY_SECTION,
  SurveySpot,
  V0_FIELD,
  V0_FIELD_SECTION,
  VerifyRequest,
  v0InputOf,
} from "../src/index.ts";
import { surveySpotFixture } from "./fixtures/survey-spot.ts";

const complete = {
  directions: "Floor 3.",
  eligibility: "all_students",
  seat_count: 10,
  outlet_coverage_pct: 0.5,
  noise_policy: "quiet",
  group_work_ok: false,
  food_policy: "none",
  has_verification: true,
} as const;

test("a complete spot is missing nothing", () => {
  expect(missingV0Fields(complete)).toEqual([]);
});

test("missing fields are reported in V0_FIELD order", () => {
  const nothing = {
    directions: null,
    eligibility: null,
    seat_count: null,
    outlet_coverage_pct: null,
    noise_policy: null,
    group_work_ok: null,
    food_policy: null,
    has_verification: false,
  };
  expect(missingV0Fields(nothing)).toEqual([...V0_FIELD]);
  expect(missingV0Fields({ ...complete, seat_count: null, has_verification: false })).toEqual([
    "seat_count",
    "last_verified",
  ]);
});

test("false and zero are present values, not missing", () => {
  expect(missingV0Fields({ ...complete, group_work_ok: false, outlet_coverage_pct: 0 })).toEqual(
    [],
  );
});

test("the API spot fixture parses and v0InputOf agrees with its missing list", () => {
  const spot = SurveySpot.parse(surveySpotFixture());
  expect(missingV0Fields(v0InputOf(spot))).toEqual(spot.missing);
  const bare = surveySpotFixture({ directions: null, verified: {}, missing: [] });
  expect(missingV0Fields(v0InputOf(bare))).toEqual(["directions", "last_verified"]);
});

test("every v0 field maps to the section that fills it", () => {
  expect(Object.keys(V0_FIELD_SECTION)).toEqual([...V0_FIELD]);
  for (const section of Object.values(V0_FIELD_SECTION)) {
    if (section !== null) expect(SURVEY_SECTION).toContain(section);
  }
});

test("every survey section has a payload schema", () => {
  expect(Object.keys(SECTION_SCHEMAS).sort()).toEqual([...SURVEY_SECTION].sort());
});

test("SectionWrite checks data against the named section", () => {
  const ok = SectionWrite.safeParse({
    section: "power",
    data: { outlet_coverage_pct: 0.4, usb_outlets: null, wifi_mbps: null, cell_signal: "good" },
  });
  expect(ok.success).toBe(true);
  const wrong = SectionWrite.safeParse({ section: "seating", data: { outlet_coverage_pct: 0.4 } });
  expect(wrong.success).toBe(false);
  const unknown = SectionWrite.safeParse({ section: "photos", data: {} });
  expect(unknown.success).toBe(false);
});

test("hours allow past-midnight closes and reject 24:00 opens and duplicates", () => {
  const row = { day_of_week: 0, opens: "08:00", closes: "02:00", last_entry: null, is_exam: false };
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [row] }).success).toBe(true);
  expect(
    HoursSection.safeParse({ term_id: "2026-fall", rows: [{ ...row, opens: "24:00" }] }).success,
  ).toBe(false);
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [row, row] }).success).toBe(false);
  const examRow = { ...row, is_exam: true };
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [row, examRow] }).success).toBe(true);
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [] }).success).toBe(true);
});

test("identity requires a clean slug and trims names", () => {
  const identity = {
    slug: "sac-lounge",
    official_name: "  SAC Lounge ",
    common_name: null,
    building_id: "sac",
    floor: "2",
    lat: 40.9,
    lng: -73.1,
    directions: null,
    outdoor: false,
    seasonal: false,
  };
  expect(IdentitySection.parse(identity).official_name).toBe("SAC Lounge");
  expect(IdentitySection.safeParse({ ...identity, slug: "SAC Lounge" }).success).toBe(false);
  expect(IdentitySection.safeParse({ ...identity, slug: "sac--lounge" }).success).toBe(false);
});

test("verify needs distinct groups and accept needs a 43-char token", () => {
  const id = "0b7e7f8e-3f3a-4c55-8d5e-1e2f3a4b5c6d";
  expect(
    VerifyRequest.safeParse({ client_write_id: id, base_version: 1, groups: ["hours"] }).success,
  ).toBe(true);
  expect(
    VerifyRequest.safeParse({ client_write_id: id, base_version: 1, groups: ["hours", "hours"] })
      .success,
  ).toBe(false);
  expect(
    VerifyRequest.safeParse({ client_write_id: id, base_version: 1, groups: [] }).success,
  ).toBe(false);
  expect(AcceptInviteRequest.safeParse({ token: "a".repeat(43) }).success).toBe(true);
  expect(AcceptInviteRequest.safeParse({ token: "a".repeat(42) }).success).toBe(false);
  expect(AcceptInviteRequest.safeParse({ token: `${"a".repeat(42)}=` }).success).toBe(false);
});

test("an incomplete body lists at least one missing field", () => {
  expect(Incomplete.safeParse({ error: "incomplete", missing: [] }).success).toBe(false);
  expect(Incomplete.safeParse({ error: "incomplete", missing: ["directions"] }).success).toBe(true);
});
```

Run: `bun test packages/core/test/survey.test.ts`
Expected: FAIL: `SyntaxError: Export named 'AcceptInviteRequest' not found` (the survey module does not exist).

- [ ] **Step 2: Add the review state enum**

In `packages/core/src/enums.ts`, replace:

```ts
export const NOISE_SAMPLE_SOURCE = ["survey", "user"] as const;
export const NoiseSampleSource = z.enum(NOISE_SAMPLE_SOURCE);
export type NoiseSampleSource = z.infer<typeof NoiseSampleSource>;
```

with:

```ts
export const NOISE_SAMPLE_SOURCE = ["survey", "user"] as const;
export const NoiseSampleSource = z.enum(NOISE_SAMPLE_SOURCE);
export type NoiseSampleSource = z.infer<typeof NoiseSampleSource>;

export const REVIEW_STATE = ["unreviewed", "reviewed"] as const;
export const ReviewState = z.enum(REVIEW_STATE);
export type ReviewState = z.infer<typeof ReviewState>;
```

- [ ] **Step 3: Write the section payload schemas**

Request schemas are strict (trimmed text, `httpUrl`, distinct rows). Each section payload is the whole section: a PUT replaces it, which keeps conflicts field-by-field comparable.

`packages/core/src/survey/sections.ts`:

```ts
import { z } from "zod";
import { TimeOfDay } from "../bundle.ts";
import {
  Amenity,
  ATTRIBUTE_GROUP,
  CallsOk,
  CellSignal,
  DayType,
  Eligibility,
  EntryMethod,
  FoodPolicy,
  Fullness,
  Lighting,
  NoisePolicy,
  SeatType,
  TableConfig,
  Temperature,
  TimeBlock,
} from "../enums.ts";

/** Every attribute group is a section, plus busyness estimates (no verification stamp). */
export const SURVEY_SECTION = [...ATTRIBUTE_GROUP, "estimates"] as const;
export const SurveySection = z.enum(SURVEY_SECTION);
export type SurveySection = z.infer<typeof SurveySection>;

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const ShortText = z.string().trim().min(1).max(200);
export const Slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase words joined by single dashes");

function distinct(keys: string[]): boolean {
  return new Set(keys).size === keys.length;
}

export const IdentitySection = z.object({
  slug: Slug,
  official_name: ShortText,
  common_name: ShortText.nullable(),
  building_id: z.string().min(1),
  floor: z.string().trim().min(1).max(20),
  lat: Lat,
  lng: Lng,
  directions: z.string().trim().min(1).max(2000).nullable(),
  outdoor: z.boolean(),
  seasonal: z.boolean(),
});
export type IdentitySection = z.infer<typeof IdentitySection>;

export const AccessSection = z.object({
  eligibility: Eligibility,
  eligibility_scope: ShortText.nullable(),
  eligibility_verified: z.boolean(),
  entry_method: EntryMethod.nullable(),
  reservable: z.boolean(),
  reservation_system: ShortText.nullable(),
  reservation_url: z.httpUrl().nullable(),
});
export type AccessSection = z.infer<typeof AccessSection>;

export const HoursRow = z.object({
  day_of_week: z.number().int().min(0).max(6),
  opens: TimeOfDay.refine((t) => t !== "24:00", "opens cannot be 24:00"),
  closes: TimeOfDay,
  last_entry: TimeOfDay.nullable(),
  is_exam: z.boolean(),
});
export type HoursRow = z.infer<typeof HoursRow>;

/** Replaces every hours row of this spot for `term_id`. An empty list clears them (hours unconfirmed). */
export const HoursSection = z.object({
  term_id: z.string().min(1),
  rows: z
    .array(HoursRow)
    .max(56)
    .refine(
      (xs) => distinct(xs.map((r) => `${r.day_of_week}|${r.is_exam}|${r.opens}`)),
      "two rows open at the same time on the same day",
    ),
});
export type HoursSection = z.infer<typeof HoursSection>;

export const SeatingSection = z.object({
  seat_count: z.number().int().positive(),
  seat_types: z
    .array(z.object({ type: SeatType, count: z.number().int().nonnegative() }))
    .refine((xs) => distinct(xs.map((s) => s.type)), "each seat type once"),
  table_configs: z
    .array(TableConfig)
    .refine((xs) => distinct(xs.map((c) => c)), "each table config once"),
  effective_capacity: z.number().int().positive().nullable(),
  max_group_size: z.number().int().positive().nullable(),
  spread_out_room: z.boolean().nullable(),
});
export type SeatingSection = z.infer<typeof SeatingSection>;

export const PowerSection = z.object({
  outlet_coverage_pct: z.number().min(0).max(1),
  usb_outlets: z.boolean().nullable(),
  wifi_mbps: z.number().nonnegative().nullable(),
  cell_signal: CellSignal.nullable(),
});
export type PowerSection = z.infer<typeof PowerSection>;

export const EnvironmentSection = z.object({
  noise_policy: NoisePolicy,
  natural_light: z.boolean().nullable(),
  lighting: Lighting.nullable(),
  temperature: Temperature.nullable(),
  temperature_consistent: z.boolean().nullable(),
  windows_view: z.boolean().nullable(),
});
export type EnvironmentSection = z.infer<typeof EnvironmentSection>;

export const UseFitSection = z.object({
  calls_ok: CallsOk.nullable(),
  group_work_ok: z.boolean(),
  whiteboard: z.boolean().nullable(),
  food_policy: FoodPolicy,
});
export type UseFitSection = z.infer<typeof UseFitSection>;

export const AmenitiesSection = z.object({
  amenities: z
    .array(z.object({ amenity: Amenity, walk_minutes: z.number().int().min(0).max(60) }))
    .refine((xs) => distinct(xs.map((a) => a.amenity)), "each amenity once"),
});
export type AmenitiesSection = z.infer<typeof AmenitiesSection>;

export const AccessibilitySection = z.object({
  step_free: z.boolean().nullable(),
  elevator: z.boolean().nullable(),
  accessible_seating: z.boolean().nullable(),
});
export type AccessibilitySection = z.infer<typeof AccessibilitySection>;

export const LateNightSection = z.object({
  open_past_midnight: z.boolean().nullable(),
  staffed_late: z.boolean().nullable(),
  lit_route_to_residences: z.boolean().nullable(),
});
export type LateNightSection = z.infer<typeof LateNightSection>;

export const EstimateCell = z.object({ day_type: DayType, block: TimeBlock, bucket: Fullness });
export type EstimateCell = z.infer<typeof EstimateCell>;

/** Adds one estimate per cell; the latest estimate per cell wins in the bundle. */
export const EstimatesSection = z.object({
  cells: z
    .array(EstimateCell)
    .min(1)
    .max(8)
    .refine((xs) => distinct(xs.map((c) => `${c.day_type}|${c.block}`)), "each cell once"),
});
export type EstimatesSection = z.infer<typeof EstimatesSection>;

export const SECTION_SCHEMAS = {
  identity: IdentitySection,
  access: AccessSection,
  hours: HoursSection,
  seating: SeatingSection,
  power: PowerSection,
  environment: EnvironmentSection,
  use_fit: UseFitSection,
  amenities: AmenitiesSection,
  accessibility: AccessibilitySection,
  late_night: LateNightSection,
  estimates: EstimatesSection,
} as const satisfies Record<SurveySection, z.ZodType>;

export type SectionPayload<S extends SurveySection> = z.infer<(typeof SECTION_SCHEMAS)[S]>;

/** A section name with its payload, so a switch on `section` narrows `data`. */
export const SectionWrite = z.discriminatedUnion("section", [
  z.object({ section: z.literal("identity"), data: IdentitySection }),
  z.object({ section: z.literal("access"), data: AccessSection }),
  z.object({ section: z.literal("hours"), data: HoursSection }),
  z.object({ section: z.literal("seating"), data: SeatingSection }),
  z.object({ section: z.literal("power"), data: PowerSection }),
  z.object({ section: z.literal("environment"), data: EnvironmentSection }),
  z.object({ section: z.literal("use_fit"), data: UseFitSection }),
  z.object({ section: z.literal("amenities"), data: AmenitiesSection }),
  z.object({ section: z.literal("accessibility"), data: AccessibilitySection }),
  z.object({ section: z.literal("late_night"), data: LateNightSection }),
  z.object({ section: z.literal("estimates"), data: EstimatesSection }),
]);
export type SectionWrite = z.infer<typeof SectionWrite>;
```

- [ ] **Step 4: Write `missingV0Fields`**

The order of `V0_FIELD` keeps the existing `buildBundle` warning strings unchanged (`noise_policy` is new and only appears for spots that lack it). Hours are not required, matching the existing `hours_unconfirmed` behavior.

`packages/core/src/survey/missing.ts`:

```ts
import type { AttributeGroup, Eligibility, FoodPolicy, NoisePolicy } from "../enums.ts";

/** Fields a published spot must have, in the order they are reported. */
export const V0_FIELD = [
  "directions",
  "eligibility",
  "seat_count",
  "outlet_coverage_pct",
  "noise_policy",
  "group_work_ok",
  "food_policy",
  "last_verified",
] as const;
export type V0Field = (typeof V0_FIELD)[number];

/** The section that fills each field, so a "Missing: x" row can link to its editor. */
export const V0_FIELD_SECTION: Readonly<Record<V0Field, AttributeGroup | null>> = {
  directions: "identity",
  eligibility: "access",
  seat_count: "seating",
  outlet_coverage_pct: "power",
  noise_policy: "environment",
  group_work_ok: "use_fit",
  food_policy: "use_fit",
  // Any saved or checked section adds a verification date.
  last_verified: null,
};

/** The structural slice of a spot that completeness depends on. DB rows and API spots both fit. */
export type V0Input = {
  directions: string | null;
  eligibility: Eligibility | null;
  seat_count: number | null;
  outlet_coverage_pct: number | null;
  noise_policy: NoisePolicy | null;
  group_work_ok: boolean | null;
  food_policy: FoodPolicy | null;
  /** True when at least one attribute group has a verification date. */
  has_verification: boolean;
};

/**
 * v0-required fields a spot still lacks. Used by the server publish check, the
 * client publish button, and bundle assembly, so all three agree. Hours are not
 * required: a spot with no hours this term publishes with hours_unconfirmed.
 */
export function missingV0Fields(spot: V0Input): V0Field[] {
  const missing: V0Field[] = [];
  if (spot.directions === null) missing.push("directions");
  if (spot.eligibility === null) missing.push("eligibility");
  if (spot.seat_count === null) missing.push("seat_count");
  if (spot.outlet_coverage_pct === null) missing.push("outlet_coverage_pct");
  if (spot.noise_policy === null) missing.push("noise_policy");
  if (spot.group_work_ok === null) missing.push("group_work_ok");
  if (spot.food_policy === null) missing.push("food_policy");
  if (!spot.has_verification) missing.push("last_verified");
  return missing;
}
```

- [ ] **Step 5: Write the response shapes and the API schemas**

Response schemas use plain strings and nullable fields so a legacy row (for example a scheme-less `reservation_url`) never makes a read fail; the form shows it and the strict request schema forces a fix on save.

`packages/core/src/survey/spot.ts`:

```ts
import { z } from "zod";
import {
  Amenity,
  AttributeGroup,
  CallsOk,
  CellSignal,
  DayType,
  Eligibility,
  EntryMethod,
  FoodPolicy,
  Fullness,
  Lighting,
  NoisePolicy,
  ReviewState,
  SeatType,
  SpotStatus,
  SurveyorRole,
  TableConfig,
  Temperature,
  TimeBlock,
} from "../enums.ts";
import { V0_FIELD, type V0Input } from "./missing.ts";
import { HoursRow } from "./sections.ts";

/*
 * Response shapes. They are deliberately looser than the request schemas
 * (plain strings, no URL checks) so a legacy row never makes a read fail.
 */

const IsoDateTime = z.iso.datetime();

export const SurveyorPublic = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: SurveyorRole,
  active: z.boolean(),
});
export type SurveyorPublic = z.infer<typeof SurveyorPublic>;

export const TermRef = z.object({ id: z.string(), name: z.string() });
export type TermRef = z.infer<typeof TermRef>;

export const SurveyPhoto = z.object({
  id: z.uuid(),
  spot_id: z.uuid(),
  /** Absolute data-site URL, null until the first publish after approval. */
  url: z.string().nullable(),
  taken_at: IsoDateTime,
  is_cover: z.boolean(),
  uploaded_by: z.uuid().nullable(),
  approved: z.boolean(),
  approved_at: IsoDateTime.nullable(),
});
export type SurveyPhoto = z.infer<typeof SurveyPhoto>;

export const SurveyEstimate = z.object({
  day_type: DayType,
  block: TimeBlock,
  bucket: Fullness,
  created_at: IsoDateTime,
});
export type SurveyEstimate = z.infer<typeof SurveyEstimate>;

/** Full editable spot for the survey form. */
export const SurveySpot = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: SpotStatus,
  review_state: ReviewState,
  version: z.number().int().positive(),
  last_edited_by: z.uuid().nullable(),
  /** Display name of last_edited_by, for "edited by" and the conflict view. */
  last_edited_by_name: z.string().nullable(),
  reviewed_by: z.uuid().nullable(),
  reviewed_by_name: z.string().nullable(),
  updated_at: IsoDateTime,
  // identity
  official_name: z.string(),
  common_name: z.string().nullable(),
  building_id: z.string(),
  floor: z.string(),
  lat: z.number(),
  lng: z.number(),
  directions: z.string().nullable(),
  outdoor: z.boolean(),
  seasonal: z.boolean(),
  // access
  eligibility: Eligibility.nullable(),
  eligibility_scope: z.string().nullable(),
  eligibility_verified: z.boolean(),
  entry_method: EntryMethod.nullable(),
  reservable: z.boolean(),
  reservation_system: z.string().nullable(),
  reservation_url: z.string().nullable(),
  // seating
  seat_count: z.number().int().nullable(),
  seat_types: z.array(z.object({ type: SeatType, count: z.number().int() })),
  table_configs: z.array(TableConfig),
  effective_capacity: z.number().int().nullable(),
  max_group_size: z.number().int().nullable(),
  spread_out_room: z.boolean().nullable(),
  // power
  outlet_coverage_pct: z.number().nullable(),
  usb_outlets: z.boolean().nullable(),
  wifi_mbps: z.number().nullable(),
  cell_signal: CellSignal.nullable(),
  // environment
  noise_policy: NoisePolicy.nullable(),
  natural_light: z.boolean().nullable(),
  lighting: Lighting.nullable(),
  temperature: Temperature.nullable(),
  temperature_consistent: z.boolean().nullable(),
  windows_view: z.boolean().nullable(),
  // use fit
  calls_ok: CallsOk.nullable(),
  group_work_ok: z.boolean().nullable(),
  whiteboard: z.boolean().nullable(),
  food_policy: FoodPolicy.nullable(),
  // amenities, accessibility, late night
  amenities: z.array(z.object({ amenity: Amenity, walk_minutes: z.number().int() })),
  step_free: z.boolean().nullable(),
  elevator: z.boolean().nullable(),
  accessible_seating: z.boolean().nullable(),
  open_past_midnight: z.boolean().nullable(),
  staffed_late: z.boolean().nullable(),
  lit_route_to_residences: z.boolean().nullable(),
  /** Current or next term (pickTerm); null when the campus has none. */
  term: TermRef.nullable(),
  /** Hours rows for `term` only. */
  hours: z.array(HoursRow),
  /** Latest estimate per day type and time block. */
  estimates: z.array(SurveyEstimate),
  verified: z.partialRecord(AttributeGroup, IsoDateTime),
  photos: z.array(SurveyPhoto),
  /** Server-computed missingV0Fields, so the publish button needs no extra logic. */
  missing: z.array(z.enum(V0_FIELD)),
});
export type SurveySpot = z.infer<typeof SurveySpot>;

/** The missingV0Fields input for a spot as the API returns it. */
export function v0InputOf(spot: SurveySpot): V0Input {
  return {
    directions: spot.directions,
    eligibility: spot.eligibility,
    seat_count: spot.seat_count,
    outlet_coverage_pct: spot.outlet_coverage_pct,
    noise_policy: spot.noise_policy,
    group_work_ok: spot.group_work_ok,
    food_policy: spot.food_policy,
    has_verification: Object.keys(spot.verified).length > 0,
  };
}

export const SpotSummary = z.object({
  id: z.uuid(),
  slug: z.string(),
  official_name: z.string(),
  common_name: z.string().nullable(),
  building_id: z.string(),
  building_name: z.string(),
  status: SpotStatus,
  review_state: ReviewState,
  version: z.number().int().positive(),
  last_edited_by: z.uuid().nullable(),
  last_edited_by_name: z.string().nullable(),
  updated_at: IsoDateTime,
  /** Oldest last_verified_at across groups; null when nothing is verified. */
  oldest_verified_at: IsoDateTime.nullable(),
  /** True when the spot has at least one hours row for the current term. */
  hours_confirmed: z.boolean(),
});
export type SpotSummary = z.infer<typeof SpotSummary>;

export const SpotList = z.object({ term: TermRef.nullable(), spots: z.array(SpotSummary) });
export type SpotList = z.infer<typeof SpotList>;
```

`packages/core/src/survey/api.ts`:

```ts
import { z } from "zod";
import { AttributeGroup, SurveyorRole } from "../enums.ts";
import { V0_FIELD } from "./missing.ts";
import { IdentitySection, SurveySection } from "./sections.ts";
import { SurveyorPublic, SurveyPhoto, SurveySpot } from "./spot.ts";

export const ClientWriteId = z.uuid();
export const BaseVersion = z.number().int().positive();

/** Largest accepted photo upload in bytes, after on-device resize. */
export const PHOTO_MAX_BYTES = 1_500_000;
export const PHOTO_CONTENT_TYPE = "image/jpeg";

/** Route params for routes ending in :id (spots, photos, surveyors). */
export const IdParams = z.object({ id: z.uuid() });

// Auth

/** 32 random bytes, base64url without padding. */
export const OpaqueToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const AcceptInviteRequest = z.object({
  token: OpaqueToken,
  display_name: z.string().trim().min(1).max(60).optional(),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

export const AcceptInviteResponse = z.object({ token: OpaqueToken, surveyor: SurveyorPublic });
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponse>;

export const CreateInviteRequest = z.object({
  role: SurveyorRole,
  /** Set for a re-login link for an existing surveyor; omitted for a new surveyor. */
  surveyor_id: z.uuid().optional(),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

export const CreateInviteResponse = z.object({ url: z.string(), expires_at: z.iso.datetime() });
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>;

export const SurveyorList = z.object({
  surveyors: z.array(SurveyorPublic.extend({ created_at: z.iso.datetime() })),
});
export type SurveyorList = z.infer<typeof SurveyorList>;

// Spots

export const SectionParams = z.object({ id: z.uuid(), section: SurveySection });

export const CreateSpotRequest = z.object({
  client_write_id: ClientWriteId,
  identity: IdentitySection,
});
export type CreateSpotRequest = z.infer<typeof CreateSpotRequest>;

/** `data` is checked against the section schema by SectionWrite once the section is known. */
export const SectionWriteRequest = z.object({
  client_write_id: ClientWriteId,
  base_version: BaseVersion,
  data: z.unknown(),
});
export type SectionWriteRequest = z.infer<typeof SectionWriteRequest>;

export const VerifyRequest = z.object({
  client_write_id: ClientWriteId,
  base_version: BaseVersion,
  groups: z
    .array(AttributeGroup)
    .min(1)
    .refine((g) => new Set(g).size === g.length, "each group once"),
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const ReviewRequest = z.object({
  client_write_id: ClientWriteId,
  base_version: BaseVersion,
});
export type ReviewRequest = z.infer<typeof ReviewRequest>;

/** Publish, unpublish, and photo cover, approve, reject. */
export const WriteRequest = z.object({ client_write_id: ClientWriteId });
export type WriteRequest = z.infer<typeof WriteRequest>;

// Photos

/** Text fields of the multipart photo upload; the `file` part is checked separately. */
export const PhotoUploadFields = z.object({
  spot_id: z.uuid(),
  client_write_id: ClientWriteId,
  /** Capture time from the phone. Clamped to the server clock when in the future. */
  taken_at: z.iso.datetime().optional(),
});
export type PhotoUploadFields = z.infer<typeof PhotoUploadFields>;

export const PendingPhotoList = z.object({
  photos: z.array(
    SurveyPhoto.extend({ spot_name: z.string(), uploaded_by_name: z.string().nullable() }),
  ),
});
export type PendingPhotoList = z.infer<typeof PendingPhotoList>;

// Publishing

export const PublishStatus = z.object({
  dirty: z.boolean(),
  running: z.boolean(),
  last_published_at: z.iso.datetime().nullable(),
  last_hash: z.string().nullable(),
  last_attempt_at: z.iso.datetime().nullable(),
  warnings: z.array(z.string()),
  last_error: z.string().nullable(),
});
export type PublishStatus = z.infer<typeof PublishStatus>;

// Errors

export const API_ERROR = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "invite_invalid",
  "invite_expired",
  "invite_used",
  "display_name_required",
  "version_conflict",
  "incomplete",
  "slug_taken",
  "unknown_building",
  "unknown_term",
  "write_id_reused",
  "photo_too_large",
  "photo_type",
  "internal",
] as const;
export const ApiErrorCode = z.enum(API_ERROR);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({ error: ApiErrorCode, message: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** 409 body: the client shows `current` in the conflict view. */
export const VersionConflict = z.object({
  error: z.literal("version_conflict"),
  current: SurveySpot,
});
export type VersionConflict = z.infer<typeof VersionConflict>;

/** 422 body from publish. */
export const Incomplete = z.object({
  error: z.literal("incomplete"),
  missing: z.array(z.enum(V0_FIELD)).min(1),
});
export type Incomplete = z.infer<typeof Incomplete>;
```

`packages/core/src/survey/index.ts`:

```ts
export * from "./api.ts";
export * from "./missing.ts";
export * from "./sections.ts";
export * from "./spot.ts";
```

`packages/core/src/index.ts`:

```ts
export * from "./bundle.ts";
export * from "./enums.ts";
export * from "./geo.ts";
export * from "./slots.ts";
export * from "./survey/index.ts";
export * from "./time.ts";
```

- [ ] **Step 6: Run the core tests**

Run: `bun test packages/core`
Expected: PASS.

- [ ] **Step 7: Use the core check in `toBundleSpot`**

The explicit null checks stay because TypeScript narrows the row's columns only through them; `missingV0Fields` decides the reported list. Full file:

`packages/db/src/bundle/spot.ts`:

```ts
import {
  AMENITY,
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  type BundleSpot,
  missingV0Fields,
  SEAT_TYPE,
  TABLE_CONFIG,
  type V0Field,
  type V0Input,
} from "@perch/core";
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

/** The completeness-relevant columns of a spot row. */
export function pickV0(r: SpotRow): Omit<V0Input, "has_verification"> {
  return {
    directions: r.directions,
    eligibility: r.eligibility,
    seat_count: r.seat_count,
    outlet_coverage_pct: r.outlet_coverage_pct,
    noise_policy: r.noise_policy,
    group_work_ok: r.group_work_ok,
    food_policy: r.food_policy,
  };
}

/** Sorts by position in an enum value array so output order never depends on row order. */
function byEnumOrder<T, K extends string>(order: readonly K[], key: (item: T) => K) {
  return (a: T, b: T): number => order.indexOf(key(a)) - order.indexOf(key(b));
}

export type SpotAssemblyResult = { ok: true; spot: BundleSpot } | { ok: false; missing: V0Field[] };

export function toBundleSpot(input: SpotAssemblyInput): SpotAssemblyResult {
  const r = input.row;
  const missing = missingV0Fields({
    ...pickV0(r),
    has_verification: input.verifications.length > 0,
  });
  const {
    directions,
    eligibility,
    seat_count,
    outlet_coverage_pct,
    noise_policy,
    group_work_ok,
    food_policy,
  } = r;
  // The null checks repeat missingV0Fields so TypeScript narrows the row's types.
  if (
    missing.length > 0 ||
    directions === null ||
    eligibility === null ||
    seat_count === null ||
    outlet_coverage_pct === null ||
    noise_policy === null ||
    group_work_ok === null ||
    food_policy === null
  ) {
    return { ok: false, missing };
  }

  // Insert keys in ATTRIBUTE_GROUP order so the serialized bundle is byte-stable.
  const verified: Partial<Record<AttributeGroup, string>> = {};
  for (const group of ATTRIBUTE_GROUP) {
    const v = input.verifications.find((x) => x.attribute_group === group);
    if (v) verified[group] = v.last_verified_at.toISOString();
  }

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
      directions,
      eligibility,
      eligibility_scope: r.eligibility_scope,
      eligibility_verified: r.eligibility_verified,
      entry_method: r.entry_method,
      reservable: r.reservable,
      reservation_system: r.reservation_system,
      reservation_url: r.reservation_url,
      seat_count,
      seat_types: [...input.seatTypes]
        .sort(byEnumOrder(SEAT_TYPE, (s) => s.type))
        .map((s) => ({ type: s.type, count: s.count })),
      table_configs: input.tableConfigs
        .map((t) => t.config)
        .sort(byEnumOrder(TABLE_CONFIG, (c) => c)),
      effective_capacity: r.effective_capacity,
      max_group_size: r.max_group_size,
      spread_out_room: r.spread_out_room,
      outlet_coverage_pct,
      usb_outlets: r.usb_outlets,
      wifi_mbps: r.wifi_mbps,
      cell_signal: r.cell_signal,
      noise_policy,
      natural_light: r.natural_light,
      lighting: r.lighting,
      temperature: r.temperature,
      temperature_consistent: r.temperature_consistent,
      windows_view: r.windows_view,
      calls_ok: r.calls_ok,
      group_work_ok,
      whiteboard: r.whiteboard,
      food_policy,
      amenities: [...input.amenities]
        .sort(byEnumOrder(AMENITY, (a) => a.amenity))
        .map((a) => ({ amenity: a.amenity, walk_minutes: a.walk_minutes })),
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

Run: `bun test packages/db`
Expected: PASS: the existing `spot.test.ts` and `buildBundle.test.ts` expectations (exact missing lists and warning strings) are unchanged.

- [ ] **Step 8: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/core packages/db/src/bundle/spot.ts
git commit -m "feat(core): add survey api contract and shared missingV0Fields"
```

---

### Task 3: Migrations 0002 and 0003: invites, photo blobs, review state, publish state

**Files:**
- Create: `packages/db/src/schema/types.ts` (bytea custom type)
- Modify: `packages/db/src/schema/enums.ts`, `survey.ts`, `spot.ts`, `ops.ts`
- Create (generated): `packages/db/drizzle/0002_drop_magic_link_and_r2_key.sql`, `packages/db/drizzle/0003_surveyor_tooling.sql`, `packages/db/drizzle/meta/0002_snapshot.json`, `packages/db/drizzle/meta/0003_snapshot.json`; Modify: `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/db/src/seed/seed.ts` (drop `r2_key`), `packages/db/src/bundle/spot.ts` (skip photos without a url), `packages/db/src/index.ts` (export `pickTerm`)
- Modify: `packages/db/test/schema.test.ts`, `packages/db/test/spot.test.ts`

**Interfaces:**
- Produces tables and columns: `invite(token_hash PK, role, surveyor_id null FK, created_by null FK, created_at, expires_at, used_at null)`; `photo_blob(sha256 PK, bytes bytea, content_type, byte_size, created_at)`; `spot.review_state` (`review_state` enum, default `unreviewed`), `spot.reviewed_by`, `spot.last_edited_by` (FK surveyor, null); `spot_photo.blob_sha256` (FK photo_blob, null); `write_receipt.response_json jsonb`; `bundle_state.write_seq int default 0`, `last_attempt_at`, `last_warnings jsonb`, `last_error`.
- Changes: `magic_link` dropped; `spot_photo.r2_key` dropped; `spot_photo.url`, `spot.noise_policy`, `surveyor.email` become nullable.
- Produces: `bytea` custom column type (`Uint8Array`); `review_state` pgEnum; exported `invite`, `photo_blob` tables; `pickTerm(terms, today)` and `TermRow` exported from `@perch/db`.
- Consumes: `REVIEW_STATE` from Task 2.

- [ ] **Step 1: Write the failing schema tests**

Full replacements of the two test files. `schema.test.ts` keeps the existing tests (minus `r2_key`) and adds four; `spot.test.ts` gains the new row fields and two cases.

`packages/db/test/schema.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  building,
  bundle_state,
  campus,
  invite,
  photo_blob,
  spot,
  spot_hours,
  spot_photo,
  spot_room,
  spot_seat_type,
  spotSelectSchema,
  surveyor,
  term,
  write_receipt,
} from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

async function withSpot() {
  const db = await createTestDb();
  await db
    .insert(campus)
    .values({ id: "sbu", name: "Stony Brook University", tz: "America/New_York" });
  await db.insert(term).values({
    id: "2026-fall",
    campus_id: "sbu",
    name: "Fall 2026",
    starts: "2026-08-24",
    ends: "2026-12-19",
  });
  await db.insert(building).values({
    id: "melville-library",
    campus_id: "sbu",
    name: "Melville Library",
    lat: 40.9154,
    lng: -73.1222,
  });

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
    Promise.resolve(
      db.execute(sql`insert into spot (slug, building_id, floor, official_name, lat, lng, noise_policy)
      values ('x', 'melville-library', '1', 'X', 0, 0, 'loud')`),
    ),
  ).rejects.toThrow();
});

test("spot_hours accepts valid rows and rejects bad day or time", async () => {
  const { db, row } = await withSpot();
  const base = { spot_id: row.id, term_id: "2026-fall", opens: "08:00", closes: "02:00" };
  await db.insert(spot_hours).values({ ...base, day_of_week: 0 });
  await db.insert(spot_hours).values({ ...base, day_of_week: 1, closes: "24:00" });
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 7 })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 2, opens: "8:00" })),
  ).rejects.toThrow();
});

test("a spot has at most one cover photo", async () => {
  const { db, row } = await withSpot();
  const photo = {
    spot_id: row.id,
    url: "https://example.org/a.jpg",
    taken_at: new Date(),
  };
  await db.insert(spot_photo).values({ ...photo, is_cover: true });
  await db.insert(spot_photo).values({ ...photo, is_cover: false });
  await expect(
    Promise.resolve(db.insert(spot_photo).values({ ...photo, is_cover: true })),
  ).rejects.toThrow();
});

test("spot_hours rejects opens at 24:00, bad last_entry, and duplicate slots", async () => {
  const { db, row } = await withSpot();
  const base = { spot_id: row.id, term_id: "2026-fall", opens: "08:00", closes: "24:00" };
  await db.insert(spot_hours).values({ ...base, day_of_week: 0, last_entry: "23:30" });
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 1, opens: "24:00" })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 1, last_entry: "9pm" })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 0 })),
  ).rejects.toThrow();
  // A second block on the same day with a different opening time is allowed.
  await db.insert(spot_hours).values({ ...base, day_of_week: 0, opens: "18:00" });
});

test("counts and capacities cannot be negative", async () => {
  const { db, row } = await withSpot();
  await expect(
    Promise.resolve(db.insert(spot_seat_type).values({ spot_id: row.id, type: "soft", count: -1 })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_room).values({ spot_id: row.id, name: "A", capacity: -1 })),
  ).rejects.toThrow();
  await db.insert(spot_room).values({ spot_id: row.id, name: "B", capacity: null });
});

test("pick_ping hour bucket stays within a day", async () => {
  const { db, row } = await withSpot();
  await db.execute(
    sql`insert into pick_ping (spot_id, day, hour_bucket) values (${row.id}, '2026-10-13', 23)`,
  );
  await expect(
    Promise.resolve(
      db.execute(
        sql`insert into pick_ping (spot_id, day, hour_bucket) values (${row.id}, '2026-10-13', 24)`,
      ),
    ),
  ).rejects.toThrow();
});

test("surveyor tooling columns have the expected defaults", async () => {
  const { db, row } = await withSpot();
  expect(row.review_state).toBe("unreviewed");
  expect(row.last_edited_by).toBeNull();
  const [draft] = await db
    .insert(spot)
    .values({
      slug: "no-noise-yet",
      building_id: "melville-library",
      floor: "1",
      official_name: "No Noise Yet",
      lat: 40.9,
      lng: -73.1,
    })
    .returning();
  expect(draft?.noise_policy).toBeNull();

  const [state] = await db.insert(bundle_state).values({ campus_id: "sbu" }).returning();
  expect(state?.write_seq).toBe(0);
  expect(state?.last_warnings).toBeNull();

  // magic_link was dropped by migration 0002.
  await expect(Promise.resolve(db.execute(sql`select * from magic_link`))).rejects.toThrow();
});

test("invites allow a null creator and enforce the surveyor reference", async () => {
  const { db } = await withSpot();
  const [s] = await db.insert(surveyor).values({ display_name: "Ana" }).returning();
  if (!s) throw new Error("insert returned nothing");
  expect(s.email).toBeNull();
  const expires_at = new Date("2026-10-15T00:00:00Z");
  await db.insert(invite).values({ token_hash: "a", role: "admin", expires_at });
  await db
    .insert(invite)
    .values({ token_hash: "b", role: "surveyor", surveyor_id: s.id, created_by: s.id, expires_at });
  await expect(
    Promise.resolve(
      db.insert(invite).values({
        token_hash: "c",
        role: "surveyor",
        surveyor_id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
        expires_at,
      }),
    ),
  ).rejects.toThrow();
});

test("photo blobs round-trip bytes exactly and photos must reference a blob", async () => {
  const { db, row } = await withSpot();
  const bytes = new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x7f, 0x80, 0xff, 0xd9]);
  await db
    .insert(photo_blob)
    .values({ sha256: "f".repeat(64), bytes, content_type: "image/jpeg", byte_size: 8 });
  const [blob] = await db.select().from(photo_blob);
  expect(blob ? Array.from(blob.bytes) : []).toEqual(Array.from(bytes));

  await db
    .insert(spot_photo)
    .values({ spot_id: row.id, blob_sha256: "f".repeat(64), taken_at: new Date() });
  await expect(
    Promise.resolve(
      db
        .insert(spot_photo)
        .values({ spot_id: row.id, blob_sha256: "0".repeat(64), taken_at: new Date() }),
    ),
  ).rejects.toThrow();
});

test("write receipts store a json response", async () => {
  const { db } = await withSpot();
  const [s] = await db.insert(surveyor).values({ display_name: "Ana" }).returning();
  if (!s) throw new Error("insert returned nothing");
  const id = "0b7e7f8e-3f3a-4c55-8d5e-1e2f3a4b5c6d";
  const response = { kind: "spot.create", status: 201, body: { id: "x" } };
  await db
    .insert(write_receipt)
    .values({ client_write_id: id, surveyor_id: s.id, response_json: response });
  const [r] = await db.select().from(write_receipt);
  expect(r?.response_json).toEqual(response);
});
```

`packages/db/test/spot.test.ts`:

```ts
import { expect, test } from "bun:test";
import { BundleSpot } from "@perch/core";
import type { SpotRow, VerificationRow } from "../src/bundle/spot.ts";
import { toBundleSpot } from "../src/bundle/spot.ts";

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
  review_state: "unreviewed",
  reviewed_by: null,
  version: 1,
  last_edited_by: null,
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

const identity: VerificationRow = {
  spot_id: base.id,
  attribute_group: "identity",
  last_verified_at: new Date("2026-10-01T15:00:00Z"),
  source: "survey",
  confidence: "estimated",
};

const empty = {
  seatTypes: [],
  tableConfigs: [],
  amenities: [],
  verifications: [identity],
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

test("a spot with no verification rows is missing last_verified", () => {
  const r = toBundleSpot({ row: { ...base, directions: null }, ...empty, verifications: [] });
  expect(r).toEqual({ ok: false, missing: ["directions", "last_verified"] });
});

test("verification dates and photos are included, cover first", () => {
  const at = new Date("2026-10-05T15:00:00Z");
  const r = toBundleSpot({
    row: base,
    ...empty,
    verifications: [
      {
        spot_id: base.id,
        attribute_group: "hours",
        last_verified_at: at,
        source: "official",
        confidence: "measured",
      },
    ],
    approvedPhotos: [
      {
        id: "p1",
        spot_id: base.id,
        url: "https://example.org/a.jpg",
        blob_sha256: null,
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
        blob_sha256: null,
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

test("a missing noise policy blocks the spot", () => {
  const r = toBundleSpot({ row: { ...base, noise_policy: null }, ...empty });
  expect(r).toEqual({ ok: false, missing: ["noise_policy"] });
});

test("an approved photo without a url yet is left out", () => {
  const at = new Date("2026-10-05T15:00:00Z");
  const r = toBundleSpot({
    row: base,
    ...empty,
    approvedPhotos: [
      {
        id: "p1",
        spot_id: base.id,
        url: null,
        blob_sha256: "ab".repeat(32),
        taken_at: at,
        is_cover: true,
        uploaded_by: null,
        approved_by: "s",
        approved_at: at,
      },
    ],
  });
  if (!r.ok) throw new Error("expected ok");
  expect(r.spot.photos).toEqual([]);
});
```

Run: `bun test packages/db/test/schema.test.ts`
Expected: FAIL: `invite`, `photo_blob`, `write_receipt.response_json` do not exist yet.

- [ ] **Step 2: Generate migration 0002: the drops only**

drizzle-kit asks interactively whether a new table or column is a rename of a dropped one (probe: `invite` vs `magic_link`, `blob_sha256` vs `r2_key`). That prompt crashes without a TTY, so the drops go in their own migration first; the additions in 0003 then generate without a prompt.

In `packages/db/src/schema/survey.ts`, delete:

```ts
export const magic_link = pgTable("magic_link", {
  token_hash: text().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  expires_at: ts().notNull(),
  used_at: ts(),
});

```

In `packages/db/src/schema/spot.ts`, delete:

```ts
    r2_key: text().notNull(),
```

Run: `bun run db:generate --name drop_magic_link_and_r2_key`
Expected: creates `packages/db/drizzle/0002_drop_magic_link_and_r2_key.sql` containing exactly:

```sql
DROP TABLE "magic_link" CASCADE;--> statement-breakpoint
ALTER TABLE "spot_photo" DROP COLUMN "r2_key";
```

- [ ] **Step 3: Write the new schema**

Full files. `photo_blob` lives in `spot.ts` next to `spot_photo`, which references it.

`packages/db/src/schema/types.ts`:

```ts
import { customType } from "drizzle-orm/pg-core";

/** Postgres bytea as a Uint8Array (postgres.js returns a Buffer, PGlite a Uint8Array). */
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});
```

`packages/db/src/schema/enums.ts`:

```ts
import {
  AMENITY,
  ATTRIBUTE_GROUP,
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
  REVIEW_STATE,
  SEAT_TYPE,
  SPOT_STATUS,
  SURVEYOR_ROLE,
  TABLE_CONFIG,
  TEMPERATURE,
  TIME_BLOCK,
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
export const review_state = pgEnum("review_state", REVIEW_STATE);
```

`packages/db/src/schema/survey.ts`:

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
  /** Optional: invite-based surveyors have no email in v0. */
  email: text().unique(),
  display_name: text().notNull(),
  role: surveyor_role().notNull().default("surveyor"),
  invited_by: uuid().references((): AnyPgColumn => surveyor.id),
  active: boolean().notNull().default(true),
  created_at: ts().notNull().defaultNow(),
});

/**
 * Single-use invite link. Only the SHA-256 of the token is stored. surveyor_id set
 * means a re-login link for that surveyor; null means a new surveyor. created_by is
 * null for the bootstrap admin invite.
 */
export const invite = pgTable("invite", {
  token_hash: text().primaryKey(),
  role: surveyor_role().notNull(),
  surveyor_id: uuid().references(() => surveyor.id),
  created_by: uuid().references(() => surveyor.id),
  created_at: ts().notNull().defaultNow(),
  expires_at: ts().notNull(),
  used_at: ts(),
});

/** id is the SHA-256 hex of the bearer token. */
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
  /** {kind, status, body} of the first successful response, replayed on retries. */
  response_json: jsonb(),
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

`packages/db/src/schema/spot.ts`:

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
  review_state,
  seat_type,
  spot_status,
  table_config,
  temperature,
  verification_source,
} from "./enums.ts";
import { surveyor } from "./survey.ts";
import { bytea } from "./types.ts";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/**
 * v0-required fields beyond identity (directions, eligibility, seat_count,
 * outlet_coverage_pct, noise_policy, food_policy, group_work_ok) are nullable
 * here so a surveyor can save a draft section by section. Completeness is
 * checked by missingV0Fields on publish and when building the bundle.
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
    review_state: review_state().notNull().default("unreviewed"),
    reviewed_by: uuid().references(() => surveyor.id),
    version: integer().notNull().default(1),
    last_edited_by: uuid().references(() => surveyor.id),
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
    noise_policy: noise_policy(),
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
  (t) => [
    primaryKey({ columns: [t.spot_id, t.type] }),
    check("spot_seat_type_count_nonnegative", sql`${t.count} >= 0`),
  ],
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

export const spot_room = pgTable(
  "spot_room",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    name: text().notNull(),
    capacity: integer(),
    reservable: boolean().notNull().default(false),
  },
  // A null capacity passes: SQL checks treat unknown as satisfied.
  (t) => [check("spot_room_capacity_nonnegative", sql`${t.capacity} >= 0`)],
);

/** "24:00" is allowed for closes and last_entry (end of day), never for opens. */
const OPENS_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";
const TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$";

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
    check("spot_hours_opens_format", sql`${t.opens} ~ ${sql.raw(`'${OPENS_PATTERN}'`)}`),
    check("spot_hours_closes_format", sql`${t.closes} ~ ${sql.raw(`'${TIME_PATTERN}'`)}`),
    check("spot_hours_last_entry_format", sql`${t.last_entry} ~ ${sql.raw(`'${TIME_PATTERN}'`)}`),
    uniqueIndex("spot_hours_slot_unique").on(
      t.spot_id,
      t.term_id,
      t.day_of_week,
      t.is_exam,
      t.opens,
    ),
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
  (t) => [
    primaryKey({ columns: [t.spot_id, t.amenity] }),
    check("spot_amenity_walk_minutes_nonnegative", sql`${t.walk_minutes} >= 0`),
  ],
);

/** Photo bytes keyed by content hash. Published as photos/<sha256>.jpg on the data site. */
export const photo_blob = pgTable("photo_blob", {
  sha256: text().primaryKey(),
  bytes: bytea().notNull(),
  content_type: text().notNull(),
  byte_size: integer().notNull(),
  created_at: createdAt(),
});

/**
 * is_cover marks the postcard front photo; at most one per spot. url is the
 * absolute data-site URL, set by the publisher, null before the first publish.
 */
export const spot_photo = pgTable(
  "spot_photo",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    url: text(),
    blob_sha256: text().references(() => photo_blob.sha256),
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

`packages/db/src/schema/ops.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
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

/**
 * Publish state per campus. write_seq increases on every data write so a publish
 * only clears dirty when no write landed while it ran.
 */
export const bundle_state = pgTable("bundle_state", {
  campus_id: text()
    .primaryKey()
    .references(() => campus.id),
  dirty: boolean().notNull().default(false),
  write_seq: integer().notNull().default(0),
  last_published_at: ts(),
  last_hash: text(),
  last_deploy_hook_at: ts(),
  last_attempt_at: ts(),
  last_warnings: jsonb(),
  last_error: text(),
});

/** Anonymous pick event: spot, day, hour only. No device or IP. Rolled up nightly then deleted. */
export const pick_ping = pgTable(
  "pick_ping",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    day: date().notNull(),
    hour_bucket: smallint().notNull(),
  },
  (t) => [check("pick_ping_hour_bucket_range", sql`${t.hour_bucket} between 0 and 23`)],
);

export const pick_daily = pgTable(
  "pick_daily",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    day: date().notNull(),
    count: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spot_id, t.day] }),
    check("pick_daily_count_nonnegative", sql`${t.count} >= 0`),
  ],
);
```

- [ ] **Step 4: Generate migration 0003**

Run: `bun run db:generate --name surveyor_tooling`
Expected: creates `packages/db/drizzle/0003_surveyor_tooling.sql` with no prompt, containing:

```sql
CREATE TYPE "public"."review_state" AS ENUM('unreviewed', 'reviewed');--> statement-breakpoint
CREATE TABLE "photo_blob" (
	"sha256" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"role" "surveyor_role" NOT NULL,
	"surveyor_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "spot" ALTER COLUMN "noise_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spot_photo" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surveyor" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "write_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "last_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "review_state" "review_state" DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "last_edited_by" uuid;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD COLUMN "blob_sha256" text;--> statement-breakpoint
ALTER TABLE "write_receipt" ADD COLUMN "response_json" jsonb;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_surveyor_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot" ADD CONSTRAINT "spot_reviewed_by_surveyor_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot" ADD CONSTRAINT "spot_last_edited_by_surveyor_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD CONSTRAINT "spot_photo_blob_sha256_photo_blob_sha256_fk" FOREIGN KEY ("blob_sha256") REFERENCES "public"."photo_blob"("sha256") ON DELETE no action ON UPDATE no action;
```

- [ ] **Step 5: Update the seed, bundle assembly, and exports**

In `packages/db/src/seed/seed.ts`, delete:

```ts
        r2_key: "sample/crr-1.jpg",
```

In `packages/db/src/seed/seed.ts`, delete:

```ts
        r2_key: "sample/crr-2-unapproved.jpg",
```

`spot_photo.url` is now set by the publisher (Task 8), so an approved photo can briefly have no url. It is left out of the bundle instead of failing `httpUrl`:

In `packages/db/src/bundle/spot.ts`, replace:

```ts
      photos: [...input.approvedPhotos]
        .sort((a, b) => Number(b.is_cover) - Number(a.is_cover))
        .map((p) => ({ url: p.url, taken_at: p.taken_at.toISOString(), is_cover: p.is_cover })),
```

with:

```ts
      // A photo without a url has not been through a publish yet, so it is left out.
      photos: [...input.approvedPhotos]
        .sort((a, b) => Number(b.is_cover) - Number(a.is_cover))
        .flatMap((p) =>
          p.url === null
            ? []
            : [{ url: p.url, taken_at: p.taken_at.toISOString(), is_cover: p.is_cover }],
        ),
```

`packages/db/src/index.ts`:

```ts
export * from "./bundle/buildBundle.ts";
export * from "./bundle/term.ts";
export * from "./client.ts";
export * from "./schema/index.ts";
```

- [ ] **Step 6: Run the db tests, the smoke, and the drift check**

Run: `bun test packages/db && bun run smoke:node`
Expected: PASS; `smoke ok on node: 4 spots, 0 warnings`.

Run: `bun run db:generate`
Expected: `No schema changes, nothing to migrate`.

- [ ] **Step 7: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/db
git commit -m "feat(db)!: add invites, photo blobs, review and publish state" -m "BREAKING CHANGE: magic_link and spot_photo.r2_key are dropped; spot_photo.url, spot.noise_policy, and surveyor.email are nullable."
```

---

### Task 4: Auth: invites, bearer sessions, guards, admin bootstrap

**Files:**
- Create: `apps/server/src/auth/tokens.ts`, `sessions.ts`, `invites.ts`, `guards.ts`
- Create: `apps/server/src/routes/auth.ts`, `apps/server/src/routes/admin.ts`
- Create: `apps/server/scripts/admin-invite.ts`
- Create: `apps/server/test/helpers.ts`, `apps/server/test/auth.test.ts`; Modify: `apps/server/test/health.test.ts` (use the shared setup)
- Modify: `apps/server/src/app.ts`, `package.json` (`admin:invite`), `.github/workflows/ci.yml` (bootstrap step)

**Interfaces:**
- Produces: `newToken(): string` (32 random bytes, base64url, 43 chars), `hashToken(token): string` (SHA-256 hex). Uses `node:crypto` only.
- Produces: `SESSION_TTL_MS`, `type AuthedSurveyor = SurveyorPublic & { sessionId: string }`, `createSession(db: Db, surveyorId: string, now: Date): Promise<string>`, `bearerToken(header: string | undefined): string | null`, `authenticate(db: Db, header: string | undefined, now: Date): Promise<AuthedSurveyor | null>`, `deleteSession(db: Db, sessionId: string): Promise<void>`.
- Produces: `INVITE_TTL_MS`, `type CreatedInvite = { token: string; url: string; expires_at: Date }`, `createInvite(db: Db, opts: { role: SurveyorRole; surveyorId: string | null; createdBy: string | null; now: Date; webOrigin: string }): Promise<CreatedInvite>`, `type AcceptedInvite = { token: string; surveyor: SurveyorPublic }`, `acceptInvite(db: Db, opts: { token: string; displayName: string | undefined; now: Date }): Promise<AcceptedInvite>`, `revokeSurveyor(db: Db, surveyorId: string): Promise<SurveyorPublic>`, `bootstrapAdminInvite(db: Db, opts: { displayName: string; now: Date; webOrigin: string }): Promise<CreatedInvite>`.
- Produces: `type AuthDeps = { db: Db; clock: Clock }`, `requireSurveyor(deps: AuthDeps, req: FastifyRequest): Promise<AuthedSurveyor>` (401), `requireAdmin(deps: AuthDeps, req: FastifyRequest): Promise<AuthedSurveyor>` (401 or 403).
- Produces routes: `POST /auth/accept`, `GET /auth/me`, `POST /auth/logout` (204), `POST /admin/invites`, `POST /admin/surveyors/:id/revoke`.
- Produces test helpers: `NOW`, `WEB_ORIGIN`, `testClock()`, `setup(): Promise<TestContext>`, `signIn(ctx, role?, name?): Promise<SignedIn>`, `body(res): unknown`, `writeId()`.
- Consumes: `invite`, `auth_session`, `surveyor` tables (Task 3); `OpaqueToken`, `SurveyorPublic`, request schemas (Task 2).

- [ ] **Step 1: Write the test helpers and failing auth tests**

Every time in auth comes from the injected clock, never from Postgres `now()`, so app and DB clock skew cannot shift expiry. The tests move that clock.

`apps/server/test/helpers.ts`:

```ts
import { type Db, surveyor } from "@perch/db";
import { type SeedIds, seed } from "@perch/db/seed";
import { createTestDb } from "@perch/db/testing";
import type { LightMyRequestResponse } from "fastify";
import { type App, buildApp } from "../src/app.ts";
import { createSession } from "../src/auth/sessions.ts";
import type { Clock } from "../src/clock.ts";

export const NOW = new Date("2026-10-13T18:00:00Z");
export const WEB_ORIGIN = "https://perch.pages.dev";

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

export type TestContext = { app: App; db: Db; ids: SeedIds; clock: TestClock };

/** Seeded PGlite database plus an app on a controllable clock. */
export async function setup(): Promise<TestContext> {
  const db = await createTestDb();
  const ids = await seed(db);
  const clock = testClock();
  const app = await buildApp({ db, clock, config: { webOrigin: WEB_ORIGIN, campusId: "sbu" } });
  return { app, db, ids, clock };
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
```

`apps/server/test/auth.test.ts`:

```ts
import { expect, test } from "bun:test";
import { AcceptInviteResponse, CreateInviteResponse } from "@perch/core";
import { auth_session, invite, surveyor } from "@perch/db";
import { eq } from "drizzle-orm";
import { bootstrapAdminInvite, createInvite } from "../src/auth/invites.ts";
import { SESSION_TTL_MS } from "../src/auth/sessions.ts";
import { hashToken } from "../src/auth/tokens.ts";
import { body, setup, signIn, type TestContext, WEB_ORIGIN } from "./helpers.ts";

const HOUR = 60 * 60 * 1000;

async function newInvite(ctx: TestContext, role: "surveyor" | "admin" = "surveyor") {
  return createInvite(ctx.db, {
    role,
    surveyorId: null,
    createdBy: ctx.ids.adminId,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
}

function accept(ctx: TestContext, token: string, display_name?: string) {
  return ctx.app.inject({
    method: "POST",
    url: "/auth/accept",
    payload: display_name === undefined ? { token } : { token, display_name },
  });
}

test("an admin creates an invite link and only the hash is stored", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin");
  const res = await ctx.app.inject({
    method: "POST",
    url: "/admin/invites",
    headers: admin.headers,
    payload: { role: "surveyor" },
  });
  expect(res.statusCode).toBe(200);
  const created = CreateInviteResponse.parse(body(res));
  expect(created.url.startsWith(`${WEB_ORIGIN}/invite/`)).toBe(true);
  expect(created.expires_at).toBe("2026-10-15T18:00:00.000Z");
  const token = created.url.slice(`${WEB_ORIGIN}/invite/`.length);
  const rows = await ctx.db.select().from(invite);
  expect(rows.map((r) => r.token_hash)).toEqual([hashToken(token)]);
  expect(JSON.stringify(rows)).not.toContain(token);
});

test("accepting creates the surveyor and a working session", async () => {
  const ctx = await setup();
  const inv = await newInvite(ctx);
  const res = await accept(ctx, inv.token, "  Ana  ");
  expect(res.statusCode).toBe(200);
  const accepted = AcceptInviteResponse.parse(body(res));
  expect(accepted.surveyor).toMatchObject({ display_name: "Ana", role: "surveyor", active: true });

  const me = await ctx.app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${accepted.token}` },
  });
  expect(me.statusCode).toBe(200);
  expect(body(me)).toEqual(accepted.surveyor);
  const [row] = await ctx.db.select().from(surveyor).where(eq(surveyor.id, accepted.surveyor.id));
  expect(row?.invited_by).toBe(ctx.ids.adminId);
});

test("a new-surveyor invite needs a display name and stays usable without one", async () => {
  const ctx = await setup();
  const inv = await newInvite(ctx);
  const res = await accept(ctx, inv.token);
  expect(res.statusCode).toBe(422);
  expect(body(res)).toMatchObject({ error: "display_name_required" });
  expect((await accept(ctx, inv.token, "Ana")).statusCode).toBe(200);
});

test("an invite cannot be reused, even by two concurrent accepts", async () => {
  const ctx = await setup();
  const inv = await newInvite(ctx);
  const [a, b] = await Promise.all([accept(ctx, inv.token, "A"), accept(ctx, inv.token, "B")]);
  expect([a.statusCode, b.statusCode].sort()).toEqual([200, 410]);
  const again = await accept(ctx, inv.token, "C");
  expect(again.statusCode).toBe(410);
  expect(body(again)).toEqual({ error: "invite_used" });
  const names = (await ctx.db.select().from(surveyor)).map((s) => s.display_name);
  expect(names.filter((n) => n === "A" || n === "B" || n === "C")).toHaveLength(1);
});

test("an invite expires exactly 48 hours after creation by the server clock", async () => {
  const ctx = await setup();
  const early = await newInvite(ctx);
  const late = await newInvite(ctx);
  ctx.clock.advance(48 * HOUR - 1);
  expect((await accept(ctx, early.token, "Ana")).statusCode).toBe(200);
  ctx.clock.advance(1);
  const res = await accept(ctx, late.token, "Bo");
  expect(res.statusCode).toBe(410);
  expect(body(res)).toEqual({ error: "invite_expired" });
});

test("an unknown or malformed token is rejected", async () => {
  const ctx = await setup();
  const unknown = await accept(ctx, "A".repeat(43), "Ana");
  expect(unknown.statusCode).toBe(410);
  expect(body(unknown)).toEqual({ error: "invite_invalid" });
  expect((await accept(ctx, "short", "Ana")).statusCode).toBe(400);
});

test("a re-login invite attaches to the existing surveyor", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const inv = await createInvite(ctx.db, {
    role: "surveyor",
    surveyorId: ana.id,
    createdBy: ctx.ids.adminId,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await accept(ctx, inv.token);
  expect(res.statusCode).toBe(200);
  const accepted = AcceptInviteResponse.parse(body(res));
  expect(accepted.surveyor.id).toBe(ana.id);
  expect(accepted.surveyor.display_name).toBe("Ana");
  expect(accepted.token).not.toBe(ana.token);
});

test("revoke ends sessions, voids open invites, and blocks the surveyor", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  const pending = await createInvite(ctx.db, {
    role: "surveyor",
    surveyorId: ana.id,
    createdBy: admin.id,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${ana.id}/revoke`,
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toMatchObject({ id: ana.id, active: false });
  expect(
    await ctx.db.select().from(auth_session).where(eq(auth_session.surveyor_id, ana.id)),
  ).toEqual([]);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/auth/me", headers: ana.headers })).statusCode,
  ).toBe(401);
  // A link issued before the revoke must not bring the surveyor back.
  expect((await accept(ctx, pending.token)).statusCode).toBe(410);

  const self = await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${admin.id}/revoke`,
    headers: admin.headers,
  });
  expect(self.statusCode).toBe(403);
});

test("401 without a valid session, 403 for a surveyor on admin routes", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx);
  const create = (headers: Record<string, string>) =>
    ctx.app.inject({ method: "POST", url: "/admin/invites", headers, payload: { role: "admin" } });
  expect((await create({})).statusCode).toBe(401);
  expect((await create({ authorization: "Bearer nope" })).statusCode).toBe(401);
  expect((await create({ authorization: `Basic ${ana.token}` })).statusCode).toBe(401);
  const forbidden = await create(ana.headers);
  expect(forbidden.statusCode).toBe(403);
  expect(body(forbidden)).toEqual({ error: "forbidden" });
});

test("sessions expire at 30 days exactly and renew past the halfway point", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx);
  const me = () => ctx.app.inject({ method: "GET", url: "/auth/me", headers: ana.headers });
  const expiry = async () =>
    (await ctx.db.select().from(auth_session).where(eq(auth_session.surveyor_id, ana.id)))[0]
      ?.expires_at;
  const start = ctx.clock.now().getTime();

  ctx.clock.advance(SESSION_TTL_MS / 2);
  expect((await me()).statusCode).toBe(200);
  expect((await expiry())?.getTime()).toBe(start + SESSION_TTL_MS);

  ctx.clock.advance(1);
  expect((await me()).statusCode).toBe(200);
  const renewed = start + SESSION_TTL_MS / 2 + 1 + SESSION_TTL_MS;
  expect((await expiry())?.getTime()).toBe(renewed);

  ctx.clock.set(new Date(renewed));
  expect((await me()).statusCode).toBe(401);
});

test("logout deletes only the current session", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx);
  const out = await ctx.app.inject({ method: "POST", url: "/auth/logout", headers: ana.headers });
  expect(out.statusCode).toBe(204);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/auth/me", headers: ana.headers })).statusCode,
  ).toBe(401);
});

test("bootstrap creates an admin and a re-login link for them", async () => {
  const ctx = await setup();
  const created = await bootstrapAdminInvite(ctx.db, {
    displayName: "Founder",
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await accept(ctx, created.token);
  expect(res.statusCode).toBe(200);
  expect(AcceptInviteResponse.parse(body(res)).surveyor).toMatchObject({
    display_name: "Founder",
    role: "admin",
  });
});
```

`apps/server/test/health.test.ts`:

```ts
import { expect, test } from "bun:test";
import { body, setup, WEB_ORIGIN } from "./helpers.ts";

test("GET /health answers ok", async () => {
  const { app } = await setup();
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toEqual({ ok: true });
});

test("unknown routes return a not_found code", async () => {
  const { app } = await setup();
  const res = await app.inject({ method: "GET", url: "/nope" });
  expect(res.statusCode).toBe(404);
  expect(body(res)).toEqual({ error: "not_found" });
});

test("CORS allows only the web origin, with Authorization and PUT", async () => {
  const { app } = await setup();
  const preflight = (origin: string) =>
    app.inject({
      method: "OPTIONS",
      url: "/survey/spots/x/identity",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const ok = await preflight(WEB_ORIGIN);
  expect(ok.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
  expect(String(ok.headers["access-control-allow-methods"])).toContain("PUT");
  expect(String(ok.headers["access-control-allow-headers"])).toContain("authorization");
  expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();

  const evil = await preflight("https://evil.example");
  expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
});
```

Run: `bun test apps/server/test/auth.test.ts`
Expected: FAIL: `Cannot find module '../src/auth/invites.ts'`.

- [ ] **Step 2: Implement tokens and sessions**

`apps/server/src/auth/tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as base64url without padding (43 characters). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex. Only hashes of invite and session tokens are stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

`apps/server/src/auth/sessions.ts`:

```ts
import { OpaqueToken, type SurveyorPublic } from "@perch/core";
import { auth_session, type Db, surveyor } from "@perch/db";
import { eq } from "drizzle-orm";
import { hashToken, newToken } from "./tokens.ts";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthedSurveyor = SurveyorPublic & { sessionId: string };

/** Creates a session and returns the bearer token. Times come from the app clock, never the DB. */
export async function createSession(db: Db, surveyorId: string, now: Date): Promise<string> {
  const token = newToken();
  await db.insert(auth_session).values({
    id: hashToken(token),
    surveyor_id: surveyorId,
    created_at: now,
    expires_at: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer (\S+)$/.exec(header);
  const parsed = OpaqueToken.safeParse(match?.[1]);
  return parsed.success ? parsed.data : null;
}

/**
 * The active surveyor behind a bearer token, or null. A session expires at
 * expires_at exactly. Past half its lifetime it is renewed to a fresh 30 days.
 */
export async function authenticate(
  db: Db,
  header: string | undefined,
  now: Date,
): Promise<AuthedSurveyor | null> {
  const token = bearerToken(header);
  if (token === null) return null;
  const sessionId = hashToken(token);
  const [row] = await db
    .select({
      expires_at: auth_session.expires_at,
      id: surveyor.id,
      display_name: surveyor.display_name,
      role: surveyor.role,
      active: surveyor.active,
    })
    .from(auth_session)
    .innerJoin(surveyor, eq(surveyor.id, auth_session.surveyor_id))
    .where(eq(auth_session.id, sessionId));
  if (!row?.active || row.expires_at.getTime() <= now.getTime()) return null;

  if (row.expires_at.getTime() - now.getTime() < SESSION_TTL_MS / 2) {
    await db
      .update(auth_session)
      .set({ expires_at: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(auth_session.id, sessionId));
  }
  return {
    id: row.id,
    display_name: row.display_name,
    role: row.role,
    active: row.active,
    sessionId,
  };
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.delete(auth_session).where(eq(auth_session.id, sessionId));
}
```

- [ ] **Step 3: Implement invites**

Acceptance is one conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now RETURNING`, so two concurrent accepts cannot both win. A failed accept is classified (`invite_used`, `invite_expired`, `invite_invalid`) for the three invite screen messages in the copy deck. Revoke deletes the surveyor's unused invites so an old re-login link cannot reactivate them.

`apps/server/src/auth/invites.ts`:

```ts
import type { SurveyorPublic, SurveyorRole } from "@perch/core";
import { auth_session, type Db, invite, surveyor } from "@perch/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { HttpError } from "../http.ts";
import { createSession } from "./sessions.ts";
import { hashToken, newToken } from "./tokens.ts";

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export type CreatedInvite = { token: string; url: string; expires_at: Date };

export async function createInvite(
  db: Db,
  opts: {
    role: SurveyorRole;
    surveyorId: string | null;
    createdBy: string | null;
    now: Date;
    webOrigin: string;
  },
): Promise<CreatedInvite> {
  if (opts.surveyorId !== null) {
    const [target] = await db
      .select({ id: surveyor.id })
      .from(surveyor)
      .where(eq(surveyor.id, opts.surveyorId));
    if (!target) throw new HttpError(404, { error: "not_found" });
  }
  const token = newToken();
  const expires_at = new Date(opts.now.getTime() + INVITE_TTL_MS);
  await db.insert(invite).values({
    token_hash: hashToken(token),
    role: opts.role,
    surveyor_id: opts.surveyorId,
    created_by: opts.createdBy,
    created_at: opts.now,
    expires_at,
  });
  return { token, url: `${opts.webOrigin}/invite/${token}`, expires_at };
}

/** Why an invite could not be used, for the right message on the invite screen. */
async function inviteError(db: Db, token: string, now: Date): Promise<HttpError> {
  const [row] = await db
    .select()
    .from(invite)
    .where(eq(invite.token_hash, hashToken(token)));
  if (!row) return new HttpError(410, { error: "invite_invalid" });
  if (row.used_at !== null) return new HttpError(410, { error: "invite_used" });
  if (row.expires_at.getTime() <= now.getTime()) {
    return new HttpError(410, { error: "invite_expired" });
  }
  return new HttpError(410, { error: "invite_invalid" });
}

export type AcceptedInvite = { token: string; surveyor: SurveyorPublic };

const publicColumns = {
  id: surveyor.id,
  display_name: surveyor.display_name,
  role: surveyor.role,
  active: surveyor.active,
};

/**
 * Consumes an invite and opens a session in one transaction. The conditional
 * update makes acceptance single-use even when two requests race. Any error
 * rolls back, leaving the invite unused.
 */
export async function acceptInvite(
  db: Db,
  opts: { token: string; displayName: string | undefined; now: Date },
): Promise<AcceptedInvite> {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invite)
      .set({ used_at: opts.now })
      .where(
        and(
          eq(invite.token_hash, hashToken(opts.token)),
          isNull(invite.used_at),
          gt(invite.expires_at, opts.now),
        ),
      )
      .returning();
    if (!inv) throw await inviteError(tx, opts.token, opts.now);

    let who: SurveyorPublic | undefined;
    if (inv.surveyor_id !== null) {
      // Re-login link: an admin issued it after any revoke, so it reactivates.
      [who] = await tx
        .update(surveyor)
        .set({ active: true, role: inv.role })
        .where(eq(surveyor.id, inv.surveyor_id))
        .returning(publicColumns);
    } else {
      if (opts.displayName === undefined) {
        throw new HttpError(422, { error: "display_name_required", message: "Add a name." });
      }
      [who] = await tx
        .insert(surveyor)
        .values({ display_name: opts.displayName, role: inv.role, invited_by: inv.created_by })
        .returning(publicColumns);
    }
    if (!who) throw new HttpError(410, { error: "invite_invalid" });
    const token = await createSession(tx, who.id, opts.now);
    return { token, surveyor: who };
  });
}

/** Deactivates a surveyor, ends their sessions, and voids their unused invites. */
export async function revokeSurveyor(db: Db, surveyorId: string): Promise<SurveyorPublic> {
  return db.transaction(async (tx) => {
    const [who] = await tx
      .update(surveyor)
      .set({ active: false })
      .where(eq(surveyor.id, surveyorId))
      .returning(publicColumns);
    if (!who) throw new HttpError(404, { error: "not_found" });
    await tx.delete(auth_session).where(eq(auth_session.surveyor_id, surveyorId));
    await tx.delete(invite).where(and(eq(invite.surveyor_id, surveyorId), isNull(invite.used_at)));
    return who;
  });
}

/** Bootstrap: creates an admin surveyor with no creator and returns a link for them. */
export async function bootstrapAdminInvite(
  db: Db,
  opts: { displayName: string; now: Date; webOrigin: string },
): Promise<CreatedInvite> {
  return db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(surveyor)
      .values({ display_name: opts.displayName, role: "admin" })
      .returning({ id: surveyor.id });
    if (!admin) throw new Error("failed to insert admin");
    return createInvite(tx, {
      role: "admin",
      surveyorId: admin.id,
      createdBy: null,
      now: opts.now,
      webOrigin: opts.webOrigin,
    });
  });
}
```

`apps/server/src/auth/guards.ts`:

```ts
import type { Db } from "@perch/db";
import type { FastifyRequest } from "fastify";
import type { Clock } from "../clock.ts";
import { HttpError } from "../http.ts";
import { type AuthedSurveyor, authenticate } from "./sessions.ts";

export type AuthDeps = { db: Db; clock: Clock };

/** The active surveyor making the request, or a 401. */
export async function requireSurveyor(
  deps: AuthDeps,
  req: FastifyRequest,
): Promise<AuthedSurveyor> {
  const who = await authenticate(deps.db, req.headers.authorization, deps.clock.now());
  if (!who) throw new HttpError(401, { error: "unauthorized" });
  return who;
}

/** An active admin, a 401 without a valid session, or a 403 for a plain surveyor. */
export async function requireAdmin(deps: AuthDeps, req: FastifyRequest): Promise<AuthedSurveyor> {
  const who = await requireSurveyor(deps, req);
  if (who.role !== "admin") throw new HttpError(403, { error: "forbidden" });
  return who;
}
```

- [ ] **Step 4: Add the auth and admin routes**

`apps/server/src/routes/auth.ts`:

```ts
import { AcceptInviteRequest, AcceptInviteResponse, SurveyorPublic } from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { acceptInvite } from "../auth/invites.ts";
import { deleteSession } from "../auth/sessions.ts";

export function authRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/auth/accept",
      { schema: { body: AcceptInviteRequest, response: { 200: AcceptInviteResponse } } },
      async (req) =>
        acceptInvite(deps.db, {
          token: req.body.token,
          displayName: req.body.display_name,
          now: deps.clock.now(),
        }),
    );

    app.get("/auth/me", { schema: { response: { 200: SurveyorPublic } } }, async (req) => {
      const { sessionId: _, ...me } = await requireSurveyor(deps, req);
      return me;
    });

    app.post("/auth/logout", async (req, reply) => {
      const me = await requireSurveyor(deps, req);
      await deleteSession(deps.db, me.sessionId);
      return reply.code(204).send();
    });
  };
}
```

`apps/server/src/routes/admin.ts`:

```ts
import {
  CreateInviteRequest,
  CreateInviteResponse,
  IdParams,
  SurveyorPublic,
} from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireAdmin } from "../auth/guards.ts";
import { createInvite, revokeSurveyor } from "../auth/invites.ts";
import { HttpError } from "../http.ts";

export function adminRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/admin/invites",
      { schema: { body: CreateInviteRequest, response: { 200: CreateInviteResponse } } },
      async (req) => {
        const admin = await requireAdmin(deps, req);
        const created = await createInvite(deps.db, {
          role: req.body.role,
          surveyorId: req.body.surveyor_id ?? null,
          createdBy: admin.id,
          now: deps.clock.now(),
          webOrigin: deps.config.webOrigin,
        });
        return { url: created.url, expires_at: created.expires_at.toISOString() };
      },
    );

    app.post(
      "/admin/surveyors/:id/revoke",
      { schema: { params: IdParams, response: { 200: SurveyorPublic } } },
      async (req) => {
        const admin = await requireAdmin(deps, req);
        if (admin.id === req.params.id) {
          throw new HttpError(403, { error: "forbidden", message: "cannot revoke yourself" });
        }
        return revokeSurveyor(deps.db, req.params.id);
      },
    );
  };
}
```

In `apps/server/src/app.ts`, replace:

```ts
import { healthRoutes } from "./routes/health.ts";
```

with:

```ts
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { healthRoutes } from "./routes/health.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
  await app.register(healthRoutes);
```

with:

```ts
  await app.register(healthRoutes);
  await app.register(authRoutes(deps));
  await app.register(adminRoutes(deps));
```

Run: `bun test apps/server`
Expected: PASS.

- [ ] **Step 5: Add the bootstrap script**

`apps/server/scripts/admin-invite.ts`:

```ts
import { openDb } from "@perch/db";
import { z } from "zod";
import { bootstrapAdminInvite } from "../src/auth/invites.ts";

/** Usage: bun run admin:invite "<display name>" with DATABASE_URL and WEB_ORIGIN set. */
const Args = z.object({
  name: z.string().trim().min(1).max(60),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).refine((u) => new URL(u).origin === u),
});

const parsed = Args.safeParse({ ...process.env, name: process.argv[2] });
if (!parsed.success) {
  console.error(`usage: bun run admin:invite "<name>"\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const { db, close } = openDb(parsed.data.DATABASE_URL);
try {
  const invite = await bootstrapAdminInvite(db, {
    displayName: parsed.data.name,
    now: new Date(),
    webOrigin: parsed.data.WEB_ORIGIN,
  });
  console.log(
    `admin invite for ${parsed.data.name}, valid until ${invite.expires_at.toISOString()}:`,
  );
  console.log(invite.url);
} finally {
  await close();
}
```

In `package.json`, replace:

```json
    "db:seed": "node packages/db/scripts/seed.ts",
```

with:

```json
    "db:seed": "node packages/db/scripts/seed.ts",
    "admin:invite": "node apps/server/scripts/admin-invite.ts",
```

In `.github/workflows/ci.yml`, replace:

```yaml
      - name: Server smoke against Postgres (Node)
```

with:

```yaml
      - name: Bootstrap admin invite
        run: bun run admin:invite "CI Admin"
        env:
          WEB_ORIGIN: http://localhost:5173

      - name: Server smoke against Postgres (Node)
```

Run: `bun run admin:invite`
Expected: exit 1 with `usage: bun run admin:invite "<name>"` and the missing `DATABASE_URL` and `WEB_ORIGIN`. (CI runs it for real against Postgres.)

- [ ] **Step 6: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server package.json .github/workflows/ci.yml
git commit -m "feat(server): add invites, bearer sessions, and admin bootstrap"
```

---

### Task 5: Write pipeline `withWrite`

**Files:**
- Create: `apps/server/src/writes/withWrite.ts`, `apps/server/test/withWrite.test.ts`
- Modify: `apps/server/src/app.ts` (`publisher` dep), `apps/server/src/main.ts` (no-op publisher until Task 8), `apps/server/test/helpers.ts` (`fakePublisher`)

**Interfaces:**
- Produces: `type Tx` (a Drizzle transaction; assignable to `Db`), `type AuditEntry = { entity; entity_id; action; before: unknown; after: unknown }`, `type WriteOutcome<T> = { status: 200 | 201; body: T; audit: AuditEntry | null; dirty: boolean }`, `type WriteResult<T> = { status: 200 | 201; body: T; replayed: boolean }`, `type PublishQueue = { schedule(): void }`, `type WriteDeps = { db: Db; campusId: string; publisher: PublishQueue }`, `type WriteInfo<T> = { surveyorId; clientWriteId; kind: string; schema: z.ZodType<T> }`.
- Produces: `withWrite<T>(deps: WriteDeps, info: WriteInfo<T>, fn: (tx: Tx) => Promise<WriteOutcome<T>>): Promise<WriteResult<T>>`.
- Produces: `AppDeps.publisher: PublishQueue` (Task 8 narrows it to `Publisher`); test helpers `FakePublisher`, `fakePublisher()`, `TestContext.publisher`.
- Consumes: `write_receipt.response_json`, `audit_log`, `bundle_state.write_seq` (Task 3); `HttpError` (Task 1).

- [ ] **Step 1: Give the app a publish queue**

In `apps/server/src/app.ts`, replace:

```ts
import { healthRoutes } from "./routes/health.ts";
```

with:

```ts
import { healthRoutes } from "./routes/health.ts";
import type { PublishQueue } from "./writes/withWrite.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
  config: AppConfig;
  logger?: boolean;
```

with:

```ts
  config: AppConfig;
  publisher: PublishQueue;
  logger?: boolean;
```

In `apps/server/src/main.ts`, replace:

```ts
  config: { webOrigin: env.WEB_ORIGIN, campusId: env.CAMPUS_ID },
  logger: true,
```

with:

```ts
  config: { webOrigin: env.WEB_ORIGIN, campusId: env.CAMPUS_ID },
  // Replaced by the real Publisher in Task 8.
  publisher: { schedule: () => {} },
  logger: true,
```

In `apps/server/test/helpers.ts`, replace:

```ts
export type TestContext = { app: App; db: Db; ids: SeedIds; clock: TestClock };

/** Seeded PGlite database plus an app on a controllable clock. */
export async function setup(): Promise<TestContext> {
  const db = await createTestDb();
  const ids = await seed(db);
  const clock = testClock();
  const app = await buildApp({ db, clock, config: { webOrigin: WEB_ORIGIN, campusId: "sbu" } });
  return { app, db, ids, clock };
}
```

with:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

These cover the review-focus cases: a crash after a partial write leaves nothing (and the same id then runs for real), a 409 is not stored, a reused id from another surveyor or route is rejected, and two concurrent sends of one id run once.

`apps/server/test/withWrite.test.ts`:

```ts
import { expect, test } from "bun:test";
import { audit_log, bundle_state, spot, write_receipt } from "@perch/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "../src/http.ts";
import { type Tx, type WriteOutcome, withWrite } from "../src/writes/withWrite.ts";
import { setup, signIn, type TestContext, writeId } from "./helpers.ts";

const Body = z.object({ name: z.string() });
type Body = z.infer<typeof Body>;

function deps(ctx: TestContext) {
  return { db: ctx.db, campusId: "sbu", publisher: ctx.publisher };
}

/** Renames the seed draft spot, so effects are visible and roll back. */
function rename(
  ctx: TestContext,
  name: string,
  opts: { dirty?: boolean; failAfter?: boolean } = {},
) {
  let calls = 0;
  const fn = async (tx: Tx): Promise<WriteOutcome<Body>> => {
    calls += 1;
    await tx
      .update(spot)
      .set({ official_name: name })
      .where(eq(spot.id, ctx.ids.spotIds["union-draft"]));
    if (opts.failAfter) throw new Error("crash after a partial write");
    return {
      status: 201,
      body: { name },
      audit: { entity: "spot", entity_id: "x", action: "rename", before: null, after: { name } },
      dirty: opts.dirty ?? false,
    };
  };
  return { fn, calls: () => calls };
}

async function draftName(ctx: TestContext): Promise<string | undefined> {
  const [row] = await ctx.db.select().from(spot).where(eq(spot.id, ctx.ids.spotIds["union-draft"]));
  return row?.official_name;
}

test("a write runs once; a replay returns the stored response without running", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const id = writeId();
  const info = { surveyorId: me.id, clientWriteId: id, kind: "test.rename", schema: Body };
  const first = rename(ctx, "First");
  expect(await withWrite(deps(ctx), info, first.fn)).toEqual({
    status: 201,
    body: { name: "First" },
    replayed: false,
  });
  const second = rename(ctx, "Second");
  expect(await withWrite(deps(ctx), info, second.fn)).toEqual({
    status: 201,
    body: { name: "First" },
    replayed: true,
  });
  expect(second.calls()).toBe(0);
  expect(await draftName(ctx)).toBe("First");
  expect(await ctx.db.select().from(audit_log)).toHaveLength(1);
  const [receipt] = await ctx.db.select().from(write_receipt);
  expect(receipt?.response_json).toEqual({
    kind: "test.rename",
    status: 201,
    body: { name: "First" },
  });
});

test("a crash mid-transaction leaves no receipt, audit, or partial data", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  await expect(
    withWrite(deps(ctx), info, rename(ctx, "Half", { failAfter: true }).fn),
  ).rejects.toThrow("crash after a partial write");
  expect(await draftName(ctx)).toBe("Union Lobby Tables");
  expect(await ctx.db.select().from(write_receipt)).toEqual([]);
  expect(await ctx.db.select().from(audit_log)).toEqual([]);

  // The client retries the same id after the crash and it runs for real.
  const retry = rename(ctx, "Whole");
  const result = await withWrite(deps(ctx), info, retry.fn);
  expect(result.replayed).toBe(false);
  expect(retry.calls()).toBe(1);
  expect(await draftName(ctx)).toBe("Whole");
});

test("an HttpError such as a 409 is not stored, so the same id can succeed later", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  const conflict = async (): Promise<WriteOutcome<Body>> => {
    throw new HttpError(409, { error: "version_conflict" });
  };
  await expect(withWrite(deps(ctx), info, conflict)).rejects.toThrow(HttpError);
  expect(await ctx.db.select().from(write_receipt)).toEqual([]);
  expect((await withWrite(deps(ctx), info, rename(ctx, "Later").fn)).replayed).toBe(false);
});

test("an id reused by another surveyor or another kind is rejected", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const id = writeId();
  await withWrite(
    deps(ctx),
    { surveyorId: ana.id, clientWriteId: id, kind: "test.rename", schema: Body },
    rename(ctx, "Ana's").fn,
  );
  const asBo = withWrite(
    deps(ctx),
    { surveyorId: bo.id, clientWriteId: id, kind: "test.rename", schema: Body },
    rename(ctx, "Bo's").fn,
  );
  await expect(asBo).rejects.toMatchObject({ status: 422, body: { error: "write_id_reused" } });
  const otherKind = withWrite(
    deps(ctx),
    { surveyorId: ana.id, clientWriteId: id, kind: "test.other", schema: Body },
    rename(ctx, "Other").fn,
  );
  await expect(otherKind).rejects.toMatchObject({ status: 422 });
  expect(await draftName(ctx)).toBe("Ana's");
});

test("a dirty write marks the bundle, bumps write_seq, and schedules a publish once", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  await withWrite(deps(ctx), info, rename(ctx, "A", { dirty: true }).fn);
  await withWrite(deps(ctx), info, rename(ctx, "A", { dirty: true }).fn);
  await withWrite(
    deps(ctx),
    { ...info, clientWriteId: writeId() },
    rename(ctx, "B", { dirty: true }).fn,
  );
  await withWrite(deps(ctx), { ...info, clientWriteId: writeId() }, rename(ctx, "C").fn);
  const [state] = await ctx.db.select().from(bundle_state).where(eq(bundle_state.campus_id, "sbu"));
  expect(state?.dirty).toBe(true);
  expect(state?.write_seq).toBe(2);
  expect(ctx.publisher.scheduled).toBe(2);
});

test("two concurrent sends of the same id run the write once", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  const a = rename(ctx, "A");
  const b = rename(ctx, "B");
  const [ra, rb] = await Promise.all([
    withWrite(deps(ctx), info, a.fn),
    withWrite(deps(ctx), info, b.fn),
  ]);
  expect(a.calls() + b.calls()).toBe(1);
  expect(ra.body).toEqual(rb.body);
  expect([ra.replayed, rb.replayed].sort()).toEqual([false, true]);
});
```

Run: `bun test apps/server/test/withWrite.test.ts`
Expected: FAIL: `Cannot find module '../src/writes/withWrite.ts'`.

- [ ] **Step 3: Implement `withWrite`**

The spec's order (check receipt, run, insert receipt at the end) lets an outbox retry that overlaps a slow original run the write twice, or 409 against itself. Claiming the receipt row first makes Postgres serialize the two: the retry's `INSERT ... ON CONFLICT DO NOTHING` waits on the original's uncommitted row, then sees it and replays `response_json`.

`apps/server/src/writes/withWrite.ts`:

```ts
import { audit_log, bundle_state, type Db, write_receipt } from "@perch/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "../http.ts";

/** A transaction handle. Drizzle transactions are databases too, so helpers take `Db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type AuditEntry = {
  entity: string;
  entity_id: string;
  action: string;
  before: unknown;
  after: unknown;
};

export type WriteOutcome<T> = {
  status: 200 | 201;
  body: T;
  audit: AuditEntry | null;
  /** True when the write changes what the published bundle would contain. */
  dirty: boolean;
};

export type WriteResult<T> = { status: 200 | 201; body: T; replayed: boolean };

/** Anything that can be told a publish is due. The Publisher implements it. */
export type PublishQueue = { schedule(): void };

export type WriteDeps = { db: Db; campusId: string; publisher: PublishQueue };

export type WriteInfo<T> = {
  surveyorId: string;
  clientWriteId: string;
  /** Route-level name, e.g. "spot.section". A reused id with another kind is rejected. */
  kind: string;
  /** Response schema, used to re-validate a replayed body. */
  schema: z.ZodType<T>;
};

const StoredResponse = z.object({
  kind: z.string(),
  status: z.union([z.literal(200), z.literal(201)]),
  body: z.unknown(),
});

/**
 * Runs one client write exactly once.
 *
 * The receipt row is claimed first with INSERT ... ON CONFLICT DO NOTHING. A retry
 * that overlaps the original blocks on that row until the original commits, then
 * sees the stored response instead of running again. Anything thrown inside `fn`
 * (including 409 and 422 HttpErrors) rolls back the receipt with everything else,
 * so the client can retry with the same id.
 */
export async function withWrite<T>(
  deps: WriteDeps,
  info: WriteInfo<T>,
  fn: (tx: Tx) => Promise<WriteOutcome<T>>,
): Promise<WriteResult<T>> {
  const result = await deps.db.transaction(async (tx) => {
    const claimed = await tx
      .insert(write_receipt)
      .values({ client_write_id: info.clientWriteId, surveyor_id: info.surveyorId })
      .onConflictDoNothing()
      .returning({ id: write_receipt.client_write_id });

    if (claimed.length === 0) {
      const [prior] = await tx
        .select()
        .from(write_receipt)
        .where(eq(write_receipt.client_write_id, info.clientWriteId));
      const stored = StoredResponse.safeParse(prior?.response_json);
      if (
        !prior ||
        prior.surveyor_id !== info.surveyorId ||
        !stored.success ||
        stored.data.kind !== info.kind
      ) {
        throw new HttpError(422, {
          error: "write_id_reused",
          message: "This change id was already used for a different change.",
        });
      }
      const replayed = info.schema.parse(stored.data.body);
      return { status: stored.data.status, body: replayed, replayed: true, dirty: false };
    }

    const outcome = await fn(tx);
    if (outcome.audit) {
      await tx.insert(audit_log).values({
        surveyor_id: info.surveyorId,
        entity: outcome.audit.entity,
        entity_id: outcome.audit.entity_id,
        action: outcome.audit.action,
        before_json: outcome.audit.before,
        after_json: outcome.audit.after,
      });
    }
    await tx
      .update(write_receipt)
      .set({ response_json: { kind: info.kind, status: outcome.status, body: outcome.body } })
      .where(eq(write_receipt.client_write_id, info.clientWriteId));
    if (outcome.dirty) {
      await tx
        .insert(bundle_state)
        .values({ campus_id: deps.campusId, dirty: true, write_seq: 1 })
        .onConflictDoUpdate({
          target: bundle_state.campus_id,
          set: { dirty: true, write_seq: sql`${bundle_state.write_seq} + 1` },
        });
    }
    return { status: outcome.status, body: outcome.body, replayed: false, dirty: outcome.dirty };
  });

  if (result.dirty) deps.publisher.schedule();
  return { status: result.status, body: result.body, replayed: result.replayed };
}
```

Run: `bun test apps/server`
Expected: PASS.

- [ ] **Step 4: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server
git commit -m "feat(server): add idempotent write pipeline with audit and dirty flag"
```

---

### Task 6: Spot routes: list, detail, create, section writes, verify, publish, unpublish, review

**Files:**
- Create: `apps/server/src/spots/load.ts`, `apps/server/src/spots/write.ts`, `apps/server/src/writes/spotWrite.ts`, `apps/server/src/routes/spots.ts`
- Create: `apps/server/test/fixtures.ts`, `apps/server/test/spots.test.ts`
- Modify: `apps/server/src/app.ts` (register spot routes)

**Interfaces:**
- Produces: `currentTerm(db: Db, campusId: string, now: Date): Promise<TermRow | null>`, `loadSurveySpot(db: Db, id: string, currentTermRow: TermRow | null): Promise<SurveySpot | null>`, `listSurveySpots(db: Db, campusId: string, now: Date): Promise<SpotList>`.
- Produces: `type SpotWriteContext = { surveyorId: string; role: SurveyorRole; now: Date; campusId: string; term: TermRow | null }`, `spotOr404(db: Db, id: string, termRow: TermRow | null): Promise<SurveySpot>`, `checkVersion(current: SurveySpot, baseVersion: number): void` (409 `{ error: "version_conflict", current }`), `stampVerified(db: Db, spotId: string, groups: readonly AttributeGroup[], now: Date): Promise<void>`.
- Produces (each returns `Promise<WriteOutcome<SurveySpot>>`): `createDraft(db: Db, ctx: SpotWriteContext, identity: IdentitySection)`, `writeSection(db: Db, ctx: SpotWriteContext, spotId: string, baseVersion: number, write: SectionWrite)`, `verifyGroups(db: Db, ctx: SpotWriteContext, spotId: string, baseVersion: number, groups: readonly AttributeGroup[])`, `publishSpot(db: Db, ctx: SpotWriteContext, spotId: string)` (422 `{ error: "incomplete", missing }`), `unpublishSpot(db: Db, ctx: SpotWriteContext, spotId: string)` (403 unless admin), `reviewSpot(db: Db, ctx: SpotWriteContext, spotId: string, baseVersion: number)`.
- Produces: `type SpotWriter = (me: AuthedSurveyor, clientWriteId: string, kind: string, fn: (tx: Tx, ctx: SpotWriteContext) => Promise<WriteOutcome<SurveySpot>>) => Promise<WriteResult<SurveySpot>>`, `spotWriter(deps: AppDeps): SpotWriter` (withWrite with `schema: SurveySpot`, term and clock resolved once per write).
- Produces routes: `GET /survey/spots`, `GET /survey/spots/:id`, `POST /survey/spots` (201), `PUT /survey/spots/:id/:section`, `POST /survey/spots/:id/verify`, `/publish`, `/unpublish` (admin), `/review`.
- Produces test fixtures: `identity(overrides?)`, `COMPLETING_SECTIONS: SectionWrite[]`.
- Consumes: Task 2 schemas, Task 3 columns, Task 4 guards, Task 5 `withWrite`.

- [ ] **Step 1: Write fixtures and failing tests**

`apps/server/test/fixtures.ts`:

```ts
import type { IdentitySection, SectionWrite } from "@perch/core";

/** Identity for a new draft in a seed building. */
export function identity(overrides: Partial<IdentitySection> = {}): IdentitySection {
  return {
    slug: "frey-lounge",
    official_name: "Frey Hall Lounge",
    common_name: null,
    building_id: "student-union",
    floor: "2",
    lat: 40.9172,
    lng: -73.122,
    directions: "Second floor, left of the stairs.",
    outdoor: false,
    seasonal: false,
    ...overrides,
  };
}

/** Section writes that make a draft from identity() publishable, in a sensible order. */
export const COMPLETING_SECTIONS: SectionWrite[] = [
  {
    section: "access",
    data: {
      eligibility: "all_students",
      eligibility_scope: null,
      eligibility_verified: true,
      entry_method: "open",
      reservable: false,
      reservation_system: null,
      reservation_url: null,
    },
  },
  {
    section: "seating",
    data: {
      seat_count: 30,
      seat_types: [
        { type: "soft", count: 10 },
        { type: "table_chair", count: 20 },
      ],
      table_configs: ["small_2_4"],
      effective_capacity: null,
      max_group_size: 4,
      spread_out_room: false,
    },
  },
  {
    section: "power",
    data: { outlet_coverage_pct: 0.5, usb_outlets: false, wifi_mbps: null, cell_signal: "ok" },
  },
  {
    section: "environment",
    data: {
      noise_policy: "conversational",
      natural_light: true,
      lighting: "bright",
      temperature: "neutral",
      temperature_consistent: true,
      windows_view: true,
    },
  },
  {
    section: "use_fit",
    data: { calls_ok: "allowed", group_work_ok: true, whiteboard: false, food_policy: "food_ok" },
  },
];
```

`apps/server/test/spots.test.ts`:

```ts
import { expect, test } from "bun:test";
import { type SectionWrite, SpotList, SurveySpot, VersionConflict } from "@perch/core";
import {
  audit_log,
  buildBundle,
  bundle_state,
  spot,
  spot_hours,
  write_receipt,
} from "@perch/db";
import { and, eq } from "drizzle-orm";
import { COMPLETING_SECTIONS, identity } from "./fixtures.ts";
import { body, NOW, type SignedIn, setup, signIn, type TestContext, writeId } from "./helpers.ts";

const HOUR = 60 * 60 * 1000;

function create(ctx: TestContext, who: SignedIn, id = writeId(), overrides = {}) {
  return ctx.app.inject({
    method: "POST",
    url: "/survey/spots",
    headers: who.headers,
    payload: { client_write_id: id, identity: identity(overrides) },
  });
}

function put(
  ctx: TestContext,
  who: SignedIn,
  spotId: string,
  baseVersion: number,
  write: SectionWrite,
  id = writeId(),
) {
  return ctx.app.inject({
    method: "PUT",
    url: `/survey/spots/${spotId}/${write.section}`,
    headers: who.headers,
    payload: { client_write_id: id, base_version: baseVersion, data: write.data },
  });
}

function post(ctx: TestContext, who: SignedIn, path: string, payload: object) {
  return ctx.app.inject({ method: "POST", url: path, headers: who.headers, payload });
}

async function newDraft(ctx: TestContext, who: SignedIn): Promise<SurveySpot> {
  const res = await create(ctx, who);
  expect(res.statusCode).toBe(201);
  return SurveySpot.parse(body(res));
}

/** Applies COMPLETING_SECTIONS in order and returns the final spot. */
async function complete(ctx: TestContext, who: SignedIn, draft: SurveySpot): Promise<SurveySpot> {
  let current = draft;
  for (const write of COMPLETING_SECTIONS) {
    const res = await put(ctx, who, current.id, current.version, write);
    expect(res.statusCode).toBe(200);
    current = SurveySpot.parse(body(res));
  }
  return current;
}

test("survey routes require a session", async () => {
  const ctx = await setup();
  expect((await ctx.app.inject({ method: "GET", url: "/survey/spots" })).statusCode).toBe(401);
  const res = await ctx.app.inject({
    method: "POST",
    url: "/survey/spots",
    payload: { client_write_id: writeId(), identity: identity() },
  });
  expect(res.statusCode).toBe(401);
});

test("the list summarizes every spot with verification age and hours state", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const res = await ctx.app.inject({ method: "GET", url: "/survey/spots", headers: me.headers });
  expect(res.statusCode).toBe(200);
  const list = SpotList.parse(body(res));
  expect(list.term).toEqual({ id: "2026-fall", name: "Fall 2026" });
  expect(list.spots).toHaveLength(5);
  const crr = list.spots.find((s) => s.slug === "central-reading-room");
  expect(crr).toMatchObject({
    building_name: "Melville Library",
    status: "published",
    review_state: "unreviewed",
    oldest_verified_at: "2026-10-01T15:00:00.000Z",
    hours_confirmed: true,
  });
  const draft = list.spots.find((s) => s.slug === "union-draft");
  expect(draft).toMatchObject({
    status: "draft",
    oldest_verified_at: null,
    hours_confirmed: false,
  });
});

test("a spot detail includes current-term hours, estimates, photos, and missing fields", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  const res = await ctx.app.inject({
    method: "GET",
    url: `/survey/spots/${crrId}`,
    headers: me.headers,
  });
  expect(res.statusCode).toBe(200);
  const crr = SurveySpot.parse(body(res));
  expect(crr.term?.id).toBe("2026-fall");
  expect(crr.hours).toHaveLength(7);
  expect(crr.hours[0]).toEqual({
    day_of_week: 0,
    opens: "08:00",
    closes: "02:00",
    last_entry: null,
    is_exam: false,
  });
  expect(crr.estimates.map((e) => e.bucket)).toEqual(["filling"]);
  expect(crr.photos.map((p) => p.approved).sort()).toEqual([false, true]);
  expect(crr.missing).toEqual([]);

  const draft = SurveySpot.parse(
    body(
      await ctx.app.inject({
        method: "GET",
        url: `/survey/spots/${ctx.ids.spotIds["union-draft"]}`,
        headers: me.headers,
      }),
    ),
  );
  expect(draft.missing).toContain("last_verified");

  const unknown = await ctx.app.inject({
    method: "GET",
    url: "/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    headers: me.headers,
  });
  expect(unknown.statusCode).toBe(404);
  const local = await ctx.app.inject({
    method: "GET",
    url: "/survey/spots/local:8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    headers: me.headers,
  });
  expect(local.statusCode).toBe(400);
});

test("a legacy row that fails request rules still reads, so the form can fix it", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const nrrId = ctx.ids.spotIds["north-reading-room"];
  await ctx.db
    .update(spot)
    .set({ reservable: true, reservation_url: "libcal.stonybrook.edu/x" })
    .where(eq(spot.id, nrrId));
  const res = await ctx.app.inject({
    method: "GET",
    url: `/survey/spots/${nrrId}`,
    headers: me.headers,
  });
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).reservation_url).toBe("libcal.stonybrook.edu/x");
});

test("creating a draft stamps identity and replays without a duplicate", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const id = writeId();
  const first = await create(ctx, me, id);
  expect(first.statusCode).toBe(201);
  const draft = SurveySpot.parse(body(first));
  expect(draft).toMatchObject({
    status: "draft",
    version: 1,
    review_state: "unreviewed",
    last_edited_by: me.id,
    noise_policy: null,
  });
  expect(draft.verified).toEqual({ identity: NOW.toISOString() });
  expect(draft.missing).toEqual([
    "eligibility",
    "seat_count",
    "outlet_coverage_pct",
    "noise_policy",
    "group_work_ok",
    "food_policy",
  ]);

  const replay = await create(ctx, me, id);
  expect(replay.statusCode).toBe(201);
  expect(SurveySpot.parse(body(replay)).id).toBe(draft.id);
  const list = SpotList.parse(
    body(await ctx.app.inject({ method: "GET", url: "/survey/spots", headers: me.headers })),
  );
  expect(list.spots.filter((s) => s.slug === "frey-lounge")).toHaveLength(1);
});

test("a taken slug or unknown building is a 422 and stores nothing", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const taken = await create(ctx, me, writeId(), { slug: "sac-lounge" });
  expect(taken.statusCode).toBe(422);
  expect(body(taken)).toMatchObject({ error: "slug_taken" });
  const nowhere = await create(ctx, me, writeId(), { building_id: "atlantis" });
  expect(body(nowhere)).toMatchObject({ error: "unknown_building" });
  expect(await ctx.db.select().from(write_receipt)).toEqual([]);
});

test("a section write bumps version, stamps verification, and audits", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  ctx.clock.advance(HOUR);
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  const res = await put(ctx, me, draft.id, 1, access);
  expect(res.statusCode).toBe(200);
  const after = SurveySpot.parse(body(res));
  expect(after.version).toBe(2);
  expect(after.eligibility).toBe("all_students");
  expect(after.verified.access).toBe(new Date(NOW.getTime() + HOUR).toISOString());
  expect(after.updated_at).toBe(new Date(NOW.getTime() + HOUR).toISOString());
  const audits = await ctx.db.select().from(audit_log).where(eq(audit_log.entity_id, draft.id));
  expect(audits.map((a) => a.action)).toEqual(["create", "section.access"]);
  expect(audits[1]?.surveyor_id).toBe(me.id);
});

test("a stale base_version is a 409 with the current spot and changes nothing", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const draft = await newDraft(ctx, ana);
  const [access, seating] = COMPLETING_SECTIONS;
  if (!access || !seating) throw new Error("fixture missing");
  expect((await put(ctx, ana, draft.id, 1, access)).statusCode).toBe(200);

  const id = writeId();
  const stale = await put(ctx, bo, draft.id, 1, seating, id);
  expect(stale.statusCode).toBe(409);
  const conflict = VersionConflict.parse(body(stale));
  expect(conflict.current.version).toBe(2);
  expect(conflict.current.seat_count).toBeNull();
  expect(
    await ctx.db.select().from(write_receipt).where(eq(write_receipt.client_write_id, id)),
  ).toEqual([]);

  // "Keep mine": the same write re-sent on the new base succeeds.
  const kept = await put(ctx, bo, draft.id, 2, seating, id);
  expect(kept.statusCode).toBe(200);
  expect(SurveySpot.parse(body(kept)).seat_count).toBe(30);
});

test("replaying a section write returns the stored spot and bumps version once", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  const id = writeId();
  const a = await put(ctx, me, draft.id, 1, access, id);
  const b = await put(ctx, me, draft.id, 1, access, id);
  expect(b.statusCode).toBe(200);
  expect(body(b)).toEqual(body(a));
  expect(SurveySpot.parse(body(b)).version).toBe(2);
});

test("bad section data or an unknown section is a 400", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const bad = await ctx.app.inject({
    method: "PUT",
    url: `/survey/spots/${draft.id}/power`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, data: { outlet_coverage_pct: 2 } },
  });
  expect(bad.statusCode).toBe(400);
  const unknown = await ctx.app.inject({
    method: "PUT",
    url: `/survey/spots/${draft.id}/photos`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, data: {} },
  });
  expect(unknown.statusCode).toBe(400);
});

test("hours replace one term's rows only and reject an unknown term", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  await ctx.db.insert(spot_hours).values({
    spot_id: crrId,
    term_id: "2027-spring",
    day_of_week: 0,
    opens: "09:00",
    closes: "17:00",
  });
  const row = {
    day_of_week: 4,
    opens: "10:00",
    closes: "24:00",
    last_entry: "23:30",
    is_exam: false,
  };
  const res = await put(ctx, me, crrId, 1, {
    section: "hours",
    data: { term_id: "2026-fall", rows: [row] },
  });
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).hours).toEqual([row]);
  const spring = await ctx.db
    .select()
    .from(spot_hours)
    .where(and(eq(spot_hours.spot_id, crrId), eq(spot_hours.term_id, "2027-spring")));
  expect(spring).toHaveLength(1);

  const unknown = await put(ctx, me, crrId, 2, {
    section: "hours",
    data: { term_id: "1999-fall", rows: [] },
  });
  expect(unknown.statusCode).toBe(422);
  expect(body(unknown)).toMatchObject({ error: "unknown_term" });
});

test("seating and amenities replace their child rows", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  const seating = await put(ctx, me, crrId, 1, {
    section: "seating",
    data: {
      seat_count: 90,
      seat_types: [{ type: "carrel", count: 90 }],
      table_configs: [],
      effective_capacity: 60,
      max_group_size: null,
      spread_out_room: null,
    },
  });
  const afterSeating = SurveySpot.parse(body(seating));
  expect(afterSeating.seat_types).toEqual([{ type: "carrel", count: 90 }]);
  expect(afterSeating.table_configs).toEqual([]);
  expect(afterSeating.effective_capacity).toBe(60);

  const amenities = await put(ctx, me, crrId, 2, {
    section: "amenities",
    data: { amenities: [{ amenity: "water", walk_minutes: 2 }] },
  });
  expect(SurveySpot.parse(body(amenities)).amenities).toEqual([
    { amenity: "water", walk_minutes: 2 },
  ]);
});

test("estimates add rows, keep the latest per cell, and stamp no verification", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const first = await put(ctx, me, draft.id, 1, {
    section: "estimates",
    data: { cells: [{ day_type: "weekday", block: "evening", bucket: "some" }] },
  });
  expect(first.statusCode).toBe(200);
  ctx.clock.advance(HOUR);
  const second = await put(ctx, me, draft.id, 2, {
    section: "estimates",
    data: { cells: [{ day_type: "weekday", block: "evening", bucket: "full" }] },
  });
  const spot = SurveySpot.parse(body(second));
  expect(spot.estimates.map((e) => e.bucket)).toEqual(["full"]);
  expect(Object.keys(spot.verified)).toEqual(["identity"]);
});

test("verify stamps groups without a version bump and checks the base version", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  ctx.clock.advance(HOUR);
  const res = await post(ctx, me, `/survey/spots/${crrId}/verify`, {
    client_write_id: writeId(),
    base_version: 1,
    groups: ["hours", "power"],
  });
  expect(res.statusCode).toBe(200);
  const spot = SurveySpot.parse(body(res));
  expect(spot.version).toBe(1);
  const at = new Date(NOW.getTime() + HOUR).toISOString();
  expect(spot.verified).toMatchObject({
    hours: at,
    power: at,
    identity: "2026-10-01T15:00:00.000Z",
  });
  expect(ctx.publisher.scheduled).toBe(1);

  const stale = await post(ctx, me, `/survey/spots/${crrId}/verify`, {
    client_write_id: writeId(),
    base_version: 7,
    groups: ["hours"],
  });
  expect(stale.statusCode).toBe(409);
});

test("publish is a 422 with the missing list until complete, then publishes", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const early = await post(ctx, me, `/survey/spots/${draft.id}/publish`, {
    client_write_id: writeId(),
  });
  expect(early.statusCode).toBe(422);
  expect(body(early)).toEqual({ error: "incomplete", missing: draft.missing });
  expect(ctx.publisher.scheduled).toBe(0);

  const filled = await complete(ctx, me, draft);
  expect(filled.missing).toEqual([]);
  expect(ctx.publisher.scheduled).toBe(0);
  const res = await post(ctx, me, `/survey/spots/${draft.id}/publish`, {
    client_write_id: writeId(),
  });
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).status).toBe("published");
  expect(ctx.publisher.scheduled).toBe(1);
  const [state] = await ctx.db.select().from(bundle_state);
  expect(state?.dirty).toBe(true);

  // The server check and bundle assembly agree: the spot is in the bundle.
  const { bundle, warnings } = await buildBundle(ctx.db, "sbu", ctx.clock.now());
  expect(warnings).toEqual([]);
  const inBundle = bundle.spots.find((s) => s.id === draft.id);
  expect(inBundle?.hours_unconfirmed).toBe(true);
  expect(inBundle?.noise_policy).toBe("conversational");

  // Editing a published spot schedules a publish.
  const power = COMPLETING_SECTIONS[2];
  if (!power) throw new Error("fixture missing");
  await put(ctx, me, draft.id, filled.version, power);
  expect(ctx.publisher.scheduled).toBe(2);
});

test("unpublish is admin only", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const admin = await signIn(ctx, "admin", "Admin");
  const crrId = ctx.ids.spotIds["central-reading-room"];
  const denied = await post(ctx, me, `/survey/spots/${crrId}/unpublish`, {
    client_write_id: writeId(),
  });
  expect(denied.statusCode).toBe(403);
  const ok = await post(ctx, admin, `/survey/spots/${crrId}/unpublish`, {
    client_write_id: writeId(),
  });
  expect(ok.statusCode).toBe(200);
  expect(SurveySpot.parse(body(ok)).status).toBe("draft");
  expect(ctx.publisher.scheduled).toBe(1);
});

test("review: not your own edit, another surveyor can, an admin always can", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const admin = await signIn(ctx, "admin", "Admin");
  const draft = await newDraft(ctx, ana);
  const review = (who: SignedIn, version: number) =>
    post(ctx, who, `/survey/spots/${draft.id}/review`, {
      client_write_id: writeId(),
      base_version: version,
    });

  expect((await review(ana, 1)).statusCode).toBe(403);
  const byBo = await review(bo, 1);
  expect(byBo.statusCode).toBe(200);
  expect(SurveySpot.parse(body(byBo))).toMatchObject({
    review_state: "reviewed",
    reviewed_by: bo.id,
    reviewed_by_name: "Bo",
    last_edited_by_name: "Ana",
  });

  // Any edit resets review; an admin may review even their own edit.
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  const edited = SurveySpot.parse(body(await put(ctx, admin, draft.id, 1, access)));
  expect(edited).toMatchObject({
    review_state: "unreviewed",
    reviewed_by: null,
    last_edited_by: admin.id,
    last_edited_by_name: "Admin",
  });
  expect((await review(admin, 2)).statusCode).toBe(200);
  expect((await review(bo, 1)).statusCode).toBe(409);
});
```

Run: `bun test apps/server/test/spots.test.ts`
Expected: FAIL: requests to `/survey/spots` return 404 (`not_found`).

- [ ] **Step 2: Implement spot loading**

`loadSurveySpot` reads hours for the current term only (`pickTerm` in campus time) and the latest estimate per cell. Names for `last_edited_by` and `reviewed_by` feed the copy deck's "edited by {name}" and the conflict view.

`apps/server/src/spots/load.ts`:

```ts
import {
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  campusDate,
  missingV0Fields,
  type SpotList,
  type SurveyEstimate,
  type SurveySpot,
} from "@perch/core";
import {
  building,
  campus,
  type Db,
  pickTerm,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_photo,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  surveyor,
  type TermRow,
  term,
} from "@perch/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

/** The campus's current term, else the next one, else null (pickTerm in campus local time). */
export async function currentTerm(db: Db, campusId: string, now: Date): Promise<TermRow | null> {
  const [c] = await db.select().from(campus).where(eq(campus.id, campusId));
  if (!c) return null;
  const terms = await db.select().from(term).where(eq(term.campus_id, campusId));
  return pickTerm(terms, campusDate(now, c.tz));
}

/** Display names for surveyor ids (missing ids are left out). */
async function namesOf(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: surveyor.id, name: surveyor.display_name })
    .from(surveyor)
    .where(inArray(surveyor.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Full editable spot with child rows, or null when the id is unknown. */
export async function loadSurveySpot(
  db: Db,
  id: string,
  currentTermRow: TermRow | null,
): Promise<SurveySpot | null> {
  const [row] = await db.select().from(spot).where(eq(spot.id, id));
  if (!row) return null;

  const [seatTypes, tableConfigs, amenities, verifications, photos, hours, estimates, names] =
    await Promise.all([
      db.select().from(spot_seat_type).where(eq(spot_seat_type.spot_id, id)),
      db.select().from(spot_table_config).where(eq(spot_table_config.spot_id, id)),
      db.select().from(spot_amenity).where(eq(spot_amenity.spot_id, id)),
      db.select().from(spot_verification).where(eq(spot_verification.spot_id, id)),
      db
        .select()
        .from(spot_photo)
        .where(eq(spot_photo.spot_id, id))
        .orderBy(asc(spot_photo.taken_at), asc(spot_photo.id)),
      currentTermRow === null
        ? []
        : db
            .select()
            .from(spot_hours)
            .where(and(eq(spot_hours.spot_id, id), eq(spot_hours.term_id, currentTermRow.id)))
            .orderBy(asc(spot_hours.day_of_week), asc(spot_hours.is_exam), asc(spot_hours.opens)),
      db
        .select()
        .from(spot_estimate)
        .where(eq(spot_estimate.spot_id, id))
        .orderBy(desc(spot_estimate.created_at)),
      namesOf(db, [row.last_edited_by, row.reviewed_by]),
    ]);

  const verified: Partial<Record<AttributeGroup, string>> = {};
  for (const group of ATTRIBUTE_GROUP) {
    const v = verifications.find((x) => x.attribute_group === group);
    if (v) verified[group] = v.last_verified_at.toISOString();
  }

  const latest = new Map<string, SurveyEstimate>();
  for (const e of estimates) {
    const key = `${e.day_type}|${e.block}`;
    if (!latest.has(key)) {
      latest.set(key, {
        day_type: e.day_type,
        block: e.block,
        bucket: e.bucket,
        created_at: e.created_at.toISOString(),
      });
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    review_state: row.review_state,
    version: row.version,
    last_edited_by: row.last_edited_by,
    last_edited_by_name: row.last_edited_by ? (names.get(row.last_edited_by) ?? null) : null,
    reviewed_by: row.reviewed_by,
    reviewed_by_name: row.reviewed_by ? (names.get(row.reviewed_by) ?? null) : null,
    updated_at: row.updated_at.toISOString(),
    official_name: row.official_name,
    common_name: row.common_name,
    building_id: row.building_id,
    floor: row.floor,
    lat: row.lat,
    lng: row.lng,
    directions: row.directions,
    outdoor: row.outdoor,
    seasonal: row.seasonal,
    eligibility: row.eligibility,
    eligibility_scope: row.eligibility_scope,
    eligibility_verified: row.eligibility_verified,
    entry_method: row.entry_method,
    reservable: row.reservable,
    reservation_system: row.reservation_system,
    reservation_url: row.reservation_url,
    seat_count: row.seat_count,
    seat_types: seatTypes.map((s) => ({ type: s.type, count: s.count })),
    table_configs: tableConfigs.map((t) => t.config),
    effective_capacity: row.effective_capacity,
    max_group_size: row.max_group_size,
    spread_out_room: row.spread_out_room,
    outlet_coverage_pct: row.outlet_coverage_pct,
    usb_outlets: row.usb_outlets,
    wifi_mbps: row.wifi_mbps,
    cell_signal: row.cell_signal,
    noise_policy: row.noise_policy,
    natural_light: row.natural_light,
    lighting: row.lighting,
    temperature: row.temperature,
    temperature_consistent: row.temperature_consistent,
    windows_view: row.windows_view,
    calls_ok: row.calls_ok,
    group_work_ok: row.group_work_ok,
    whiteboard: row.whiteboard,
    food_policy: row.food_policy,
    amenities: amenities.map((a) => ({ amenity: a.amenity, walk_minutes: a.walk_minutes })),
    step_free: row.step_free,
    elevator: row.elevator,
    accessible_seating: row.accessible_seating,
    open_past_midnight: row.open_past_midnight,
    staffed_late: row.staffed_late,
    lit_route_to_residences: row.lit_route_to_residences,
    term: currentTermRow ? { id: currentTermRow.id, name: currentTermRow.name } : null,
    hours: hours.map((h) => ({
      day_of_week: h.day_of_week,
      opens: h.opens,
      closes: h.closes,
      last_entry: h.last_entry,
      is_exam: h.is_exam,
    })),
    estimates: [...latest.values()],
    verified,
    photos: photos.map((p) => ({
      id: p.id,
      spot_id: p.spot_id,
      url: p.url,
      taken_at: p.taken_at.toISOString(),
      is_cover: p.is_cover,
      uploaded_by: p.uploaded_by,
      approved: p.approved_at !== null,
      approved_at: p.approved_at ? p.approved_at.toISOString() : null,
    })),
    missing: missingV0Fields({
      directions: row.directions,
      eligibility: row.eligibility,
      seat_count: row.seat_count,
      outlet_coverage_pct: row.outlet_coverage_pct,
      noise_policy: row.noise_policy,
      group_work_ok: row.group_work_ok,
      food_policy: row.food_policy,
      has_verification: verifications.length > 0,
    }),
  };
}

/** Survey home list for one campus, sorted by name. */
export async function listSurveySpots(db: Db, campusId: string, now: Date): Promise<SpotList> {
  const termRow = await currentTerm(db, campusId, now);
  const rows = await db
    .select({ spot, building_name: building.name })
    .from(spot)
    .innerJoin(building, eq(building.id, spot.building_id))
    .where(eq(building.campus_id, campusId))
    .orderBy(asc(spot.official_name), asc(spot.id));
  const verifications = await db
    .select({ spot_id: spot_verification.spot_id, at: spot_verification.last_verified_at })
    .from(spot_verification);
  const hours =
    termRow === null
      ? []
      : await db
          .select({ spot_id: spot_hours.spot_id })
          .from(spot_hours)
          .where(eq(spot_hours.term_id, termRow.id));

  const oldest = new Map<string, Date>();
  for (const v of verifications) {
    const prev = oldest.get(v.spot_id);
    if (!prev || v.at < prev) oldest.set(v.spot_id, v.at);
  }
  const withHours = new Set(hours.map((h) => h.spot_id));
  const names = await namesOf(
    db,
    rows.map((r) => r.spot.last_edited_by),
  );

  return {
    term: termRow ? { id: termRow.id, name: termRow.name } : null,
    spots: rows.map(({ spot: s, building_name }) => ({
      id: s.id,
      slug: s.slug,
      official_name: s.official_name,
      common_name: s.common_name,
      building_id: s.building_id,
      building_name,
      status: s.status,
      review_state: s.review_state,
      version: s.version,
      last_edited_by: s.last_edited_by,
      last_edited_by_name: s.last_edited_by ? (names.get(s.last_edited_by) ?? null) : null,
      updated_at: s.updated_at.toISOString(),
      oldest_verified_at: oldest.get(s.id)?.toISOString() ?? null,
      hours_confirmed: withHours.has(s.id),
    })),
  };
}
```

- [ ] **Step 3: Implement spot writes**

Version semantics: only section PUTs bump `version`. Verify and review check `base_version` (you confirm what you saw) but do not bump it; publish, unpublish, review, and photo actions do not bump it either, so they never cause spurious conflicts for someone editing a section. Every write answers with the full `SurveySpot`.

The version check happens twice: a read that returns 409 with the current spot, and a conditional `UPDATE ... WHERE version = base` that catches a write committing in between.

`apps/server/src/spots/write.ts`:

```ts
import type {
  AttributeGroup,
  IdentitySection,
  SectionWrite,
  SurveyorRole,
  SurveySpot,
} from "@perch/core";
import {
  building,
  type Db,
  spot,
  spot_amenity,
  spot_estimate,
  spot_hours,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  type TermRow,
  term,
} from "@perch/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { HttpError } from "../http.ts";
import type { WriteOutcome } from "../writes/withWrite.ts";
import { loadSurveySpot } from "./load.ts";

export type SpotWriteContext = {
  surveyorId: string;
  role: SurveyorRole;
  now: Date;
  campusId: string;
  term: TermRow | null;
};

/** Loads a spot or throws 404. */
export async function spotOr404(db: Db, id: string, termRow: TermRow | null): Promise<SurveySpot> {
  const found = await loadSurveySpot(db, id, termRow);
  if (!found) throw new HttpError(404, { error: "not_found" });
  return found;
}

/** Throws 409 with the current spot when the client edited an older version. */
export function checkVersion(current: SurveySpot, baseVersion: number): void {
  if (current.version !== baseVersion) {
    throw new HttpError(409, { error: "version_conflict", current });
  }
}

async function checkIdentity(
  db: Db,
  ctx: SpotWriteContext,
  identity: IdentitySection,
  spotId: string | null,
): Promise<void> {
  const [b] = await db
    .select({ id: building.id })
    .from(building)
    .where(and(eq(building.id, identity.building_id), eq(building.campus_id, ctx.campusId)));
  if (!b)
    throw new HttpError(422, {
      error: "unknown_building",
      message: "That building is not on this campus.",
    });
  const clash = await db
    .select({ id: spot.id })
    .from(spot)
    .where(
      spotId === null
        ? eq(spot.slug, identity.slug)
        : and(eq(spot.slug, identity.slug), ne(spot.id, spotId)),
    );
  if (clash.length > 0)
    throw new HttpError(422, {
      error: "slug_taken",
      message: "Another spot already uses this short name.",
    });
}

/** Stamps survey verification (confidence measured) for the given groups at ctx.now. */
export async function stampVerified(
  db: Db,
  spotId: string,
  groups: readonly AttributeGroup[],
  now: Date,
): Promise<void> {
  if (groups.length === 0) return;
  await db
    .insert(spot_verification)
    .values(
      groups.map((attribute_group) => ({
        spot_id: spotId,
        attribute_group,
        last_verified_at: now,
        source: "survey" as const,
        confidence: "measured" as const,
      })),
    )
    .onConflictDoUpdate({
      target: [spot_verification.spot_id, spot_verification.attribute_group],
      set: { last_verified_at: now, source: "survey", confidence: "measured" },
    });
}

/** Creates a draft from the identity section. */
export async function createDraft(
  db: Db,
  ctx: SpotWriteContext,
  identity: IdentitySection,
): Promise<WriteOutcome<SurveySpot>> {
  await checkIdentity(db, ctx, identity, null);
  const [created] = await db
    .insert(spot)
    .values({
      ...identity,
      last_edited_by: ctx.surveyorId,
      created_at: ctx.now,
      updated_at: ctx.now,
    })
    .returning({ id: spot.id });
  if (!created) throw new Error("spot insert returned nothing");
  await stampVerified(db, created.id, ["identity"], ctx.now);
  const after = await spotOr404(db, created.id, ctx.term);
  return {
    status: 201,
    body: after,
    audit: { entity: "spot", entity_id: after.id, action: "create", before: null, after },
    dirty: false,
  };
}

/**
 * Applies one section. Bumps version, sets updated_at and last_edited_by, resets
 * review_state, and stamps verification for the section's group (not estimates).
 */
export async function writeSection(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
  baseVersion: number,
  write: SectionWrite,
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.term);
  checkVersion(before, baseVersion);

  let columns: Partial<typeof spot.$inferInsert> = {};
  switch (write.section) {
    case "identity":
      await checkIdentity(db, ctx, write.data, spotId);
      columns = write.data;
      break;
    case "hours": {
      const [t] = await db
        .select({ id: term.id })
        .from(term)
        .where(and(eq(term.id, write.data.term_id), eq(term.campus_id, ctx.campusId)));
      if (!t)
        throw new HttpError(422, {
          error: "unknown_term",
          message: "That term is not on this campus.",
        });
      break;
    }
    case "seating": {
      const { seat_types: _seatTypes, table_configs: _tableConfigs, ...rest } = write.data;
      columns = rest;
      break;
    }
    case "access":
    case "power":
    case "environment":
    case "use_fit":
    case "accessibility":
    case "late_night":
      columns = write.data;
      break;
    case "amenities":
    case "estimates":
      break;
  }

  const bumped = await db
    .update(spot)
    .set({
      ...columns,
      version: sql`${spot.version} + 1`,
      updated_at: ctx.now,
      last_edited_by: ctx.surveyorId,
      review_state: "unreviewed",
      reviewed_by: null,
    })
    .where(and(eq(spot.id, spotId), eq(spot.version, baseVersion)))
    .returning({ id: spot.id });
  if (bumped.length === 0) {
    // Another write committed between our read and update.
    throw new HttpError(409, {
      error: "version_conflict",
      current: await spotOr404(db, spotId, ctx.term),
    });
  }

  switch (write.section) {
    case "hours":
      await db
        .delete(spot_hours)
        .where(and(eq(spot_hours.spot_id, spotId), eq(spot_hours.term_id, write.data.term_id)));
      if (write.data.rows.length > 0) {
        await db
          .insert(spot_hours)
          .values(
            write.data.rows.map((r) => ({ ...r, spot_id: spotId, term_id: write.data.term_id })),
          );
      }
      break;
    case "seating":
      await db.delete(spot_seat_type).where(eq(spot_seat_type.spot_id, spotId));
      if (write.data.seat_types.length > 0) {
        await db
          .insert(spot_seat_type)
          .values(write.data.seat_types.map((s) => ({ ...s, spot_id: spotId })));
      }
      await db.delete(spot_table_config).where(eq(spot_table_config.spot_id, spotId));
      if (write.data.table_configs.length > 0) {
        await db
          .insert(spot_table_config)
          .values(write.data.table_configs.map((config) => ({ config, spot_id: spotId })));
      }
      break;
    case "amenities":
      await db.delete(spot_amenity).where(eq(spot_amenity.spot_id, spotId));
      if (write.data.amenities.length > 0) {
        await db
          .insert(spot_amenity)
          .values(write.data.amenities.map((a) => ({ ...a, spot_id: spotId })));
      }
      break;
    case "estimates":
      await db.insert(spot_estimate).values(
        write.data.cells.map((c) => ({
          ...c,
          spot_id: spotId,
          surveyor_id: ctx.surveyorId,
          created_at: ctx.now,
        })),
      );
      break;
    default:
      break;
  }

  if (write.section !== "estimates") await stampVerified(db, spotId, [write.section], ctx.now);

  const after = await spotOr404(db, spotId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: `section.${write.section}`, before, after },
    dirty: after.status === "published",
  };
}

/** Re-stamps verification for groups without changing data or version. */
export async function verifyGroups(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
  baseVersion: number,
  groups: readonly AttributeGroup[],
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.term);
  checkVersion(before, baseVersion);
  await stampVerified(db, spotId, groups, ctx.now);
  const after = await spotOr404(db, spotId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "verify", before, after },
    dirty: after.status === "published",
  };
}

/** Publishes when complete, else 422 with the missing fields. */
export async function publishSpot(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.term);
  if (before.missing.length > 0) {
    throw new HttpError(422, { error: "incomplete", missing: before.missing });
  }
  await db.update(spot).set({ status: "published" }).where(eq(spot.id, spotId));
  const after = await spotOr404(db, spotId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "publish", before, after },
    dirty: true,
  };
}

/** Admin only: back to draft, so the next bundle drops the spot. */
export async function unpublishSpot(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
): Promise<WriteOutcome<SurveySpot>> {
  if (ctx.role !== "admin") throw new HttpError(403, { error: "forbidden" });
  const before = await spotOr404(db, spotId, ctx.term);
  await db.update(spot).set({ status: "draft" }).where(eq(spot.id, spotId));
  const after = await spotOr404(db, spotId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "unpublish", before, after },
    dirty: before.status === "published",
  };
}

/** Marks reviewed. Admins always may; a surveyor may not review their own last edit. */
export async function reviewSpot(
  db: Db,
  ctx: SpotWriteContext,
  spotId: string,
  baseVersion: number,
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, spotId, ctx.term);
  checkVersion(before, baseVersion);
  if (ctx.role !== "admin" && before.last_edited_by === ctx.surveyorId) {
    throw new HttpError(403, { error: "forbidden", message: "someone else reviews your edits" });
  }
  await db
    .update(spot)
    .set({ review_state: "reviewed", reviewed_by: ctx.surveyorId })
    .where(eq(spot.id, spotId));
  const after = await spotOr404(db, spotId, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot", entity_id: spotId, action: "review", before, after },
    dirty: false,
  };
}
```

`apps/server/src/writes/spotWrite.ts`:

```ts
import { SurveySpot } from "@perch/core";
import type { AppDeps } from "../app.ts";
import type { AuthedSurveyor } from "../auth/sessions.ts";
import { currentTerm } from "../spots/load.ts";
import type { SpotWriteContext } from "../spots/write.ts";
import { type Tx, type WriteOutcome, type WriteResult, withWrite } from "./withWrite.ts";

export type SpotWriter = (
  me: AuthedSurveyor,
  clientWriteId: string,
  kind: string,
  fn: (tx: Tx, ctx: SpotWriteContext) => Promise<WriteOutcome<SurveySpot>>,
) => Promise<WriteResult<SurveySpot>>;

/** withWrite for writes that answer with the full spot, with the term and clock resolved once. */
export function spotWriter(deps: AppDeps): SpotWriter {
  const writeDeps = { db: deps.db, campusId: deps.config.campusId, publisher: deps.publisher };
  return (me, clientWriteId, kind, fn) => {
    const now = deps.clock.now();
    return withWrite(
      writeDeps,
      { surveyorId: me.id, clientWriteId, kind, schema: SurveySpot },
      async (tx) => {
        const term = await currentTerm(tx, deps.config.campusId, now);
        return fn(tx, {
          surveyorId: me.id,
          role: me.role,
          now,
          campusId: deps.config.campusId,
          term,
        });
      },
    );
  };
}
```

- [ ] **Step 4: Add the routes**

`PUT /survey/spots/:id/:section` validates the envelope with `SectionWriteRequest`, then `data` with `SectionWrite` once the section is known (400 on failure). The receipt kind includes the section, so a write id reused for another section is rejected.

`apps/server/src/routes/spots.ts`:

```ts
import {
  CreateSpotRequest,
  IdParams,
  ReviewRequest,
  SectionParams,
  SectionWrite,
  SectionWriteRequest,
  SpotList,
  SurveySpot,
  VerifyRequest,
  WriteRequest,
} from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { HttpError } from "../http.ts";
import { currentTerm, listSurveySpots } from "../spots/load.ts";
import {
  createDraft,
  publishSpot,
  reviewSpot,
  spotOr404,
  unpublishSpot,
  verifyGroups,
  writeSection,
} from "../spots/write.ts";
import { spotWriter } from "../writes/spotWrite.ts";

export function spotRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const spotWrite = spotWriter(deps);

  return async (app) => {
    app.get("/survey/spots", { schema: { response: { 200: SpotList } } }, async (req) => {
      await requireSurveyor(deps, req);
      return listSurveySpots(deps.db, deps.config.campusId, deps.clock.now());
    });

    app.get(
      "/survey/spots/:id",
      { schema: { params: IdParams, response: { 200: SurveySpot } } },
      async (req) => {
        await requireSurveyor(deps, req);
        const term = await currentTerm(deps.db, deps.config.campusId, deps.clock.now());
        return spotOr404(deps.db, req.params.id, term);
      },
    );

    app.post(
      "/survey/spots",
      { schema: { body: CreateSpotRequest, response: { 201: SurveySpot } } },
      async (req, reply) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.create", (tx, ctx) =>
          createDraft(tx, ctx, req.body.identity),
        );
        return reply.code(201).send(r.body);
      },
    );

    app.put(
      "/survey/spots/:id/:section",
      {
        schema: { params: SectionParams, body: SectionWriteRequest, response: { 200: SurveySpot } },
      },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const write = SectionWrite.safeParse({ section: req.params.section, data: req.body.data });
        if (!write.success) {
          throw new HttpError(400, {
            error: "invalid_request",
            message: z.prettifyError(write.error),
          });
        }
        const r = await spotWrite(
          me,
          req.body.client_write_id,
          `spot.section.${req.params.section}`,
          (tx, ctx) => writeSection(tx, ctx, req.params.id, req.body.base_version, write.data),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/verify",
      { schema: { params: IdParams, body: VerifyRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.verify", (tx, ctx) =>
          verifyGroups(tx, ctx, req.params.id, req.body.base_version, req.body.groups),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/publish",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.publish", (tx, ctx) =>
          publishSpot(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/unpublish",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        if (me.role !== "admin") throw new HttpError(403, { error: "forbidden" });
        const r = await spotWrite(me, req.body.client_write_id, "spot.unpublish", (tx, ctx) =>
          unpublishSpot(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/review",
      { schema: { params: IdParams, body: ReviewRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.review", (tx, ctx) =>
          reviewSpot(tx, ctx, req.params.id, req.body.base_version),
        );
        return r.body;
      },
    );
  };
}
```

In `apps/server/src/app.ts`, replace:

```ts
import { healthRoutes } from "./routes/health.ts";
```

with:

```ts
import { healthRoutes } from "./routes/health.ts";
import { spotRoutes } from "./routes/spots.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
  await app.register(adminRoutes(deps));
```

with:

```ts
  await app.register(adminRoutes(deps));
  await app.register(spotRoutes(deps));
```

Run: `bun test apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server
git commit -m "feat(server): add survey spot reads, section writes, publish, review"
```

---

### Task 7: Photos: upload, image, cover, approve, reject, `PhotoStore`

**Files:**
- Create: `apps/server/src/photos/store.ts`, `apps/server/src/photos/write.ts`, `apps/server/src/routes/photos.ts`
- Create: `apps/server/test/photos.test.ts`
- Modify: `apps/server/src/app.ts` (`photos` dep, routes), `apps/server/src/main.ts`, `apps/server/test/helpers.ts`

**Interfaces:**
- Produces: `type PhotoBlob = { sha256: string; bytes: Uint8Array; contentType: string }`, `type PhotoStore = { put(blob: PhotoBlob): Promise<void>; get(sha256: string): Promise<Uint8Array | null> }`, `postgresPhotoStore(db: Db): PhotoStore`, `sha256Hex(bytes: Uint8Array): string`, `isJpeg(bytes: Uint8Array): boolean`.
- Produces: `type PhotoRow = typeof spot_photo.$inferSelect`, `photoOr404(db: Db, id: string): Promise<PhotoRow>`; each of the following returns `Promise<WriteOutcome<SurveySpot>>`: `addPhoto(db: Db, ctx: SpotWriteContext, opts: { spotId: string; sha256: string; takenAt: Date })`, `setCover(db: Db, ctx: SpotWriteContext, photoId: string)`, `approvePhoto(db: Db, ctx: SpotWriteContext, photoId: string)` (403 for the uploader unless admin), `rejectPhoto(db: Db, ctx: SpotWriteContext, photoId: string)` (403 unless admin).
- Produces routes: `POST /survey/photos` (multipart: `file`, `spot_id`, `client_write_id`, optional `taken_at`; 201 `SurveySpot`; 413 `photo_too_large`; 415 `photo_type`), `GET /survey/photos/:id/image` (JPEG bytes, signed-in only), `POST /survey/photos/:id/cover`, `/approve`, `/reject` (admin).
- Produces: `AppDeps.photos: PhotoStore`.
- Consumes: `photo_blob`, `spot_photo.blob_sha256` (Task 3), `spotWriter` (Task 6), `PHOTO_MAX_BYTES`, `PhotoUploadFields` (Task 2).

- [ ] **Step 1: Wire the photo store into the app, main, and tests**

The store is created here so the failing tests can run against the real Postgres implementation.

`apps/server/src/photos/store.ts`:

```ts
import { createHash } from "node:crypto";
import { type Db, photo_blob } from "@perch/db";
import { eq } from "drizzle-orm";

export type PhotoBlob = { sha256: string; bytes: Uint8Array; contentType: string };

/** Content-addressed photo bytes. Postgres today; R2 can replace it behind this interface. */
export type PhotoStore = {
  /** Idempotent: storing the same bytes twice keeps one copy. */
  put(blob: PhotoBlob): Promise<void>;
  get(sha256: string): Promise<Uint8Array | null>;
};

export function postgresPhotoStore(db: Db): PhotoStore {
  return {
    async put(blob) {
      await db
        .insert(photo_blob)
        .values({
          sha256: blob.sha256,
          bytes: blob.bytes,
          content_type: blob.contentType,
          byte_size: blob.bytes.byteLength,
        })
        .onConflictDoNothing();
    },
    async get(sha256) {
      const [row] = await db
        .select({ bytes: photo_blob.bytes })
        .from(photo_blob)
        .where(eq(photo_blob.sha256, sha256));
      return row ? row.bytes : null;
    },
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** JPEG files start with the SOI marker FF D8 followed by another marker FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
```

In `apps/server/src/app.ts`, replace:

```ts
import { HttpError } from "./http.ts";
```

with:

```ts
import { HttpError } from "./http.ts";
import type { PhotoStore } from "./photos/store.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
  publisher: PublishQueue;
```

with:

```ts
  publisher: PublishQueue;
  photos: PhotoStore;
```

In `apps/server/src/main.ts`, replace:

```ts
import { parseEnv } from "./env.ts";
```

with:

```ts
import { parseEnv } from "./env.ts";
import { postgresPhotoStore } from "./photos/store.ts";
```

In `apps/server/src/main.ts`, replace:

```ts
  publisher: { schedule: () => {} },
```

with:

```ts
  publisher: { schedule: () => {} },
  photos: postgresPhotoStore(db),
```

In `apps/server/test/helpers.ts`, replace:

```ts
import { createSession } from "../src/auth/sessions.ts";
```

with:

```ts
import { createSession } from "../src/auth/sessions.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
```

In `apps/server/test/helpers.ts`, replace:

```ts
    publisher,
  });
```

with:

```ts
    publisher,
    photos: postgresPhotoStore(db),
  });
```

- [ ] **Step 2: Write the failing tests**

The upload helper sends the `file` part before the text fields on purpose. Review-focus cases: an unknown spot id or an offline `local:` id stores no blob; a phone clock ahead of the server cannot date a photo in the future.

`apps/server/test/photos.test.ts`:

```ts
import { expect, test } from "bun:test";
import { PHOTO_MAX_BYTES, SurveySpot } from "@perch/core";
import { photo_blob, spot_photo } from "@perch/db";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../src/photos/store.ts";
import { body, NOW, type SignedIn, setup, signIn, type TestContext, writeId } from "./helpers.ts";

/** A byte string that passes the JPEG magic check; `seed` varies the content. */
function jpeg(size = 64, seed = 1): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size - 2; i++) bytes[i] = (i * seed) % 251;
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

function upload(
  ctx: TestContext,
  who: SignedIn,
  fields: Record<string, string>,
  file: Uint8Array | null = jpeg(),
) {
  const form = new FormData();
  // The file comes first on purpose: the server must not depend on part order.
  if (file !== null) form.append("file", new Blob([file], { type: "image/jpeg" }), "photo.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return ctx.app.inject({
    method: "POST",
    url: "/survey/photos",
    headers: who.headers,
    payload: form,
  });
}

function photoAction(ctx: TestContext, who: SignedIn, id: string, action: string) {
  return ctx.app.inject({
    method: "POST",
    url: `/survey/photos/${id}/${action}`,
    headers: who.headers,
    payload: { client_write_id: writeId() },
  });
}

async function uploaded(ctx: TestContext, who: SignedIn, seed: number): Promise<string> {
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const res = await upload(
    ctx,
    who,
    { spot_id: spotId, client_write_id: writeId() },
    jpeg(64, seed),
  );
  expect(res.statusCode).toBe(201);
  const spot = SurveySpot.parse(body(res));
  const sha = sha256Hex(jpeg(64, seed));
  const [row] = await ctx.db.select().from(spot_photo).where(eq(spot_photo.blob_sha256, sha));
  if (!row || !spot.photos.some((p) => p.id === row.id)) throw new Error("photo missing");
  return row.id;
}

test("an upload stores the blob once and adds an unapproved photo", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const res = await upload(ctx, me, { spot_id: spotId, client_write_id: writeId() });
  expect(res.statusCode).toBe(201);
  const spot = SurveySpot.parse(body(res));
  expect(spot.photos).toHaveLength(1);
  expect(spot.photos[0]).toMatchObject({
    approved: false,
    is_cover: false,
    uploaded_by: me.id,
    url: null,
    taken_at: NOW.toISOString(),
  });

  // Same bytes again under a new write id: a second photo row, still one blob.
  await upload(ctx, me, { spot_id: spotId, client_write_id: writeId() });
  const blobs = await ctx.db.select().from(photo_blob);
  expect(blobs.map((b) => b.sha256)).toEqual([sha256Hex(jpeg())]);
  expect(blobs[0]?.byte_size).toBe(64);
  expect(await ctx.db.select().from(spot_photo).where(eq(spot_photo.spot_id, spotId))).toHaveLength(
    2,
  );
});

test("replaying an upload adds no second photo", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const fields = { spot_id: spotId, client_write_id: writeId() };
  expect((await upload(ctx, me, fields)).statusCode).toBe(201);
  expect((await upload(ctx, me, fields)).statusCode).toBe(201);
  expect(await ctx.db.select().from(spot_photo).where(eq(spot_photo.spot_id, spotId))).toHaveLength(
    1,
  );
});

test("type and size limits: non-JPEG is 415, over the limit is 413, nothing stored", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const fields = { spot_id: ctx.ids.spotIds["sac-lounge"], client_write_id: writeId() };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const wrongType = await upload(ctx, me, fields, png);
  expect(wrongType.statusCode).toBe(415);
  expect(body(wrongType)).toMatchObject({ error: "photo_type" });

  const atLimit = await upload(
    ctx,
    me,
    { ...fields, client_write_id: writeId() },
    jpeg(PHOTO_MAX_BYTES),
  );
  expect(atLimit.statusCode).toBe(201);
  const over = await upload(
    ctx,
    me,
    { ...fields, client_write_id: writeId() },
    jpeg(PHOTO_MAX_BYTES + 1),
  );
  expect(over.statusCode).toBe(413);
  expect(body(over)).toMatchObject({ error: "photo_too_large" });
  expect(await ctx.db.select().from(photo_blob)).toHaveLength(1);
});

test("an unknown spot or an offline local id stores no blob", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const unknown = await upload(ctx, me, {
    spot_id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    client_write_id: writeId(),
  });
  expect(unknown.statusCode).toBe(404);
  const local = await upload(ctx, me, {
    spot_id: "local:8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    client_write_id: writeId(),
  });
  expect(local.statusCode).toBe(400);
  const noFile = await upload(
    ctx,
    me,
    { spot_id: ctx.ids.spotIds["sac-lounge"], client_write_id: writeId() },
    null,
  );
  expect(noFile.statusCode).toBe(400);
  expect(await ctx.db.select().from(photo_blob)).toEqual([]);
});

test("taken_at from a phone clock in the future is clamped to the server clock", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const future = await upload(ctx, me, {
    spot_id: spotId,
    client_write_id: writeId(),
    taken_at: "2026-10-14T18:00:00.000Z",
  });
  const past = await upload(
    ctx,
    me,
    { spot_id: spotId, client_write_id: writeId(), taken_at: "2026-10-12T09:30:00.000Z" },
    jpeg(64, 2),
  );
  expect(past.statusCode).toBe(201);
  const times = SurveySpot.parse(body(past))
    .photos.map((p) => p.taken_at)
    .sort();
  expect(future.statusCode).toBe(201);
  expect(times).toEqual(["2026-10-12T09:30:00.000Z", NOW.toISOString()]);
});

test("setting a cover moves it from the previous photo", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const a = await uploaded(ctx, me, 1);
  const b = await uploaded(ctx, me, 2);
  expect((await photoAction(ctx, me, a, "cover")).statusCode).toBe(200);
  const res = await photoAction(ctx, me, b, "cover");
  expect(res.statusCode).toBe(200);
  const covers = SurveySpot.parse(body(res)).photos.filter((p) => p.is_cover);
  expect(covers.map((p) => p.id)).toEqual([b]);
});

test("approval: not your own upload, another surveyor can, an admin always can", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const admin = await signIn(ctx, "admin", "Admin");
  const anas = await uploaded(ctx, ana, 1);
  expect((await photoAction(ctx, ana, anas, "approve")).statusCode).toBe(403);
  const byBo = await photoAction(ctx, bo, anas, "approve");
  expect(byBo.statusCode).toBe(200);
  expect(SurveySpot.parse(body(byBo)).photos.find((p) => p.id === anas)?.approved).toBe(true);

  const admins = await uploaded(ctx, admin, 2);
  expect((await photoAction(ctx, admin, admins, "approve")).statusCode).toBe(200);
  // sac-lounge is published, so approvals change the bundle.
  expect(ctx.publisher.scheduled).toBe(2);
});

test("reject is admin only and deletes the photo row", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const admin = await signIn(ctx, "admin", "Admin");
  const id = await uploaded(ctx, ana, 1);
  expect((await photoAction(ctx, ana, id, "reject")).statusCode).toBe(403);
  const res = await photoAction(ctx, admin, id, "reject");
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).photos.some((p) => p.id === id)).toBe(false);
  expect(await ctx.db.select().from(spot_photo).where(eq(spot_photo.id, id))).toEqual([]);
  expect((await photoAction(ctx, admin, id, "reject")).statusCode).toBe(404);
});

test("the image route serves exact bytes to signed-in surveyors only", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const id = await uploaded(ctx, me, 3);
  const res = await ctx.app.inject({
    method: "GET",
    url: `/survey/photos/${id}/image`,
    headers: me.headers,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toBe("image/jpeg");
  expect(Array.from(res.rawPayload)).toEqual(Array.from(jpeg(64, 3)));
  expect(
    (await ctx.app.inject({ method: "GET", url: `/survey/photos/${id}/image` })).statusCode,
  ).toBe(401);
});
```

Run: `bun test apps/server/test/photos.test.ts`
Expected: FAIL: `POST /survey/photos` returns 404.

- [ ] **Step 3: Implement photo writes and routes**

The multipart plugin is registered inside the photo plugin with `fileSize: PHOTO_MAX_BYTES`; `toBuffer()` then throws a 413 error that the route maps to `photo_too_large`. The content type the phone sends is not trusted: the bytes must start with the JPEG marker. Blob bytes are stored before the receipt transaction (content-addressed and idempotent, so a retry is harmless); an orphan from a failed write is removed by the 2b maintenance job.

`apps/server/src/photos/write.ts`:

```ts
import type { SurveySpot } from "@perch/core";
import { type Db, spot_photo } from "@perch/db";
import { and, eq } from "drizzle-orm";
import { HttpError } from "../http.ts";
import { type SpotWriteContext, spotOr404 } from "../spots/write.ts";
import type { WriteOutcome } from "../writes/withWrite.ts";

export type PhotoRow = typeof spot_photo.$inferSelect;

export async function photoOr404(db: Db, id: string): Promise<PhotoRow> {
  const [row] = await db.select().from(spot_photo).where(eq(spot_photo.id, id));
  if (!row) throw new HttpError(404, { error: "not_found" });
  return row;
}

/** Adds an unapproved photo whose bytes are already in the PhotoStore. */
export async function addPhoto(
  db: Db,
  ctx: SpotWriteContext,
  opts: { spotId: string; sha256: string; takenAt: Date },
): Promise<WriteOutcome<SurveySpot>> {
  const before = await spotOr404(db, opts.spotId, ctx.term);
  const [row] = await db
    .insert(spot_photo)
    .values({
      spot_id: opts.spotId,
      blob_sha256: opts.sha256,
      taken_at: opts.takenAt,
      uploaded_by: ctx.surveyorId,
    })
    .returning({ id: spot_photo.id });
  if (!row) throw new Error("photo insert returned nothing");
  const after = await spotOr404(db, opts.spotId, ctx.term);
  return {
    status: 201,
    body: after,
    audit: { entity: "spot_photo", entity_id: row.id, action: "upload", before, after },
    dirty: false,
  };
}

/** Makes one photo the cover, unsetting the previous cover first (one cover per spot). */
export async function setCover(
  db: Db,
  ctx: SpotWriteContext,
  photoId: string,
): Promise<WriteOutcome<SurveySpot>> {
  const photo = await photoOr404(db, photoId);
  const before = await spotOr404(db, photo.spot_id, ctx.term);
  await db
    .update(spot_photo)
    .set({ is_cover: false })
    .where(and(eq(spot_photo.spot_id, photo.spot_id), eq(spot_photo.is_cover, true)));
  await db.update(spot_photo).set({ is_cover: true }).where(eq(spot_photo.id, photoId));
  const after = await spotOr404(db, photo.spot_id, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot_photo", entity_id: photoId, action: "cover", before, after },
    dirty: after.status === "published",
  };
}

/** Admins approve anything; a surveyor approves only photos someone else uploaded. */
export async function approvePhoto(
  db: Db,
  ctx: SpotWriteContext,
  photoId: string,
): Promise<WriteOutcome<SurveySpot>> {
  const photo = await photoOr404(db, photoId);
  if (ctx.role !== "admin" && photo.uploaded_by === ctx.surveyorId) {
    throw new HttpError(403, { error: "forbidden", message: "someone else approves your photos" });
  }
  const before = await spotOr404(db, photo.spot_id, ctx.term);
  await db
    .update(spot_photo)
    .set({ approved_by: ctx.surveyorId, approved_at: ctx.now })
    .where(eq(spot_photo.id, photoId));
  const after = await spotOr404(db, photo.spot_id, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot_photo", entity_id: photoId, action: "approve", before, after },
    dirty: after.status === "published",
  };
}

/** Admin only. Deletes the photo row; the maintenance job (2b) removes unreferenced blobs. */
export async function rejectPhoto(
  db: Db,
  ctx: SpotWriteContext,
  photoId: string,
): Promise<WriteOutcome<SurveySpot>> {
  if (ctx.role !== "admin") throw new HttpError(403, { error: "forbidden" });
  const photo = await photoOr404(db, photoId);
  const before = await spotOr404(db, photo.spot_id, ctx.term);
  await db.delete(spot_photo).where(eq(spot_photo.id, photoId));
  const after = await spotOr404(db, photo.spot_id, ctx.term);
  return {
    status: 200,
    body: after,
    audit: { entity: "spot_photo", entity_id: photoId, action: "reject", before, after },
    dirty: after.status === "published" && photo.approved_at !== null,
  };
}
```

`apps/server/src/routes/photos.ts`:

```ts
import multipart from "@fastify/multipart";
import {
  IdParams,
  PHOTO_CONTENT_TYPE,
  PHOTO_MAX_BYTES,
  PhotoUploadFields,
  SurveySpot,
  WriteRequest,
} from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { HttpError } from "../http.ts";
import { isJpeg, sha256Hex } from "../photos/store.ts";
import { addPhoto, approvePhoto, photoOr404, rejectPhoto, setCover } from "../photos/write.ts";
import { currentTerm, loadSurveySpot } from "../spots/load.ts";
import { spotWriter } from "../writes/spotWrite.ts";

function tooLarge(err: unknown): boolean {
  return typeof err === "object" && err !== null && "statusCode" in err && err.statusCode === 413;
}

export function photoRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const spotWrite = spotWriter(deps);

  return async (app) => {
    await app.register(multipart, {
      limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 5, parts: 6 },
    });

    app.post(
      "/survey/photos",
      { schema: { response: { 201: SurveySpot } } },
      async (req, reply) => {
        const me = await requireSurveyor(deps, req);
        if (!req.isMultipart()) {
          throw new HttpError(400, { error: "invalid_request", message: "expected multipart" });
        }

        // Field order is up to the client, so read every part before validating.
        const fields: Record<string, string> = {};
        let file: Uint8Array | null = null;
        try {
          for await (const part of req.parts()) {
            if (part.type === "file") {
              if (part.fieldname !== "file") {
                throw new HttpError(400, { error: "invalid_request", message: "unexpected file" });
              }
              file = await part.toBuffer();
            } else if (typeof part.value === "string") {
              fields[part.fieldname] = part.value;
            }
          }
        } catch (err) {
          if (tooLarge(err))
            throw new HttpError(413, {
              error: "photo_too_large",
              message: "Photos must be 1.5 MB or smaller.",
            });
          throw err;
        }

        const parsed = PhotoUploadFields.safeParse(fields);
        if (!parsed.success) {
          throw new HttpError(400, {
            error: "invalid_request",
            message: z.prettifyError(parsed.error),
          });
        }
        if (file === null) {
          throw new HttpError(400, { error: "invalid_request", message: "file is required" });
        }
        if (!isJpeg(file))
          throw new HttpError(415, { error: "photo_type", message: "Photos must be JPEG." });

        // Check the spot before storing bytes, so a bad id leaves no orphan blob.
        const now = deps.clock.now();
        const term = await currentTerm(deps.db, deps.config.campusId, now);
        if (!(await loadSurveySpot(deps.db, parsed.data.spot_id, term))) {
          throw new HttpError(404, { error: "not_found" });
        }

        const sha256 = sha256Hex(file);
        await deps.photos.put({ sha256, bytes: file, contentType: PHOTO_CONTENT_TYPE });
        const claimed = parsed.data.taken_at === undefined ? now : new Date(parsed.data.taken_at);
        // A phone clock running ahead must not date a photo in the future.
        const takenAt = claimed.getTime() > now.getTime() ? now : claimed;
        const r = await spotWrite(me, parsed.data.client_write_id, "photo.upload", (tx, ctx) =>
          addPhoto(tx, ctx, { spotId: parsed.data.spot_id, sha256, takenAt }),
        );
        return reply.code(201).send(r.body);
      },
    );

    app.get("/survey/photos/:id/image", { schema: { params: IdParams } }, async (req, reply) => {
      await requireSurveyor(deps, req);
      const photo = await photoOr404(deps.db, req.params.id);
      const bytes = photo.blob_sha256 === null ? null : await deps.photos.get(photo.blob_sha256);
      if (bytes === null) throw new HttpError(404, { error: "not_found" });
      return reply
        .type(PHOTO_CONTENT_TYPE)
        .header("cache-control", "private, max-age=86400")
        .send(Buffer.from(bytes));
    });

    app.post(
      "/survey/photos/:id/cover",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "photo.cover", (tx, ctx) =>
          setCover(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/photos/:id/approve",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "photo.approve", (tx, ctx) =>
          approvePhoto(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/photos/:id/reject",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        if (me.role !== "admin") throw new HttpError(403, { error: "forbidden" });
        const r = await spotWrite(me, req.body.client_write_id, "photo.reject", (tx, ctx) =>
          rejectPhoto(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );
  };
}
```

In `apps/server/src/app.ts`, replace:

```ts
import { healthRoutes } from "./routes/health.ts";
```

with:

```ts
import { healthRoutes } from "./routes/health.ts";
import { photoRoutes } from "./routes/photos.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
  await app.register(spotRoutes(deps));
```

with:

```ts
  await app.register(spotRoutes(deps));
  await app.register(photoRoutes(deps));
```

Run: `bun test apps/server`
Expected: PASS.

- [ ] **Step 4: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server
git commit -m "feat(server): add photo upload, cover, approval, and photo store"
```

---

### Task 8: Publisher with `PagesTarget` and `FsTarget`, admin publish endpoints

**Files:**
- Create: `apps/server/src/publish/target.ts`, `fsTarget.ts`, `pagesTarget.ts`, `publisher.ts`, `apps/server/src/routes/publish.ts`
- Create: `apps/server/scripts/smoke-publish.ts`
- Create: `apps/server/test/pagesTarget.test.ts`, `apps/server/test/publisher.test.ts`
- Modify: `apps/server/package.json` (`@noble/hashes`), `bun.lock`, `apps/server/src/app.ts`, `apps/server/src/main.ts`, `apps/server/test/helpers.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `type PublishFile = { path: string; contentType: string; bytes: () => Promise<Uint8Array> }`, `type DeployResult = { uploaded: string[]; skipped: string[] }`, `type PublishTarget = { deploy(files: readonly PublishFile[]): Promise<DeployResult> }`, `MUTABLE_PATHS`, `DATA_HEADERS`.
- Produces: `fsTarget(dir: string): PublishTarget`; `CF_API`, `type FetchLike = (url: string, init: RequestInit) => Promise<Response>`, `pagesHash(bytes: Uint8Array, path: string): string`, `type PagesTargetOptions = { accountId: string; apiToken: string; project: string; fetch?: FetchLike }`, `pagesTarget(opts: PagesTargetOptions): PublishTarget`.
- Produces: `PUBLISH_DEBOUNCE_MS = 30_000`, `type Timers = { after(ms: number, fn: () => void): () => void }`, `realTimers: Timers`, `type PublisherDeps = { db: Db; campusId: string; target: PublishTarget; photos: PhotoStore; dataBaseUrl: string; clock: Clock; timers?: Timers; debounceMs?: number; log?: (message: string, error?: unknown) => void }`, `type PublishOutcome = { ok: true; hash: string; warnings: string[]; uploaded: string[] } | { ok: false; error: string }`, `type Publisher = PublishQueue & { runNow(): Promise<PublishOutcome>; start(): Promise<void>; status(): Promise<PublishStatus>; close(): void }`, `createPublisher(deps: PublisherDeps): Publisher`.
- Produces routes: `GET /admin/publish`, `POST /admin/publish` (both `PublishStatus`, admin only).
- Produces test helpers: `DATA_BASE_URL`, `ManualTimers`, `manualTimers()`, `CountingPublisher`, `setup(opts?: { target?: PublishTarget })` now returning `timers`, `publishDir`.
- Consumes: `buildBundle` (foundation), `BundlePointer`, `PublishStatus` (Task 2), `bundle_state` columns (Task 3), `PhotoStore` (Task 7).

- [ ] **Step 1: Add the hash dependency**

Cloudflare Pages keys assets by `blake3(base64(content) + extension)`, first 32 hex chars (wrangler's `hashFile`). `node:crypto` has no blake3, so the plan uses `@noble/hashes` (pure JS, runs on Node and Bun). The probe confirmed it matches `blake3-wasm`, the library wrangler uses, byte for byte on a 200 KB file.

In `apps/server/package.json`, replace:

```json
    "@fastify/multipart": "^10.1.2",
```

with:

```json
    "@fastify/multipart": "^10.1.2",
    "@noble/hashes": "^2.4.0",
```

Run: `bun install`
Expected: adds `@noble/hashes`; `bun.lock` changes.

- [ ] **Step 2: Write the targets**

The Pages deployment manifest replaces the whole site, so `deploy` always receives the complete file set (every published photo, the hashed bundle, `_headers`, the pointer). `FsTarget` skips immutable files it already has and never deletes; `PagesTarget` asks Cloudflare which hashes it lacks and uploads only those.

Endpoints, as wrangler 4.147.0 calls them (`wrangler-dist/cli.js`, `src/pages/upload.ts`, `src/api/pages/deploy.ts`) and as documented at https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get_upload_token/, https://developers.cloudflare.com/api/resources/pages/subresources/assets/methods/check_missing/, and https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/:

1. `GET https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{project}/upload-token` with the API token returns `{ jwt }`.
2. `POST /client/v4/pages/assets/check-missing` `{ hashes }` with the JWT returns the missing hashes.
3. `POST /client/v4/pages/assets/upload` with the JWT, body `[{ key, value (base64), metadata: { contentType }, base64: true }]`, batches up to 40 MB and 2000 files.
4. `POST /client/v4/pages/assets/upsert-hashes` `{ hashes }` with the JWT.
5. `POST /client/v4/accounts/{account}/pages/projects/{project}/deployments` with the API token, multipart: `manifest` (JSON `{"/path": hash}`) and the `_headers` file. With no `branch` field the deployment goes to the production branch (documented).

Responses use the `{ success, errors, result }` envelope. `_headers` adds `Access-Control-Allow-Origin: *` (the PWA is a different `pages.dev` origin), `no-cache` on `bundle-latest.json`, and immutable caching on hashed files. Only the current hashed bundle is in each deployment; a client holding an older pointer refetches the pointer and falls back to its cache meanwhile (`loadBundle`).

`apps/server/src/publish/target.ts`:

```ts
/** One file of the data site. Bytes load lazily so unchanged photos are not read. */
export type PublishFile = {
  /** Relative path without a leading slash, e.g. "photos/<sha256>.jpg". */
  path: string;
  contentType: string;
  bytes: () => Promise<Uint8Array>;
};

export type DeployResult = { uploaded: string[]; skipped: string[] };

/**
 * Where the data site lives. `deploy` receives the complete file set: a target
 * that replaces the whole site (Cloudflare Pages) needs all of it, and a target
 * that adds files (a directory) may skip immutable files it already has.
 */
export type PublishTarget = { deploy(files: readonly PublishFile[]): Promise<DeployResult> };

/** Paths whose content can change between publishes. Everything else is content-addressed. */
export const MUTABLE_PATHS: ReadonlySet<string> = new Set(["bundle-latest.json", "_headers"]);

/** Cloudflare Pages headers: CORS for the PWA origin, no-cache pointer, immutable hashed files. */
export const DATA_HEADERS = [
  "/*",
  "  Access-Control-Allow-Origin: *",
  "/bundle-latest.json",
  "  Cache-Control: no-cache",
  "/bundle.*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/photos/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n");
```

`apps/server/src/publish/fsTarget.ts`:

```ts
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MUTABLE_PATHS, type PublishTarget } from "./target.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes the data site into a directory (tests, local dev, VPS fallback). Files
 * are written in the given order, each through a temp file and rename, so a
 * reader never sees a half-written pointer. Old bundles are kept.
 */
export function fsTarget(dir: string): PublishTarget {
  return {
    async deploy(files) {
      const uploaded: string[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        const dest = join(dir, file.path);
        if (!MUTABLE_PATHS.has(file.path) && (await exists(dest))) {
          skipped.push(file.path);
          continue;
        }
        await mkdir(dirname(dest), { recursive: true });
        const tmp = `${dest}.tmp-${process.pid}`;
        await writeFile(tmp, await file.bytes());
        await rename(tmp, dest);
        uploaded.push(file.path);
      }
      return { uploaded, skipped };
    },
  };
}
```

- [ ] **Step 3: Write the failing `PagesTarget` tests**

The reference hashes come from `blake3-wasm` run in the probe. The fake fetch stands in for Cloudflare; no test touches the network.

`apps/server/test/pagesTarget.test.ts`:

```ts
import { expect, test } from "bun:test";
import { z } from "zod";
import { CF_API, type FetchLike, pagesHash, pagesTarget } from "../src/publish/pagesTarget.ts";
import type { PublishFile } from "../src/publish/target.ts";

const PROJECT = `${CF_API}/accounts/acc/pages/projects/perch-data`;

test("pagesHash matches wrangler's blake3 asset key", () => {
  // Reference values from blake3-wasm, the library wrangler uses.
  expect(pagesHash(new TextEncoder().encode("hello"), "bundle.json")).toBe(
    "91e633a7905596f6e3107c1d8b6773dd",
  );
  expect(pagesHash(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "photos/a.jpg")).toBe(
    "6b7f62ff0a112b83df345ec6ed64f020",
  );
  expect(pagesHash(new TextEncoder().encode("hello"), "_redirects")).toBe(
    "324ea05bea4d7f75b8d9ed695e65b2ca",
  );
});

type Call = { url: string; auth: string | null; body: RequestInit["body"] };

/** Fake Cloudflare API: records calls; check-missing reports `missing` as absent. */
function fakeCloudflare(missing: (hashes: string[]) => string[]) {
  const calls: Call[] = [];
  const ok = (result: unknown) =>
    new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
  const fake: FetchLike = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url, auth: headers.get("authorization"), body: init.body });
    if (url === `${PROJECT}/upload-token`) return ok({ jwt: "jwt-1" });
    if (url === `${CF_API}/pages/assets/check-missing`) {
      const { hashes } = z
        .object({ hashes: z.array(z.string()) })
        .parse(JSON.parse(String(init.body)));
      return ok(missing(hashes));
    }
    if (url === `${CF_API}/pages/assets/upload`) return ok(null);
    if (url === `${CF_API}/pages/assets/upsert-hashes`) return ok(null);
    if (url === `${PROJECT}/deployments`) return ok({ id: "dep-1" });
    return new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 7003, message: "no route" }],
        result: null,
      }),
      { status: 404 },
    );
  };
  return { calls, fetch: fake };
}

function files(reads: { photo: number }): PublishFile[] {
  const text = (s: string) => async () => new TextEncoder().encode(s);
  return [
    {
      path: "photos/abc.jpg",
      contentType: "image/jpeg",
      bytes: async () => {
        reads.photo += 1;
        return new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
      },
    },
    { path: "bundle.0123456789abcdef.json", contentType: "application/json", bytes: text("{}") },
    { path: "_headers", contentType: "text/plain", bytes: text("/*\n  X: y\n") },
    { path: "bundle-latest.json", contentType: "application/json", bytes: text('{"p":1}') },
  ];
}

test("deploy uploads only missing assets and sends a full manifest", async () => {
  const photoHash = "6b7f62ff0a112b83df345ec6ed64f020";
  const cf = fakeCloudflare((hashes) => hashes.filter((h) => h !== photoHash));
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "api-token",
    project: "perch-data",
    fetch: cf.fetch,
  });
  const reads = { photo: 0 };
  const result = await target.deploy(files(reads));
  expect(result).toEqual({
    uploaded: ["bundle.0123456789abcdef.json", "bundle-latest.json"],
    skipped: ["photos/abc.jpg"],
  });

  expect(cf.calls.map((c) => c.url)).toEqual([
    `${PROJECT}/upload-token`,
    `${CF_API}/pages/assets/check-missing`,
    `${CF_API}/pages/assets/upload`,
    `${CF_API}/pages/assets/upsert-hashes`,
    `${PROJECT}/deployments`,
  ]);
  expect(cf.calls.map((c) => c.auth)).toEqual([
    "Bearer api-token",
    "Bearer jwt-1",
    "Bearer jwt-1",
    "Bearer jwt-1",
    "Bearer api-token",
  ]);

  const uploadBody = z
    .array(z.object({ key: z.string(), value: z.string(), base64: z.literal(true) }))
    .parse(JSON.parse(String(cf.calls[2]?.body)));
  expect(uploadBody.map((u) => u.key)).not.toContain(photoHash);
  expect(uploadBody).toHaveLength(2);

  const form = cf.calls[4]?.body;
  if (!(form instanceof FormData)) throw new Error("deployment body is not FormData");
  const manifest = z.record(z.string(), z.string()).parse(JSON.parse(String(form.get("manifest"))));
  expect(Object.keys(manifest).sort()).toEqual([
    "/bundle-latest.json",
    "/bundle.0123456789abcdef.json",
    "/photos/abc.jpg",
  ]);
  expect(manifest["/photos/abc.jpg"]).toBe(photoHash);
  const headers = form.get("_headers");
  expect(headers instanceof Blob ? await headers.text() : null).toBe("/*\n  X: y\n");
  expect(form.get("branch")).toBeNull();
});

test("immutable files are hashed once per process", async () => {
  const cf = fakeCloudflare(() => []);
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  const reads = { photo: 0 };
  await target.deploy(files(reads));
  await target.deploy(files(reads));
  expect(reads.photo).toBe(1);
});

test("a Cloudflare error is thrown with its code and message", async () => {
  const fail: FetchLike = async () =>
    new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 8000013, message: "bad token" }],
        result: null,
      }),
      { status: 403 },
    );
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: fail,
  });
  await expect(target.deploy(files({ photo: 0 }))).rejects.toThrow("8000013 bad token");
});
```

Run: `bun test apps/server/test/pagesTarget.test.ts`
Expected: FAIL: `Cannot find module '../src/publish/pagesTarget.ts'`.

- [ ] **Step 4: Implement `PagesTarget`**

`apps/server/src/publish/pagesTarget.ts`:

```ts
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { MUTABLE_PATHS, type PublishFile, type PublishTarget } from "./target.ts";

/*
 * Cloudflare Pages direct upload, the same calls wrangler 4.147 makes
 * (wrangler-dist/cli.js, src/pages/upload.ts and src/api/pages/deploy.ts):
 *   GET  /accounts/{account}/pages/projects/{project}/upload-token   (API token) -> { jwt }
 *   POST /pages/assets/check-missing  { hashes }                      (JWT) -> missing hashes
 *   POST /pages/assets/upload         [{ key, value, metadata, base64 }] (JWT)
 *   POST /pages/assets/upsert-hashes  { hashes }                      (JWT)
 *   POST /accounts/{account}/pages/projects/{project}/deployments     (API token)
 *        multipart: manifest = {"/path": hash}, _headers file; no branch = production
 */

export const CF_API = "https://api.cloudflare.com/client/v4";
/** wrangler's per-request upload bucket limits. */
const MAX_BATCH_BYTES = 40 * 1024 * 1024;
const MAX_BATCH_FILES = 2000;

/** Pages asset key: blake3 of base64(content) + extension (no dot), first 32 hex chars. */
export function pagesHash(bytes: Uint8Array, path: string): string {
  const dot = path.lastIndexOf(".");
  const extension = dot === -1 ? "" : path.slice(dot + 1);
  const input = new TextEncoder().encode(Buffer.from(bytes).toString("base64") + extension);
  return bytesToHex(blake3(input)).slice(0, 32);
}

const Envelope = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number(), message: z.string() })).default([]),
  result: z.unknown(),
});

/** The slice of fetch this target uses, so tests can pass a plain function. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PagesTargetOptions = {
  accountId: string;
  apiToken: string;
  project: string;
  fetch?: FetchLike;
};

export function pagesTarget(opts: PagesTargetOptions): PublishTarget {
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  // Content-addressed paths never change, so their hash is computed once per process.
  const hashCache = new Map<string, string>();
  const projectUrl = `${CF_API}/accounts/${opts.accountId}/pages/projects/${opts.project}`;

  async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const res = await doFetch(url, init);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Cloudflare ${res.status} from ${url}: not JSON`);
    }
    const env = Envelope.safeParse(json);
    if (!env.success) throw new Error(`Cloudflare ${res.status} from ${url}: unexpected body`);
    if (!res.ok || !env.data.success) {
      const detail = env.data.errors.map((e) => `${e.code} ${e.message}`).join("; ");
      throw new Error(`Cloudflare ${res.status} from ${url}: ${detail || "failed"}`);
    }
    return schema.parse(env.data.result);
  }

  function jsonPost(token: string, body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    async deploy(files) {
      const { jwt } = await call(
        `${projectUrl}/upload-token`,
        { headers: { authorization: `Bearer ${opts.apiToken}` } },
        z.object({ jwt: z.string().min(1) }),
      );

      let headersFile: string | null = null;
      const assets: { file: PublishFile; hash: string }[] = [];
      for (const file of files) {
        if (file.path === "_headers") {
          headersFile = new TextDecoder().decode(await file.bytes());
          continue;
        }
        const cached = hashCache.get(file.path);
        const hash = cached ?? pagesHash(await file.bytes(), file.path);
        if (!MUTABLE_PATHS.has(file.path)) hashCache.set(file.path, hash);
        assets.push({ file, hash });
      }
      const hashes = [...new Set(assets.map((a) => a.hash))];

      const missing = new Set(
        await call(
          `${CF_API}/pages/assets/check-missing`,
          jsonPost(jwt, { hashes }),
          z.array(z.string()),
        ),
      );

      const uploaded: string[] = [];
      const skipped: string[] = [];
      let batch: { key: string; value: string; metadata: { contentType: string }; base64: true }[] =
        [];
      let batchBytes = 0;
      const flush = async (): Promise<void> => {
        if (batch.length === 0) return;
        await call(`${CF_API}/pages/assets/upload`, jsonPost(jwt, batch), z.unknown());
        batch = [];
        batchBytes = 0;
      };
      const queued = new Set<string>();
      for (const { file, hash } of assets) {
        if (!missing.has(hash) || queued.has(hash)) {
          skipped.push(file.path);
          continue;
        }
        queued.add(hash);
        const value = Buffer.from(await file.bytes()).toString("base64");
        if (batchBytes + value.length > MAX_BATCH_BYTES || batch.length >= MAX_BATCH_FILES) {
          await flush();
        }
        batch.push({ key: hash, value, metadata: { contentType: file.contentType }, base64: true });
        batchBytes += value.length;
        uploaded.push(file.path);
      }
      await flush();
      await call(`${CF_API}/pages/assets/upsert-hashes`, jsonPost(jwt, { hashes }), z.unknown());

      const manifest = Object.fromEntries(assets.map((a) => [`/${a.file.path}`, a.hash]));
      const form = new FormData();
      form.append("manifest", JSON.stringify(manifest));
      if (headersFile !== null) form.append("_headers", new Blob([headersFile]), "_headers");
      await call(
        `${projectUrl}/deployments`,
        { method: "POST", headers: { authorization: `Bearer ${opts.apiToken}` }, body: form },
        z.object({ id: z.string() }),
      );
      return { uploaded, skipped };
    },
  };
}
```

Run: `bun test apps/server/test/pagesTarget.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Switch the tests to a real publisher and write the failing publisher tests**

`helpers.ts` (full file) now builds a real `Publisher` over an `FsTarget` in a temp dir, with manual timers so debounce is deterministic. The counting wrapper keeps `ctx.publisher.scheduled` working for the earlier tests.

`apps/server/test/helpers.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, surveyor } from "@perch/db";
import { type SeedIds, seed } from "@perch/db/seed";
import { createTestDb } from "@perch/db/testing";
import type { LightMyRequestResponse } from "fastify";
import { type App, buildApp } from "../src/app.ts";
import { createSession } from "../src/auth/sessions.ts";
import type { Clock } from "../src/clock.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher, type Publisher, type Timers } from "../src/publish/publisher.ts";
import type { PublishTarget } from "../src/publish/target.ts";

export const NOW = new Date("2026-10-13T18:00:00Z");
export const WEB_ORIGIN = "https://perch.pages.dev";
export const DATA_BASE_URL = "https://perch-data.pages.dev";

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
```

`apps/server/test/publisher.test.ts`:

```ts
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BundlePointer, PublishStatus, parseBundle, SurveySpot } from "@perch/core";
import { bundle_state, spot_photo } from "@perch/db";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import type { PublishFile, PublishTarget } from "../src/publish/target.ts";
import {
  body,
  DATA_BASE_URL,
  NOW,
  type SignedIn,
  setup,
  signIn,
  type TestContext,
  writeId,
} from "./helpers.ts";

function readJson(dir: string, path: string): unknown {
  return JSON.parse(readFileSync(join(dir, path), "utf8"));
}

async function state(ctx: TestContext) {
  const [row] = await ctx.db.select().from(bundle_state).where(eq(bundle_state.campus_id, "sbu"));
  return row;
}

/** Waits until no publish is running. */
async function idle(ctx: TestContext): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (!(await ctx.publisher.status()).running) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("publish never finished");
}

/** A target that blocks every deploy until release() and records overlap. */
function gatedTarget(inner: PublishTarget) {
  let active = 0;
  let maxActive = 0;
  let deploys = 0;
  let open: () => void = () => {};
  let gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const target: PublishTarget = {
    async deploy(files: readonly PublishFile[]) {
      deploys += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
      return inner.deploy(files);
    },
  };
  return {
    target,
    /** Resolves once `n` deploys have started (and are waiting at the gate). */
    async started(n: number): Promise<void> {
      for (let i = 0; i < 400 && deploys < n; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (deploys < n) throw new Error(`only ${deploys} deploys started`);
    },
    release() {
      open();
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    stats: () => ({ deploys, maxActive }),
  };
}

async function markDirty(ctx: TestContext, who: SignedIn): Promise<void> {
  // Re-verifying a published spot is a dirty write.
  const res = await ctx.app.inject({
    method: "POST",
    url: `/survey/spots/${ctx.ids.spotIds["sac-lounge"]}/verify`,
    headers: who.headers,
    payload: { client_write_id: writeId(), base_version: 1, groups: ["power"] },
  });
  expect(res.statusCode).toBe(200);
}

test("a publish writes photos, the hashed bundle, and the pointer, then clears dirty", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  expect((await state(ctx))?.dirty).toBe(true);

  const outcome = await ctx.publisher.runNow();
  if (!outcome.ok) throw new Error(outcome.error);
  const pointer = BundlePointer.parse(readJson(ctx.publishDir, "bundle-latest.json"));
  expect(pointer.url).toBe(`bundle.${outcome.hash}.json`);
  const bundleBytes = readFileSync(join(ctx.publishDir, pointer.url));
  expect(sha256Hex(bundleBytes).slice(0, 16)).toBe(pointer.hash);
  const parsed = parseBundle(JSON.parse(bundleBytes.toString("utf8")));
  expect(parsed.ok).toBe(true);
  expect(readFileSync(join(ctx.publishDir, "_headers"), "utf8")).toContain(
    "Access-Control-Allow-Origin: *",
  );

  const after = await state(ctx);
  expect(after).toMatchObject({ dirty: false, last_hash: outcome.hash, last_error: null });
  expect(after?.last_published_at?.toISOString()).toBe(NOW.toISOString());
  expect(after?.last_warnings).toEqual([]);
});

test("approved photos get absolute data-site URLs and are published; others are not", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const admin = await signIn(ctx, "admin", "Admin");
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const upload = async (seed: number) => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, seed, 0xff, 0xd9]);
    const form = new FormData();
    form.append("spot_id", spotId);
    form.append("client_write_id", writeId());
    form.append("file", new Blob([bytes], { type: "image/jpeg" }), "p.jpg");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/survey/photos",
      headers: ana.headers,
      payload: form,
    });
    expect(res.statusCode).toBe(201);
    const sha = sha256Hex(bytes);
    const [row] = await ctx.db.select().from(spot_photo).where(eq(spot_photo.blob_sha256, sha));
    if (!row) throw new Error("photo row missing");
    return { id: row.id, sha, bytes };
  };
  const approved = await upload(1);
  const pending = await upload(2);
  await ctx.app.inject({
    method: "POST",
    url: `/survey/photos/${approved.id}/approve`,
    headers: admin.headers,
    payload: { client_write_id: writeId() },
  });

  const outcome = await ctx.publisher.runNow();
  if (!outcome.ok) throw new Error(outcome.error);
  const url = `${DATA_BASE_URL}/photos/${approved.sha}.jpg`;
  const pointer = BundlePointer.parse(readJson(ctx.publishDir, "bundle-latest.json"));
  const parsed = parseBundle(readJson(ctx.publishDir, pointer.url));
  if (!parsed.ok) throw new Error(parsed.detail);
  const sac = parsed.bundle.spots.find((s) => s.id === spotId);
  expect(sac?.photos.map((p) => p.url)).toEqual([url]);
  expect(Array.from(readFileSync(join(ctx.publishDir, `photos/${approved.sha}.jpg`)))).toEqual(
    Array.from(approved.bytes),
  );
  expect(existsSync(join(ctx.publishDir, `photos/${pending.sha}.jpg`))).toBe(false);

  const detail = await ctx.app.inject({
    method: "GET",
    url: `/survey/spots/${spotId}`,
    headers: ana.headers,
  });
  const photo = SurveySpot.parse(body(detail)).photos.find((p) => p.id === approved.id);
  expect(photo?.url).toBe(url);
});

test("a failed publish keeps dirty and records the error; the next one recovers", async () => {
  let fail = true;
  const failing: PublishTarget = {
    async deploy() {
      if (fail) throw new Error("pages is down");
      return { uploaded: [], skipped: [] };
    },
  };
  const ctx = await setup({ target: failing });
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  const outcome = await ctx.publisher.runNow();
  expect(outcome).toEqual({ ok: false, error: "pages is down" });
  expect(await state(ctx)).toMatchObject({ dirty: true, last_error: "pages is down" });

  fail = false;
  expect((await ctx.publisher.runNow()).ok).toBe(true);
  expect(await state(ctx)).toMatchObject({ dirty: false, last_error: null });
});

test("writes are debounced into one publish", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  await ctx.app.inject({
    method: "POST",
    url: `/survey/spots/${ctx.ids.spotIds["kelly-rcc"]}/verify`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, groups: ["power"] },
  });
  expect(ctx.publisher.scheduled).toBe(2);
  expect(ctx.timers.pending()).toBe(1);
  ctx.timers.fire();
  await idle(ctx);
  expect(existsSync(join(ctx.publishDir, "bundle-latest.json"))).toBe(true);
  expect((await state(ctx))?.dirty).toBe(false);
});

test("a publish requested while one runs never overlaps and collapses into one rerun", async () => {
  const ctx0 = await setup();
  const gated = gatedTarget(fsTarget(ctx0.publishDir));
  const ctx = await setup({ target: gated.target });
  const first = ctx.publisher.runNow();
  const second = ctx.publisher.runNow();
  const third = ctx.publisher.runNow();
  expect(second).toBe(third);
  await gated.started(1);
  expect((await ctx.publisher.status()).running).toBe(true);
  gated.release();
  await first;
  await gated.started(2);
  gated.release();
  await second;
  expect(gated.stats()).toEqual({ deploys: 2, maxActive: 1 });
});

test("a write that lands mid-publish keeps dirty and schedules another publish", async () => {
  const ctx0 = await setup();
  const gated = gatedTarget(fsTarget(ctx0.publishDir));
  const ctx = await setup({ target: gated.target });
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  const run = ctx.publisher.runNow();
  // The run has read write_seq and is blocked in deploy.
  await gated.started(1);
  await ctx.app.inject({
    method: "POST",
    url: `/survey/spots/${ctx.ids.spotIds["kelly-rcc"]}/verify`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, groups: ["hours"] },
  });
  gated.release();
  const first = await run;
  if (!first.ok) throw new Error(first.error);
  expect((await state(ctx))?.dirty).toBe(true);

  // The follow-up publish was scheduled; firing it picks up the late write.
  expect(ctx.timers.pending()).toBe(1);
  ctx.timers.fire();
  await gated.started(2);
  gated.release();
  await idle(ctx);
  const after = await state(ctx);
  expect(after?.dirty).toBe(false);
  expect(after?.last_hash).not.toBe(first.hash);
});

test("start publishes only when a previous process left the bundle dirty", async () => {
  const clean = await setup();
  await clean.publisher.start();
  expect(existsSync(join(clean.publishDir, "bundle-latest.json"))).toBe(false);

  const dirty = await setup();
  await dirty.db.insert(bundle_state).values({ campus_id: "sbu", dirty: true, write_seq: 3 });
  await dirty.publisher.start();
  expect(existsSync(join(dirty.publishDir, "bundle-latest.json"))).toBe(true);
  expect((await state(dirty))?.dirty).toBe(false);
});

test("admin publish endpoints: status, publish now, admin only", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const admin = await signIn(ctx, "admin", "Admin");
  expect(
    (await ctx.app.inject({ method: "GET", url: "/admin/publish", headers: me.headers }))
      .statusCode,
  ).toBe(403);
  const before = PublishStatus.parse(
    body(await ctx.app.inject({ method: "GET", url: "/admin/publish", headers: admin.headers })),
  );
  expect(before).toEqual({
    dirty: false,
    running: false,
    last_published_at: null,
    last_hash: null,
    last_attempt_at: null,
    warnings: [],
    last_error: null,
  });
  const res = await ctx.app.inject({
    method: "POST",
    url: "/admin/publish",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const after = PublishStatus.parse(body(res));
  expect(after.last_hash).toMatch(/^[a-f0-9]{16}$/);
  expect(after.last_published_at).toBe(NOW.toISOString());
});
```

Run: `bun test apps/server/test/publisher.test.ts`
Expected: FAIL: `Cannot find module '../src/publish/publisher.ts'`.

- [ ] **Step 6: Implement the publisher**

Lost-update guard: the run reads `bundle_state.write_seq` before building and clears `dirty` with `SET dirty = (write_seq <> seq_at_start)`, so a write that lands while a publish is running keeps `dirty` and triggers another (debounced) publish. Single in-flight lock: a `runNow` during a run returns one shared follow-up promise, so any number of requests collapse into exactly one rerun and deploys never overlap. On failure `dirty` stays set and `last_error` is recorded for the admin screen.

`apps/server/src/publish/publisher.ts`:

```ts
import { BUNDLE_SCHEMA_MAJOR, BundlePointer, type PublishStatus } from "@perch/core";
import { buildBundle, bundle_state, type Db, spot_photo } from "@perch/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "../clock.ts";
import { type PhotoStore, sha256Hex } from "../photos/store.ts";
import type { PublishQueue } from "../writes/withWrite.ts";
import { DATA_HEADERS, type PublishFile, type PublishTarget } from "./target.ts";

export const PUBLISH_DEBOUNCE_MS = 30_000;

/** Scheduling seam: real timers in production, a manual fake in tests. */
export type Timers = { after(ms: number, fn: () => void): () => void };

export const realTimers: Timers = {
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    handle.unref();
    return () => clearTimeout(handle);
  },
};

export type PublisherDeps = {
  db: Db;
  campusId: string;
  target: PublishTarget;
  photos: PhotoStore;
  /** Absolute data-site base URL without a trailing slash. */
  dataBaseUrl: string;
  clock: Clock;
  timers?: Timers;
  debounceMs?: number;
  log?: (message: string, error?: unknown) => void;
};

export type PublishOutcome =
  | { ok: true; hash: string; warnings: string[]; uploaded: string[] }
  | { ok: false; error: string };

export type Publisher = PublishQueue & {
  /** Publishes now. A call during a run queues exactly one follow-up run. */
  runNow(): Promise<PublishOutcome>;
  /** On boot: publish right away if a previous process left the bundle dirty. */
  start(): Promise<void>;
  status(): Promise<PublishStatus>;
  close(): void;
};

const Warnings = z.array(z.string());
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export function createPublisher(deps: PublisherDeps): Publisher {
  const timers = deps.timers ?? realTimers;
  const debounceMs = deps.debounceMs ?? PUBLISH_DEBOUNCE_MS;
  const log = deps.log ?? (() => {});
  const photoPrefix = `${deps.dataBaseUrl}/photos/`;
  let cancelTimer: (() => void) | null = null;
  let inFlight: Promise<PublishOutcome> | null = null;
  let queued: Promise<PublishOutcome> | null = null;
  let closed = false;

  async function readState() {
    const [row] = await deps.db
      .select()
      .from(bundle_state)
      .where(eq(bundle_state.campus_id, deps.campusId));
    return row ?? null;
  }

  async function runOnce(): Promise<PublishOutcome> {
    const startedAt = deps.clock.now();
    let seq = 0;
    try {
      seq = (await readState())?.write_seq ?? 0;

      // Approved blob-backed photos get their absolute data-site URL before the build.
      await deps.db
        .update(spot_photo)
        .set({ url: sql`${photoPrefix} || ${spot_photo.blob_sha256} || '.jpg'` })
        .where(and(isNotNull(spot_photo.blob_sha256), isNotNull(spot_photo.approved_at)));

      const { bundle, warnings } = await buildBundle(deps.db, deps.campusId, startedAt);
      const json = JSON.stringify(bundle);
      const hash = sha256Hex(utf8(json)).slice(0, 16);
      const bundlePath = `bundle.${hash}.json`;
      const pointer = BundlePointer.parse({
        schema_version: BUNDLE_SCHEMA_MAJOR,
        hash,
        url: bundlePath,
        generated_at: bundle.generated_at,
      });

      const photoFiles = new Map<string, PublishFile>();
      for (const s of bundle.spots) {
        for (const p of s.photos) {
          if (!p.url.startsWith(photoPrefix)) continue;
          const sha = p.url.slice(photoPrefix.length, -".jpg".length);
          photoFiles.set(sha, {
            path: `photos/${sha}.jpg`,
            contentType: "image/jpeg",
            bytes: async () => {
              const bytes = await deps.photos.get(sha);
              if (bytes === null) throw new Error(`photo blob ${sha} is missing`);
              return bytes;
            },
          });
        }
      }

      // Photos and the hashed bundle first, the pointer last.
      const files: PublishFile[] = [
        ...photoFiles.values(),
        { path: bundlePath, contentType: "application/json", bytes: async () => utf8(json) },
        { path: "_headers", contentType: "text/plain", bytes: async () => utf8(DATA_HEADERS) },
        {
          path: "bundle-latest.json",
          contentType: "application/json",
          bytes: async () => utf8(JSON.stringify(pointer)),
        },
      ];
      const { uploaded } = await deps.target.deploy(files);

      // Clear dirty only if no write landed while this run was building.
      const [after] = await deps.db
        .update(bundle_state)
        .set({
          dirty: sql`${bundle_state.write_seq} <> ${seq}`,
          last_published_at: startedAt,
          last_hash: hash,
          last_attempt_at: startedAt,
          last_warnings: warnings,
          last_error: null,
        })
        .where(eq(bundle_state.campus_id, deps.campusId))
        .returning({ dirty: bundle_state.dirty });
      if (!after) {
        await deps.db.insert(bundle_state).values({
          campus_id: deps.campusId,
          dirty: false,
          last_published_at: startedAt,
          last_hash: hash,
          last_attempt_at: startedAt,
          last_warnings: warnings,
        });
      } else if (after.dirty) {
        publisher.schedule();
      }
      return { ok: true, hash, warnings, uploaded };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("publish failed", err);
      try {
        await deps.db
          .insert(bundle_state)
          .values({
            campus_id: deps.campusId,
            dirty: true,
            last_attempt_at: startedAt,
            last_error: message,
          })
          .onConflictDoUpdate({
            target: bundle_state.campus_id,
            set: { last_attempt_at: startedAt, last_error: message },
          });
      } catch (stateErr) {
        log("could not record publish failure", stateErr);
      }
      return { ok: false, error: message };
    }
  }

  const publisher: Publisher = {
    schedule() {
      if (closed) return;
      cancelTimer?.();
      cancelTimer = timers.after(debounceMs, () => {
        cancelTimer = null;
        void publisher.runNow();
      });
    },

    runNow() {
      if (inFlight === null) {
        inFlight = runOnce().finally(() => {
          inFlight = null;
        });
        return inFlight;
      }
      if (queued === null) {
        queued = inFlight.then(() => {
          queued = null;
          return publisher.runNow();
        });
      }
      return queued;
    },

    async start() {
      try {
        if ((await readState())?.dirty) await publisher.runNow();
      } catch (err) {
        log("publish startup check failed", err);
      }
    },

    async status() {
      const row = await readState();
      const warnings = Warnings.safeParse(row?.last_warnings);
      return {
        dirty: row?.dirty ?? false,
        running: inFlight !== null,
        last_published_at: row?.last_published_at?.toISOString() ?? null,
        last_hash: row?.last_hash ?? null,
        last_attempt_at: row?.last_attempt_at?.toISOString() ?? null,
        warnings: warnings.success ? warnings.data : [],
        last_error: row?.last_error ?? null,
      };
    },

    close() {
      closed = true;
      cancelTimer?.();
      cancelTimer = null;
    },
  };
  return publisher;
}
```

`apps/server/src/routes/publish.ts`:

```ts
import { PublishStatus } from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireAdmin } from "../auth/guards.ts";

export function publishRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/admin/publish", { schema: { response: { 200: PublishStatus } } }, async (req) => {
      await requireAdmin(deps, req);
      return deps.publisher.status();
    });

    /** Publishes now and answers with the resulting status; a failure shows in last_error. */
    app.post("/admin/publish", { schema: { response: { 200: PublishStatus } } }, async (req) => {
      await requireAdmin(deps, req);
      await deps.publisher.runNow();
      return deps.publisher.status();
    });
  };
}
```

In `apps/server/src/app.ts`, delete:

```ts
import type { PublishQueue } from "./writes/withWrite.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
import type { PhotoStore } from "./photos/store.ts";
```

with:

```ts
import type { PhotoStore } from "./photos/store.ts";
import type { Publisher } from "./publish/publisher.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
import { photoRoutes } from "./routes/photos.ts";
```

with:

```ts
import { photoRoutes } from "./routes/photos.ts";
import { publishRoutes } from "./routes/publish.ts";
```

In `apps/server/src/app.ts`, replace:

```ts
  publisher: PublishQueue;
```

with:

```ts
  publisher: Publisher;
```

In `apps/server/src/app.ts`, replace:

```ts
  await app.register(photoRoutes(deps));
```

with:

```ts
  await app.register(photoRoutes(deps));
  await app.register(publishRoutes(deps));
```

`main.ts` (full file) builds the target from `PUBLISH_TARGET`, starts the publisher after `listen` (a dirty bundle from a previous process publishes on boot; a sleeping or unreachable database is logged, not fatal), and closes it on SIGTERM:

`apps/server/src/main.ts`:

```ts
import { openDb } from "@perch/db";
import { buildApp } from "./app.ts";
import { systemClock } from "./clock.ts";
import { parseEnv } from "./env.ts";
import { postgresPhotoStore } from "./photos/store.ts";
import { fsTarget } from "./publish/fsTarget.ts";
import { pagesTarget } from "./publish/pagesTarget.ts";
import { createPublisher } from "./publish/publisher.ts";

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`invalid environment:\n${parsed.error}`);
  process.exit(1);
}
const env = parsed.env;

// postgres.js connects lazily, so the server starts even while the database sleeps.
const { db, close } = openDb(env.DATABASE_URL);
const photos = postgresPhotoStore(db);
const target =
  env.PUBLISH_TARGET === "pages"
    ? pagesTarget({
        accountId: env.CF_ACCOUNT_ID,
        apiToken: env.CF_API_TOKEN,
        project: env.CF_DATA_PROJECT,
      })
    : fsTarget(env.FS_PUBLISH_DIR);
const publisher = createPublisher({
  db,
  campusId: env.CAMPUS_ID,
  target,
  photos,
  dataBaseUrl: env.DATA_BASE_URL,
  clock: systemClock,
  log: (message, error) => console.error(message, error),
});
const app = await buildApp({
  db,
  clock: systemClock,
  config: { webOrigin: env.WEB_ORIGIN, campusId: env.CAMPUS_ID },
  publisher,
  photos,
  logger: true,
});

async function shutdown(): Promise<void> {
  publisher.close();
  await app.close();
  await close();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

await app.listen({ port: env.PORT, host: "0.0.0.0" });
void publisher.start();
```

Run: `bun test apps/server`
Expected: PASS.

Run: `bun run smoke:server node && bun run smoke:server bun`
Expected: both `server smoke ok`; the startup check logs a connection error for the unreachable smoke database and the server keeps serving.

- [ ] **Step 7: Add the Postgres write and publish smoke**

PGlite serializes transactions, so the Task 5 concurrency test cannot show the real receipt-row lock; this smoke sends one client write id twice at once through postgres.js and requires a single run. It then publishes with one approved photo: PGlite returns `Uint8Array` for bytea and postgres.js returns `Buffer`. It runs in the CI Postgres job. (The probe confirmed the bytea round trip through postgres.js on Node and Bun; the concurrent check can only run against real Postgres, so CI is its first real run.)

`apps/server/scripts/smoke-publish.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundlePointer, parseBundle } from "@perch/core";
import { openDb, spot, spot_photo, surveyor } from "@perch/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postgresPhotoStore, sha256Hex } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher } from "../src/publish/publisher.ts";
import { type Tx, type WriteOutcome, withWrite } from "../src/writes/withWrite.ts";

/**
 * Against a migrated, seeded Postgres through postgres.js:
 * 1. Two concurrent sends of one client write id must run the write once. PGlite
 *    serializes transactions, so only real Postgres exercises the receipt lock.
 * 2. A publish with one approved photo to a temp directory, checking the files,
 *    proves bytea and the publisher on the production driver.
 * Usage: node apps/server/scripts/smoke-publish.ts
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const { db, close } = openDb(url);
const dir = mkdtempSync(join(tmpdir(), "smoke-publish-"));
const base = "https://data.example.org";
try {
  const [sac] = await db.select().from(spot).where(eq(spot.slug, "sac-lounge"));
  if (!sac) throw new Error("seed spot sac-lounge missing; run db:seed first");

  const [who] = await db
    .insert(surveyor)
    .values({ display_name: "Smoke" })
    .returning({ id: surveyor.id });
  if (!who) throw new Error("surveyor insert returned nothing");
  let runs = 0;
  const slowWrite = async (tx: Tx): Promise<WriteOutcome<{ ok: true }>> => {
    runs += 1;
    await tx.update(spot).set({ common_name: "Smoke" }).where(eq(spot.id, sac.id));
    // Hold the transaction open so the second send arrives while the first is running.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 200, body: { ok: true }, audit: null, dirty: false };
  };
  const info = {
    surveyorId: who.id,
    clientWriteId: randomUUID(),
    kind: "smoke.concurrent",
    schema: z.object({ ok: z.literal(true) }),
  };
  const writeDeps = { db, campusId: "sbu", publisher: { schedule: () => {} } };
  const [a, b] = await Promise.all([
    withWrite(writeDeps, info, slowWrite),
    withWrite(writeDeps, info, slowWrite),
  ]);
  if (runs !== 1 || a.replayed === b.replayed) {
    throw new Error(`concurrent same-id writes ran ${runs} times`);
  }
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x80, 0xff, 0xd9]);
  const sha = sha256Hex(bytes);
  const photos = postgresPhotoStore(db);
  await photos.put({ sha256: sha, bytes, contentType: "image/jpeg" });
  await db.insert(spot_photo).values({
    spot_id: sac.id,
    blob_sha256: sha,
    taken_at: new Date(),
    approved_at: new Date(),
  });

  const publisher = createPublisher({
    db,
    campusId: "sbu",
    target: fsTarget(dir),
    photos,
    dataBaseUrl: base,
    clock: { now: () => new Date("2026-10-13T18:00:00Z") },
  });
  const outcome = await publisher.runNow();
  publisher.close();
  if (!outcome.ok) throw new Error(outcome.error);

  const pointer = BundlePointer.parse(
    JSON.parse(readFileSync(join(dir, "bundle-latest.json"), "utf8")),
  );
  const parsed = parseBundle(JSON.parse(readFileSync(join(dir, pointer.url), "utf8")));
  if (!parsed.ok) throw new Error(parsed.detail);
  const published = parsed.bundle.spots.find((s) => s.id === sac.id);
  if (!published?.photos.some((p) => p.url === `${base}/photos/${sha}.jpg`)) {
    throw new Error("approved photo missing from the bundle");
  }
  const written = readFileSync(join(dir, `photos/${sha}.jpg`));
  if (!written.equals(Buffer.from(bytes))) throw new Error("photo bytes changed in transit");
  console.log(
    `write and publish smoke ok: 1 run for 2 sends, ${parsed.bundle.spots.length} spots, hash ${pointer.hash}`,
  );
} catch (error) {
  console.error("publish smoke failed:", error);
  process.exitCode = 1;
} finally {
  await close();
}
```

In `.github/workflows/ci.yml`, replace:

```yaml
      - name: Server smoke against Postgres (Node)
        run: bun run smoke:server node
```

with:

```yaml
      - name: Server smoke against Postgres (Node)
        run: bun run smoke:server node

      - name: Write and publish smoke against Postgres (Node)
        run: node apps/server/scripts/smoke-publish.ts
```

- [ ] **Step 8: Commit**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server bun.lock .github/workflows/ci.yml
git commit -m "feat(server): add debounced publisher with pages and fs targets"
```

---

### Task 9: Admin lists, docs, and final verification

**Files:**
- Modify: `apps/server/src/routes/admin.ts` (surveyor list, pending photos)
- Create: `apps/server/test/admin.test.ts`
- Modify: `docs/context/data-model.md`, `docs/context/overview.md` (decision 16)

**Interfaces:**
- Produces routes: `GET /admin/surveyors` (`SurveyorList`, every surveyor including revoked), `GET /admin/photos/pending` (`PendingPhotoList`, oldest first, with `spot_name` and `uploaded_by_name`).
- Consumes: `requireAdmin` (Task 4), `SurveyorList`, `PendingPhotoList` (Task 2).

- [ ] **Step 1: Write the failing tests**

`apps/server/test/admin.test.ts`:

```ts
import { expect, test } from "bun:test";
import { PendingPhotoList, SurveyorList } from "@perch/core";
import { photo_blob, spot_photo } from "@perch/db";
import { body, NOW, setup, signIn } from "./helpers.ts";

test("admins list every surveyor, including revoked ones", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${ana.id}/revoke`,
    headers: admin.headers,
  });
  const res = await ctx.app.inject({
    method: "GET",
    url: "/admin/surveyors",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const list = SurveyorList.parse(body(res));
  expect(list.surveyors.map((s) => [s.display_name, s.role, s.active])).toEqual([
    ["Admin", "admin", true],
    ["Ana", "surveyor", false],
    ["Seed Admin", "admin", true],
  ]);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/admin/surveyors", headers: ana.headers }))
      .statusCode,
  ).toBe(401);
});

test("pending photos list unapproved photos with spot and uploader names", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  const sha = "a".repeat(64);
  await ctx.db.insert(photo_blob).values({
    sha256: sha,
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    content_type: "image/jpeg",
    byte_size: 3,
  });
  await ctx.db.insert(spot_photo).values({
    spot_id: ctx.ids.spotIds["sac-lounge"],
    blob_sha256: sha,
    taken_at: NOW,
    uploaded_by: ana.id,
  });
  const res = await ctx.app.inject({
    method: "GET",
    url: "/admin/photos/pending",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const list = PendingPhotoList.parse(body(res));
  // The seed's unapproved sample photo is older, so it comes first.
  expect(list.photos.map((p) => [p.spot_name, p.uploaded_by_name])).toEqual([
    ["Central Reading Room", "Seed Admin"],
    ["SAC Second Floor Lounge", "Ana"],
  ]);
  expect(list.photos.every((p) => !p.approved)).toBe(true);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/admin/photos/pending", headers: ana.headers }))
      .statusCode,
  ).toBe(403);
});
```

Run: `bun test apps/server/test/admin.test.ts`
Expected: FAIL: `GET /admin/surveyors` returns 404.

- [ ] **Step 2: Add the list routes**

Full file; the invite and revoke routes from Task 4 are unchanged.

`apps/server/src/routes/admin.ts`:

```ts
import {
  CreateInviteRequest,
  CreateInviteResponse,
  IdParams,
  PendingPhotoList,
  SurveyorList,
  SurveyorPublic,
} from "@perch/core";
import { spot, spot_photo, surveyor } from "@perch/db";
import { asc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireAdmin } from "../auth/guards.ts";
import { createInvite, revokeSurveyor } from "../auth/invites.ts";
import { HttpError } from "../http.ts";

export function adminRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/admin/invites",
      { schema: { body: CreateInviteRequest, response: { 200: CreateInviteResponse } } },
      async (req) => {
        const admin = await requireAdmin(deps, req);
        const created = await createInvite(deps.db, {
          role: req.body.role,
          surveyorId: req.body.surveyor_id ?? null,
          createdBy: admin.id,
          now: deps.clock.now(),
          webOrigin: deps.config.webOrigin,
        });
        return { url: created.url, expires_at: created.expires_at.toISOString() };
      },
    );

    app.get("/admin/surveyors", { schema: { response: { 200: SurveyorList } } }, async (req) => {
      await requireAdmin(deps, req);
      const rows = await deps.db
        .select()
        .from(surveyor)
        .orderBy(asc(surveyor.display_name), asc(surveyor.id));
      return {
        surveyors: rows.map((r) => ({
          id: r.id,
          display_name: r.display_name,
          role: r.role,
          active: r.active,
          created_at: r.created_at.toISOString(),
        })),
      };
    });

    app.get(
      "/admin/photos/pending",
      { schema: { response: { 200: PendingPhotoList } } },
      async (req) => {
        await requireAdmin(deps, req);
        const rows = await deps.db
          .select({
            photo: spot_photo,
            spot_name: spot.official_name,
            uploaded_by_name: surveyor.display_name,
          })
          .from(spot_photo)
          .innerJoin(spot, eq(spot.id, spot_photo.spot_id))
          .leftJoin(surveyor, eq(surveyor.id, spot_photo.uploaded_by))
          .where(isNull(spot_photo.approved_at))
          .orderBy(asc(spot_photo.taken_at), asc(spot_photo.id));
        return {
          photos: rows.map(({ photo: p, spot_name, uploaded_by_name }) => ({
            id: p.id,
            spot_id: p.spot_id,
            url: p.url,
            taken_at: p.taken_at.toISOString(),
            is_cover: p.is_cover,
            uploaded_by: p.uploaded_by,
            approved: false,
            approved_at: null,
            spot_name,
            uploaded_by_name,
          })),
        };
      },
    );

    app.post(
      "/admin/surveyors/:id/revoke",
      { schema: { params: IdParams, response: { 200: SurveyorPublic } } },
      async (req) => {
        const admin = await requireAdmin(deps, req);
        if (admin.id === req.params.id) {
          throw new HttpError(403, { error: "forbidden", message: "cannot revoke yourself" });
        }
        return revokeSurveyor(deps.db, req.params.id);
      },
    );
  };
}
```

Run: `bun test apps/server`
Expected: PASS.

- [ ] **Step 3: Commit the routes**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server
git commit -m "feat(server): add admin surveyor and pending photo lists"
```

- [ ] **Step 4: Record the decisions**

In `docs/context/data-model.md`, replace:

```markdown
Floor penalty added to walk_matrix lookups at query time.
```

with:

````markdown
## Surveyor tooling tables (migrations 0002 and 0003)

```
surveyor(id, email null, display_name, role, invited_by, active, created_at)
invite(token_hash, role, surveyor_id null, created_by null, created_at, expires_at, used_at)   -- only the hash is stored
auth_session(id, surveyor_id, created_at, expires_at)        -- id = sha256(bearer token); 30 days, renewed past halfway
audit_log(id, surveyor_id, entity, entity_id, action, before_json, after_json, at)
write_receipt(client_write_id, surveyor_id, received_at, response_json)   -- replayed on retry
spot += status, review_state, reviewed_by, version, last_edited_by
photo_blob(sha256, bytes, content_type, byte_size, created_at)
spot_photo(id, spot_id, url null, blob_sha256, taken_at, is_cover, uploaded_by, approved_by, approved_at)
bundle_state(campus_id, dirty, write_seq, last_published_at, last_hash, last_deploy_hook_at,
             last_attempt_at, last_warnings, last_error)
```

`spot_photo.url` is the absolute data-site URL, written by the publisher. `bundle_state.write_seq` increases on every dirty write; a publish clears `dirty` only if it did not change while the publish ran.

Floor penalty added to walk_matrix lookups at query time.
````

In `docs/context/overview.md`, replace:

```markdown
14. Design track (2026-10-04): visual direction "The Divided Back" chosen (postcard back: printed labels on ruled lines, entered values in ballpoint blue, rubber-stamp status, postmark rings for verification). Contract in `apps/web/.impeccable/surfaces/apps-web.md`. Overrides surveyor spec S3 timing: `DESIGN.md` is written at the end of the web UI build from the shipped screens (Impeccable's process), and `packages/ui-logic/src/tokens.ts` is the token source until then. Components (button, field, segmented control, stepper, sheet, list row, status chip, toast, postmark) are derived in the web UI plan within the contract.
```

with:

```markdown
14. Design track (2026-10-04): visual direction "The Divided Back" chosen (postcard back: printed labels on ruled lines, entered values in ballpoint blue, rubber-stamp status, postmark rings for verification). Contract in `apps/web/.impeccable/surfaces/apps-web.md`. Overrides surveyor spec S3 timing: `DESIGN.md` is written at the end of the web UI build from the shipped screens (Impeccable's process), and `packages/ui-logic/src/tokens.ts` is the token source until then. Components (button, field, segmented control, stepper, sheet, list row, status chip, toast, postmark) are derived in the web UI plan within the contract.
16. Surveyor server plan (2026-10-04), detail in `docs/superpowers/plans/2026-10-04-surveyor-2a-server.md`: migration 0002 holds only the drops (`magic_link`, `spot_photo.r2_key`) and 0003 the additions, because drizzle-kit prompts for renames otherwise; `spot.noise_policy` and `surveyor.email` are nullable and `noise_policy` joins `missingV0Fields`; `spot.reviewed_by` backs "Reviewed by {name}"; `bundle_state` gains `write_seq`, `last_attempt_at`, `last_warnings`, `last_error`; only section writes bump `spot.version` (verify and review check it; publish, unpublish, and photo actions ignore it); every mutating survey route takes a `client_write_id`; signed-in surveyors fetch unapproved photos from `GET /survey/photos/:id/image`; invite failures are `invite_used`, `invite_expired`, or `invite_invalid`; a revoked surveyor and an expired session both get a plain 401; new env `CAMPUS_ID` (default `sbu`); the data site root holds `bundle-latest.json`, `bundle.<hash>.json`, `photos/<sha256>.jpg`, and `_headers`.
```

- [ ] **Step 5: Run the full verification**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all pass (187 tests across 24 files on the 2026-10-04 main).

Run: `bun run smoke:node && bun run smoke:server node && bun run smoke:server bun`
Expected: `smoke ok on node: 4 spots, 0 warnings`, `server smoke ok on node`, `server smoke ok on bun`.

Run: `bun run db:generate`
Expected: `No schema changes, nothing to migrate`.

Run: `grep -rn "$(printf '\342\200\224')" apps/server packages/core packages/db docs/context || echo clean`
Expected: `clean` (no em-dashes).

- [ ] **Step 6: Commit the docs**

Run the gate, then commit:

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add docs/context
git commit -m "docs: record surveyor server decisions and tables"
```

---

## Done criteria

- `bun run typecheck`, `bun run lint`, `bun test`, `bun run smoke:node`, `bun run smoke:server node`, `bun run smoke:server bun` pass from a clean clone; `bun run db:generate` reports no changes.
- 10 commits on the branch, one per task plus the Task 9 docs commit, each passing the gate.
- CI: the check job runs both server smokes; the Postgres job migrates, seeds, prints a bootstrap invite, starts the server against Postgres, and runs the write and publish smoke (the first real test of concurrent same-id writes).
- Plan B can start from `packages/core/src/survey/` (Task 2) without waiting for the rest.
- Deploy (plan E) needs only env vars: `DATABASE_URL`, `WEB_ORIGIN`, `DATA_BASE_URL`, `PUBLISH_TARGET=pages`, `CF_ACCOUNT_ID`, `CF_API_TOKEN` (Pages edit), `CF_DATA_PROJECT=perch-data`, optional `CAMPUS_ID`, `PORT`.
