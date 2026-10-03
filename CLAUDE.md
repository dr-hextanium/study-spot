# Perch (working name): Study Spot App

A PWA that helps Stony Brook University students pick a study spot: a ranked "go here now" pick, backed by a surveyed directory, busyness forecasts, and sparse live reports. A campus utility, not a business: cheap, open source, handed off to a student club. Repo and package scope use the neutral name `study-spot` until a name is chosen.

Product truth for design work lives in `PRODUCT.md`. The approved v0 design lives in `docs/superpowers/specs/2026-10-03-perch-v0-design.md`.

## Context files (read when relevant)

Detailed context is split into files under `docs/context/`. Read the ones that match the task before writing code. Do not load all of them by default.

| File | Read when |
|---|---|
| [overview.md](docs/context/overview.md) | Starting a session, checking what is DECIDED vs PROPOSED, naming, decision log |
| [constraints-privacy.md](docs/context/constraints-privacy.md) | Anything touching data collection, location, audio, networks, auth, or display of counts |
| [data-sources.md](docs/context/data-sources.md) | Ingesting or planning any data source |
| [spot-schema.md](docs/context/spot-schema.md) | Spot definition rules, attribute fields, enums, survey form work |
| [product-design.md](docs/context/product-design.md) | Any user-facing flow, UX honesty rules, presets, sessions, push |
| [models.md](docs/context/models.md) | Forecasting, live blend, seat probability, scoring |
| [data-model.md](docs/context/data-model.md) | Database schema, migrations, queries |
| [stack.md](docs/context/stack.md) | Tooling, runtime rules, type safety rules, server, frontend, hosting |
| [roadmap.md](docs/context/roadmap.md) | Versions, acceptance criteria, metrics, timeline, risks, open items |
| [design-tooling.md](docs/context/design-tooling.md) | Any UI or UX work (Impeccable and Intent plugins) |

When a decision changes, update the relevant context file and append to the decision log in `overview.md`.

## Hard rules (always apply)

- No hardware, no Wi-Fi/BLE/AP sniffing, no scraping behind login, no university SSO.
- Privacy: display aggregates only, suppress counts below 5, no location history, never record audio.
- Fully typed TypeScript: strict flags, no `any`, no unjustified non-null assertions, Zod at every trust boundary, string literal unions instead of TS enums.
- No `Bun.*` APIs in `apps/server` or `packages/*`; code must also run on Node.
- UX honesty: never show a forecast as live; every spot shows a last-verified date.

## Writing conventions

- Never use em-dashes in UI copy, docs, comments, or commit messages. Use commas or colons.
- UI copy is short and literal. No hype. Voice is dry and student-made.
