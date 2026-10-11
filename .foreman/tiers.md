## Paths

Path minimums only raise a tier. Perch keeps its own three tiers (CLAUDE.md, "Change tiers"). Critical is used only where Perch already requires the owner.

- `apps/server/**`: Logic
- `packages/db/**`: Logic
- `packages/core/**`: Logic
- `apps/web/src/adapters/**`: Logic
- `apps/web/src/app/**`: Logic
- `packages/db/drizzle/**`: Critical
- `apps/server/src/deploy/**`: Critical
- `.github/workflows/**`: Critical
- `wrangler.jsonc`: Critical
- `scripts/push-guard.ts`: Critical
- `.env*`: Critical

Critical here means Perch's existing owner-only areas:
- production migrations (a `v*` tag and the migrate workflow)
- deploy configuration
- secrets
- the free-tier limits (a card, a second Render service, a Worker script, a scheduled workflow)

Everything else uses Perch's Tweak, Feature, and Logic tiers as written in CLAUDE.md.

## Checks

- Tweak: `bun run typecheck && bun run lint`, `cd apps/web && bunx vitest run`, and one look at the changed screen at 375 px
- Feature: unit tests for the touched area, plus the visual check for the touched routes
- Logic: `bun run typecheck && bun run lint && bun test --timeout 60000 && (cd apps/web && bunx vitest run)`
- Merge to main: the full Playwright suite once per branch (`.foreman/config.json` `merge_gate`)
