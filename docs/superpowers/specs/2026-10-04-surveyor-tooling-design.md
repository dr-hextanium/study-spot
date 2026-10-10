# Surveyor tooling design (build step 2)

Date: 2026-10-04. Status: approved in brainstorm, pending written review.

Parent spec: `docs/superpowers/specs/2026-10-03-perch-v0-design.md` (section 6 and build step 2). This document refines that section and overrides it where they differ. Overrides are listed in section 2.

## 1. Intent

- **Outcome:** a crew of 3 to 5 surveyors (solo founder as worst case) can create, edit, verify, photograph, and publish the top 25 to 30 study spots from a phone, offline, and later run headcount routes.
- **Deadlines:** phase 2a (survey-ready) by 2026-10-18, so the static survey starts around 2026-10-20. Phase 2b (sprint-ready) by 2026-10-27, before the headcount sprint.
- **Success:**
  - A surveyor on a real iPhone and Android phone can accept an invite, create a spot with every v0-required field and a photo while offline, sync, and publish in under 5 minutes.
  - The published bundle on the data site contains that spot within about a minute of sync.
  - No edit is lost to a dead zone, a sleeping server, or a concurrent edit.
- **Not in scope:** student screens (quick pick, browse, spot pages), postcard sharing, push, the live layer, email.

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| S1 | Surveyor login | Admin-generated single-use invite links, no email in v0. Overrides the parent spec's magic links. |
| S2 | Session transport | Bearer token stored on device, sent in `Authorization`. Not a cookie: the API (`*.onrender.com`) and PWA (`*.pages.dev`) are different sites and Safari blocks third-party cookies. |
| S3 | Visual design | Choose the postcard direction now, before building surveyor screens (chosen: "The Divided Back", contract in `apps/web/.impeccable/surfaces/apps-web.md`; tokens in `packages/ui-logic/src/tokens.ts`). `DESIGN.md` is written from the built screens at the end of the web UI plan. Survey mode is a plain, high-contrast variant of the same system. |
| S4 | Web libraries | TanStack Router, TanStack Query, form logic as hooks in `packages/ui-logic` validated by Zod, `idb` for IndexedDB. |
| S5 | Photo storage | Card-free: photo bytes in Postgres (`photo_blob`), published as hashed static files next to the bundle. Behind a `PhotoStore` interface so R2 can replace it. Overrides the parent spec's R2. |
| S6 | Publishing target | Cloudflare Pages direct upload to a dedicated data project (`perch-data`). The PWA is a separate Pages project (`perch`). |
| S7 | Who publishes | Any surveyor publishes; the spot is flagged `unreviewed` until a different surveyor or any admin marks it reviewed. Photos still need approval before publishing. |
| S8 | Phasing | 2a survey-ready, 2b sprint-ready, one implementation plan each. |

Card-free stack: Render free (Fastify), Neon free (Postgres), Cloudflare Pages (PWA and data). R2 needs a payment method on file (checked October 2026), so it is deferred.

## 3. Scope by phase

### Phase 2a, survey-ready (target 2026-10-18)

- `apps/server`: Fastify with `fastify-type-provider-zod`; invites and sessions; spot reads; section writes with version checks and idempotency; verify; publish with server-side completeness check; review; photo upload; publisher to Cloudflare Pages; `/health`; `admin:invite` bootstrap script.
- `apps/web`: Vite PWA shell (vite-plugin-pwa), TanStack Router and Query, invite acceptance, surveyor home, spot form (all sections incl. estimates), photo capture and on-device resize, offline outbox with sync indicator, conflict resolution, minimal admin (invite, revoke, publish now, photo approval).
- Design track: Intent journey and copy for the surveyor flow; Impeccable new-work establishing `DESIGN.md`.
- Deploy: Render, Neon, both Pages projects; `docs/ops.md`; migration workflow in GitHub Actions.

### Phase 2b, sprint-ready (target 2026-10-27)

- Headcount mode with foreground noise sample.
- Routes and route slots: build, claim, walk.
- Audit log view and pick count view in admin.
- Nightly maintenance and weekly backup GitHub Actions.
- Pick ping endpoint (`POST /ping/pick`) so it exists before the student app.

## 4. Structure

