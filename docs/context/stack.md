# Stack and type safety

## Stack

### Repository layout (monorepo, Bun workspaces)
```
packages/core     Zod schemas, inferred types, scoring, forecasting, live-blend math, API client. Pure TS, no runtime-specific APIs, unit tested.
packages/ui-logic Presenters, view model, offline outbox, UI copy, design tokens, platform adapter interfaces. No DOM, no React. React hooks live in apps/web/src/hooks for now (they typecheck under ui-logic's no-DOM config, so they can move when apps/mobile exists).
packages/db       Drizzle schema, migrations (drizzle-kit), drizzle-zod generated schemas, typed query helpers.
apps/server       Fastify API, scheduled jobs.
apps/web          React 19 + Vite PWA (vite-plugin-pwa, prompt updates), TanStack Router file routes, TanStack Query persisted to IndexedDB.
apps/mobile       Expo app. Do not create until the v1 gate in [roadmap.md](roadmap.md) is met.
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
- Push: Web Push (iOS only for installed PWAs; see [product-design.md](product-design.md) caveat).
- Noise: `getUserMedia` in foreground, compute level on device, send only the bucket, never store or transmit audio.
- Surveyor mode: same PWA, routes under `/survey`, bearer session in localStorage. Browser adapters in `apps/web/src/adapters` (IndexedDB through `idb` with timeouts, fetch, Web Locks, BroadcastChannel). Unit tests: Vitest with jsdom (`bun run --filter '@perch/web' test`, kept out of `bun test` by `bunfig.toml`). Browser tests: Playwright on a phone profile against the real server (`bun run --filter '@perch/web' e2e`).
- Fonts are self-hosted through `@fontsource-variable` (Newsreader, Instrument Sans). No font CDN.
- The theme boot script is inline in `apps/web/index.html`, so the theme applies before first paint.

### Rejected platform options
- Expo with web target from day one: weaker web output, map libraries do not unify, pays native complexity before it is needed.
- Next.js: SSR unnecessary given build-time prerendering; PWA tooling less mature than vite-plugin-pwa.
- Flutter: discards React/TS reuse, poor crawlable web output.
- Native Swift/Kotlin: two codebases; iOS-only excludes a large share of students.

### Hosting
Free or near-free tiers. Open source repository from day one.

The inline theme boot script in `apps/web/index.html` needs its sha256 in any future `script-src` CSP.
