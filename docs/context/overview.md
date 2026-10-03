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
