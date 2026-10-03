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

## Git workflow

Commit automatically while working. Do not wait to be asked.

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): description`.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
  - Scopes match workspaces where useful: `core`, `db`, `server`, `web`, `scripts`, `docs`.
  - Breaking changes use `!` after the type/scope, plus a `BREAKING CHANGE:` footer.
- Atomic commits: one logical change per commit. Do not mix unrelated changes.
- Commit often: after each working step, not at the end of a task.
- Every commit must work: typecheck, lint, and tests pass at that commit. Never commit a broken state to "fix in the next commit".
- Keep messages short: subject line in imperative mood, lowercase, no trailing period, 72 characters or fewer (aim for 50). Add a body only when the why is not obvious, wrapped at 72.
- No attribution or co-author lines in commit messages or PR descriptions.
- Never commit secrets, `.env` files, or per-developer config (see `.gitignore`).

## HANDOFF PROTOCOL

When instructed to hand off, overwrite HANDOFF.md with:

- Goal: one sentence, the overall objective
- State: what is done, verified, and committed (with commit hashes)
- In progress: exact file/function being changed and its current condition
- Next steps: ordered, concrete, each independently executable
- Decisions: choices made and why, including rejected approaches
- Gotchas: failing tests, env quirks, commands that must be run
- Verify: command(s) that prove the work is correct

Write it for an agent with zero context. No narrative. HANDOFF.md is gitignored; never commit it. When all Next steps are done and verified, delete HANDOFF.md.
