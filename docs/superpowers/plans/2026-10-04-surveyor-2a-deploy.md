# Surveyor 2a Deploy and Ops Implementation Plan (Plan E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **OWNER** need a human with account access; an agent must stop there and hand over.

**Goal:** Take the phase 2a stack live on card-free free tiers (Render for the API, Neon for Postgres, Cloudflare Pages for the PWA and the data site), with deploy config as code, a guarded migration workflow, encrypted weekly backups, a post-deploy smoke check, an ops runbook someone with no context can follow, and the real-device acceptance runbook.

**Architecture:** `render.yaml` describes the API service; the Render blueprint does not auto-deploy. A GitHub Actions workflow (`migrate.yml`, environment `production`, reviewer approval) checks that `DATABASE_URL_DIRECT` points at the expected Neon host, runs `bun run db:migrate`, then calls the Render deploy hook, so schema always lands before code. `smoke-deploy` (pure `checkDeploy` in `apps/server/src/deploy/`, thin script, workflow) retries `/health` through a cold start, checks CORS from `WEB_ORIGIN`, then validates the data site pointer and bundle with core `BundlePointer` and `parseBundle`. `backup.yml` runs `pg_dump`, encrypts with `age`, and stores a 90-day artifact. The PWA project `study-spot` builds from GitHub on Pages (after plan D); `study-spot-data` is created empty with wrangler and filled only by the publisher.

**Tech Stack:** Render blueprint (`render.yaml`), Neon Postgres (pooled and direct URLs), Cloudflare Pages (Git build and direct upload), GitHub Actions (`actions/checkout@v7`, `oven-sh/setup-bun@v2` with Bun 1.3.14, `actions/setup-node@v7` with Node 24, as in `ci.yml`), `age`, `pg_dump`, Zod 4.6, Bun test runner, Node 24 type stripping.

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (sections 2 decisions S5 and S6, 6 Environment, 9 Deploy and ops, 11 Risks, 12 Acceptance). Index: `docs/superpowers/plans/2026-10-04-surveyor-2a-index.md` (this is plan E: tasks 1 to 7 run after plan A, tasks 8 to 10 after plan D). Plan A: `docs/superpowers/plans/2026-10-04-surveyor-2a-server.md` (env.ts in Task 1, publisher and `PagesTarget` in Task 8, `admin:invite` in Task 4, docs in Task 9). Rules: `CLAUDE.md`.

## Global Constraints

- TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. No `any`, no unjustified `!`, no TS `enum`. Relative imports use explicit `.ts` extensions.
- No `Bun.*` APIs in `apps/server` or `packages/*`; all new server code runs on Node 24. Scripts are run with `node`.
- Zod at every trust boundary, including env read by scripts and every remote response in `checkDeploy`.
- Never migrate on server start. The only code path that runs migrations is `migrate.yml` (Task 5 has a test for it) or an owner running `bun run db:migrate` by hand.
- No secret is ever written to a file in the repo, a commit, a log line, or an error message. Scripts print hosts, never URLs with credentials.
- Privacy rules in `CLAUDE.md` still apply: nothing in this plan collects locations or counts. Backups hold surveyor display names and photos only.
- No em-dashes in code, comments, docs, UI copy, or commit messages. Use commas or colons.
- Commits: Conventional Commits, subject 72 characters or fewer, imperative, lowercase, no trailing period, no attribution lines. Every commit passes `bun run typecheck && bun run lint && bun test`; run `bun run fix` first.
- Values only the owner can supply (account ids, tokens, hostnames, URLs with passwords) are always named env vars or secrets in this plan, never invented.

## Review Focus

1. **Render free instance asleep during the first sync.** A free instance spins down after 15 minutes idle and takes about a minute to wake. A smoke check or surveyor that gives up early reports a healthy deploy as broken. Check in Task 4: `checkDeploy` retries `/health` (test "a cold start that answers on the third try passes"), and the acceptance runbook (Task 9) has a "wake the API first" step.
2. **CORS origin mismatch between `pages.dev` and `onrender.com`.** `WEB_ORIGIN` must equal the PWA origin exactly, and Cloudflare or Render may add a suffix to a taken name. Preview deployments get other origins and are rejected by design. Check in Task 4: the smoke sends a preflight with `Origin: WEB_ORIGIN` and requires it echoed, and a second preflight from a foreign origin must not be (tests "a wrong allowed origin fails at the cors step"); Task 2 makes the owner copy real hostnames from dashboards.
3. **A Pages deployment replaces the whole data site and drops old hashed bundles still cached by clients.** Each publish ships only the current `bundle.<hash>.json`. Check in Task 4: the smoke follows the pointer to the hashed file and requires `immutable` caching, so a pointer that names a missing file fails (test "a pointer to a missing bundle fails at the bundle step"); Task 1 documents the client fallback (cached bundle until the pointer is refetched) and the 20,000 file limit.
4. **Neon connection limits and SSL mode.** Free compute suspends after 5 minutes idle. Pooled URLs (`-pooler`) suit the long-lived API; migrations and `pg_dump` need the direct URL; `channel_binding=require` in a pasted string may not work with postgres.js. Check in Task 5: `checkDbHost` requires `sslmode=require` and the right host (tests), and Task 7 step 3 runs the exact Neon string through `db:migrate` locally before it goes into a secret.
5. **A migration run against the wrong database.** A pasted dev URL in the `production` secret would be migrated without complaint. Check in Task 5: a non-secret repo variable `EXPECTED_DB_HOST` holds the production Neon host and `assert-db-host.ts` runs before `db:migrate` (test "a different host is rejected"); the `production` environment also needs a reviewer and allows only `main` and `v*` tags.

## Decisions where the spec is silent

Recorded in `docs/context/overview.md` as decision 16 by Task 10.

- **Release order.** The blueprint sets `autoDeployTrigger: "off"` (quoted, because bare `off` is YAML boolean false). A deploy is `git tag vX.Y.Z && git push --tags`: `migrate.yml` migrates, then POSTs the Render deploy hook with `ref=<sha>`, then runs the smoke. A push to `main` never deploys the API. Migrations must be additive (expand, then contract in a later release) because the old server runs until the hook finishes.
- **Two Neon URLs.** Render gets the pooled URL as `DATABASE_URL`. GitHub environment secret `DATABASE_URL_DIRECT` (no `-pooler`) is used for migrations and `pg_dump`. Both carry `?sslmode=require`.
- **Backups: encrypted `pg_dump` as a GitHub Actions artifact, 90-day retention.** Chosen over an encrypted dump committed to a private repo: no second repo to own at handoff, no history growth from photo bytes, retention expires on its own, and nothing needs a card. The repo is public, so artifacts are downloadable by anyone and encryption with `age` is mandatory; the public key is the repo variable `BACKUP_AGE_RECIPIENT`, the private key lives with the two admins. Limits: 90 days maximum retention, and scheduled workflows are disabled after 60 days without repo activity (a tag push or any commit re-arms them; documented). R2 is rejected: it needs a payment method (spec S5).
- **Web env var contract for plan D:** `VITE_API_BASE_URL` (API origin, no trailing slash) and `VITE_DATA_BASE_URL` (same value as server `DATA_BASE_URL`). Plan D reads exactly these names.
- **Server pooling.** The API uses the pooled URL, which supports protocol-level prepared statements and transactions; `withWrite` and the receipt lock only use plain transactions. If Task 7 step 8 shows pooler trouble, switch Render to the direct URL (free compute allows it) and record it.
- **No keep-alive pinger in v0.** The offline outbox covers cold starts (spec section 11). An always-on instance would fit in 750 monthly hours, but a scheduled ping from Actions is unreliable and `/health` does not wake Neon anyway.
- **Source checks (2026-10-04).** Render's own article says free web services need no credit card, while community posts say a card is required for verification; this plan treats it as a gate at sign-up (Task 2). The same gate applies to second admin seats on each service.

## File Structure

```
render.yaml                                    Render blueprint for the API service
package.json                                   + smoke:deploy script
.github/workflows/migrate.yml                  guarded migrate, deploy hook, smoke
.github/workflows/smoke-deploy.yml             dispatch and workflow_call smoke
.github/workflows/backup.yml                   weekly encrypted pg_dump artifact

apps/server/src/deploy/check.ts                checkDeploy: health, cors, pointer, bundle
apps/server/src/deploy/dbHost.ts               checkDbHost: host and sslmode guard
apps/server/scripts/smoke-deploy.ts            env, run checkDeploy, exit code
apps/server/scripts/assert-db-host.ts          env, run checkDbHost, exit code
apps/server/test/deploy.test.ts                render.yaml, workflow, and no-migrate-on-start checks
apps/server/test/check.test.ts                 checkDeploy with a fake fetch
apps/server/test/dbHost.test.ts                checkDbHost

docs/ops.md                                    runbook (Task 1; PWA section marked after plan D)
docs/runbooks/surveyor-2a-acceptance.md        real-device acceptance (Task 9)
docs/context/overview.md                       decision 16
```

