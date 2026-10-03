# Perch v0 design

Date: 2026-10-03. Status: approved in brainstorm, pending written review.

This spec covers the v0 "finals edition" release: directory, quick pick on forecasts and surveyor estimates, browse, spot pages, and surveyor tooling. Project-wide context lives in `docs/context/`; this document records the decisions and design made on top of it.

## 1. Intent

- **Outcome:** a Stony Brook student opens Perch on a phone and gets a trustworthy "go here now" pick in seconds, plus a browsable directory of the 25 to 30 most-used study spots.
- **Who:** students (anonymous in v0) and a crew of 3 to 5 surveyors who collect and maintain the data (solo founder as the worst case).
- **Success for v0:** the acceptance criteria in `docs/context/roadmap.md`, released in the first week of December 2026, before fall finals.
- **Critical path:** surveyor tooling, not the student UI. Surveying must start by about October 20.

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Survey labor | Crew of 3 to 5, solo worst case. Route-based headcount sprints. If the crew falls through, sprint covers top 10 spots at peak hours only. |
| D2 | Busyness before sprint data | Surveyor estimates per day type and time block, labeled "estimate". Replaced per slot once 2 or more real headcounts exist. |
| D3 | v0 coverage | Top 25 to 30 spots, fully surveyed and verified. |
| D4 | Student accounts | None in v0. Eligibility and presets stored on device. Magic links for surveyors only. |
| D5 | Where scoring runs | On device, from a static versioned campus bundle. Server never sees student picks except the anonymous pick ping. |
| D6 | Home interaction | Ranked pick plus 2 alternates, with a weighted "something else" reroll. |
| D7 | Location input | "From" building chooser, remembered. Optional GPS, snapped to nearest building; coordinates are never stored. |
| D8 | Hosting | Cloudflare Pages (web, prerendered pages, bundle), Render free (Fastify), Neon free (Postgres), R2 (photos, backups). VPS (Hetzner-style) kept as a portable fallback. |
| D9 | License | MIT for code, CC BY-SA 4.0 for spot data and photos. |
| D10 | Map | List-first browse. MapLibre lazy-loaded behind a Map tab. Spot pages use a static map image. |
| D11 | Usage signal | Privacy-safe pick pings: spot and hour only, no device ID, rolled up nightly, raw rows deleted. |

Hosting notes (checked October 2026): Fly.io has no free tier for new users. Render free sleeps after 15 minutes idle with a 30 to 60 second cold start; acceptable because only surveyors hit the server. Koyeb free (always on, card required) is the fallback if cold starts hurt. Neon chosen over Supabase because Supabase pauses free projects after a week of inactivity. Cloudflare Workers rejected because Fastify expects a long-running server.

## 3. Architecture

```
  Surveyors ──▶ apps/web (surveyor mode) ──HTTPS──▶ apps/server (Fastify, Render)
                 offline outbox (IndexedDB)            │ postgres.js
                                                       ▼
                                                 Neon Postgres (Drizzle)
                                                       │
                                     publishBundle() ──┴──▶ Cloudflare (Pages/R2)
                                                              /data/{campus}/bundle-latest.json
                                                              /data/{campus}/bundle.<hash>.json
                                                                       │
  Students ──▶ apps/web (student mode, PWA) ◀── service worker ────────┘
                scoring on device via packages/core
```

### Units

- **`packages/core`:** Zod schemas (API and bundle, the contract between server and client), scoring, forecast fit, estimate blending, time handling. Pure TS, no I/O.
- **`packages/db`:** Drizzle schema, migrations, drizzle-zod schemas, queries, including `buildBundle(db, campusId)`.
- **`apps/server`:** surveyor write API, surveyor auth, admin endpoints, pick ping, maintenance endpoint, `publishBundle()` behind a `BundlePublisher` interface (Cloudflare implementation and a filesystem implementation for VPS and tests).
- **`apps/web`:** one PWA, two modes. Student mode is static and reads only the bundle. Surveyor mode is behind an authenticated route and talks to the API.
- **`scripts/walk-matrix`:** OSM footpaths to building-to-building walking minutes.

### Properties

- Students never wait on a sleeping server; if the server or database is down, students use the last published bundle.
- The bundle contains only aggregates and forecasts: no raw headcounts, no surveyor IDs.
- v1 adds a `/live` endpoint; the client blends it into bundle forecasts with the same `packages/core` function.
- Bundle URLs are per campus from day one, so v3 multi-campus needs no URL change.

