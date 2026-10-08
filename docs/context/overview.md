# Overview and decisions

## Summary

A web app (PWA) that helps Stony Brook University students pick a study spot. It answers "where should I go right now" with a ranked recommendation, backed by a surveyed directory of every study spot on campus, historical busyness forecasts, and sparse live reports from users.

The app is a campus utility, not a business. It must be cheap to run, open source, and transferable to a student club so it survives the founder graduating.

## Status of decisions

Items marked DECIDED were confirmed by the project owner. Items marked PROPOSED came out of design discussion and are not yet confirmed; treat them as defaults that can change.

### DECIDED
- No deployed hardware of any kind (no sensors, door counters, beacons, ESP32 nodes). Not feasible.
- The directory of spots is a core product on its own, not just scaffolding for live data.
- A "pick a spot for me near a location" interaction is a core feature.
- Spot definition and attribute schema in sections 5 and 6 are accepted.
- Some Residential Computing Centers (RCCs) are believed to be residents-only. Eligibility must be modeled per spot. Verify each RCC individually.
- Language: fully typed TypeScript everywhere, strict settings ([stack.md](stack.md)).
- Validation and schemas: Zod, as the single source of truth for API types.
- Server framework: Fastify.
- Bun as the toolchain (package manager, scripts, tests) and the intended server runtime.

### PROPOSED
- Platform: web-first React + Vite PWA for v0; Expo (React Native) app added at v1 only if metrics justify it ([stack.md](stack.md)).
- Server runtime: Fastify on Bun, with code kept runtime-agnostic so Node is a drop-in fallback.
- Database: Postgres with Drizzle ORM and drizzle-zod ([stack.md](stack.md)). MongoDB considered and rejected.
- App name: Perch (recommended), OpenSeat (fallback). Not yet chosen; see Naming below.
- Recommendation-first home screen, map as secondary browse mode.
- Session mode (check-in, minimal focus timer, check-out) as the main live-data hook.
- Version plan and timeline in sections 12 and 14.

## Naming (in progress, not decided)

- Recommended: Perch. Short, verbable ("perch me somewhere quiet"), not tied to one campus.
- Fallback: OpenSeat. States the core promise (seat probability) literally.
- Other candidates: Nook, Roost, Den, Haunt, Hush, Lull, Cove, Settle.
- Rules: no "Seawolf", "SBU", or "Stony Brook" in the name (university trademarks, locks app to one campus).
- Before committing: check App Store, Play Store, and USPTO for conflicts; check domain and social handles (fallbacks like getperch or perch.study).
- Until a name is chosen, use the neutral working name `study-spot` for the repo and package scope.

## Decision log (chronological)

1. Hardware removed from scope entirely.
2. Directory confirmed as a standalone core product; random nearby pick confirmed as a core feature.
3. Spot definition and attribute schema accepted.
4. Platform: web-first React + Vite PWA, Expo gated to v1 (proposed).
5. Arrival detection corrected: web cannot geofence in background; scheduled push plus re-prompt instead.
6. Fully typed TypeScript, Fastify for the server, Bun as toolchain and intended runtime (decided).
7. Zod chosen for schemas and validation (decided).
8. Postgres + Drizzle + drizzle-zod recommended over MongoDB (proposed).
9. Name: Perch recommended, undecided.
10. v0 design brainstorm (2026-10-03), full detail in `docs/superpowers/specs/2026-10-03-perch-v0-design.md`:
    - Survey crew of 3 to 5, solo as worst case; route-based headcount sprints.
    - Before sprint data exists, quick pick uses surveyor busyness estimates labeled "estimate".
    - v0 covers the top 25 to 30 spots, fully surveyed.
    - No student accounts in v0; settings live on device. Magic links for surveyors only.
    - Scoring runs on device from a static, versioned campus bundle published by the server.
    - Home is a ranked pick plus 2 alternates with a weighted reroll.
    - Location is a building chooser with optional GPS that snaps to a building.
    - Hosting: Cloudflare Pages (web + bundle), Render free (Fastify), Neon free (Postgres), R2 (photos, backups). VPS kept as a portable fallback.
    - License: MIT for code, CC BY-SA 4.0 for spot data.
    - Map is lazy-loaded behind a tab; list-first browse.
    - Privacy-safe pick counts (spot and hour only, no device ID) collected in v0.