Out of scope: custom domain, R2, monitoring beyond the smoke, staging environment, Render paid plans, 2b maintenance jobs.

---

## After plan A

### Task 1: `docs/ops.md`

**Files:**
- Create: `docs/ops.md`

**Interfaces:**
- Produces: the runbook. Names that later tasks must match: secrets `DATABASE_URL_DIRECT`, `RENDER_DEPLOY_HOOK_URL`, `BACKUP_DATABASE_URL`; variables `EXPECTED_DB_HOST`, `API_BASE_URL`, `WEB_ORIGIN`, `DATA_BASE_URL`, `PG_MAJOR`, `BACKUP_AGE_RECIPIENT`; environments `production`, `backup`.
- Consumes: env keys from plan A Task 1 (`apps/server/src/env.ts`), `admin:invite` (plan A Task 4), `docs/context/data-model.md` and `overview.md` updates from plan A Task 9 (not duplicated here).

- [ ] **Step 1: Write the runbook**

Create `docs/ops.md` with exactly this content:

`````markdown
# Operations runbook

Card-free stack for the Perch survey tooling: Render (API), Neon (Postgres), Cloudflare Pages (PWA and data site), GitHub Actions (migrations, backups, smoke). Design and data model live in `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` and `docs/context/data-model.md`. Free-tier terms below were checked on 2026-10-04; they change, so re-read the linked pages (section 12) before relying on a number.

## 1. Before you start

- Use one club email address (a shared inbox or Google Group the club controls), not a personal one, for every account below. Put every password and recovery code in the club password manager.
- Every service gets two admins. Invite the second admin right after creating the account. If a service puts a second seat behind payment, do not pay: store the login in the password manager with two named holders and write that down in `docs/ops.md` section 11.
- Do the Cloudflare account on day one. New Cloudflare accounts can have project creation restricted for about 48 hours.
- Card gate: if any sign-up below asks for a card, stop and record which service and screen. Render's own page says no card is needed for free web services, community posts report a verification charge. Do not continue past a card prompt without a club decision.
- Never paste a secret into chat, an issue, or a commit. Hostnames and project names are not secret; tokens and database URLs are.

## 2. Accounts (owner, once)

### 2.1 GitHub

1. Repo Settings > Collaborators and teams: add the second admin with the Admin role.
2. Repo Settings > Environments > New environment, name `production`. Tick Required reviewers and add both admins. Under Deployment branches and tags choose Selected branches and tags, add rule `main` (Branch) and rule `v*` (Tag). Both are needed: tags for releases, `main` for manual runs.
3. Repeat for a second environment named `backup`: no reviewers, same branch rule `main`.
4. Environments with reviewers are available on GitHub Free for public repos. If the repo becomes private, they need a paid plan.

### 2.2 Neon (Postgres)

1. Go to https://console.neon.com and sign up with the club email. Neon's pricing page says the Free plan needs no credit card.
2. Create project: name `study-spot`, Postgres 17, a US East AWS region (closest to Render's Virginia region). Free plan: 1 GB per project, 100 compute-hours a month, compute suspends after 5 idle minutes (cannot be turned off), 6 hours of point-in-time restore.
3. Dashboard > Connect (labels may differ). Copy two strings and store them in the password manager:
   - pooled (host contains `-pooler`): becomes Render `DATABASE_URL`.
   - direct (no `-pooler`): becomes GitHub secret `DATABASE_URL_DIRECT` and `BACKUP_DATABASE_URL`.
4. Both must end with `?sslmode=require`. If the string has `&channel_binding=require`, test it per section 6 step 1; remove that parameter if the app or `db:migrate` rejects it.
5. Project Settings > Members (or the organization's members page): invite the second admin.
6. Record the direct host (for example `ep-example-123456.us-east-2.aws.neon.tech`, not secret) as repo variable `EXPECTED_DB_HOST`.

### 2.3 Render (API)

1. Go to https://dashboard.render.com, sign up with the club email, connect GitHub (install the Render app on the `study-spot` repo only).
2. Free web service terms: spins down after 15 minutes with no inbound traffic, about one minute to wake, 750 free instance hours per workspace per month. Render's free Postgres expires after 30 days; do not use it, the database is Neon.
3. Dashboard > New > Blueprint > pick the repo. Render reads `render.yaml` and prompts once for every `sync: false` variable. Enter them from section 4. `NODE_VERSION=24` is already in the file (Node 24 is needed for type stripping).
4. After the first deploy, open the service page and copy the real URL from the header (it may carry a suffix if the name was taken). That value is `API_BASE_URL`.
5. Service Settings: copy the Deploy Hook URL into GitHub environment `production` as secret `RENDER_DEPLOY_HOOK_URL`. Confirm Auto-Deploy shows as off or "Off" (the file sets `autoDeployTrigger: "off"`).
6. Workspace Settings > Members: invite the second admin.

### 2.4 Cloudflare

1. Go to https://dash.cloudflare.com/sign-up, sign up with the club email, enable two-factor auth. Invite the second admin: Manage Account > Members.
2. Your account id is the first path segment of the dashboard URL (`dash.cloudflare.com/<account_id>/...`). It is not secret. Store it as `CF_ACCOUNT_ID`.
3. Create the API token (section 5), then create the data project empty with wrangler. The dashboard cannot create an empty project (drag-and-drop needs files), and a direct-upload project can never be switched to Git, which is what the data site wants:

   ```bash
   export CLOUDFLARE_ACCOUNT_ID=<your account id>
   export CLOUDFLARE_API_TOKEN=<token from section 5>
   npx wrangler pages project create study-spot-data --production-branch main
   ```

   Copy the project's real `*.pages.dev` hostname from Workers & Pages > study-spot-data. That origin is `DATA_BASE_URL`.
4. The PWA project `study-spot` is created later, after plan D, from Git (section 9). Never create it with direct upload.

## 3. Values to record

| Name | Where it comes from | Secret |
|---|---|---|
| `API_BASE_URL` | Render service page header | no |
| `WEB_ORIGIN` | `study-spot` project's `*.pages.dev` origin, no path, no trailing slash | no |
| `DATA_BASE_URL` | `study-spot-data` project's `*.pages.dev` origin, no trailing slash | no |
| `EXPECTED_DB_HOST` | Neon direct host | no |
| `CF_ACCOUNT_ID` | Cloudflare dashboard URL | no |
| `DATABASE_URL`, `DATABASE_URL_DIRECT` | Neon Connect dialog | yes |
| `CF_API_TOKEN` | Cloudflare token (section 5) | yes |
| `RENDER_DEPLOY_HOOK_URL` | Render service Settings | yes |

Copy hostnames from each dashboard. Never derive them from project names: Cloudflare and Render add a suffix when a name is taken, and a wrong `WEB_ORIGIN` makes every browser request fail CORS.

## 4. Environment variable reference

Set on Render (from `render.yaml`; secrets are prompted once, then edited under the service's Environment tab). Matches `apps/server/src/env.ts`; the server refuses to start on invalid values.

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon pooled URL | secret; `postgres://` with `sslmode=require` |
| `WEB_ORIGIN` | PWA origin | the only origin CORS allows; no path, no trailing slash |
| `DATA_BASE_URL` | data site origin | trailing slashes stripped; must be a dotted host |
| `PUBLISH_TARGET` | `pages` | `fs` is for local dev and the VPS fallback |
| `CF_ACCOUNT_ID` | account id | |
| `CF_API_TOKEN` | Pages edit token | secret |
| `CF_DATA_PROJECT` | `study-spot-data` | |
| `CAMPUS_ID` | `sbu` | default if unset |
| `PORT` | set by Render | do not set |
| `NODE_VERSION` | `24` | Render build setting, not read by the app |
| `FS_PUBLISH_DIR` | directory | only with `PUBLISH_TARGET=fs` |

GitHub, repository variables (Settings > Secrets and variables > Actions > Variables): `API_BASE_URL`, `WEB_ORIGIN`, `DATA_BASE_URL`, `EXPECTED_DB_HOST`, `PG_MAJOR` (the Neon Postgres major, `17`), `BACKUP_AGE_RECIPIENT`.
GitHub, environment `production` secrets: `DATABASE_URL_DIRECT`, `RENDER_DEPLOY_HOOK_URL`. Environment `backup` secret: `BACKUP_DATABASE_URL`.

## 5. Cloudflare API token (Pages edit only)

Create (owner):

1. Dashboard > Manage Account > API Tokens > Create Token (or My Profile > API Tokens). Under Custom token choose Get started.
2. Token name `study-spot-publisher`. Permissions: one row, Account > Cloudflare Pages > Edit. Account Resources: Include > the club account only. Optionally set a TTL (for example 12 months) and put a reminder in the club calendar.
3. Continue to summary > Create Token. The secret is shown once: put it in the password manager, then in Render as `CF_API_TOKEN`.
4. Check it: `curl -s -H "Authorization: Bearer $CF_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` should print `"status":"active"`. (If an account-owned token is used, verify with `.../accounts/$CF_ACCOUNT_ID/tokens/verify`.)

