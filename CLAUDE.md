# Study Spot App: Project Context

Handoff document for a new Claude Code session. Read fully before writing code.

## 1. Summary

A web app (PWA) that helps Stony Brook University students pick a study spot. It answers "where should I go right now" with a ranked recommendation, backed by a surveyed directory of every study spot on campus, historical busyness forecasts, and sparse live reports from users.

The app is a campus utility, not a business. It must be cheap to run, open source, and transferable to a student club so it survives the founder graduating.

## 2. Status of decisions

Items marked DECIDED were confirmed by the project owner. Items marked PROPOSED came out of design discussion and are not yet confirmed; treat them as defaults that can change.

### DECIDED
- No deployed hardware of any kind (no sensors, door counters, beacons, ESP32 nodes). Not feasible.
- The directory of spots is a core product on its own, not just scaffolding for live data.
- A "pick a spot for me near a location" interaction is a core feature.
- Spot definition and attribute schema in sections 5 and 6 are accepted.
- Some Residential Computing Centers (RCCs) are believed to be residents-only. Eligibility must be modeled per spot. Verify each RCC individually.
- Language: fully typed TypeScript everywhere, strict settings (section 10).
- Validation and schemas: Zod, as the single source of truth for API types.
- Server framework: Fastify.
- Bun as the toolchain (package manager, scripts, tests) and the intended server runtime.

### PROPOSED
- Platform: web-first React + Vite PWA for v0; Expo (React Native) app added at v1 only if metrics justify it (section 10).
- Server runtime: Fastify on Bun, with code kept runtime-agnostic so Node is a drop-in fallback.
- Database: Postgres with Drizzle ORM and drizzle-zod (section 10). MongoDB considered and rejected.
- App name: Perch (recommended), OpenSeat (fallback). Not yet chosen; see section 19.
- Recommendation-first home screen, map as secondary browse mode.
- Session mode (check-in, minimal focus timer, check-out) as the main live-data hook.
- Version plan and timeline in sections 12 and 14.

## 3. Constraints

