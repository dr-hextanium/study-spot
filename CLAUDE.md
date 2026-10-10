# Perch: Study Spot App

A PWA that helps Stony Brook University students pick a study spot: a ranked "go here now" pick, backed by a surveyed directory, busyness forecasts, and sparse live reports. A campus utility, not a business: cheap, open source, handed off to a student club. The app, repo and packages are named Perch (`perch`, `@perch/*`).

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

## Commands

- `bun install`: install workspaces (also installs the lefthook pre-commit hook)
- `bun run typecheck`, `bun run lint`, `bun run fix`, `bun test`
- `bun run smoke:node`: build the seed bundle under Node to prove the fallback runtime works
- `bun run db:generate`: create a migration after changing `packages/db/src/schema`
- `bun run db:migrate`, `bun run db:seed`: apply to `DATABASE_URL` (see `.env.example`)

## Hard rules (always apply)

- No hardware, no Wi-Fi/BLE/AP sniffing, no scraping behind login, no university SSO.
- Privacy: display aggregates only, suppress counts below 5, no location history, never record audio.
- Fully typed TypeScript: strict flags, no `any`, no unjustified non-null assertions, Zod at every trust boundary, string literal unions instead of TS enums.
- No `Bun.*` APIs in `apps/server` or `packages/*`; code must also run on Node.
- UX honesty: never show a forecast as live; every spot shows a last-verified date.

## Free-tier limits (strict, never exceed)

The stack must stay free. No card is on file anywhere; never add one, and stop and tell the owner if any service asks for one.

- **Pushes to `main`: at most 10 per local day.** Each one builds the PWA on Cloudflare Workers Builds (3,000 build minutes a month, 1 build at a time, 20-minute timeout; a build takes about a minute). Batch commits and push once per working session, not after each commit. A lefthook pre-push guard (`scripts/push-guard.ts`) blocks the 11th; only the owner may override one push with `PERCH_PUSH_OVERRIDE=1`. Work on branches freely; pushing other branches does not count.
- **Render:** one free web service only (750 instance hours a month per workspace; one service running all month uses about 744). Never create a second service, a cron job, a worker, or Render Postgres (it is deleted after 30 days). Never use "Deploy latest commit": releases go only through a `v*` tag and the migrate workflow.
- **No uptime pingers or keep-alive jobs** against the API or database. They keep Neon awake and burn its 100 compute-hours a month. The server sleeping after 15 minutes is expected.
- **Neon:** 1 GB per project. Photo bytes must not pile up in Postgres: published photos keep only their hash once the data site serves them (decision 22), so pending photos are what grows; check storage in the Neon dashboard before any bulk import. One project, one branch for production; delete drill branches after use.
- **Cloudflare, PWA (`perch`, Workers static assets, `wrangler.jsonc`):** asset requests are free and unlimited only while there is no Worker script. Never add a Worker script, `main`, or `run_worker_first`: script requests count against 100,000 a day and return errors past it. 20,000 files per version, 25 MiB per file.
- **Cloudflare, data site (`perch-data`, Pages direct upload):** 20,000 files per site, 25 MiB per file. Each approved photo is one file, so plan photo cleanup before about 15,000 photos. Never upload large or generated files to either site. R2, paid Workers features, and anything needing a card are off limits.
- **GitHub:** keep the repo public (free Actions minutes and free environment reviewers depend on it). No new scheduled workflows beyond the weekly backup. Do not raise artifact retention past 90 days.
- **Secrets:** tokens, database URLs, and hooks live in GitHub secrets, Render env, and the password manager; never in the repo or in output.

## Tool use

- Preplan your tool calls, and group independent ones into one batch where it makes sense. Wait for the whole batch to return before reading any result. Every turn re-reads the full context, so fewer turns means fewer tokens.

## Change tiers (pick the lightest that fits)

- **Tweak** (CSS, spacing, color, copy, icon, markup that changes no behavior): the main session edits it directly, no subagent and no review. The owner sees it through the live preview within a minute or two. Check: `bun run typecheck && bun run lint`, `cd apps/web && bunx vitest run`, and one look at the changed screen at 375 px. Commit, then move on.
- **Feature** (new UI behavior, no data or sync logic): one sonnet implementer, test-first. Unit tests and the visual check for the touched routes; no separate review unless something looks risky.
- **Logic** (outbox, sync, saving, auth, server, database, honesty rules): the full loop. Test-first implementer, then review, then fixes, then re-review. Use opus only here or when a change is genuinely tricky.
- The full Playwright suite runs once per branch before merge, not after every fix. Run single specs only for the area you touched.