11. Stay PWA for v0; Expo remains gated to v1. Added `packages/ui-logic` (shared hooks, copy, tokens, adapters, no DOM) to maximize reuse for the future native app.
12. Postcard concept adopted (2026-10-03): spots presented as postcards (postmark = last verified, stamp = noise policy, address = location, message = directions). Shareable postcards with optional selfie ship in v0, rendered on device, never uploaded.
13. Surveyor tooling brainstorm (2026-10-04), detail in `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md`: invite links instead of email magic links; bearer token sessions (API and PWA are different sites); `DESIGN.md` postcard world established before surveyor screens; TanStack Router and Query; photos stored in Postgres and published as static files (R2 needs a card); any surveyor publishes, second person reviews; phases 2a by 2026-10-18 and 2b by 2026-10-27.
14. Design track (2026-10-04): visual direction "The Divided Back" chosen (postcard back: printed labels on ruled lines, entered values in ballpoint blue, rubber-stamp status, postmark rings for verification). Contract in `apps/web/.impeccable/surfaces/apps-web.md`. Overrides surveyor spec S3 timing: `DESIGN.md` is written at the end of the web UI build from the shipped screens (Impeccable's process), and `packages/ui-logic/src/tokens.ts` is the token source until then. Components (button, field, segmented control, stepper, sheet, list row, status chip, toast, postmark) are derived in the web UI plan within the contract.
15. Hours are not required to publish (2026-10-04, owner decision): `missingV0Fields` is shared by the publish check, the client, and the bundle builder, so requiring hours would drop every spot from the student app at each term rollover. Spots without current-term hours stay listed as "hours not confirmed" and are never picked.
16. Surveyor server plan (2026-10-04), detail in `docs/superpowers/plans/2026-10-04-surveyor-2a-server.md`: migration 0002 holds only the drops (`magic_link`, `spot_photo.r2_key`) and 0003 the additions, because drizzle-kit prompts for renames otherwise; `spot.noise_policy` and `surveyor.email` are nullable and `noise_policy` joins `missingV0Fields`; `spot.reviewed_by` backs "Reviewed by {name}"; `bundle_state` gains `write_seq`, `last_attempt_at`, `last_warnings`, `last_error`; only section writes bump `spot.version` (verify and review check it with a `version = base_version` guard on the update; publish, unpublish, and photo actions ignore it); every mutating survey route takes a `client_write_id`, and `withWrite` validates the response body before storing the receipt; spot and photo lookups are scoped to the request campus (another campus's spot or photo is 404, and `GET /admin/photos/pending` lists only this campus), and the publisher's photo URL rewrite is scoped to the publishing campus; signed-in surveyors fetch unapproved photos from `GET /survey/photos/:id/image`; invite failures are `invite_used`, `invite_expired`, or `invite_invalid`; revoking a surveyor also deletes the unused invites they created; a revoked surveyor and an expired session both get a plain 401; new env `CAMPUS_ID` (default `sbu`); the data site root holds `bundle-latest.json`, `bundle.<hash>.json`, `photos/<sha256>.jpg`, and `_headers`.
17. Surveyor client logic plan (2026-10-04), detail in `docs/superpowers/plans/2026-10-04-surveyor-2a-client-logic.md`: `packages/ui-logic` gains `Http`, `BinaryCache`, `Ids`, `Timers`, and `Foreground` adapters (browser globals do not type-check there); the outbox stores one record per write, orders by a monotonic `seq`, sends a draft's create before its photos and its photos before its text, chains `base_version` from each response, holds a spot's text behind its failed or conflicted writes, and treats an unparseable 2xx as failed; covers are set only on synced photos; admin actions are online-only; hours stay out of "Needed to publish" (plan A rule); React hooks live in the web UI plan; the copy module is generated from the copy deck by `bun run copy:gen`, which adds `sync.what.review`, `sync.what.cover`, `sync.unreadable`, `home.unreadable`, and `editor.verify.hours_missing`, and raises `conflict.body` to 90 characters.
18. Outbox requirements handed to plan D (2026-10-04, plan B final review): the `Lock` adapter defaults to an in-process lock, and apps/web must back it with Web Locks so tabs sharing storage take turns. Dead tabs: a `syncing` record from another tab is trusted until reload today, so plan D adds an owner id on syncing records and a liveness check in `pick` and `start()`; `start()` must not reset another live tab's in-flight write. The acceptance tests are in `packages/ui-logic/test/outbox.deadtab.test.ts`, skipped until then. Note for plan D: a spot held by another tab schedules no retry timer, so liveness must be re-checked on a timer, not only on foreground, online, or enqueue. A 5xx, 408, or 429 holds only that spot for the rest of the pass while other spots go on (skip-spot-on-5xx); a later pass started by any trigger tries it again, so the backoff paces timer retries only. Plan D owns a persisted server-copy cache: the spot list and spot details are persisted for offline use, merged from `onApplied`, and a stored version is never lowered. `onApplied` passes the applied write's `client_write_id` and kind (null for Keep theirs), so the UI ties "Saved" and "Marked as checked" toasts to the server's answer.
20. Surveyor redesign "Seawolf" (2026-10-07, owner, through live mocks), detail in `docs/superpowers/specs/2026-10-07-surveyor-redesign.md` and `docs/superpowers/plans/2026-10-07-surveyor-redesign.md`: supersedes decision 14 (The Divided Back) for the surveyor app. Clean, neutral, minimal (Raycast and Notion as references). Newsreader for headings and Instrument Sans for text, self-hosted from `@fontsource-variable`. Palette of four colors (paper, ink, Stony Brook red, mist) plus oklab mixes, with no status hues. Lucide at 1.75 stroke. Light by default with a per-device light, dark or system switch applied before first paint. Phone first, with one centered column on laptops (two-pane rejected: it fights focus, blockers and scroll restoration). Home gets a Keep going card, search and filters; the spot and the editor get a step bar over the 6 required sections; Save and next goes to the next missing required section. Survey spot summaries carry `cover_photo_id` (approved covers only) for thumbnails. Decision 12 (postcards in student mode) stands; only the surveyor look (decision 14) is retired.