## 4. Data model additions

On top of `docs/context/data-model.md`:

```
spot_estimate(spot_id, day_type, block, bucket, surveyor_id, created_at)
  -- day_type: weekday | weekend
  -- block: morning | afternoon | evening | night
  -- bucket: empty | some | filling | nearly_full | full

surveyor(id, email, display_name, role, invited_by, active)   -- role: surveyor | admin
magic_link(token_hash, surveyor_id, expires_at, used_at)
auth_session(id, surveyor_id, created_at, expires_at)

audit_log(id, surveyor_id, entity, entity_id, action, before_json, after_json, at)
write_receipt(client_write_id uuid PK, surveyor_id, received_at)

route(id, name)
route_spot(route_id, spot_id, position)
route_slot(id, route_id, starts_at, claimed_by, completed_at)

bundle_state(campus_id PK, dirty, last_published_at, last_hash, last_deploy_hook_at)

pick_ping(id, spot_id, hour_bucket, day)
pick_daily(spot_id, day, count)
```

Changes to existing tables:

- `spot`: add `version int` (edit conflict detection), `status` (`draft | published | archived`), `eligibility_verified bool`.
- `spot_photo`: add `r2_key`, `approved_by`, `approved_at`. Only approved photos are published.
- `spot_verification`: gains an `hours` attribute group.
- Building creation requires walk matrix rows. Publish validates that every building pair has a time; the fallback is straight-line distance times 1.3, flagged in the bundle.

Retention: `pick_ping` deleted after the nightly rollup. `magic_link` deleted 1 day after expiry. `audit_log` kept (surveyor actions, not student data). `pick_daily` values below 5 are suppressed in any view outside the admin screen.

### Bundle schema (`schema_version` 1)

```
{
  schema_version, generated_at,
  campus: { id, name, tz: "America/New_York" },
  term: { id, name, starts, ends, exam_starts, exam_ends },
  buildings: [{ id, name, lat, lng }],
  walk: { building_ids: string[], minutes: number[][], estimated_pairs: [i, j][] },
  spots: [{ ...v0 fields, slug, eligibility, eligibility_scope, eligibility_verified,
            hours_unconfirmed, verified: { [group]: date }, photos: [{ url, taken_at }] }],
  hours: [{ spot_id, dow, opens, closes, last_entry, is_exam }],
  busyness: { [spot_id]: { regular: number[168], exam: number[168] | null,
                           confidence: ("measured" | "estimated" | "none")[168] } },
  data_license: "CC BY-SA 4.0", attribution
}
```

Forecast arrays use 168 slots (7 days by 24 hours, Monday 00:00 first, campus local time). Confidence is stored per slot so the UI can label each hour honestly. Additive optional fields do not bump the major `schema_version`; anything else does.

## 5. Scoring and forecasting (`packages/core`)

1. **Forecast fit (server, at publish).** Ratio `r = count / effective_capacity`, using `0.7 * seat_count` until `effective_capacity` is measured. Model `r = building_effect * campus_profile(dow, h) * spot_adjust`, fit by pooled least squares in log space with shrinkage toward building and campus means. Smooth with a 3-tap kernel across hours; cap slot-to-slot jumps (CI asserts no jump above 0.35 on seed data).
2. **Estimate fallback.** Slots with fewer than 2 headcounts use the surveyor estimate (empty 0.1, some 0.35, filling 0.6, nearly_full 0.85, full 1.0), confidence `estimated`. No estimate: campus profile, confidence `none`. Missing exam profile: regular times 1.25, capped at 1, confidence `estimated`.
3. **Hard filters (client).** Eligible for the user's profile and `eligibility_verified`; open at arrival and for at least `min(T_available, 30 min)`, respecting `last_entry` and past-midnight hours; `hours_unconfirmed` is false; preset-required attributes met.
4. **Fit.** Weighted match on the preset's soft attributes, in [0, 1]. Presets are Zod-validated `{ required: Filter[], soft: { attr, target, weight }[] }`.
5. **P(seat).** `logistic(-a * (r* - b))` with initial `a = 8`, `b = 0.8`. Group size: zero if `group > max_group_size`, else `r*_g = r* + (group - 1) / effective_capacity`. Uncertainty: `estimated` and `none` slots use `0.7 * P + 0.15`.
6. **Time value.** `max(0, T - walk - overhead) / T`. Walk is matrix minutes plus 1 per floor plus 2 for a staffed desk. Overhead is 3 minutes.
7. **Score.** `fit * P(seat) * time_value`. Top 1 plus 2 alternates. A "why this spot" line from the top contributing soft attributes plus P(seat) as words ("likely seats", "might be tight").
8. **Reroll.** Weighted sample from the top `max(5, 30%)` candidates, excluding the last 5 picks (sessionStorage), never below 40% of the top score.
9. **Time handling.** All slot and hours logic uses campus local time via `Intl.DateTimeFormat`. If device clock drift against the bundle response `Date` header exceeds 5 minutes, use server time.