```
apps/server/src
  app.ts            buildApp(deps): Fastify instance without listen (tests use inject)
  main.ts           reads env, opens db, listens; runs on Node and Bun
  env.ts            Zod-validated environment
  auth/             invites, sessions, requireSurveyor and requireAdmin hooks
  routes/           health, auth, survey-spots, photos, admin, maintenance
  writes/           withWrite pipeline
  publish/          Publisher, PagesTarget, FsTarget
  photos/           PhotoStore (Postgres implementation)
apps/server/scripts
  admin-invite.ts   prints a bootstrap admin invite link
apps/web/src
  routes/           /invite/$token, /survey, /survey/spots/new, /survey/spots/$id,
                    /survey/spots/$id/$section, /survey/admin
  adapters/         browser implementations of ui-logic adapters
  ui/               components from DESIGN.md
packages/core       + survey API request and response schemas, missingV0Fields
packages/ui-logic   + outbox engine, survey API client, useSpotForm, survey copy, design tokens
packages/db         + migration 0002
```

Rules carried from the foundation: no `Bun.*` in `apps/server` or `packages/*`; no DOM in `packages/core` or `packages/ui-logic`; Zod at every trust boundary; strict TypeScript.

## 5. Data model changes (migration 0002)

- Drop `magic_link`.
- Add `invite(token_hash text PK, role surveyor_role, surveyor_id uuid null, created_by uuid, created_at, expires_at, used_at null)`. `surveyor_id` set means a re-login link for an existing surveyor; null means a new surveyor.
- `auth_session.id` holds the SHA-256 hash of the bearer token.
- `spot`: add `review_state` enum `unreviewed | reviewed` (default `unreviewed`), `last_edited_by uuid null` referencing surveyor.
- Add `photo_blob(sha256 text PK, bytes bytea, content_type text, byte_size int, created_at)`.
- `spot_photo`: add `blob_sha256` referencing `photo_blob`; drop `r2_key`; `url` stays but is derived at publish time (`photos/<sha256>.jpg`) and may be null before first publish.
- `write_receipt`: add `response_json jsonb` for idempotent replay.

The bundle schema does not change. Photo URLs in the bundle are absolute URLs on the data site.

## 6. Server

### Auth

- Invite token: 32 random bytes, base64url in the link `https://<pwa>/invite/<token>`. Only the SHA-256 hash is stored. Valid 48 hours, single use.
- `POST /admin/invites {role, surveyor_id?}` returns `{url, expires_at}`. Admin only.
- `POST /auth/accept {token, display_name?}`: validates unused and unexpired; creates the surveyor (display name required) or attaches to `surveyor_id`; marks used; creates a session; returns `{token, surveyor}`.
- Session token: 32 random bytes; stored hashed in `auth_session`; valid 30 days; renewed (new expiry) when more than half elapsed.
- `GET /auth/me` returns the surveyor; `POST /auth/logout` deletes the session.
- `POST /admin/surveyors/:id/revoke` sets `active = false` and deletes the surveyor's sessions.
- Hooks: `requireSurveyor` (active surveyor with valid session) and `requireAdmin`.
- CORS: allow only `WEB_ORIGIN`; `Authorization` header allowed; no credentials mode needed.
- Bootstrap: `bun run admin:invite "<name>"` with `DATABASE_URL` set prints an admin invite link.

### Write pipeline

```
withWrite(surveyor, clientWriteId, fn):
  transaction:
    if write_receipt exists for clientWriteId: return its response_json
    result = fn(tx)               -- includes version check where relevant
    insert audit_log(before, after)
    insert write_receipt(clientWriteId, surveyor, response_json = result)
    set bundle_state.dirty = true
  schedule publish
```

### Spot API

| Method and path | Behavior |
|---|---|
| `GET /survey/spots` | Summary list: id, slug, names, building, status, review_state, version, oldest verified group date, hours confirmed for current term |
| `GET /survey/spots/:id` | Full editable spot incl. child rows, hours for current term, estimates, photos with approval state |
| `POST /survey/spots` | `{client_write_id, identity}` creates a draft |
| `PUT /survey/spots/:id/:section` | `{client_write_id, base_version, data}`; sections: identity, access, hours, seating, power, environment, use_fit, amenities, accessibility, late_night, estimates. Version mismatch returns `409 {current}`. Success bumps `version`, sets `updated_at`, `last_edited_by`, `review_state = unreviewed`, stamps `spot_verification` for that group (source survey, confidence measured), returns the spot. |
| `POST /survey/spots/:id/verify` | `{client_write_id, base_version, groups[]}` stamps verification without changing data |
| `POST /survey/spots/:id/publish` | Runs `missingV0Fields`; returns `422 {missing}` or sets `status = published` |
| `POST /survey/spots/:id/unpublish` | Admin only; sets `status = draft` |
| `POST /survey/spots/:id/review` | Allowed for an admin or any surveyor other than `last_edited_by`; sets `review_state = reviewed` |