Rotate (every 12 months, or on any suspicion):

1. Create a new token with the same single permission.
2. Render service > Environment: replace `CF_API_TOKEN`, Save, let it redeploy.
3. From the admin screen run Publish now (or `POST /admin/publish`) and confirm last published time moves.
4. Dashboard > API Tokens: delete the old token (Roll is also fine, then update Render).

## 6. Migrations

Migrations are never run by the server. They run from GitHub (section 8) or, for first setup, by hand.

1. First time only, test the exact Neon direct string locally, so SSL or `channel_binding` problems show up before it becomes a secret:

   ```bash
   read -rs DATABASE_URL && export DATABASE_URL
   bun run db:migrate
   ```

   Expected: `migrations applied`. Seeding production is not done; the first surveyor data comes from the app.
2. Afterwards: Actions > migrate > Run workflow (branch `main`), approve the `production` deployment. The workflow checks the database host against `EXPECTED_DB_HOST` first and stops on a mismatch.
3. Migrations must be additive in the release that ships them. The old server keeps running until the deploy hook finishes.

## 7. First admin and later invites on production

Run from a trusted laptop with the repo checked out and `bun install` done. Use the direct URL; it is not saved in shell history with `read -s`.

```bash
read -rs DATABASE_URL && export DATABASE_URL
export WEB_ORIGIN=<the PWA origin>
bun run admin:invite "Your Name"
```

Expected: `admin invite for Your Name, valid until <48 hours from now>:` and a `https://<pwa>/invite/<token>` link. Open it inside the installed PWA on your phone. The link is single use. If it expires, run the command again. Further surveyors are invited from the admin screen. Close the shell afterwards (`unset DATABASE_URL`).

## 8. Releases

```bash
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

Actions > migrate starts, waits for a reviewer, then: host guard, `db:migrate`, Render deploy hook for that commit, smoke (`/health` with retry, CORS, data pointer, bundle). A failed smoke leaves the previous data site untouched. Render deploys also appear under the service's Events tab. A push to `main` does not deploy the API; it runs CI and, if the PWA project is connected, deploys the PWA (section 9).

## 9. PWA on Cloudflare Pages (after plan D)

Create `study-spot` from Git, never direct upload:

1. Workers & Pages > Create application > Pages > Import an existing Git repository (labels may differ) > pick the repo, production branch `main`.
2. Build settings:
   - Framework preset: None.
   - Root directory: leave empty (repo root, so Bun workspaces resolve `packages/*`).
   - Build command: `bun install --frozen-lockfile && bun run --filter '@study-spot/web' build`
   - Build output directory: `apps/web/dist`
3. Settings > Variables and secrets, for Production and Preview: `BUN_VERSION=1.3.14`, `NODE_VERSION=24`, `VITE_API_BASE_URL=<API_BASE_URL>`, `VITE_DATA_BASE_URL=<DATA_BASE_URL>`. The Pages v3 image ships Bun 1.2.15 by default, so pinning is required.
4. After the first build, copy the production origin into `WEB_ORIGIN` on Render (Environment tab) and in the repo variable `WEB_ORIGIN`, then redeploy the API with the deploy hook.
5. Preview deployments (other branches) run on different origins. The API's CORS rejects them by design, so previews can render but cannot sync. Set Settings > Builds > Branch control to production only if that is confusing.
6. Free plan limits: 500 builds a month, 25 MiB per file, 20,000 files per site. Direct-upload deployments of the data site do not use builds but share the file limit: each approved photo is one file, so plan for cleanup before about 15,000 photos.

## 10. Backups and restore

`backup.yml` runs Sundays 06:17 UTC and on demand: `pg_dump -Fc` from `BACKUP_DATABASE_URL`, encrypted with `age` to `BACKUP_AGE_RECIPIENT`, stored as artifact `perch-backup` for 90 days (the public-repo maximum). The artifact is downloadable by anyone, which is why it is encrypted. The data site also holds the last published bundle and photos, so published content survives a database loss; surveyor accounts, drafts, and unpublished photos do not.

One-time setup (owner, two admins together):

```bash
age-keygen -o perch-backup.key
```

Prints `Public key: age1...`. Put that value in repo variable `BACKUP_AGE_RECIPIENT`. Store `perch-backup.key` in the password manager for both admins, then delete the local file. Without the private key a backup is useless.

Restore drill (do it once before surveying, then each term):

1. Download the artifact (Actions > backup > run > Artifacts), unzip.
2. In Neon create a branch (Branches > Create branch) so production is untouched; copy that branch's direct URL.
3. `age -d -i perch-backup.key backup.dump.age > backup.dump`
4. `pg_restore --no-owner --no-acl -d "<branch direct url>" backup.dump`
5. Point `DATABASE_URL` at the branch and run `bun run admin:invite "Drill"`; delete the branch.

Notes: `pg_dump` must be at least as new as Neon's server (the workflow installs `postgresql-client-$PG_MAJOR` and fails on a mismatch). GitHub disables scheduled workflows after 60 days without repo activity; if backups stop, push any commit or re-enable it under Actions. Neon's own 6-hour restore window is a safety net, not a backup. A manual snapshot (1 allowed on free) before risky migrations is cheap.

## 11. Limits, sleep, and handoff

- First request after 15 idle minutes takes about a minute (Render). First database query after 5 idle minutes adds a short wake delay (Neon). The offline outbox hides both from surveyors. Before a survey session, open `<API_BASE_URL>/health` once.
- Handoff checklist: second admin on GitHub, Neon, Render, Cloudflare; the age private key held by both; token reminder in the calendar; this file read through once on a clean laptop.
- Shared logins (only if a service paywalls a second seat): record service name and the two holders here.

## 12. VPS fallback

Use if Render, Neon, or Pages become unusable. A small VPS (Hetzner-style, 2 GB RAM) runs everything on one box; it costs money and a card, so it is a fallback, not the plan. `PUBLISH_TARGET=fs` replaces Cloudflare: the publisher writes the data site to a directory and Caddy serves it.

1. Install Postgres 17, Node 24, Caddy, Bun (for `bun install`). Create database and user, then `DATABASE_URL=postgres://perch:<pw>@127.0.0.1:5432/perch`. Run `bun run db:migrate` by hand.
2. Clone the repo to `/srv/perch`, `bun install --frozen-lockfile`.
3. `/etc/perch.env` (mode 600): `DATABASE_URL`, `WEB_ORIGIN=https://app.<domain>`, `DATA_BASE_URL=https://data.<domain>`, `PUBLISH_TARGET=fs`, `FS_PUBLISH_DIR=/srv/perch-data`, `PORT=3000`.
4. `/etc/systemd/system/perch.service`: `ExecStart=/usr/bin/node /srv/perch/apps/server/src/main.ts`, `EnvironmentFile=/etc/perch.env`, `WorkingDirectory=/srv/perch`, `Restart=always`, `User=perch`.
5. `/etc/caddy/Caddyfile`:

   ```
   api.<domain> {
     reverse_proxy 127.0.0.1:3000
   }
   data.<domain> {
     root * /srv/perch-data
     header Access-Control-Allow-Origin "*"
     @pointer path /bundle-latest.json
     header @pointer Cache-Control "no-cache"
     @hashed path /bundle.* /photos/*
     header @hashed Cache-Control "public, max-age=31536000, immutable"
     file_server
   }
   app.<domain> {
     root * /srv/perch-web
     try_files {path} /index.html
     file_server
   }
   ```

6. Build the PWA elsewhere with `VITE_API_BASE_URL=https://api.<domain>` and `VITE_DATA_BASE_URL=https://data.<domain>`, copy `apps/web/dist` to `/srv/perch-web`.
7. Run `smoke-deploy` with the new origins. Back up with a cron `pg_dump -Fc | age -r <recipient>` to another machine. `FsTarget` never deletes old hashed bundles, which also keeps cached clients working.

## 13. Sources (checked 2026-10-04)

- Render blueprint spec: https://render.com/docs/blueprint-spec
- Render free tier: https://render.com/docs/free ; https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026.md
- Render Node version: https://render.com/docs/node-version ; deploy hooks: https://render.com/docs/deploy-hooks
- Neon plans: https://neon.com/docs/introduction/plans ; pricing: https://neon.com/pricing ; pooling: https://neon.com/docs/connect/connection-pooling
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/ ; direct upload: https://developers.cloudflare.com/pages/get-started/direct-upload/ ; build image: https://developers.cloudflare.com/pages/configuration/build-image/ ; headers: https://developers.cloudflare.com/pages/configuration/headers/
- Cloudflare API tokens: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ ; direct upload with CI: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration
- GitHub environments: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment
`````

- [ ] **Step 2: Check for em-dashes and stray placeholders**

Run: `grep -n "$(printf '\342\200\224')" docs/ops.md || echo clean`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add docs/ops.md
git commit -m "docs: add ops runbook for deploy, backup, and recovery"
```

---

### Task 2: OWNER provisioning (day one)

**Files:** none in the repo. Output: the values in `docs/ops.md` section 3 stored in the password manager, plus GitHub variables and environments.

**Interfaces:**
- Produces: accounts, Neon project, Cloudflare token and empty `study-spot-data` project, GitHub environments `production` and `backup`, variables `EXPECTED_DB_HOST`, `PG_MAJOR`, `BACKUP_AGE_RECIPIENT`, secrets `DATABASE_URL_DIRECT`, `BACKUP_DATABASE_URL`. Render service and `RENDER_DEPLOY_HOOK_URL` come in Task 7 (they need `render.yaml`).
- Consumes: `docs/ops.md` (Task 1).

This is manual work, about 30 minutes plus Cloudflare's possible 48 hour wait. Start it as soon as plan A merges, or earlier: nothing here needs code. An agent cannot do these steps.

- [ ] **Step 1: OWNER, club email and password manager.** Create or confirm the club shared inbox and password manager vault with two members.
- [ ] **Step 2: OWNER, Cloudflare account.** Follow `docs/ops.md` section 2.4 steps 1 and 2. If the card gate trips, stop and record the screen. Note the time: project creation may be blocked for about 48 hours.
- [ ] **Step 3: OWNER, Neon.** Follow section 2.2 steps 1 to 6. Record `EXPECTED_DB_HOST`.
- [ ] **Step 4: OWNER, Render account only.** Sign up and connect GitHub (section 2.3 steps 1 and 2). Do not create the service yet.
- [ ] **Step 5: OWNER, GitHub.** Section 2.1 steps 1 to 3. Then Settings > Secrets and variables > Actions > Variables > New repository variable: `EXPECTED_DB_HOST`, `PG_MAJOR=17`. Environment `production` > Add environment secret: `DATABASE_URL_DIRECT`. Environment `backup` > Add environment secret: `BACKUP_DATABASE_URL`.
- [ ] **Step 6: OWNER, Cloudflare token and data project.** Section 5 create steps 1 to 4, then section 2.4 step 3. Expected last line of wrangler: `Successfully created the 'study-spot-data' project.` Record `DATA_BASE_URL` (the real `*.pages.dev` origin) as a repo variable.
- [ ] **Step 7: OWNER, backup key.** Section 10 one-time setup, then set repo variable `BACKUP_AGE_RECIPIENT`.
- [ ] **Step 8: OWNER, second admins.** Invite them on all four services. Record any service that paywalls a seat in `docs/ops.md` section 11.
- [ ] **Step 9: Verify.** Check each item and tick it: both environments exist and show the `main` and `v*` rules; the variables list shows `EXPECTED_DB_HOST`, `PG_MAJOR`, `BACKUP_AGE_RECIPIENT`, `DATA_BASE_URL`; `curl` token verify prints `"status":"active"`. No commit.

---

### Task 3: `render.yaml` and deploy config tests

**Files:**
- Create: `render.yaml`, `apps/server/test/deploy.test.ts`

**Interfaces:**
- Produces: blueprint service `study-spot-api`; a test that keeps the blueprint's env keys equal to `apps/server/src/env.ts` and the secrets flagged `sync: false`.
- Consumes: `Env` (plan A Task 1).

- [ ] **Step 1: Write the failing test**

`apps/server/test/deploy.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Env } from "../src/env.ts";

const root = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path), "utf8");

/** Splits a blueprint's envVars list into key -> block text without a YAML dependency. */
function envBlocks(yaml: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const parts = yaml.split(/^\s+- key: /m).slice(1);
  for (const part of parts) {
    const key = part.split("\n")[0]?.trim();
    if (key) blocks.set(key, part);
  }
  return blocks;
}

