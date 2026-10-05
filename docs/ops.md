# Operations runbook

Card-free stack for the Perch survey tooling: Render (API), Neon (Postgres), Cloudflare Pages (PWA and data site), GitHub Actions (migrations, backups, smoke). Design and data model live in `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` and `docs/context/data-model.md`. Free-tier terms below were checked on 2026-10-04; they change, so re-read the linked pages (section 13) before relying on a number.

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
   read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
   npx wrangler pages project create study-spot-data --production-branch main
   unset CLOUDFLARE_API_TOKEN
   ```

   Copy the project's real `*.pages.dev` hostname from Workers & Pages > study-spot-data. That origin is `DATA_BASE_URL`.
4. The PWA project `study-spot` is created later, once the web app exists, from Git (section 9). Never create it with direct upload.

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
| `BACKUP_DATABASE_URL` | Neon direct string, same as `DATABASE_URL_DIRECT` | yes |
| `BACKUP_AGE_RECIPIENT` | `age-keygen` public key (section 10) | no |
| `PG_MAJOR` | Neon Postgres major version, `17` | no |

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
4. Check it: `read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN`, then `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` should print `"status":"active"`. (If an account-owned token is used, verify with `.../accounts/$CF_ACCOUNT_ID/tokens/verify`.) Then `unset CLOUDFLARE_API_TOKEN`. Reading it with `read -rs` keeps it out of shell history.

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

Expected: `admin invite for Your Name, valid until <48 hours from now>:` and a `https://<pwa>/invite/<token>` link. Open it inside the installed PWA on your phone. The link is single use. Run the command only once: each run creates another admin. Run it again only if the link expired before anyone used it; in that case, after signing in with the new link, revoke the unused admin from the admin screen. (If another admin already exists, they can instead issue a re-login link for the unused admin from the admin screen.) Further surveyors are invited from the admin screen. Close the shell afterwards (`unset DATABASE_URL`).

## 8. Releases

```bash
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

Actions > migrate starts, waits for a reviewer, then: host guard, `db:migrate`, Render deploy hook for that commit, smoke (`/health` with retry, CORS, data pointer, bundle). Render deploys also appear under the service's Events tab. A push to `main` does not deploy the API; it runs CI and, if the PWA project is connected, deploys the PWA (section 9).

## 9. PWA on Cloudflare Pages (once the web app exists)

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
2. In Neon create a branch (Branches > Create branch) so production is untouched; copy that branch's direct URL. A branch already contains production's schema and data, so do not restore into its default database: create an empty one.
3. `psql "<branch direct url>" -c 'CREATE DATABASE drill'`
4. `age -d -i perch-backup.key backup.dump.age > backup.dump`
5. `pg_restore --no-owner --no-acl -d "<branch direct url with /drill as the database name>" backup.dump`. Your local `pg_restore` must be version 17 or newer (check `pg_restore --version`).
6. Check it: `read -rs DATABASE_URL && export DATABASE_URL` (the `/drill` URL), `export WEB_ORIGIN=<the PWA origin>`, then `bun run admin:invite "Drill"` should print an invite link. Delete the Neon branch and `unset DATABASE_URL`.

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