## Visual Verification

Run after a batch of UI changes, not after every edit. `/verify-ui` runs the loop; the `visual-reviewer` agent reads the screenshots so images stay out of the main session.

**Ports:** 5173 belongs to another local app and 5199/8790 are the owner's live preview; never touch them. Use 5299 (web), 8890 (API) and 8898 (data site). Stop only servers you started, by PID.

**Servers:**
- API: `cd apps/server && E2E_PORT=8890 E2E_DATA_PORT=8898 E2E_PUBLISH_ON_BOOT=1 E2E_WEB_ORIGIN=http://localhost:5299 E2E_STATE=$CLAUDE_JOB_DIR/tmp/verify-state.json node scripts/e2e-server.ts` (in-memory seed data, single-use invite links in the state file, the published data site on 8898)
- Web: `cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:8890 VITE_DATA_BASE_URL=http://data.localhost:8898 bunx vite --host 127.0.0.1 --port 5299 --strictPort`

**Loop, in order:**
1. `cd apps/web && VERIFY_WEB=http://localhost:5299 VERIFY_INVITE=<n> node scripts/verify-ui.ts <stateFile> [route ...]`: console errors, failed requests, horizontal overflow, axe, and screenshots at 375, 768, and 1440 px. Each invite index is single use.
2. Screenshots in light mode: wait for sheets and toasts to settle and capture with animations disabled; prefer element captures. `magick mogrify -resize '1024x>' .claude/tmp/screenshots/*.png`, then review only the screens you changed.
3. Lighthouse (performance, accessibility) on a production build in its own dir, never `apps/web/dist`: `bunx vite build --outDir <tmp>/dist-preview`, `bunx vite preview --outDir <tmp>/dist-preview --port 4299`, then `npx -y lighthouse http://localhost:4299/survey --only-categories=accessibility,performance --chrome-flags="--headless=new"`. Dev-server performance scores mean nothing.
4. Self-critique against `apps/web/.impeccable/surfaces/apps-web.md` and `packages/ui-logic/src/tokens.ts` (and DESIGN.md once it exists).
5. Only after this passes: `/impeccable critique` and `/impeccable audit`.

**Tools:** Playwright CLI (the script) for routine checks; Playwright MCP only for exploratory sessions. Browser on localhost only. Never use MCP `browser_evaluate` or other arbitrary-code tools.

**Done for a UI task:** console clean, axe zero violations, no horizontal overflow at any width, screenshots reviewed at all three widths, deviations from tokens or the contract listed.

**Cleanup:** never run `rm` or any shell delete (each one blocks on a permission prompt). `verify-ui.ts` empties `.claude/tmp/screenshots/` at the start of each run; throwaway scripts go in `$CLAUDE_JOB_DIR/tmp` and stay there.

## Writing conventions

- Never use em-dashes in UI copy, docs, comments, or commit messages. Use commas or colons.
- UI copy is short and literal. No hype. Voice is dry and student-made.

## Git workflow

Commit automatically while working. Do not wait to be asked.

- **Branches:** day-to-day work lives on `dev` (or short feature branches merged into `dev`). Push `dev` freely; it never builds on Cloudflare. `main` is what is live: merge `dev` into `main` only to ship, at most 10 pushes to `main` a day (the pre-push guard enforces it), and only after the full Playwright suite passes on `dev`. Never commit directly on `main`.

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

When instructed to hand off or refresh the handoff, overwrite HANDOFF.md with:

- Goal: one sentence, the overall objective
- State: what is done, verified, and committed (with commit hashes)
- In progress: exact file/function being changed and its current condition
- Next steps: ordered, concrete, each independently executable
- Decisions: choices made and why, including rejected approaches
- Gotchas: failing tests, env quirks, commands that must be run
- Verify: command(s) that prove the work is correct

Write it for an agent with zero context. No narrative. HANDOFF.md is gitignored; never commit it. Writing the handoff does not mean stopping: keep working on the task unless told to stop. When all Next steps are done and verified, delete HANDOFF.md.
