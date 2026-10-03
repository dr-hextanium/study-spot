# Foundation follow-ups

Parked during the foundation build (branch feat/foundation). Pick these up in the named plan.

## Scoring plan
- Exam busyness: `exam` falls back to regular per slot, but `confidence` describes regular only. Add an additive optional `exam_confidence` array.
- Replace `NO_DATA_RATIO = 0.35` with the fitted campus profile.
- `dayTypeOf` and `blockOfHour` do not range-check input (`slotIndex` does).

## Surveyor and publisher plan
- `spot.updated_at` and `spot.version` have no DB-side update behavior; the server must set them.
- `scripts/seed.ts` has no guard against a production `DATABASE_URL` (campus primary key limits damage).
- Verify on the first CI run that the gitleaks Docker step scans more than 0 commits and the postgres job passes; neither could run locally.
- Bundle client: a malformed pointer with no cache reports `offline_no_cache`; cached hash is not verified against content.

## Test hardening (any time)
- Schema `.rejects` tests accept any error; assert constraint names.
- Negative bundle tests mostly assert `ok === false`; assert issue messages.
- Most enums have no content regression tests.
- `campusDate` relies on `en-CA` formatting (full ICU required) and has no invalid time zone test.
- Duplicate seed test proves no rows were added, not a late rollback.

## Later (v3, multi-campus)
- `spot.slug` is globally unique; scope by campus.
- Overlapping terms resolve by row order in `pickTerm`.

## Tooling
- Biome 2.5 reports `linter.rules.recommended` is deprecated in favour of `preset`.
- Document gitleaks as a contributor prerequisite in `docs/ops.md`.
- Workflow `concurrency` group.