- No hardware. All data comes from manual surveys, users' own phones (foreground only), and institutional data if granted.
- No privileged network data. Campus Wi-Fi client counts live on DoIT's wireless controllers and require DoIT cooperation. Do not attempt SNMP, AP querying, probe-request sniffing, or BLE scanning. All are either impossible without credentials, unreliable due to MAC randomization, or violate campus acceptable use policy.
- No scraping behind login. Do not scrape authenticated university systems (e.g. the library's room booking system) with personal credentials.
- No university SSO integration (requires DoIT). Use Stony Brook email magic links instead.
- Phones cannot sample audio in the background on iOS. Noise is sampled in the foreground only.
- Web apps cannot read Wi-Fi BSSID. Indoor positioning is building-level geofence plus user confirmation.

## 4. Data sources, ranked

| Source | What it gives | Availability |
|---|---|---|
| Manual survey | All static attributes, seat counts | Self-serve |
| Headcount sprint | Historical occupancy per spot per time slot | Self-serve, recurring each semester |
| User live reports | Fullness and noise buckets, sparse | Self-serve, needs adoption |
| Session check-in/out | Presence and departure events | Self-serve, needs adoption |
| Arrival feedback | "Found a seat that worked: yes/no" ground truth | Self-serve |
| Library study room bookings | Near-exact occupancy for 22 rooms | Requires library cooperation |
| Library gate counts | Building-level traffic, may not be live | Requires library cooperation |
| Class schedule end times | Predicts surges near lecture buildings | Unverified whether publicly accessible |
| DoIT Wi-Fi AP counts | Campus-wide live occupancy | Requires DoIT, last-stage ask |

Known facts from research:
- The University Libraries have 22 study rooms across the Central Reading Room, North Reading Room, and Southampton library, booked through a system called "Stony Booked" (login required). It may be the open-source Booked Scheduler, which has an API. Unverified.
- Four "Core" rooms in the North Reading Room are single-occupancy. Graduate study rooms exist in the Central Reading Room and are graduate-only.
- Residential Computing Centers exist as additional computer labs.

## 5. Spot definition

Hierarchy: campus > building > floor > spot.

A spot is the smallest area where a student makes one decision ("I'll go there"). It must pass four tests:
1. One-glance: most seats are visible from one vantage point. Makes fullness reports meaningful and headcounts under 2 minutes.
2. One-policy: noise rules, food rules, and hours are uniform. Mixed policy means two spots.
3. One-access: everyone who can enter any part can enter all of it.
4. Nameable: describable to a friend in a few words. Use signage names where they exist.

Sizing and edge cases:
- Target roughly 8 to 80 seats. Split larger areas or areas with internal differences.
- Identical small rooms are grouped into one spot with a room count. Exception: bookable rooms with reservation data become child records (`spot_room`) because availability exists per room.
- Exclude corridors, pass-through areas, class-enrollment-only spaces, spaces requiring an unavailable reservation, and anywhere you cannot sit 30+ minutes undisturbed.
- Outdoor spots are included with a seasonal flag.

## 6. Attribute schema

Grouped by change frequency, which sets the re-survey cadence. Every group carries metadata: `last_verified_at`, `source` (survey | official | user), `confidence` (measured | estimated | reported).

### Identity (stable)
- `id`, `official_name`, `common_name`
- `building_id`, `floor`
- `lat`, `lng` (geofence and walking matrix anchor)
- `directions` (turn-by-turn text from nearest entrance)
- `photos[]` (each with `taken_at`)

### Access (per term)
- `eligibility`: enum `all_students | residents_building | residents_quad | grad_only | department | public`, plus `eligibility_scope` (which building, quad, or department)
- `entry_method`: enum `open | card_swipe | staffed_desk`
- `hours`: per day of week, per term, with separate exam-period hours and optional `last_entry` time
- `reservable`: bool, plus `reservation_system`, `reservation_url`

### Seating (stable, audit each term)
- `seat_count`, plus counts by type: `table_chair | carrel | soft | booth | standing`
- `effective_capacity` (observed occupancy at which the spot feels full; from headcount sprint, typically well below seat count)
- `table_config`: enum set `large_shared | small_2_4 | individual`
- `max_group_size` (largest contiguous seating)
- `spread_out_room`: bool

### Power and connectivity (stable)
- `outlet_coverage_pct` (fraction of seats within cord reach of a working outlet)
- `usb_outlets`: bool
- `wifi_mbps` (measured speed test)
- `cell_signal`: enum `poor | ok | good`

### Environment (time-varying, sampled across slots)
- `noise_policy`: enum `silent | quiet | conversational | group_friendly`
- `measured_noise` per time slot: enum bucket `silent | quiet | conversational | loud`, from the single designated survey phone so microphone bias is constant
- `natural_light`: bool, `lighting`: enum `dim | moderate | bright`
- `temperature`: enum `cold | neutral | warm`, plus `temperature_consistent`: bool
- `windows_view`: bool

### Use fit (stable)
- `calls_ok`: enum `not_allowed | allowed_impractical | allowed`
- `group_work_ok`: bool, `whiteboard`: bool
- `food_policy`: enum `none | covered_drinks | food_ok`

### Nearby amenities (stable, walking minutes)
- `bathroom_min`, `water_min`, `coffee_food_min`, `printer_min`, `microwave_min`, `late_food_min`

### Accessibility (stable)
- `step_free`: bool, `elevator`: bool, `accessible_seating`: bool

### Late-night suitability (stable)
- `open_past_midnight`: bool, `staffed_late`: bool, `lit_route_to_residences`: bool

### Busyness
- Forecast occupancy ratio by hour and day of week, with a separate exam-period profile
- `linked_class_buildings[]` (whose class end times predict surges here)
- Last live report: fullness bucket, noise bucket, timestamp

### Field priority
- Required for v0: identity, directions, eligibility, hours, seat_count, outlet_coverage_pct, noise_policy, food_policy, group_work_ok, last_verified_at.
- First headcount sprint: effective_capacity, measured_noise, forecasts, wifi_mbps, lighting, temperature.
- Later: amenity walking times, accessibility, late-night suitability, linked class buildings.

## 7. Product design

### Core reframe
- Answer first, map second. Home screen returns a best-fit spot plus 2 alternates, not a heatmap to interpret.
- Rank by probability that the right kind of seat is free at arrival, not raw busyness. A group of 4 needs 4 contiguous seats.
- Time budget is an input. Long walks for short windows are penalized.

### Flows
1. Quick pick (home): inputs are location, time available, active preset. Output is 1 recommendation plus 2 alternates, each with walking time, a confidence label (`live` or `forecast`), and the deciding attributes.
2. Browse: map plus list, attribute and eligibility filters, forecast heatmap layer, time scrubber for future arrival.
3. Spot page: directions, photos, attributes, today's forecast curve, last live report, tips, last-verified date.
4. Session: check in, minimal focus timer, check out.
5. Ask: "Is it full?" sends web push to users recently checked in at that spot.

### Presets
Defaults: silent solo, group project, calls/meetings, late night, quick 30 min. Users can create custom presets from any filter set.

### Eligibility profile
User self-declares residence building/quad and graduate status. Ineligible spots are hidden or shown locked. Declaration is unverified; acceptable because the app grants no physical access.

### Session mode
- Check-in gives presence; check-out gives departure events (otherwise unobservable); the timer keeps the app open.
- On check-in: one-tap fullness and noise prompt; foreground noise sample.
- On check-out: optional "seats free near you: yes/no."
- Keep the timer minimal. It is a data hook, not a product to expand.

### Arrival feedback
Ask "found a seat that worked: yes/no" after a quick pick. This is the only direct measurement of recommendation quality and feeds the seat-probability model.

Web limitation: background geofencing is impossible in a browser, so arrival cannot be detected unless the app is open. Web implementation:
- Server schedules a web push at pick time + walk time + about 5 minutes.
- Re-prompt on the next app open if unanswered.
- If the app is open and foreground location lands inside the picked building's geofence, prompt immediately.
Native (Expo, v1+) can use true background geofencing via expo-location and task manager.

Push caveat: iOS delivers web push only to PWAs installed to the home screen. Low install rates starve both arrival feedback and the ask flow. This is the main trigger for adding the Expo app.

### Tips (not reviews)
Short factual tips attached to a spot. Expire unless re-confirmed. Flaggable. No star ratings.

### Exam mode
Auto-enabled during midterm and finals windows: load exam hours, prioritize late and 24-hour spaces, switch to exam forecast profile, down-weight group presets in crowded zones.

### Social (v2, opt-in only)
- Friend presence: share current spot with selected mutual friends; ephemeral (ends at check-out or timeout); never default, never history, never visible outside mutual pairs.
- Group finder: pick a spot minimizing total walking time for all members and seating the whole group.

### UX honesty rules
- Every busyness reading shows one of two states: "reported N min ago" or "typical for <day> <time>". Never render a forecast as live.
- Live readings visibly fade back to forecast as they age.
- Every spot shows a last-verified date.

## 8. Models

### Forecast
Occupancy ratio `r = occupancy / effective_capacity`.
Model per spot as a building effect times an hour-of-day by day-of-week profile, pooled across spots to handle thin samples (a two-week sprint yields about 2 observations per slot per spot). Maintain separate regular-term and exam-period profiles. Refit after each sprint and continuously from audits.

### Live blend
Fullness buckets map to ratios: `empty=0.1, some=0.35, filling=0.6, nearly_full=0.85, full=1.0`.
Each report weight `w = 0.5 ^ (age_minutes / 30)`.
Blended ratio `r* = (k * r_forecast + sum(w_i * r_i)) / (k + sum(w_i))`, with prior strength `k` around 1 (tune).
A spot is labeled `live` when `sum(w_i)` exceeds a threshold, otherwise `forecast`.

### Seat probability
`P(seat)` as a decreasing function of `r*` at arrival time, adjusted for group size relative to `max_group_size` and effective capacity. Start with a logistic on `r*`; calibrate with arrival feedback.

### Recommendation score
1. Hard filters: eligibility, open at arrival and for at least the minimum useful duration, preset-required attributes.
2. `fit` = weighted match on soft preset attributes, in [0, 1].
3. `time_value = max(0, T_available - walk - overhead) / T_available`.
4. `score = fit * P(seat) * time_value`.
5. Random pick mode: sample from the top candidates weighted by score, avoid repeating recent picks, allow reroll.

### Anti-abuse
Geofence gating for reports, per-device rate limits, median aggregation, reputation weighted by agreement with consensus, periodic manual audits during sprints.

## 9. Data model (initial)

```
campus(id, name)
building(id, campus_id, name, lat, lng)
spot(id, building_id, floor, official_name, common_name, lat, lng, directions,
     eligibility, eligibility_scope, entry_method, reservable, reservation_system,
     reservation_url, seat_count, effective_capacity, max_group_size,
     spread_out_room, outlet_coverage_pct, usb_outlets, wifi_mbps, cell_signal,
     noise_policy, natural_light, lighting, temperature, temperature_consistent,
     windows_view, calls_ok, group_work_ok, whiteboard, food_policy,
     step_free, elevator, accessible_seating, open_past_midnight, staffed_late,
     lit_route_to_residences, outdoor, seasonal)
spot_seat_type(spot_id, type, count)
spot_table_config(spot_id, config)
spot_room(id, spot_id, name, capacity, reservable)
spot_hours(spot_id, term_id, day_of_week, opens, closes, last_entry, is_exam)
spot_amenity(spot_id, amenity, walk_minutes)
spot_photo(id, spot_id, url, taken_at)
spot_verification(spot_id, attribute_group, last_verified_at, source, confidence)
spot_linked_building(spot_id, building_id)
term(id, name, starts, ends, exam_starts, exam_ends)
walk_matrix(from_building_id, to_building_id, minutes)
headcount(id, spot_id, observed_at, count, surveyor_id)
noise_sample(id, spot_id, observed_at, bucket, source)   -- source: survey | user
forecast(spot_id, profile, day_of_week, hour, ratio)     -- profile: regular | exam
live_report(id, spot_id, device_id, reported_at, fullness, noise)
session(id, device_id, spot_id, started_at, ended_at, seats_free_on_exit)
arrival_feedback(id, device_id, spot_id, picked_at, arrived_at, success)
tip(id, spot_id, device_id, text, created_at, confirmed_at, flagged)
app_user(id, email, residence_building_id, residence_quad, is_grad)   -- "user" is reserved in Postgres
preset(id, user_id, name, filters_json)
device(id, user_id, reputation)
```

Floor penalty added to walk_matrix lookups at query time. Walk matrix precomputed once from OpenStreetMap footpaths; campus is small enough that no live routing engine is needed.

Implementation: this model is written as a Drizzle schema in `packages/db`. Enums in section 6 become Postgres enums via Drizzle `pgEnum`. Multi-valued attributes use child tables as above, not arrays or JSON, except `preset.filters_json`, which is validated by a Zod schema before write.

## 10. Stack

### Repository layout (monorepo, Bun workspaces)
```
packages/core     Zod schemas, inferred types, scoring, forecasting, live-blend math, API client. Pure TS, no runtime-specific APIs, unit tested.
packages/db       Drizzle schema, migrations (drizzle-kit), drizzle-zod generated schemas, typed query helpers.
apps/server       Fastify API, scheduled jobs.
apps/web          React + Vite PWA (vite-plugin-pwa).
apps/mobile       Expo app. Do not create until the v1 gate in section 12 is met.
```

### Runtime and toolchain
- Bun: package manager, workspaces, script runner, test runner (`bun test`), dev server runtime.
- Server runtime: Fastify on Bun. Fastify runs on Bun in practice but does not officially target it, so:
  - No `Bun.*` APIs anywhere in `apps/server` or `packages/*`. Use Node-compatible or standard APIs only.
  - Postgres driver: `postgres` (postgres.js), which works on both runtimes. Do not use Bun's built-in SQL client.
  - Fallback: if a concrete incompatibility appears, run the production server on Node. Switching must require only a start-command change. Current Node runs TS via type stripping.
- Avoid native addons. Use `bcryptjs` style pure-JS alternatives if hashing is ever needed (magic links should not require it).

### Type safety rules (DECIDED: fully typed)
- `tsconfig` base: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true` (no enums, namespaces, or parameter properties, so code stays compatible with Node type stripping).
- Bun and Node do not type-check at runtime. `tsc --noEmit` (project references across workspaces) runs in CI and as a pre-commit hook. A failing typecheck blocks merge.
- No `any`. No non-null assertions without a comment justifying them. Use `unknown` plus Zod parsing at every trust boundary (HTTP input, DB JSON columns, push payloads, localStorage).
- Zod is the single source of truth for API shapes:
  - Request and response schemas live in `packages/core`.
  - Fastify consumes them through `fastify-type-provider-zod` (validation and serialization from the same schema).
  - `apps/web` imports the inferred types and validates responses with the same schemas.
- DB types come from Drizzle; insert and select Zod schemas are generated with `drizzle-zod` and composed into API schemas where shapes match. Never hand-write duplicate interfaces for DB rows.
- Use string literal unions (derived from `z.enum`) instead of TS enums.

### Database (PROPOSED: Postgres + Drizzle)
- Postgres, hosted on a free tier (Neon or Supabase as plain Postgres). Supabase extras (auth, RLS-as-API) are not required; the Fastify server is the only database client.
- Drizzle ORM: schema written in TypeScript, SQL-like query builder, compile-time-checked queries, `drizzle-kit` for migrations, `drizzle-zod` to bridge into Zod.
- Alternatives considered: Kysely (good, but types come from a separate codegen step and no first-class Zod bridge), Prisma (separate schema language and generated client, heavier).
- MongoDB rejected because the data is relational (campus > building > floor > spot, hours per term, reports joined to spots and terms), the core workloads are time-bucketed aggregations (forecast fitting, decay, k-anonymity suppression) that SQL handles natively, enums and foreign keys enforce data integrity that a document store would push into application code, and schema flexibility is not needed because Zod already defines every shape.
- Geo: plain lat/lng columns are enough at campus scale (walking times come from the precomputed matrix). Add PostGIS only if a real spatial query need appears.

### Server responsibilities (why a server exists)
- Privacy enforcement: aggregation and k-anonymity suppression. Raw reports and check-ins never reach clients.
- Scheduled jobs: arrival-feedback pushes, live-report decay, forecast refits.
- Abuse controls: rate limiting, geofence validation, reputation scoring.
- Auth: magic links restricted to `@stonybrook.edu`; anonymous device ID for reports and reputation.
- Testing: `fastify.inject()` under `bun test`, no live network in tests.

### Frontend
- React + Vite PWA via `vite-plugin-pwa`. Web-first because v0 needs nothing native: zero install friction (link or QR), no App Store review or fee, crawlable spot pages.
- Prerender public spot pages at build time so search engines index them (free acquisition channel for "study spots" searches).
- Map: MapLibre GL JS with OSM tiles, wrapped behind a thin `Map` component interface so a later Expo port swaps only the implementation (MapLibre React Native bindings).
- Push: Web Push (iOS only for installed PWAs; see section 7 caveat).
- Noise: `getUserMedia` in foreground, compute level on device, send only the bucket, never store or transmit audio.
- Surveyor mode: same PWA, role-gated. Structured attribute form, headcount entry, designated noise-phone flag.

### Rejected platform options
- Expo with web target from day one: weaker web output, map libraries do not unify, pays native complexity before it is needed.
- Next.js: SSR unnecessary given build-time prerendering; PWA tooling less mature than vite-plugin-pwa.
- Flutter: discards React/TS reuse, poor crawlable web output.
- Native Swift/Kotlin: two codebases; iOS-only excludes a large share of students.

### Hosting
Free or near-free tiers. Open source repository from day one.

## 11. Privacy rules (non-negotiable)

- Store aggregates for display. Never display individual check-ins or reports.
- Suppress or bucket any displayed count below 5 people.
- No location history or trajectories. Session and report rows store spot ID and time only; purge raw rows after a fixed retention window once aggregated.
- No audio is ever recorded, stored, or transmitted.
- Friend presence is opt-in, mutual, ephemeral, and never default.
- Publish a plain-language data policy before launch.

## 12. Versions

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

## 13. Metrics and kill criteria

- Pick acceptance rate (picks the user walks to).
- Arrival success rate.
- Report density per peak zone per peak hour (target about 2 per hour in the top 10 zones).
- Forecast error against audit headcounts.
- Weekly active users, measured across an exam period.
- Kill criterion: if arrival success with live data is not better than forecast-only after one exam period, cut the live layer and keep directory plus forecasts.

### Crowdsourcing math (why live coverage is narrow)
With a 30-minute half-life, a spot needs about 2 reports per hour to stay fresh. Campus-wide coverage (about 50 spots, 12 hours) needs about 1,200 reports per day, roughly 5,000 daily opens at a 25% report rate. Not achievable. Ten peak spots over 6 peak hours needs about 120 reports per day, roughly 500 daily opens. Plausible after a semester. Everything else runs on forecasts.

## 14. Timeline (as of early October 2026)

- October to November: survey priority spots; run first headcount sprint (avoid Thanksgiving week distortion).
- Before fall finals: release v0 as a finals edition.
- Start of spring: fresh sprint (class schedule changes); release v1; target spring transfers and new students.
- Every semester: re-audit and re-sprint, run through a club.

Distribution: Honors College channels, RAs and residence hall boards, Undergraduate Student Government, campus subreddit and Instagram, paper QR flyers where posting rules allow (library posting typically needs approval).

## 15. Open items to verify

- Which RCCs and residence hall lounges are residents-only, per building.
- Whether "Stony Booked" exposes an API and whether the library will grant a read-only availability feed.
- Whether library gate counts exist, and whether they are live, hourly, or only periodic.
- Whether the course schedule with rooms and times is publicly accessible without login.
- Whether Stony Brook already licenses an occupancy product.
- Posting rules for QR flyers in the library and academic buildings.

## 16. Risks

- Survey labor recurs every semester and is the single point of failure. Surveyor mode must make it fast.
- Demand concentrates in first semester and exam periods.
- Directory has no moat beyond accuracy and upkeep; stale data makes it worse than a shared doc.
- Social layer is the biggest growth lever and the biggest privacy risk. Ship only after the core is trusted.

## 17. Suggested first tasks for this session

1. Scaffold the Bun workspace monorepo per section 10: shared strict `tsconfig` base, project references, `tsc --noEmit` script, pre-commit hook, CI workflow running typecheck and `bun test`.
2. `packages/db`: Drizzle schema for section 9 with `pgEnum` enums, first migration via drizzle-kit, drizzle-zod schemas, seed script with 3 to 5 sample spots.
3. `packages/core`: Zod API schemas and the recommendation scoring from section 8 as pure, unit-tested functions.
4. `apps/server`: Fastify with `fastify-type-provider-zod`, spot read endpoints, quick pick endpoint, `fastify.inject()` tests. Verify it runs on Bun; confirm the Node fallback start command also works.
5. `apps/web`: Vite PWA shell, surveyor mode (spot create/edit, headcount entry), quick pick and browse screens against seed data.
6. Walk matrix precompute script from OSM footpaths.

## 18. Writing conventions

- Never use em-dashes in UI copy, docs, or comments. Use commas or colons.
- UI copy is short and literal. No hype.

## 19. Naming (in progress, not decided)

- Recommended: Perch. Short, verbable ("perch me somewhere quiet"), not tied to one campus.
- Fallback: OpenSeat. States the core promise (seat probability) literally.
- Other candidates: Nook, Roost, Den, Haunt, Hush, Lull, Cove, Settle.
- Rules: no "Seawolf", "SBU", or "Stony Brook" in the name (university trademarks, locks app to one campus).
- Before committing: check App Store, Play Store, and USPTO for conflicts; check domain and social handles (fallbacks like getperch or perch.study).
- Until a name is chosen, use the neutral working name `study-spot` for the repo and package scope.

## 20. Decision log (chronological)

1. Hardware removed from scope entirely.
2. Directory confirmed as a standalone core product; random nearby pick confirmed as a core feature.
3. Spot definition and attribute schema accepted.
4. Platform: web-first React + Vite PWA, Expo gated to v1 (proposed).
5. Arrival detection corrected: web cannot geofence in background; scheduled push plus re-prompt instead.
6. Fully typed TypeScript, Fastify for the server, Bun as toolchain and intended runtime (decided).
7. Zod chosen for schemas and validation (decided).
8. Postgres + Drizzle + drizzle-zod recommended over MongoDB (proposed).
9. Name: Perch recommended, undecided.

## 21. Design tooling (Claude Code plugins)

Two design plugins are installed. Use them for UI and UX work instead of improvising.

### Impeccable (visual design and frontend craft)
- Product context lives in `PRODUCT.md` (written by `/impeccable init`). Read it before any UI work. `DESIGN.md` does not exist yet; it is created when the first surface establishes a visual world.
- Common commands: `/impeccable shape <surface>` to plan a screen, then build it; `critique`, `audit`, `polish`, `harden`, `adapt`, `clarify` for refinement. Run `/impeccable` with no argument for the menu.
- Design detector hook is enabled (`.impeccable/config.json`). It runs after edits to UI files and on session stop. Fix real findings; only add ignores through `impeccable hooks ignore-value`, never by hand.
- Owns: visual world, typography, color, layout, motion, component craft.

### Intent (UX strategy and experience design)
- Entry point: `/intent` or the `noor` agent to set context and route.
- Skills: `strategize` (framing, scoping), `journey` (flows), `organize` (IA, navigation), `wireframe` (screen structure), `articulate` (UI copy, voice), `fortify` (edge, empty, error, offline states), `include` (accessibility), `evaluate` (heuristic review, dark patterns), `measure` (metrics, experiments), `specify` (handoff specs), `investigate` (user research).
- Agents: `ember` (strategy), `wren` (flows, IA, copy), `vigil` (quality and a11y audit), `rune` (specs), `sage` (brainstorming).
- Owns: problem framing, flows, IA, copy, states, accessibility, and measurement.

### How they fit together
- Order for a new surface: Intent to frame the flow, structure, and copy (`journey`, `wireframe`, `articulate`), then Impeccable to design and build it (`shape`, then build), then `fortify` or `/impeccable harden` for states, and `vigil` or `/impeccable audit` before shipping.
- Both must respect section 7 (UX honesty rules), section 11 (privacy rules), and section 18 (no em-dashes, short literal copy). Voice is dry and student-made per `PRODUCT.md`.
- Flag any dark pattern (fake urgency, nagging push prompts, manipulative install prompts) with Intent's anti-pattern catalog. This is a campus utility and should not use growth tricks.
