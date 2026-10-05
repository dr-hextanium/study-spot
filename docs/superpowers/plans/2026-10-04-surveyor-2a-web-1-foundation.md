# Surveyor 2a Web UI Implementation Plan (Plan D), Part 1 of 3: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Parts run in order: this file, then `2026-10-04-surveyor-2a-web-2-screens.md`, then `2026-10-04-surveyor-2a-web-3-finish.md`. Each part ends with working, tested software.

**Goal:** The outbox meets decision 18 (Web Locks, dead-tab liveness, a version floor), the server gains the two reads the web app needs (campus buildings, a re-login hint on invite links), the copy deck covers every web state, and `apps/web` exists as a Vite + React 19 PWA with browser adapters for every `ui-logic` adapter, a persisted server-copy cache, React hooks over the shared logic, the Divided Back component set, the survey shell (ink header band with sync postmark, sync sheet, Sign in again, update prompt), the invite screen, and the spot list, all tested in jsdom and end to end in Chromium against the real server.

**Architecture:** `packages/ui-logic` keeps all logic (outbox, view model, forms, copy, tokens); `apps/web` adds only browser bindings and screens. Adapters (`src/adapters/`) implement `KeyValueCache` and `BinaryCache` on one IndexedDB database (`idb`, every call bounded by a timeout), `Http` on `fetch` with multipart, `Lock` and the new `Liveness` on Web Locks, the new `QueueSignal` on BroadcastChannel, plus timers, foreground, network, geolocation, share, and session storage. `src/app/deps.ts` wires them once into an `AppDeps` object that `AppProvider` hands to hooks; tests build the same object on the `ui-logic` fakes (`test/harness.tsx`). Server reads go through TanStack Query, persisted to IndexedDB with every restored query checked by Zod, and every server spot is merged by `newerSpot` so a version never goes down (refetch, `onApplied`, another tab's snapshot). Screens are TanStack Router file routes (`src/routes/`, generated `routeTree.gen.ts` committed). CSS comes from `tokens.ts` through `toCssVariables`, installed as one `<style>`; component styles use only those variables.

**Tech Stack:** React 19.3, Vite 8.3 with @vitejs/plugin-react 6.1, vite-plugin-pwa 2.0 (generateSW, prompt) with workbox-window 7.4, @tanstack/react-router 1.170 and @tanstack/router-plugin 1.168, @tanstack/react-query 5.104 with react-query-persist-client and query-async-storage-persister 5.104, idb 8.0, Zod 4.6, lucide-react 1.52, @fontsource/public-sans 5.3 (self-hosted, 600 and 700), Vitest 5.0 with jsdom 30, @testing-library/react 16.3 and dom 10.4, fake-indexeddb 6.2, @playwright/test 1.63 (Chromium), TypeScript 7 (`tsc -b`), Biome 2, Bun 1.3.14 (workspace, `bun test` for packages and server), Node 24+ (e2e server).

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (sections 3, 4, 7, 8, 9, 10, 12) and `docs/superpowers/specs/2026-10-03-perch-v0-design.md` (7a). Design: `docs/design/surveyor-journey.md`, `docs/design/surveyor-copy.md`, `apps/web/.impeccable/surfaces/apps-web.md` (direction contract), `packages/ui-logic/src/tokens.ts`, `PRODUCT.md`. Decisions: `docs/context/overview.md` 13 to 18. Built on plans A and B as merged (`main` at `16591c1`, which includes plan E's deploy commits). Index: `docs/superpowers/plans/2026-10-04-surveyor-2a-index.md`.

## Global Constraints

- TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (from `tsconfig.base.json`, unchanged). `apps/web` adds `jsx: react-jsx` and the DOM libs in its own tsconfigs only.
- No `any`. No non-null assertion (`!`). No TS `enum`, `namespace`, or parameter properties. A type assertion (`as`) in `src` only with a comment saying why it holds (`queries.ts`, `serverCache.ts`, `platform.ts`, `fields.ts`); tests cast partial fakes of DOM types, with a comment.
- Relative imports use explicit `.ts` or `.tsx` extensions.
- No DOM, React DOM, or `Bun.*` in `packages/*`. `packages/ui-logic` stays React-free: hooks live in `apps/web/src/hooks/` (decision 17), wrapping the shared functions.
- Zod at every trust boundary: build env (`src/env.ts`), API responses (the `ui-logic` client), IndexedDB (outbox records already; the persisted query cache in `sanitizePersisted`), route params and search (`validateSearch`, `params.parse`), localStorage session (`StoredSession`), e2e server state.
- Copy: every user-facing string comes from `t()` or `plural()` over `docs/design/surveyor-copy.md`; new strings are added to the deck and regenerated with `bun run copy:gen`. Server error messages are never shown raw.
- Styling: colors, sizes, radii, durations, and easings only through the token variables from `toCssVariables`; no other hex values in CSS or TSX. 44 px minimum targets. No shadows except the sheet. Square 4 px corners.
- No em-dashes anywhere (code, comments, docs, copy, commit messages). Use commas or colons.
- Commits: Conventional Commits, subject 72 characters or fewer (aim for 50), imperative, lowercase, no trailing period, no attribution or co-author lines.
- Every commit passes `bun run typecheck && bun run lint && bun test` and, once `apps/web` exists, `bun run --filter '@study-spot/web' test`. Run `bun run fix` before committing. The machine is often loaded: if `bun test` times out, rerun with `--timeout 60000` before suspecting code.
- Playwright needs Chromium once per machine: `cd apps/web && bunx playwright install chromium` (CI uses `--with-deps`).

## Review Focus

1. **iOS: the installed app and Safari keep separate storage.** A link accepted in Safari signs in Safari, not the home-screen app, and the link is then used up. The invite screen never accepts on load, shows the iOS note in an iPhone browser tab, and a re-login link (`?relogin=1`, now added by the server) skips the name so an admin can resend a link in seconds. Tests: Task 8 (`invite.test.tsx`: "on an iPhone browser tab the note says…", "a re-login link asks for no name…", "a malformed token never calls the server"), Task 10 (`shell.e2e.ts`: iPhone user agent). The real storage split is checked on a real iPhone in the deploy plan's acceptance run.
2. **First load offline, before any sync.** With nothing cached the list says it needs a connection and new spots still save on the phone; after one online visit the shell opens from the service worker and the persisted query cache, damaged entries dropped by Zod. Tests: Task 7 (`serverCache.test.ts`: "persisted queries are checked on restore"), Task 9 (`home.test.tsx`: "first run offline with nothing cached…"), part 3 Task 15 (`finish.e2e.ts`: "the app opens offline from the service worker…").
3. **Two tabs, or a tab killed mid-send.** Web Locks serialize the queue across tabs; a `syncing` write carries its tab's owner id, a live tab's write is never reset or resent, a dead tab's write is taken over by pick or start(), and a recheck timer finds it without any other trigger. Tests: Task 1 (`outbox.deadtab.test.ts`, all four, two of them the previously skipped acceptance tests), Task 5 (`adapters.test.ts`: "a tab's liveness lock is visible to other tabs until it releases"), part 3 Task 15 ("a tab closed mid-send leaves its change to the other tab").
4. **A 360 px phone with long names.** Header text uses short forms ("Offline", "3 waiting") so the postmark fits; titles, row labels, and names truncate with an ellipsis; nothing scrolls sideways. Tests: Task 6 (`components.test.tsx`: "the header postmark uses the short forms…"), Task 10 (`shell.e2e.ts`: "at 360 px nothing scrolls sideways…"), part 2 Task 13 ("a 60-character spot name at 360 px…").
5. **Reduced motion and dark mode.** The stamp lands as a 120 ms fade with reduced motion and nothing else moves; dark mode keeps the header band distinguishable from the page (the dark shell token was black on near-black). Tests: Task 3 (`tokens.test.ts`: "the header band stands apart from the page"), Task 6 ("postmarks say their state and stamp when the date changes"), Task 10 (`shell.e2e.ts`: "dark mode and reduced motion…").

## Decisions where the spec is silent or the code disagrees

Recorded in `docs/context/overview.md` as decision 19 by part 3, Task 17.

- **Liveness and QueueSignal are new `ui-logic` adapters.** The outbox stamps `owner` on a `syncing` record and asks `Liveness.alive(owner)` in `pick` and `start()`. A record with no owner (stored before this change) counts as gone. The default is an in-process registry keyed by the outbox's cache object, so outboxes sharing a cache in one process (the existing two-tab tests) see each other and nothing leaks between tests. `apps/web` holds a Web Lock named `study-spot:tab:<uuid>` for the tab's life and reads others with `navigator.locks.query()`. `QueueSignal` (BroadcastChannel on web) wakes other tabs after any queue change, so a tab's header and lists follow another tab's sync. A pass that skips a spot held by a live tab schedules a recheck in 15 s (`HELD_RECHECK_MS`). `settle` matches the owner as well as `attempts`. `start()` reads the network state again after subscribing (a change before then was lost).
- **Version floor on enqueue.** `enqueue` seeds a write with the larger of the version the screen saw and the version this phone last stored from a server answer. With the persisted cache this closes decision 18's risk: a stale snapshot (another tab, a crash before the throttled persist) can no longer make the surveyor's own next write conflict with their previous one.
- **Persisted server cache is TanStack Query's persister,** stored in the same IndexedDB as the outbox under `query:survey`, throttled to 250 ms, `buster` `survey-1`, `maxAge` 30 days. `gcTime` is `Infinity`: a 30-day `gcTime` overflows the 2^31 ms timer limit and collects at once (found by the Vitest run, see Probes). Only `["survey", ...]` queries are persisted; admin data is fetched fresh. `staleTime` is 0 so every screen refetches on mount while showing the cached copy (`networkMode: offlineFirst`).
- **Two server additions.** `GET /survey/campus` returns the campus (with its time zone, for "checked today") and its buildings (for the building picker and the fallback point); nothing else lists buildings, and the published bundle may not exist yet on a fresh deploy. `createInvite` appends `?relogin=1` to links for an existing surveyor (including the bootstrap admin link), so the invite screen can skip the name. The client also falls back: `display_name_required` brings the name field back.
- **Slugs** are `slugify("<official name> <building id>")`, at most 80 characters. Basics on a draft still only on this phone regenerates the slug from the name (fixing a refused `slug_taken` create); a spot on the server keeps its slug.
- **Spot point:** a location fix within 50 m, else the building's point (journey edge 10).
- **Postmark state:** solid (fresh) when checked within 90 days, dashed (stale) when older, struck when never. `TermRef` carries no dates, so "this term" is approximated by 90 days (`STALE_AFTER_DAYS`).
- **Labels:** Public Sans 600, 13 px, full caps with 0.06 em tracking, ink color (not muted), as the design ledger suggested for sunlight. A real-phone sunlight check is an owner step in part 3's done criteria (the deploy plan's acceptance run does not include it).
- **Token fixes:** dark `shell` is `#2b2e35` (was `#000000`, invisible on `#121316`) and the band has a 1 px rule below it; `radius.control` is 4 (the contract's square 4 px corners).
- **Header postmark** uses short forms (`sync.short.*`); the sync sheet shows the long ones. Section rows show no description (they do not fit 44 px); the overview shows a sync state, or fill and check date, plus a postmark ring.
- **Failure copy:** `failureView` maps each code and status to a deck string; server messages are never shown (Zod output is not readable). `bad_response`, `photo_missing`, `no_base_version`, `write_id_reused`, `not_found`, and photo type and size failures hide Retry, since resending the same write cannot succeed.
- **Toasts count a write as settled when it leaves the queue** (decision 18): "Saved" when it leaves within 3 s, "Saved on this phone" when still queued after that or offline, nothing when it fails or conflicts (the header and banner say so). "Marked reviewed" only after the review lands; until then the chip says "Review queued".
- **Unpublish and photo approval stay online calls,** not outbox writes (the outbox has no unpublish kind, and approval is a judgment made with the server's current list). Covers are queued and set on synced photos only (decision 17).
- **Estimates grid** has time blocks as rows and weekdays and weekends as columns, so "Nearly full" fits at 360 px. A tap moves a cell one bucket up and wraps; only set cells are sent.
- **Hours editor** edits one block per day (closed, open 24 hours, or opens and closes); further blocks already stored are kept unchanged. A time input cannot show 24:00, so a midnight close reads 00:00 ("next day").
- **Web unit tests run under Vitest (jsdom),** excluded from `bun test` by `bunfig.toml`; browser tests under Playwright are named `*.e2e.ts` (bun picks up `*.spec.ts`).
- **E2E server:** `apps/server/scripts/e2e-server.ts` runs `buildApp` on a seeded PGlite database under Node, publishes to a temp directory with `fsTarget`, and starts its clock at `2026-10-13T16:00:00Z`, ticking; Playwright pins the page clock to the same time, so the seed term stays current whatever the date. It writes 40 bootstrap admin invites to `apps/web/e2e/.state/server.json`.
- **One JS chunk on purpose** (about 560 KB before gzip): the service worker precaches it so every survey screen opens offline; route code splitting would only add cache entries.

## Probes run (2026-10-04 and 05, in `/private/tmp`, nothing left in the repo)

- **Versions** (`npm view`, 2026-10-04): react and react-dom 19.3.0, @types/react 19.3.0, vite 8.3.2, @vitejs/plugin-react 6.1.1, vite-plugin-pwa 2.0.0, workbox-window 7.4.1, @tanstack/react-router 1.170.41, @tanstack/router-plugin 1.168.42, @tanstack/react-query 5.104.1, @tanstack/react-query-persist-client and query-async-storage-persister 5.104.1, idb 8.0.3, @playwright/test 1.63.0, vitest 5.0.3, jsdom 30.1.2, @testing-library/react 16.3.3, fake-indexeddb 6.2.5, lucide-react 1.52.0, @fontsource/public-sans 5.3.0.
- **TanStack Router file routes under TS 7.0.2 with the repo's strict flags and `exactOptionalPropertyTypes`:** `createFileRoute`, `params.parse` throwing `notFound()`, `validateSearch` with a Zod object, typed `Link` params, and the generated `routeTree.gen.ts` all typecheck with no errors, also under `composite` and `emitDeclarationOnly` (no TS2742). The generated file starts with `// @ts-nocheck` and must be excluded from Biome.
- **vite-plugin-pwa 2.0 with Vite 8.3:** `registerType: "prompt"`, `injectRegister: false`, and `useRegisterSW` from `virtual:pwa-register/react` build and typecheck (types `vite-plugin-pwa/react`); generateSW precaches the shell. Vitest needs an alias for the virtual module (`test/pwaStub.ts`).
- **Web Locks typing (lib.dom in TS 7):** `navigator.locks.request` is generic and `query()` returns `held` with optional `name`; `navigator.locks` is assignable to the narrow `LockApi` type the adapters take.
- **`Blob` from `Uint8Array`:** TS 7 rejects `new Blob([bytes])` for a `Uint8Array<ArrayBufferLike>` (it may view a SharedArrayBuffer); `new Blob([new Uint8Array(bytes)])` (an ArrayBuffer-backed copy) typechecks. Used in the HTTP adapter and the photo URL hook.
- **React 19 hooks with `ui-logic`'s no-DOM tsconfig** (`lib: ["ES2023"]`, `types: []`): `createContext`, `createElement`, and `useSyncExternalStore` typecheck with @types/react 19.3, so hooks could move into `ui-logic` later for an Expo app. They stay in `apps/web` now because they bind TanStack Query and the web providers.
- **Vitest 5 + jsdom + Testing Library:** `renderHook` and `useSyncExternalStore` work. fake-indexeddb under jsdom returns a `Uint8Array` from another realm (`instanceof` fails), so the binary store copies through `ArrayBuffer.isView`; adapter tests run in the `node` environment. jsdom has `<dialog>` without `showModal`, polyfilled in `test/setup.ts`. A `gcTime` of 30 days printed `TimeoutOverflowWarning` and collected queries at once, hence `Infinity`.
- **Bun 1.3.14 `[test] pathIgnorePatterns`** in `bunfig.toml` keeps `bun test` out of `apps/web`.
- **Playwright 1.63, Chromium headless shell** (about 200 MB under `PLAYWRIGHT_BROWSERS_PATH`): on a Pixel 7 profile against `vite preview`, the service worker controls the page after one reload, `context.setOffline(true)` then reload serves the shell from the precache, Web Locks are visible through `query()`, and `createImageBitmap` plus canvas JPEG encoding work. A fresh context that goes offline before its service worker controls the page cannot load (so offline steps navigate in-app).
- **What was replayed:** the end state of each part was assembled from this plan's code on an export of `main` (`16591c1`) and passed `bun run typecheck`, `bun run lint`, `bun test` (377 tests), Vitest (46 web tests after part 1, 72 after part 2, 77 after part 3), `vite build`, and Playwright (4, 8, and 12 tests after parts 1, 2, and 3). Task 4's scaffold state (its own `main.tsx` and `__root.tsx`) was also built and tested alone (3 tests). Intermediate task states and each "Expected: FAIL" step were not replayed one by one. The Impeccable detector found nothing in `apps/web/src`; its URL scan flags only the contract's stamp easing (part 3, Task 16).

## Deferred items from plans A and B and the design track

| Item | Where it is handled |
|---|---|
| `Lock` backed by Web Locks (decision 18a) | Task 5 (`createWebLock`), Task 7 (`deps.ts`) |
| Dead-tab liveness, owner id, pick and start(), recheck timer, skipped tests enabled (18b) | Task 1, Task 5, part 3 Task 15 |
| Persisted server-copy cache, merged from `onApplied`, never lowered (18c) | Task 7 (`serverCache.ts`, `deps.ts`), Task 1 (version floor) |
| `onApplied` carries the write; leaving the queue counts as settled for toasts (18d) | Task 7 (`useToasts.tsx`) |
| baseUrl trailing slash in the API client | Task 2 |
| Session `setItem` can throw | Task 7 (`sessionState.ts` returns false; invite shows an error) |
| `store.photo()` maps storage errors to `photo_missing` | Task 3 (`failureView`: "take it again", no Retry) |
| Re-saving a locally failed `no_base_version` write keeps a null base | Task 1 (version floor) and Task 3 (copy says discard and save again) |
| `stop()` does not halt a running pass | Task 1 (`settle` matches owner; a stopped tab's late answer is ignored) |
| Retry on `bad_response` can never succeed | Task 3 (`canRetry: false`), part 2 Task 12 (Discard only) |
| A never-settling storage call freezes the queue | Task 5 (`withTimeout` on every IndexedDB call, fetch timeouts) |
| Verify of hours with no current-term hours gets 422 | part 2 Task 12 (Checked button replaced by `editor.verify.hours_missing`) |
| Optional sections' fill reads display values | part 2 Task 12 (row shows the sync state first, "Didn't save" for failed) |
| Admin sees a review button on a local draft | Task 7 (`useSpotView` returns "none" for local drafts; part 2 uses it) |
| "1 changes" plural | Task 3 (`plural()` and singular ids) |
| Copy name samples assume 20 characters | Task 6 and part 2 (truncation with ellipsis; 60-character e2e) |
| Copy gaps: row syncing state, queued review, `failureReason`, 403/404, `invalid_request` | Task 3 |
| `home.unreadable` naming | Kept (renaming ids churns the deck); Task 9 uses it with `home.unreadable_one` |
| A tab skips a spot held by another tab and sets no timer | Task 1 (`HELD_RECHECK_MS`) |
| `onApplied` skips stale answers | Task 7 (toasts settle on leaving the queue) |
| Admin role kept on re-login links | part 3 Task 14 (link made with the surveyor's role) |
| Clearing a required field silently unpublishes | part 2 Task 12 (`fieldsCleared`, confirm sheet) |
| Non-admin photo approval has no UI | part 2 Task 12 (Approve on the Photos screen, hidden for the uploader) |
| Header sync text too long at 360 px | Task 3 (`sync.short.*`), Task 6 |
| "Nearly full" does not fit a 62 px cell | part 2 Task 12 (grid turned: blocks down, day types across) |
| Section descriptions do not fit 44 px rows | part 2 Task 12 (rows omit descriptions) |
| Unbounded `{name}` lengths | Task 6 (ellipsis on titles, rows, chips), part 2 Task 13 (e2e) |
| 13 px small caps in sunlight | Task 6 (full caps, 600, ink); real-phone check is an owner step in part 3's done criteria |
| Dark shell nearly invisible | Task 3 |
| `radius.control` 6 vs 4 | Task 3 |
| Buttons use ink, `accent` is for entered values | Task 6 (`.btn--primary` is `--color-text`) |
| Journey says "Verified", copy says "Checked" | Copy wins (`editor.verify` "Checked, nothing changed") |

## File Structure

Whole plan D; parts 2 and 3 list their own subsets.

```
package.json                         unchanged (scripts already cover copy:gen, typecheck, lint, test)
tsconfig.json                        + apps/web, apps/web/test, apps/web/e2e references
bunfig.toml                          new: bun test ignores apps/web
biome.json                           + ignores for routeTree.gen.ts and web build and test output
.gitignore                           + apps/web build and test output, e2e state
.github/workflows/ci.yml             + web unit tests and build; new web-e2e job

docs/design/surveyor-copy.md         + "Web UI states (plan D)" section
packages/ui-logic/src/adapters.ts    + Liveness, QueueSignal
packages/ui-logic/src/liveness.ts    createLocalLiveness, createLocalSignal (in-process defaults)
packages/ui-logic/src/survey/outbox.ts      owner ids, liveness in pick and start(), signal, recheck, version floor
packages/ui-logic/src/survey/writes.ts      + WriteRecord.owner
packages/ui-logic/src/survey/api.ts         + campus(); trailing slash dropped
packages/ui-logic/src/survey/failure.ts     fieldLabel, fieldList, failureView, publishWarningText
packages/ui-logic/src/copy/index.ts         + plural, PlainCopyId, CountCopyId
packages/ui-logic/src/tokens.ts             dark shell, radius.control
packages/core/src/survey/api.ts             + CampusInfo
apps/server/src/routes/campus.ts            GET /survey/campus
apps/server/src/auth/invites.ts             ?relogin=1 on re-login links
apps/server/scripts/e2e-server.ts           real server for Playwright (PGlite, fsTarget, pinned clock)

apps/web/
  package.json  tsconfig.json  vite.config.ts  vitest.config.ts  playwright.config.ts  index.html
  public/icons/  icon.svg, rendered PNGs, PROVENANCE.txt
  src/main.tsx  env.ts  routeTree.gen.ts (generated, committed)
  src/adapters/  timeout.ts idb.ts http.ts browser.ts locks.ts
  src/app/       keys.ts queries.ts serverCache.ts authState.ts sessionState.ts deps.ts AppProvider.tsx
  src/hooks/     useOutbox useSession useOnline useQueries useSurveyHome useToasts (part 1);
                 useSpotView useSectionForm usePhotoUrl (part 2)
  src/lib/       format platform names (part 1); slug hours estimates photo fields location (part 2)
  src/ui/        theme.ts styles.css Button Field Segmented Stepper Check Sheet Postmark StampChip
                 RuledRow Toast Banner HeaderBand SyncPostmark Screen (part 1); Choices (part 2)
  src/screens/   SurveyHeader SyncSheet SignedOut UpdatePrompt Invite Home spotLink (part 1);
                 BuildingPicker LocationButton NewSpot Overview WriteSheets spot.css editors/* (part 2);
                 Admin admin.css (part 3)
  src/routes/    __root index invite.$token survey survey.index (part 1); survey.spots.new
                 survey.spots.$id.index survey.spots.$id.$section (part 2); survey.admin (part 3)
  test/          setup pwaStub harness + *.test.ts(x) (Vitest, jsdom)
  e2e/           fixtures api photo render-icons + *.e2e.ts (Playwright)

DESIGN.md (+ sidecar)                written by the Impeccable documenter in part 3, Task 18
docs/context/overview.md, stack.md   decision 19 and the web stack (part 3, Task 17)
```

Part 1 tasks: 1 outbox liveness; 2 server reads; 3 copy, failures, tokens; 4 web scaffold; 5 browser adapters; 6 components; 7 app wiring, cache, hooks; 8 shell and invite; 9 spot list; 10 end-to-end harness. Part 2: 11 spot logic and hooks; 12 spot screens and every editor; 13 acceptance e2e. Part 3: 14 admin; 15 finishing e2e; 16 detector and audit; 17 docs and decision log; 18 DESIGN.md.

---
### Task 1: Outbox liveness across tabs, queue signal, recheck timer, version floor

Decision 18's outbox requirements. Today a `syncing` record from another tab is trusted until a reload (a dead tab blocks its spot), and `start()` in a new tab resets a live tab's in-flight write and sends it twice. This task adds the `Liveness` and `QueueSignal` adapters with in-process defaults, owner ids on sending records, liveness checks in `pick` and `start()`, a recheck timer, an owner match in `settle`, and a version floor on enqueue; enables the two skipped acceptance tests and adds four more.

**Files:**
- Modify: `packages/ui-logic/src/adapters.ts` (two interfaces), `packages/ui-logic/src/index.ts` (export), `packages/ui-logic/src/survey/writes.ts` (`owner`), `packages/ui-logic/src/survey/outbox.ts` (full replacement)
- Create: `packages/ui-logic/src/liveness.ts`, `packages/ui-logic/test/liveness.test.ts`
- Replace: `packages/ui-logic/test/outbox.deadtab.test.ts`
- Modify: `packages/ui-logic/test/outbox.test.ts` (two tests appended)

**Interfaces:**
- Produces (adapters): `interface Liveness { hold(): Promise<string>; release(): void; alive(owner: string): Promise<boolean> }`, `interface QueueSignal { post(): void; subscribe(listener: () => void): () => void }`.
- Produces (`liveness.ts`): `createLocalLiveness(scope: object): Liveness`, `createLocalSignal(scope: object): QueueSignal`.
- Produces (`outbox.ts`): `OutboxDeps.liveness?: Liveness`, `OutboxDeps.signal?: QueueSignal`, `HELD_RECHECK_MS = 15_000`; `WriteRecord.owner?: string | null`. Behavior: `enqueue(write, serverVersion)` seeds with `max(serverVersion, stored version)`; `start()` holds liveness, resets only gone tabs' `syncing` writes, subscribes to the signal, re-reads `online`; `stop()` releases liveness.
- Consumes: `createOutboxStore`, `planEnqueue`, `nextToSend`, `rewriteSpotIds`, `VERSIONED_KINDS` (plan B, unchanged).

- [ ] **Step 1: Enable the dead-tab acceptance tests and add the new ones**

Replace `packages/ui-logic/test/outbox.deadtab.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { SurveySpot } from "@study-spot/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { createOutbox, createSurveyApi, HELD_RECHECK_MS } from "../src/index.ts";
import { POWER, SEATING, SPOT_A } from "./builders.ts";
import { API, FakeSurveyServer, TOKEN } from "./fakeServer.ts";
import {
  FakeForeground,
  FakeNetwork,
  FakeTimers,
  MemoryBinary,
  MemoryCache,
  mutableClock,
  RecordingLock,
  sequentialIds,
} from "./fakes.ts";

/*
 * Tabs sharing one outbox (decision 18). A `syncing` record carries its tab's
 * Liveness owner id: pick and start() leave a live tab's in-flight write alone
 * and send a gone tab's write again. The default Liveness and QueueSignal are
 * in-process registries keyed by the shared cache, which is what these tabs
 * share; apps/web passes Web Locks and BroadcastChannel versions. In these
 * tests, stop() stands in for a tab dying.
 */

const power = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: POWER }) as const;
const seating = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: SEATING }) as const;

function setup(spots: SurveySpot[]) {
  const server = new FakeSurveyServer(spots);
  const cache = new MemoryCache();
  const blobs = new MemoryBinary();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const foreground = new FakeForeground();
  const clock = mutableClock("2026-10-05T16:00:00Z");
  const api = createSurveyApi({ http: server, baseUrl: API, token: () => TOKEN });
  // One lock for every tab, like Web Locks across tabs on one origin.
  const lock = new RecordingLock();
  let tab = 0;
  const make = () => {
    tab += 1;
    const ids = sequentialIds(`80${tab.toString().padStart(2, "0")}`);
    return createOutbox({ cache, blobs, api, clock, ids, timers, network, foreground, lock });
  };
  return { server, network, foreground, timers, make };
}

test("a live tab recovers a dead tab's in-flight write without a reload", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const live = t.make();
  await live.start();
  const dying = t.make();
  await dying.start();
  const gate = t.server.holdNext();
  await dying.enqueue(power(SPOT_A), 3);
  // The dying tab's request is in flight and its answer never comes back.
  await gate.arrived;
  dying.stop();
  await live.enqueue(seating(SPOT_A), 3);
  await live.idle();
  t.foreground.fire();
  await live.idle();

  expect(live.getSnapshot().records).toEqual([]);
  expect(t.server.spot(SPOT_A).version).toBe(5);
  expect(t.server.requests.map((r) => [r.path, r.body.base_version])).toEqual([
    [`/survey/spots/${SPOT_A}/power`, 3],
    [`/survey/spots/${SPOT_A}/power`, 3],
    [`/survey/spots/${SPOT_A}/seating`, 4],
  ]);
});

test("start() in a new tab does not send a live tab's in-flight write again", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const a = t.make();
  await a.start();
  t.network.set(false);
  await a.enqueue(power(SPOT_A), 3);
  const gate = t.server.holdNext();
  t.network.set(true);
  await gate.arrived;
  const b = t.make();
  await b.start();
  gate.release();
  await a.idle();
  await b.idle();

  expect(t.server.requests.filter((r) => r.path.endsWith("/power"))).toHaveLength(1);
  expect(t.server.spot(SPOT_A).version).toBe(4);
  expect(a.getSnapshot().records).toEqual([]);
  expect(b.getSnapshot().records).toEqual([]);
});

test("a spot held by a tab that dies is picked up on the recheck timer alone", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const live = t.make();
  await live.start();
  const dying = t.make();
  await dying.start();
  const gate = t.server.holdNext();
  await dying.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  await live.idle();
  expect(t.timers.scheduled()).toContain(HELD_RECHECK_MS);
  dying.stop();
  t.timers.advance(HELD_RECHECK_MS);
  await live.idle();

  expect(live.getSnapshot().records).toEqual([]);
  expect(t.server.spot(SPOT_A).version).toBe(4);
});

test("a dead tab's late answer does not settle a write another tab took over", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const live = t.make();
  await live.start();
  const dying = t.make();
  await dying.start();
  const gate = t.server.holdNext();
  await dying.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  dying.stop();
  const second = t.server.holdNext();
  void live.syncNow();
  await second.arrived;
  // The first copy answers while the second is still in flight.
  gate.release();
  await dying.idle();
  expect(live.getSnapshot().records.map((r) => r.state)).toEqual(["syncing"]);
  second.release();
  await live.idle();

  expect(live.getSnapshot().records).toEqual([]);
  expect(t.server.executed).toHaveLength(1);
  expect(t.server.spot(SPOT_A).version).toBe(4);
});
```

Append to `packages/ui-logic/test/outbox.test.ts`:

```ts
test("a write queued from a stale cached copy starts from the newer version this phone knows", async () => {
  const t = setup();
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  // The screen still shows the cached copy at version 3.
  await box.enqueue(seating(SPOT_A), 3);
  await box.idle();

  expect(t.bases()).toEqual([3, 4]);
  expect(t.server.spot(SPOT_A).version).toBe(5);
  expect(box.getSnapshot().records).toEqual([]);
});

test("start() reads the network state again, so a change before it subscribed is not missed", async () => {
  const t = setup();
  const box = t.make();
  t.network.set(false);
  await box.start();
  expect(box.getSnapshot().online).toBe(false);
});
```

Create `packages/ui-logic/test/liveness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createLocalLiveness, createLocalSignal } from "../src/index.ts";

test("local liveness: an owner is alive while it holds, per shared scope", async () => {
  const scope = {};
  const a = createLocalLiveness(scope);
  const b = createLocalLiveness(scope);
  const other = createLocalLiveness({});
  const idA = await a.hold();
  expect(await a.hold()).toBe(idA);
  expect(await b.alive(idA)).toBe(true);
  expect(await other.alive(idA)).toBe(false);
  a.release();
  expect(await b.alive(idA)).toBe(false);
  expect(await b.alive("never-held")).toBe(false);
});

test("local signal reaches the other subscribers on the same scope, not the poster", () => {
  const scope = {};
  const a = createLocalSignal(scope);
  const b = createLocalSignal(scope);
  const c = createLocalSignal({});
  const got: string[] = [];
  a.subscribe(() => got.push("a"));
  const stopB = b.subscribe(() => got.push("b"));
  c.subscribe(() => got.push("c"));
  a.post();
  expect(got).toEqual(["b"]);
  stopB();
  a.post();
  expect(got).toEqual(["b"]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test packages/ui-logic/test/outbox.deadtab.test.ts packages/ui-logic/test/liveness.test.ts packages/ui-logic/test/outbox.test.ts`
Expected: FAIL. `liveness.test.ts` cannot import `createLocalLiveness`; `outbox.deadtab.test.ts` cannot import `HELD_RECHECK_MS`; in `outbox.test.ts` the stale-copy test gets a 409 (`bases()` is `[3, 3]`) and the start() test sees `online` true.

- [ ] **Step 3: Add the adapters and the in-process defaults**

In `packages/ui-logic/src/adapters.ts`, insert before `export interface Clock {`:

```ts
/**
 * Tells whether the context (a tab, an app process) that marked a write as
 * sending is still running. apps/web backs it with a Web Lock each tab holds
 * for its whole life, so a closed or crashed tab reads as gone at once.
 */
export interface Liveness {
  /** Marks this context as running until `release`. Resolves with its owner id, the same on every call. */
  hold(): Promise<string>;
  release(): void;
  /** False once the context holding `owner` ended or released it. */
  alive(owner: string): Promise<boolean>;
}

/** Tells other contexts sharing the queue's storage that it changed (BroadcastChannel on web). */
export interface QueueSignal {
  /** Reaches every other context's subscribers, never this one's. */
  post(): void;
  subscribe(listener: () => void): () => void;
}
```

Create `packages/ui-logic/src/liveness.ts`:

```ts
import type { Liveness, QueueSignal } from "./adapters.ts";

type Registry = { held: Set<string>; count: number; signals: Set<() => void> };
const registries = new WeakMap<object, Registry>();

function registry(scope: object): Registry {
  let r = registries.get(scope);
  if (r === undefined) {
    r = { held: new Set(), count: 0, signals: new Set() };
    registries.set(scope, r);
  }
  return r;
}

/**
 * In-process Liveness for contexts sharing one storage object, `scope` (the
 * outbox passes its cache). An owner is alive while it holds. Owners written
 * by an earlier process were never held here, so they read as gone.
 */
export function createLocalLiveness(scope: object): Liveness {
  const r = registry(scope);
  r.count += 1;
  const self = `local-${r.count}`;
  return {
    hold: async () => {
      r.held.add(self);
      return self;
    },
    release: () => {
      r.held.delete(self);
    },
    alive: async (owner) => r.held.has(owner),
  };
}

/** In-process QueueSignal for contexts sharing one storage object, `scope`. */
export function createLocalSignal(scope: object): QueueSignal {
  const r = registry(scope);
  const listeners = new Set<() => void>();
  const deliver = () => {
    for (const l of listeners) l();
  };
  r.signals.add(deliver);
  return {
    post: () => {
      for (const d of r.signals) if (d !== deliver) d();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

In `packages/ui-logic/src/index.ts`, add the export after `copy/index.ts`:

```ts
export * from "./liveness.ts";
```

In `packages/ui-logic/src/survey/writes.ts`, add `owner` to `Common` after `state: WriteState,`:

```ts
  /**
   * The context that marked the write `syncing` (Liveness owner id). Only read
   * while `syncing`; absent on records stored before it existed.
   */
  owner: z.string().min(1).nullable().optional(),
```

and add `"owner"` to the keys `NewWrite` omits:

```ts
export type NewWrite = DistributiveOmit<
  WriteRecord,
  | "client_write_id"
  | "seq"
  | "created_at"
  | "attempts"
  | "state"
  | "error"
  | "current"
  | "base_version"
  | "owner"
>;
```

- [ ] **Step 4: Replace the outbox**

Replace `packages/ui-logic/src/survey/outbox.ts` (changes from plan B: imports and deps; `self` replaces the `mine` set; `enqueue` takes the version floor and starts its own pass before waking other tabs; `sendingElsewhere`, `pick`, and `settle` use owners; `pass` posts the signal and schedules the recheck; `start()` and `stop()` hold and release liveness):

```ts
import type { IdentitySection, SurveySpot } from "@study-spot/core";
import type {
  BinaryCache,
  Clock,
  Foreground,
  Ids,
  KeyValueCache,
  Liveness,
  Lock,
  NetworkStatus,
  QueueSignal,
  Timers,
} from "../adapters.ts";
import { createLocalLiveness, createLocalSignal } from "../liveness.ts";
import { createLocalLock } from "../lock.ts";
import type { ApiResult, SurveyApi } from "./api.ts";
import { createOutboxStore } from "./outboxStore.ts";
import {
  LOCAL_PREFIX,
  type NewWrite,
  nextToSend,
  planEnqueue,
  rewriteSpotIds,
  VERSIONED_KINDS,
  type WriteError,
  type WriteKind,
  type WriteRecord,
} from "./writes.ts";

export const BACKOFF_START_MS = 30_000;
export const BACKOFF_MAX_MS = 300_000;
/** How soon a pass looks again at a spot another live tab is sending. */
export const HELD_RECHECK_MS = 15_000;

export type OutboxDeps = {
  cache: KeyValueCache;
  blobs: BinaryCache;
  api: SurveyApi;
  clock: Clock;
  ids: Ids;
  timers: Timers;
  network: NetworkStatus;
  foreground: Foreground;
  /**
   * Guards every read-modify-write of the queue. Defaults to an in-process lock;
   * apps/web passes a Web Locks one so tabs sharing storage take turns too.
   */
  lock?: Lock;
  /**
   * Tells whether the tab that marked a write `syncing` still runs. Defaults to
   * an in-process registry shared by outboxes on the same cache; apps/web
   * passes a Web Locks one.
   */
  liveness?: Liveness;
  /** Wakes other tabs when the queue changes. Defaults to in-process; apps/web uses BroadcastChannel. */
  signal?: QueueSignal;
};

export type OutboxSnapshot = {
  /** Every queued write, oldest first. */
  records: readonly WriteRecord[];
  /** Local spot id to real id, for redirecting a screen opened on a local id. */
  idMap: Readonly<Record<string, string>>;
  syncing: boolean;
  /** True after a 401 until `resume()`; writes are kept. */
  signedOut: boolean;
  online: boolean;
  /** Stored records that fail to parse. Never sent; deleted only by `discardUnreadable`. */
  unreadable: number;
};

/** Writes a caller may queue for an existing spot (creates and photos have their own calls). */
export type SpotWrite = Exclude<NewWrite, { kind: "spot.create" } | { kind: "photo.upload" }>;
export type ConflictChoice = "mine" | "theirs";
/** The queued write whose server answer is being reported. */
export type AppliedWrite = { client_write_id: string; kind: WriteKind };
/**
 * `write` is the write the server applied, so the UI can tie a toast to it. It is
 * null when no write applied: Keep theirs adopting the server's copy.
 */
export type AppliedListener = (
  spot: SurveySpot,
  fromLocalId: string | null,
  write: AppliedWrite | null,
) => void;
type SendResult =
  | ApiResult<SurveySpot>
  | { kind: "local"; code: "photo_missing" | "no_base_version" };
/** After a write: go on, hold that spot for the rest of the pass, or end the pass. */
type Step = "next" | "skip" | "stop";

/** Lock name for the outbox's critical sections. */
export const OUTBOX_LOCK = "study-spot:outbox";

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * The offline outbox (spec section 7): writes are saved on the phone first and
 * sent one at a time, oldest first. Survives the app being killed at any point:
 * a resend reuses its client_write_id and the server replays the stored answer.
 */
export function createOutbox(deps: OutboxDeps) {
  const store = createOutboxStore(deps);
  const lock = deps.lock ?? createLocalLock();
  const liveness = deps.liveness ?? createLocalLiveness(deps.cache);
  const signal = deps.signal ?? createLocalSignal(deps.cache);
  /** Queue changes, the pick of the next write, and its result write never interleave. */
  const locked = <T>(fn: () => Promise<T>): Promise<T> => lock.run(OUTBOX_LOCK, fn);
  const listeners = new Set<() => void>();
  const applied = new Set<AppliedListener>();
  let snapshot: OutboxSnapshot = {
    records: [],
    idMap: {},
    syncing: false,
    signedOut: false,
    online: deps.network.online(),
    unreadable: 0,
  };
  /**
   * This tab's Liveness owner id, set by start(). Passes in a tab are serial,
   * so at pick time a `syncing` write owned by this tab was cut off by a
   * storage error and is sent again; only another live tab's write makes a
   * spot busy. A write whose owner is gone (closed tab, earlier run) is sent again.
   */
  let self: string | null = null;
  let running: Promise<void> | null = null;
  let rerun = false;
  let backoff = BACKOFF_START_MS;
  let cancelTimer: (() => void) | null = null;
  let unsubscribe: (() => void)[] = [];
  let stopped = true;

  function emit(next: Partial<OutboxSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    for (const l of listeners) l();
  }

  async function refresh(): Promise<WriteRecord[]> {
    const records = await store.list();
    const unreadable = (await store.unreadable()).length;
    emit({ records, idMap: await store.idMap(), unreadable });
    return records;
  }

  /**
   * Photo bytes are stored first, so a queued upload always had them once. A
   * local id whose create already applied is mapped to the real id first, since
   * a screen can still hold the local id.
   */
  async function enqueue(
    queued: NewWrite,
    serverVersion: number | null,
    bytes: Uint8Array | null = null,
  ): Promise<string> {
    const id = await locked(async () => {
      const real =
        queued.kind === "spot.create" ? undefined : (await store.idMap())[queued.spot_id];
      const write: NewWrite = real === undefined ? queued : { ...queued, spot_id: real };
      // A cached copy can be older than an answer this phone already applied; never seed below it.
      const known = serverVersion === null ? null : await store.version(write.spot_id);
      const seen = serverVersion === null ? null : Math.max(serverVersion, known ?? 0);
      const meta = {
        client_write_id: deps.ids.uuid(),
        seq: await store.nextSeq(),
        created_at: deps.clock.now().toISOString(),
      };
      if (bytes !== null) await store.putPhoto(meta.client_write_id, bytes);
      const plan = planEnqueue(await store.list(), write, seen, meta);
      for (const r of plan.put) await store.put(r);
      for (const removed of plan.remove) await store.remove(removed);
      if (plan.seedVersion !== null) await raiseVersion(write.spot_id, plan.seedVersion);
      return plan.put[0]?.client_write_id ?? meta.client_write_id;
    });
    await refresh();
    // Start this tab's pass before waking the others, so the tab that queued a write sends it.
    void sync();
    signal.post();
    return id;
  }

  /** Sends one picked write. `base` is the base_version resolved when it was picked. */
  async function send(r: WriteRecord, base: number | null): Promise<SendResult> {
    const { api } = deps;
    const client_write_id = r.client_write_id;
    switch (r.kind) {
      case "spot.create":
        return api.createSpot({ client_write_id, identity: r.payload.identity });
      case "spot.publish":
        return api.publish(r.spot_id, { client_write_id });
      case "photo.cover":
        return api.setCover(r.payload.photo_id, { client_write_id });
      case "photo.upload": {
        const bytes = await store.photo(client_write_id);
        if (bytes === null) return { kind: "local", code: "photo_missing" };
        return api.uploadPhoto(
          { spot_id: r.spot_id, client_write_id, taken_at: r.payload.taken_at },
          bytes,
        );
      }
    }
    if (base === null) return { kind: "local", code: "no_base_version" };
    switch (r.kind) {
      case "spot.section":
        return api.writeSection(r.spot_id, {
          client_write_id,
          base_version: base,
          write: r.payload,
        });
      case "spot.verify":
        return api.verify(r.spot_id, {
          client_write_id,
          base_version: base,
          groups: r.payload.groups,
        });
      case "spot.review":
        return api.review(r.spot_id, { client_write_id, base_version: base });
    }
  }

  /**
   * Stores `version` unless a newer one is already known (a late replay, another
   * tab). Returns false when the stored version is newer, so the caller can skip
   * pushing a stale spot to onApplied.
   */
  async function raiseVersion(spotId: string, version: number): Promise<boolean> {
    const stored = await store.version(spotId);
    if (stored !== null && stored > version) return false;
    if (stored !== version) await store.setVersion(spotId, version);
    return true;
  }

  function notify(spot: SurveySpot, fromLocal: string | null, r: WriteRecord | null): void {
    const write = r === null ? null : { client_write_id: r.client_write_id, kind: r.kind };
    for (const l of applied) l(spot, fromLocal, write);
  }

  /** Order matters for a crash at any step: id map, version, rewrite, then delete. */
  async function applyOk(r: WriteRecord, spot: SurveySpot): Promise<void> {
    const fromLocal = r.kind === "spot.create" ? r.spot_id : null;
    if (fromLocal !== null) await store.mapId(fromLocal, spot.id);
    const fresh = await raiseVersion(spot.id, spot.version);
    if (fromLocal !== null) {
      for (const moved of rewriteSpotIds(await store.list(), { [fromLocal]: spot.id })) {
        await store.put(moved);
      }
    }
    await store.remove(r.client_write_id);
    if (fresh) notify(spot, fromLocal, r);
  }

  async function fail(r: WriteRecord, error: WriteError): Promise<void> {
    await store.put({ ...r, state: "failed", error });
  }

  /**
   * Marks the write as a conflict. A section write replaces the whole section,
   * so later unsent copies of the same section fold into this one conflict,
   * which carries the newest payload. Otherwise Keep mine on each copy would send
   * a stale one and the last would conflict with its own sibling.
   */
  async function conflict(r: WriteRecord, current: SurveySpot): Promise<void> {
    if (r.kind !== "spot.section") {
      await store.put({ ...r, state: "conflict", current });
      return;
    }
    const later = (await store.list()).filter(
      (x) =>
        x.seq > r.seq &&
        x.spot_id === r.spot_id &&
        x.kind === "spot.section" &&
        x.payload.section === r.payload.section &&
        x.state === "pending",
    );
    const newest = later.at(-1);
    const payload = newest?.kind === "spot.section" ? newest.payload : r.payload;
    await store.put({ ...r, payload, state: "conflict", current });
    for (const x of later) await store.remove(x.client_write_id);
  }

  /** True when another tab that is still running marked this write as sending. */
  async function sendingElsewhere(r: WriteRecord): Promise<boolean> {
    if (r.state !== "syncing" || r.owner == null || r.owner === self) return false;
    return liveness.alive(r.owner);
  }

  /**
   * Under the lock: picks the next write, marks it as sending, and resolves its
   * base_version (version chaining: a write queued behind another takes that
   * write's response version). A spot with a write in flight in another live tab
   * is skipped, so two tabs never send the same write or race its followers;
   * `held` says so, for the recheck timer. A gone tab's write is taken over.
   */
  function pick(
    skipped: ReadonlySet<string>,
  ): Promise<{ next: { record: WriteRecord; base: number | null } | null; held: boolean }> {
    return locked(async () => {
      const all = await store.list();
      const busy = new Set(skipped);
      let held = false;
      for (const r of all) {
        if (!busy.has(r.spot_id) && (await sendingElsewhere(r))) {
          busy.add(r.spot_id);
          held = true;
        }
      }
      const next = nextToSend(all.filter((r) => !busy.has(r.spot_id)));
      if (next === null) return { next: null, held };
      const record: WriteRecord = {
        ...next,
        state: "syncing",
        attempts: next.attempts + 1,
        owner: self,
      };
      const versioned = VERSIONED_KINDS.includes(record.kind);
      const base = versioned
        ? (record.base_version ?? (await store.version(record.spot_id)))
        : null;
      await store.put(record);
      return { next: { record, base }, held };
    });
  }

  /**
   * Under the lock: records the answer for a sent write. If the write was
   * discarded or reset while in flight, it is left alone (never resurrected).
   */
  function settle(sent: WriteRecord, result: SendResult): Promise<Step> {
    return locked(async () => {
      const now = (await store.list()).find((x) => x.client_write_id === sent.client_write_id);
      // Another tab may have taken the write over (this tab looked gone), so match the owner too.
      const ours =
        now?.state === "syncing" && now.attempts === sent.attempts && now.owner === sent.owner;
      switch (result.kind) {
        case "ok":
          if (ours) await applyOk(sent, result.value);
          else if (
            sent.kind !== "spot.create" &&
            (await raiseVersion(result.value.id, result.value.version))
          ) {
            // Discarded in flight but applied anyway: later writes must chain from it.
            notify(result.value, null, sent);
          }
          return "next";
        case "conflict":
          if (ours) await conflict(sent, result.current);
          return "next";
        case "invalid":
          if (ours) {
            await fail(sent, {
              status: result.status,
              code: result.code,
              message: result.message,
              missing: result.missing,
            });
          }
          return "next";
        case "gone":
          if (ours) {
            await fail(sent, { status: 410, code: result.code, message: null, missing: [] });
          }
          return "next";
        case "local":
          if (ours) await fail(sent, { status: 0, code: result.code, message: null, missing: [] });
          return "next";
        case "unauthorized":
          if (ours) await store.put({ ...sent, state: "pending", attempts: sent.attempts - 1 });
          emit({ signedOut: true });
          return "stop";
        case "server":
          if (result.reason === "bad_response") {
            // The server stored this answer, so a plain resend would replay it forever.
            if (ours) {
              await fail(sent, {
                status: result.status,
                code: "bad_response",
                message: null,
                missing: [],
              });
            }
            return "next";
          }
          // The server is up but failing for this write; other spots can still go.
          if (ours) await store.put({ ...sent, state: "pending" });
          return "skip";
        case "network":
          if (ours) await store.put({ ...sent, state: "pending" });
          return "stop";
      }
    });
  }

  function schedule(delay: number): void {
    cancelTimer?.();
    cancelTimer = deps.timers.after(delay, () => {
      cancelTimer = null;
      void sync();
    });
  }

  function retryLater(): void {
    schedule(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  /**
   * Sends writes until none is left. A 5xx, 408, or 429 holds that spot for the
   * rest of the pass; a network error or 401 ends it. The backoff starts over
   * only after a pass that ends with nothing held.
   */
  async function pass(): Promise<void> {
    if (stopped || snapshot.signedOut || !deps.network.online()) return;
    emit({ syncing: true });
    const skipped = new Set<string>();
    let held = false;
    try {
      for (;;) {
        const { next: picked, held: heldNow } = await pick(skipped);
        held = heldNow;
        if (picked === null) break;
        signal.post();
        await refresh();
        // The network call runs outside the lock, so saves and discards are never blocked by it.
        const result = await send(picked.record, picked.base);
        const step = await settle(picked.record, result);
        signal.post();
        if (step === "skip") skipped.add(picked.record.spot_id);
        if (step === "stop") {
          if (!snapshot.signedOut) retryLater();
          return;
        }
      }
      if (skipped.size > 0) {
        retryLater();
      } else if (held) {
        // A tab that dies mid-send never says so; look again even if nothing else triggers a pass.
        schedule(HELD_RECHECK_MS);
        backoff = BACKOFF_START_MS;
      } else {
        cancelTimer?.();
        cancelTimer = null;
        backoff = BACKOFF_START_MS;
      }
    } catch {
      // Storage failed mid-pass; everything is still on disk, so try again later.
      schedule(backoff);
    } finally {
      await refresh().catch(() => undefined);
      emit({ syncing: false });
    }
  }

  /** Runs one pass at a time; triggers during a pass collapse into a single rerun. */
  function sync(): Promise<void> {
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          rerun = false;
          await pass();
        } while (rerun);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  async function update(clientWriteId: string, fn: (r: WriteRecord) => Promise<void>) {
    await locked(async () => {
      const r = (await store.list()).find((x) => x.client_write_id === clientWriteId);
      if (r) await fn(r);
    });
    await refresh();
    void sync();
    signal.post();
  }

  return {
    /** Loads the queue, resets writes cut off mid-send, and starts listening for triggers. */
    async start(): Promise<void> {
      self = await liveness.hold();
      stopped = false;
      await locked(async () => {
        for (const r of await store.list()) {
          // A live tab's in-flight write is left alone; a gone tab's goes back in the queue.
          if (r.state === "syncing" && r.owner !== self && !(await sendingElsewhere(r))) {
            await store.put({ ...r, state: "pending" });
          }
        }
        for (const moved of rewriteSpotIds(await store.list(), await store.idMap())) {
          await store.put(moved);
        }
      });
      signal.post();
      unsubscribe = [
        signal.subscribe(() => {
          void refresh().catch(() => undefined);
          void sync();
        }),
        deps.network.subscribe((online) => {
          emit({ online });
          if (online) void sync();
        }),
        deps.foreground.subscribe(() => void sync()),
      ];
      // The network may have changed between createOutbox and subscribing.
      emit({ online: deps.network.online() });
      await refresh();
      await sync();
    },
    stop(): void {
      stopped = true;
      liveness.release();
      for (const u of unsubscribe) u();
      unsubscribe = [];
      cancelTimer?.();
      cancelTimer = null;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Same object until something changes, as useSyncExternalStore requires. */
    getSnapshot: (): OutboxSnapshot => snapshot,
    /** Called with each spot the server returns, so the app can update its cached copy. */
    onApplied(listener: AppliedListener): () => void {
      applied.add(listener);
      return () => {
        applied.delete(listener);
      };
    },
    /** Queues a new draft and returns its local id. */
    async createSpot(identity: IdentitySection): Promise<string> {
      const spotId = `${LOCAL_PREFIX}${deps.ids.uuid()}`;
      await enqueue({ kind: "spot.create", spot_id: spotId, payload: { identity } }, null);
      return spotId;
    },
    /** Queues a write. `serverVersion` is the version the surveyor saw; null for a local spot. */
    enqueue: (write: SpotWrite, serverVersion: number | null): Promise<string> =>
      enqueue(write, serverVersion),
    addPhoto: (spotId: string, serverVersion: number | null, bytes: Uint8Array, takenAt: Date) =>
      enqueue(
        {
          kind: "photo.upload",
          spot_id: spotId,
          payload: { taken_at: takenAt.toISOString(), byte_size: bytes.byteLength },
        },
        serverVersion,
        bytes,
      ),
    /** Sends a failed write again with the same id (4xx answers are never stored). */
    retry: (clientWriteId: string) =>
      update(clientWriteId, async (r) => {
        if (r.state === "failed") await store.put({ ...r, state: "pending", error: null });
      }),
    /** Drops a write and its photo bytes; dropping a create drops everything queued for that draft. */
    discard: (clientWriteId: string) =>
      update(clientWriteId, async (r) => {
        const all = await store.list();
        const doomed = r.kind === "spot.create" ? all.filter((x) => x.spot_id === r.spot_id) : [r];
        for (const d of doomed) await store.remove(d.client_write_id);
      }),
    /**
     * Keep mine: send again on top of the server's version, with a new id.
     * Keep theirs: drop the write and adopt the server's spot.
     * Writes queued behind it chain from the server's version either way.
     */
    resolveConflict: (clientWriteId: string, choice: ConflictChoice) =>
      update(clientWriteId, async (r) => {
        if (r.state !== "conflict" || r.current === null) return;
        const current = r.current;
        const fresh = await raiseVersion(current.id, current.version);
        if (choice === "mine") {
          const again = {
            client_write_id: deps.ids.uuid(),
            attempts: 0,
            state: "pending",
            error: null,
            current: null,
          } as const;
          // Only versioned writes (section, verify, review) can get a 409.
          await store.put(
            r.kind === "spot.section" || r.kind === "spot.verify" || r.kind === "spot.review"
              ? { ...r, ...again, base_version: current.version }
              : { ...r, ...again },
          );
        } else if (fresh) {
          notify(current, null, null);
        }
        await store.remove(r.client_write_id);
      }),
    /** Storage keys of records that fail to parse (counted in `unreadable`), for the UI to list. */
    unreadableKeys: (): Promise<string[]> => store.unreadable(),
    /**
     * Deletes one unreadable record (a key from `unreadableKeys`) and its photo
     * bytes. Readable records are untouched: use `discard` for those.
     */
    async discardUnreadable(key: string): Promise<void> {
      await locked(() => store.removeUnreadable(key));
      signal.post();
      await refresh();
    },
    /** After signing in again on this phone. */
    resume(): void {
      emit({ signedOut: false });
      void sync();
    },
    syncNow: (): Promise<void> => sync(),
    /** Resolves when the current pass (if any) ends, without asking for another. */
    idle: (): Promise<void> => running ?? Promise.resolve(),
  };
}
```

- [ ] **Step 5: Run the outbox suites**

Run: `bun test packages/ui-logic`
Expected: PASS with none skipped. The two formerly skipped tests pass with no setup change: the default liveness and signal are shared through the cache object every tab in the test uses.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun test`
Expected: all pass.

```bash
git add packages/ui-logic
git commit -m "feat(ui-logic): track tab liveness for in-flight outbox writes"
```

### Task 2: Server reads for the web app: campus buildings and the re-login hint

The new-spot screen needs buildings (name and point) and the campus time zone, and nothing lists them: the published bundle may not exist on a fresh deploy. The invite screen needs to know a link is a re-login link before accepting it. The API client also drops a trailing slash from its base URL (plan B ledger).

**Files:**
- Modify: `packages/core/src/survey/api.ts` (`CampusInfo`)
- Create: `apps/server/src/routes/campus.ts`, `apps/server/test/campus.test.ts`
- Modify: `apps/server/src/app.ts` (register), `apps/server/src/auth/invites.ts` (hint)
- Modify: `packages/ui-logic/src/survey/api.ts` (`campus()`, base URL), `packages/ui-logic/test/api.test.ts` (one test)
- Modify: `docs/ops.md` (section 7: the first admin link's shape)

**Interfaces:**
- Produces: `CampusInfo = { campus: { id, name, tz }, buildings: { id, name, lat, lng }[] }` (core); `GET /survey/campus` (surveyor session, 200 `CampusInfo`, buildings sorted by name); `SurveyApi.campus(): Promise<ApiResult<CampusInfo>>`.
- Changes: `createInvite(...).url` ends in `?relogin=1` when `surveyorId` is set (re-login and bootstrap links).
- Consumes: `requireSurveyor`, `campus` and `building` tables, `AppDeps.config.campusId`.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/test/campus.test.ts`:

```ts
import { expect, test } from "bun:test";
import { CampusInfo, CreateInviteResponse } from "@study-spot/core";
import { body, setup, signIn, WEB_ORIGIN } from "./helpers.ts";

test("a signed-in surveyor reads the campus and its buildings by name", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const res = await ctx.app.inject({ method: "GET", url: "/survey/campus", headers: me.headers });
  expect(res.statusCode).toBe(200);
  const info = CampusInfo.parse(body(res));
  expect(info.campus).toEqual({
    id: "sbu",
    name: "Stony Brook University",
    tz: "America/New_York",
  });
  const names = info.buildings.map((b) => b.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  expect(info.buildings.find((b) => b.id === "melville-library")).toEqual({
    id: "melville-library",
    name: "Melville Library",
    lat: 40.9154,
    lng: -73.1222,
  });
});

test("the campus route needs a session", async () => {
  const ctx = await setup();
  const res = await ctx.app.inject({ method: "GET", url: "/survey/campus" });
  expect(res.statusCode).toBe(401);
});

test("a re-login link carries the relogin hint and a new-surveyor link does not", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  const create = async (payload: object) =>
    CreateInviteResponse.parse(
      body(
        await ctx.app.inject({
          method: "POST",
          url: "/admin/invites",
          headers: admin.headers,
          payload,
        }),
      ),
    );
  const fresh = await create({ role: "surveyor" });
  const relogin = await create({ role: "surveyor", surveyor_id: ana.id });
  expect(fresh.url).toMatch(new RegExp(`^${WEB_ORIGIN}/invite/[A-Za-z0-9_-]{43}$`));
  expect(relogin.url).toMatch(new RegExp(`^${WEB_ORIGIN}/invite/[A-Za-z0-9_-]{43}\\?relogin=1$`));
});
```

Append to `packages/ui-logic/test/api.test.ts`:

```ts
test("campus() reads the campus route and a trailing slash in the base URL is dropped", async () => {
  const http = new ScriptedHttp();
  http.replies.push({
    status: 200,
    text: JSON.stringify({
      campus: { id: "sbu", name: "Stony Brook University", tz: "America/New_York" },
      buildings: [{ id: "melville-library", name: "Melville Library", lat: 40.9, lng: -73.1 }],
    }),
  });
  const api = createSurveyApi({ http, baseUrl: `${BASE}/`, token: () => TOKEN });
  const res = await api.campus();
  expect(res.kind).toBe("ok");
  expect(http.requests.map((r) => r.url)).toEqual([`${BASE}/survey/campus`]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test apps/server/test/campus.test.ts packages/ui-logic/test/api.test.ts`
Expected: FAIL. `CampusInfo` is not exported from `@study-spot/core`; `api.campus` is not a function; the route answers 404.

- [ ] **Step 3: Add the schema, the route, and the hint**

In `packages/core/src/survey/api.ts`, insert before `// Spots`:

```ts
// Campus

/** The campus and its buildings, for the new-spot building picker and campus-local dates. */
export const CampusInfo = z.object({
  campus: z.object({ id: z.string(), name: z.string(), tz: z.string() }),
  buildings: z.array(
    z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number() }),
  ),
});
export type CampusInfo = z.infer<typeof CampusInfo>;
```

Create `apps/server/src/routes/campus.ts`:

```ts
import { CampusInfo } from "@study-spot/core";
import { building, campus } from "@study-spot/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { HttpError } from "../http.ts";

export function campusRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/survey/campus", { schema: { response: { 200: CampusInfo } } }, async (req) => {
      await requireSurveyor(deps, req);
      const [row] = await deps.db.select().from(campus).where(eq(campus.id, deps.config.campusId));
      if (!row) throw new HttpError(404, { error: "not_found" });
      const buildings = await deps.db
        .select({ id: building.id, name: building.name, lat: building.lat, lng: building.lng })
        .from(building)
        .where(eq(building.campus_id, row.id))
        .orderBy(asc(building.name), asc(building.id));
      return { campus: { id: row.id, name: row.name, tz: row.tz }, buildings };
    });
  };
}
```

In `apps/server/src/app.ts`, import and register it after the admin routes:

```ts
import { campusRoutes } from "./routes/campus.ts";
```

```ts
  await app.register(adminRoutes(deps));
  await app.register(campusRoutes(deps));
```

In `apps/server/src/auth/invites.ts`, replace the last line of `createInvite`:

```ts
  return { token, url: `${opts.webOrigin}/invite/${token}`, expires_at };
```

with:

```ts
  // A re-login link says so, so the invite screen can skip the name and say "Sign in".
  const hint = opts.surveyorId === null ? "" : "?relogin=1";
  return { token, url: `${opts.webOrigin}/invite/${token}${hint}`, expires_at };
```

In `docs/ops.md`, section 7, the `admin:invite` link now ends in `?relogin=1` (the bootstrap invite is for an admin who already exists). Replace:

```md
and a `https://<pwa>/invite/<token>` link.
```

with:

```md
and a `https://<pwa>/invite/<token>?relogin=1` link (the admin already exists, so the invite screen asks for no name and says Sign in).
```

- [ ] **Step 4: Add the client call and drop a trailing slash**

In `packages/ui-logic/src/survey/api.ts`, add `CampusInfo,` to the `@study-spot/core` import (after `type ApiErrorCode,`). At the top of `createSurveyApi`, add:

```ts
  const baseUrl = deps.baseUrl.replace(/\/+$/, "");
```

and use it in `call`:

```ts
      res = await deps.http.send({ method, url: `${baseUrl}${path}`, headers, body });
```

Add the method before `listSpots`:

```ts
    campus: () => call("GET", "/survey/campus", CampusInfo),
```

- [ ] **Step 5: Run the tests**

Run: `bun test apps/server/test/campus.test.ts apps/server/test/auth.test.ts packages/ui-logic/test/api.test.ts`
Expected: PASS. The existing auth tests still pass: they slice tokens from new-surveyor links, which carry no hint.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun test`
Expected: all pass.

```bash
git add packages/core packages/ui-logic apps/server docs/ops.md
git commit -m "feat(server): list campus buildings and mark re-login invite links"
```

### Task 3: Copy for every web state, failure reasons, plural, and token fixes

The copy deck gets one new section with every string the screens need beyond plan B (short header forms, singulars, per-code failure reasons, field names for "Missing: {field}", the re-login invite, the unpublish warning, photo approval, and so on), regenerated into the copy module. `ui-logic` gains `plural()` and `failure.ts`, which maps a failed write to deck copy and rewords publisher warnings. Two token fixes land before any component uses them.

**Files:**
- Modify: `docs/design/surveyor-copy.md` (new section, one pending-question line), `packages/ui-logic/src/copy/copy.gen.ts` (regenerated)
- Modify: `packages/ui-logic/src/copy/index.ts` (`plural`), `packages/ui-logic/test/copy.test.ts` (samples, one test)
- Create: `packages/ui-logic/src/survey/failure.ts`, `packages/ui-logic/test/failure.test.ts`
- Modify: `packages/ui-logic/src/survey/index.ts` (export)
- Modify: `packages/ui-logic/src/tokens.ts`, `packages/ui-logic/test/tokens.test.ts`

**Interfaces:**
- Produces: `plural(count: number, one: PlainCopyId, many: CountCopyId): string`; types `PlainCopyId` (ids without placeholders), `CountCopyId` (ids whose only placeholder is `{count}`).
- Produces: `fieldLabel(field: V0Field): string`, `fieldList(fields: readonly V0Field[]): string`, `failureView(error: WriteError | null): { message: string; canRetry: boolean }`, `publishWarningText(warning: string, spots: readonly SpotSummary[]): string`.
- Changes: `tokens.color.{survey,student}.dark.shell` is `#2b2e35`; `tokens.radius.control` is 4.

- [ ] **Step 1: Write the failing tests**

Replace `packages/ui-logic/test/copy.test.ts` (new samples `block`, `bucket`, `day` for `estimates.cell`; new test for `plural`):

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COPY, COPY_MAX, type CopyId, plural, t } from "../src/index.ts";
import { parseCopyDeck } from "./copyDeck.ts";

const deck = parseCopyDeck(
  readFileSync(
    fileURLToPath(new URL("../../../docs/design/surveyor-copy.md", import.meta.url)),
    "utf8",
  ),
);

/**
 * Realistic values for every placeholder in the deck. Names are a typical
 * display name; the deck's max chars assume names up to about 20 characters.
 */
const SAMPLE: Readonly<Record<string, string>> = {
  block: "Afternoon",
  bucket: "Nearly full",
  count: "12",
  date: "Oct 15",
  day: "Weekdays",
  field: "outlet coverage",
  fields: "directions, seat count",
  meters: "120",
  minutes: "15",
  name: "Jordan Rivera",
  percent: "100",
  reason: "seat count is required",
  section: "Power and signal",
  spot: "SAC Lounge",
  term: "Fall 2026",
  time: "Oct 15, 3:40 PM",
  what: "Power and signal for SAC Lounge",
};

const ids = Object.keys(COPY) as CopyId[];

test("the module holds exactly the deck's strings and limits", () => {
  expect(deck.length).toBeGreaterThan(300);
  expect(new Set(deck.map((r) => r.id)).size).toBe(deck.length);
  const text: Record<string, string> = COPY;
  const max: Record<string, number> = COPY_MAX;
  expect(text).toEqual(Object.fromEntries(deck.map((r) => [r.id, r.text])));
  expect(max).toEqual(Object.fromEntries(deck.map((r) => [r.id, r.max])));
});

const EM_DASH = String.fromCodePoint(0x2014);

test("no string has an em-dash or an exclamation mark", () => {
  for (const id of ids) {
    expect(COPY[id].includes(EM_DASH)).toBe(false);
    expect(COPY[id].includes("!")).toBe(false);
  }
});

test("every string fits its max chars with representative params", () => {
  for (const id of ids) {
    const rendered = COPY[id].replace(/\{(\w+)\}/g, (_m, name: string) => {
      const value = SAMPLE[name];
      if (value === undefined) throw new Error(`no sample for {${name}} in ${id}`);
      return value;
    });
    expect({ id, length: rendered.length }).toEqual({
      id,
      length: Math.min(rendered.length, COPY_MAX[id]),
    });
  }
});

test("t fills typed params and leaves plain strings alone", () => {
  expect(t("common.save")).toBe("Save");
  expect(t("sync.pending", { count: 3 })).toBe("3 waiting to sync");
  expect(
    t("admin.publish.warning.item", { name: "SAC Lounge", reason: "missing directions" }),
  ).toBe("SAC Lounge: missing directions");
  // @ts-expect-error sync.pending needs { count }
  t("sync.pending");
  // @ts-expect-error common.save takes no params
  t("common.save", { count: 1 });
});

test("the deck covers the states added by review fixes", () => {
  expect(t("sync.unreadable", { count: 2 })).toBe("2 changes can't be read");
  expect(t("home.unreadable", { count: 2 })).toBe("2 changes can't be read");
  expect(t("sync.what.review", { name: "SAC Lounge" })).toBe("Review SAC Lounge");
  expect(t("sync.what.cover", { name: "SAC Lounge" })).toBe("Cover photo for SAC Lounge");
  expect(t("editor.verify.hours_missing", { term: "Fall 2026" })).toBe(
    "Add hours for Fall 2026 before marking this checked.",
  );
  expect(t("conflict.body_unknown")).toContain("Someone else");
});

test("plural picks the singular id for 1 and fills count otherwise", () => {
  expect(plural(1, "home.attention.failed_one", "home.attention.failed")).toBe(
    "1 change didn't save",
  );
  expect(plural(3, "home.attention.failed_one", "home.attention.failed")).toBe(
    "3 changes didn't save",
  );
  expect(plural(0, "sync.unreadable_one", "sync.unreadable")).toBe("0 changes can't be read");
  // @ts-expect-error the plural form must take exactly { count }
  plural(2, "common.save", "sync.what.create");
});
```

Create `packages/ui-logic/test/failure.test.ts`:

```ts
import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  failureView,
  fieldLabel,
  fieldList,
  publishWarningText,
  t,
  type WriteError,
} from "../src/index.ts";

const err = (over: Partial<WriteError>): WriteError => ({
  status: 422,
  code: null,
  message: null,
  missing: [],
  ...over,
});

test("field names come from the copy deck", () => {
  expect(fieldLabel("seat_count")).toBe("Seats");
  expect(fieldList(["directions", "food_policy"])).toBe("How to get there, Food and drink");
});

test("a publish refused as incomplete lists the missing fields and can be retried", () => {
  const view = failureView(err({ code: "incomplete", missing: ["directions", "seat_count"] }));
  expect(view).toEqual({ message: "Still missing: How to get there, Seats", canRetry: true });
});

test("local failures that can never succeed hide retry", () => {
  for (const code of ["photo_missing", "bad_response", "no_base_version"]) {
    expect(failureView(err({ status: 0, code })).canRetry).toBe(false);
  }
  expect(failureView(err({ status: 422, code: "write_id_reused" })).canRetry).toBe(false);
});

test("server messages are never shown; codes and statuses map to deck copy", () => {
  const zod = err({ status: 400, code: "invalid_request", message: "✖ Invalid input at data.x" });
  expect(failureView(zod).message).toBe(t("failed.reason.invalid_request"));
  expect(failureView(err({ status: 403 })).message).toBe(t("failed.reason.forbidden"));
  expect(failureView(err({ status: 404 })).message).toBe(t("failed.reason.not_found"));
  expect(failureView(err({ status: 422, code: "slug_taken", message: "Another" })).message).toBe(
    t("failed.reason.slug_taken"),
  );
  expect(failureView(err({ status: 418 })).message).toBe(t("error.generic"));
  expect(failureView(null).message).toBe(t("error.generic"));
});

test("publisher warnings are reworded with the spot name and field names", () => {
  const spot = surveySpotFixture({ slug: "sac-lounge", official_name: "SAC Lounge" });
  const spots = [
    {
      ...spot,
      building_name: "SAC",
      oldest_verified_at: null,
      hours_confirmed: true,
    },
  ];
  expect(publishWarningText("skipped sac-lounge: missing directions, seat_count", spots)).toBe(
    "SAC Lounge: missing How to get there, Seats",
  );
  expect(publishWarningText("skipped sac-lounge hours day 2: invalid closes", spots)).toBe(
    "SAC Lounge: has hours the student app can't read",
  );
  expect(publishWarningText("skipped other-spot: invalid seat_count", spots)).toBe(
    "other-spot: has a value the student app can't use",
  );
  expect(publishWarningText("something new", spots)).toBe("something new");
});
```

Append to `packages/ui-logic/test/tokens.test.ts`:

```ts
for (const { mode, scheme, c } of palettes) {
  test(`${mode} ${scheme}: the header band stands apart from the page`, () => {
    expect(contrastRatio(c.shell, c.background)).toBeGreaterThanOrEqual(1.3);
  });
}

test("controls and cards share the contract's 4 px corner", () => {
  expect(tokens.radius.control).toBe(4);
  expect(tokens.radius.card).toBe(4);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test packages/ui-logic/test/copy.test.ts packages/ui-logic/test/failure.test.ts packages/ui-logic/test/tokens.test.ts`
Expected: FAIL. `plural` and `failureView` are not exported; `home.attention.failed_one` is not a copy id; the dark shell is `#000000` (ratio 1.1 against the background) and `radius.control` is 6.

- [ ] **Step 3: Add the copy**

In `docs/design/surveyor-copy.md`, insert this section before `## Pending questions`:

```md
## Web UI states (plan D)

Strings the built screens needed beyond the sections above: short header forms for a 360 px phone, singular counts, per-code failure reasons (server messages are never shown raw), field names for "Missing: {field}", and the re-login invite.

| id | text | max chars | notes |
|---|---|---|---|
| sync.short.pending | {count} waiting | 14 | header postmark; full form in the sync sheet |
| sync.short.offline | Offline | 10 | header postmark; sync.offline in the sheet |
| sync.short.failed | {count} not saved | 16 | header postmark |
| sync.short.unreadable | {count} unreadable | 16 | header postmark |
| sync.short.signed_out | Signed out | 12 | header postmark |
| sync.unreadable_one | 1 change can't be read | 30 | singular of sync.unreadable |
| sync.leave_warning_one | 1 change hasn't synced yet. Leaving now keeps it on this phone. | 90 | singular of sync.leave_warning |
| sync.sheet.unreadable_item | A saved change this app can't read | 40 | one row per unreadable record |
| sync.sheet.unreadable_help | These came from a newer or damaged copy of the app. Discard them if they stay. | 90 | |
| sync.sheet.open_spot | Open spot | 12 | row action |
| home.attention.failed_one | 1 change didn't save | 34 | singular of home.attention.failed |
| home.unreadable_one | 1 change can't be read | 34 | singular of home.unreadable |
| home.stale.empty | No published spots yet. | 30 | |
| home.drafts.empty | No drafts. | 14 | |
| home.offline_first | The spot list loads once you're online. New spots still save on this phone. | 90 | first run offline, nothing cached |
| spot.section.on_phone | On this phone | 14 | section row sync state |
| spot.section.syncing | Syncing | 10 | section row sync state |
| spot.section.failed | Didn't save | 12 | section row sync state |
| spot.section.conflict | Two versions | 14 | section row sync state |
| spot.publish.queued_chip | Publish queued | 16 | chip while the publish waits to sync |
| spot.review.queued | Review queued | 16 | chip; "Marked reviewed" only after it lands |
| spot.not_found | This spot isn't on this phone. Go online to load it. | 60 | spot never cached and offline |
| field.directions | How to get there | 20 | names for Missing: {field} and Still missing: {fields} |
| field.eligibility | Who can use it | 18 | |
| field.seat_count | Seats | 10 | |
| field.outlet_coverage_pct | Seats near an outlet | 22 | |
| field.noise_policy | Noise rule | 12 | |
| field.group_work_ok | Group work | 12 | |
| field.food_policy | Food and drink | 16 | |
| field.last_verified | A checked section | 20 | any saved or checked section |
| failed.reason.photo_missing | The photo is no longer on this phone. Take it again. | 60 | local: bytes evicted |
| failed.reason.bad_response | The server's answer couldn't be read, so this can't be sent again. Discard it and redo it. | 100 | retry hidden |
| failed.reason.no_base_version | This phone lost track of the spot's version. Discard it and save the section again. | 90 | retry hidden |
| failed.reason.forbidden | Your account can't make this change. | 40 | 403 |
| failed.reason.not_found | This spot is no longer on the server. | 40 | 404 |
| failed.reason.invalid_request | Some values weren't accepted. Open the section, check it, and save again. | 80 | 400 and 422 without a known code |
| failed.reason.slug_taken | Another spot already has this name. Change the name in Basics. | 70 | |
| failed.reason.unknown_building | That building isn't on the server's list. Pick it again in Basics. | 70 | |
| failed.reason.unknown_term | The term changed. Open Hours and save again. | 50 | |
| failed.reason.photo_too_large | The photo was too large for the server. Take it again. | 60 | |
| failed.reason.photo_type | The server only takes JPEG photos. Take it again. | 60 | |
| failed.reason.write_id_reused | This change clashed with an older one. Discard it and make it again. | 80 | retry hidden |
| editor.unpublish.title | This takes the spot off the student app | 44 | saving would clear a required field on a published spot |
| editor.unpublish.body | With {fields} empty, students stop seeing this spot after the next publish. | 100 | |
| editor.unpublish.action | Save anyway | 14 | |
| identity.outdoor.label | Outdoors | 10 | |
| identity.seasonal.label | Only open some seasons | 24 | |
| invite.relogin.title | Sign in on this phone | 24 | link for an existing surveyor; no name asked |
| invite.relogin.body | This link signs you back in. Your name and role stay the same. | 70 | |
| invite.relogin.action | Sign in | 10 | primary |
| photos.approve | Approve | 10 | any surveyor but the uploader |
| photos.approve.own | You took this, so someone else approves it. | 50 | |
| photos.approve.done | Photo approved | 16 | toast |
| photos.online_only | Approving and covers need a connection. | 44 | |
| photos.not_synced | Not synced yet | 16 | badge on a photo still on the phone |
| photos.cover.wait | Sync first to use this as cover | 32 | |
| estimates.cell | {day}, {block}: {bucket} | 40 | accessible name of a grid cell |
| update.ready | A new version of Perch is ready. | 40 | update prompt |
| update.reload | Reload | 10 | |
| admin.invite.relogin.created | Sign-in link for {name}. Works once, for 48 hours. | 60 | |
| admin.surveyors.inactive | No access | 10 | badge |
| admin.publish.warning.missing | missing {fields} | 60 | reworded buildBundle reason |
| admin.publish.warning.invalid | has a value the student app can't use | 44 | |
| admin.publish.warning.hours | has hours the student app can't read | 44 | |
| common.close | Close | 10 | |
| common.open | Open | 8 | banner action that opens the conflict or failed view |
| common.loading | Loading | 10 | |
| common.less | Less | 6 | stepper button inside a labeled group |
| common.more | More | 6 | |
| unit.minutes | min | 4 | stepper suffix |
| unit.percent | % | 2 | stepper suffix |
| new.building.none | No building matches. | 24 | |
| new.building.offline | The building list loads once you're online. | 50 | first run offline |
```

In the same file, replace the last pending question (about `admin.publish.warning.item`) with:

```md
- `admin.publish.warning.item` reasons are generated by the server (`skipped <slug>: ...`). The web UI maps them to `admin.publish.warning.*` with the `field.*` names.
```

Regenerate the module:

Run: `bun run copy:gen`
Expected: `wrote 410 strings to .../copy.gen.ts`.

Append to `packages/ui-logic/src/copy/index.ts`:

```ts
/** Ids whose text has no placeholders. */
export type PlainCopyId = { [K in CopyId]: [CopyParam<K>] extends [never] ? K : never }[CopyId];
/** Ids whose only placeholder is {count}. */
export type CountCopyId = {
  [K in CopyId]: [CopyParam<K>] extends ["count"] ? K : never;
}[CopyId];

/**
 * A counted message: the singular id for exactly 1, else the plural id with
 * {count}. Both are whole messages from the deck, never stitched together.
 */
export function plural(count: number, one: PlainCopyId, many: CountCopyId): string {
  if (count === 1) return COPY[one];
  return COPY[many].replace("{count}", String(count));
}
```

- [ ] **Step 4: Add the failure mapping**

Create `packages/ui-logic/src/survey/failure.ts`:

```ts
import { type SpotSummary, V0_FIELD, type V0Field } from "@study-spot/core";
import { COPY, type PlainCopyId, t } from "../copy/index.ts";
import type { WriteError } from "./writes.ts";

const FIELD_COPY = {
  directions: "field.directions",
  eligibility: "field.eligibility",
  seat_count: "field.seat_count",
  outlet_coverage_pct: "field.outlet_coverage_pct",
  noise_policy: "field.noise_policy",
  group_work_ok: "field.group_work_ok",
  food_policy: "field.food_policy",
  last_verified: "field.last_verified",
} as const satisfies Record<V0Field, PlainCopyId>;

/** The surveyor-facing name of a v0-required field. */
export function fieldLabel(field: V0Field): string {
  return COPY[FIELD_COPY[field]];
}

/** Field names as one list, in the order the server reports them. */
export function fieldList(fields: readonly V0Field[]): string {
  return fields.map(fieldLabel).join(", ");
}

/** What the failed-write view says, and whether sending the same write again can work. */
export type FailureView = { message: string; canRetry: boolean };

const CODE_COPY = {
  photo_missing: { id: "failed.reason.photo_missing", canRetry: false },
  bad_response: { id: "failed.reason.bad_response", canRetry: false },
  no_base_version: { id: "failed.reason.no_base_version", canRetry: false },
  forbidden: { id: "failed.reason.forbidden", canRetry: true },
  not_found: { id: "failed.reason.not_found", canRetry: false },
  invalid_request: { id: "failed.reason.invalid_request", canRetry: true },
  slug_taken: { id: "failed.reason.slug_taken", canRetry: true },
  unknown_building: { id: "failed.reason.unknown_building", canRetry: true },
  unknown_term: { id: "failed.reason.unknown_term", canRetry: true },
  photo_too_large: { id: "failed.reason.photo_too_large", canRetry: false },
  photo_type: { id: "failed.reason.photo_type", canRetry: false },
  write_id_reused: { id: "failed.reason.write_id_reused", canRetry: false },
} as const;
type KnownCode = keyof typeof CODE_COPY;

function known(code: string | null): code is KnownCode {
  return code !== null && code in CODE_COPY;
}

/**
 * Maps a failed write's error to copy. Server messages are never shown: they
 * can be Zod output a surveyor can't act on. A publish refused as incomplete
 * lists the missing fields by name.
 */
export function failureView(error: WriteError | null): FailureView {
  if (error === null) return { message: t("error.generic"), canRetry: true };
  if (error.missing.length > 0) {
    return {
      message: t("failed.body.publish", { fields: fieldList(error.missing) }),
      canRetry: true,
    };
  }
  if (known(error.code)) {
    const { id, canRetry } = CODE_COPY[error.code];
    return { message: t(id), canRetry };
  }
  if (error.status === 403) return { message: t("failed.reason.forbidden"), canRetry: true };
  if (error.status === 404) return { message: t("failed.reason.not_found"), canRetry: false };
  if (error.status === 413) return { message: t("failed.reason.photo_too_large"), canRetry: false };
  if (error.status === 400 || error.status === 422) {
    return { message: t("failed.reason.invalid_request"), canRetry: true };
  }
  return { message: t("error.generic"), canRetry: true };
}

const MISSING = /^skipped (\S+): missing (.+)$/;
const HOURS = /^skipped (\S+) hours /;
const INVALID = /^skipped (\S+): invalid /;

/**
 * Rewords a publisher warning (buildBundle's `skipped <slug>: ...`) with the
 * spot's name and field names. Unknown shapes pass through unchanged.
 */
export function publishWarningText(warning: string, spots: readonly SpotSummary[]): string {
  const name = (slug: string) => spots.find((s) => s.slug === slug)?.official_name ?? slug;
  const missing = MISSING.exec(warning);
  if (missing?.[1] !== undefined && missing[2] !== undefined) {
    const fields = missing[2]
      .split(", ")
      .filter((f): f is V0Field => (V0_FIELD as readonly string[]).includes(f));
    const reason =
      fields.length > 0
        ? t("admin.publish.warning.missing", { fields: fieldList(fields) })
        : t("admin.publish.warning.invalid");
    return t("admin.publish.warning.item", { name: name(missing[1]), reason });
  }
  const hours = HOURS.exec(warning);
  if (hours?.[1] !== undefined) {
    return t("admin.publish.warning.item", {
      name: name(hours[1]),
      reason: t("admin.publish.warning.hours"),
    });
  }
  const invalid = INVALID.exec(warning);
  if (invalid?.[1] !== undefined) {
    return t("admin.publish.warning.item", {
      name: name(invalid[1]),
      reason: t("admin.publish.warning.invalid"),
    });
  }
  return warning;
}
```

In `packages/ui-logic/src/survey/index.ts`, add before `export * from "./forms.ts";`:

```ts
export * from "./failure.ts";
```

- [ ] **Step 5: Fix the tokens**

In `packages/ui-logic/src/tokens.ts`, in both dark palettes (survey and student), replace `shell: "#000000",` with:

```ts
        shell: "#2b2e35",
```

and replace the radius line with:

```ts
  radius: { none: 0, card: 4, control: 4, pill: 999 },
```

- [ ] **Step 6: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS. The copy test checks every new string against its max length with the samples.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun test`
Expected: all pass. `typecheck` also proves the `@ts-expect-error` lines in `copy.test.ts`: `plural` refuses an id with other placeholders.

```bash
git add docs/design/surveyor-copy.md packages/ui-logic
git commit -m "feat(ui-logic): add web copy, failure reasons, and token fixes"
```

### Task 4: `apps/web` scaffold: Vite, React, router plugin, PWA, test runners, tokens, icons

The empty app: package and tsconfigs wired into `tsc -b`, Vite with the TanStack Router plugin (before the React plugin) and vite-plugin-pwa (prompt, never silent), Vitest under jsdom, the Playwright config, the env contract from the deploy plan, the token stylesheet, the app icon, and CI steps for web tests and build. `bun test` stays out of `apps/web`.

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/test/tsconfig.json`, `apps/web/e2e/tsconfig.json`
- Create: `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`, `apps/web/index.html`
- Create: `apps/web/public/icons/icon.svg`, `apps/web/e2e/render-icons.ts`; generated `apps/web/public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon}.png` and `PROVENANCE.txt`
- Create: `apps/web/src/env.ts`, `apps/web/src/ui/theme.ts`, `apps/web/src/main.tsx`, `apps/web/src/routes/__root.tsx`; generated `apps/web/src/routeTree.gen.ts`
- Create: `apps/web/test/setup.ts`, `apps/web/test/pwaStub.ts`, `apps/web/test/env.test.ts`, `apps/web/test/theme.test.ts`
- Create: `bunfig.toml`; Modify: `tsconfig.json`, `biome.json`, `.gitignore`, `.github/workflows/ci.yml`, `bun.lock`

**Interfaces:**
- Produces: package `@study-spot/web` (scripts `dev`, `build`, `preview`, `test`, `e2e`; output `apps/web/dist`), the deploy contract `VITE_API_BASE_URL` and `VITE_DATA_BASE_URL`.
- Produces: `parseWebEnv(source): { ok: true; env: WebEnv } | { ok: false; error: string }`; `themeCss(tokens): string`; `installTheme(tokens, doc?): void`.
- Consumes: `tokens`, `toCssVariables` from `@study-spot/ui-logic`.

- [ ] **Step 1: Create the package and configs**

`apps/web/package.json`:

```json
{
  "name": "@study-spot/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@fontsource/public-sans": "^5.3.0",
    "@study-spot/core": "workspace:*",
    "@study-spot/ui-logic": "workspace:*",
    "@tanstack/query-async-storage-persister": "^5.104.1",
    "@tanstack/react-query": "^5.104.1",
    "@tanstack/react-query-persist-client": "^5.104.1",
    "@tanstack/react-router": "^1.170.41",
    "idb": "^8.0.3",
    "lucide-react": "^1.52.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "workbox-window": "^7.4.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0",
    "@tanstack/router-plugin": "^1.168.42",
    "@testing-library/react": "^16.3.3",
    "@testing-library/dom": "^10.4.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "fake-indexeddb": "^6.2.5",
    "jsdom": "^30.1.2",
    "vite": "^8.3.2",
    "vite-plugin-pwa": "^2.0.0",
    "vitest": "^5.0.3"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-types",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vite-plugin-pwa/react"]
  },
  "include": ["src"],
  "references": [{ "path": "../../packages/core" }, { "path": "../../packages/ui-logic" }]
}
```

`apps/web/test/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "../dist-types/test",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vite-plugin-pwa/react"]
  },
  "include": ["."],
  "references": [
    { "path": ".." },
    { "path": "../../../packages/core" },
    { "path": "../../../packages/core/test" },
    { "path": "../../../packages/ui-logic" },
    { "path": "../../../packages/ui-logic/test" }
  ]
}
```

`apps/web/e2e/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "..",
    "outDir": "../dist-types/e2e",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": [".", "../vite.config.ts", "../vitest.config.ts", "../playwright.config.ts"],
  "references": [{ "path": "../../../packages/core" }, { "path": "../../../packages/ui-logic" }]
}
```

`apps/web/vite.config.ts`:

```ts
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // Must come before the React plugin. Writes src/routeTree.gen.ts, which is committed.
    tanstackRouter({ target: "react", autoCodeSplitting: false }),
    react(),
    VitePWA({
      // The app shows an update prompt; it never reloads itself.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Perch",
        short_name: "Perch",
        description: "Campus study spot guide: survey tools.",
        start_url: "/survey",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#16181d",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // One chunk on purpose: the service worker precaches it, so every survey screen opens offline.
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
```

`apps/web/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // vite-plugin-pwa's virtual module only exists in a Vite build.
      "virtual:pwa-register/react": fileURLToPath(new URL("test/pwaStub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
  },
});
```

`apps/web/playwright.config.ts` (used from Task 10):

```ts
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export const E2E_STATE = fileURLToPath(new URL("e2e/.state/server.json", import.meta.url));
export const API_ORIGIN = "http://127.0.0.1:8787";
export const WEB_ORIGIN = "http://localhost:4173";

/**
 * Phone-sized Chromium against the real server (PGlite, publish to a temp dir)
 * and the production build under `vite preview`, service worker included.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI === undefined ? 0 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Pixel 7"],
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  webServer: [
    {
      command: "node ../server/scripts/e2e-server.ts",
      url: `${API_ORIGIN}/health`,
      env: { E2E_STATE, E2E_WEB_ORIGIN: WEB_ORIGIN },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "bun run build && bun run preview",
      url: WEB_ORIGIN,
      env: { VITE_API_BASE_URL: API_ORIGIN, VITE_DATA_BASE_URL: "http://data.localhost:8788" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#16181d" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#2b2e35" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Perch" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <title>Perch survey</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/test/setup.ts`:

```ts
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has <dialog> but not its modal methods; this is enough for the Sheet's open state.
if (typeof HTMLDialogElement !== "undefined" && !("showModal" in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
}

afterEach(() => {
  cleanup();
});
```

`apps/web/test/pwaStub.ts`:

```ts
/** Stand-in for vite-plugin-pwa's virtual module under Vitest: no update is ever waiting. */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}
```

`bunfig.toml` (repo root):

```toml
[test]
# apps/web runs its DOM tests under Vitest (jsdom) and its browser tests under
# Playwright; bun test covers packages/* and apps/server only.
pathIgnorePatterns = ["apps/web/**"]
```

In `tsconfig.json` (root), add after `{ "path": "apps/server/test" }`:

```json
    { "path": "apps/web" },
    { "path": "apps/web/test" },
    { "path": "apps/web/e2e" }
```

In `biome.json`, add to `files.includes` after `"!**/drizzle/meta"`:

```json
      "!apps/web/src/routeTree.gen.ts",
      "!apps/web/dist-types",
      "!apps/web/dev-dist",
      "!apps/web/test-results",
      "!apps/web/playwright-report"
```

Append to `.gitignore`:

```
# Web app build and test output
apps/web/dist-types/
apps/web/dev-dist/
apps/web/test-results/
apps/web/playwright-report/
apps/web/e2e/.state/
```

Run: `bun install`
Expected: installs the new packages and updates `bun.lock`.

- [ ] **Step 2: Write the failing tests**

`apps/web/test/env.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseWebEnv } from "../src/env.ts";

test("both deploy variables are required and lose a trailing slash", () => {
  const ok = parseWebEnv({
    VITE_API_BASE_URL: "https://study-spot.onrender.com/",
    VITE_DATA_BASE_URL: "https://study-spot-data.pages.dev",
  });
  expect(ok).toEqual({
    ok: true,
    env: {
      VITE_API_BASE_URL: "https://study-spot.onrender.com",
      VITE_DATA_BASE_URL: "https://study-spot-data.pages.dev",
    },
  });
  expect(parseWebEnv({ VITE_API_BASE_URL: "https://x.example" }).ok).toBe(false);
  expect(
    parseWebEnv({ VITE_API_BASE_URL: "ftp://x", VITE_DATA_BASE_URL: "https://y.example" }).ok,
  ).toBe(false);
});
```

`apps/web/test/theme.test.ts`:

```ts
import { tokens } from "@study-spot/ui-logic";
import { expect, test } from "vitest";
import { installTheme, themeCss } from "../src/ui/theme.ts";

test("survey light is the default and dark follows the system", () => {
  const css = themeCss(tokens);
  expect(css).toContain(`--color-background: ${tokens.color.survey.light.background};`);
  expect(css).toContain("@media (prefers-color-scheme: dark)");
  expect(css).toContain(`--color-shell: ${tokens.color.survey.dark.shell};`);
  expect(css).toContain("--radius-control: 4px;");
  expect(css).toContain("--duration-stamp: 160ms;");
  expect(css).not.toContain(tokens.color.student.light.accent);
});

test("the token stylesheet is installed once", () => {
  installTheme(tokens);
  installTheme(tokens);
  expect(document.querySelectorAll("style#perch-tokens")).toHaveLength(1);
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL, `Cannot find module '../src/env.ts'` and `'../src/ui/theme.ts'`.

- [ ] **Step 3: Add the env contract, the theme, and the entry**

`apps/web/src/env.ts`:

```ts
import { z } from "zod";

const Origin = z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, ""));

/** The build-time contract with the deploy plan: exactly these two names. */
export const WebEnv = z.object({
  VITE_API_BASE_URL: Origin,
  VITE_DATA_BASE_URL: Origin,
});
export type WebEnv = z.infer<typeof WebEnv>;

export type EnvResult = { ok: true; env: WebEnv } | { ok: false; error: string };

export function parseWebEnv(source: Readonly<Record<string, unknown>>): EnvResult {
  const parsed = WebEnv.safeParse(source);
  return parsed.success
    ? { ok: true, env: parsed.data }
    : { ok: false, error: z.prettifyError(parsed.error) };
}
```

`apps/web/src/ui/theme.ts`:

```ts
import { type Tokens, toCssVariables } from "@study-spot/ui-logic";

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/**
 * Survey mode CSS variables from the token source: light by default, dark when
 * the system asks for it. The only place colors enter the stylesheet.
 */
export function themeCss(t: Tokens): string {
  const light = toCssVariables(t, "survey", "light");
  const dark = toCssVariables(t, "survey", "dark");
  return [
    block(":root", { ...light, "color-scheme": "light dark" }),
    `@media (prefers-color-scheme: dark) {\n${block(":root", dark)}\n}`,
  ].join("\n");
}

/** Adds the token stylesheet once, before the app renders. */
export function installTheme(t: Tokens, doc: Document = document): void {
  const id = "perch-tokens";
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = themeCss(t);
  doc.head.prepend(style);
}
```

`apps/web/src/routes/__root.tsx` (Task 8 replaces it):

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

/** The shell's update prompt joins in Task 8. */
export const Route = createRootRoute({ component: Outlet });
```

`apps/web/src/main.tsx` (Task 8 replaces it):

```tsx
import { tokens } from "@study-spot/ui-logic";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { parseWebEnv } from "./env.ts";
import { routeTree } from "./routeTree.gen.ts";
import { installTheme } from "./ui/theme.ts";

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

installTheme(tokens);
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const parsed = parseWebEnv(import.meta.env);
if (!parsed.ok) {
  root.textContent = `Perch is misconfigured:\n${parsed.error}`;
  throw new Error(parsed.error);
}
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 4: Add the icon**

`apps/web/public/icons/icon.svg` (drawn for Perch: postmark rings and cancellation waves on the ink band color):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Perch</title>
  <rect width="512" height="512" fill="#16181d"/>
  <g fill="none" stroke="#ffffff" stroke-linecap="round">
    <circle cx="196" cy="256" r="108" stroke-width="20"/>
    <circle cx="196" cy="256" r="76" stroke-width="9"/>
    <path d="M326 200c24-18 48 18 72 0s48-18 72 0M326 256c24-18 48 18 72 0s48-18 72 0M326 312c24-18 48 18 72 0s48-18 72 0" stroke-width="15"/>
  </g>
  <circle cx="196" cy="256" r="24" fill="#9fb2ff"/>
</svg>
```

`apps/web/e2e/render-icons.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/**
 * Renders the PNG app icons from public/icons/icon.svg (authored by hand for
 * Perch, no third-party artwork) with headless Chromium. Run after changing the
 * SVG: `node apps/web/e2e/render-icons.ts`. The PNGs are committed.
 */
const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, "utf8");
const targets = [
  { file: "icon-192.png", size: 192, inset: 0 },
  { file: "icon-512.png", size: 512, inset: 0 },
  { file: "apple-touch-icon.png", size: 180, inset: 0 },
  // Maskable: the mark sits inside the 80% safe zone on the same ink ground.
  { file: "icon-512-maskable.png", size: 512, inset: 0.1 },
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const pad = Math.round(t.size * t.inset);
  await page.setContent(
    `<body style="margin:0;background:#16181d"><div style="padding:${pad}px">${svg.replace(
      "<svg ",
      `<svg width="${t.size - pad * 2}" height="${t.size - pad * 2}" style="display:block" `,
    )}</div></body>`,
  );
  writeFileSync(`${dir}${t.file}`, await page.screenshot({ type: "png" }));
}
await browser.close();
writeFileSync(
  `${dir}PROVENANCE.txt`,
  "icon.svg: authored for Perch (postmark rings and cancellation waves), no third-party artwork.\n" +
    "PNG icons: rendered from icon.svg by apps/web/e2e/render-icons.ts (headless Chromium).\n",
);
console.log(`rendered ${targets.length} icons into ${dir}`);
```

Run: `(cd apps/web && bunx playwright install chromium && node e2e/render-icons.ts)`
Expected: `rendered 4 icons into .../apps/web/public/icons/`; the four PNGs and `PROVENANCE.txt` exist. Open `icon-512-maskable.png` and check the rings sit inside the middle 80%.

- [ ] **Step 5: Build once to generate the route tree, then run the tests**

Run: `VITE_API_BASE_URL=http://127.0.0.1:8787 VITE_DATA_BASE_URL=http://data.localhost:8788 bun run --filter '@study-spot/web' build`
Expected: `✓ built`, `PWA v2.0.0 ... files generated dist/sw.js`, and `apps/web/src/routeTree.gen.ts` exists (commit it; `tsc -b` runs before any build in CI).

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (3 tests).

- [ ] **Step 6: Add the web steps to CI**

In `.github/workflows/ci.yml`, in the `check` job after the `Test` step, add:

```yaml
      - name: Web unit tests
        run: bun run --filter '@study-spot/web' test

      - name: Web build
        run: bun run --filter '@study-spot/web' build
        env:
          VITE_API_BASE_URL: https://api.example.invalid
          VITE_DATA_BASE_URL: https://data.example.invalid
```

- [ ] **Step 7: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun test && bun run --filter '@study-spot/web' test`
Expected: all pass; `bun test` reports no files from `apps/web`.

```bash
git add apps/web bunfig.toml tsconfig.json biome.json .gitignore .github/workflows/ci.yml bun.lock
git commit -m "build(web): scaffold the survey pwa with vite, router, and vitest"
```

### Task 5: Browser adapters for every `ui-logic` adapter

The web implementations: one IndexedDB database (`study-spot`, stores `kv` and `bin`) for the outbox queue, photo bytes, and the persisted query cache, with every call bounded by a 10 s timeout so a stuck browser API cannot freeze the queue (plan B ledger); `fetch` with JSON and multipart and its own timeouts (Render can take most of a minute to wake); Web Locks for `Lock` and `Liveness`; BroadcastChannel for `QueueSignal`; and the small ones (clock, ids, timers, foreground, network, localStorage with a memory fallback, geolocation, share).

**Files:**
- Create: `apps/web/src/adapters/timeout.ts`, `idb.ts`, `http.ts`, `browser.ts`, `locks.ts`
- Create: `apps/web/test/adapters.test.ts` (node environment, fake-indexeddb), `apps/web/test/browser.test.ts` (jsdom)

**Interfaces:**
- Produces: `withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T>`; `openStores(name?): { cache: KeyValueCache; blobs: BinaryCache; close(): void }`, `STORAGE_TIMEOUT_MS = 10_000`; `createFetchHttp(fetchFn?): Http`, `JSON_TIMEOUT_MS = 75_000`, `UPLOAD_TIMEOUT_MS = 120_000`.
- Produces: `type LockApi = { request<T>(name, cb: () => Promise<T>): Promise<T>; query(): Promise<{ held?: { name?: string }[] }> }`; `createWebLock(locks: LockApi): Lock`; `createWebLiveness(locks: LockApi, ids: Ids): Liveness`, `TAB_LOCK_PREFIX = "study-spot:tab:"`.
- Produces: `systemClock`, `browserIds`, `browserTimers`, `createForeground(doc?)`, `createNetworkStatus(win?)`, `createLocalStorage(win?)`, `createBroadcastSignal(name?)`, `createGeolocation(nav?)`, `createShare(nav?)`, `OUTBOX_CHANNEL`, `GEO_TIMEOUT_MS`.
- Consumes: the adapter interfaces from `@study-spot/ui-logic` (Task 1 adds `Liveness`, `QueueSignal`).

- [ ] **Step 1: Write the failing tests**

`apps/web/test/adapters.test.ts`:

```ts
// @vitest-environment node
import "fake-indexeddb/auto";
import type { HttpRequest } from "@study-spot/ui-logic";
import { expect, test, vi } from "vitest";
import { createFetchHttp, JSON_TIMEOUT_MS } from "../src/adapters/http.ts";
import { openStores } from "../src/adapters/idb.ts";
import {
  createWebLiveness,
  createWebLock,
  type LockApi,
  TAB_LOCK_PREFIX,
} from "../src/adapters/locks.ts";
import { withTimeout } from "../src/adapters/timeout.ts";

let n = 0;
const fresh = () => {
  n += 1;
  return openStores(`test-${n}`);
};

test("the IndexedDB cache stores strings and lists keys by prefix", async () => {
  const { cache } = fresh();
  await cache.set("outbox:w:1", "a");
  await cache.set("outbox:w:2", "b");
  await cache.set("outbox:v:x", "3");
  expect(await cache.get("outbox:w:1")).toBe("a");
  expect((await cache.keys("outbox:w:")).sort()).toEqual(["outbox:w:1", "outbox:w:2"]);
  await cache.delete("outbox:w:1");
  expect(await cache.get("outbox:w:1")).toBeNull();
  expect(await cache.get("missing")).toBeNull();
});

test("the binary store hands back an independent Uint8Array copy", async () => {
  const { blobs } = fresh();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  await blobs.set("photo:1", bytes);
  const got = await blobs.get("photo:1");
  expect(got).toBeInstanceOf(Uint8Array);
  expect([...(got ?? [])]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  await blobs.delete("photo:1");
  expect(await blobs.get("photo:1")).toBeNull();
});

test("a storage call that never settles rejects instead of freezing the queue", async () => {
  vi.useFakeTimers();
  const stuck = withTimeout(new Promise<never>(() => {}), 10, "kv get");
  vi.advanceTimersByTime(10);
  await expect(stuck).rejects.toThrow("kv get timed out after 10 ms");
  vi.useRealTimers();
});

const request = (over: Partial<HttpRequest>): HttpRequest => ({
  method: "GET",
  url: "https://api.example/survey/spots",
  headers: { accept: "application/json" },
  body: null,
  ...over,
});

test("http resolves every status and sends JSON as given", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = createFetchHttp(async (url, init) => {
    calls.push({ url, init });
    return new Response('{"error":"version_conflict"}', { status: 409 });
  });
  const res = await http.send(request({ method: "PUT", body: { kind: "json", json: '{"a":1}' } }));
  expect(res).toEqual({ status: 409, text: '{"error":"version_conflict"}' });
  expect(calls[0]?.init.method).toBe("PUT");
  expect(calls[0]?.init.body).toBe('{"a":1}');
});

test("http sends multipart with the file part and lets FormData set the boundary", async () => {
  let sent: BodyInit | null | undefined;
  const http = createFetchHttp(async (_url, init) => {
    sent = init.body;
    return new Response("{}", { status: 201 });
  });
  await http.send(
    request({
      method: "POST",
      url: "https://api.example/survey/photos",
      headers: { authorization: "Bearer x" },
      body: {
        kind: "multipart",
        fields: { spot_id: "s", client_write_id: "w" },
        file: {
          field: "file",
          filename: "photo.jpg",
          contentType: "image/jpeg",
          bytes: new Uint8Array([1, 2, 3]),
        },
      },
    }),
  );
  expect(sent).toBeInstanceOf(FormData);
  const form = sent as FormData;
  expect(form.get("spot_id")).toBe("s");
  const file = form.get("file");
  expect(file).toBeInstanceOf(Blob);
  expect((file as Blob).type).toBe("image/jpeg");
  expect((file as Blob).size).toBe(3);
});

test("http rejects on a network failure and aborts after the timeout", async () => {
  const down = createFetchHttp(async () => {
    throw new TypeError("Failed to fetch");
  });
  await expect(down.send(request({}))).rejects.toThrow("Failed to fetch");
  vi.useFakeTimers();
  const slow = createFetchHttp(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );
  const pending = slow.send(request({}));
  vi.advanceTimersByTime(JSON_TIMEOUT_MS);
  await expect(pending).rejects.toThrow("aborted");
  vi.useRealTimers();
});

/** Web Locks in memory: exclusive per name, held until the callback settles. */
class FakeLocks implements LockApi {
  private readonly tails = new Map<string, Promise<unknown>>();
  readonly heldNames = new Set<string>();
  request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(name) ?? Promise.resolve();
    const run = prev.then(async () => {
      this.heldNames.add(name);
      try {
        return await callback();
      } finally {
        this.heldNames.delete(name);
      }
    });
    this.tails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  }
  async query(): Promise<{ held: { name: string }[] }> {
    return { held: [...this.heldNames].map((name) => ({ name })) };
  }
}

test("navigator.locks fits the LockApi the adapters take", () => {
  const fits = (api: LockApi) => api;
  if (typeof navigator !== "undefined" && "locks" in navigator) fits(navigator.locks);
  expect(typeof fits).toBe("function");
});

test("the web lock runs holders of one name one at a time", async () => {
  const lock = createWebLock(new FakeLocks());
  const order: string[] = [];
  let release = () => {};
  const first = lock.run(
    "x",
    () =>
      new Promise<void>((resolve) => {
        release = () => {
          order.push("a");
          resolve();
        };
      }),
  );
  const second = lock.run("x", async () => {
    order.push("b");
  });
  await Promise.resolve();
  expect(order).toEqual([]);
  release();
  await Promise.all([first, second]);
  expect(order).toEqual(["a", "b"]);
});

test("a tab's liveness lock is visible to other tabs until it releases", async () => {
  const locks = new FakeLocks();
  let id = 0;
  const ids = {
    uuid: () => {
      id += 1;
      return `tab-${id}`;
    },
  };
  const a = createWebLiveness(locks, ids);
  const b = createWebLiveness(locks, ids);
  const owner = await a.hold();
  expect(owner).toBe("tab-1");
  expect(locks.heldNames.has(`${TAB_LOCK_PREFIX}tab-1`)).toBe(true);
  expect(await b.alive(owner)).toBe(true);
  a.release();
  await Promise.resolve();
  await Promise.resolve();
  expect(await b.alive(owner)).toBe(false);
  expect(await b.alive("never")).toBe(false);
});
```

`apps/web/test/browser.test.ts`:

```ts
import { expect, test, vi } from "vitest";
import {
  createBroadcastSignal,
  createForeground,
  createGeolocation,
  createLocalStorage,
  createNetworkStatus,
  createShare,
} from "../src/adapters/browser.ts";

// The fakes below implement only what each adapter reads, so they are cast to the DOM types.

test("the network status follows online and offline events", () => {
  const network = createNetworkStatus();
  const seen: boolean[] = [];
  const stop = network.subscribe((online) => seen.push(online));
  window.dispatchEvent(new Event("offline"));
  window.dispatchEvent(new Event("online"));
  stop();
  window.dispatchEvent(new Event("offline"));
  expect(seen).toEqual([false, true]);
});

test("foreground fires only when the page becomes visible", () => {
  const foreground = createForeground();
  const fired = vi.fn();
  foreground.subscribe(fired);
  const state = vi.spyOn(document, "visibilityState", "get");
  state.mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  state.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(fired).toHaveBeenCalledTimes(1);
});

test("storage falls back to memory when localStorage throws", () => {
  const blocked = {
    get localStorage(): Storage {
      throw new DOMException("blocked", "SecurityError");
    },
  } as unknown as Window;
  const storage = createLocalStorage(blocked);
  storage.setItem("k", "v");
  expect(storage.getItem("k")).toBe("v");
  storage.removeItem("k");
  expect(storage.getItem("k")).toBeNull();
});

test("the broadcast signal reaches another channel of the same name", async () => {
  const a = createBroadcastSignal("test-signal");
  const b = createBroadcastSignal("test-signal");
  const got = new Promise<void>((resolve) => b.subscribe(resolve));
  a.post();
  await expect(got).resolves.toBeUndefined();
});

test("geolocation resolves a fix, or null when denied", async () => {
  const fix = {
    geolocation: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 40.9, longitude: -73.1, accuracy: 12 } } as GeolocationPosition),
    },
  } as unknown as Navigator;
  expect(await createGeolocation(fix).current()).toEqual({
    lat: 40.9,
    lng: -73.1,
    accuracyMeters: 12,
  });
  const denied = {
    geolocation: {
      getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
    },
  } as unknown as Navigator;
  expect(await createGeolocation(denied).current()).toBeNull();
});

test("share copies the link, or opens the share sheet when the clipboard is blocked", async () => {
  const writeText = vi.fn(async () => {});
  expect(
    await createShare({ clipboard: { writeText } } as unknown as Navigator).share({
      title: "Perch",
      url: "u",
    }),
  ).toBe("copied");
  const share = vi.fn(async () => {});
  const blocked = {
    clipboard: { writeText: async () => Promise.reject(new Error("denied")) },
    share,
  } as unknown as Navigator;
  expect(await createShare(blocked).share({ title: "Perch", url: "u" })).toBe("shared");
  expect(share).toHaveBeenCalledWith({ title: "Perch", url: "u" });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL, the adapter modules do not exist.

- [ ] **Step 3: Write the adapters**

`apps/web/src/adapters/timeout.ts`:

```ts
/** Rejects when `promise` has not settled after `ms`, so a stuck browser API cannot freeze the queue. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
```

`apps/web/src/adapters/idb.ts`:

```ts
import type { BinaryCache, KeyValueCache } from "@study-spot/ui-logic";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { withTimeout } from "./timeout.ts";

export const DB_NAME = "study-spot";
const DB_VERSION = 1;
/** IndexedDB calls that take longer than this reject, so the outbox retries instead of hanging. */
export const STORAGE_TIMEOUT_MS = 10_000;

interface StudySpotDb extends DBSchema {
  kv: { key: string; value: string };
  bin: { key: string; value: Uint8Array };
}

export type Stores = { cache: KeyValueCache; blobs: BinaryCache; close(): void };

/** A copy as a plain Uint8Array, whatever realm or view type IndexedDB handed back. */
function toBytes(value: unknown): Uint8Array | null {
  if (!ArrayBuffer.isView(value)) return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

/**
 * The outbox queue, photo bytes, and the persisted query cache, in one
 * IndexedDB database with a string store and a binary store.
 */
export function openStores(name: string = DB_NAME): Stores {
  let db: Promise<IDBPDatabase<StudySpotDb>> | null = null;
  const conn = (): Promise<IDBPDatabase<StudySpotDb>> => {
    db ??= openDB<StudySpotDb>(name, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore("kv");
        d.createObjectStore("bin");
      },
    }).catch((error: unknown) => {
      db = null;
      throw error;
    });
    return db;
  };
  const run = <T>(what: string, fn: (d: IDBPDatabase<StudySpotDb>) => Promise<T>) =>
    withTimeout(
      conn().then((d) => fn(d)),
      STORAGE_TIMEOUT_MS,
      what,
    );

  const cache: KeyValueCache = {
    get: (key) =>
      run("kv get", async (d) => {
        const value: unknown = await d.get("kv", key);
        return typeof value === "string" ? value : null;
      }),
    set: (key, value) =>
      run("kv set", async (d) => {
        await d.put("kv", value, key);
      }),
    delete: (key) =>
      run("kv delete", async (d) => {
        await d.delete("kv", key);
      }),
    keys: (prefix) =>
      run("kv keys", (d) => d.getAllKeys("kv", IDBKeyRange.bound(prefix, `${prefix}￿`))),
  };
  const blobs: BinaryCache = {
    get: (key) => run("bin get", async (d) => toBytes(await d.get("bin", key))),
    set: (key, bytes) =>
      run("bin set", async (d) => {
        await d.put("bin", bytes, key);
      }),
    delete: (key) =>
      run("bin delete", async (d) => {
        await d.delete("bin", key);
      }),
  };
  return {
    cache,
    blobs,
    close: () => {
      void db?.then((d) => d.close());
      db = null;
    },
  };
}
```

`apps/web/src/adapters/http.ts`:

```ts
import type { FetchResponse, Http, HttpRequest } from "@study-spot/ui-logic";

/** Render's free tier can take most of a minute to wake, so JSON calls wait longer than that. */
export const JSON_TIMEOUT_MS = 75_000;
/** A 1.5 MB photo on a weak campus signal. */
export const UPLOAD_TIMEOUT_MS = 120_000;

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

function bodyOf(request: HttpRequest): BodyInit | null {
  const body = request.body;
  if (body === null) return null;
  if (body.kind === "json") return body.json;
  const form = new FormData();
  for (const [name, value] of Object.entries(body.fields)) form.append(name, value);
  // A copy is ArrayBuffer-backed, which Blob requires (a Uint8Array may view a SharedArrayBuffer).
  const blob = new Blob([new Uint8Array(body.file.bytes)], { type: body.file.contentType });
  form.append(body.file.field, blob, body.file.filename);
  return form;
}

/**
 * The survey API over fetch. Network failures and timeouts reject; every HTTP
 * status resolves. FormData sets the multipart boundary, so no content type is
 * sent for uploads.
 */
export function createFetchHttp(fetchFn: FetchFn = (i, init) => fetch(i, init)): Http {
  return {
    async send(request) {
      const timeout = request.body?.kind === "multipart" ? UPLOAD_TIMEOUT_MS : JSON_TIMEOUT_MS;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetchFn(request.url, {
          method: request.method,
          headers: request.headers,
          body: bodyOf(request),
          signal: controller.signal,
          cache: "no-store",
        });
        const out: FetchResponse = { status: res.status, text: await res.text() };
        return out;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

`apps/web/src/adapters/locks.ts`:

```ts
import type { Ids, Liveness, Lock } from "@study-spot/ui-logic";

/** The part of the Web Locks API the outbox needs; navigator.locks satisfies it. */
export type LockApi = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
  query(): Promise<{ held?: { name?: string }[] }>;
};

/** Cross-tab mutual exclusion: tabs of one origin share these locks. */
export function createWebLock(locks: LockApi): Lock {
  return {
    run<T>(name: string, fn: () => Promise<T>): Promise<T> {
      return locks.request(name, () => fn());
    },
  };
}

export const TAB_LOCK_PREFIX = "study-spot:tab:";

/**
 * Each tab holds a Web Lock named after its owner id for as long as it runs.
 * The browser drops it when the tab closes or crashes, so another tab sees at
 * once that a write marked `syncing` by that tab will never settle.
 */
export function createWebLiveness(locks: LockApi, ids: Ids): Liveness {
  const self = ids.uuid();
  let release: (() => void) | null = null;
  let held: Promise<void> | null = null;
  return {
    hold() {
      held ??= new Promise<void>((granted) => {
        void locks.request(
          `${TAB_LOCK_PREFIX}${self}`,
          () =>
            new Promise<void>((done) => {
              release = done;
              granted();
            }),
        );
      });
      return held.then(() => self);
    },
    release() {
      release?.();
      release = null;
      held = null;
    },
    async alive(owner) {
      if (owner === self) return held !== null;
      const state = await locks.query();
      return (state.held ?? []).some((l) => l.name === `${TAB_LOCK_PREFIX}${owner}`);
    },
  };
}
```

`apps/web/src/adapters/browser.ts`:

```ts
import type {
  Clock,
  Foreground,
  GeolocationAdapter,
  Ids,
  KeyValueStorage,
  NetworkStatus,
  QueueSignal,
  Share,
  Timers,
} from "@study-spot/ui-logic";

export const systemClock: Clock = { now: () => new Date() };

export const browserIds: Ids = { uuid: () => crypto.randomUUID() };

export const browserTimers: Timers = {
  after(ms, fn) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

/** Fires when the page becomes visible again (unlocking the phone, switching back to the app). */
export function createForeground(doc: Document = document): Foreground {
  return {
    subscribe(listener) {
      const onChange = () => {
        if (doc.visibilityState === "visible") listener();
      };
      doc.addEventListener("visibilitychange", onChange);
      return () => doc.removeEventListener("visibilitychange", onChange);
    },
  };
}

export function createNetworkStatus(win: Window = window): NetworkStatus {
  return {
    online: () => win.navigator.onLine,
    subscribe(listener) {
      const on = () => listener(true);
      const off = () => listener(false);
      win.addEventListener("online", on);
      win.addEventListener("offline", off);
      return () => {
        win.removeEventListener("online", on);
        win.removeEventListener("offline", off);
      };
    },
  };
}

/**
 * localStorage for the session token, falling back to memory when storage is
 * blocked (some private modes throw on access). setItem can still throw on a
 * full disk; callers handle that.
 */
export function createLocalStorage(win: Window = window): KeyValueStorage {
  try {
    const probe = "study-spot:probe";
    win.localStorage.setItem(probe, "1");
    win.localStorage.removeItem(probe);
    return win.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }
}

export const OUTBOX_CHANNEL = "study-spot:outbox";

/** Wakes other tabs of this origin when the queue changes. A no-op where BroadcastChannel is missing. */
export function createBroadcastSignal(name: string = OUTBOX_CHANNEL): QueueSignal {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, subscribe: () => () => {} };
  }
  const channel = new BroadcastChannel(name);
  return {
    post: () => channel.postMessage("changed"),
    subscribe(listener) {
      const onMessage = () => listener();
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
  };
}

export const GEO_TIMEOUT_MS = 15_000;

/** One fix, or null when location is off, denied, or slow. Never throws. */
export function createGeolocation(nav: Navigator = navigator): GeolocationAdapter {
  return {
    current: () =>
      new Promise((resolve) => {
        if (!("geolocation" in nav)) {
          resolve(null);
          return;
        }
        nav.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyMeters: pos.coords.accuracy,
            }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 30_000 },
        );
      }),
  };
}

/** Copies a link (the buttons say "Copy link"); the share sheet only when the clipboard is blocked. */
export function createShare(nav: Navigator = navigator): Share {
  return {
    async share(data) {
      try {
        await nav.clipboard.writeText(data.url);
        return "copied";
      } catch {
        // Clipboard blocked or missing (insecure context); try the share sheet.
      }
      if (typeof nav.share !== "function") return "failed";
      try {
        await nav.share(data);
        return "shared";
      } catch {
        return "failed";
      }
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (9 tests in `adapters.test.ts`, 6 in `browser.test.ts`).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass. `typecheck` proves `navigator.locks` fits `LockApi` (the "fits" test).

```bash
git add apps/web/src/adapters apps/web/test
git commit -m "feat(web): add indexeddb, fetch, web locks, and browser adapters"
```

### Task 6: The Divided Back component set and the survey stylesheet

The components the contract names, built on standard controls (native radios, checkboxes, inputs, `<dialog>`) and styled only with token variables: button (ink primary, outlined secondary, stamp-red destructive, quiet), field with the printed label on the rule and the value in ballpoint blue, segmented control (row or ruled list), stepper with keypad entry, checkbox line, sheet (the only element with a shadow) and confirm sheet, ruled 44 px row, rubber-stamp chip, toast, banner, postmark ring (solid, dashed, struck) with the 160 ms stamping press (120 ms fade with reduced motion), the ink header band, and the header's sync postmark. Labels are Public Sans 600, 13 px, full caps.

**Files:**
- Create: `apps/web/src/ui/styles.css`, `Button.tsx`, `Field.tsx`, `Segmented.tsx`, `Stepper.tsx`, `Check.tsx`, `Sheet.tsx`, `Postmark.tsx`, `StampChip.tsx`, `RuledRow.tsx`, `Toast.tsx`, `Banner.tsx`, `HeaderBand.tsx`, `SyncPostmark.tsx`, `Screen.tsx`
- Create: `apps/web/src/lib/format.ts` (dates, postmark state, section names, header text, sync sheet text)
- Create: `apps/web/test/components.test.tsx`

**Interfaces:**
- Produces: `Button({ variant?: "primary" | "secondary" | "danger" | "quiet"; wide?; icon?; ...button props })`; `Field({ label, helper?, error?, optional?, children: ({ inputId, describedBy }) => ReactNode })`; `TextField({ label, value, onChange, helper?, error?, optional?, placeholder?, multiline?, inputMode?, autoComplete?, maxLength? })`; `Segmented<V>({ label, options: Option<V>[], value: V | null, onChange, helper?, error?, layout?: "row" | "list" })`, `type Option<V> = { value: V; label: string }`; `Stepper({ label, value: number | null, onChange, min?, max?, step?, suffix?, helper?, error? })`; `Check({ label, checked, onChange, helper? })`.
- Produces: `Sheet({ open, title, onClose, children, actions? })`, `ConfirmSheet({ open, title, body, action, cancel, destructive?, onConfirm, onCancel })`; `Postmark({ state: "fresh" | "stale" | "never"; date; label })`; `StampChip({ tone: "ink" | "red" | "green" | "blue" | "amber"; filled?; children })`; `RuledRow({ label, value?, tone?: "value" | "missing" | "muted", trailing?, link?: LinkProps })`; `Toast({ message, onDismiss })`; `Banner({ children, action?, tone?: "danger" | "note" })`; `HeaderBand({ title, back?: LinkProps, trailing? })`; `SyncPostmark({ header: SyncHeader; onOpen })`; `Screen({ children, action? })`, `GroupHeading({ children, id? })`.
- Produces (`format.ts`): `STALE_AFTER_DAYS = 90`, `postmarkState(verifiedAt, now)`, `shortDate(iso, tz)`, `dateTime(iso, tz)`, `sectionName(section: OverviewSection)`, `headerText(h: SyncHeader)`, `headerLong(h: SyncHeader)`, `whatOf(record: WriteRecord, name: string)`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/components.test.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { Button } from "../src/ui/Button.tsx";
import { TextField } from "../src/ui/Field.tsx";
import { Postmark } from "../src/ui/Postmark.tsx";
import { Segmented } from "../src/ui/Segmented.tsx";
import { ConfirmSheet } from "../src/ui/Sheet.tsx";
import { StampChip } from "../src/ui/StampChip.tsx";
import { Stepper } from "../src/ui/Stepper.tsx";
import { SyncPostmark } from "../src/ui/SyncPostmark.tsx";

test("buttons default to type=button and carry their variant", () => {
  render(<Button variant="primary">Publish</Button>);
  const b = screen.getByRole("button", { name: "Publish" });
  expect(b.getAttribute("type")).toBe("button");
  expect(b.className).toContain("btn--primary");
});

test("a text field ties its label, helper, and error to the input", () => {
  render(
    <TextField label="Name" helper="Use the sign" error="Required" value="" onChange={() => {}} />,
  );
  const input = screen.getByRole("textbox", { name: "Name" });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const described = input.getAttribute("aria-describedby");
  expect(described === null ? "" : document.getElementById(described)?.textContent).toBe(
    "Required",
  );
});

test("the segmented control is a radio group that reports the chosen value", () => {
  const onChange = vi.fn();
  render(
    <Segmented
      label="Noise rule"
      options={[
        { value: "silent", label: "Silent" },
        { value: "quiet", label: "Quiet" },
      ]}
      value="silent"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("group", { name: "Noise rule" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Silent" })).toHaveProperty("checked", true);
  fireEvent.click(screen.getByRole("radio", { name: "Quiet" }));
  expect(onChange).toHaveBeenCalledWith("quiet");
});

function SeatStepper() {
  const [n, setN] = useState<number | null>(null);
  return <Stepper label="Seats" value={n} onChange={setN} min={1} />;
}

test("the stepper takes typed numbers and steps within its bounds", () => {
  render(<SeatStepper />);
  const input = screen.getByRole("textbox", { name: "Seats" });
  fireEvent.change(input, { target: { value: "120" } });
  expect((input as HTMLInputElement).value).toBe("120");
  fireEvent.click(screen.getByRole("button", { name: t("common.more") }));
  expect((input as HTMLInputElement).value).toBe("121");
  fireEvent.change(input, { target: { value: "1" } });
  expect(screen.getByRole("button", { name: t("common.less") })).toHaveProperty("disabled", true);
  fireEvent.change(input, { target: { value: "12a" } });
  expect((input as HTMLInputElement).value).toBe("12");
});

test("postmarks say their state and stamp when the date changes", () => {
  vi.useFakeTimers();
  const { rerender, container } = render(<Postmark state="never" date="" label="Never checked" />);
  expect(screen.getByRole("img", { name: "Never checked" })).toBeTruthy();
  expect(container.querySelector(".postmark__strike")).not.toBeNull();
  rerender(<Postmark state="fresh" date="OCT 5" label="Checked today" />);
  expect(container.querySelector(".postmark--stamping")).not.toBeNull();
  act(() => vi.advanceTimersByTime(250));
  expect(container.querySelector(".postmark--stamping")).toBeNull();
  vi.useRealTimers();
});

test("stamp chips are text, so their status reads without color", () => {
  render(<StampChip tone="red">Draft</StampChip>);
  expect(screen.getByText("Draft").className).toContain("stamp--red");
});

test("the header postmark uses the short forms that fit a 360 px phone", () => {
  const onOpen = vi.fn();
  render(<SyncPostmark header={{ kind: "offline" }} onOpen={onOpen} />);
  const button = screen.getByRole("button", { name: t("sync.short.offline") });
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalled();
  for (const text of [
    t("sync.short.pending", { count: 12 }),
    t("sync.short.failed", { count: 12 }),
    t("sync.syncing", { count: 12 }),
    t("sync.short.unreadable", { count: 12 }),
    t("sync.all_synced"),
  ]) {
    expect(text.length).toBeLessThanOrEqual(16);
  }
});

test("a confirm sheet is a labelled dialog with both choices", () => {
  const onConfirm = vi.fn();
  render(
    <ConfirmSheet
      open
      title="Discard changes?"
      body="Your edits won't be saved."
      action="Discard changes"
      cancel="Keep editing"
      destructive
      onConfirm={onConfirm}
      onCancel={() => {}}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Discard changes?" });
  expect(dialog.hasAttribute("open")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(onConfirm).toHaveBeenCalled();
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL, `../src/ui/Button.tsx` and the other components do not exist.

- [ ] **Step 2: Write the stylesheet**

`apps/web/src/ui/styles.css` (Task 8 imports it from `main.tsx`):

```css
/*
 * Survey mode of The Divided Back (apps/web/.impeccable/surfaces/apps-web.md).
 * Every color, size, radius, and duration is a token variable from
 * packages/ui-logic/src/tokens.ts (installed by theme.ts). Flat card stock, ink
 * text, hairline rules on a 44 px line grid, entered values in ballpoint blue.
 */

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--fontSize-body);
  line-height: var(--lineHeight-body);
  font-variant-numeric: tabular-nums;
  -webkit-tap-highlight-color: transparent;
  caret-color: var(--color-accent);
  accent-color: var(--color-accent);
}

::selection {
  background: var(--color-accent);
  color: var(--color-onAccent);
}

:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

* {
  scrollbar-color: var(--color-borderStrong) transparent;
  scrollbar-width: thin;
}

h1,
h2,
h3,
p {
  margin: 0;
}

a {
  color: inherit;
  text-underline-offset: 3px;
}

button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
}

/* The printed voice: Public Sans in full caps for labels, small for space. */
.label,
.group-heading {
  font-family: var(--font-display);
  font-size: var(--fontSize-label);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: var(--lineHeight-tight);
  color: var(--color-text);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Header band */

.band {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: calc(var(--size-header) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) var(--space-xs) 0;
  background: var(--color-shell);
  color: var(--color-onShell);
  border-bottom: var(--size-rule) solid var(--color-border);
}

.band :focus-visible {
  outline-color: var(--color-focusOnShell);
}

.band__back,
.band__spacer {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--size-tapTarget);
  height: var(--size-tapTarget);
  color: var(--color-onShell);
  border-radius: var(--radius-control);
}

.band__spacer {
  width: var(--space-xs);
}

.band__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: var(--fontSize-body);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.syncmark {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--size-tapTarget);
  max-width: 46vw;
  padding: 0 var(--space-xs);
  border: 0;
  background: transparent;
  color: var(--color-onShell);
  font-family: var(--font-display);
  font-size: var(--fontSize-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: var(--radius-control);
  cursor: pointer;
}

.syncmark__ring {
  flex: none;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.syncmark__dot {
  fill: currentColor;
  stroke: none;
}

.syncmark__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.syncmark--trouble .syncmark__text {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}

.syncmark--busy .syncmark__ring {
  animation: syncmark-turn 1.6s linear infinite;
}

@keyframes syncmark-turn {
  to {
    transform: rotate(360deg);
  }
}

/* The sheet of card stock */

.screen {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-md) var(--space-md) calc(var(--space-xl) + env(safe-area-inset-bottom));
}

.screen--with-action {
  padding-bottom: calc(var(--size-tapTarget) + var(--space-xl) * 2 + env(safe-area-inset-bottom));
}

.pinned {
  position: fixed;
  inset: auto 0 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-sm) var(--space-md) calc(var(--space-md) + env(safe-area-inset-bottom));
  background: var(--color-background);
  border-top: var(--size-rule) solid var(--color-border);
}

.lede {
  color: var(--color-textMuted);
  font-size: var(--fontSize-small);
  max-width: 60ch;
}

.title {
  font-family: var(--font-display);
  font-size: var(--fontSize-title);
  font-weight: 700;
  line-height: var(--lineHeight-tight);
}

.group-heading {
  padding-bottom: var(--space-xs);
  border-bottom: var(--size-rule) solid var(--color-text);
}

.stamp-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

/* Ruled rows */

.ruled-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ruled {
  border-bottom: var(--size-rule) solid var(--color-border);
}

.ruled__link,
.ruled__static {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: var(--size-line);
  padding: var(--space-xs) 0;
  text-decoration: none;
  color: inherit;
}

.ruled__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ruled__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.ruled__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fontSize-small);
}

.ruled__value--value {
  color: var(--color-accent);
}

.ruled__value--missing {
  color: var(--color-danger);
  font-weight: 600;
}

.ruled__value--muted {
  color: var(--color-textMuted);
}

.ruled__chevron {
  flex: none;
  color: var(--color-textMuted);
}

/* Fields: printed label on the rule, ballpoint entry */

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  min-width: 0;
  margin: 0;
  padding: 0 0 var(--space-xs);
  border: 0;
  border-bottom: var(--size-rule) solid var(--color-border);
}

.field__label {
  display: flex;
  justify-content: space-between;
  gap: var(--space-xs);
  padding: var(--space-xs) 0 0;
}

.field__optional {
  color: var(--color-textMuted);
  font-weight: 500;
  letter-spacing: 0.04em;
}

.field__helper {
  color: var(--color-textMuted);
  font-size: var(--fontSize-small);
}

.field__error {
  color: var(--color-danger);
  font-size: var(--fontSize-small);
  font-weight: 600;
}

.input {
  width: 100%;
  min-height: var(--size-tapTarget);
  padding: var(--space-xs) var(--space-sm);
  border: var(--size-rule) solid var(--color-borderStrong);
  border-radius: var(--radius-control);
  background: var(--color-background);
  color: var(--color-accent);
  font-size: var(--fontSize-body);
}

.input::placeholder {
  color: var(--color-textMuted);
  opacity: 1;
}

.input:focus-visible {
  outline-offset: 0;
  border-color: var(--color-focus);
}

.input--multiline {
  min-height: calc(var(--size-line) * 2);
  resize: vertical;
  line-height: var(--lineHeight-body);
}

.field--error .input {
  border-color: var(--color-danger);
  border-width: 2px;
}

/* Segmented control */

.segmented__options {
  display: flex;
  border: var(--size-rule) solid var(--color-borderStrong);
  border-radius: var(--radius-control);
  overflow: hidden;
}

.segmented--list .segmented__options {
  flex-direction: column;
  border: 0;
  border-radius: 0;
}

.segmented__option {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}

.segmented__option + .segmented__option {
  border-left: var(--size-rule) solid var(--color-borderStrong);
}

.segmented--list .segmented__option + .segmented__option {
  border-left: 0;
  border-top: var(--size-rule) solid var(--color-border);
}

.segmented__option input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}

.segmented__option span {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: var(--size-tapTarget);
  padding: var(--space-xxs) var(--space-xs);
  text-align: center;
  font-size: var(--fontSize-small);
  font-weight: 600;
  line-height: var(--lineHeight-tight);
}

.segmented--list .segmented__option span {
  place-items: center start;
  text-align: left;
  font-size: var(--fontSize-body);
  font-weight: 500;
  padding-left: calc(var(--space-lg) + var(--space-xs));
}

.segmented--list .segmented__option span::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 50%;
  width: 18px;
  height: 18px;
  margin-top: -9px;
  border: 2px solid var(--color-borderStrong);
  border-radius: 50%;
}

.segmented__option input:focus-visible + span {
  outline: 2px solid var(--color-focus);
  outline-offset: -4px;
}

.segmented__option input:checked + span {
  background: var(--color-accent);
  color: var(--color-onAccent);
}

.segmented--list .segmented__option input:checked + span {
  background: transparent;
  color: var(--color-accent);
}

.segmented--list .segmented__option input:checked + span::before {
  border-color: var(--color-accent);
  background: radial-gradient(circle, var(--color-accent) 0 4px, transparent 5px);
}

/* Stepper */

.stepper__row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.stepper__btn,
.icon-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--size-tapTarget);
  height: var(--size-tapTarget);
  border: var(--size-rule) solid var(--color-borderStrong);
  border-radius: var(--radius-control);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
}

.icon-btn {
  border-color: transparent;
}

.stepper__btn:disabled {
  color: var(--color-textMuted);
  border-color: var(--color-border);
  cursor: default;
}

.stepper__input {
  width: 6.5rem;
  text-align: center;
  font-weight: 600;
}

.stepper__unit {
  color: var(--color-accent);
  font-weight: 600;
}

/* Checkbox line */

.check {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  min-height: var(--size-line);
  padding: var(--space-sm) 0;
  border-bottom: var(--size-rule) solid var(--color-border);
  cursor: pointer;
}

.check input {
  flex: none;
  width: 22px;
  height: 22px;
  margin: 1px 0 0;
}

.check__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.check__label {
  font-weight: 600;
}

/* Buttons */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  min-height: 48px;
  padding: 0 var(--space-md);
  border: 2px solid var(--color-text);
  border-radius: var(--radius-control);
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--easing-standard);
}

.btn--wide {
  width: 100%;
}

.btn--primary {
  background: var(--color-text);
  color: var(--color-background);
}

.btn--secondary {
  border-color: var(--color-borderStrong);
  border-width: var(--size-rule);
}

.btn--danger {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-onDanger);
}

.btn--quiet {
  min-height: var(--size-tapTarget);
  padding: 0 var(--space-xs);
  border-color: transparent;
  background: transparent;
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.btn:disabled {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-textMuted);
  cursor: not-allowed;
}

.btn:not(:disabled):active {
  transform: translateY(1px);
}

.btn__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Rubber-stamp chips */

.stamp {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  max-width: 100%;
  padding: 0 var(--space-xs);
  border: 2px solid currentColor;
  border-radius: 2px;
  font-family: var(--font-display);
  font-size: var(--fontSize-label);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stamp--ink {
  color: var(--color-text);
}

.stamp--red {
  color: var(--color-danger);
}

.stamp--green {
  color: var(--color-success);
}

.stamp--blue {
  color: var(--color-accent);
}

.stamp--amber {
  color: var(--color-warning);
}

.stamp--filled.stamp--red {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: var(--color-onDanger);
}

.stamp--filled.stamp--green {
  background: var(--color-success);
  border-color: var(--color-success);
  color: var(--color-onSuccess);
}

.stamp--filled.stamp--ink {
  background: var(--color-text);
  border-color: var(--color-text);
  color: var(--color-background);
}

/* Postmark rings: solid, dashed, struck */

.postmark {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: var(--size-postmark);
  height: var(--size-postmark);
  color: var(--color-success);
}

.postmark svg {
  position: absolute;
  inset: 0;
  fill: none;
  stroke: currentColor;
}

.postmark__ring {
  stroke-width: 2;
}

.postmark__inner {
  stroke-width: 1;
}

.postmark--stale {
  color: var(--color-warning);
}

.postmark--stale .postmark__ring,
.postmark--stale .postmark__inner {
  stroke-dasharray: 4 3;
}

.postmark--never {
  color: var(--color-textMuted);
}

.postmark__strike {
  stroke-width: 2;
  stroke-linecap: round;
}

.postmark__date {
  position: relative;
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
  width: 24px;
}

.postmark--stamping {
  animation: postmark-stamp var(--duration-stamp) var(--easing-stamp);
}

@keyframes postmark-stamp {
  from {
    transform: scale(1.06);
    opacity: 0.4;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Banners */

.banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: var(--size-line);
  padding: var(--space-xs) 0;
  border-top: 2px solid var(--color-danger);
  border-bottom: 2px solid var(--color-danger);
}

.banner--note {
  border-color: var(--color-borderStrong);
}

.banner__text {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.banner--danger .banner__text {
  color: var(--color-danger);
}

/* Sheet: the one element with elevation */

.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 88dvh;
  margin: auto auto 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  background: var(--color-background);
  color: var(--color-text);
  box-shadow: 0 -8px 28px rgb(0 0 0 / 0.22);
  overflow: hidden;
}

.sheet[open] {
  display: flex;
  flex-direction: column;
  animation: sheet-in var(--duration-base) var(--easing-standard);
}

.sheet::backdrop {
  background: rgb(0 0 0 / 0.45);
}

@keyframes sheet-in {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
}

.sheet__head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md);
  border-bottom: var(--size-rule) solid var(--color-text);
}

.sheet__title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-size: var(--fontSize-title);
  font-weight: 700;
  line-height: var(--lineHeight-tight);
}

.sheet__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.sheet__text {
  max-width: 60ch;
}

.sheet__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md) calc(var(--space-md) + env(safe-area-inset-bottom));
  border-top: var(--size-rule) solid var(--color-border);
}

/* Toast */

.toast-region {
  position: fixed;
  inset: auto 0 calc(var(--size-tapTarget) + var(--space-xl) * 2 + env(safe-area-inset-bottom));
  z-index: 20;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-md);
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  max-width: 100%;
  min-height: var(--size-tapTarget);
  padding: var(--space-xs) var(--space-md);
  border: var(--size-rule) solid var(--color-text);
  border-radius: var(--radius-control);
  background: var(--color-text);
  color: var(--color-background);
  font-weight: 600;
  text-align: left;
  animation: toast-in var(--duration-base) var(--easing-standard);
}

@keyframes toast-in {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
}

/* Lists of entries (sync sheet, admin) */

.entry {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: var(--size-line);
  padding: var(--space-xs) 0;
  border-bottom: var(--size-rule) solid var(--color-border);
}

.entry__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.entry__actions {
  display: flex;
  gap: var(--space-xs);
}

.empty {
  color: var(--color-textMuted);
  padding: var(--space-sm) 0;
}

.update {
  position: fixed;
  inset: auto 0 0;
  z-index: 30;
  padding: 0 var(--space-md) env(safe-area-inset-bottom);
  background: var(--color-background);
}

.entry__note {
  display: block;
  color: var(--color-textMuted);
  font-size: var(--fontSize-small);
}

.note {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  padding: var(--space-sm) 0;
  border-top: var(--size-rule) solid var(--color-text);
  border-bottom: var(--size-rule) solid var(--color-text);
}

.home-admin {
  display: flex;
}

/* Reduced motion: nothing moves; the stamp lands as a 120 ms fade. */
@media (prefers-reduced-motion: reduce) {
  .btn,
  .btn:not(:disabled):active {
    transition: none;
    transform: none;
  }

  .syncmark--busy .syncmark__ring,
  .sheet[open],
  .toast {
    animation: none;
  }

  .postmark--stamping {
    animation: postmark-fade var(--duration-fast) linear;
  }

  @keyframes postmark-fade {
    from {
      opacity: 0.2;
    }
    to {
      opacity: 1;
    }
  }
}
```

- [ ] **Step 3: Write the form controls**

`apps/web/src/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  /** Full width, for the pinned action and sheet actions. */
  wide?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

/** Ink primary, outlined secondary, stamp-red destructive, and a quiet text button. */
export function Button({ variant = "secondary", wide = false, icon, children, ...rest }: Props) {
  const cls = ["btn", `btn--${variant}`, wide ? "btn--wide" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={cls}>
      {icon}
      <span className="btn__label">{children}</span>
    </button>
  );
}
```

`apps/web/src/ui/Field.tsx`:

```tsx
import { type ReactNode, useId } from "react";

type FieldProps = {
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
  /** "Optional" suffix on a screen that mixes required and optional fields. */
  optional?: string | undefined;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
};

/**
 * One line of the divided back: the printed label on the rule, the entered
 * value under it in ballpoint blue, helper or error text below.
 */
export function Field({ label, helper, error, optional, children }: FieldProps) {
  const inputId = useId();
  const helpId = useId();
  const describedBy = error !== undefined || helper !== undefined ? helpId : undefined;
  return (
    <div className={`field${error === undefined ? "" : " field--error"}`}>
      <label className="label field__label" htmlFor={inputId}>
        {label}
        {optional === undefined ? null : <span className="field__optional">{optional}</span>}
      </label>
      {children({ inputId, describedBy })}
      {error !== undefined ? (
        <p className="field__error" id={helpId}>
          {error}
        </p>
      ) : helper !== undefined ? (
        <p className="field__helper" id={helpId}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string | undefined;
  error?: string | undefined;
  optional?: string | undefined;
  placeholder?: string | undefined;
  multiline?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "url";
  autoComplete?: string;
  maxLength?: number;
};

export function TextField(props: TextFieldProps) {
  return (
    <Field label={props.label} helper={props.helper} error={props.error} optional={props.optional}>
      {({ inputId, describedBy }) =>
        props.multiline === true ? (
          <textarea
            id={inputId}
            className="input input--multiline"
            value={props.value}
            placeholder={props.placeholder}
            aria-describedby={describedBy}
            aria-invalid={props.error !== undefined}
            maxLength={props.maxLength}
            rows={3}
            onChange={(e) => props.onChange(e.currentTarget.value)}
          />
        ) : (
          <input
            id={inputId}
            className="input"
            value={props.value}
            placeholder={props.placeholder}
            aria-describedby={describedBy}
            aria-invalid={props.error !== undefined}
            inputMode={props.inputMode}
            autoComplete={props.autoComplete ?? "off"}
            maxLength={props.maxLength}
            onChange={(e) => props.onChange(e.currentTarget.value)}
          />
        )
      }
    </Field>
  );
}
```

`apps/web/src/ui/Segmented.tsx`:

```tsx
import { useId } from "react";

export type Option<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  value: V | null;
  onChange: (value: V) => void;
  helper?: string | undefined;
  error?: string | undefined;
  /** "row" for up to 4 short options; "list" stacks long options on ruled lines. */
  layout?: "row" | "list";
};

/**
 * One choice from a few. Native radios underneath, so arrow keys, forms, and
 * screen readers behave as usual; the chosen option is inked in ballpoint blue.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  helper,
  error,
  layout = "row",
}: Props<V>) {
  const name = useId();
  const labelId = useId();
  const helpId = useId();
  return (
    <fieldset
      className={`field segmented segmented--${layout}${error === undefined ? "" : " field--error"}`}
      aria-describedby={helper !== undefined || error !== undefined ? helpId : undefined}
    >
      <legend className="label field__label" id={labelId}>
        {label}
      </legend>
      <div className="segmented__options">
        {options.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {error !== undefined ? (
        <p className="field__error" id={helpId}>
          {error}
        </p>
      ) : helper !== undefined ? (
        <p className="field__helper" id={helpId}>
          {helper}
        </p>
      ) : null}
    </fieldset>
  );
}
```

`apps/web/src/ui/Stepper.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";

type Props = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** A unit after the number, like "%" or "min". */
  suffix?: string;
  helper?: string | undefined;
  error?: string | undefined;
};

/** A number with Less and More buttons, and a keypad field for typing it outright. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  helper,
  error,
}: Props) {
  const inputId = useId();
  const labelId = useId();
  const helpId = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") return onChange(null);
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(clamp(Math.round(n)));
  };
  const bump = (dir: 1 | -1) =>
    onChange(clamp((value ?? (dir > 0 ? min - step : min)) + dir * step));
  return (
    <fieldset className={`field stepper${error === undefined ? "" : " field--error"}`}>
      <legend className="label field__label" id={labelId}>
        {label}
      </legend>
      <div className="stepper__row">
        <button
          type="button"
          className="stepper__btn"
          aria-label={t("common.less")}
          disabled={value !== null && value <= min}
          onClick={() => bump(-1)}
        >
          <Minus aria-hidden="true" size={20} strokeWidth={2.25} />
        </button>
        <input
          id={inputId}
          aria-labelledby={labelId}
          className="input stepper__input"
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          aria-describedby={helper !== undefined || error !== undefined ? helpId : undefined}
          aria-invalid={error !== undefined}
          onChange={(e) => commit(e.currentTarget.value.replace(/[^0-9]/g, ""))}
        />
        {suffix === undefined ? null : (
          <span className="stepper__unit" aria-hidden="true">
            {suffix}
          </span>
        )}
        <button
          type="button"
          className="stepper__btn"
          aria-label={t("common.more")}
          disabled={value !== null && value >= max}
          onClick={() => bump(1)}
        >
          <Plus aria-hidden="true" size={20} strokeWidth={2.25} />
        </button>
      </div>
      {error !== undefined ? (
        <p className="field__error" id={helpId}>
          {error}
        </p>
      ) : helper !== undefined ? (
        <p className="field__helper" id={helpId}>
          {helper}
        </p>
      ) : null}
    </fieldset>
  );
}
```

`apps/web/src/ui/Check.tsx`:

```tsx
type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: string | undefined;
};

/** A yes-or-no line: native checkbox, ruled row, ballpoint tick. */
export function Check({ label, checked, onChange, helper }: Props) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="check__text">
        <span className="check__label">{label}</span>
        {helper === undefined ? null : <span className="field__helper">{helper}</span>}
      </span>
    </label>
  );
}
```

- [ ] **Step 4: Write the marks, sheets, and layout**

`apps/web/src/ui/Sheet.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scrolling body, e.g. the two choices of a confirm. */
  actions?: ReactNode;
};

/**
 * A bottom sheet on the native modal <dialog>: focus moves in and is trapped,
 * Escape and the close button dismiss, and the page behind is inert. The only
 * element in survey mode that casts a shadow.
 */
export function Sheet({ open, title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      // Only Escape and the close button dismiss; closing it from code (a confirm
      // taking over) must not report a dismissal.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="sheet__head">
        <h2 className="sheet__title" id={titleId}>
          {title}
        </h2>
        <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" size={22} strokeWidth={2.25} />
        </button>
      </div>
      <div className="sheet__body">{children}</div>
      {actions === undefined ? null : <div className="sheet__actions">{actions}</div>}
    </dialog>
  );
}

type ConfirmProps = {
  open: boolean;
  title: string;
  body: string;
  action: string;
  cancel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A sheet that asks once before something that cannot be undone. */
export function ConfirmSheet(p: ConfirmProps) {
  return (
    <Sheet
      open={p.open}
      title={p.title}
      onClose={p.onCancel}
      actions={
        <>
          <button
            type="button"
            className={`btn btn--wide ${p.destructive === true ? "btn--danger" : "btn--primary"}`}
            onClick={p.onConfirm}
          >
            <span className="btn__label">{p.action}</span>
          </button>
          <button type="button" className="btn btn--wide btn--secondary" onClick={p.onCancel}>
            <span className="btn__label">{p.cancel}</span>
          </button>
        </>
      }
    >
      <p className="sheet__text">{p.body}</p>
    </Sheet>
  );
}
```

`apps/web/src/ui/Postmark.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

export type PostmarkState = "fresh" | "stale" | "never";

type Props = {
  state: PostmarkState;
  /** Short date inside the ring, e.g. "OCT 5"; empty for never. */
  date: string;
  /** Accessible text, e.g. "Checked Oct 5". */
  label: string;
};

/**
 * Verification as a postmark ring: solid when checked recently, dashed when
 * stale, struck through when never checked. When the date changes the ring
 * lands like a stamp (160 ms press; a 120 ms fade with reduced motion, in CSS).
 */
export function Postmark({ state, date, label }: Props) {
  const previous = useRef(date);
  const [stamping, setStamping] = useState(false);
  useEffect(() => {
    if (previous.current === date) return;
    previous.current = date;
    setStamping(true);
    const timer = setTimeout(() => setStamping(false), 200);
    return () => clearTimeout(timer);
  }, [date]);
  return (
    <span
      className={`postmark postmark--${state}${stamping ? " postmark--stamping" : ""}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="postmark__ring" cx="18" cy="18" r="16" />
        <circle className="postmark__inner" cx="18" cy="18" r="12.5" />
        {state === "never" ? (
          <line className="postmark__strike" x1="6" y1="30" x2="30" y2="6" />
        ) : null}
      </svg>
      {state === "never" ? null : <span className="postmark__date">{date}</span>}
    </span>
  );
}
```

`apps/web/src/ui/StampChip.tsx`:

```tsx
import type { ReactNode } from "react";

export type StampTone = "ink" | "red" | "green" | "blue" | "amber";

/** A rubber-stamp status mark: outlined by default, filled for the state that matters most. */
export function StampChip(props: { tone: StampTone; filled?: boolean; children: ReactNode }) {
  return (
    <span className={`stamp stamp--${props.tone}${props.filled === true ? " stamp--filled" : ""}`}>
      {props.children}
    </span>
  );
}
```

`apps/web/src/ui/RuledRow.tsx`:

```tsx
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  label: string;
  /** What is filled in, in ballpoint blue; or a status in its own tone. */
  value?: ReactNode;
  tone?: "value" | "missing" | "muted";
  trailing?: ReactNode;
  /** Where the row goes. Without one the row is a plain line. */
  link?: LinkProps;
};

/** A 44 px ruled line: printed label left, entry under it, a mark at the right. */
export function RuledRow({ label, value, tone = "value", trailing, link }: Props) {
  const body = (
    <>
      <span className="ruled__text">
        <span className="ruled__label">{label}</span>
        {value === undefined ? null : (
          <span className={`ruled__value ruled__value--${tone}`}>{value}</span>
        )}
      </span>
      {trailing}
    </>
  );
  return (
    <li className="ruled">
      {link === undefined ? (
        <div className="ruled__static">{body}</div>
      ) : (
        <Link {...link} className="ruled__link">
          {body}
          <ChevronRight className="ruled__chevron" aria-hidden="true" size={18} strokeWidth={2} />
        </Link>
      )}
    </li>
  );
}
```

`apps/web/src/ui/Toast.tsx`:

```tsx
/** One short confirmation at a time, announced politely, above the pinned action. */
export function Toast(props: {
  message: { text: string; key: number } | null;
  onDismiss: () => void;
}) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {props.message === null ? null : (
        <button key={props.message.key} type="button" className="toast" onClick={props.onDismiss}>
          {props.message.text}
        </button>
      )}
    </div>
  );
}
```

`apps/web/src/ui/Banner.tsx`:

```tsx
import type { ReactNode } from "react";

/** A line that needs the surveyor: a stamp-red rule above and below, the action on the right. */
export function Banner(props: {
  children: ReactNode;
  action?: ReactNode;
  tone?: "danger" | "note";
}) {
  return (
    <div className={`banner banner--${props.tone ?? "danger"}`} role="status">
      <p className="banner__text">{props.children}</p>
      {props.action}
    </div>
  );
}
```

`apps/web/src/ui/HeaderBand.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  back?: LinkProps;
  /** Usually the sync postmark. */
  trailing?: ReactNode;
};

/**
 * The printed heading band, solid ink like "POST CARD" on a real card. Its
 * content uses onShell and focusOnShell only; status colors never sit on it.
 */
export function HeaderBand({ title, back, trailing }: Props) {
  return (
    <header className="band">
      {back === undefined ? (
        <span className="band__spacer" />
      ) : (
        <Link
          {...back}
          className="band__back"
          aria-label={t("common.back")}
          activeOptions={{ exact: true }}
        >
          <ArrowLeft aria-hidden="true" size={22} strokeWidth={2.25} />
        </Link>
      )}
      <h1 className="band__title">{title}</h1>
      {trailing}
    </header>
  );
}
```

`apps/web/src/ui/Screen.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * The sheet of card stock under the header band. `action` is pinned 16 px above
 * the home indicator, within thumb reach, and the content scrolls clear of it.
 */
export function Screen(props: { children: ReactNode; action?: ReactNode }) {
  return (
    <>
      <main className={`screen${props.action === undefined ? "" : " screen--with-action"}`}>
        {props.children}
      </main>
      {props.action === undefined ? null : <div className="pinned">{props.action}</div>}
    </>
  );
}

/** A small-caps group heading over ruled rows. */
export function GroupHeading(props: { children: ReactNode; id?: string }) {
  return (
    <h2 className="group-heading" id={props.id}>
      {props.children}
    </h2>
  );
}
```

`apps/web/src/lib/format.ts`:

```ts
import {
  type OverviewSection,
  type PlainCopyId,
  plural,
  type SyncHeader,
  t,
  type WriteRecord,
} from "@study-spot/ui-logic";
import type { PostmarkState } from "../ui/Postmark.tsx";

/** A check older than this reads as stale (dashed ring): about one term. */
export const STALE_AFTER_DAYS = 90;
const DAY_MS = 86_400_000;

export function postmarkState(verifiedAt: string | null, now: Date): PostmarkState {
  if (verifiedAt === null) return "never";
  return now.getTime() - Date.parse(verifiedAt) > STALE_AFTER_DAYS * DAY_MS ? "stale" : "fresh";
}

/** "Oct 5", in the campus time zone. */
export function shortDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(
    new Date(iso),
  );
}

/** "Oct 15, 3:40 PM", in the campus time zone. */
export function dateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

const SECTION_NAME = {
  identity: "section.identity.name",
  access: "section.access.name",
  hours: "section.hours.name",
  seating: "section.seating.name",
  power: "section.power.name",
  environment: "section.environment.name",
  use_fit: "section.use_fit.name",
  amenities: "section.amenities.name",
  accessibility: "section.accessibility.name",
  late_night: "section.late_night.name",
  estimates: "section.estimates.name",
  photos: "section.photos.name",
} as const satisfies Record<OverviewSection, PlainCopyId>;

export function sectionName(section: OverviewSection): string {
  return t(SECTION_NAME[section]);
}

/** The header postmark's short text; the sync sheet carries the long forms. */
export function headerText(h: SyncHeader): string {
  switch (h.kind) {
    case "signed_out":
      return t("sync.short.signed_out");
    case "failed":
      return t("sync.short.failed", { count: h.count });
    case "unreadable":
      return t("sync.short.unreadable", { count: h.count });
    case "offline":
      return t("sync.short.offline");
    case "syncing":
      return t("sync.syncing", { count: h.count });
    case "pending":
      return t("sync.short.pending", { count: h.count });
    case "all_synced":
      return t("sync.all_synced");
  }
}

/** The long form for the top of the sync sheet. */
export function headerLong(h: SyncHeader): string {
  switch (h.kind) {
    case "signed_out":
      return t("auth.expired.title");
    case "failed":
      return t("sync.failed", { count: h.count });
    case "unreadable":
      return plural(h.count, "sync.unreadable_one", "sync.unreadable");
    case "offline":
      return t("sync.offline");
    case "syncing":
      return t("sync.syncing", { count: h.count });
    case "pending":
      return t("sync.pending", { count: h.count });
    case "all_synced":
      return t("sync.all_synced");
  }
}

/** "Power and signal for SAC Lounge": what a queued write is, for the sync sheet. */
export function whatOf(r: WriteRecord, name: string): string {
  switch (r.kind) {
    case "spot.create":
      return t("sync.what.create", { name });
    case "spot.section":
      return t("sync.what.section", { section: sectionName(r.payload.section), name });
    case "spot.verify":
      return t("sync.what.verify", { name });
    case "spot.publish":
      return t("sync.what.publish", { name });
    case "spot.review":
      return t("sync.what.review", { name });
    case "photo.upload":
      return t("sync.what.photo", { name });
    case "photo.cover":
      return t("sync.what.cover", { name });
  }
}
```

`apps/web/src/ui/SyncPostmark.tsx`:

```tsx
import type { SyncHeader } from "@study-spot/ui-logic";
import { headerText } from "../lib/format.ts";

/**
 * The header's sync postmark: a small cancellation ring and a short status.
 * Waves mean waiting, a filled dot means trouble; text says which. Tapping it
 * opens the sheet of changes on this phone.
 */
export function SyncPostmark(props: { header: SyncHeader; onOpen: () => void }) {
  const { header } = props;
  const trouble =
    header.kind === "failed" || header.kind === "unreadable" || header.kind === "signed_out";
  const idle = header.kind === "all_synced";
  return (
    <button
      type="button"
      className={`syncmark${trouble ? " syncmark--trouble" : ""}${header.kind === "syncing" ? " syncmark--busy" : ""}`}
      onClick={props.onOpen}
      aria-haspopup="dialog"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="syncmark__ring">
        <circle cx="10" cy="10" r="8.5" />
        {idle ? (
          <path d="M6 10.5l2.5 2.5L14 7.5" />
        ) : trouble ? (
          <circle cx="10" cy="10" r="3.5" className="syncmark__dot" />
        ) : (
          <path d="M4.5 8.5c1.8-1.4 3.7 1.4 5.5 0s3.7-1.4 5.5 0M4.5 11.5c1.8-1.4 3.7 1.4 5.5 0s3.7-1.4 5.5 0" />
        )}
      </svg>
      <span className="syncmark__text">{headerText(header)}</span>
    </button>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (8 component tests).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass, and Biome reports no descending-specificity or `!important` findings in `styles.css`.

```bash
git add apps/web/src/ui apps/web/src/lib apps/web/test/components.test.tsx
git commit -m "feat(web): add the divided back components and survey styles"
```

### Task 7: App wiring, persisted server cache, and the React hooks

`createAppDeps` builds every adapter once and hands them to the shared logic: the API client (token read from the session on each call), the outbox (Web Locks, liveness, BroadcastChannel, started at once), and a TanStack Query client whose survey queries persist to IndexedDB. `serverCache.ts` is decision 18c: `newerSpot` and `mergeList` keep the higher version on every refetch, `applyServerSpot` merges each `onApplied` answer into the detail and the list row, and `sanitizePersisted` drops any restored query that fails its Zod schema. The hooks wrap `useSyncExternalStore` around the outbox, the session, the network, and auth, and `ToastProvider` ties toasts to writes leaving the queue (18d).

**Files:**
- Create: `apps/web/src/app/keys.ts`, `queries.ts`, `serverCache.ts`, `authState.ts`, `sessionState.ts`, `deps.ts`, `AppProvider.tsx`
- Create: `apps/web/src/hooks/useOutbox.ts`, `useSession.ts`, `useOnline.ts`, `useQueries.ts`, `useSurveyHome.ts`, `useToasts.tsx`
- Create: `apps/web/test/harness.tsx`, `apps/web/test/serverCache.test.ts`, `apps/web/test/toasts.test.tsx`

**Interfaces:**
- Produces: `keys` (`list`, `spot(id)`, `spotPrefix`, `campus`, `surveyors`, `publish`, `pendingPhotos`); `class ApiFailure extends Error { kind }`; `unwrap<T>(result: ApiResult<T>, onUnauthorized): T`; `listQuery(d)`, `spotQuery(d, id)` (disabled for `local:` ids), `campusQuery(d)`; `type QueryDeps = { api: SurveyApi; onUnauthorized: () => void }`.
- Produces: `newerSpot(old, next)`, `summaryOf(spot, prev, buildingName)`, `mergeList(old, next)`, `applyServerSpot(qc, spot)`, `sanitizePersisted(raw): PersistedClient`.
- Produces: `type AppDeps = { api, session: SessionState, auth: AuthState, outbox, started: Promise<void>, queryClient, persister, cache, blobs, network, geolocation, share, clock, apiBaseUrl, dataBaseUrl }`; `createAppDeps({ apiBaseUrl, dataBaseUrl })`; `createQueryClient()`; `CACHE_MAX_AGE_MS`, `CACHE_BUSTER`; `AppProvider({ deps, children })`, `useDeps()`.
- Produces (hooks): `useOutboxSnapshot()`, `useSyncHeader()`, `useSession(): { me, signedOut, join(accepted): boolean }`, `useOnline()`, `useSpotList()`, `useServerSpot(id)`, `useCampus()`, `useCampusTz()`, `useQueryDeps()`, `useSurveyHome(): { home, noList, refreshing }`, `ToastProvider`, `useToasts(): { show(text), track(clientWriteId, { done, waiting }) }`, `SETTLE_WAIT_MS = 3_000`, `TOAST_MS = 4_000`.
- Produces (tests): `testApp({ spots?, me?, now? }): TestApp`, `renderApp(app, ui)`, `renderRoute(app, path)`, `TestServer` (the `ui-logic` fake server plus `GET /survey/spots`, `GET /survey/campus`, `POST .../unpublish`), `ME`, `CAMPUS`, `API`, `TOKEN`, `summary(spot)`.
- Consumes: Task 5 adapters; `createOutbox`, `createSurveyApi`, `createSessionStore`, `surveyHome`, `syncHeader` from `ui-logic`; `FakeSurveyServer` and fakes from `packages/ui-logic/test`.

- [ ] **Step 1: Write the test harness and the failing tests**

`apps/web/test/harness.tsx` (part 3 adds admin routes to `TestServer`):

```tsx
import type {
  CampusInfo,
  SpotList,
  SpotSummary,
  SurveyorPublic,
  SurveySpot,
} from "@study-spot/core";
import {
  createOutbox,
  createSessionStore,
  createSurveyApi,
  type FetchResponse,
  type Http,
  type HttpRequest,
} from "@study-spot/ui-logic";
import type { Persister } from "@tanstack/react-query-persist-client";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { FakeSurveyServer } from "../../../packages/ui-logic/test/fakeServer.ts";
import {
  FakeForeground,
  FakeNetwork,
  FakeTimers,
  MemoryBinary,
  MemoryCache,
  MemoryStorage,
  mutableClock,
  sequentialIds,
} from "../../../packages/ui-logic/test/fakes.ts";
import { AppProvider } from "../src/app/AppProvider.tsx";
import { createAuthState } from "../src/app/authState.ts";
import { type AppDeps, createQueryClient } from "../src/app/deps.ts";
import { applyServerSpot } from "../src/app/serverCache.ts";
import { createSessionState } from "../src/app/sessionState.ts";
import { routeTree } from "../src/routeTree.gen.ts";

export const API = "https://api.example";
export const TOKEN = "a".repeat(43);
export const ME: SurveyorPublic = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  display_name: "Ana",
  role: "surveyor",
  active: true,
};
export const CAMPUS: CampusInfo = {
  campus: { id: "sbu", name: "Stony Brook University", tz: "America/New_York" },
  buildings: [
    { id: "melville-library", name: "Melville Library", lat: 40.9154, lng: -73.1222 },
    { id: "sac", name: "Student Activities Center", lat: 40.9146, lng: -73.1236 },
  ],
};

export function summary(spot: SurveySpot): SpotSummary {
  return {
    id: spot.id,
    slug: spot.slug,
    official_name: spot.official_name,
    common_name: spot.common_name,
    building_id: spot.building_id,
    building_name: "Melville Library",
    status: spot.status,
    review_state: spot.review_state,
    version: spot.version,
    last_edited_by: spot.last_edited_by,
    last_edited_by_name: spot.last_edited_by_name,
    updated_at: spot.updated_at,
    oldest_verified_at: Object.values(spot.verified).sort()[0] ?? null,
    hours_confirmed: spot.hours.length > 0,
  };
}

/** Plan A's routes in memory: the ui-logic fake server plus the list and campus reads. */
export class TestServer implements Http {
  readonly inner: FakeSurveyServer;
  offline = false;
  unauthorized = false;
  readonly reads: string[] = [];
  constructor(spots: SurveySpot[]) {
    this.inner = new FakeSurveyServer(spots);
  }
  list(): SpotList {
    return {
      term: { id: "2026-fall", name: "Fall 2026" },
      spots: [...this.inner.spots.values()].map(summary),
    };
  }
  async send(req: HttpRequest): Promise<FetchResponse> {
    if (this.offline) throw new Error("network down");
    const path = req.url.slice(API.length);
    if (this.unauthorized) return { status: 401, text: '{"error":"unauthorized"}' };
    if (req.method === "GET") this.reads.push(path);
    if (req.method === "GET" && path === "/survey/spots") {
      return { status: 200, text: JSON.stringify(this.list()) };
    }
    if (req.method === "GET" && path === "/survey/campus") {
      return { status: 200, text: JSON.stringify(CAMPUS) };
    }
    const unpublish = /^\/survey\/spots\/([^/]+)\/unpublish$/.exec(path);
    if (unpublish?.[1] !== undefined && req.method === "POST") {
      const spot = { ...this.inner.spot(unpublish[1]), status: "draft" as const };
      this.inner.spots.set(spot.id, spot);
      return { status: 200, text: JSON.stringify(spot) };
    }
    return this.inner.send(req);
  }
}

const noPersister: Persister = {
  persistClient: async () => {},
  restoreClient: async () => undefined,
  removeClient: async () => {},
};

export type TestApp = {
  deps: AppDeps;
  server: TestServer;
  network: FakeNetwork;
  timers: FakeTimers;
  clock: ReturnType<typeof mutableClock>;
  cache: MemoryCache;
};

/** App dependencies on fakes: in-memory storage, the fake server, manual timers. */
export function testApp(
  opts: { spots?: SurveySpot[]; me?: SurveyorPublic | null; now?: string } = {},
): TestApp {
  const server = new TestServer(opts.spots ?? []);
  const cache = new MemoryCache();
  const blobs = new MemoryBinary();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const clock = mutableClock(opts.now ?? "2026-10-13T18:00:00Z");
  const session = createSessionState(createSessionStore(new MemoryStorage()));
  const me = opts.me === undefined ? ME : opts.me;
  if (me !== null) session.save({ token: TOKEN, surveyor: me });
  const api = createSurveyApi({ http: server, baseUrl: API, token: () => session.token() });
  const outbox = createOutbox({
    cache,
    blobs,
    api,
    clock,
    ids: sequentialIds("9000"),
    timers,
    network,
    foreground: new FakeForeground(),
  });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  outbox.onApplied((spot) => applyServerSpot(queryClient, spot));
  const deps: AppDeps = {
    api,
    session,
    auth: createAuthState(),
    outbox,
    started: outbox.start(),
    queryClient,
    persister: noPersister,
    cache,
    blobs,
    network,
    geolocation: { current: async () => null },
    share: { share: async () => "copied" },
    clock,
    apiBaseUrl: API,
    dataBaseUrl: "https://data.example",
  };
  return { deps, server, network, timers, clock, cache };
}

export function renderApp(app: TestApp, ui: ReactNode): RenderResult {
  return render(<AppProvider deps={app.deps}>{ui}</AppProvider>);
}

/** The real route tree at `path`, on fakes, as a phone would open it. */
export function renderRoute(app: TestApp, path: string): RenderResult & { router: TestRouter } {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const result = render(
    <AppProvider deps={app.deps}>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { ...result, router };
}
type TestRouter = ReturnType<typeof createRouter<typeof routeTree>>;
```

`apps/web/test/serverCache.test.ts`:

```ts
import type { SpotList, SurveySpot } from "@study-spot/core";
import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { keys } from "../src/app/keys.ts";
import {
  applyServerSpot,
  mergeList,
  newerSpot,
  sanitizePersisted,
} from "../src/app/serverCache.ts";
import { CAMPUS, summary } from "./harness.tsx";

const v = (version: number, over: Partial<SurveySpot> = {}) =>
  surveySpotFixture({ version, ...over });

test("a spot is never replaced by an older version", () => {
  expect(newerSpot(v(5), v(4)).version).toBe(5);
  expect(newerSpot(v(4), v(5)).version).toBe(5);
  expect(newerSpot(undefined, v(2)).version).toBe(2);
});

test("a refetched list keeps rows this phone holds at a newer version", () => {
  const old: SpotList = { term: null, spots: [summary(v(6, { official_name: "Mine" }))] };
  const next: SpotList = {
    term: { id: "t", name: "T" },
    spots: [summary(v(5, { official_name: "Stale" }))],
  };
  const merged = mergeList(old, next);
  expect(merged.term).toEqual({ id: "t", name: "T" });
  expect(merged.spots.map((s) => [s.official_name, s.version])).toEqual([["Mine", 6]]);
});

test("an applied write updates the detail and the list row, never lowering either", () => {
  const qc = new QueryClient();
  qc.setQueryData(keys.campus, CAMPUS);
  qc.setQueryData<SpotList>(keys.list, { term: null, spots: [summary(v(3))] });
  applyServerSpot(qc, v(4, { official_name: "Renamed", hours: [] }));
  expect(qc.getQueryData<SurveySpot>(keys.spot(v(4).id))?.version).toBe(4);
  const row = qc.getQueryData<SpotList>(keys.list)?.spots[0];
  expect(row).toMatchObject({ version: 4, official_name: "Renamed", hours_confirmed: false });
  expect(row?.building_name).toBe("Melville Library");
  applyServerSpot(qc, v(3, { official_name: "Old" }));
  expect(qc.getQueryData<SurveySpot>(keys.spot(v(4).id))?.official_name).toBe("Renamed");
  expect(qc.getQueryData<SpotList>(keys.list)?.spots[0]?.official_name).toBe("Renamed");
});

test("a spot created on this phone joins the cached list once the server has it", () => {
  const qc = new QueryClient();
  qc.setQueryData<SpotList>(keys.list, { term: null, spots: [] });
  applyServerSpot(qc, v(1, { building_id: "sac" }));
  qc.setQueryData(keys.campus, CAMPUS);
  expect(qc.getQueryData<SpotList>(keys.list)?.spots).toHaveLength(1);
});

test("persisted queries are checked on restore: damaged or unknown ones are dropped", () => {
  const good = { queryKey: ["survey", "spot", v(3).id], queryHash: "a", state: { data: v(3) } };
  const damaged = { queryKey: ["survey", "spot", "x"], queryHash: "b", state: { data: { id: 1 } } };
  const admin = {
    queryKey: ["admin", "surveyors"],
    queryHash: "c",
    state: { data: { surveyors: [] } },
  };
  const restored = sanitizePersisted({
    timestamp: 5,
    buster: "survey-1",
    clientState: { mutations: [], queries: [good, damaged, admin] },
  });
  expect(restored.clientState.queries.map((q) => q.queryHash)).toEqual(["a"]);
  expect(restored.buster).toBe("survey-1");
  expect(sanitizePersisted("garbage").clientState.queries).toEqual([]);
  expect(sanitizePersisted({ timestamp: 1 }).clientState.queries).toEqual([]);
});
```

`apps/web/test/toasts.test.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { act, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { POWER } from "../../../packages/ui-logic/test/builders.ts";
import { useToasts } from "../src/hooks/useToasts.tsx";
import { renderApp, testApp } from "./harness.tsx";

const SPOT = surveySpotFixture({ version: 3 });
let api: ReturnType<typeof useToasts> | null = null;
function Grab() {
  api = useToasts();
  return null;
}

test("a write that leaves the queue toasts Saved; offline says it is on the phone", async () => {
  const app = testApp({ spots: [SPOT] });
  renderApp(app, <Grab />);
  await app.deps.started;
  const id = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    3,
  );
  act(() => api?.track(id, { done: "editor.saved", waiting: "editor.saved_offline" }));
  await act(() => app.deps.outbox.idle());
  expect(await screen.findByText(t("editor.saved"))).toBeTruthy();

  app.network.set(false);
  const queued = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    4,
  );
  act(() => api?.track(queued, { done: "editor.saved", waiting: "editor.saved_offline" }));
  expect(await screen.findByText(t("editor.saved_offline"))).toBeTruthy();
});

test("a write that fails gets no success toast", async () => {
  const app = testApp({ spots: [SPOT] });
  app.server.inner.failWith.push(422);
  renderApp(app, <Grab />);
  await app.deps.started;
  const id = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    3,
  );
  act(() => api?.track(id, { done: "editor.saved", waiting: "editor.saved_offline" }));
  await act(() => app.deps.outbox.idle());
  await act(() => new Promise((r) => setTimeout(r, 600)));
  expect(screen.queryByText(t("editor.saved"))).toBeNull();
  expect(app.deps.outbox.getSnapshot().records[0]?.state).toBe("failed");
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL, the `src/app` and `src/hooks` modules do not exist.

- [ ] **Step 2: Write the query layer and the cache rules**

`apps/web/src/app/keys.ts`:

```ts
/** TanStack Query keys. Survey keys are persisted to IndexedDB; admin keys never are. */
export const keys = {
  list: ["survey", "spots"] as const,
  spot: (id: string) => ["survey", "spot", id] as const,
  spotPrefix: ["survey", "spot"] as const,
  campus: ["survey", "campus"] as const,
  surveyors: ["admin", "surveyors"] as const,
  publish: ["admin", "publish"] as const,
  pendingPhotos: ["admin", "photos"] as const,
};
```

`apps/web/src/app/serverCache.ts`:

```ts
import {
  CampusInfo,
  type SpotList,
  SpotList as SpotListSchema,
  type SpotSummary,
  SurveySpot,
} from "@study-spot/core";
import type { QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { z } from "zod";
import { keys } from "./keys.ts";

/**
 * The server copy this phone keeps (decision 18): never replace a spot with an
 * older version, whether the older one comes from a refetch that raced a write,
 * a replayed answer, or another tab's persisted snapshot.
 */
export function newerSpot(old: SurveySpot | undefined, next: SurveySpot): SurveySpot {
  return old !== undefined && old.id === next.id && old.version > next.version ? old : next;
}

function oldestVerified(spot: SurveySpot): string | null {
  const dates = Object.values(spot.verified).filter((d): d is string => d !== undefined);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

/** The list row for a spot the server returned, keeping what only the list knows. */
export function summaryOf(
  spot: SurveySpot,
  prev: SpotSummary | undefined,
  buildingName: string | undefined,
): SpotSummary {
  return {
    id: spot.id,
    slug: spot.slug,
    official_name: spot.official_name,
    common_name: spot.common_name,
    building_id: spot.building_id,
    building_name:
      prev?.building_id === spot.building_id
        ? prev.building_name
        : (buildingName ?? prev?.building_name ?? spot.building_id),
    status: spot.status,
    review_state: spot.review_state,
    version: spot.version,
    last_edited_by: spot.last_edited_by,
    last_edited_by_name: spot.last_edited_by_name,
    updated_at: spot.updated_at,
    oldest_verified_at: oldestVerified(spot),
    hours_confirmed: spot.hours.length > 0,
  };
}

/** A fetched list, with any row this phone already holds at a newer version kept. */
export function mergeList(old: SpotList | undefined, next: SpotList): SpotList {
  if (old === undefined) return next;
  const held = new Map(old.spots.map((s) => [s.id, s]));
  return {
    term: next.term,
    spots: next.spots.map((s) => {
      const mine = held.get(s.id);
      return mine !== undefined && mine.version > s.version ? mine : s;
    }),
  };
}

/** Puts a spot the server returned (an applied write, Keep theirs) into the detail and the list. */
export function applyServerSpot(qc: QueryClient, spot: SurveySpot): void {
  qc.setQueryData<SurveySpot>(keys.spot(spot.id), (old) => newerSpot(old, spot));
  const campus = qc.getQueryData<CampusInfo>(keys.campus);
  const buildingName = campus?.buildings.find((b) => b.id === spot.building_id)?.name;
  qc.setQueryData<SpotList>(keys.list, (old) => {
    if (old === undefined) return old;
    const prev = old.spots.find((s) => s.id === spot.id);
    if (prev !== undefined && prev.version > spot.version) return old;
    const row = summaryOf(spot, prev, buildingName);
    return {
      ...old,
      spots:
        prev === undefined
          ? [...old.spots, row]
          : old.spots.map((s) => (s.id === spot.id ? row : s)),
    };
  });
}

const KEY_SCHEMAS: readonly { match: (k: readonly unknown[]) => boolean; schema: z.ZodType }[] = [
  { match: (k) => k[0] === "survey" && k[1] === "spots", schema: SpotListSchema },
  { match: (k) => k[0] === "survey" && k[1] === "spot", schema: SurveySpot },
  { match: (k) => k[0] === "survey" && k[1] === "campus", schema: CampusInfo },
];

const Envelope = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({
    queries: z.array(
      z.looseObject({
        queryKey: z.array(z.unknown()),
        state: z.looseObject({ data: z.unknown() }),
      }),
    ),
  }),
});

const EMPTY: PersistedClient = {
  timestamp: 0,
  buster: "",
  clientState: { mutations: [], queries: [] },
};

/**
 * IndexedDB is a trust boundary: a persisted query from an older app version,
 * or a damaged one, is dropped instead of reaching a screen. Only survey
 * queries are kept; admin data is always fetched fresh.
 */
export function sanitizePersisted(raw: unknown): PersistedClient {
  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) return EMPTY;
  const kept = parsed.data.clientState.queries.filter((q) => {
    const entry = KEY_SCHEMAS.find((e) => e.match(q.queryKey));
    return entry?.schema.safeParse(q.state.data).success === true;
  });
  // The envelope and every kept query's data are checked above; the other fields
  // are TanStack's own dehydrated query state, passed through as stored.
  return {
    timestamp: parsed.data.timestamp,
    buster: parsed.data.buster,
    clientState: { mutations: [], queries: kept },
  } as unknown as PersistedClient;
}
```

`apps/web/src/app/queries.ts`:

```ts
import type { CampusInfo, SpotList, SurveySpot } from "@study-spot/core";
import { type ApiResult, isLocalId, type SurveyApi } from "@study-spot/ui-logic";
import { queryOptions } from "@tanstack/react-query";
import { keys } from "./keys.ts";
import { mergeList, newerSpot } from "./serverCache.ts";

/** A failed read. `unauthorized` sends the app to "Sign in again". */
export class ApiFailure extends Error {
  readonly kind: Exclude<ApiResult<unknown>["kind"], "ok">;
  constructor(kind: Exclude<ApiResult<unknown>["kind"], "ok">) {
    super(`survey api: ${kind}`);
    this.kind = kind;
  }
}

/** The value of an ok result; anything else throws an ApiFailure for TanStack Query. */
export function unwrap<T>(result: ApiResult<T>, onUnauthorized: () => void): T {
  if (result.kind === "ok") return result.value;
  if (result.kind === "unauthorized") onUnauthorized();
  throw new ApiFailure(result.kind);
}

export type QueryDeps = { api: SurveyApi; onUnauthorized: () => void };

// structuralSharing is typed (unknown, unknown) => unknown; the values are this query's own
// queryFn results (or its restored copy, checked by sanitizePersisted), hence the casts.

export const listQuery = (d: QueryDeps) =>
  queryOptions({
    queryKey: keys.list,
    queryFn: async (): Promise<SpotList> => unwrap(await d.api.listSpots(), d.onUnauthorized),
    structuralSharing: (old: unknown, next: unknown) =>
      mergeList(old as SpotList | undefined, next as SpotList),
  });

export const spotQuery = (d: QueryDeps, id: string) =>
  queryOptions({
    queryKey: keys.spot(id),
    queryFn: async (): Promise<SurveySpot> => unwrap(await d.api.getSpot(id), d.onUnauthorized),
    // A draft that only exists on this phone has nothing to fetch.
    enabled: !isLocalId(id),
    structuralSharing: (old: unknown, next: unknown) =>
      newerSpot(old as SurveySpot | undefined, next as SurveySpot),
  });

export const campusQuery = (d: QueryDeps) =>
  queryOptions({
    queryKey: keys.campus,
    queryFn: async (): Promise<CampusInfo> => unwrap(await d.api.campus(), d.onUnauthorized),
    staleTime: 24 * 60 * 60 * 1000,
  });
```

- [ ] **Step 3: Write the session, auth state, wiring, and provider**

`apps/web/src/app/authState.ts`:

```ts
/**
 * Signed-out state from reads (a 401 on the list or a spot). The outbox keeps
 * its own flag for writes; the app is signed out when either says so.
 */
export type AuthState = {
  signedOut(): boolean;
  markSignedOut(): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
};

export function createAuthState(): AuthState {
  let out = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (out === next) return;
    out = next;
    for (const l of listeners) l();
  };
  return {
    signedOut: () => out,
    markSignedOut: () => set(true),
    reset: () => set(false),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

`apps/web/src/app/sessionState.ts`:

```ts
import { SESSION_KEY, type SessionStore, type StoredSession } from "@study-spot/ui-logic";

/** The stored session as an external store, so screens re-render when it changes in any tab. */
export type SessionState = {
  current(): StoredSession | null;
  token(): string | null;
  /** False when storage refused the write (full disk, blocked storage). */
  save(session: StoredSession): boolean;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createSessionState(store: SessionStore, win: Window = window): SessionState {
  let current = store.load();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  win.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== SESSION_KEY) return;
    current = store.load();
    emit();
  });
  return {
    current: () => current,
    token: () => current?.token ?? null,
    save(session) {
      try {
        store.save(session);
      } catch {
        return false;
      }
      current = session;
      emit();
      return true;
    },
    clear() {
      try {
        store.clear();
      } catch {
        // Nothing to do: the in-memory copy is cleared below either way.
      }
      current = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

`apps/web/src/app/deps.ts`:

```ts
import type { SurveySpot } from "@study-spot/core";
import {
  type BinaryCache,
  type Clock,
  createOutbox,
  createSessionStore,
  createSurveyApi,
  type GeolocationAdapter,
  type KeyValueCache,
  type NetworkStatus,
  type Outbox,
  type Share,
  type SurveyApi,
} from "@study-spot/ui-logic";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import {
  browserIds,
  browserTimers,
  createBroadcastSignal,
  createForeground,
  createGeolocation,
  createLocalStorage,
  createNetworkStatus,
  createShare,
  systemClock,
} from "../adapters/browser.ts";
import { createFetchHttp } from "../adapters/http.ts";
import { openStores } from "../adapters/idb.ts";
import { createWebLiveness, createWebLock, type LockApi } from "../adapters/locks.ts";
import { type AuthState, createAuthState } from "./authState.ts";
import { ApiFailure } from "./queries.ts";
import { applyServerSpot, sanitizePersisted } from "./serverCache.ts";
import { createSessionState, type SessionState } from "./sessionState.ts";

export type AppDeps = {
  api: SurveyApi;
  session: SessionState;
  auth: AuthState;
  outbox: Outbox;
  /** The outbox's start(): its first sync pass of this page load has ended once it resolves. */
  started: Promise<void>;
  queryClient: QueryClient;
  persister: Persister;
  cache: KeyValueCache;
  blobs: BinaryCache;
  network: NetworkStatus;
  geolocation: GeolocationAdapter;
  share: Share;
  clock: Clock;
  /** API origin, for the photo image route that the typed client does not cover. */
  apiBaseUrl: string;
  dataBaseUrl: string;
};

/** Thirty days, like a session: the persisted copy outlives a long weekend offline. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Bump when a persisted query's shape changes; old snapshots are then dropped. */
export const CACHE_BUSTER = "survey-1";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Kept for the persisted 30 days. Not CACHE_MAX_AGE_MS: timers overflow past 2^31 ms
        // (24.8 days) and would collect at once; Infinity turns collection off.
        gcTime: Number.POSITIVE_INFINITY,
        // Always look again when a screen mounts; the cached copy shows meanwhile.
        staleTime: 0,
        // Serve the cached copy first; offline reads never block a screen.
        networkMode: "offlineFirst",
        // A refused read will be refused again; only network and server trouble is worth a retry.
        retry: (count, error) =>
          count < 2 &&
          !(
            error instanceof ApiFailure &&
            (error.kind === "unauthorized" || error.kind === "invalid")
          ),
      },
    },
  });
}

/** Wires every browser adapter into the shared logic. Called once in main.tsx. */
export function createAppDeps(env: { apiBaseUrl: string; dataBaseUrl: string }): AppDeps {
  const stores = openStores();
  const session = createSessionState(createSessionStore(createLocalStorage()));
  const auth = createAuthState();
  const network = createNetworkStatus();
  const api = createSurveyApi({
    http: createFetchHttp(),
    baseUrl: env.apiBaseUrl,
    token: () => session.token(),
  });
  // Web Locks are in every browser Perch supports (Safari 15.4+); without them,
  // fall back to the in-process defaults (one tab at a time).
  const locks: LockApi | undefined = "locks" in navigator ? navigator.locks : undefined;
  const outbox = createOutbox({
    cache: stores.cache,
    blobs: stores.blobs,
    api,
    clock: systemClock,
    ids: browserIds,
    timers: browserTimers,
    network,
    foreground: createForeground(),
    ...(locks === undefined
      ? {}
      : { lock: createWebLock(locks), liveness: createWebLiveness(locks, browserIds) }),
    signal: createBroadcastSignal(),
  });
  const queryClient = createQueryClient();
  outbox.onApplied((spot: SurveySpot) => applyServerSpot(queryClient, spot));
  const persister = createAsyncStoragePersister({
    storage: {
      getItem: (key) => stores.cache.get(key),
      setItem: (key, value) => stores.cache.set(key, value),
      removeItem: (key) => stores.cache.delete(key),
    },
    key: "query:survey",
    throttleTime: 250,
    deserialize: (raw) => {
      try {
        return sanitizePersisted(JSON.parse(raw));
      } catch {
        return sanitizePersisted(null);
      }
    },
  });
  return {
    api,
    session,
    auth,
    outbox,
    started: outbox.start(),
    queryClient,
    persister,
    cache: stores.cache,
    blobs: stores.blobs,
    network,
    geolocation: createGeolocation(),
    share: createShare(),
    clock: systemClock,
    apiBaseUrl: env.apiBaseUrl,
    dataBaseUrl: env.dataBaseUrl,
  };
}
```

`apps/web/src/app/AppProvider.tsx`:

```tsx
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createContext, type ReactNode, useContext } from "react";
import { ToastProvider } from "../hooks/useToasts.tsx";
import { type AppDeps, CACHE_BUSTER, CACHE_MAX_AGE_MS } from "./deps.ts";

const DepsContext = createContext<AppDeps | null>(null);

export function AppProvider(props: { deps: AppDeps; children: ReactNode }) {
  const { deps } = props;
  return (
    <DepsContext.Provider value={deps}>
      <PersistQueryClientProvider
        client={deps.queryClient}
        persistOptions={{
          persister: deps.persister,
          maxAge: CACHE_MAX_AGE_MS,
          buster: CACHE_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === "success" && q.queryKey[0] === "survey",
          },
        }}
      >
        <ToastProvider>{props.children}</ToastProvider>
      </PersistQueryClientProvider>
    </DepsContext.Provider>
  );
}