Section payload schemas live in `packages/core` and are shared with the client. The hours section payload carries `term_id` (defaulting to the current or next term from `pickTerm`) and replaces that spot's rows for that term.

`missingV0Fields(spot)` moves into `packages/core` and is used by the server publish check, the client publish button, and `toBundleSpot`, so all three agree.

### Photos

- `POST /survey/photos` multipart: `file` (JPEG, at most 1.5 MB), `spot_id`, `client_write_id`. Server checks type and size, hashes, upserts `photo_blob`, inserts `spot_photo` (unapproved).
- `POST /survey/photos/:id/cover` sets the cover (unsets the previous one in the same transaction).
- `POST /survey/photos/:id/approve` admin, or a surveyor other than the uploader.
- `POST /survey/photos/:id/reject` admin; deletes the `spot_photo` row.
- Unreferenced blobs are deleted by the maintenance job (2b).

### Publisher

- Triggers: 30 seconds after the last write (debounced), on startup when `dirty`, on `POST /admin/publish`. A single in-flight lock prevents overlap.
- Steps: `buildBundle`; serialize; SHA-256 (first 16 hex chars as the bundle hash); collect approved photos and set absolute URLs; ask the target which files it lacks; upload those; upload `bundle.<hash>.json`; then upload `bundle-latest.json`; clear `dirty`; record `last_published_at`, `last_hash`, warnings.
- On failure: `dirty` stays set, error logged and shown on the admin screen.
- Targets: `PagesTarget` (Cloudflare Pages direct upload API with a full manifest so unchanged files are skipped); `FsTarget` (writes a directory; tests, local dev, VPS fallback).
- Admin status: `GET /admin/publish` returns last time, hash, warnings, dirty, last error.

### Environment

`DATABASE_URL`, `WEB_ORIGIN`, `DATA_BASE_URL`, `PUBLISH_TARGET` (`pages | fs`), `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_DATA_PROJECT`, `FS_PUBLISH_DIR`, `PORT`. Validated by Zod at startup; the server refuses to start with invalid env.

## 7. Client

### Outbox engine (`packages/ui-logic`)

- Write record: `{client_write_id, kind, spot_id, payload, base_version, created_at, attempts, state, error}`; `state` is `pending | syncing | failed | conflict`.
- Stored through `KeyValueCache` (IndexedDB via `idb` on web). Photo bytes stored as separate records.
- Sync: serial, oldest first. Triggered by a new write, coming online, the app returning to the foreground, and a timer starting at 30 seconds with backoff to 5 minutes.
- Results: 2xx removes the write and applies the response; 409 marks `conflict` with the server's current spot; 422 or other 4xx marks `failed`; 5xx or network keeps `pending` and increments `attempts`; 401 pauses sync and routes to a "sign in again" screen.
- New drafts use a temporary id `local:<uuid>`; after the create succeeds, queued writes are rewritten to the real id.
- Version chaining: a queued write for a spot with an earlier queued write takes its `base_version` from that write's response at send time.
- Photos sync before text writes for the same spot.

### Local state

- TanStack Query caches survey lists and spot details, persisted to IndexedDB so lists open offline.
- The UI shows server state with pending writes applied on top, and marks each section "saved on this phone" or "synced".

### Screens

- `/invite/$token`: display name (new surveyor), accept, store the token. Explains that on iOS the link should be opened inside the installed app.
- `/survey` home: sync status; lists for Needs attention (failed and conflict writes, unreviewed spots edited by someone else, hours not confirmed this term), Stale (oldest verification first), Drafts; a New spot button.
- `/survey/spots/new`: identity only, then opens the spot.
- `/survey/spots/$id`: section list with complete, missing, and verified state; Publish (disabled with the missing list when incomplete); Mark reviewed when allowed.
- `/survey/spots/$id/$section`: one section editor with Save and "Verified, nothing changed". Hours editor: week grid, copy Monday to weekdays, exam toggle, past-midnight closes, "opens 24:00" impossible. Estimates: 2 by 4 grid cycling fullness buckets. Photos: capture, on-device resize, postcard-shot checklist once per session, set cover.
- Conflict view: field-by-field "yours" and "on the server"; keep mine (re-queue with new base) or keep theirs (drop).
- `/survey/admin`: create invite (copy link), surveyors with revoke, publish status with Publish now and warnings, photos awaiting approval.