Tests: property tests (score in [0, 1], fit monotonic in matched attributes, P(seat) non-increasing in `r*`), golden ranking tests on a fixed seed bundle, and fixture tests for DST weekends (2026-11-01, 2027-03-14), past-midnight hours, and exam windows.

## 6. Surveyor tooling

### Auth

Admin invites by email (allowlist, not open domain signup). Magic link: single use, 15 minutes, stored hashed. Session: httpOnly cookie, 30 days. Fallback when email is junked: admin-generated 6-digit one-time code. Email via Resend free tier (Postmark as fallback) with SPF, DKIM, and DMARC on the sending domain; tested against a real stonybrook.edu inbox early.

### Screens

- **Surveyor home (`/survey`):** my route slots today with claim buttons; stale queue sorted by oldest verification, with unconfirmed hours and unverified eligibility first; drafts.
- **Spot form:** sections Identity, Access, Hours, Seating, Power, Rules, Estimates, Photos, each saved and verified independently. Segmented controls for enums, steppers for counts, "use my location" plus building and floor picker, a week grid for hours with copy-to-weekdays and an exam toggle, a 2 by 4 estimate grid. Target: under 5 minutes per spot on a phone.
- **Photos:** captured in browser, resized to 1600 px, EXIF stripped on device, uploaded to R2 via presigned URL. Published only after a second surveyor approves. Surveyor guide rule: no identifiable people.
- **Headcount mode:** one screen per route spot with a large count field, plus and minus buttons, and a noise bucket. A designated noise phone can take a 10-second foreground sample; only the bucket is kept. Timestamp taken at capture. "Closed or inaccessible" option.
- **Admin:** invite and remove surveyors, build routes, generate sprint slots, approve photos, "Publish now" with last publish time and hash, audit log, pick counts.

### Offline and consistency

- All writes go through an IndexedDB outbox with a `client_write_id` (UUID). A sync indicator shows pending, syncing, and failed items, each with retry and discard.
- Spot edits carry the `version` they were based on. A stale version returns 409 with both versions; the form shows changed fields side by side to keep mine or theirs.
- Headcounts are append-only and never conflict.
- Surveyor mode caches its spot and route lists for walking without signal.

### API

All routes use `fastify-type-provider-zod` with schemas from `packages/core`.

```
POST /auth/request  POST /auth/verify  POST /auth/logout
GET  /survey/spots  GET /survey/spots/:id
POST /survey/spots  PATCH /survey/spots/:id/:section      (versioned)
POST /survey/headcounts (batch)  POST /survey/estimates
POST /survey/photos/presign  POST /survey/photos/:id/approve
GET  /survey/routes  POST /survey/route-slots/:id/claim
POST /admin/invite  POST /admin/publish  GET /admin/audit  GET /admin/picks
POST /admin/maintenance   (shared secret; called by GitHub Actions)
POST /ping/pick           (public; body { spot_id }; server adds hour and day)
```

Write pipeline: auth, `write_receipt` dedupe, version check, transaction plus `audit_log` row, set `bundle_state.dirty`, schedule publish.

### Publishing

- `bundle_state.dirty` is set inside every write transaction. Publish runs 30 seconds after the last write, on server startup, and after any request when `dirty` is set and no publish is in flight.
- Publish refits forecasts, builds the bundle, validates it against the core schema, uploads `bundle.<hash>.json`, then updates `bundle-latest.json`, then clears `dirty`. A failure leaves `dirty` set.
- The Cloudflare Pages deploy hook (to refresh prerendered spot pages) is debounced separately to at most once per hour, staying within the 500 builds per month free limit.

