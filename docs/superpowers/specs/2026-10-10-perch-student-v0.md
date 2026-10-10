# Perch student app v0: addendum

Date: 2026-10-10. Status: draft for owner review. Extends `docs/superpowers/specs/2026-10-03-perch-v0-design.md` (the v0 spec). It records only the decisions the v0 spec does not already make, plus the assumptions made while the owner was away. Plan: `docs/superpowers/plans/2026-10-10-perch-student-v0.md`.

## 1. Owner decisions (2026-10-10, relayed overnight)

| # | Decision |
|---|---|
| O1 | Student screens use the exact Seawolf system from `DESIGN.md`: the same tokens, type, components and motion, with no new visual language. New student components are composed from existing tokens and primitives (`Screen`, `Row`, `Pill`, `Banner`, `Sheet`, `Segmented`, `Stepper`, `FilterChips`, `Check` tags, `Button`). This replaces the postcard *visual treatment* of D12 on student screens. The postcard *share flow* (spec 7a, D13) stays, as the last phase. |
| O2 | Home has both **Something else** and **Surprise me**. Something else rerolls inside the current filters (spec 5.8). Surprise me ignores the preset and the extra filters, but keeps every hard rule: open for the chosen time, eligible for the user's access, access verified, hours confirmed, never locked. Each tap gives another pick; the last 5 Surprise picks are avoided. |
| O3 | The Home query inputs are the centerpiece: From, time, preset chips, group size and a More filters sheet, built from the existing chips, segmented control, stepper, sheet and tag toggles. |
| O4 | Browse has a map: MapLibre GL JS, lazy-loaded, on OpenFreeMap tiles (free, no key, no card). Pins show the busyness bucket using only the four palette colors and their oklab mixes, plus a word in the legend and the pin label (never color alone). OSM and OpenFreeMap attribution is always visible. |
| O5 | Me has a **Surveyor tools** row, shown only when the phone holds a surveyor session. Students never see survey tools. `/survey` and `/invite/$token` keep working unchanged. |
| O6 | All work stays on `dev`. Nothing is merged to `main` until the owner reviews it in the localhost preview. |
| O7 | Order: the scoring core first, then the most visible flows (Home quick pick with Surprise me, the spot page, Browse with the map), then Me, the pick ping and postcards. Postcards ship only if time allows. |

## 2. Decisions made in this addendum

### Routing and shell

- `/` is student Home. The redirect from `/` to `/survey` is removed. The student routes are `/`, `/browse`, `/spot/$slug` and `/me`, all under a pathless layout route `_student` that renders the bottom tab bar (Home, Browse, Me). `/survey/*` and `/invite/$token` stay as they are, without the tab bar.
- The theme switch is the existing `ThemeSwitch` with the same per-device preference. It appears in Me (students) and stays in the survey Home sheet.
- Manifest: `start_url` becomes `/` and the description becomes "Find a study spot on campus." Installed surveyor PWAs open on student Home and reach survey mode through Me, then Surveyor tools.
- Student routes never call the API origin. The one exception is the pick ping (Phase G), which is off by default. This is pinned by an e2e test, because any API call wakes Render and Neon.

### Scoring details the v0 spec leaves open