export function useDeps(): AppDeps {
  const deps = useContext(DepsContext);
  if (deps === null) throw new Error("useDeps outside AppProvider");
  return deps;
}
```

- [ ] **Step 4: Write the hooks**

`apps/web/src/hooks/useOutbox.ts`:

```ts
import { type OutboxSnapshot, type SyncHeader, syncHeader } from "@study-spot/ui-logic";
import { useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/** The outbox queue as React state; same object until something changes. */
export function useOutboxSnapshot(): OutboxSnapshot {
  const { outbox } = useDeps();
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);
}

/** What the header postmark says. Reads count as signed out too (a 401 on the list). */
export function useSyncHeader(): SyncHeader {
  const { auth } = useDeps();
  const snapshot = useOutboxSnapshot();
  const readsOut = useSyncExternalStore(auth.subscribe, auth.signedOut);
  return readsOut ? { kind: "signed_out" } : syncHeader(snapshot);
}
```

`apps/web/src/hooks/useOnline.ts`:

```ts
import { useCallback, useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/** navigator.onLine as React state. A hint only: a phone can be "online" with no route to the API. */
export function useOnline(): boolean {
  const { network } = useDeps();
  const subscribe = useCallback((l: () => void) => network.subscribe(() => l()), [network]);
  const get = useCallback(() => network.online(), [network]);
  return useSyncExternalStore(subscribe, get);
}
```

`apps/web/src/hooks/useSession.ts`:

```ts
import type { AcceptInviteResponse, SurveyorPublic } from "@study-spot/core";
import { useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOutboxSnapshot } from "./useOutbox.ts";

export type SessionView = {
  me: SurveyorPublic | null;
  /** No session on this phone, or the server refused it (expired, revoked). */
  signedOut: boolean;
  /** Stores a new session and resumes sync. False when storage refused it. */
  join(accepted: AcceptInviteResponse): boolean;
};

export function useSession(): SessionView {
  const { session, auth, outbox, queryClient } = useDeps();
  const stored = useSyncExternalStore(session.subscribe, session.current);
  const readsOut = useSyncExternalStore(auth.subscribe, auth.signedOut);
  const snapshot = useOutboxSnapshot();
  return {
    me: stored?.surveyor ?? null,
    signedOut: stored === null || readsOut || snapshot.signedOut,
    join(accepted) {
      if (!session.save({ token: accepted.token, surveyor: accepted.surveyor })) return false;
      auth.reset();
      outbox.resume();
      void queryClient.invalidateQueries();
      return true;
    },
  };
}
```

`apps/web/src/hooks/useQueries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useDeps } from "../app/AppProvider.tsx";
import { campusQuery, listQuery, type QueryDeps, spotQuery } from "../app/queries.ts";

