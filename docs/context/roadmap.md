# Roadmap, metrics, risks, open items

## Versions

- v0, directory release: all v0-required attributes; quick pick on forecasts from the first sprint; browse with filters; eligibility profile; presets; surveyor mode.
- v1, live release: sessions, check-in/out reports, ask flow, arrival feedback, tips, exam mode.
  - Expo gate: build `apps/mobile` only if v1 metrics show low PWA install rates or weak arrival-feedback and ask-flow coverage. Shared logic moves over unchanged from `packages/core`; only UI is rewritten.
- v2, cooperation release: library room availability, gate counts if shared, class end-time surge model if schedule is accessible, friend presence, group finder.
- v3, other campuses: data model is campus-agnostic; survey labor requires a local surveyor team per campus.

### v0 acceptance criteria
- Surveyor can create and edit a spot with all v0-required fields from a phone in under 5 minutes.
- Quick pick returns 3 ranked, eligible, open spots with walking time and confidence label for any campus location.
- Browse filters on every v0 attribute and eligibility.
- Every spot page shows last-verified date and forecast curve (or "no data yet").
- Works installed as a PWA on iOS Safari and Android Chrome.

## Metrics and kill criteria

- Pick acceptance rate (picks the user walks to).
- Arrival success rate.
- Report density per peak zone per peak hour (target about 2 per hour in the top 10 zones).
- Forecast error against audit headcounts.
- Weekly active users, measured across an exam period.
- Kill criterion: if arrival success with live data is not better than forecast-only after one exam period, cut the live layer and keep directory plus forecasts.

### Crowdsourcing math (why live coverage is narrow)
With a 30-minute half-life, a spot needs about 2 reports per hour to stay fresh. Campus-wide coverage (about 50 spots, 12 hours) needs about 1,200 reports per day, roughly 5,000 daily opens at a 25% report rate. Not achievable. Ten peak spots over 6 peak hours needs about 120 reports per day, roughly 500 daily opens. Plausible after a semester. Everything else runs on forecasts.

## Timeline (as of early October 2026)

- October to November: survey priority spots; run first headcount sprint (avoid Thanksgiving week distortion).
- Before fall finals: release v0 as a finals edition.
- Start of spring: fresh sprint (class schedule changes); release v1; target spring transfers and new students.
- Every semester: re-audit and re-sprint, run through a club.

Distribution: Honors College channels, RAs and residence hall boards, Undergraduate Student Government, campus subreddit and Instagram, paper QR flyers where posting rules allow (library posting typically needs approval).

## Open items to verify

- Which RCCs and residence hall lounges are residents-only, per building.
- Whether "Stony Booked" exposes an API and whether the library will grant a read-only availability feed.
- Whether library gate counts exist, and whether they are live, hourly, or only periodic.
- Whether the course schedule with rooms and times is publicly accessible without login.
- Whether Stony Brook already licenses an occupancy product.
- Posting rules for QR flyers in the library and academic buildings.

## Next tasks (owner, 2026-10-10)

- **Photo bytes off Neon.** Neon Free is 1 GB per project and every photo (up to 1.5 MB) sits in Postgres, so about 600 to 1,000 photos fill it. Plan: keep pending photos in Postgres only until they are reviewed; once a photo is approved and published to the `perch-data` Pages site, clear its stored bytes in Postgres and keep only the hash, with the image route serving published photos from the data site URL; delete the bytes of rejected photos. R2 stays rejected (it needs a card). Must keep: the authenticated image route for pending photos, honest "Image unavailable", backups (published photos live on the data site, not in the dump), and the Pages limit of 20,000 files per site (plan cleanup before about 15,000 photos). Logic tier (full review).
- **Campus reference data for production.** The live database has no campus, terms, or buildings. Write a one-time, idempotent bootstrap with campus `sbu` (America/New_York), the real Fall 2026 and Spring 2027 terms with exam weeks from the SBU academic calendar, and real buildings with coordinates from the public campus map. The owner trims the building list before it runs.

## Risks

- Survey labor recurs every semester and is the single point of failure. Surveyor mode must make it fast.
- Demand concentrates in first semester and exam periods.
- Directory has no moat beyond accuracy and upkeep; stale data makes it worse than a shared doc.
- Social layer is the biggest growth lever and the biggest privacy risk. Ship only after the core is trusted.

## Suggested first tasks for this session

1. Scaffold the Bun workspace monorepo per [stack.md](stack.md): shared strict `tsconfig` base, project references, `tsc --noEmit` script, pre-commit hook, CI workflow running typecheck and `bun test`.
2. `packages/db`: Drizzle schema for [data-model.md](data-model.md) with `pgEnum` enums, first migration via drizzle-kit, drizzle-zod schemas, seed script with 3 to 5 sample spots.
3. `packages/core`: Zod API schemas and the recommendation scoring from [models.md](models.md) as pure, unit-tested functions.
4. `apps/server`: Fastify with `fastify-type-provider-zod`, spot read endpoints, quick pick endpoint, `fastify.inject()` tests. Verify it runs on Bun; confirm the Node fallback start command also works.
5. `apps/web`: Vite PWA shell, surveyor mode (spot create/edit, headcount entry), quick pick and browse screens against seed data.
6. Walk matrix precompute script from OSM footpaths.