- **Two day-of-week conventions.** Busyness slots use 0 = Monday (`slots.ts`). `BundleHours.day_of_week` uses 0 = Sunday (the hours editor). Core exposes both from one instant (`slotDow`, `hoursDow`) and names the one each lookup uses.
- **Times are instants.** Arrival is `now + walk` in UTC milliseconds. Hours become instants through `zonedInstant(date, minutes, tz)`. In the repeated hour at the end of DST, ambiguous local times resolve to the earlier instant. Local times that do not exist (the spring-forward gap) move forward by the length of the gap.
- **Hours.** A closing time at or before the opening time means the next day, and `24:00` is the end of the day. Spans that touch are chained, so a 24-hour spot stays open across midnight. An arrival after `last_entry` counts as closed. During the exam window (`exam_starts..exam_ends`, by campus date), a spot's exam rows apply when it has any. A spot with none keeps its regular hours on exam days.
- **Exam busyness.** The bundle sends `exam: null` when there is no exam forecast. The client then uses `min(1, regular * 1.25)`, with confidence `estimated` (or `none` if the slot had no data).
- **Walk.** Walk is the matrix minutes, plus `floorPenalty(floor)`, plus 2 for a staffed desk. `floorPenalty` is: the integer floor n >= 1 gives n - 1; `0` gives 0; a negative n gives |n|; "B", "basement", "LL" or "lower" gives 1; "G", "ground", "main" or "lobby" gives 0; anything unparseable gives 0. A number with a suffix, like "2M", counts as its number.
- **Till close.** T is the minutes from now until the spot closes, capped at 480. The minimum open time after arrival is `min(T, 30)`.
- **Soft fit.** A criterion matches as yes (1), unknown (0.5, for a null attribute) or no (0). A required criterion passes only on yes. With no soft terms, fit is 1.
- **Eligibility.** `eligibility_scope` is free text. It matches the profile when its normalized form (lowercase, runs of non-alphanumerics become "-") equals the chosen building id or the normalized building name. If it does not match, the spot is locked. `department` spots are always locked in v0, because the profile has no department. `public` and `all_students` are open. A spot with `eligibility_verified = false` is listed in Browse as "Access not confirmed" and is never picked.
- **Zero factors.** A candidate whose P(seat) is 0 (the group is larger than `max_group_size`) or whose time value is 0 (the walk uses up the window) is excluded and never shown. A candidate with fit 0 (it passes the required filters but matches no soft term) stays, ranked last, and the reroll floor keeps it out of draws.
- **Reroll and Surprise me.** Both draw a weighted sample, by score, from the top `max(5, ceil(30%))` candidates with score >= 40% of the top score. Each has its own last-5 history in `sessionStorage` (`student:recent:pick`, `student:recent:surprise`). When the history excludes the whole pool, the candidate seen longest ago comes back. Surprise me scores with fit = 1. It keeps the group size only when the Group preset is active.
- **Randomness.** Every random draw takes `rand: () => number`. Tests use a seeded mulberry32 generator. No property-testing dependency is added.
- **Empty state.** It names the closest spot that is open and eligible but filtered out, and suggests one thing to loosen, in this order: preset or filters, group size, time, access.

### Honesty presentation

- Every busyness string is built by one presenter. Measured slots read "Usually some seats, typical Tue 2 PM". Estimated slots read "Some seats, estimate". Slots with no data read "No busyness data yet". A unit test fails if any busyness string lacks "typical", "estimate" or "No busyness data", or contains "live", "now" or "right now".
- The 24-bar forecast labels the current hour "This hour", never "Now". Estimated bars are hatched, no-data bars are outlined, and the caption says "Typical {day}, not live."
- Every spot page shows "Checked {date}" (the newest verified date) and a per-group list under Last checked. Browse rows show the check date too.
- No displayed number is a headcount, so the below-5 suppression applies only to pick counts, which students never see.

### Location

- "Use my location" calls `GeolocationAdapter.current()` once per tap. It snaps the fix to the nearest bundle building by haversine distance, keeps only the building id, and then discards the coordinates. Coordinates are never stored, logged, put in a URL or sent anywhere. A test asserts that the stored preferences hold only a building id.

### Data and offline

- Stale-while-revalidate: the bundle store returns the last good bundle from IndexedDB at once, then revalidates. It revalidates again on foreground (when the last check is over 5 minutes old) and on reconnect.
- Clock drift: the data site sends `Access-Control-Expose-Headers: Date`. Only a network response's `Date` is trusted, never a cached one. When skew exceeds 5 minutes, the app uses the corrected time everywhere.
- Locally the e2e server also serves its publish directory as the data site (port from `E2E_DATA_PORT`, default 8788) and can publish once at boot (`E2E_PUBLISH_ON_BOOT=1`), so the student screens have data in the preview and in Playwright.