export function useQueryDeps(): QueryDeps {
  const { api, auth } = useDeps();
  return { api, onUnauthorized: auth.markSignedOut };
}

export const useSpotList = () => useQuery(listQuery(useQueryDeps()));
export const useServerSpot = (id: string) => useQuery(spotQuery(useQueryDeps(), id));
export const useCampus = () => useQuery(campusQuery(useQueryDeps()));

/** The campus time zone for "checked today"; the phone's zone until the campus has loaded. */
export function useCampusTz(): string {
  const campus = useCampus();
  return campus.data?.campus.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```

`apps/web/src/hooks/useSurveyHome.ts`:

```ts
import type { SurveySpot } from "@study-spot/core";
import { type SurveyHome, surveyHome } from "@study-spot/ui-logic";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "../app/keys.ts";
import { useOutboxSnapshot } from "./useOutbox.ts";
import { useSpotList } from "./useQueries.ts";
import { useSession } from "./useSession.ts";

export type HomeState = {
  home: SurveyHome | null;
  /** True before any list has been loaded or restored (first run offline). */
  noList: boolean;
  refreshing: boolean;
};

export function useSurveyHome(): HomeState {
  const { me } = useSession();
  const list = useSpotList();
  const snapshot = useOutboxSnapshot();
  const qc = useQueryClient();
  if (me === null) return { home: null, noList: true, refreshing: false };
  const details = new Map<string, SurveySpot>();
  for (const [key, data] of qc.getQueriesData<SurveySpot>({ queryKey: keys.spotPrefix })) {
    const id = key[2];
    if (typeof id === "string" && data !== undefined) details.set(id, data);
  }
  return {
    home: surveyHome(list.data ?? null, snapshot.records, me, details, snapshot.unreadable),
    noList: list.data === undefined,
    refreshing: list.isFetching,
  };
}
```

`apps/web/src/hooks/useToasts.tsx`:

```tsx
import { type PlainCopyId, t } from "@study-spot/ui-logic";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { Toast } from "../ui/Toast.tsx";

/** How long a success toast waits for the server before saying the change is on the phone. */
export const SETTLE_WAIT_MS = 3_000;
export const TOAST_MS = 4_000;

type Tracked = { id: string; done: PlainCopyId; waiting: PlainCopyId; since: number };
export type ToastApi = {
  show(text: string): void;
  /**
   * Toasts when a queued write settles: `done` once it leaves the queue (the
   * server applied it, decision 18), `waiting` if it is still on the phone
   * after SETTLE_WAIT_MS or the phone is offline. A write that fails or
   * conflicts gets no success toast; the header and banner say so.
   */
  track(clientWriteId: string, copy: { done: PlainCopyId; waiting: PlainCopyId }): void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider(props: { children: ReactNode }) {
  const { outbox, network, clock } = useDeps();
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);
  const tracked = useRef<Tracked[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string) => {
    counter.current += 1;
    setMessage({ text, key: counter.current });
  }, []);

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const check = () => {
      const records = outbox.getSnapshot().records;
      const now = clock.now().getTime();
      const left: Tracked[] = [];
      for (const w of tracked.current) {
        const r = records.find((x) => x.client_write_id === w.id);
        if (r === undefined) show(t(w.done));
        else if (r.state === "failed" || r.state === "conflict") continue;
        else if (now - w.since >= SETTLE_WAIT_MS || !network.online()) show(t(w.waiting));
        else left.push(w);
      }
      tracked.current = left;
    };
    const stop = outbox.subscribe(check);
    const timer = setInterval(check, 500);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [outbox, network, clock, show]);

  const api: ToastApi = {
    show,
    track(id, copy) {
      if (!network.online()) {
        show(t(copy.waiting));
        return;
      }
      tracked.current = [...tracked.current, { id, ...copy, since: clock.now().getTime() }];
    },
  };
  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <Toast message={message} onDismiss={() => setMessage(null)} />
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToasts outside ToastProvider");
  return api;
}
```

- [ ] **Step 5: Run the tests**

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS. No `TimeoutOverflowWarning` is printed (the reason `gcTime` is `Infinity`).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/src/app apps/web/src/hooks apps/web/test
git commit -m "feat(web): wire adapters, persist the server cache, add hooks"
```