### Pick ping

`POST /ping/pick` stores `{ spot_id, hour_bucket, day }` only. No IP or device ID stored. Rate limited per IP in memory only. Fired when a student opens Directions or the spot page from a pick, not on render.

## 7. Student app

### First open

No onboarding wall. Home shows a pick immediately using defaults: from Melville Library, 1 hour, Silent solo preset, all-students eligibility. A dismissible line offers "Live on campus or grad? Set your access."

### Home: quick pick (`/`)

- Inputs: "From" building chooser with "use my location"; time chips 30m, 1h, 2h, Till close; preset chips (Silent solo, Group, Calls, Late night, Quick 30, custom); group size stepper for the group preset.
- Pick card: spot name, building and floor, walk minutes, busyness word plus confidence ("Usually some seats, typical Tue 2pm" or "estimate"), why-this-spot line, Directions, Something else.
- Two smaller alternate cards.
- Empty state names the closest open spot and suggests which filter to loosen.
- Data age line; becomes prominent when the bundle is older than 3 days.

### Browse (`/browse`)

List sorted by walking time from the chosen building: name, building, busyness word, open or closed, eligibility lock. Filter sheet covers every v0 attribute, eligibility, open now or at a chosen time, and "show locked spots". Arrival time scrubber. Map tab lazy-loads MapLibre with pins colored by busyness bucket.

### Spot page (`/spot/:slug`)

Prerendered at build time, then hydrated from the bundle. Name, common name, building and floor, directions, photos, static map image, attributes as plain rows, this week's hours (exam hours when relevant), today's forecast as 24 bars with the current hour highlighted and estimated slots hatched and labeled, "No data yet" when a day has no data, last-verified dates per group, data license credit, share button (Web Share API, copy-link fallback).

### Me (`/me`)

Access profile (residence building or quad, grad toggle) and presets in localStorage, parsed with Zod and reset to defaults on parse failure. Privacy note: "Nothing about you is stored on our servers. Settings live on this phone." Links to the data policy, source code, and licenses.

### PWA

- vite-plugin-pwa. App shell update shows "Update available, tap to reload"; no silent updates.
- `bundle-latest.json` fetched stale-while-revalidate; hashed bundles cached forever.
- Offline: shell, last bundle, and visited spot pages work. Quick pick works fully offline.
- Install prompt: once, after the second visit that includes a pick action. Dismissible forever.
- Bundle `schema_version` major mismatch: use the last good bundle, otherwise show "Update Perch to load spots."

### Locked spots

Never picked. In browse, greyed with a lock and label ("Residents of Kelly Quad"), hidden when "show locked" is off.

## 8. Risk fixes adopted

| # | Risk | Fix |
|---|---|---|
| 1 | In-memory publish lost on restart | Persistent `dirty` flag, publish on startup and after requests, manual publish button |
| 2 | No cron while Render sleeps | Derived work at publish; schedules run from GitHub Actions |
| 3 | Cold starts during survey walks | Offline-first outbox |
| 4 | Concurrent spot edits | `version` column, 409 with side-by-side merge |
| 5 | Outbox replays | `client_write_id` idempotency |
| 6 | Service worker staleness | Hashed bundles, small latest pointer, data age line, update prompt |
| 7 | App and bundle schema skew | `schema_version`, Zod check, last-good fallback, CI fixture check |
| 8 | Bundle growth | Flat arrays, compression, per-campus paths |
| 9 | Time zones and DST | Campus timezone in bundle, `Intl`, DST fixture tests |
| 10 | Wrong device clock | Use server `Date` when drift exceeds 5 minutes |
| 11 | Estimates treated as measurements | Uncertainty shrink in P(seat), plain "estimate" label |
| 12 | Jumpy thin-data forecasts | Pooling, smoothing, jump cap, bucketed display |
| 13 | Stale hours | Hours verified per term; unconfirmed spots excluded from picks; term rollover checklist |
| 14 | Wrong eligibility | Unverified eligibility never picked |
| 15 | Surveyor API abuse | Allowlist, hashed single-use tokens, httpOnly sessions, rate limits, audit log |
| 16 | Magic link deliverability | SPF, DKIM, DMARC, early inbox test, one-time code fallback |
| 17 | Photo privacy | Client-side EXIF strip, no people rule, second-surveyor approval |
| 18 | Secret leaks | Env vars only, `.env.example`, gitleaks in CI and pre-commit |
| 19 | Single owner of accounts | Club email, 2 admins per service, `docs/ops.md` |
| 20 | Free tier changes | Portable code, quarterly check, weekly `pg_dump` to R2 |
| 21 | Neon storage | Photos in R2; headcounts are tiny |
| 22 | Walk matrix drift | Publish validation, flagged straight-line fallback |
| 23 | No usage signal | Pick pings (D11) |
| 24 | Pages build limits | Deploy hook debounced to hourly |
| 25 | Static page and app route conflict | Single URL scheme; app hydrates over the prerendered page |