test("render.yaml env keys match env.ts, plus NODE_VERSION, minus PORT and FS_PUBLISH_DIR", () => {
  const fromEnv = new Set<string>();
  for (const option of Env.options) for (const key of Object.keys(option.shape)) fromEnv.add(key);
  fromEnv.delete("PORT");
  fromEnv.delete("FS_PUBLISH_DIR");
  fromEnv.add("NODE_VERSION");
  expect([...envBlocks(read("render.yaml")).keys()].sort()).toEqual([...fromEnv].sort());
});

test("secrets and origins are prompted with sync false and never carry a value", () => {
  const blocks = envBlocks(read("render.yaml"));
  for (const key of ["DATABASE_URL", "CF_API_TOKEN", "CF_ACCOUNT_ID", "WEB_ORIGIN", "DATA_BASE_URL"]) {
    const block = blocks.get(key) ?? "";
    expect(block).toContain("sync: false");
    expect(block).not.toContain("value:");
  }
  expect(blocks.get("PUBLISH_TARGET")).toContain('value: "pages"');
});

test("the service uses the free plan, the health path, and the Node start command", () => {
  const yaml = read("render.yaml");
  expect(yaml).toContain("plan: free");
  expect(yaml).toContain("healthCheckPath: /health");
  expect(yaml).toContain("startCommand: node apps/server/src/main.ts");
  // Bare off is YAML boolean false, which Render would reject.
  expect(yaml).toContain('autoDeployTrigger: "off"');
});

test("the server never runs migrations on start", () => {
  const files = readdirSync(root("apps/server/src"), { recursive: true, encoding: "utf8" });
  for (const file of files.filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(root(`apps/server/src/${file}`), "utf8");
    expect(text).not.toMatch(/migrate\(|db:migrate|drizzle-orm\/postgres-js\/migrator/);
  }
});
```

Run: `bun test apps/server/test/deploy.test.ts`
Expected: FAIL: `ENOENT` for `render.yaml`.

- [ ] **Step 2: Write the blueprint**

Schema checked against https://render.com/docs/blueprint-spec: `autoDeployTrigger` replaces the deprecated `autoDeploy`; `sync: false` prompts only at initial creation; `plan: free` is allowed. Region `virginia` is closest to Neon US East; if the dashboard lists a different region name, use that.

`render.yaml`:

```yaml
services:
  - type: web
    name: study-spot-api
    runtime: node
    plan: free
    region: virginia
    branch: main
    # Releases go through .github/workflows/migrate.yml, which migrates and then calls the deploy hook.
    autoDeployTrigger: "off"
    # Bun installs the workspace (npm cannot resolve workspace:* dependencies). The server runs on Node.
    buildCommand: npx --yes bun@1.3.14 install --frozen-lockfile
    startCommand: node apps/server/src/main.ts
    healthCheckPath: /health
    envVars:
      - key: NODE_VERSION
        value: "24"
      - key: DATABASE_URL
        sync: false
      - key: WEB_ORIGIN
        sync: false
      - key: DATA_BASE_URL
        sync: false
      - key: PUBLISH_TARGET
        value: "pages"
      - key: CF_ACCOUNT_ID
        sync: false
      - key: CF_API_TOKEN
        sync: false
      - key: CF_DATA_PROJECT
        value: "study-spot-data"
      - key: CAMPUS_ID
        value: "sbu"
```

- [ ] **Step 3: Run the tests**

Run: `bun test apps/server/test/deploy.test.ts`
Expected: PASS (4 tests). The migrate workflow test is added in Task 5, with the workflow itself, so every commit stays green.

- [ ] **Step 4: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add render.yaml apps/server/test/deploy.test.ts
git commit -m "build: add render blueprint for the api service"
```

---

### Task 4: `checkDeploy` and the smoke workflow

**Files:**
- Create: `apps/server/src/deploy/check.ts`, `apps/server/scripts/smoke-deploy.ts`, `apps/server/test/check.test.ts`, `.github/workflows/smoke-deploy.yml`
- Modify: `package.json` (`smoke:deploy`)

**Interfaces:**
- Produces: `type FetchLike = (url: string, init?: RequestInit) => Promise<Response>`; `type CheckOptions = { apiBaseUrl: string; webOrigin: string; dataBaseUrl: string; fetch?: FetchLike; maxHealthAttempts?: number; healthIntervalMs?: number; sleep?: (ms: number) => Promise<void> }`; `type CheckStep = "health" | "cors" | "pointer" | "bundle"`; `type CheckResult = { ok: true; hash: string; spots: number; healthAttempts: number } | { ok: false; step: CheckStep; detail: string }`; `checkDeploy(opts: CheckOptions): Promise<CheckResult>`.
- Produces: script `bun run smoke:deploy` (`node apps/server/scripts/smoke-deploy.ts`), env `API_BASE_URL`, `WEB_ORIGIN`, `DATA_BASE_URL`, `SMOKE_WAIT_SECONDS` (default 120).
- Consumes: `BundlePointer`, `parseBundle` (core); data site layout and `_headers` (plan A Decisions): pointer `no-cache`, hashed files `immutable`, CORS `*`; the pointer `url` is relative.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/check.test.ts`:

```ts
import { expect, test } from "bun:test";
import { buildBundle } from "@study-spot/db";
import { seed } from "@study-spot/db/seed";
import { createTestDb } from "@study-spot/db/testing";
import { type CheckResult, checkDeploy, type FetchLike } from "../src/deploy/check.ts";

const API = "https://study-spot-api.onrender.com";
const WEB = "https://study-spot.pages.dev";
const DATA = "https://study-spot-data.pages.dev";
const HASH = "0123456789abcdef";

const db = await createTestDb();
await seed(db);
const { bundle } = await buildBundle(db, "sbu", new Date("2026-10-13T18:00:00Z"));
const pointer = {
  schema_version: bundle.schema_version,
  hash: HASH,
  url: `bundle.${HASH}.json`,
  generated_at: "2026-10-13T18:00:00.000Z",
};

type Req = { url: string; method: string; origin: string | null };
type Handler = (req: Req) => Response;

function json(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A healthy deployment. Tests override one route at a time. */
const good: Handler = ({ url, method, origin }) => {
  if (url === `${API}/health`) return json({ ok: true });
  if (method === "OPTIONS" && url.startsWith(`${API}/survey/`)) {
    return origin === WEB
      ? new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": WEB,
            "access-control-allow-methods": "GET, POST, PUT",
          },
        })
      : new Response(null, { status: 204 });
  }
  if (url === `${DATA}/bundle-latest.json`) {
    return json(pointer, { "access-control-allow-origin": "*", "cache-control": "no-cache" });
  }
  if (url === `${DATA}/bundle.${HASH}.json`) {
    return json(bundle, { "cache-control": "public, max-age=31536000, immutable" });
  }
  return new Response("not found", { status: 404 });
};