### Task 8: Survey shell, Sign in again, update prompt, and the invite screen

The routes and the frame every survey screen shares: `/` redirects to `/survey`; `/survey` shows "Sign in again" whenever this phone has no working session (no session, a 401 on a read, or the outbox paused by a 401) and keeps queued writes; a leave warning while changes are only on this phone; the update prompt when a new build is waiting. `SurveyHeader` is the ink band with the sync postmark and its sheet (every change on the phone, unreadable records with Discard, the other-phone warning). The invite screen (`/invite/$token`) never accepts on load, shows the iOS note in an iPhone browser tab, asks for a name unless the link says `?relogin=1` (falling back if the server wants one), disables Join offline, and maps used, expired, and invalid links to their copy.

**Files:**
- Create: `apps/web/src/lib/platform.ts`, `apps/web/src/lib/names.ts`
- Create: `apps/web/src/screens/SyncSheet.tsx`, `SurveyHeader.tsx`, `SignedOut.tsx`, `UpdatePrompt.tsx`, `Invite.tsx`
- Replace: `apps/web/src/routes/__root.tsx`, `apps/web/src/main.tsx`
- Create: `apps/web/src/routes/index.tsx`, `apps/web/src/routes/invite.$token.tsx`, `apps/web/src/routes/survey.tsx`
- Modify (generated): `apps/web/src/routeTree.gen.ts`
- Create: `apps/web/test/invite.test.tsx`

