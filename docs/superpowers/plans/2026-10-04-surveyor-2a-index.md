# Surveyor tooling phase 2a: plan index

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (phase 2a). Parent: `docs/superpowers/specs/2026-10-03-perch-v0-design.md`.

**Target:** survey-ready by 2026-10-18.

Phase 2a spans five subsystems, so it is split into five plans. Each produces working, tested software on its own.

| Plan | File | Depends on | Can start |
|---|---|---|---|
| A. Server | `2026-10-04-surveyor-2a-server.md` | foundation (merged) | now |
| B. Client logic (`packages/ui-logic`) | `2026-10-04-surveyor-2a-client-logic.md` | A's Task 2 (survey API contract in `packages/core`) | after A Task 2 lands |
| C. Design track | `2026-10-04-surveyor-2a-design.md` | spec only | now, in parallel with A |
| D. Web UI (`apps/web`), in three sequential parts | `2026-10-04-surveyor-2a-web-1-foundation.md` (outbox liveness, server reads, copy, scaffold, adapters, cache, hooks, components, shell, invite, spot list, e2e harness), `2026-10-04-surveyor-2a-web-2-screens.md` (new spot, overview, every section editor, photos, acceptance e2e), `2026-10-04-surveyor-2a-web-3-finish.md` (admin, finishing e2e, detector and audit, decision 19, DESIGN.md) | B and C | after B and C; each part after the one before it |
| E. Deploy and ops | `2026-10-04-surveyor-2a-deploy.md` | A, D | after A; final steps after D |

Plan D is written once C has produced the direction contract, the surveyor journey, the copy deck, and the typed tokens, because its component and screen code depends on them. Writing it earlier would mean placeholder styling. `DESIGN.md` itself is written at the end of plan D by the Impeccable documenter, from the built screens (Impeccable's own process for a new visual world).

## Execution order

1. A (server) and C (design) in parallel.
2. B (client logic) once A's contract task is merged.
3. D (web UI) once B and C are done: part 1, then part 2, then part 3. Each part ends with working, tested software.
4. E (deploy): server and data site deploy after A; PWA deploy and the real-device acceptance run after D.

## Shared contract

`packages/core/src/survey/` (created in plan A, Task 2) is the single source for every survey request and response shape, section payloads, and `missingV0Fields`. Plans B and D import from it and never redefine shapes.

Design track complete: direction "The Divided Back" in `apps/web/.impeccable/surfaces/apps-web.md`, `docs/design/surveyor-journey.md`, `docs/design/surveyor-copy.md`, `packages/ui-logic/src/tokens.ts`. Plan D can be written. `DESIGN.md` follows at the end of plan D.