function fakeFetch(handler: Handler): FetchLike {
  return async (url, init) =>
    handler({
      url,
      method: init?.method ?? "GET",
      origin: new Headers(init?.headers).get("origin"),
    });
}

const run = (handler: Handler, extra: { maxHealthAttempts?: number } = {}): Promise<CheckResult> =>
  checkDeploy({
    apiBaseUrl: API,
    webOrigin: WEB,
    dataBaseUrl: DATA,
    fetch: fakeFetch(handler),
    sleep: async () => {},
    ...extra,
  });

test("a healthy deployment passes and reports the bundle", async () => {
  const result = await run(good);
  expect(result).toEqual({ ok: true, hash: HASH, spots: bundle.spots.length, healthAttempts: 1 });
});

test("a cold start that answers on the third try passes", async () => {
  let calls = 0;
  const result = await run((req) => {
    if (req.url === `${API}/health` && ++calls < 3) return new Response("waking", { status: 503 });
    return good(req);
  });
  expect(result).toMatchObject({ ok: true, healthAttempts: 3 });
});

test("a service that never wakes fails at the health step", async () => {
  const result = await run(
    (req) => (req.url === `${API}/health` ? new Response("x", { status: 503 }) : good(req)),
    { maxHealthAttempts: 3 },
  );
  expect(result).toMatchObject({ ok: false, step: "health" });
});

test("a wrong allowed origin fails at the cors step", async () => {
  const result = await run((req) =>
    req.method === "OPTIONS"
      ? new Response(null, {
          status: 204,
          headers: { "access-control-allow-origin": "https://other.pages.dev" },
        })
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "cors" });
});

test("a server that allows any origin fails at the cors step", async () => {
  const result = await run((req) =>
    req.method === "OPTIONS"
      ? new Response(null, { status: 204, headers: { "access-control-allow-origin": req.origin ?? "*", "access-control-allow-methods": "PUT" } })
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "cors" });
});

test("a missing pointer fails at the pointer step with a publish hint", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle-latest.json` ? new Response("nope", { status: 404 }) : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "pointer" });
  if (!result.ok) expect(result.detail).toContain("publish");
});

test("a pointer without no-cache or cors fails at the pointer step", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle-latest.json` ? json(pointer) : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "pointer" });
});

test("a pointer to a missing bundle fails at the bundle step", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json` ? new Response("gone", { status: 404 }) : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "bundle" });
});

test("an invalid bundle or a mutable hashed file fails at the bundle step", async () => {
  const invalid = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json` ? json({ schema_version: bundle.schema_version }) : good(req),
  );
  expect(invalid).toMatchObject({ ok: false, step: "bundle" });
  const mutable = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json` ? json(bundle, { "cache-control": "no-cache" }) : good(req),
  );
  expect(mutable).toMatchObject({ ok: false, step: "bundle" });
});
```

Run: `bun test apps/server/test/check.test.ts`
Expected: FAIL: `Cannot find module '../src/deploy/check.ts'`.

- [ ] **Step 2: Implement `checkDeploy`**

`apps/server/src/deploy/check.ts`:

```ts
import { BundlePointer, parseBundle } from "@study-spot/core";
import { z } from "zod";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CheckOptions = {
  apiBaseUrl: string;
  webOrigin: string;
  dataBaseUrl: string;
  fetch?: FetchLike;
  /** A Render free instance needs about a minute to wake; the default covers two. */
  maxHealthAttempts?: number;
  healthIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type CheckStep = "health" | "cors" | "pointer" | "bundle";

export type CheckResult =
  | { ok: true; hash: string; spots: number; healthAttempts: number }
  | { ok: false; step: CheckStep; detail: string };

const Health = z.object({ ok: z.literal(true) });
const FOREIGN_ORIGIN = "https://not-the-web-origin.example";

function fail(step: CheckStep, detail: string): CheckResult {
  return { ok: false, step, detail };
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * Post-deploy checks, in order: the API answers (retrying through a cold start),
 * CORS allows exactly the PWA origin, the data pointer is valid and uncached, and
 * the hashed bundle it names parses with the core schema and is immutable.
 */
export async function checkDeploy(opts: CheckOptions): Promise<CheckResult> {
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = opts.maxHealthAttempts ?? 24;
  const interval = opts.healthIntervalMs ?? 5000;
  const api = trimSlash(opts.apiBaseUrl);
  const data = trimSlash(opts.dataBaseUrl);

  let healthAttempts = 0;
  let healthy = false;
  while (healthAttempts < attempts && !healthy) {
    healthAttempts += 1;
    try {
      const res = await doFetch(`${api}/health`, {});
      healthy = res.ok && Health.safeParse(await readJson(res)).success;
    } catch {
      healthy = false;
    }
    if (!healthy && healthAttempts < attempts) await sleep(interval);
  }
  if (!healthy) return fail("health", `no healthy /health answer after ${healthAttempts} attempts`);

  const preflight = (origin: string) =>
    doFetch(`${api}/survey/spots/x/identity`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const own = await preflight(opts.webOrigin);
  const allowed = own.headers.get("access-control-allow-origin");
  if (allowed !== opts.webOrigin) {
    return fail("cors", `WEB_ORIGIN ${opts.webOrigin} was answered with allow-origin ${allowed ?? "none"}; set WEB_ORIGIN on the API to the exact PWA origin`);
  }
  if (!(own.headers.get("access-control-allow-methods") ?? "").includes("PUT")) {
    return fail("cors", "preflight does not allow PUT");
  }
  const foreign = (await preflight(FOREIGN_ORIGIN)).headers.get("access-control-allow-origin");
  if (foreign !== null) return fail("cors", `a foreign origin was allowed (${foreign})`);

  const pointerRes = await doFetch(`${data}/bundle-latest.json`, {});
  if (!pointerRes.ok) {
    return fail("pointer", `bundle-latest.json answered ${pointerRes.status}; if nothing was published yet, run POST /admin/publish`);
  }
  if (pointerRes.headers.get("access-control-allow-origin") !== "*") {
    return fail("pointer", "bundle-latest.json lacks access-control-allow-origin: *; check the _headers file in the data site");
  }
  if (!(pointerRes.headers.get("cache-control") ?? "").includes("no-cache")) {
    return fail("pointer", "bundle-latest.json is cacheable; clients would keep stale pointers");
  }
  const pointer = BundlePointer.safeParse(await readJson(pointerRes));
  if (!pointer.success) return fail("pointer", z.prettifyError(pointer.error));

  const bundleUrl = new URL(pointer.data.url, `${data}/`).toString();
  const bundleRes = await doFetch(bundleUrl, {});
  if (!bundleRes.ok) {
    return fail("bundle", `${pointer.data.url} answered ${bundleRes.status}: the pointer names a file this deployment does not hold`);
  }
  if (!(bundleRes.headers.get("cache-control") ?? "").includes("immutable")) {
    return fail("bundle", "the hashed bundle is not served as immutable");
  }
  const parsed = parseBundle(await readJson(bundleRes));
  if (!parsed.ok) return fail("bundle", `${parsed.reason}: ${parsed.detail}`);

  return { ok: true, hash: pointer.data.hash, spots: parsed.bundle.spots.length, healthAttempts };
}
```