**Interfaces:**
- Produces: routes `/`, `/invite/$token` (search `relogin?: number`), `/survey` (layout); `isIos(nav)`, `isStandalone(win)`; `spotNames(list, records): ReadonlyMap<string, string>`; `SyncSheet({ open, onClose })`, `SurveyHeader({ title, back?: LinkProps })`, `SignedOut()`, `UpdatePrompt()`, `Invite({ token, relogin })`.
- Consumes: Task 6 components, Task 7 hooks and `createAppDeps`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/invite.test.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ME, renderRoute, TOKEN, testApp } from "./harness.tsx";

const LINK = `/invite/${"b".repeat(43)}`;

function answer(app: ReturnType<typeof testApp>, status: number, body: unknown) {
  const original = app.server.send.bind(app.server);
  vi.spyOn(app.server, "send").mockImplementation(async (req) =>
    req.url.endsWith("/auth/accept") ? { status, text: JSON.stringify(body) } : original(req),
  );
}

test("a new surveyor adds a name, joins, and lands on the spot list", async () => {
  const app = testApp({ me: null });
  answer(app, 200, { token: TOKEN, surveyor: ME });
  const view = renderRoute(app, LINK);
  expect(await screen.findByRole("heading", { name: t("invite.title") })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  expect(await screen.findByText(t("invite.name.required"))).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: t("invite.name.label") }), {
    target: { value: "Ana" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(app.deps.session.current()?.surveyor.display_name).toBe("Ana");
});

test("a re-login link asks for no name and says Sign in", async () => {
  const app = testApp({ me: null });
  answer(app, 200, { token: TOKEN, surveyor: ME });
  renderRoute(app, `${LINK}?relogin=1`);
  expect(await screen.findByRole("heading", { name: t("invite.relogin.title") })).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("invite.relogin.action") }));
  await waitFor(() => expect(app.deps.session.current()?.token).toBe(TOKEN));
});