### Photo pipeline (on device)

Decode with `createImageBitmap`, draw to a canvas with longest side at most 1600 px, encode JPEG at quality 0.8 (drops EXIF and GPS), reject if over 1.5 MB after encoding (retry at 0.7 once).

### PWA

vite-plugin-pwa; the surveyor routes and app shell are precached so they open offline. Update prompt, not silent update.

## 8. Design track

Runs from day 1 in parallel with the server stream; time-boxed to 3 days.

1. Intent `journey`: surveyor flow end to end, including offline, conflict, validation failure, and sign-in again.
2. Intent `articulate`: all surveyor copy (labels, empty states, sync and conflict messages, publish blockers, photo checklist). Dry, student-made, literal, no em-dashes.
3. Impeccable new-work: establish `DESIGN.md` with the postcard world, tokens (color, type, spacing, radius, motion), and two modes on one system: survey mode (dense, high contrast, sunlight-legible, minimal ornament) and student mode (postcard surfaces, stamps, postmarks). Core components: button, field, segmented control, stepper, sheet, list row, status chip, toast.
4. Tokens are defined once as TypeScript in `packages/ui-logic` and emitted as CSS variables for web.
5. Before 2a ships: Impeccable detector on changed UI files and a `vigil` or `/impeccable audit` pass.

UI work that does not depend on visuals (routes, outbox, form hooks, API client) starts before the design track finishes.

## 9. Deploy and ops

- Render web service from GitHub; start command `node apps/server/src/main.ts`; health check `/health`.
- Neon production database; migrations applied by a GitHub Actions workflow (`workflow_dispatch` and on tags), never on server start.
- Cloudflare Pages: `perch` builds `apps/web` from GitHub; `perch-data` is created empty and filled by the publisher. `*.pages.dev` URLs until a domain exists.
- `docs/ops.md`: card-free sign-up steps for Render, Neon, Cloudflare (ideally under a club email); env var reference; API token creation and rotation; `admin:invite`; migrations; backups; VPS fallback.
- Owner's one-time manual steps (about 30 minutes): create the three accounts, create a Cloudflare API token with Pages edit permission, set Render env vars and GitHub secrets.

## 10. Testing

- Server (`fastify.inject` on PGlite, `FsTarget`): invite accept, expiry, reuse, re-login invite, revoke; 401 and 403; section writes, 409, idempotent replay; publish 422 and success; review rules (not your own edit, admin always); photo type and size limits, cover switching, approval rules; publisher writes files, clears dirty, keeps dirty on failure, skips concurrent runs; env validation.
- Server smoke on Node and Bun in CI, plus the existing Postgres job extended to start the server and call `/health`.
- `ui-logic`: outbox ordering, temporary id rewrite, version chaining, 409, 422, 401 pause, backoff; `missingV0Fields` parity test shared with the server.
- Web: Playwright at phone viewport: accept invite, create a spot offline, come online, sync, publish; photo resize produces a JPEG under the limit without EXIF; conflict view resolves both ways.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Design track runs long | Time-boxed to 3 days; token-driven components can be refined after surveying starts |
| Render cold start on first sync | Offline outbox makes saves instant locally |
| Unsynced edits lost with cleared storage | Always-visible sync status; leave warning while writes are pending; photos sync first |
| Pages direct upload API changes or limits | `FsTarget` and VPS fallback; publish errors visible in admin |
| iOS separate storage for Safari and installed PWA | Invite screen instructs opening inside the installed app; admins issue new links in seconds |
| Bearer token stolen from a device | Revocable, 30-day expiry, scoped to surveyor routes, no student data exists |
| Concurrent edits | `base_version` checks, conflict view, audit log |

## 12. Acceptance

Phase 2a is done when all of these hold:

1. On a real iPhone and a real Android phone, a surveyor accepts an invite, creates a spot with all v0-required fields and a photo while offline, syncs, and publishes in under 5 minutes.
2. The data site serves a `bundle-latest.json` whose bundle contains that spot and its approved cover photo within about a minute of sync.
3. A second surveyor can mark the spot reviewed; the first cannot.
4. A conflicting edit from two phones shows the conflict view and resolves both ways.
5. CI passes, including server tests and smoke on Node and Bun and the Postgres job.
6. `docs/ops.md` lets someone with no context redeploy the stack.

Phase 2b acceptance is written in its own plan.