Run: `bun test apps/server/test/check.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 3: Write the script, package script, and workflow**

`apps/server/scripts/smoke-deploy.ts`:

```ts
import { z } from "zod";
import { checkDeploy } from "../src/deploy/check.ts";

/**
 * Post-deploy smoke against the live stack. Usage:
 * API_BASE_URL=... WEB_ORIGIN=... DATA_BASE_URL=... node apps/server/scripts/smoke-deploy.ts
 * SMOKE_WAIT_SECONDS (default 120) is how long to wait for a sleeping API to wake.
 */
const Url = z.url({ protocol: /^https?$/ });
const Args = z.object({
  API_BASE_URL: Url,
  WEB_ORIGIN: Url.refine((u) => new URL(u).origin === u, "must be an origin with no path"),
  DATA_BASE_URL: Url,
  SMOKE_WAIT_SECONDS: z.coerce.number().int().min(5).max(600).default(120),
});

const cleaned: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && value !== "") cleaned[key] = value;
}
const parsed = Args.safeParse(cleaned);
if (!parsed.success) {
  console.error(`smoke:deploy needs API_BASE_URL, WEB_ORIGIN, DATA_BASE_URL:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const env = parsed.data;
const result = await checkDeploy({
  apiBaseUrl: env.API_BASE_URL,
  webOrigin: env.WEB_ORIGIN,
  dataBaseUrl: env.DATA_BASE_URL,
  maxHealthAttempts: Math.ceil(env.SMOKE_WAIT_SECONDS / 5),
});
if (!result.ok) {
  console.error(`deploy smoke failed at ${result.step}: ${result.detail}`);
  process.exit(1);
}
console.log(
  `deploy smoke ok: ${result.spots} spots, bundle ${result.hash}, health after ${result.healthAttempts} attempt(s)`,
);
```

In `package.json`, replace:

```json
    "smoke:server": "node apps/server/scripts/smoke-server.ts",
```

with:

```json
    "smoke:server": "node apps/server/scripts/smoke-server.ts",
    "smoke:deploy": "node apps/server/scripts/smoke-deploy.ts",
```

`.github/workflows/smoke-deploy.yml`:

```yaml
name: smoke-deploy

on:
  workflow_dispatch:
  workflow_call:

permissions:
  contents: read

jobs:
  smoke:
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

      - name: Smoke the live stack
        run: bun run smoke:deploy
        env:
          API_BASE_URL: ${{ vars.API_BASE_URL }}
          WEB_ORIGIN: ${{ vars.WEB_ORIGIN }}
          DATA_BASE_URL: ${{ vars.DATA_BASE_URL }}
          SMOKE_WAIT_SECONDS: "180"
```

Run: `bun run smoke:deploy`
Expected: exit 1 with `smoke:deploy needs API_BASE_URL, WEB_ORIGIN, DATA_BASE_URL:` and the three missing keys. It is deliberately not part of the offline CI job; it needs a live stack.

- [ ] **Step 4: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server package.json .github/workflows/smoke-deploy.yml
git commit -m "feat(server): add post-deploy smoke for api, cors, and data site"
```

---

### Task 5: Host guard and the migration workflow

**Files:**
- Create: `apps/server/src/deploy/dbHost.ts`, `apps/server/scripts/assert-db-host.ts`, `apps/server/test/dbHost.test.ts`, `.github/workflows/migrate.yml`
- Modify: `apps/server/test/deploy.test.ts` (re-add the migrate workflow test)

**Interfaces:**
- Produces: `type HostCheck = { ok: true; host: string } | { ok: false; error: string }`; `checkDbHost(databaseUrl: string, expectedHost: string): HostCheck` (compares hosts with any `-pooler` suffix removed, requires `sslmode=require` or stronger, never echoes the URL).
- Consumes: `packages/db/scripts/migrate.ts` via `bun run db:migrate` (reads `DATABASE_URL`, `max: 1`); Task 4's `smoke-deploy.yml` as a reusable workflow.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/dbHost.test.ts`:

```ts
import { expect, test } from "bun:test";
import { checkDbHost } from "../src/deploy/dbHost.ts";

const HOST = "ep-cool-dew-123456.us-east-2.aws.neon.tech";
const url = (host: string, query = "?sslmode=require") => `postgres://u:secret@${host}/db${query}`;

test("the expected direct host passes", () => {
  expect(checkDbHost(url(HOST), HOST)).toEqual({ ok: true, host: HOST });
});

test("the pooled host of the same endpoint passes", () => {
  const pooled = "ep-cool-dew-123456-pooler.us-east-2.aws.neon.tech";
  expect(checkDbHost(url(pooled), HOST).ok).toBe(true);
});

test("a different host is rejected without printing the url", () => {
  const result = checkDbHost(url("ep-dev-999.us-east-2.aws.neon.tech"), HOST);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain("ep-dev-999");
    expect(result.error).not.toContain("secret");
  }
});

test("a missing or weak sslmode is rejected", () => {
  expect(checkDbHost(url(HOST, ""), HOST).ok).toBe(false);
  expect(checkDbHost(url(HOST, "?sslmode=disable"), HOST).ok).toBe(false);
  expect(checkDbHost(url(HOST, "?sslmode=verify-full"), HOST).ok).toBe(true);
});

test("garbage and non-postgres urls are rejected without echoing them", () => {
  for (const bad of ["", "not a url", "mysql://u:secret@h/db"]) {
    const result = checkDbHost(bad, HOST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("secret");
  }
});
```

Run: `bun test apps/server/test/dbHost.test.ts`
Expected: FAIL: `Cannot find module '../src/deploy/dbHost.ts'`.

- [ ] **Step 2: Implement the guard and its script**

`apps/server/src/deploy/dbHost.ts`:

```ts
export type HostCheck = { ok: true; host: string } | { ok: false; error: string };

const STRONG_SSL = new Set(["require", "verify-ca", "verify-full"]);

/** Neon's pooled hostname is the direct one with -pooler after the endpoint id. */
function normalize(host: string): string {
  return host.toLowerCase().replace(/-pooler(?=\.)/, "");
}

/**
 * Guards a migration or dump against the wrong database. Compares only the host,
 * and never puts the URL (which holds the password) in an error.
 */
export function checkDbHost(databaseUrl: string, expectedHost: string): HostCheck {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, error: "DATABASE_URL is not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, error: "DATABASE_URL is not a postgres:// URL" };
  }
  const sslmode = parsed.searchParams.get("sslmode") ?? "";
  if (!STRONG_SSL.has(sslmode)) {
    return { ok: false, error: "DATABASE_URL must set sslmode=require (or stronger)" };
  }
  const actual = normalize(parsed.hostname);
  const expected = normalize(expectedHost);
  if (actual !== expected) {
    return { ok: false, error: `database host ${actual} is not the expected ${expected}` };
  }
  return { ok: true, host: actual };
}
```

`apps/server/scripts/assert-db-host.ts`:

```ts
import { checkDbHost } from "../src/deploy/dbHost.ts";

/** Usage: DATABASE_URL=... EXPECTED_DB_HOST=... node apps/server/scripts/assert-db-host.ts */
const url = process.env.DATABASE_URL ?? "";
const expected = process.env.EXPECTED_DB_HOST ?? "";
if (url === "" || expected === "") {
  console.error("DATABASE_URL and EXPECTED_DB_HOST must both be set");
  process.exit(1);
}
const result = checkDbHost(url, expected);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log(`database host ok: ${result.host}`);
```

Run: `bun test apps/server/test/dbHost.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Write the migration workflow**

The deploy hook URL already carries a `?key=` query, so `&ref=` appends the commit (Render deploy hooks accept `ref`). `concurrency` stops two releases overlapping.

`.github/workflows/migrate.yml`:

```yaml
name: migrate

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

concurrency:
  group: production-release
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  migrate:
    runs-on: ubuntu-latest
    # Required reviewers and the main/v* rule are set on this environment (docs/ops.md 2.1).
    environment: production
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL_DIRECT }}
      EXPECTED_DB_HOST: ${{ vars.EXPECTED_DB_HOST }}
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

      - name: Check the database host
        run: node apps/server/scripts/assert-db-host.ts

      - name: Migrate
        run: bun run db:migrate

      - name: Deploy the API at this commit
        run: curl -fsS -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}&ref=${{ github.sha }}"

  smoke:
    needs: migrate
    uses: ./.github/workflows/smoke-deploy.yml
```

- [ ] **Step 4: Re-add the workflow test to `deploy.test.ts`**

Append to `apps/server/test/deploy.test.ts`:

```ts
test("migrations run only from migrate.yml, behind the production environment and a host guard", () => {
  const wf = read(".github/workflows/migrate.yml");
  expect(wf).toContain("workflow_dispatch:");
  expect(wf).toContain('- "v*"');
  expect(wf).not.toContain("pull_request");
  expect(wf).toContain("environment: production");
  expect(wf.indexOf("assert-db-host.ts")).toBeGreaterThan(-1);
  expect(wf.indexOf("assert-db-host.ts")).toBeLessThan(wf.indexOf("bun run db:migrate"));
  expect(wf.indexOf("bun run db:migrate")).toBeLessThan(wf.indexOf("RENDER_DEPLOY_HOOK_URL"));
});
```

Run: `bun test apps/server`
Expected: PASS (deploy.test.ts has 5 tests; all server tests pass).

Run: `DATABASE_URL=postgres://u:p@ep-a.neon.tech/db?sslmode=require EXPECTED_DB_HOST=ep-b.neon.tech node apps/server/scripts/assert-db-host.ts; echo "exit $?"`
Expected: `database host ep-a.neon.tech is not the expected ep-b.neon.tech` and `exit 1`.

- [ ] **Step 5: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add apps/server .github/workflows/migrate.yml
git commit -m "ci: add guarded production migration and release workflow"
```

---

### Task 6: Encrypted weekly backup workflow

**Files:**
- Create: `.github/workflows/backup.yml`
- Modify: `apps/server/test/deploy.test.ts` (one test)

**Interfaces:**
- Produces: workflow `backup` (cron `17 6 * * 0`, `workflow_dispatch`), artifact `perch-backup` containing `backup.dump.age`, retention 90 days.
- Consumes: environment `backup` with secret `BACKUP_DATABASE_URL`; variables `PG_MAJOR`, `BACKUP_AGE_RECIPIENT`, `EXPECTED_DB_HOST` (Task 2).

- [ ] **Step 1: Add the failing test**

Append to `apps/server/test/deploy.test.ts`:

```ts
test("the backup workflow encrypts before upload and never uploads a plain dump", () => {
  const wf = read(".github/workflows/backup.yml");
  expect(wf).toContain("environment: backup");
  expect(wf).toContain("age -r");
  expect(wf).toContain("retention-days: 90");
  expect(wf).toContain("path: backup.dump.age");
  expect(wf).not.toMatch(/path:\s*backup\.dump\s*$/m);
});
```

Run: `bun test apps/server/test/deploy.test.ts`
Expected: FAIL: `ENOENT` for `backup.yml`.

- [ ] **Step 2: Write the workflow**

`pg_dump` refuses a server newer than itself, so the job installs the client for `PG_MAJOR` from the PGDG apt repository and compares majors with the live server. `actions/upload-artifact@v4` is the version known good at planning time; bump it with the other actions if it is stale.

`.github/workflows/backup.yml`:

```yaml
name: backup

on:
  schedule:
    - cron: "17 6 * * 0"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  backup:
    runs-on: ubuntu-latest
    environment: backup
    env:
      DATABASE_URL: ${{ secrets.BACKUP_DATABASE_URL }}
      EXPECTED_DB_HOST: ${{ vars.EXPECTED_DB_HOST }}
      PG_MAJOR: ${{ vars.PG_MAJOR }}
      BACKUP_AGE_RECIPIENT: ${{ vars.BACKUP_AGE_RECIPIENT }}
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Check the database host
        run: node apps/server/scripts/assert-db-host.ts

      - name: Install pg_dump and age
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-common age
          sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
          sudo apt-get install -y "postgresql-client-${PG_MAJOR}"

      - name: Check client and server versions
        run: |
          server_major=$(psql "$DATABASE_URL" -Atc "show server_version_num" | cut -c1-2)
          client_major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
          echo "server $server_major, pg_dump $client_major"
          test "$client_major" -ge "$server_major"

      - name: Dump and encrypt
        run: |
          pg_dump -Fc --no-owner --no-acl "$DATABASE_URL" | age -r "$BACKUP_AGE_RECIPIENT" > backup.dump.age
          test -s backup.dump.age
          ls -l backup.dump.age

      - uses: actions/upload-artifact@v4
        with:
          name: perch-backup
          path: backup.dump.age
          retention-days: 90
          if-no-files-found: error
```

Run: `bun test apps/server/test/deploy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add .github/workflows/backup.yml apps/server/test/deploy.test.ts
git commit -m "ci: add weekly encrypted database backup"
```

---

### Task 7: First deploy of the API and data site

**Files:** none new. Pushes the merged work from Tasks 1 to 6 and wires the secrets.

**Interfaces:**
- Produces: a running `study-spot-api` on Render, a migrated Neon database, a first admin, a first data site deployment, a green smoke.
- Consumes: Tasks 1 to 6 merged to `main`; Task 2 values.

- [ ] **Step 1: Push and confirm CI.** Run: `git push origin main`. Expected: the `ci` workflow passes (the existing jobs plus `deploy.test.ts`, `check.test.ts`, `dbHost.test.ts` in `bun test`).
- [ ] **Step 2: OWNER, create the Render service.** `docs/ops.md` section 2.3 step 3 (New > Blueprint > repo; `render.yaml` is read from `main`). Enter prompted values: `DATABASE_URL` (pooled), `WEB_ORIGIN` (for now `http://localhost:5173`; fixed in Task 8), `DATA_BASE_URL` (Task 2 value), `CF_ACCOUNT_ID`, `CF_API_TOKEN`. Expected: first build runs `npx --yes bun@1.3.14 install --frozen-lockfile`, then the service reports healthy on `/health`. If the build fails because `bun` cannot be fetched or run, replace `buildCommand` with `curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14" && $HOME/.bun/bin/bun install --frozen-lockfile`, commit that change as `fix(deploy): install bun with the official script on render`, and re-sync the blueprint.
- [ ] **Step 3: OWNER, migrate by hand once.** `docs/ops.md` section 6 step 1 using the direct URL. Expected: `migrations applied`. If it fails on `channel_binding`, remove that parameter in the Neon string and update the stored values (`DATABASE_URL_DIRECT`, `BACKUP_DATABASE_URL`, Render `DATABASE_URL`).
- [ ] **Step 4: OWNER, finish the Render and GitHub wiring.** Copy the service URL into repo variable `API_BASE_URL`; copy the Deploy Hook into environment `production` secret `RENDER_DEPLOY_HOOK_URL` (section 2.3 step 5).
- [ ] **Step 5: First admin.** `docs/ops.md` section 7. Expected: an invite link printed. Do not open it until the PWA exists (Task 8).
- [ ] **Step 6: Exercise the release path.** Actions > migrate > Run workflow on `main`, approve. Expected: jobs `migrate` (host guard prints `database host ok: <host>`, `migrations applied`, hook returns 200 or 202) and `smoke`. The smoke fails at `pointer` ("run POST /admin/publish") until the first publish exists and at `cors` until `WEB_ORIGIN` is the real PWA origin; that is expected now. Record which step failed.
- [ ] **Step 7: First backup and drill.** Actions > backup > Run workflow. Expected: green run, artifact `perch-backup` about the size of the empty schema. Do the restore drill from `docs/ops.md` section 10. Expected: `bun run admin:invite "Drill"` works against the restored branch. Delete the branch.
- [ ] **Step 8: Confirm the pooled URL on Render is healthy under writes.** After Task 9 begins, watch Render logs for `prepared statement` or `pgbouncer` errors; if any appear, switch Render's `DATABASE_URL` to the direct URL and note it in decision 16.
- [ ] **Step 9: Confirm CORS and the data site headers by hand.** Run:

```bash
curl -si -X OPTIONS "$API_BASE_URL/survey/spots/x/identity" -H "Origin: $WEB_ORIGIN" -H "Access-Control-Request-Method: PUT" | grep -i access-control
```

Expected: `access-control-allow-origin: <WEB_ORIGIN>` once `WEB_ORIGIN` is correct (Task 8). Nothing to commit.

---

## After plan D

### Task 8: PWA on Cloudflare Pages

**Files:** none new (docs already in `docs/ops.md` section 9). If plan D named the web package or env vars differently, edit `docs/ops.md` section 9 and this task to match and commit as `docs: align pages build settings with the web app`.

**Interfaces:**
- Consumes: `apps/web` from plan D with package name `@study-spot/web`, output `apps/web/dist`, and env vars `VITE_API_BASE_URL`, `VITE_DATA_BASE_URL` read from `import.meta.env`.
- Produces: the `study-spot` Pages project and a real `WEB_ORIGIN`.

- [ ] **Step 1: Verify the build locally from the repo root.** Run: `VITE_API_BASE_URL=https://example.invalid VITE_DATA_BASE_URL=https://example.invalid bun install --frozen-lockfile && bun run --filter '@study-spot/web' build && ls apps/web/dist/index.html`. Expected: the build succeeds and the file exists. If the filter name differs, use the package name from `apps/web/package.json`.
- [ ] **Step 2: Check the app reads the agreed names.** Run: `grep -rn "VITE_API_BASE_URL\|VITE_DATA_BASE_URL" apps/web/src | head`. Expected: both names appear. If not, stop and fix in plan D's code (this plan fixes the contract names).
- [ ] **Step 3: OWNER, create `study-spot` from Git.** `docs/ops.md` section 9 steps 1 to 3. Expected: first build log shows Bun 1.3.14 and `apps/web/dist` deployed.
- [ ] **Step 4: OWNER, fix `WEB_ORIGIN` everywhere.** Copy the production `*.pages.dev` origin. Update Render env `WEB_ORIGIN`, the repo variable `WEB_ORIGIN`, and the Render service via the deploy hook: `curl -fsS -X POST "<RENDER_DEPLOY_HOOK_URL>"`. Expected: HTTP 200 or 202 and a new deploy on the Events tab.
- [ ] **Step 5: Run the smoke.** Actions > smoke-deploy > Run workflow. Expected: `deploy smoke ok: <n> spots, bundle <hash>, health after <k> attempt(s)`. A `pointer` failure means nothing is published yet: sign in as admin, publish (`POST /admin/publish` via the admin screen), and rerun.
- [ ] **Step 6: Check the installed PWA's invite route works on the Pages origin.** Open `<WEB_ORIGIN>/invite/test` in a browser. Expected: the app shell loads (not a Pages 404), meaning plan D's SPA fallback is deployed. If it 404s, plan D must add a `public/_redirects` file with `/* /index.html 200`; fix there.
- [ ] **Step 7: Commit** only if docs changed in this task:

```bash
git add docs/ops.md
git commit -m "docs: align pages build settings with the web app"
```

---

### Task 9: Real-device acceptance runbook and run

**Files:**
- Create: `docs/runbooks/surveyor-2a-acceptance.md`

**Interfaces:**
- Consumes: spec section 12 (six criteria), the deployed stack, `smoke:deploy`.
- Produces: a runbook with a results table; one filled run committed.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/surveyor-2a-acceptance.md` with exactly this content:

`````markdown
# Phase 2a real-device acceptance

Proves the six criteria in `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` section 12 on real phones against the deployed stack. Run it after every release that touches sync, publish, auth, or the PWA shell, and once before the first survey day. Time budget: about 90 minutes with two people.

## What you need

- An iPhone (Safari, iOS current minus one or newer) and an Android phone (Chrome), both with data and Wi-Fi, a second person for criteria 3 and 4, a stopwatch.
- Two admin invite links (`bun run admin:invite "<name>"`, `docs/ops.md` section 7) plus one surveyor invite per phone from the admin screen. Links last 48 hours and work once.
- Record for every run: date, app commit (shown in the app footer or the Pages deployment), API deploy id (Render Events tab), device model and OS version, browser version, standalone (installed) or browser tab, network type.

## 0. Wake the stack

1. Open `<API_BASE_URL>/health` on a laptop. A cold start can take about a minute. Expected: `{"ok":true}`.
2. Run Actions > smoke-deploy. Expected: green. Stop if it is red; see `docs/ops.md`.

## 1. Install and sign in (each phone)

1. iPhone: open `<WEB_ORIGIN>` in Safari, Share > Add to Home Screen, open the new icon. Android: Chrome menu > Install app (or Add to Home screen), open the icon.
2. Open the invite link inside the installed app (iOS keeps Safari and the installed app in separate storage, so a link opened in Safari does not sign in the installed app; paste or re-open it from the home screen app). Enter a display name.
3. Record: install worked, sign in worked, name shown correctly, any prompt text that confused you.

## 2. Criterion 1: offline create, sync, publish in under 5 minutes

1. Turn on airplane mode. Start the stopwatch.
2. New spot with all v0-required fields (the app lists what is missing) and one photo from the camera.
3. Turn airplane mode off. Wait for sync status to read synced. Publish.
4. Stop the stopwatch when the spot shows published. Record total time and the time from network return to published. Pass: under 5 minutes total.
5. Note: the first request after network return may hit a sleeping API (about a minute). Record whether it did.

## 3. Criterion 2: data site updated within about a minute

1. From the sync-complete moment, poll: `curl -s <DATA_BASE_URL>/bundle-latest.json` until `hash` changes. Record elapsed seconds (pass: about 60, debounce is 30 seconds plus deploy time).
2. Run `bun run smoke:deploy`. Expected: green.
3. Download the bundle named by the pointer and confirm the new spot is present with its cover photo URL (needs the photo approved first: have the second person approve it). Record the photo URL and open it on the phone.

## 4. Criterion 3: review rules

1. Second surveyor (different phone or account) opens the new spot and marks it reviewed. Expected: succeeds, shows "Reviewed by <name>".
2. The first surveyor tries to review their own edit. Expected: not offered, or refused. An admin can always review.

## 5. Criterion 4: conflicting edits

1. Both phones open the same spot. Put phone A in airplane mode.
2. Edit the seating section on both: A offline, B online, B saves first.
3. Turn A online. Expected: conflict view naming B as the last editor.
4. Resolve once keeping A's values, then repeat on another section keeping B's. Record that both outcomes persisted after a reload on both phones.

## 6. Criterion 5: CI

Open the latest `main` run in Actions. Expected: `check` and `postgres` jobs green, including server smoke on Node and Bun. Record the run URL.

## 7. Criterion 6: cold redeploy from the docs

Someone who did not build the stack follows `docs/ops.md` on a scratch Neon project and a scratch Render service until `/health` and `smoke:deploy` pass, writing down every step that was wrong or missing. Fix the doc. Record who and how long.

## 8. Also record

Camera permission prompt behavior, photo size after resize (must be under 1.5 MB), what the sync indicator showed in each state, any lost edit (a failure, file it), battery or storage warnings.

## Results

| Date | Commit | Device and OS | Browser | Installed | C1 time | C2 secs | C3 | C4 | C5 | C6 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
`````

- [ ] **Step 2: Em-dash check.** Run: `grep -n "$(printf '\342\200\224')" docs/runbooks/surveyor-2a-acceptance.md || echo clean`. Expected: `clean`.
- [ ] **Step 3: OWNER, run it on a real iPhone and a real Android phone.** Work through sections 0 to 7. File every failure as a GitHub issue with the recorded values.
- [ ] **Step 4: Record the run.** Add one row per device to the Results table.
- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/surveyor-2a-acceptance.md
git commit -m "docs: add real-device acceptance runbook for phase 2a"
```

---

### Task 10: Close out

**Files:**
- Modify: `docs/context/overview.md` (decision 16), `docs/context/roadmap.md` (only if it lists deploy as open)

**Interfaces:**
- Consumes: plan A's decision 15 in `docs/context/overview.md` (do not edit it).

- [ ] **Step 1: Append decision 16.** In `docs/context/overview.md`, directly after the line starting `15. Surveyor server plan`, add:

```markdown
16. Deploy and ops (2026-10-04), detail in `docs/superpowers/plans/2026-10-04-surveyor-2a-deploy.md` and `docs/ops.md`: Render blueprint with `autoDeployTrigger: "off"`; releases are tag pushes handled by `migrate.yml` (host guard, `db:migrate`, deploy hook, smoke) so schema lands before code and migrations must be additive; Render uses the Neon pooled URL, migrations and dumps use the direct URL (`DATABASE_URL_DIRECT`), both with `sslmode=require`; backups are weekly `pg_dump` encrypted with `age` and stored as a 90-day GitHub Actions artifact (public repo, so encryption is mandatory; chosen over a dump in a private repo for no extra repo, no history growth, and automatic expiry; R2 stays rejected for needing a card); web env vars are `VITE_API_BASE_URL` and `VITE_DATA_BASE_URL`; `study-spot-data` is a direct-upload project created with wrangler, `study-spot` is Git-connected; no keep-alive pinger in v0; card and second-seat requirements are checked at sign-up and recorded in `docs/ops.md`.
```

- [ ] **Step 2: Check the roadmap.** Run: `grep -n -i "deploy\|ops.md\|render" docs/context/roadmap.md`. If a line lists deploy or ops as open for 2a, mark it done in the same style as its neighbours.
- [ ] **Step 3: Full verification.** Run: `bun run typecheck && bun run lint && bun test`. Expected: all pass (plan A's tests plus 6 deploy, 9 check, 5 dbHost). Run: `grep -rn "$(printf '\342\200\224')" docs/ops.md docs/runbooks docs/context render.yaml .github apps/server || echo clean`. Expected: `clean`.
- [ ] **Step 4: Commit**

```bash
bun run fix
git add docs/context
git commit -m "docs: record deploy and ops decisions"
```

---

## Done criteria

- `docs/ops.md` lets someone with no context redeploy the stack (acceptance criterion 6, proven in Task 9 step 7).
- `render.yaml`, `migrate.yml`, `smoke-deploy.yml`, `backup.yml` exist; the 20 new tests pass in `bun test` and in CI.
- Production has a migrated Neon database, a healthy Render service, an `age`-encrypted backup artifact that has been restored once, and `study-spot-data` filled by the publisher.
- Actions > smoke-deploy is green, and the Task 9 results table has a row per phone.
- Commits: 6 for tasks 1, 3, 4, 5, 6, 10 and one for task 9, plus the optional fixes named in tasks 7 and 8, each passing the gate. Tasks 2 and 7 are owner and ops work with no commit.