## 9. Foundation, quality, ops

### Repo

```
packages/core  packages/db  apps/server  apps/web  scripts/walk-matrix
docs/context/  docs/superpowers/specs/
docs/ops.md  docs/data-policy.md  docs/surveyor-guide.md  docs/sprint-runbook.md
LICENSE (MIT)  DATA-LICENSE (CC BY-SA 4.0)
```

- Bun workspaces, shared `tsconfig.base.json` with the strict flags from `docs/context/stack.md`, project references.
- Root scripts: `typecheck` (`tsc -b`), `test` (`bun test`), `lint` (Biome), `db:migrate`, `db:seed`, `dev`.
- Pre-commit via lefthook: typecheck, Biome, gitleaks on staged files.

### CI (GitHub Actions)

On push and PR: install, typecheck, lint, test, build web, validate the seed bundle against the Zod schema, bundle schema fixture check, gitleaks, server smoke test on both Bun and Node.

Scheduled: nightly `POST /admin/maintenance` (pick ping rollup, token purge, publish if dirty); weekly `pg_dump` to R2.

### Testing

- `core`: unit, property, golden, time fixtures.
- `db`: migrations against an ephemeral Postgres (CI service container); `buildBundle()` output passes the Zod schema.
- `server`: `fastify.inject()` for auth, version conflicts, idempotency, dirty flag and publish (fake `BundlePublisher`), rate limits. No live network.
- `web`: component tests for pick card states (typical, estimate, no data, closing soon, empty); Playwright smoke test of quick pick, browse, and a spot page against the seed bundle, including offline; outbox test with a fake network.

### Error handling

- Student: bundle fetch failure uses the cached bundle and shows its age. No cache and offline: "Can't load spots offline yet. Open once with signal."
- Surveyor: per-item outbox errors with retry and discard; conflict merge view.
- Server: typed `{ code, message }` errors; failed publish leaves `dirty` set and is retried; logs in Render. No third-party error tracker.

### Walk matrix

Overpass query for footpaths in a campus bounding box, graph build, Dijkstra from building entrance points (hand-entered in seed, centroid fallback), 1.3 m/s, rounded up to whole minutes. Output to `walk_matrix`. Rerun when buildings are added.

### Ops

`docs/ops.md` lists every service (Cloudflare, Render, Neon, R2, email provider, domain, GitHub org), admins, secret locations, rotation steps, backup restore, the VPS migration path, and the quarterly free tier check.

## 10. Build order

Each step gets its own implementation plan.

1. **Foundation:** repo tooling, CI, Drizzle schema and migrations, seed with 5 spots, bundle schema, `buildBundle`. About 1 week.
2. **Surveyor tooling:** auth, spot form, outbox, headcounts, estimates, routes, publishing, admin. About 2 weeks. Surveying starts when this works, target October 20.
3. **Scoring core** (parallel with step 2): forecast fit, filters, P(seat), score, reroll, time handling. About 1 week.
4. **Walk matrix.** 2 to 3 days.
5. **Student app:** visual direction via Intent and Impeccable, then quick pick, browse, spot pages, PWA, prerender. About 3 weeks.
6. **Launch hardening:** data policy, accessibility audit, real device testing on iOS and Android, bundle CDN check. Release in the first week of December 2026.

## 11. Out of scope for v0

Sessions, live reports, the ask flow, arrival feedback, tips, exam mode automation, student accounts, push notifications, friend presence, group finder, library and DoIT data integrations, the Expo app.