test("a used link says so and offers no button; offline disables Join", async () => {
  const app = testApp({ me: null });
  answer(app, 410, { error: "invite_used" });
  renderRoute(app, LINK);
  fireEvent.change(await screen.findByRole("textbox", { name: t("invite.name.label") }), {
    target: { value: "Ana" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  expect(await screen.findByText(t("invite.used"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("invite.join") })).toBeNull();

  const offline = testApp({ me: null });
  offline.network.set(false);
  renderRoute(offline, LINK);
  expect(await screen.findByText(t("invite.offline"))).toBeTruthy();
});

test("a malformed token never calls the server", async () => {
  const app = testApp({ me: null });
  const send = vi.spyOn(app.server, "send");
  renderRoute(app, "/invite/short");
  expect(await screen.findByText(t("invite.invalid"))).toBeTruthy();
  expect(send.mock.calls.filter(([r]) => r.url.endsWith("/auth/accept"))).toHaveLength(0);
});

test("on an iPhone browser tab the note says to open the link in the installed app", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
  );
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  renderRoute(testApp({ me: null }), LINK);
  expect(await screen.findByText(t("invite.ios.body"))).toBeTruthy();
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL. The route tree has no `/invite/$token` (the memory router renders a not-found page) and `../src/screens` does not exist.

- [ ] **Step 2: Write the helpers and the shell pieces**

`apps/web/src/lib/platform.ts`:

```ts
/** iPhone or iPad, including iPadOS, which reports itself as a Mac with touch. */
export function isIos(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}

/** Running as the installed home-screen app rather than in a browser tab. */
export function isStandalone(win: Window): boolean {
  // navigator.standalone exists only in iOS Safari and is missing from lib.dom.
  const legacy = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || win.matchMedia("(display-mode: standalone)").matches;
}
```

`apps/web/src/lib/names.ts`:

```ts
import type { SpotList } from "@study-spot/core";
import { bySeq, type WriteRecord } from "@study-spot/ui-logic";

/** Spot id to the name a surveyor last saw or typed, for the sync sheet. */
export function spotNames(
  list: SpotList | undefined,
  records: readonly WriteRecord[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const s of list?.spots ?? []) names.set(s.id, s.official_name);
  for (const r of [...records].sort(bySeq)) {
    if (r.kind === "spot.create") names.set(r.spot_id, r.payload.identity.official_name);
    if (r.kind === "spot.section" && r.payload.section === "identity") {
      names.set(r.spot_id, r.payload.data.official_name);
    }
  }
  return names;
}
```

`apps/web/src/screens/SyncSheet.tsx`:

```tsx
import { isLocalId, t } from "@study-spot/ui-logic";
import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOutboxSnapshot, useSyncHeader } from "../hooks/useOutbox.ts";
import { useSpotList } from "../hooks/useQueries.ts";
import { headerLong, whatOf } from "../lib/format.ts";
import { spotNames } from "../lib/names.ts";
import { Button } from "../ui/Button.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";

/** Everything waiting on this phone: the one place connectivity detail lives. */
export function SyncSheet(props: { open: boolean; onClose: () => void }) {
  const { outbox } = useDeps();
  const snapshot = useOutboxSnapshot();
  const header = useSyncHeader();
  const list = useSpotList();
  const names = spotNames(list.data, snapshot.records);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [discarding, setDiscarding] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open || snapshot.unreadable === 0) {
      setUnreadable([]);
      return;
    }
    let live = true;
    void outbox
      .unreadableKeys()
      .then((keys) => {
        if (live) setUnreadable(keys);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.open, snapshot.unreadable, outbox]);

  const empty = snapshot.records.length === 0 && unreadable.length === 0;
  return (
    <>
      <Sheet
        open={props.open && discarding === null}
        title={t("sync.sheet.title")}
        onClose={props.onClose}
      >
        <p className="title">{headerLong(header)}</p>
        {empty ? <p className="empty">{t("sync.sheet.empty")}</p> : null}
        {snapshot.records.length > 0 ? (
          <ul className="ruled-list">
            {snapshot.records.map((r) => {
              const what = whatOf(r, names.get(r.spot_id) ?? "");
              const text =
                r.state === "failed"
                  ? t("sync.sheet.item_failed", { what })
                  : r.state === "conflict"
                    ? t("sync.sheet.item_conflict", { what })
                    : t("sync.sheet.item_pending", { what });
              return (
                <li key={r.client_write_id} className="entry">
                  <span className="entry__text">
                    {text}
                    {r.kind === "spot.create" && isLocalId(r.spot_id) ? (
                      <span className="entry__note">{t("sync.sheet.local_only")}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {unreadable.length > 0 ? (
          <>
            <p className="lede">{t("sync.sheet.unreadable_help")}</p>
            <ul className="ruled-list">
              {unreadable.map((key) => (
                <li key={key} className="entry">
                  <span className="entry__text">{t("sync.sheet.unreadable_item")}</span>
                  <Button variant="quiet" onClick={() => setDiscarding(key)}>
                    {t("common.discard")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="lede">{t("sync.sheet.other_phone_warning")}</p>
      </Sheet>
      <ConfirmSheet
        open={discarding !== null}
        title={t("failed.discard")}
        body={t("failed.discard.confirm")}
        action={t("failed.discard")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setDiscarding(null)}
        onConfirm={() => {
          const key = discarding;
          setDiscarding(null);
          if (key !== null) void outbox.discardUnreadable(key);
        }}
      />
    </>
  );
}
```

`apps/web/src/screens/SurveyHeader.tsx`:

```tsx
import type { LinkProps } from "@tanstack/react-router";
import { useState } from "react";
import { useSyncHeader } from "../hooks/useOutbox.ts";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { SyncPostmark } from "../ui/SyncPostmark.tsx";
import { SyncSheet } from "./SyncSheet.tsx";

/** The ink band every survey screen starts with, carrying the sync postmark and its sheet. */
export function SurveyHeader(props: { title: string; back?: LinkProps }) {
  const header = useSyncHeader();
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderBand
        title={props.title}
        {...(props.back === undefined ? {} : { back: props.back })}
        trailing={<SyncPostmark header={header} onOpen={() => setOpen(true)} />}
      />
      <SyncSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

`apps/web/src/screens/SignedOut.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { Screen } from "../ui/Screen.tsx";

/** Every survey route when this phone has no working sign-in. Queued changes are kept. */
export function SignedOut() {
  return (
    <>
      <HeaderBand title={t("app.name")} />
      <Screen>
        <h2 className="title">{t("auth.expired.title")}</h2>
        <p>{t("auth.expired.body")}</p>
        <p className="lede">{t("sync.sheet.other_phone_warning")}</p>
      </Screen>
    </>
  );
}
```

`apps/web/src/screens/UpdatePrompt.tsx`:

```tsx
import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "@study-spot/ui-logic";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";

/** A new build is waiting: the surveyor chooses when to reload, so no edit is cut off. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update">
      <Banner
        tone="note"
        action={
          <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
            {t("update.reload")}
          </Button>
        }
      >
        {t("update.ready")}
      </Banner>
    </div>
  );
}
```

`apps/web/src/screens/Invite.tsx`:

```tsx
import { OpaqueToken } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOnline } from "../hooks/useOnline.ts";
import { useSession } from "../hooks/useSession.ts";
import { isIos, isStandalone } from "../lib/platform.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { TextField } from "../ui/Field.tsx";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { Screen } from "../ui/Screen.tsx";

type Problem = "invalid" | "expired" | "used" | "name" | "storage" | "generic" | null;

const PROBLEM_TEXT: Record<Exclude<Problem, null>, () => string> = {
  invalid: () => t("invite.invalid"),
  expired: () => t("invite.expired"),
  used: () => t("invite.used"),
  name: () => t("invite.name.required"),
  storage: () => t("error.generic"),
  generic: () => t("error.generic"),
};

/**
 * Turns a link into a signed-in phone. Nothing happens on load: on an iPhone the
 * link must be opened inside the installed app, and accepting in Safari first
 * would use it up.
 */
export function Invite(props: { token: string; relogin: boolean }) {
  const { api } = useDeps();
  const { join } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenOk = OpaqueToken.safeParse(props.token).success;
  const [askName, setAskName] = useState(!props.relogin);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(tokenOk ? null : "invalid");
  const ios = isIos(navigator) && !isStandalone(window);

  async function accept() {
    const display = name.trim();
    if (askName && display === "") {
      setProblem("name");
      return;
    }
    setBusy(true);
    setProblem(null);
    const res = await api.acceptInvite(
      askName ? { token: props.token, display_name: display } : { token: props.token },
    );
    setBusy(false);
    switch (res.kind) {
      case "ok":
        if (!join(res.value)) return setProblem("storage");
        await navigate({ to: "/survey" });
        return;
      case "gone":
        return setProblem(
          res.code === "invite_expired"
            ? "expired"
            : res.code === "invite_used"
              ? "used"
              : "invalid",
        );
      case "invalid":
        if (res.code === "display_name_required") {
          // A new-surveyor link opened as a re-login link: ask for the name after all.
          setAskName(true);
          return setProblem("name");
        }
        return setProblem("invalid");
      default:
        return setProblem("generic");
    }
  }

  const relogin = !askName;
  const blocked = !tokenOk || problem === "expired" || problem === "used" || problem === "invalid";
  return (
    <>
      <HeaderBand title={t("app.name")} />
      <Screen
        action={
          blocked ? undefined : (
            <Button variant="primary" wide disabled={busy || !online} onClick={() => void accept()}>
              {busy ? t("invite.joining") : relogin ? t("invite.relogin.action") : t("invite.join")}
            </Button>
          )
        }
      >
        <h2 className="title">{relogin ? t("invite.relogin.title") : t("invite.title")}</h2>
        <p>{relogin ? t("invite.relogin.body") : t("invite.body")}</p>
        {ios ? (
          <section className="note" aria-labelledby="ios-note">
            <h3 className="label" id="ios-note">
              {t("invite.ios.title")}
            </h3>
            <p>{t("invite.ios.body")}</p>
          </section>
        ) : null}
        {askName && !blocked ? (
          <TextField
            label={t("invite.name.label")}
            helper={t("invite.name.helper")}
            error={problem === "name" ? PROBLEM_TEXT.name() : undefined}
            value={name}
            onChange={setName}
            autoComplete="name"
            maxLength={60}
          />
        ) : null}
        {problem !== null && problem !== "name" ? <Banner>{PROBLEM_TEXT[problem]()}</Banner> : null}
        {!online && !blocked ? <Banner tone="note">{t("invite.offline")}</Banner> : null}
      </Screen>
    </>
  );
}
```

- [ ] **Step 3: Write the routes and the entry**

`apps/web/src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { UpdatePrompt } from "../screens/UpdatePrompt.tsx";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <UpdatePrompt />
    </>
  ),
});
```

`apps/web/src/routes/index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/survey" });
  },
});
```

`apps/web/src/routes/invite.$token.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Invite } from "../screens/Invite.tsx";