### Map

- Tiles and style: OpenFreeMap `positron` in light mode and its dark style in dark mode, when it exists (verified at build time; otherwise `positron` for both). Attribution comes from the style and stays expanded.
- The map chunk (MapLibre plus the view) is a separate dynamic chunk, excluded from the service worker precache. Offline, the Map tab says it needs a connection and the list still works.
- Pins are DOM markers styled with the palette variables, so they follow the theme:

  | Bucket | Pin |
  |---|---|
  | empty | Paper fill, `edge` ring |
  | some | Mist fill |
  | filling | 45% ink |
  | nearly full | 75% ink |
  | full | Ink |
  | no data | Paper with a dashed ring |
  | selected | Red ring |

### Deferred from the v0 spec

- **Prerendered spot pages** (spec 7, risk 25): deferred. The PWA is Workers static assets with no Worker script, and `main` allows 10 pushes a day, so per-publish rebuilds have no good trigger. `/spot/$slug` renders on the client from the bundle through the SPA fallback.
- **Static map image on the spot page**: there is no free static-map API without a key. The spot page has an "Open in Maps" link instead.
- **Install prompt** (spec 7, PWA): kept, in Phase F, as an ink note after the second visit that includes a pick action, and dismissible forever.

## 3. Assumptions (for the owner to confirm)

1. O1 means the postcard look (stamps, postmarks, print treatments) is gone from student screens. Postcards exist only as the shared image in Phase H, drawn in Seawolf colors and type.
2. Built-in presets, with weights in the plan:
   - Silent solo: must be silent or quiet; prefers silent, outlets and carrels.
   - Group: group work must be OK; prefers a whiteboard, small tables, outlets and conversational noise; default group size 3.
   - Calls: calls must be allowed; prefers good signal, conversational noise and outlets.
   - Late night: prefers open past midnight, staffed late, a lit route home and late food.
   - Quick 30: no filters, and it sets the time to 30 minutes.
3. A custom preset made in Me stores its chosen filters as required criteria, with no soft terms.
4. Seat words: P(seat) >= 0.7 is "Likely seats", >= 0.4 is "Might be tight", and below that is "Probably full". Busyness buckets use the midpoints between the fullness ratios (0.225, 0.475, 0.725 and 0.925).
5. The access profile is "Where you live" (any bundle building) plus a quad (any building whose id ends in `-quad`) plus a grad toggle. The bundle has no link from a building to its quad, so the student picks both.
6. Directions open Google Maps walking directions to the spot's point, or Apple Maps on iOS. Only the spot's coordinates go into the link.
7. Student sharing uses the share sheet first and copies the link as a fallback. This is the reverse of the surveyor `createShare`, so a new `createWebShare` adapter is added.
8. Pick ping (Phase G) never stores raw rows. The server counts in memory and upserts straight into `pick_daily (spot_id, day, count)` when pings have been idle for 10 minutes, after 60 minutes at most, and on shutdown. The nightly rollup and the `pick_ping` table go unused, because no new scheduled workflows are allowed. The client call is built but off by default (`VITE_PICK_PING=1` turns it on), because each flush wakes Neon.
9. The bundle has about 30 spots, so the scoring loop runs over every spot on every input change, with no memoization beyond `useMemo`.

## 4. Questions for the owner (none block tonight's work)

1. **Pick ping on or off at launch?** The client call wakes the Render server on the first ping after it sleeps. Each flush wakes Neon for about 5 minutes, at most once an hour while pings flow (Neon's free tier allows 100 compute-hours a month). It ships off. Say "on" to set `VITE_PICK_PING=1` in the Cloudflare build env.
2. **Quad list:** is "every building whose id ends in `-quad`" right for SBU housing, or should the bootstrap mark quads explicitly?