/** `?relogin=1` comes from the server on links for an existing surveyor. */
const Search = z.object({ relogin: z.coerce.number().int().optional() });

export const Route = createFileRoute("/invite/$token")({
  validateSearch: Search,
  component: InviteRoute,
});

function InviteRoute() {
  const { token } = Route.useParams();
  const { relogin } = Route.useSearch();
  return <Invite token={token} relogin={relogin === 1} />;
}
```

`apps/web/src/routes/survey.tsx`:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useOutboxSnapshot } from "../hooks/useOutbox.ts";
import { useSession } from "../hooks/useSession.ts";
import { SignedOut } from "../screens/SignedOut.tsx";

export const Route = createFileRoute("/survey")({ component: SurveyLayout });

/** Asks the browser to confirm closing the tab while changes are still on this phone only. */
function useLeaveGuard(): void {
  const snapshot = useOutboxSnapshot();
  const waiting = snapshot.records.some((r) => r.state === "pending" || r.state === "syncing");
  useEffect(() => {
    if (!waiting) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [waiting]);
}

function SurveyLayout() {
  const { signedOut } = useSession();
  useLeaveGuard();
  return signedOut ? <SignedOut /> : <Outlet />;
}
```

`apps/web/src/main.tsx` (fonts, the stylesheet, the app dependencies):

```tsx
import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-700.css";
import "./ui/styles.css";
import { tokens } from "@study-spot/ui-logic";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./app/AppProvider.tsx";
import { createAppDeps } from "./app/deps.ts";
import { parseWebEnv } from "./env.ts";
import { routeTree } from "./routeTree.gen.ts";
import { installTheme } from "./ui/theme.ts";

export const router = createRouter({ routeTree, defaultPreload: false, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

installTheme(tokens);
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const parsed = parseWebEnv(import.meta.env);
if (!parsed.ok) {
  // A build without the deploy env cannot reach the API; say so instead of failing quietly.
  root.textContent = `Perch is misconfigured:\n${parsed.error}`;
  throw new Error(parsed.error);
}
const deps = createAppDeps({
  apiBaseUrl: parsed.env.VITE_API_BASE_URL,
  dataBaseUrl: parsed.env.VITE_DATA_BASE_URL,
});
createRoot(root).render(
  <StrictMode>
    <AppProvider deps={deps}>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Regenerate the route tree and run the tests**

Run: `VITE_API_BASE_URL=http://127.0.0.1:8787 VITE_DATA_BASE_URL=http://data.localhost:8788 bun run --filter '@study-spot/web' build`
Expected: builds; `routeTree.gen.ts` now lists `/`, `/invite/$token`, and `/survey`.

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (5 invite tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/src apps/web/test/invite.test.tsx
git commit -m "feat(web): add the survey shell and the invite screen"
```

### Task 9: The spot list (`/survey`)

Home answers "what next, and is my data safe": Needs attention (conflicts and failed writes first, then unreviewed spots a teammate edited, then hours not confirmed this term, plus a line for unreadable records), Drafts (with "{count} of 7 required parts done"), and Oldest checks (oldest verification first). First run explains what a spot is; first run offline with nothing cached says the list needs a connection; changes still waiting after this load's first sync pass get the leave-warning note. Rows become links and New spot appears in part 2 (`spotLink` and `action` props); the Admin link in part 3 (`admin`).

**Files:**
- Create: `apps/web/src/screens/Home.tsx`, `apps/web/src/screens/spotLink.ts`, `apps/web/src/routes/survey.index.tsx`
- Modify (generated): `apps/web/src/routeTree.gen.ts`
- Create: `apps/web/test/home.test.tsx`

**Interfaces:**
- Produces: route `/survey/`; `Home({ spotLink?: SpotLinkFor; action?: ReactNode; admin?: ReactNode })`; `type SpotLinkFor = (spotId: string) => LinkProps`.
- Consumes: `useSurveyHome`, `useOnline`, `useCampusTz`, `useDeps().started`, `plural`, Task 6 `RuledRow`, `Banner`, `Screen`, Task 8 `SurveyHeader`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/home.test.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity, POWER } from "../../../packages/ui-logic/test/builders.ts";
import { renderRoute, testApp } from "./harness.tsx";

const PUBLISHED = surveySpotFixture({
  id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a01",
  slug: "sac-lounge",
  official_name: "SAC Lounge",
  status: "published",
  review_state: "unreviewed",
  last_edited_by: "2c1e5b7a-0c2d-4f5e-9a1b-3c4d5e6f7a8b",
  last_edited_by_name: "Jordan",
  verified: { identity: "2026-09-01T15:00:00.000Z" },
});

test("first run with nothing on the server explains what a spot is", async () => {
  renderRoute(testApp(), "/survey");
  expect(await screen.findByText(t("home.empty.title"))).toBeTruthy();
  expect(screen.getByText(t("home.attention.empty"))).toBeTruthy();
});

test("a teammate's unreviewed spot needs attention and lists by oldest check", async () => {
  renderRoute(testApp({ spots: [PUBLISHED] }), "/survey");
  const attention = await screen.findByRole("region", { name: t("home.attention.title") });
  expect(
    within(attention).getByText(t("home.attention.unreviewed", { name: "Jordan" })),
  ).toBeTruthy();
  const stale = screen.getByRole("region", { name: t("home.stale.title") });
  expect(within(stale).getByText(t("home.stale.row", { date: "Sep 1" }))).toBeTruthy();
});

test("a draft made offline shows under Drafts with its required-part count", async () => {
  const app = testApp();
  app.network.set(false);
  renderRoute(app, "/survey");
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Basement Carrels" }));
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: local, payload: POWER }, null);
  const drafts = await screen.findByRole("region", { name: t("home.drafts.title") });
  expect(await within(drafts).findByText("Basement Carrels")).toBeTruthy();
  expect(within(drafts).getByText(t("home.drafts.row", { count: 2 }))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("sync.short.offline") })).toBeTruthy();
});

test("the sync sheet lists changes on the phone and warns about other phones", async () => {
  const app = testApp();
  app.network.set(false);
  renderRoute(app, "/survey");
  await app.deps.started;
  await app.deps.outbox.createSpot(identity({ official_name: "Basement Carrels" }));
  fireEvent.click(await screen.findByRole("button", { name: t("sync.short.offline") }));
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  expect(within(sheet).getByText(t("sync.offline"))).toBeTruthy();
  expect(
    within(sheet).getByText(
      t("sync.sheet.item_pending", { what: t("sync.what.create", { name: "Basement Carrels" }) }),
    ),
  ).toBeTruthy();
  expect(within(sheet).getByText(t("sync.sheet.local_only"))).toBeTruthy();
  expect(within(sheet).getByText(t("sync.sheet.other_phone_warning"))).toBeTruthy();
});

test("an unreadable stored change is counted, listed, and can be discarded", async () => {
  const app = testApp();
  await app.cache.set("outbox:w:broken", "{not json");
  renderRoute(app, "/survey");
  const attention = await screen.findByRole("region", { name: t("home.attention.title") });
  expect(await within(attention).findByText(t("home.unreadable_one"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("sync.short.unreadable", { count: 1 }) }));
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  fireEvent.click(await within(sheet).findByRole("button", { name: t("common.discard") }));
  fireEvent.click(await screen.findByRole("button", { name: t("failed.discard") }));
  await waitFor(() => expect(app.deps.outbox.getSnapshot().unreadable).toBe(0));
  expect(await app.cache.get("outbox:w:broken")).toBeNull();
});

test("a 401 on the list shows Sign in again and keeps queued changes", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  await app.deps.outbox.createSpot(identity());
  app.server.unauthorized = true;
  app.network.set(true);
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("auth.expired.title"))).toBeTruthy();
  expect(app.deps.outbox.getSnapshot().records).toHaveLength(1);
});

test("with no session on this phone, survey screens ask to sign in again", async () => {
  renderRoute(testApp({ me: null }), "/survey");
  expect(await screen.findByText(t("auth.expired.body"))).toBeTruthy();
});

test("first run offline with nothing cached says the list needs a connection", async () => {
  const app = testApp();
  app.server.offline = true;
  app.network.set(false);
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("home.offline_first"))).toBeTruthy();
  expect(screen.queryByText(t("home.empty.title"))).toBeNull();
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL; `/survey` renders an empty layout (no index route), so "No spots yet" and the lists are not found.

- [ ] **Step 2: Write the screen and the route**

`apps/web/src/screens/spotLink.ts`:

```ts
import type { LinkProps } from "@tanstack/react-router";

/** Builds the link a spot row opens. */
export type SpotLinkFor = (spotId: string) => LinkProps;
```

`apps/web/src/screens/Home.tsx`:

```tsx
import type { AttentionRow, DraftRow, StaleRow } from "@study-spot/ui-logic";
import { plural, t } from "@study-spot/ui-logic";
import { type ReactNode, useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOnline } from "../hooks/useOnline.ts";
import { useCampusTz } from "../hooks/useQueries.ts";
import { useSurveyHome } from "../hooks/useSurveyHome.ts";
import { shortDate } from "../lib/format.ts";
import { Banner } from "../ui/Banner.tsx";
import { RuledRow } from "../ui/RuledRow.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";
import type { SpotLinkFor } from "./spotLink.ts";

function attentionText(row: AttentionRow): string {
  switch (row.reason) {
    case "conflict":
      return t("home.attention.conflict");
    case "failed":
      return plural(row.count, "home.attention.failed_one", "home.attention.failed");
    case "unreviewed":
      return t("home.attention.unreviewed", { name: row.editor });
    case "hours_unconfirmed":
      return t("home.attention.hours_unconfirmed", { term: row.term });
  }
}

function staleText(row: StaleRow, tz: string): string {
  return row.oldestVerifiedAt === null
    ? t("home.stale.never")
    : t("home.stale.row", { date: shortDate(row.oldestVerifiedAt, tz) });
}

/** No count when this phone has never loaded the draft's details. */
function draftText(row: DraftRow): string | undefined {
  return row.requiredDone === null ? undefined : t("home.drafts.row", { count: row.requiredDone });
}

/** Writes still queued once this page load's first sync pass ended (journey edge 9). */
function usePendingAfterOpen(): number {
  const { started, outbox } = useDeps();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    void started.then(() => {
      const left = outbox
        .getSnapshot()
        .records.filter((r) => r.state === "pending" || r.state === "syncing").length;
      if (live) setCount(left);
    });
    return () => {
      live = false;
    };
  }, [started, outbox]);
  return count;
}

function List(props: { title: string; children: ReactNode; empty: string | null }) {
  return (
    <section aria-label={props.title}>
      <GroupHeading>{props.title}</GroupHeading>
      {props.empty === null ? (
        <ul className="ruled-list">{props.children}</ul>
      ) : (
        <p className="empty">{props.empty}</p>
      )}
    </section>
  );
}

/**
 * What to do next and whether data is safe. `spotLink` turns a row into a link
 * to the spot (wired once the overview exists); `action` is the pinned button.
 */
export function Home(props: { spotLink?: SpotLinkFor; action?: ReactNode; admin?: ReactNode }) {
  const online = useOnline();
  const tz = useCampusTz();
  const { home, noList } = useSurveyHome();
  const pendingAtOpen = usePendingAfterOpen();
  const link = props.spotLink;
  const rows = home ?? { attention: [], stale: [], drafts: [], unreadable: 0 };
  const firstRun = !noList && rows.stale.length === 0 && rows.drafts.length === 0;

  return (
    <>
      <SurveyHeader title={t("home.title")} />
      <Screen action={props.action}>
        {props.admin === undefined ? null : <nav className="home-admin">{props.admin}</nav>}
        {pendingAtOpen > 0 ? (
          <Banner tone="note">
            {plural(pendingAtOpen, "sync.leave_warning_one", "sync.leave_warning")}
          </Banner>
        ) : null}
        {noList && !online ? <p className="lede">{t("home.offline_first")}</p> : null}
        {firstRun ? (
          <section className="first-run">
            <h2 className="title">{t("home.empty.title")}</h2>
            <p className="lede">{t("home.empty.body")}</p>
          </section>
        ) : null}
        <List
          title={t("home.attention.title")}
          empty={
            rows.attention.length === 0 && rows.unreadable === 0 ? t("home.attention.empty") : null
          }
        >
          {rows.unreadable > 0 ? (
            <RuledRow
              label={plural(rows.unreadable, "home.unreadable_one", "home.unreadable")}
              tone="missing"
            />
          ) : null}
          {rows.attention.map((row) => (
            <RuledRow
              key={`${row.spotId}:${row.reason}`}
              label={row.name}
              value={attentionText(row)}
              tone={row.reason === "conflict" || row.reason === "failed" ? "missing" : "muted"}
              {...(link === undefined ? {} : { link: link(row.spotId) })}
            />
          ))}
        </List>
        <List
          title={t("home.drafts.title")}
          empty={rows.drafts.length === 0 ? t("home.drafts.empty") : null}
        >
          {rows.drafts.map((row) => (
            <RuledRow
              key={row.spotId}
              label={row.name}
              value={draftText(row)}
              tone="muted"
              {...(link === undefined ? {} : { link: link(row.spotId) })}
            />
          ))}
        </List>
        <List
          title={t("home.stale.title")}
          empty={rows.stale.length === 0 ? t("home.stale.empty") : null}
        >
          {rows.stale.map((row) => (
            <RuledRow
              key={row.spotId}
              label={row.name}
              value={staleText(row, tz)}
              tone={row.oldestVerifiedAt === null ? "missing" : "muted"}
              {...(link === undefined ? {} : { link: link(row.spotId) })}
            />
          ))}
        </List>
      </Screen>
    </>
  );
}
```

`apps/web/src/routes/survey.index.tsx` (part 2 replaces it):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../screens/Home.tsx";

export const Route = createFileRoute("/survey/")({ component: HomeRoute });

/** Spot rows become links and New spot appears once the spot screens exist (part 2). */
function HomeRoute() {
  return <Home />;
}
```

- [ ] **Step 3: Regenerate the route tree and run the tests**

Run: `VITE_API_BASE_URL=http://127.0.0.1:8787 VITE_DATA_BASE_URL=http://data.localhost:8788 bun run --filter '@study-spot/web' build`
Expected: builds; `routeTree.gen.ts` lists `/survey/`.

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (8 home tests, 46 web tests in all).

- [ ] **Step 4: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/src apps/web/test/home.test.tsx
git commit -m "feat(web): add the spot list with attention, drafts, and checks"
```

### Task 10: End to end against the real server

Playwright on a Pixel 7 profile against the production build under `vite preview` (service worker included) and the real Fastify app: `apps/server/scripts/e2e-server.ts` runs `buildApp` on a seeded PGlite database under Node, publishes to a temp directory, and writes 40 bootstrap admin invite links (re-login links, so `?relogin=1`) for the tests. Both clocks start at 2026-10-13 16:00 UTC. This task covers sign-in, the 360 px layout, the iPhone note, and dark mode with reduced motion; parts 2 and 3 add the acceptance flows. CI runs it in its own job.

**Files:**
- Create: `apps/server/scripts/e2e-server.ts`
- Create: `apps/web/e2e/fixtures.ts`, `apps/web/e2e/shell.e2e.ts`
- Modify: `.github/workflows/ci.yml` (job `web-e2e`)

**Interfaces:**
- Produces: e2e server env `E2E_PORT` (8787), `E2E_WEB_ORIGIN` (`http://localhost:4173`), `E2E_STATE`, `E2E_NOW`, `E2E_INVITES`; state file `{ publishDir, invites: string[], now }`.
- Produces (e2e): `serverState()`, `nextInvite()`, `signIn(page): Promise<string>`, `test` (pins `page.clock` to the server's start), `expect`.
- Consumes: `buildApp` (with `config.commit: null`), `bootstrapAdminInvite`, `createPublisher`, `fsTarget`, `postgresPhotoStore`, `seed`, `createTestDb`.

- [ ] **Step 1: Write the server script**

`apps/server/scripts/e2e-server.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { seed } from "@study-spot/db/seed";
import { createTestDb } from "@study-spot/db/testing";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { bootstrapAdminInvite } from "../src/auth/invites.ts";
import type { Clock } from "../src/clock.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher } from "../src/publish/publisher.ts";

/**
 * The real server for apps/web's Playwright run: buildApp on a seeded PGlite
 * database, publishing to a temp directory. Its clock starts at E2E_NOW and
 * ticks, so seed terms stay current whatever the date. Writes the admin invite
 * links and the publish directory to E2E_STATE for the tests.
 */
const Env = z.object({
  E2E_PORT: z.coerce.number().int().positive().default(8787),
  E2E_WEB_ORIGIN: z.url().default("http://localhost:4173"),
  E2E_STATE: z.string().min(1),
  E2E_NOW: z.iso.datetime().default("2026-10-13T16:00:00.000Z"),
  E2E_INVITES: z.coerce.number().int().positive().default(40),
});
const env = Env.parse(process.env);

const startedAt = Date.now();
const clock: Clock = {
  now: () => new Date(Date.parse(env.E2E_NOW) + (Date.now() - startedAt)),
};
const db = await createTestDb();
await seed(db);
const publishDir = mkdtempSync(join(tmpdir(), "perch-e2e-publish-"));
const photos = postgresPhotoStore(db);
const publisher = createPublisher({
  db,
  campusId: "sbu",
  target: fsTarget(publishDir),
  photos,
  dataBaseUrl: "http://data.localhost:8788",
  clock,
  log: (message, error) => console.error(message, error),
});
const app = await buildApp({
  db,
  clock,
  config: { webOrigin: env.E2E_WEB_ORIGIN, campusId: "sbu", commit: null },
  publisher,
  photos,
});
const invites: string[] = [];
for (let i = 1; i <= env.E2E_INVITES; i += 1) {
  const invite = await bootstrapAdminInvite(db, {
    displayName: `E2E Admin ${i}`,
    now: clock.now(),
    webOrigin: env.E2E_WEB_ORIGIN,
  });
  invites.push(invite.url);
}
mkdirSync(dirname(env.E2E_STATE), { recursive: true });
// Fresh invites each run, so the tests' "next unused invite" counter starts over.
rmSync(`${env.E2E_STATE}.used`, { force: true });
writeFileSync(env.E2E_STATE, JSON.stringify({ publishDir, invites, now: env.E2E_NOW }, null, 2));

const shutdown = async () => {
  publisher.close();
  await app.close();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
await app.listen({ port: env.E2E_PORT, host: "127.0.0.1" });
console.log(`e2e api on http://127.0.0.1:${env.E2E_PORT}, publishing to ${publishDir}`);
```

Run it once in the background, wait for it, look at the state, and stop it:

```bash
E2E_STATE=/tmp/e2e-state.json node apps/server/scripts/e2e-server.ts > /tmp/e2e-server.log 2>&1 &
SERVER=$!
for i in $(seq 60); do curl -sf http://127.0.0.1:8787/health && break; sleep 1; done
grep -c 'relogin=1' /tmp/e2e-state.json
kill $SERVER
```

Expected: `/health` answers `{"ok":true,"commit":null}`, the count is 40, and the log says `e2e api on http://127.0.0.1:8787, publishing to ...`.

- [ ] **Step 2: Write the fixtures and the tests**

`apps/web/e2e/fixtures.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";
import { z } from "zod";
import { E2E_STATE } from "../playwright.config.ts";

const State = z.object({
  publishDir: z.string(),
  invites: z.array(z.url()),
  now: z.iso.datetime(),
});
export type ServerState = z.infer<typeof State>;

export function serverState(): ServerState {
  return State.parse(JSON.parse(readFileSync(E2E_STATE, "utf8")));
}

/** Each bootstrap invite works once, so tests take the next unused one. */
export function nextInvite(): string {
  const state = serverState();
  const counter = `${E2E_STATE}.used`;
  const used = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
  const url = state.invites[used];
  if (url === undefined) throw new Error("out of e2e invites; raise E2E_INVITES");
  writeFileSync(counter, String(used + 1));
  return url;
}

/** Opens an admin invite and signs this page in. Returns the surveyor's name. */
export async function signIn(page: Page): Promise<string> {
  const url = new URL(nextInvite());
  await page.goto(`${url.pathname}${url.search}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();
  return url.pathname;
}

/** Pins the phone's clock to the server's start time; it then ticks normally. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: new Date(serverState().now) });
    await use(page);
  },
});
export { expect };
```

`apps/web/e2e/shell.e2e.ts`:

```ts
import { expect, signIn, test } from "./fixtures.ts";

test("an invite link signs this phone in and lands on the spot list", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
});

test("at 360 px nothing scrolls sideways and the header postmark fits", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await page.context().setOffline(false);
});

test("an iPhone browser tab shows the open-in-the-app note", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await page.goto(`/invite/${"c".repeat(43)}`);
  await expect(page.getByText("On an iPhone?")).toBeVisible();
  await context.close();
});

test("dark mode and reduced motion keep the header band apart from the page", async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await signIn(page);
  const [band, body] = await page.evaluate(() => [
    getComputedStyle(document.querySelector(".band") ?? document.body).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ]);
  expect(band).not.toBe(body);
  const transition = await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.className = "btn btn--primary";
    document.body.append(probe);
    const duration = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return duration;
  });
  expect(transition).toBe("0s");
  await context.close();
});
```

- [ ] **Step 3: Run them**

Run: `(cd apps/web && bunx playwright install chromium && bun run e2e)`
Expected: Playwright starts both web servers (the API, then `vite build` and `vite preview`) and 4 tests pass.

- [ ] **Step 4: Add the CI job**

In `.github/workflows/ci.yml`, add before the `postgres:` job:

```yaml
  web-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Install
        run: bun install --frozen-lockfile

      - name: Install Chromium
        working-directory: apps/web
        run: bunx playwright install --with-deps chromium

      - name: Playwright against the real server
        run: bun run --filter '@study-spot/web' e2e
        env:
          CI: "true"

      - name: Keep the report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 7
```

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun test && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/server/scripts/e2e-server.ts apps/web/e2e .github/workflows/ci.yml
git commit -m "test(web): run phone e2e against the real server"
```

Part 1 is done: `bun run typecheck`, `bun run lint`, `bun test`, the 46 web unit tests, `vite build`, and 4 Playwright tests pass. A surveyor can open an invite link, sign in, and see the spot list with its sync state, offline included.
