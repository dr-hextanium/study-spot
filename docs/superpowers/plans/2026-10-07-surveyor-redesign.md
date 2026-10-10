# Surveyor Redesign (Seawolf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every surveyor PWA screen in the approved Seawolf system: neutral and minimal, Newsreader and Instrument Sans, a four-color palette, Lucide icons, smooth motion, a light/dark/system switch and a laptop layout. Behavior, honesty rules and tests stay intact, three measured bugs get fixed, and spots gain cover thumbnails.

**Architecture:** Design data (tokens, contrast math, theme preference, Home and progress logic) lives in `packages/ui-logic` and is tested with `bun test`. `apps/web` gets a generated static `tokens.css`, self-hosted fonts, an inline no-flash theme script, new primitives (TopBar, ActionBar, Row, Pill, StepBar, Sheet motion), and then each screen in turn. Old CSS variables keep working through a temporary `legacy.css` until the last task deletes them with the postcard components. One small contract change (`SpotSummary.cover_photo_id`) feeds thumbnails.

**Tech Stack:** React 19, TanStack Router and Query, Vite 8 with vite-plugin-pwa, Zod 4, Lucide, `@fontsource-variable/newsreader` and `@fontsource-variable/instrument-sans` 5.3.0, Vitest (jsdom), Playwright, Bun test, Fastify and Drizzle on the server.

**Spec:** `docs/superpowers/specs/2026-10-07-surveyor-redesign.md`. Visual reference: `.superpowers/sdd/2026-10-04-surveyor-2a-web-3-finish/mock-directions.html` (`DIRS.d` plus its CSS), `dir-d.png`, `d3.png`. The mock is the visual reference only. Its counts (7 steps), control sizes under 44 px, kbd hints and "Check every section" are wrong or out of scope. The spec wins. (The owner later chose the guided walk for "Check every section": "Check each section" opens each required section in turn.)

## Global Constraints

- CLAUDE.md hard rules apply. No `Bun.*` in `apps/server` or `packages/*`. Strict TS, no `any`, no unjustified `!`, Zod at trust boundaries (localStorage and IndexedDB included), string literal unions, never an enum.
- No em-dashes anywhere (UI copy, comments, docs, commit messages).
- All UI text goes through `t()`. Edit `docs/design/surveyor-copy.md`, then run `bun run copy:gen`. Every new placeholder name needs a `SAMPLE` entry in `packages/ui-logic/test/copy.test.ts`.
- Palette: light paper `#FBFAF9`, ink `#1A1717`, red `#990000`, mist `#ECE8E6`, onRed `#FFFFFF`. Dark paper `#151313`, ink `#EEEAE8`, red `#EF6B63`, mist `#262222`, onRed `#151313`. Every other color is a `color-mix(in oklab, ...)` of these. There are no status hues.
- Lucide icons at `strokeWidth={1.75}`, `aria-hidden="true"`.
- Motion: 120 to 320 ms, ease `cubic-bezier(0.2, 0.8, 0.2, 1)`. Under reduced motion nothing slides or scales, and opacity and color transitions run at 80 ms.
- Targets: every hit area is at least 44 by 44 px. AA contrast in both themes. There is at most one red-filled button per screen; destructive actions are the `danger` variant (red text on mist).
- The document scrolls; there is never an inner scroll container. Each screen has exactly one `h1`, the large title, and the bar title is `aria-hidden`.
- Ports: 5173 belongs to another app, and 5199 and 8790 are the owner's live preview. Never start, stop or touch them. Use web 5299 and API 8890, and stop only servers you started, by PID.
- Do not stage the owner's uncommitted files: `CLAUDE.md`, `apps/web/scripts/verify-ui.ts`, `apps/web/scripts/audit-shots.ts`, `.claude/*`. Never commit `.superpowers/` or `HANDOFF.md`. Stage files by path.
- Commits follow Conventional Commits, 72 characters or fewer, with no attribution. Every commit passes `bun run typecheck`, `bun run lint`, web vitest, and the bun tests of the touched packages.
- Commit at the step where that slice goes green, with no other modified files in the tree. The pre-commit typecheck runs `tsc -b` on the working tree, not on the staged set, so a partial stage can pass the hook while the commit itself does not compile. `git add -p` is not available (no interactive flags).
- Baseline counts at the start: web vitest 160, Playwright 13. Read the ui-logic and bun counts at the start of Task 1 and record them in the task report.

## Commands

| What | Command |
|---|---|
| typecheck, lint, fix | `bun run typecheck`, `bun run lint`, `bun run fix` |
| ui-logic tests | `bun test packages/ui-logic --timeout 60000` |
| core tests | `bun test packages/core --timeout 60000` |
| server tests | `bun test apps/server --timeout 60000` |
| web unit tests | `bun run --filter '@perch/web' test` (one file: `cd apps/web && bunx vitest run test/<file>`) |
| web e2e | `bun run --filter '@perch/web' e2e` (one file: `cd apps/web && bunx playwright test e2e/<file>`). It uses ports 8787 and 4173, which belong to the e2e suite. |
| copy | `bun run copy:gen` |
| tokens | `bun run tokens:gen` (added in Task 1) |

### Procedure V: visual check (ends every UI task)

The repo's `CLAUDE.md` section "Visual Verification" is the source of truth. The concrete steps for a task:

```bash
VDIR="${CLAUDE_JOB_DIR:-/tmp}/perch-verify"; mkdir -p "$VDIR"
# API on 8890 (seeded PGlite, single-use invite links written to the state file)
(cd apps/server && E2E_PORT=8890 E2E_WEB_ORIGIN=http://localhost:5299 E2E_STATE="$VDIR/state.json" \
  nohup node scripts/e2e-server.ts > "$VDIR/api.log" 2>&1 & echo $! > "$VDIR/api.pid")
# Web dev server on 5299
(cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:8890 VITE_DATA_BASE_URL=http://data.localhost:8788 \
  nohup bunx vite --port 5299 --strictPort > "$VDIR/web.log" 2>&1 & echo $! > "$VDIR/web.pid")
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8890/health >/dev/null && curl -sf http://localhost:5299 >/dev/null && break; sleep 1; done
# Each run consumes one invite index; use a new VERIFY_INVITE (1, 2, 3, ...) per run.
(cd apps/web && VERIFY_WEB=http://localhost:5299 VERIFY_INVITE=1 node scripts/verify-ui.ts "$VDIR/state.json" <routes>)
kill "$(cat "$VDIR/api.pid")" "$(cat "$VDIR/web.pid")"
```

Pass: every line printed is `PASS` (console clean, no failed requests, no horizontal overflow, axe zero violations) for the task's routes at 375, 768 and 1440 px. Then review the screenshots in `.claude/tmp/screenshots/` for the screens this task changed. Dark mode is checked automatically by `e2e/layout.e2e.ts`, which runs axe and the layout checks on every converted route in both themes (Task 2 onward). `verify-ui.ts` only captures light (it holds the owner's uncommitted edits, so do not change it), and headless OS dark emulation is overridden by the light default. For a dark screenshot review, take the captures with a throwaway Playwright snippet that runs `localStorage.setItem("perch.theme", "dark")` and reloads (do not commit it). Compare against the mock CSS and the spec layout. Shrink the images with `magick mogrify -resize '1024x>'` before reading them. In the task report, list every deviation from the spec or tokens. Implementers do not dispatch subagents; the coordinator runs the `visual-reviewer` agent on the screenshots. Empty `.claude/tmp/screenshots/` afterwards. If `verify-ui.ts` without route arguments cannot find a spot link on Home (its `firstSpot` looks for `a[href^="/survey/spots/"]`), pass the routes explicitly.

## Review Focus

1. **A list persisted by the current app version, restored after the update.** It must still restore offline with `cover_photo_id` null. Owner: Task 4 (`sanitizePersisted` keeps the parsed, defaulted data; there is a test for a legacy list).
2. **A touch scroll that starts on a segmented control.** Nothing is committed and the shown choice goes back, even on an empty optional control. Owner: Task 5 (pointercancel test).
3. **A dark OS with the light default on first paint, and a stored dark pref before the app script runs.** No flash either way. Owner: Task 1 (inline script unit test plus two e2e tests that hold the app bundle).
4. **Hit areas under 44 px from small-looking controls** (32 px chips, 36 px tags, 40 px icon buttons and stepper keys). Owner: Task 2 creates `e2e/layout.ts`, and every screen task adds its route to `e2e/layout.e2e.ts`.
5. **Long names, long building names and role pills at 375 px.** No clipped text except deliberate `.truncate` ellipses. Owner: the same layout check, with long seeded names drafted through `e2e/api.ts` (Tasks 3, 6, 10).

---

## File Structure

```
packages/ui-logic/src/
  contrast.ts        + mixOklab (oklab color-mix, matches CSS)
  tokens.ts          rewritten: Seawolf palette, mixes, type, space, motion; paletteVariables, sharedVariables
  theme.ts           new: ThemePref, readThemePref, resolveScheme
  survey/view.ts     + StepState, StepProgress, stepProgress, nextAfter, isRequiredSection
  survey/home.ts     new: isDue, keepGoing, homeList, HomeFilter, HomeFact, HomeRow
  index.ts           exports theme.ts and survey/home.ts (survey/index.ts re-exports home.ts)
packages/ui-logic/test/
  tokens.test.ts     rewritten
  theme.test.ts      new
  view.test.ts       + progress, nextAfter, DraftRow fields
  home.test.ts       new
packages/core/src/survey/spot.ts       SpotSummary.cover_photo_id
apps/server/src/spots/load.ts          listSurveySpots returns cover_photo_id
apps/server/test/spots.test.ts         cover cases
apps/web/
  index.html                 theme boot script, color-scheme and theme-color metas
  vite.config.ts             manifest colors
  scripts/gen-tokens.ts      new: writes src/ui/tokens.css
  src/main.tsx               css imports, scroll key, no installTheme
  src/routes/__root.tsx      focus without scrolling
  src/app/scrollKey.ts       new
  src/app/serverCache.ts     summaryOf cover, sanitizePersisted keeps parsed data
  src/ui/tokens.css          generated (biome-ignored)
  src/ui/fonts.css           new: latin and latin-ext @font-face for both families
  src/ui/legacy.css          new in Task 1, deleted in Task 12
  src/ui/styles.css          rewritten progressively; base in Task 1, primitives in Task 2
  src/ui/theme.ts            themeCss only (installTheme removed)
  src/ui/themePref.ts        new: applyThemePref, storeThemePref, useThemePref
  src/ui/ThemeSwitch.tsx     new
  src/ui/Icon.tsx            new: Lucide wrapper at 1.75
  src/ui/TopBar.tsx          new (replaces HeaderBand)
  src/ui/ActionBar.tsx       new
  src/ui/Row.tsx             new (replaces RuledRow)
  src/ui/Pill.tsx            new (replaces StampChip)
  src/ui/StepBar.tsx         new
  src/ui/Screen.tsx          column layout, LargeTitle, GroupHeading
  src/ui/Sheet.tsx           motion, centered dialog on wide screens
  src/ui/Button.tsx          variants primary | ink | quiet | ghost | danger, IconButton
  src/ui/Segmented.tsx       pending-on-pointerdown, thumb
  src/ui/Stepper.tsx, Choices.tsx, Check.tsx, Field.tsx, Search.tsx (new), FilterChips.tsx (new), CoverThumb.tsx (new)
  src/hooks/useLargeTitle.ts new
  src/hooks/useNearViewport.ts new
  src/lib/icons.ts           new: SECTION_ICON
  src/lib/facts.ts           new: sectionFact, homeFactText
  src/screens/*              each screen converted
  src/screens/SyncStatus.tsx new (replaces SyncPostmark in headers and bars)
  e2e/layout.ts, e2e/layout.e2e.ts, e2e/theme.e2e.ts, e2e/nav.e2e.ts   new
apps/web/.impeccable/surfaces/apps-web.md   rewritten contract
docs/context/overview.md                    decision 20
biome.json                                  ignore apps/web/src/ui/tokens.css
package.json                                tokens:gen script
```

---

### Task 1: Foundation: contract, tokens, fonts, theme switch, base styles

Several commits in one task. Each commit passes on its own.

**Files:**
- Modify: `apps/web/.impeccable/surfaces/apps-web.md`, `docs/context/overview.md`
- Modify: `packages/ui-logic/src/contrast.ts`, `packages/ui-logic/src/tokens.ts`, `packages/ui-logic/src/index.ts`
- Create: `packages/ui-logic/src/theme.ts`, `packages/ui-logic/test/theme.test.ts`
- Modify: `packages/ui-logic/test/tokens.test.ts`
- Create: `apps/web/scripts/gen-tokens.ts`, `apps/web/src/ui/tokens.css`, `apps/web/src/ui/fonts.css`, `apps/web/src/ui/legacy.css`, `apps/web/src/ui/themePref.ts`, `apps/web/src/ui/ThemeSwitch.tsx`, `apps/web/e2e/theme.e2e.ts`
- Modify: `apps/web/src/ui/theme.ts`, `apps/web/test/theme.test.ts`, `apps/web/src/main.tsx`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/package.json`, `apps/web/src/ui/styles.css`, `biome.json`, `package.json`, `docs/design/surveyor-copy.md`, `packages/ui-logic/src/copy/copy.gen.ts`

**Interfaces:**
- Produces (ui-logic): `mixOklab(from: string, to: string, pct: number): string`; `PALETTE_ROLE`, `type PaletteRole`, `type Palette`, `type Mix`, `Tokens` (schema), `tokens`, `resolveMix(p: Palette, m: Mix): string`, `paletteVariables(p: Palette): Record<string, string>`, `sharedVariables(t: Tokens): Record<string, string>`; `THEME_PREF`, `ThemePref` (schema and type), `readThemePref(raw: unknown): ThemePref`, `resolveScheme(pref: ThemePref, systemDark: boolean): "light" | "dark"`, `THEME_STORAGE_KEY = "perch.theme"`.
- Produces (web): `themeCss(t: Tokens): string`; `applyThemePref(pref: ThemePref, doc?: Document, systemDark?: boolean): void`; `storeThemePref(pref: ThemePref): void`; `useThemePref(): [ThemePref, (p: ThemePref) => void]`; `<ThemeSwitch />`. CSS custom properties: `--color-{paper,ink,red,mist,onRed}`, `--color-{muted,line,edge,hover,redTint,redHover,redPress,inkHover,mistHover}`, `--font-{display,body,mono}`, `--fontSize-*`, `--lineHeight-*`, `--space-*`, `--radius-*`, `--size-*`, `--duration-*`, `--easing-standard`, `--press-{row,control}`.
- Removed: `installTheme`, `toCssVariables`, every student palette.

- [ ] **Step 1: Rewrite the direction contract and record decision 20**

Replace `apps/web/.impeccable/surfaces/apps-web.md`, keeping its format (front matter, then `# Surface brief`, `## Direction contract` with THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM and FINISH, then `## Signature interaction`, `## Unresolved` and `## Components to derive in the web UI plan`):

```md
---
version: 2
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface brief: survey mode (apps/web /survey/*)

Scope: surveyor screens of the Perch PWA (`/invite/$token`, `/survey`, `/survey/spots/new`, `/survey/spots/$id`, `/survey/spots/$id/$section`, `/survey/admin`). Visitor mode: Operate. Spec: `docs/superpowers/specs/2026-10-07-surveyor-redesign.md`.

Audience and task: 3 to 5 student surveyors, one-handed on phones, outdoors in sun and in dim basements, creating and checking study spots in under 5 minutes, offline first; admins also on laptops. Flow and copy: `docs/design/surveyor-journey.md`, `docs/design/surveyor-copy.md`.

Constraints: 44 px minimum hit areas; WCAG 2.2 AA in light and dark (ink on paper 7:1 for sunlight); one red-filled button per screen; no status hues; no university marks; no em-dashes.

Physical scene: a phone held at arm's length in direct afternoon sun, then in a fluorescent-lit basement at 11pm; a laptop at a club meeting. Light by default, with a manual light, dark or system switch.

## Direction contract

THESIS: Seawolf. A quiet tool that says more with less: a big serif title, compact rows with the fact on the right, one red thing that needs you. It refuses decoration: no stamps, no postmarks, no ruled lines, no ink band, no colored status chips.

OWN-WORLD: Four colors (paper, ink, Stony Brook red, mist) and oklab mixes of them. Newsreader for large titles, group headers, bar titles and figures; Instrument Sans for everything else. Lucide icons at 1.75 stroke. Radius 12 on controls and rows, 20 on cards, 22 on sheets. Hairlines at ink 10 percent. Shadows only on sheets, the floating action bar and the segmented thumb.

STORY: The surveyor sees what is left (the step bar), what needs them (red), and what is done (the facts on the right). They trust their entries are kept because the sync status in the action bar or top bar says so. They act with one thumb on the action bar.

FIRST VIEWPORT: Spot overview on a 390 by 844 phone. A 52 px top bar (back, sync), the spot name as a 34 px Newsreader title, a Draft pill with "Building · Floor N · Checked Oct 1", the step bar and "4 of 6 · Next: Seating". Below that, groups of 52 px rows: section icon, name, and on the right the fact or a red Missing pill. The action bar is pinned: Next: Seating (ink), Publish (red, aria-disabled with a reason while blocked), Actions.

FORM: Raycast list density with Notion page calm. Progress is a 4 px step bar, one segment per required section: done is ink, current is red, todo is mist.

FINISH: unreviewed and undocumented is unfinished. This build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Signature interaction

Instant choice: segmented controls show the new choice on pointerdown and the paper thumb glides there (180 ms); rows press to 0.985; sheets slide up (320 ms); the large title hands off to the bar title as it scrolls away (220 ms). Reduced motion: no transforms, 80 ms fades.

## Unresolved

Student mode surfaces will be designed in this system (decision 12 is an open question for the owner). Bulk check of every section is an open question.

## Components to derive in the web UI plan

Built inside this contract, documented into DESIGN.md at finish: top bar with large-title handoff, action bar, row (with optional cover thumbnail), pill (mist, red), step bar, button (primary red, ink, quiet, ghost, danger), icon button, search field, filter chips with counts, segmented control, stepper with keypad entry, tag toggles, field (icon plus label, help, error), sheet (bottom on phones, centered dialog from 768 px), toast, theme switch.
```

Append to the decision log in `docs/context/overview.md` (decision 19 stays reserved for plan D part 3 Task 17):

```md
20. Surveyor redesign "Seawolf" (2026-10-07, owner, through live mocks), detail in `docs/superpowers/specs/2026-10-07-surveyor-redesign.md` and `docs/superpowers/plans/2026-10-07-surveyor-redesign.md`: supersedes decision 14 (The Divided Back) for the surveyor app. Clean, neutral, minimal (Raycast and Notion as references). Newsreader for headings and Instrument Sans for text, self-hosted from `@fontsource-variable`. Palette of four colors (paper, ink, Stony Brook red, mist) plus oklab mixes, with no status hues. Lucide at 1.75 stroke. Light by default with a per-device light, dark or system switch applied before first paint. Phone first, with one centered column on laptops (two-pane rejected: it fights focus, blockers and scroll restoration). Home gets a Keep going card, search and filters; the spot and the editor get a step bar over the 6 required sections; Save and next goes to the next missing required section. Survey spot summaries carry `cover_photo_id` (approved covers only) for thumbnails. Whether decision 12 (postcards in student mode) still stands is open.
```

Run: `bun run lint`
Expected: PASS.

```bash
git add apps/web/.impeccable/surfaces/apps-web.md docs/context/overview.md
git commit -m "docs(web): replace the postcard contract with seawolf"
```

- [ ] **Step 2: Write the failing tokens and contrast tests**

Replace `packages/ui-logic/test/tokens.test.ts` with:

```ts
import { expect, test } from "bun:test";
import {
  contrastRatio,
  mixOklab,
  PALETTE_ROLE,
  type Palette,
  paletteVariables,
  resolveMix,
  sharedVariables,
  Tokens,
  tokens,
} from "../src/index.ts";

const schemes = (["light", "dark"] as const).map((scheme) => ({ scheme, p: tokens.color[scheme] }));
const mix = (p: Palette, name: string): string => {
  const m = tokens.mix[name];
  if (m === undefined) throw new Error(`no mix ${name}`);
  return resolveMix(p, m);
};

test("contrast ratio matches known WCAG values", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
});

test("oklab mix matches CSS color-mix(in oklab, ...)", () => {
  expect(mixOklab("#000000", "#ffffff", 50)).toBe("#636363");
  expect(mixOklab("#ff0000", "#ffffff", 50)).toBe("#ffa191");
  expect(mixOklab("#1a1717", "#fbfaf9", 100)).toBe("#1a1717");
  expect(mixOklab("#1a1717", "#fbfaf9", 0)).toBe("#fbfaf9");
});

test("tokens match the schema", () => {
  expect(Tokens.safeParse(tokens).success).toBe(true);
});

test("the palette is the four Seawolf colors plus onRed, nothing else", () => {
  expect(PALETTE_ROLE).toEqual(["paper", "ink", "red", "mist", "onRed"]);
  expect(tokens.color.light).toEqual({
    paper: "#FBFAF9",
    ink: "#1A1717",
    red: "#990000",
    mist: "#ECE8E6",
    onRed: "#FFFFFF",
  });
  expect(tokens.color.dark).toEqual({
    paper: "#151313",
    ink: "#EEEAE8",
    red: "#EF6B63",
    mist: "#262222",
    onRed: "#151313",
  });
  const extra = structuredClone(tokens) as unknown as { color: { light: Record<string, string> } };
  extra.color.light.success = "#1d6b3a";
  expect(Tokens.safeParse(extra).success).toBe(false);
});

test("no postcard tokens remain", () => {
  const json = JSON.stringify(tokens);
  for (const word of ["stamp", "postmark", "shell", "airmail", "rule", "header"]) {
    expect(json.toLowerCase()).not.toContain(word);
  }
  expect(Object.keys(tokens.easing)).toEqual(["standard"]);
  expect(tokens.easing.standard).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
});

test("hit areas and motion stay in range", () => {
  expect(tokens.size.tapTarget).toBeGreaterThanOrEqual(44);
  for (const ms of Object.values(tokens.duration)) {
    expect(ms).toBeGreaterThanOrEqual(80);
    expect(ms).toBeLessThanOrEqual(320);
  }
  expect(tokens.press.row).toBe(0.985);
});

for (const { scheme, p } of schemes) {
  test(`${scheme}: text pairs meet AA, ink on paper meets 7:1`, () => {
    expect(contrastRatio(p.ink, p.paper)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.ink, p.mist)).toBeGreaterThanOrEqual(4.5);
    for (const bg of [p.paper, p.mist, mix(p, "hover")]) {
      expect(contrastRatio(mix(p, "muted"), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.red, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(p.red, mix(p, "redTint"))).toBeGreaterThanOrEqual(4.5);
    for (const bg of [p.red, mix(p, "redHover"), mix(p, "redPress")]) {
      expect(contrastRatio(p.onRed, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(p.ink, mix(p, "mistHover"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.paper, mix(p, "inkHover"))).toBeGreaterThanOrEqual(4.5);
  });

  test(`${scheme}: input outlines and the focus ring meet 3:1`, () => {
    expect(contrastRatio(mix(p, "edge"), p.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.red, p.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.red, p.mist)).toBeGreaterThanOrEqual(3);
  });

  test(`${scheme}: css variables cover every palette role`, () => {
    const vars = paletteVariables(p);
    for (const role of PALETTE_ROLE) expect(vars[`--color-${role}`]).toBe(p[role]);
  });
}

test("mixes are emitted as color-mix of palette variables", () => {
  const vars = sharedVariables(tokens);
  expect(vars["--color-muted"]).toBe(
    "color-mix(in oklab, var(--color-ink) 62%, var(--color-paper))",
  );
  expect(vars["--size-tapTarget"]).toBe("44px");
  expect(vars["--duration-slow"]).toBe("320ms");
  expect(vars["--press-row"]).toBe("0.985");
  expect(vars["--fontSize-large"]).toBe("34px");
});
```

Create `packages/ui-logic/test/theme.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readThemePref, resolveScheme, THEME_PREF } from "../src/index.ts";

test("a stored pref is read through the schema; anything else is light", () => {
  expect(THEME_PREF).toEqual(["light", "dark", "system"]);
  expect(readThemePref("dark")).toBe("dark");
  expect(readThemePref("system")).toBe("system");
  for (const raw of [null, undefined, "", "Dark", "blue", 1]) expect(readThemePref(raw)).toBe("light");
});

test("system follows the OS; light and dark ignore it", () => {
  expect(resolveScheme("system", true)).toBe("dark");
  expect(resolveScheme("system", false)).toBe("light");
  expect(resolveScheme("light", true)).toBe("light");
  expect(resolveScheme("dark", false)).toBe("dark");
});
```

Run: `bun test packages/ui-logic/test/tokens.test.ts packages/ui-logic/test/theme.test.ts`
Expected: FAIL (`mixOklab`, `PALETTE_ROLE`, `readThemePref` are not exported).

- [ ] **Step 3: Implement the oklab mix, tokens and theme pref**

Append to `packages/ui-logic/src/contrast.ts`:

```ts
function toByte(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function rgbOf(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`expected #rrggbb, got ${hex}`);
  const [, r = "00", g = "00", b = "00"] = match;
  return [channel(Number.parseInt(r, 16)), channel(Number.parseInt(g, 16)), channel(Number.parseInt(b, 16))];
}

function toOklab(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map((c) => toByte(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `pct` percent of `from` mixed into `to` in oklab, the value CSS gives for
 * color-mix(in oklab, from pct%, to). Used to test derived colors for contrast.
 */
export function mixOklab(from: string, to: string, pct: number): string {
  const a = toOklab(from);
  const b = toOklab(to);
  const w = pct / 100;
  return fromOklab([a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w), a[2] * w + b[2] * (1 - w)]);
}
```

Replace `packages/ui-logic/src/tokens.ts` with:

```ts
import { z } from "zod";
import { mixOklab } from "./contrast.ts";

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const Name = z.string().regex(/^[a-z][A-Za-z]*$/);

export const PALETTE_ROLE = ["paper", "ink", "red", "mist", "onRed"] as const;
export const PaletteRole = z.enum(PALETTE_ROLE);
export type PaletteRole = z.infer<typeof PaletteRole>;

const Palette = z.strictObject({ paper: Hex, ink: Hex, red: Hex, mist: Hex, onRed: Hex });
export type Palette = z.infer<typeof Palette>;

/** `pct` percent of `from` mixed into `to`, as color-mix(in oklab, from pct%, to). */
const Mix = z.strictObject({ from: PaletteRole, to: PaletteRole, pct: z.number().min(0).max(100) });
export type Mix = z.infer<typeof Mix>;

export const Tokens = z.strictObject({
  color: z.strictObject({ light: Palette, dark: Palette }),
  mix: z.record(Name, Mix),
  font: z.strictObject({
    display: z.string().min(1),
    body: z.string().min(1),
    mono: z.string().min(1),
  }),
  fontSize: z.record(Name, z.number().positive()),
  lineHeight: z.record(Name, z.number().positive()),
  space: z.record(Name, z.number().nonnegative()),
  radius: z.record(Name, z.number().nonnegative()),
  size: z.object({ tapTarget: z.number().min(44) }).catchall(z.number().positive()),
  duration: z.record(Name, z.number().min(0).max(320)),
  easing: z.strictObject({ standard: z.string().min(1) }),
  press: z.record(Name, z.number().min(0.9).max(1)),
});
export type Tokens = z.infer<typeof Tokens>;

/**
 * Seawolf (decision 20): four colors and oklab mixes of them. Source of truth
 * until DESIGN.md is written from the built screens; change both together after
 * that. Status is icon plus red, never another hue. Scrims and shadows are
 * written in CSS as ink mixed into transparent, so they are not tokens.
 */
export const tokens: Tokens = {
  color: {
    light: { paper: "#FBFAF9", ink: "#1A1717", red: "#990000", mist: "#ECE8E6", onRed: "#FFFFFF" },
    dark: { paper: "#151313", ink: "#EEEAE8", red: "#EF6B63", mist: "#262222", onRed: "#151313" },
  },
  mix: {
    muted: { from: "ink", to: "paper", pct: 62 },
    line: { from: "ink", to: "paper", pct: 10 },
    edge: { from: "ink", to: "paper", pct: 45 },
    hover: { from: "mist", to: "paper", pct: 55 },
    redTint: { from: "red", to: "paper", pct: 12 },
    redHover: { from: "red", to: "ink", pct: 88 },
    redPress: { from: "red", to: "ink", pct: 76 },
    inkHover: { from: "ink", to: "paper", pct: 85 },
    mistHover: { from: "mist", to: "ink", pct: 82 },
  },
  font: {
    display: '"Newsreader Variable", ui-serif, Georgia, serif',
    body: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  fontSize: {
    caption: 12,
    small: 13,
    label: 14,
    body: 15,
    input: 16,
    barTitle: 18,
    group: 20,
    figure: 22,
    large: 34,
  },
  lineHeight: { tight: 1.08, snug: 1.25, body: 1.5 },
  space: { xxs: 4, xs: 8, sm: 12, md: 16, gutter: 20, lg: 24, xl: 32 },
  radius: { s: 8, m: 12, l: 20, sheet: 22, pill: 999 },
  size: { tapTarget: 44, bar: 52, row: 52, control: 46, thumb: 40, column: 680 },
  duration: { fast: 120, base: 220, slow: 320, reduced: 80 },
  easing: { standard: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  press: { row: 0.985, control: 0.97 },
};

/** The hex a mix resolves to in one palette, for contrast tests. */
export function resolveMix(p: Palette, m: Mix): string {
  return mixOklab(p[m.from], p[m.to], m.pct);
}

/** The five palette roles as --color-* custom properties. */
export function paletteVariables(p: Palette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of PALETTE_ROLE) vars[`--color-${role}`] = p[role];
  return vars;
}

/** Everything that does not change with the scheme. Mixes refer to the palette variables. */
export function sharedVariables(t: Tokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, m] of Object.entries(t.mix)) {
    vars[`--color-${name}`] =
      `color-mix(in oklab, var(--color-${m.from}) ${m.pct}%, var(--color-${m.to}))`;
  }
  for (const [name, value] of Object.entries(t.font)) vars[`--font-${name}`] = value;
  for (const [name, value] of Object.entries(t.fontSize)) vars[`--fontSize-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.lineHeight)) vars[`--lineHeight-${name}`] = String(value);
  for (const [name, value] of Object.entries(t.space)) vars[`--space-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.size)) vars[`--size-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.duration)) vars[`--duration-${name}`] = `${value}ms`;
  for (const [name, value] of Object.entries(t.easing)) vars[`--easing-${name}`] = value;
  for (const [name, value] of Object.entries(t.press)) vars[`--press-${name}`] = String(value);
  return vars;
}
```

Create `packages/ui-logic/src/theme.ts`:

```ts
import { z } from "zod";

export const THEME_PREF = ["light", "dark", "system"] as const;
export const ThemePref = z.enum(THEME_PREF);
export type ThemePref = z.infer<typeof ThemePref>;

/** Where the pref lives on this device. The inline boot script in apps/web/index.html uses the same key. */
export const THEME_STORAGE_KEY = "perch.theme";

/** Storage is a trust boundary: anything that is not a known pref reads as the default, light. */
export function readThemePref(raw: unknown): ThemePref {
  const parsed = ThemePref.safeParse(raw);
  return parsed.success ? parsed.data : "light";
}

export function resolveScheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}
```

Add `export * from "./theme.ts";` to `packages/ui-logic/src/index.ts`.

Run: `bun test packages/ui-logic/test/tokens.test.ts packages/ui-logic/test/theme.test.ts`
Expected: PASS. `bun run typecheck` fails in `apps/web/src/ui/theme.ts` and `apps/web/test/theme.test.ts` (they use `toCssVariables` and student palettes); the next step fixes them, so do not commit yet.

- [ ] **Step 4: Generate tokens.css and keep old variables alive through legacy.css**

Replace `apps/web/test/theme.test.ts` with:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@perch/ui-logic";
import { expect, test } from "vitest";
import { themeCss } from "../src/ui/theme.ts";

const UI = fileURLToPath(new URL("../src/ui/", import.meta.url));
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

test("tokens.css is generated from the token source (run bun run tokens:gen)", () => {
  expect(readFileSync(join(UI, "tokens.css"), "utf8")).toBe(themeCss(tokens));
});

test("light is the default; dark applies by data-theme or by the OS when the pref is system", () => {
  const css = themeCss(tokens);
  expect(css).toContain(`--color-paper: ${tokens.color.light.paper};`);
  expect(css).toContain(':root[data-theme="dark"]');
  expect(css).toContain(":root:not([data-theme])");
  expect(css).toContain(`--color-paper: ${tokens.color.dark.paper};`);
  expect(css).not.toContain("stamp");
});

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith(".css") ? [join(dir, e.name)] : [],
  );
}

test("every var() without a fallback is defined in some stylesheet", () => {
  const files = cssFiles(SRC);
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const defined = new Set([...all.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // A var() with a fallback may be set inline by a component (style={{ "--i": 2 }}).
  const used = new Set([...all.matchAll(/var\((--[A-Za-z0-9-]+)\s*\)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => v !== undefined && !defined.has(v));
  expect(missing).toEqual([]);
});
```

Replace `apps/web/src/ui/theme.ts` with:

```ts
import { paletteVariables, sharedVariables, type Tokens } from "@perch/ui-logic";

function block(selector: string, vars: Record<string, string>, indent = ""): string {
  const lines = Object.entries(vars).map(([name, value]) => `${indent}  ${name}: ${value};`);
  return `${indent}${selector} {\n${lines.join("\n")}\n${indent}}`;
}

/**
 * The token stylesheet: light on :root, dark when data-theme says so, and dark
 * from the OS only when no data-theme is set (the "system" pref). The inline
 * boot script in index.html sets data-theme before this loads.
 */
export function themeCss(t: Tokens): string {
  const dark = { ...paletteVariables(t.color.dark), "color-scheme": "dark" };
  return `${[
    "/* Generated by `bun run tokens:gen` from packages/ui-logic/src/tokens.ts. Do not edit. */",
    block(":root", { ...sharedVariables(t), ...paletteVariables(t.color.light), "color-scheme": "light" }),
    block(':root[data-theme="dark"]', dark),
    `@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme])", dark, "  ")}\n}`,
  ].join("\n\n")}\n`;
}
```

Create `apps/web/scripts/gen-tokens.ts`:

```ts
import { writeFileSync } from "node:fs";
import { tokens } from "@perch/ui-logic";
import { themeCss } from "../src/ui/theme.ts";

/** Writes apps/web/src/ui/tokens.css. A Vitest test fails when it is out of date. */
writeFileSync(new URL("../src/ui/tokens.css", import.meta.url), themeCss(tokens));
```

Add to the root `package.json` scripts: `"tokens:gen": "bun apps/web/scripts/gen-tokens.ts"`. Add `"!apps/web/src/ui/tokens.css"` to `files.includes` in `biome.json` (a generated file; biome must not reformat it). Run `bun run tokens:gen`.

Create `apps/web/src/ui/legacy.css`. It maps every pre-redesign variable onto Seawolf so screens not yet converted keep working. Task 12 deletes it.

```css
/* Temporary: pre-redesign variables mapped onto Seawolf. Deleted in the last redesign task. */
:root {
  --color-background: var(--color-paper);
  --color-surface: var(--color-mist);
  --color-text: var(--color-ink);
  --color-textMuted: var(--color-muted);
  --color-border: var(--color-line);
  --color-borderStrong: var(--color-edge);
  --color-accent: var(--color-ink);
  --color-onAccent: var(--color-paper);
  --color-success: var(--color-ink);
  --color-warning: var(--color-red);
  --color-danger: var(--color-red);
  --color-focus: var(--color-red);
  --color-onSuccess: var(--color-paper);
  --color-onWarning: var(--color-onRed);
  --color-onDanger: var(--color-onRed);
  --color-shell: var(--color-ink);
  --color-onShell: var(--color-paper);
  --color-focusOnShell: var(--color-paper);
  --color-airmail: var(--color-ink);
  --fontSize-title: 20px;
  --fontSize-heading: 24px;
  --fontSize-display: 32px;
  --space-line: 44px;
  --radius-none: 0px;
  --radius-card: 4px;
  --radius-control: 4px;
  --size-line: 44px;
  --size-header: 48px;
  --size-postmark: 36px;
  --size-rule: 1px;
  --duration-stamp: 160ms;
  --easing-stamp: cubic-bezier(0.3, 1.4, 0.5, 1);
  --easing-exit: cubic-bezier(0.4, 0, 1, 1);
}
```

Run `bunx vitest run test/theme.test.ts` in `apps/web`. If "every var() used" lists more names, add each to `legacy.css`: colors through the mapping above, everything else at its old value from `git show HEAD~1:packages/ui-logic/src/tokens.ts`.

In `apps/web/src/main.tsx`: remove `installTheme` and its import, and make the CSS imports, in this order:

```ts
import "./ui/tokens.css";
import "./ui/legacy.css";
import "./ui/fonts.css";
import "./ui/styles.css";
import "./screens/spot.css";
import "./screens/admin.css";
```

Delete `installTheme` from `theme.ts` (already gone in the replacement above) and remove the `@fontsource/public-sans` imports.

- [ ] **Step 5: Self-host the fonts**

In `apps/web/package.json`, remove `@fontsource/public-sans`, then add the two variable packages: `cd apps/web && bun remove @fontsource/public-sans && bun add @fontsource-variable/newsreader@^5.3.0 @fontsource-variable/instrument-sans@^5.3.0`.

Create `apps/web/src/ui/fonts.css`. It lists latin and latin-ext only; the packages' own CSS would also pull in Vietnamese, and Workbox precaches every emitted font. Newsreader uses the `opsz` file, which carries both the opsz (6 to 72) and wght (200 to 800) axes; Instrument Sans uses the `wght` file (400 to 700). Vite resolves the bare package paths in `url()`.

```css
/* Self-hosted for offline use (decision 20). latin and latin-ext only. */
@font-face {
  font-family: "Newsreader Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 200 800;
  src: url("@fontsource-variable/newsreader/files/newsreader-latin-ext-opsz-normal.woff2")
    format("woff2-variations");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308,
    U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113,
    U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: "Newsreader Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 200 800;
  src: url("@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2")
    format("woff2-variations");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304,
    U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: "Instrument Sans Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 400 700;
  src: url("@fontsource-variable/instrument-sans/files/instrument-sans-latin-ext-wght-normal.woff2")
    format("woff2-variations");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308,
    U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113,
    U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: "Instrument Sans Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 400 700;
  src: url("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2")
    format("woff2-variations");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304,
    U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
```

Run: `cd apps/web && bunx vite build --outDir "${CLAUDE_JOB_DIR:-/tmp}/perch-build" && ls "${CLAUDE_JOB_DIR:-/tmp}/perch-build/assets" | grep woff2`
Expected: exactly four `.woff2` files (two families, two subsets each) and no Public Sans or Vietnamese files. Delete that build dir afterwards. Never build into `apps/web/dist`.

- [ ] **Step 6: Base styles**

Rewrite the top of `apps/web/src/ui/styles.css` (the reset, `html` and `body`, headings, the focus ring, links, `.visually-hidden`, `.btn` and its variants, and the reduced-motion block). Leave every other selector in the file for now, including `.stamp*`, `.syncmark*`, `.postmark*` and `.ruled*`; `apps/web/test/components.test.tsx` still reads them until Task 12. Rules:

- `html`: `background: var(--color-paper)`, `-webkit-text-size-adjust: 100%`, `scroll-padding-top: var(--size-bar)`.
- `body`: `margin: 0`, `background: var(--color-paper)`, `color: var(--color-ink)`, `font-family: var(--font-body)`, `font-size: var(--fontSize-body)`, `line-height: var(--lineHeight-body)`, `-webkit-font-smoothing: antialiased`, `-webkit-tap-highlight-color: transparent`, `transition: background-color var(--duration-base) var(--easing-standard), color var(--duration-base) var(--easing-standard)`.
- `h1, h2, h3`: `font-family: var(--font-display)`, `font-weight: 500`, `letter-spacing: -0.015em`, `text-wrap: balance`, `margin: 0`.
- `:focus-visible`: `outline: 2px solid var(--color-red)`, `outline-offset: 2px`.
- `.btn`: inline-flex, centered, gap 8 px, `min-height: var(--size-control)` (46), padding `0 18px`, `border: 0`, `border-radius: var(--radius-m)`, `font: 600 var(--fontSize-body)/1 var(--font-body)`, `cursor: pointer`, transitions on background-color, transform and opacity at `--duration-fast`. `:active:not(:disabled):not([aria-disabled="true"])` applies `transform: translateY(1px) scale(0.99)`. `:disabled, [aria-disabled="true"]` sets `opacity: 0.45` and `cursor: not-allowed`.
- Variants (keep the old class names working, mapped as noted):
  - `.btn--primary`: red with onRed; hover redHover; active redPress.
  - `.btn--ink`, plus the old `.btn--secondary`: ink with paper; hover inkHover.
  - `.btn--quiet`: mist with ink; hover and active mistHover.
  - `.btn--ghost`: transparent with muted; hover is the hover fill with ink.
  - `.btn--danger`: mist with red text; hover mistHover.
- Hover rules sit inside `@media (hover: hover)`.
- `@media (prefers-reduced-motion: reduce)`: `*, *::before, *::after { transition-property: opacity, background-color, color, border-color !important; transition-duration: var(--duration-reduced) !important; animation: none !important; } :active { transform: none !important; }`. Transforms that place things (the segmented thumb) still apply, they just do not animate. Sheets switch to a fade in Task 2. Keep the old `.syncmark--busy .syncmark__ring` override inside it.

- [ ] **Step 7: Run the web tests, then commit tokens, fonts and base styles**

Run: `bun run typecheck && bun run lint && bun test packages/ui-logic --timeout 60000 && bun run --filter '@perch/web' test`
Expected: PASS. If `components.test.tsx` fails on CSS it reads (filled stamps, the syncmark width), restore those rules; they leave in Task 12.

One commit: the ui-logic token change alone would break `apps/web` typecheck, which the pre-commit hook runs.

```bash
git add packages/ui-logic/src/contrast.ts packages/ui-logic/src/tokens.ts packages/ui-logic/src/theme.ts packages/ui-logic/src/index.ts packages/ui-logic/test/tokens.test.ts packages/ui-logic/test/theme.test.ts apps/web/scripts/gen-tokens.ts apps/web/src/ui/tokens.css apps/web/src/ui/legacy.css apps/web/src/ui/fonts.css apps/web/src/ui/theme.ts apps/web/src/ui/styles.css apps/web/src/main.tsx apps/web/test/theme.test.ts apps/web/package.json bun.lock biome.json package.json
git commit -m "feat(web): seawolf tokens, self-hosted fonts and base styles"
```

- [ ] **Step 8: Write the failing theme boot tests**

Create `apps/web/test/themeBoot.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tokens } from "@perch/ui-logic";
import { afterEach, expect, test, vi } from "vitest";
import { applyThemePref, storeThemePref } from "../src/ui/themePref.ts";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const boot = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

function page(systemDark: boolean): void {
  document.head.innerHTML =
    '<meta name="color-scheme" content="light" /><meta name="theme-color" content="#FBFAF9" />';
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q === "(prefers-color-scheme: dark)" && systemDark,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
const meta = (name: string) =>
  document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

test("the boot script runs before any stylesheet or module", () => {
  expect(boot).not.toBe("");
  const at = html.indexOf('id="theme-boot"');
  expect(at).toBeLessThan(html.indexOf("<link"));
  expect(at).toBeLessThan(html.indexOf('type="module"'));
});

for (const [stored, systemDark, attr, scheme, color] of [
  [null, true, "light", "light", tokens.color.light.paper],
  ["junk", true, "light", "light", tokens.color.light.paper],
  ["dark", false, "dark", "dark", tokens.color.dark.paper],
  ["system", true, null, "light dark", tokens.color.dark.paper],
  ["system", false, null, "light dark", tokens.color.light.paper],
] as const) {
  test(`boot: stored ${stored}, OS dark ${systemDark}`, () => {
    page(systemDark);
    if (stored !== null) localStorage.setItem("perch.theme", stored);
    new Function(boot)();
    expect(document.documentElement.getAttribute("data-theme")).toBe(attr);
    expect(meta("color-scheme")).toBe(scheme);
    expect(meta("theme-color")?.toUpperCase()).toBe(color.toUpperCase());
  });

  test(`runtime apply matches boot: stored ${stored}, OS dark ${systemDark}`, () => {
    page(systemDark);
    applyThemePref(stored === "dark" || stored === "system" ? stored : "light", document, systemDark);
    expect(document.documentElement.getAttribute("data-theme")).toBe(attr);
    expect(meta("color-scheme")).toBe(scheme);
    expect(meta("theme-color")?.toUpperCase()).toBe(color.toUpperCase());
  });
}

test("storing a pref persists it and applies it at once", () => {
  page(false);
  storeThemePref("dark");
  expect(localStorage.getItem("perch.theme")).toBe("dark");
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});
```

Run: `cd apps/web && bunx vitest run test/themeBoot.test.ts`
Expected: FAIL (no `#theme-boot`, no `themePref.ts`).

- [ ] **Step 9: Implement the boot script, the runtime theme and the switch**

In `apps/web/index.html`, replace the `color-scheme`, both `theme-color` metas and the status-bar meta, and add the boot script directly after the metas, before the `<link>` tags:

```html
    <meta name="color-scheme" content="light" />
    <meta name="theme-color" content="#FBFAF9" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <script id="theme-boot">
      // Applies the stored theme before first paint. Same rules as src/ui/themePref.ts.
      (function () {
        var pref = "light";
        try {
          var s = localStorage.getItem("perch.theme");
          if (s === "dark" || s === "system") pref = s;
        } catch (e) {}
        var root = document.documentElement;
        var dark =
          pref === "dark" ||
          (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (pref === "system") root.removeAttribute("data-theme");
        else root.setAttribute("data-theme", pref);
        var cs = document.querySelector('meta[name="color-scheme"]');
        if (cs) cs.setAttribute("content", pref === "system" ? "light dark" : pref);
        var tc = document.querySelector('meta[name="theme-color"]');
        if (tc) tc.setAttribute("content", dark ? "#151313" : "#FBFAF9");
      })();
    </script>
```

In `apps/web/vite.config.ts`, the manifest gets `background_color: "#FBFAF9"` and `theme_color: "#FBFAF9"`.

Create `apps/web/src/ui/themePref.ts`:

```ts
import {
  readThemePref,
  resolveScheme,
  THEME_STORAGE_KEY,
  type ThemePref,
  tokens,
} from "@perch/ui-logic";
import { useEffect, useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function systemIsDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK).matches;
}

/** Same rules as the boot script in index.html (tested against it). */
export function applyThemePref(
  pref: ThemePref,
  doc: Document = document,
  systemDark: boolean = systemIsDark(),
): void {
  const root = doc.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  doc
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", pref === "system" ? "light dark" : pref);
  const scheme = resolveScheme(pref, systemDark);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.color[scheme].paper);
}

export function currentThemePref(): ThemePref {
  try {
    return readThemePref(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function storeThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private mode or blocked storage: the switch still applies for this visit.
  }
  applyThemePref(pref);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The device's theme pref and a setter. While it is "system", OS changes update the theme-color meta. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, currentThemePref, () => "light" as const);
  useEffect(() => {
    if (pref !== "system" || typeof matchMedia !== "function") return;
    const mq = matchMedia(DARK);
    const sync = () => applyThemePref("system");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [pref]);
  return [pref, storeThemePref];
}
```

Add copy to `docs/design/surveyor-copy.md` in a new section placed before `## Pending questions`:

```md
## Redesign (2026-10-07)

| id | text | max chars | notes |
|---|---|---|---|
| theme.label | Theme | 8 | Actions sheet |
| theme.light | Light | 8 | |
| theme.dark | Dark | 8 | |
| theme.system | System | 8 | follows the phone |
```

Run `bun run copy:gen`.

Create `apps/web/src/ui/ThemeSwitch.tsx`:

```tsx
import { t, type ThemePref } from "@perch/ui-logic";
import { useThemePref } from "./themePref.ts";
import { Segmented } from "./Segmented.tsx";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: t("theme.light") },
  { value: "dark", label: t("theme.dark") },
  { value: "system", label: t("theme.system") },
];

/** Light, dark, or follow the phone. Stored on this device only. */
export function ThemeSwitch() {
  const [pref, setPref] = useThemePref();
  return <Segmented label={t("theme.label")} options={OPTIONS} value={pref} onChange={setPref} />;
}
```

Run: `cd apps/web && bunx vitest run test/themeBoot.test.ts test/theme.test.ts`
Expected: PASS.

- [ ] **Step 10: Write and run the no-flash e2e tests**

Create `apps/web/e2e/theme.e2e.ts`:

```ts
import { expect, test } from "./fixtures.ts";

const bg = () => getComputedStyle(document.body).backgroundColor;

test("a stored dark theme paints dark before the app script runs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("perch.theme", "dark"));
  let release = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(/\/assets\/index-[^/]*\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/survey", { waitUntil: "commit" });
  await expect.poll(() => page.evaluate(bg)).toBe("rgb(21, 19, 19)");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  release();
});

test("with nothing stored, a dark OS still gets the light default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/survey");
  await expect.poll(() => page.evaluate(bg)).toBe("rgb(251, 250, 249)");
});
```

Run: `cd apps/web && bunx playwright test e2e/theme.e2e.ts`
Expected: 2 passed.

- [ ] **Step 11: Procedure V, then commit**

Run Procedure V on routes `/survey /survey/admin`. Expected: PASS lines. The screens still look like the postcard layout, now in Seawolf colors and fonts; that is expected.

Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test`
Expected: PASS.

```bash
git add apps/web/index.html apps/web/vite.config.ts apps/web/src/ui/themePref.ts apps/web/src/ui/ThemeSwitch.tsx apps/web/test/themeBoot.test.ts apps/web/e2e/theme.e2e.ts docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(web): light, dark and system theme with no flash"
```

---

### Task 2: Shell primitives, motion, and the scroll fix

**Files:**
- Create: `apps/web/src/ui/Icon.tsx`, `apps/web/src/ui/TopBar.tsx`, `apps/web/src/ui/ActionBar.tsx`, `apps/web/src/ui/Row.tsx`, `apps/web/src/ui/Pill.tsx`, `apps/web/src/ui/StepBar.tsx`, `apps/web/src/hooks/useLargeTitle.ts`, `apps/web/src/lib/icons.ts`, `apps/web/src/app/scrollKey.ts`, `apps/web/src/screens/SyncStatus.tsx`, `apps/web/e2e/layout.ts`, `apps/web/e2e/layout.e2e.ts`, `apps/web/e2e/nav.e2e.ts`, `apps/web/test/shell.test.tsx`
- Modify: `apps/web/src/ui/Button.tsx`, `apps/web/src/ui/Screen.tsx`, `apps/web/src/ui/Sheet.tsx`, `apps/web/src/ui/Toast.tsx`, `apps/web/src/ui/styles.css`, `apps/web/src/screens/SurveyHeader.tsx`, `apps/web/src/routes/__root.tsx`, `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: the CSS variables from Task 1.
- Produces:
  - `Icon(props: { icon: LucideIcon; size?: number; className?: string })`, which renders `<props.icon aria-hidden="true" strokeWidth={1.75} size={size ?? 20} />`.
  - `type ButtonVariant = "primary" | "ink" | "quiet" | "ghost" | "danger"`; the old `"secondary"` is kept as an alias of `"ink"` until Task 12. `Button` props add `trailingIcon?: ReactNode`.
  - `IconButton(props: { label: string; icon: LucideIcon; onClick?: () => void; link?: LinkProps; pressed?: boolean })`.
  - `TopBar(props: { title: string; back?: LinkProps; trailing?: ReactNode; scrolled: boolean })`.
  - `useLargeTitle(): { ref: RefCallback<HTMLElement>; scrolled: boolean }`.
  - `Screen(props: { title: string; back?: LinkProps; trailing?: ReactNode; meta?: ReactNode; action?: ReactNode; children: ReactNode })`. It renders the TopBar, `<main>` with the column, the `h1.large-title`, `meta`, then the children, then `<ActionBar>` when `action` is set.
  - `GroupHeading(props: { children: ReactNode; id?: string; count?: number })`.
  - `ActionBar(props: { children: ReactNode; stacked?: boolean })`.
  - `Row(props: { title: string; sub?: ReactNode; lead?: ReactNode; end?: ReactNode; link?: LinkProps; onClick?: () => void; compact?: boolean })`, which renders `<li>` holding an `<a>`, a `<button>` or a `<div>`.
  - `Pill(props: { tone?: "mist" | "red"; icon?: LucideIcon; children: ReactNode })`.
  - `StepBar(props: { steps: readonly StepState[]; label: string })`. `StepState` comes from ui-logic in Task 3; this task declares `type StepState = "done" | "current" | "todo"` locally in `StepBar.tsx`, and Task 3 replaces it with the import.
  - `SECTION_ICON: Record<OverviewSection, LucideIcon>`.
  - `scrollKey(location: ParsedLocation): string`.
  - `SyncStatus(props: { variant: "icon" | "bar" })`.
  - `layoutProblems(page: Page): Promise<string[]>`.

- [ ] **Step 0: Fix scroll restoration first (its own commit)**

Create `apps/web/test/scrollKey.test.ts`:

```ts
import { expect, test } from "vitest";
import { scrollKey } from "../src/app/scrollKey.ts";

const loc = (pathname: string, key = "k1") =>
  ({ pathname, href: pathname, state: { __TSR_key: key } }) as unknown as Parameters<typeof scrollKey>[0];

test("Home and the overview restore by path; editors and new spot open fresh", () => {
  expect(scrollKey(loc("/survey"))).toBe("/survey");
  expect(scrollKey(loc("/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11"))).toBe(
    "/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
  );
  expect(scrollKey(loc("/survey/spots/new", "k2"))).toBe("k2");
  expect(scrollKey(loc("/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11/seating", "k3"))).toBe("k3");
  expect(scrollKey(loc("/survey/admin", "k4"))).toBe("k4");
});
```

Create `apps/web/e2e/nav.e2e.ts` as given in Step 4 below. On the legacy overview the Back link is the header band's "Back" link, and section rows are links to `/survey/spots/<id>/<section>`, so the test runs unchanged before and after the restyle.

Run: `cd apps/web && bunx vitest run test/scrollKey.test.ts && bunx playwright test e2e/nav.e2e.ts`
Expected: FAIL (no `scrollKey.ts`; the e2e test sees scrollY 48 in the editor).

Implement `scrollKey.ts`, the `main.tsx` router option and the `__root.tsx` focus change exactly as in Step 2 below. Run the same two commands. Expected: PASS. Then run `bun run typecheck && bun run lint && bun run --filter '@perch/web' test`, and commit with only these files modified:

```bash
git add apps/web/src/app/scrollKey.ts apps/web/src/main.tsx apps/web/src/routes/__root.tsx apps/web/test/scrollKey.test.ts apps/web/e2e/nav.e2e.ts
git commit -m "fix(web): keep scroll position when returning to a spot"
```

- [ ] **Step 1: Write the failing unit tests**

Create `apps/web/test/shell.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useLargeTitle } from "../src/hooks/useLargeTitle.ts";
import { StepBar } from "../src/ui/StepBar.tsx";

afterEach(() => vi.unstubAllGlobals());

test("the step bar draws one segment per step and names the progress", () => {
  const { container } = render(<StepBar steps={["done", "done", "current", "todo"]} label="2 of 4 done" />);
  expect(screen.getByRole("img", { name: "2 of 4 done" })).toBeTruthy();
  expect(container.querySelectorAll(".stepbar__step")).toHaveLength(4);
  expect(container.querySelectorAll(".stepbar__step--current")).toHaveLength(1);
});

test("the bar title appears once the large title leaves the viewport", () => {
  let fire: (visible: boolean) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        fire = (visible) => cb([{ isIntersecting: visible }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  function Probe() {
    const { ref, scrolled } = useLargeTitle();
    return <h1 ref={ref}>{scrolled ? "scrolled" : "top"}</h1>;
  }
  render(<Probe />);
  expect(screen.getByRole("heading").textContent).toBe("top");
  act(() => fire(false));
  expect(screen.getByRole("heading").textContent).toBe("scrolled");
});

test("without IntersectionObserver the bar title stays hidden and nothing throws", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  function Probe() {
    const { ref, scrolled } = useLargeTitle();
    return <h1 ref={ref}>{scrolled ? "scrolled" : "top"}</h1>;
  }
  render(<Probe />);
  expect(screen.getByRole("heading").textContent).toBe("top");
});
```

Run: `cd apps/web && bunx vitest run test/shell.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 2: Implement useLargeTitle and StepBar (scrollKey and the focus fix are the Step 0 code)**

Create `apps/web/src/app/scrollKey.ts`:

```ts
import { defaultGetScrollRestorationKey, type ParsedLocation } from "@tanstack/react-router";

// /survey and /survey/spots/<id>, but not /survey/spots/new.
const RESTORES_BY_PATH = /^\/survey(?:\/spots\/(?!new\/?$)[^/]+)?\/?$/;

/**
 * Home and the spot overview come back where they were, even when reached by a
 * push (Back link, Save); every other screen opens at the top.
 */
export function scrollKey(location: ParsedLocation): string {
  return RESTORES_BY_PATH.test(location.pathname)
    ? location.pathname
    : defaultGetScrollRestorationKey(location);
}
```

If `defaultGetScrollRestorationKey` is not exported by `@tanstack/react-router` 1.170, import it from `@tanstack/router-core` (add that as a dependency of `apps/web` at the version `bun pm ls` shows) and say so in the report.

In `apps/web/src/main.tsx`: `createRouter({ routeTree, defaultPreload: false, scrollRestoration: true, getScrollRestorationKey: scrollKey })`.

In `apps/web/src/routes/__root.tsx`, change the focus call to `document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });` and update the comment: "Focus without scrolling: the router has already restored or reset scroll (it used to jump to the header height)."

Create `apps/web/src/hooks/useLargeTitle.ts`:

```ts
import { type RefCallback, useCallback, useEffect, useRef, useState } from "react";

/**
 * True once the large title has scrolled under the top bar, so the bar can show
 * its small title. Without IntersectionObserver the bar title just stays hidden.
 */
export function useLargeTitle(): { ref: RefCallback<HTMLElement>; scrolled: boolean } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const ref = useCallback<RefCallback<HTMLElement>>((node) => setEl(node), []);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (el === null || typeof IntersectionObserver !== "function") return;
    observer.current = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last !== undefined) setScrolled(!last.isIntersecting);
      },
      { rootMargin: "-52px 0px 0px 0px", threshold: 0 },
    );
    observer.current.observe(el);
    return () => observer.current?.disconnect();
  }, [el]);
  return { ref, scrolled };
}
```

Create `apps/web/src/ui/StepBar.tsx`:

```tsx
export type StepState = "done" | "current" | "todo";

/** One 4 px segment per required section: done ink, current red, todo mist. */
export function StepBar(props: { steps: readonly StepState[]; label: string }) {
  return (
    <div className="stepbar" role="img" aria-label={props.label}>
      {props.steps.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their position
        <span key={i} className={`stepbar__step stepbar__step--${s}`} />
      ))}
    </div>
  );
}
```

Run: `cd apps/web && bunx vitest run test/shell.test.tsx`
Expected: PASS.

- [ ] **Step 3: Build the remaining primitives**

`apps/web/src/lib/icons.ts`:

```ts
import type { OverviewSection } from "@perch/ui-logic";
import {
  Accessibility,
  Armchair,
  Camera,
  ChartColumn,
  Clock,
  Coffee,
  DoorOpen,
  type LucideIcon,
  MapPin,
  Moon,
  Plug,
  Utensils,
  Volume2,
} from "lucide-react";

/** One icon per overview section, used on rows, editor labels and the Actions sheet. */
export const SECTION_ICON: Record<OverviewSection, LucideIcon> = {
  identity: MapPin,
  access: DoorOpen,
  seating: Armchair,
  power: Plug,
  environment: Volume2,
  use_fit: Utensils,
  hours: Clock,
  amenities: Coffee,
  accessibility: Accessibility,
  late_night: Moon,
  estimates: ChartColumn,
  photos: Camera,
};
```

If an import name is missing from the installed `lucide-react`, typecheck says so; use the nearest icon and note it.

Components (CSS goes in `styles.css` under a `/* Shell */` heading; values from the spec section 4 and the mock CSS for `.bar`, `.bar__title`, `.title`, `.h-group`, `.row`, `.pill`, `.actionbar`, `.sheet`, `.scrim`, `.grab`, `.toast`, `.iconbtn`, `.stepdots`):

- `Icon.tsx`: as in Interfaces.
- `Button.tsx`: add `"ink" | "ghost"` and keep `"secondary"` mapped to the `btn--ink` class. Add `IconButton`: a 40 px round `.icon-btn`, with its hit area extended to 44 px by `::before { content: ""; position: absolute; inset: -2px; }` (the element is `position: relative`). It renders a `Link` when `link` is set, else a `button`. `aria-label={label}`. Pressed scale is `var(--press-control)`.
- `TopBar.tsx`: `<header className={`topbar${scrolled ? " topbar--scrolled" : ""}`}>`. The back link (an IconButton with `ArrowLeft` and the label `t("common.back")`), `<span className="topbar__title" aria-hidden="true">{title}</span>`, then `trailing`. CSS: `position: sticky; top: 0; z-index: 10; height: var(--size-bar)`; background `color-mix(in oklab, var(--color-paper) 88%, transparent)` with `backdrop-filter: blur(12px)`; `border-bottom: 1px solid transparent`, turning to `var(--color-line)` when scrolled; the title is opacity 0 and translateY(6px), going to 1 and none when scrolled, over `--duration-base`; padding-top `env(safe-area-inset-top)`. The inner content is aligned to the column (see Screen).
- `Screen.tsx`: replace `Screen` with the new signature from Interfaces. It calls `useLargeTitle()`, renders `<TopBar scrolled={scrolled} .../>`, then `<main tabIndex={-1} className="screen">` holding `<div className="column">`, then `<h1 ref={ref} className="large-title">{title}</h1>`, then `{meta}` and `{children}`, and then `{action !== undefined ? <ActionBar>{action}</ActionBar> : null}` after `</main>`. CSS:
  - `.column`: `max-width: var(--size-column); margin-inline: auto; padding-inline: var(--space-gutter)`.
  - `.large-title`: `font-size: var(--fontSize-large); line-height: var(--lineHeight-tight); padding: 2px 0 8px; overflow-wrap: anywhere`.
  - `.screen`: `padding-bottom: calc(96px + env(safe-area-inset-bottom))` when there is an action bar.
  - `GroupHeading`: an `h2.group-heading` in Newsreader 20 with a margin of 24 px above and 6 px below, plus an optional count bubble (`.count`).
  - Export a `Meta` helper: `<p className="meta">` with a flex wrap and an 8 px gap, 14 px muted.

  Keep the old `Screen` behavior reachable during migration: rename the current component to `LegacyScreen` (same file, unchanged), and change all current call sites to `LegacyScreen` with `SurveyHeader` as they are. Each screen task moves its screens to the new `Screen`; Task 12 deletes `LegacyScreen`.
- `ActionBar.tsx`: `<footer className={`actionbar${stacked ? " actionbar--stacked" : ""}`}><div className="actionbar__inner">{children}</div></footer>`. CSS:
  - `position: fixed; inset: auto 0 0; z-index: 9`, paper background, `border-top: 1px solid var(--color-line)`, padding `10px 12px calc(14px + env(safe-area-inset-bottom))`.
  - Inner: flex, an 8 px gap, centered, `max-width: var(--size-column)`, margin-inline auto. Stacked is a grid.
  - `@media (min-width: 768px)`: the footer becomes transparent with no border and `bottom: 16px`; the inner gets the paper background, a line border, radius 16, padding 10 px, and the shadow `0 12px 40px -12px color-mix(in oklab, var(--color-ink) 22%, transparent)`.
- `Row.tsx`: `<li className="row-item">` holding a `Link`, `button` or `div` with `className={`row${compact ? " row--compact" : ""}`}`. Its children:
  - `{lead}`;
  - `<span className="row__text">`, holding `<span className="row__title truncate">{title}</span>` and, when given, `<span className="row__sub truncate">{sub}</span>`;
  - `{end !== undefined ? <span className="row__end">{end}</span> : null}`.

  Use the mock's `.row` CSS, with 52 px min-height (46 px compact), the hover fill, and pressed `background: var(--color-mist); transform: scale(var(--press-row))`. Add `.truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`. Add `.row-list { list-style: none; margin: 0; padding: 0; }`.
- `Pill.tsx`: `<span className={`pill pill--${tone ?? "mist"}`}>{icon ? <Icon icon={icon} size={13} /> : null}{children}</span>`. Use the mock's `.pill` and `.pill--red`, with `flex: none` (pills never shrink).
- `Sheet.tsx`: keep the native `<dialog>` and its behavior. Add a grab handle (`<div className="sheet__grab" aria-hidden="true" />`) and the Newsreader 20 title. Motion:
  - `.sheet { transform: translateY(105%); transition: transform var(--duration-slow) var(--easing-standard), display var(--duration-slow) allow-discrete, overlay var(--duration-slow) allow-discrete; }`
  - `.sheet[open] { transform: none; } @starting-style { .sheet[open] { transform: translateY(105%); } }`
  - `.sheet::backdrop { background: color-mix(in oklab, var(--color-ink) 30%, transparent); opacity: 0; transition: opacity var(--duration-base) var(--easing-standard), display ... allow-discrete, overlay ... allow-discrete; } .sheet[open]::backdrop { opacity: 1; } @starting-style { .sheet[open]::backdrop { opacity: 0; } }`
  - The sheet is fixed at the bottom with full width, `max-height: 85dvh`, radius 22 on the top, safe-area padding.
  - `@media (min-width: 768px)`: centered, `width: min(520px, calc(100vw - 32px))`, radius 20 on all corners, `transform: scale(0.98); opacity: 0` going to none and 1.
  - Reduced motion: `.sheet { transform: none; opacity: 0 } .sheet[open] { opacity: 1 }` with the same `@starting-style` on opacity, so the sheet fades instead of sliding.
  - Remove the old `sheet-in` keyframes.
- `Toast.tsx`: ink fill, paper text, a Lucide `Check` icon, radius 12. Fixed `bottom: calc(96px + env(safe-area-inset-bottom))` within the column width. Use `@starting-style` to rise 12 px and fade in. Remove `toast-in`.
- `SyncStatus.tsx`: reads `useSyncHeader()`, as `SyncPostmark` does today, and owns the sync sheet `open` state with `<SyncSheet>`. `variant="icon"` is an IconButton whose icon is `CloudCheck` for all synced, `CloudOff` offline, `RefreshCw` (spinning, but not under reduced motion) syncing or pending, `CircleAlert` red for failed or unreadable, and `Cloud` checking. `variant="bar"` is a ghost button with the same icon plus the short status text from `headerText(header, "short")`. The accessible name is always the full `headerText(header, "long")` (check the existing signature in `src/lib/format.ts`; the e2e tests look for the names "All synced", "Offline", "Syncing 1"). Keep `SyncPostmark.tsx` until Task 12.
- `SurveyHeader.tsx`: unchanged for `LegacyScreen` screens. New screens pass `trailing={<SyncStatus variant="icon" />}` to `Screen` themselves.

- [ ] **Step 4: Create the layout check (the scroll e2e test below is the one Step 0 committed)**

Create `apps/web/e2e/layout.ts`:

```ts
import type { Page } from "@playwright/test";

/**
 * Layout problems on the current page: sideways overflow, hit areas under
 * 44 x 44 px (a control's absolutely positioned ::before counts as its hit
 * area), and clipped text outside deliberate one-line `.truncate` ellipses.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) out.push(`overflow ${doc.scrollWidth - doc.clientWidth}px`);
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const skip = (el: Element) =>
      el.closest(".visually-hidden, [inert], dialog:not([open]), [aria-hidden='true']") !== null;
    const targets = document.querySelectorAll<HTMLElement>(
      'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, label:has(> input)',
    );
    for (const el of targets) {
      if (!shown(el) || skip(el)) continue;
      if (el.matches("input") && el.closest("label") !== null) continue;
      if (el.matches("p a, li > span a")) continue; // inline text links are exempt (WCAG 2.5.8)
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      const b = getComputedStyle(el, "::before");
      if (b.content !== "none" && b.position === "absolute") {
        const grow = (v: string) => Math.max(0, -Number.parseFloat(v) || 0);
        w += grow(b.left) + grow(b.right);
        h += grow(b.top) + grow(b.bottom);
      }
      if (w < 43.5 || h < 43.5) out.push(`target ${Math.round(w)}x${Math.round(h)} ${describe(el)}`);
    }
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (!shown(el) || skip(el)) continue;
      const s = getComputedStyle(el);
      if (s.overflowX === "visible" || s.overflowX === "auto" || s.overflowX === "scroll") continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (el.classList.contains("truncate") && el.clientWidth >= 64) continue;
      out.push(`clipped ${describe(el)}`);
    }
    return out;
  });
}

export const WIDTHS = [375, 768, 1440] as const;
```

Create `apps/web/e2e/layout.e2e.ts`. Each screen task adds its route to `ROUTES`; this task checks only the shell parts that exist everywhere (it limits the scan to the top bar and the action bar while screens are still legacy):

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, signIn, test } from "./fixtures.ts";
import { layoutProblems, WIDTHS } from "./layout.ts";

/** Converted routes; each redesign task adds its own. */
const ROUTES: string[] = [];

test("converted screens, light and dark: no overflow, no clipped text, 44 px hit areas, axe clean", async ({ page }) => {
  await signIn(page);
  for (const theme of ["light", "dark"] as const) {
    // The boot script reads this on every load, so each goto below paints in this theme.
    await page.evaluate((t) => localStorage.setItem("perch.theme", t), theme);
    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const where = `${route} @${width} ${theme}`;
        expect(await layoutProblems(page), where).toEqual([]);
        const axe = await new AxeBuilder({ page }).analyze();
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`), where).toEqual([]);
      }
    }
  }
});
```

Create `apps/web/e2e/nav.e2e.ts`:

```ts
import { draftSpot, tokenOf } from "./api.ts";
import { expect, signIn, test } from "./fixtures.ts";

const scrollY = (page: import("@playwright/test").Page) => page.evaluate(() => window.scrollY);

test("back from an editor returns the overview to where it was; editors open at the top", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await signIn(page);
  const spot = await draftSpot(await tokenOf(page), "Scroll check");
  await page.goto(`/survey/spots/${spot.id}`);
  await expect(page.getByRole("heading", { name: "Scroll check", level: 1 })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => scrollY(page)).toBe(300);
  // Let the router record the position (it saves on scroll, throttled).
  await page.waitForTimeout(250);
  await page.locator(`a[href="/survey/spots/${spot.id}/late_night"]`).click();
  await expect(page).toHaveURL(new RegExp(`/survey/spots/${spot.id}/late_night$`));
  await expect.poll(() => scrollY(page)).toBe(0);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(new RegExp(`/survey/spots/${spot.id}$`));
  await expect.poll(async () => Math.abs((await scrollY(page)) - 300)).toBeLessThanOrEqual(2);
});
```

Run: `cd apps/web && bunx playwright test e2e/nav.e2e.ts e2e/layout.e2e.ts`
Expected: PASS.

- [ ] **Step 5: Procedure V, full tests, commit**

Procedure V on `/survey` and a spot route. Expected: PASS. Legacy screens are unchanged except for the sheet and toast motion.

Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test && bun run --filter '@perch/web' e2e`
Expected: PASS (15 e2e tests plus the 2 new: 17).

```bash
git add apps/web/src apps/web/test/shell.test.tsx apps/web/e2e/layout.ts apps/web/e2e/layout.e2e.ts
git commit -m "feat(web): seawolf shell primitives and sheet motion"
```

---

### Task 3: Home (first visible screen)

**Files:**
- Modify: `packages/ui-logic/src/survey/view.ts`, `packages/ui-logic/src/survey/index.ts`
- Create: `packages/ui-logic/src/survey/home.ts`, `packages/ui-logic/test/home.test.ts`
- Modify: `packages/ui-logic/test/view.test.ts`
- Create: `apps/web/src/ui/Search.tsx`, `apps/web/src/ui/FilterChips.tsx`, `apps/web/src/lib/facts.ts`, `apps/web/src/lib/homeState.ts`
- Modify: `apps/web/e2e/nav.e2e.ts` (Back to Home keeps the filter and scroll)
- Modify: `apps/web/src/screens/Home.tsx`, `apps/web/src/routes/survey.index.tsx`, `apps/web/src/ui/StepBar.tsx`, `apps/web/src/ui/styles.css`, `apps/web/test/home.test.tsx`, `apps/web/e2e/shell.e2e.ts`, `apps/web/e2e/spots.e2e.ts`, `apps/web/e2e/finish.e2e.ts`, `apps/web/e2e/layout.e2e.ts`, `docs/design/surveyor-copy.md`, `packages/ui-logic/src/copy/copy.gen.ts`, `packages/ui-logic/test/copy.test.ts`

**Interfaces:**
- Consumes: `Screen`, `Row`, `Pill`, `StepBar`, `ActionBar`, `IconButton`, `SyncStatus`, `ThemeSwitch`, `Sheet`, `layoutProblems`.
- Produces (ui-logic):
  - `type StepState = "done" | "current" | "todo"`
  - `type StepProgress = { steps: StepState[]; done: number; total: number; next: SurveySection | null }`
  - `REQUIRED_SECTIONS: readonly SurveySection[]` (exported)
  - `isRequiredSection(s: OverviewSection): s is SurveySection`
  - `stepProgress(view: SpotView, current?: OverviewSection | null): StepProgress`
  - `nextAfter(view: SpotView, current: OverviewSection): SurveySection | null`
  - `DraftRow` becomes `Row & { localOnly: boolean; progress: StepProgress | null; updatedAt: string | null; editedByMe: boolean; lastSeq: number | null }` (`requiredDone` is removed)
  - `DUE_AFTER_DAYS = 90`, `isDue(oldestVerifiedAt: string | null, now: Date): boolean`
  - `keepGoing(drafts: readonly DraftRow[]): DraftRow | null`
  - `type HomeFilter = "all" | "attention" | "drafts" | "due"`, `HOME_FILTERS`
  - `type HomeFact`, `type HomeRow = { spotId: string; name: string; fact: HomeFact }`
  - `homeList(home: SurveyHome, opts: { filter: HomeFilter; query: string; now: Date }): { rows: HomeRow[]; counts: Record<HomeFilter, number> }`
- Produces (web): `readHomeState(raw: unknown): { filter: HomeFilter; query: string }` and `useHomeState(): [{ filter: HomeFilter; query: string }, (next: { filter: HomeFilter; query: string }) => void]` in `apps/web/src/lib/homeState.ts` (sessionStorage key `perch.home`); `Search(props: { label: string; value: string; onChange: (v: string) => void })`, `FilterChips<V extends string>(props: { label: string; options: { value: V; label: string; count: number }[]; value: V; onChange: (v: V) => void })`, `homeFactEnd(fact: HomeFact, tz: string): ReactNode`.

- [ ] **Step 1: Write the failing ui-logic tests**

In `packages/ui-logic/test/view.test.ts`, import `stepProgress`, `nextAfter` and `REQUIRED_SECTIONS` and add:

```ts
test("the step bar has one step per section needed to publish, hours excluded", () => {
  expect(REQUIRED_SECTIONS).toEqual(["identity", "access", "seating", "power", "environment", "use_fit"]);
  const v = view(); // seat_count missing on the server, a queued seating write fills it
  const p = stepProgress(v);
  expect(p.total).toBe(6);
  expect(p.steps).toHaveLength(6);
});

test("progress marks the first unfinished section current, or the one being edited", () => {
  const v = view([], { seat_count: null, missing: ["seat_count", "noise_policy"], noise_policy: null });
  expect(stepProgress(v)).toEqual({
    steps: ["done", "done", "current", "done", "todo", "done"],
    done: 4,
    total: 6,
    next: "seating",
  });
  expect(stepProgress(v, "use_fit").steps).toEqual(["done", "done", "todo", "done", "todo", "current"]);
  expect(stepProgress(v, "photos").steps[2]).toBe("current");
});

test("next after: the next unfinished required section, wrapping, never itself", () => {
  const v = view([], { seat_count: null, missing: ["seat_count", "noise_policy"], noise_policy: null });
  expect(nextAfter(v, "seating")).toBe("environment");
  expect(nextAfter(v, "environment")).toBe("seating");
  expect(nextAfter(v, "use_fit")).toBe("seating");
  expect(nextAfter(v, "hours")).toBeNull();
  const done = view([], { seat_count: 112, missing: [] });
  expect(nextAfter(done, "identity")).toBeNull();
});
```

Adjust the fixture overrides if `surveySpotFixture` defaults differ: the assertions about which sections are done are the contract. Update the existing "home: attention by urgency..." test's `drafts` expectation to the new `DraftRow` shape:

```ts
  expect(home.drafts).toEqual([
    expect.objectContaining({ spotId: ids(5), name: "Draft", localOnly: false, editedByMe: false, lastSeq: null, progress: expect.objectContaining({ done: 5, total: 6 }) }),
    expect.objectContaining({ spotId: LOCAL, name: "SAC Lounge", localOnly: true, editedByMe: true, updatedAt: null, progress: expect.objectContaining({ total: 6 }) }),
  ]);
```

(The old count was 6 of 7 fields; the server draft misses `seat_count`, so 5 of 6 sections are done. Check the local draft's progress against the `identity()` builder and fill in its `done`.)

Create `packages/ui-logic/test/home.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  type DraftRow,
  homeList,
  isDue,
  keepGoing,
  type SurveyHome,
} from "../src/index.ts";

const NOW = new Date("2026-10-07T16:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const draft = (over: Partial<DraftRow> & { spotId: string; name: string }): DraftRow => ({
  localOnly: false,
  progress: null,
  updatedAt: null,
  editedByMe: false,
  lastSeq: null,
  ...over,
});

test("due: never checked, unreadable, or checked more than 90 days ago", () => {
  expect(isDue(null, NOW)).toBe(true);
  expect(isDue("not a date", NOW)).toBe(true);
  expect(isDue(days(91), NOW)).toBe(true);
  expect(isDue(days(90), NOW)).toBe(false);
  expect(isDue(days(3), NOW)).toBe(false);
});

const HOME: SurveyHome = {
  attention: [{ spotId: "a", name: "Melville Library, 2nd floor", reason: "conflict" }],
  drafts: [
    draft({ spotId: "d", name: "Union Lobby Tables", progress: { steps: [], done: 4, total: 6, next: "seating" } }),
    draft({ spotId: "a", name: "Melville Library, 2nd floor" }),
  ],
  stale: [
    { spotId: "n", name: "North Reading Room", oldestVerifiedAt: null },
    { spotId: "o", name: "Old Lounge", oldestVerifiedAt: days(120) },
    { spotId: "f", name: "Fresh Café", oldestVerifiedAt: days(2) },
  ],
  unreadable: 0,
};

test("all lists each spot once, the most urgent fact first", () => {
  const { rows, counts } = homeList(HOME, { filter: "all", query: "", now: NOW });
  expect(rows.map((r) => [r.spotId, r.fact.kind])).toEqual([
    ["a", "conflict"],
    ["d", "progress"],
    ["n", "never_checked"],
    ["o", "checked"],
    ["f", "checked"],
  ]);
  expect(counts).toEqual({ all: 5, attention: 1, drafts: 2, due: 2 });
});

test("due holds only stale published spots; a fresh one is only under all", () => {
  const { rows } = homeList(HOME, { filter: "due", query: "", now: NOW });
  expect(rows.map((r) => r.spotId)).toEqual(["n", "o"]);
});

test("search ignores case and accents, and the counts follow it", () => {
  const { rows, counts } = homeList(HOME, { filter: "all", query: "cafe", now: NOW });
  expect(rows.map((r) => r.name)).toEqual(["Fresh Café"]);
  expect(counts).toEqual({ all: 1, attention: 0, drafts: 0, due: 0 });
});

test("a draft without cached details has no progress fact", () => {
  const { rows } = homeList(
    { ...HOME, attention: [], drafts: [draft({ spotId: "x", name: "X" })], stale: [] },
    { filter: "drafts", query: "", now: NOW },
  );
  expect(rows[0]?.fact).toEqual({ kind: "draft" });
});

test("keep going: the draft with the newest write on this phone, else my latest server edit", () => {
  const a = draft({ spotId: "a", name: "A", lastSeq: 3 });
  const b = draft({ spotId: "b", name: "B", lastSeq: 9 });
  const c = draft({ spotId: "c", name: "C", editedByMe: true, updatedAt: days(1) });
  const d = draft({ spotId: "d", name: "D", editedByMe: true, updatedAt: days(5) });
  const e = draft({ spotId: "e", name: "E", editedByMe: false, updatedAt: days(0) });
  expect(keepGoing([a, b, c])?.spotId).toBe("b");
  expect(keepGoing([d, c, e])?.spotId).toBe("c");
  expect(keepGoing([e])).toBeNull();
  expect(keepGoing([])).toBeNull();
});
```

Run: `bun test packages/ui-logic/test/home.test.ts packages/ui-logic/test/view.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 2: Implement progress, the draft fields and the Home list**

In `packages/ui-logic/src/survey/view.ts`:

```ts
/** Sections that fill a field needed to publish, in overview order. Hours are not among them (decision 15). */
export const REQUIRED_SECTIONS: readonly SurveySection[] = SURVEY_SECTION.filter((s) =>
  REQUIRED_PARTS.some((f) => V0_FIELD_SECTION[f] === s),
);

export function isRequiredSection(s: OverviewSection): s is SurveySection {
  return (REQUIRED_SECTIONS as readonly string[]).includes(s);
}

export type StepState = "done" | "current" | "todo";
export type StepProgress = {
  steps: StepState[];
  done: number;
  total: number;
  /** The first required section that is not done; null when all are. */
  next: SurveySection | null;
};

/** The step bar: one step per required section. `current` is red when it is required, else the next one is. */
export function stepProgress(view: SpotView, current: OverviewSection | null = null): StepProgress {
  const fills = REQUIRED_SECTIONS.map((section) => ({ section, done: fillOf(view, section) === "done" }));
  const next = fills.find((f) => !f.done)?.section ?? null;
  const here = current !== null && isRequiredSection(current) ? current : next;
  return {
    steps: fills.map((f) => (f.section === here ? "current" : f.done ? "done" : "todo")),
    done: fills.filter((f) => f.done).length,
    total: fills.length,
    next,
  };
}

/** Where Save and next goes: the next required section after `current` that is not done, wrapping. */
export function nextAfter(view: SpotView, current: OverviewSection): SurveySection | null {
  if (!isRequiredSection(current)) return null;
  const i = REQUIRED_SECTIONS.indexOf(current);
  const order = [...REQUIRED_SECTIONS.slice(i + 1), ...REQUIRED_SECTIONS.slice(0, i)];
  return order.find((s) => fillOf(view, s) !== "done") ?? null;
}
```

Replace the private `REQUIRED_SECTIONS` declaration with the exported one (keep it above `OVERVIEW_ORDER`). Place `stepProgress` and `nextAfter` after `fillOf`.

Change `DraftRow` and `surveyHome`:

```ts
export type DraftRow = Row & {
  localOnly: boolean;
  /** Null when this phone has never loaded the draft's details. */
  progress: StepProgress | null;
  updatedAt: string | null;
  editedByMe: boolean;
  /** Highest outbox seq for the spot on this phone; null when nothing is queued. */
  lastSeq: number | null;
};
```

In `surveyHome`, add `const lastSeq = (spotId: string) => { const s = records.filter((r) => r.spot_id === spotId).map((r) => r.seq); return s.length === 0 ? null : Math.max(...s); };` and `const progressOf = (v: SpotView | null) => (v === null ? null : stepProgress(v));`. Server drafts push `{ spotId: s.id, name, localOnly: false, progress: progressOf(buildSpotView(detail, records, s.id, term)), updatedAt: s.updated_at, editedByMe: s.last_edited_by === me.id, lastSeq: lastSeq(s.id) }`. Local drafts push `{ ..., localOnly: true, progress: progressOf(buildSpotView(null, records, r.spot_id, term)), updatedAt: null, editedByMe: true, lastSeq: lastSeq(r.spot_id) }`. Remove `requiredDone`.

Create `packages/ui-logic/src/survey/home.ts`:

```ts
import type { AttentionRow, DraftRow, StaleRow, SurveyHome } from "./view.ts";

export const DUE_AFTER_DAYS = 90;

/** Never checked, unreadable, or last checked more than 90 days before `now`. */
export function isDue(oldestVerifiedAt: string | null, now: Date): boolean {
  if (oldestVerifiedAt === null) return true;
  const at = Date.parse(oldestVerifiedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at > DUE_AFTER_DAYS * 86_400_000;
}

/** The Keep going card: the draft with the newest write on this phone, else my most recent server edit. */
export function keepGoing(drafts: readonly DraftRow[]): DraftRow | null {
  let best: DraftRow | null = null;
  for (const d of drafts) {
    if (d.lastSeq !== null && (best?.lastSeq ?? -1) < d.lastSeq) best = d;
  }
  if (best !== null) return best;
  for (const d of drafts) {
    if (!d.editedByMe || d.updatedAt === null) continue;
    if (best === null || (best.updatedAt ?? "") < d.updatedAt) best = d;
  }
  return best;
}

export const HOME_FILTER = ["all", "attention", "drafts", "due"] as const;
export type HomeFilter = (typeof HOME_FILTER)[number];
export const HOME_FILTERS: readonly HomeFilter[] = HOME_FILTER;

export type HomeFact =
  | { kind: "conflict" }
  | { kind: "failed"; count: number }
  | { kind: "unreviewed"; editor: string }
  | { kind: "hours_unconfirmed"; term: string }
  | { kind: "progress"; done: number; total: number }
  | { kind: "draft" }
  | { kind: "checked"; at: string }
  | { kind: "never_checked" };

export type HomeRow = { spotId: string; name: string; fact: HomeFact };

function attentionFact(r: AttentionRow): HomeFact {
  switch (r.reason) {
    case "conflict":
      return { kind: "conflict" };
    case "failed":
      return { kind: "failed", count: r.count };
    case "unreviewed":
      return { kind: "unreviewed", editor: r.editor };
    case "hours_unconfirmed":
      return { kind: "hours_unconfirmed", term: r.term };
  }
}

const draftFact = (d: DraftRow): HomeFact =>
  d.progress === null ? { kind: "draft" } : { kind: "progress", done: d.progress.done, total: d.progress.total };

const staleFact = (s: StaleRow): HomeFact =>
  s.oldestVerifiedAt === null ? { kind: "never_checked" } : { kind: "checked", at: s.oldestVerifiedAt };

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Home's one list. "all" has one row per spot with its most urgent fact;
 * "due" is published spots never checked or checked over 90 days ago.
 * Counts are distinct spots and follow the search.
 */
export function homeList(
  home: SurveyHome,
  opts: { filter: HomeFilter; query: string; now: Date },
): { rows: HomeRow[]; counts: Record<HomeFilter, number> } {
  const q = normalize(opts.query.trim());
  const match = (r: { name: string }) => q === "" || normalize(r.name).includes(q);
  const row = (r: { spotId: string; name: string }, fact: HomeFact): HomeRow => ({
    spotId: r.spotId,
    name: r.name,
    fact,
  });
  const attention = home.attention.filter(match).map((r) => row(r, attentionFact(r)));
  const drafts = home.drafts.filter(match).map((d) => row(d, draftFact(d)));
  const published = home.stale.filter(match);
  const due = published.filter((s) => isDue(s.oldestVerifiedAt, opts.now)).map((s) => row(s, staleFact(s)));
  const seen = new Set<string>();
  const all: HomeRow[] = [];
  for (const r of [...attention, ...drafts, ...published.map((s) => row(s, staleFact(s)))]) {
    if (seen.has(r.spotId)) continue;
    seen.add(r.spotId);
    all.push(r);
  }
  const lists: Record<HomeFilter, HomeRow[]> = { all, attention, drafts, due };
  const distinct = (rows: HomeRow[]) => new Set(rows.map((r) => r.spotId)).size;
  return {
    rows: lists[opts.filter],
    counts: { all: all.length, attention: distinct(attention), drafts: distinct(drafts), due: distinct(due) },
  };
}
```

Export it from `packages/ui-logic/src/survey/index.ts` (`export * from "./home.ts";`).

Run: `bun test packages/ui-logic --timeout 60000`
Expected: PASS.

- [ ] **Step 3: Copy**

Add to the `## Redesign (2026-10-07)` table in the deck:

```md
| common.actions | Actions | 10 | opens the Actions sheet |
| home.filter.label | Show | 8 | accessible name of the filter chips |
| home.filter.all | All | 6 | |
| home.filter.attention | Needs you | 12 | |
| home.filter.drafts | Drafts | 8 | |
| home.filter.due | Due | 6 | never checked or over 90 days |
| home.search.label | Search spots | 16 | |
| home.empty.attention | Nothing needs you. | 24 | |
| home.empty.due | Nothing is due. | 20 | |
| home.empty.search | No spots match. | 20 | |
| home.keep_going | Keep going | 14 | card caption |
| home.keep_going.next | Next: {section} · {count} left | 40 | |
| home.keep_going.ready | Ready to publish | 20 | |
| home.fact.conflict | Conflict | 10 | red pill |
| home.fact.failed | Didn't save | 12 | red pill |
| home.fact.unreviewed | Edited by {name} | 30 | |
| home.fact.hours | No {term} hours | 24 | |
| home.fact.progress | {done}/{total} | 6 | |
| home.fact.draft | Draft | 8 | progress unknown |
| progress.label | {done} of {total} done | 20 | step bar accessible name |
```

Add `done: "4"` and `total: "6"` to `SAMPLE` in `packages/ui-logic/test/copy.test.ts`. Run `bun run copy:gen` and `bun test packages/ui-logic/test/copy.test.ts`. Expected: PASS.

- [ ] **Step 4: Write the failing Home component tests**

Rewrite `apps/web/test/home.test.tsx` around the new structure. Keep every behavior test that exists today (pending banner on open, offline first run, unreadable line, links to spots) and adapt only the selectors. Add:

```tsx
test("filter chips switch the list and show counts", async () => {
  // harness: one conflict spot, one draft, one stale published, one fresh published
  // ...render <Home> through the existing harness helper...
  expect(screen.getByRole("button", { name: /^All 4$/ }).getAttribute("aria-pressed")).toBe("true");
  await user.click(screen.getByRole("button", { name: /^Due 1$/ }));
  expect(screen.getByRole("region", { name: "Due" })).toBeTruthy();
});

test("search narrows the rows", async () => {
  await user.type(screen.getByRole("searchbox", { name: "Search spots" }), "melv");
  expect(screen.getAllByRole("link").filter((a) => a.closest(".row-list"))).toHaveLength(1);
});

test("keep going names the draft and what is next", () => {
  expect(screen.getByRole("link", { name: /Keep going.*Union Lobby Tables/ })).toBeTruthy();
  expect(screen.getByText(/Next: Seating · \d left/)).toBeTruthy();
});
```

Fill in the harness setup from the existing `home.test.tsx` and `harness.tsx` (they already build lists and outbox records). The three assertions above are the contract.

Run: `cd apps/web && bunx vitest run test/home.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Rebuild Home**

`apps/web/src/screens/Home.tsx`, structured as spec section 5 Home:

- `Screen` with title `t("home.title")`, no back, and trailing `{admin ? <IconButton label={t("home.admin")} icon={Shield} link={{ to: "/survey/admin" }} /> : null}`. The current `admin` prop becomes `isAdmin: boolean`; update `routes/survey.index.tsx` to match.
- The Keep going card: a `Link` to the spot, `className="keep"`, with this content:
  - the caption `t("home.keep_going")`;
  - the name in Newsreader 21 (`.keep__name.truncate`);
  - when `progress !== null`: `<StepBar steps={progress.steps} label={t("progress.label", { done, total })} />`, then `next === null ? t("home.keep_going.ready") : t("home.keep_going.next", { section: sectionName(next), count: total - done })`;
  - an `ArrowRight` icon.

  The accessible name of the link must include "Keep going" and the name. CSS from the mock's `.next`: hairline border, radius 20, 16 px padding, hover fill, press 0.99.
- `Search` (`apps/web/src/ui/Search.tsx`): `<label className="search"><Icon icon={SearchIcon} size={18} /><span className="visually-hidden">{label}</span><input type="search" value onChange autoComplete="off" enterKeyHint="search" /></label>`. The label is the accessible name, and it is also the placeholder. 16 px input text (no iOS zoom), 44 px tall.
- `FilterChips` (`apps/web/src/ui/FilterChips.tsx`): `<div role="group" aria-label={label} className="chips">` holding buttons with `aria-pressed`, the label, and `<span className="count">{count}</span>`. Each button's accessible name is "Needs you 1". The chips are 32 px drawn; extend each to 44 px with `::before { inset: -6px 0 }`. The row scrolls horizontally (`overflow-x: auto`, scrollbar hidden), with a 20 px negative inline margin and padding so the chips bleed to the screen edge.
- State: `filter` and `query` come from `useHomeState()`, kept in `sessionStorage["perch.home"]`. Home's scroll is restored by path (Task 2), so the list must come back the same: with plain `useState`, Back would restore the Due list's scroll offset over the All list. `apps/web/src/lib/homeState.ts`:

```ts
import { HOME_FILTER } from "@perch/ui-logic";
import { useState } from "react";
import { z } from "zod";

const KEY = "perch.home";
const HomeState = z.object({ filter: z.enum(HOME_FILTER), query: z.string().max(100) });
export type HomeState = z.infer<typeof HomeState>;
const FRESH: HomeState = { filter: "all", query: "" };

/** sessionStorage is a trust boundary: anything unreadable starts fresh. */
export function readHomeState(raw: unknown): HomeState {
  if (typeof raw !== "string") return FRESH;
  try {
    const parsed = HomeState.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : FRESH;
  } catch {
    return FRESH;
  }
}

/** Home's filter and search, kept for this tab so Back lands on the same list. */
export function useHomeState(): [HomeState, (next: HomeState) => void] {
  const [state, setState] = useState<HomeState>(() => {
    try {
      return readHomeState(sessionStorage.getItem(KEY));
    } catch {
      return FRESH;
    }
  });
  const set = (next: HomeState) => {
    setState(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the state still holds for this visit.
    }
  };
  return [state, set];
}
```

Add to `apps/web/test/home.test.tsx`:

```tsx
test("home state reads only a known filter and a short query", () => {
  expect(readHomeState(JSON.stringify({ filter: "due", query: "melv" }))).toEqual({ filter: "due", query: "melv" });
  for (const raw of [null, "", "{", JSON.stringify({ filter: "nope", query: "" }), JSON.stringify({ filter: "all", query: 3 })]) {
    expect(readHomeState(raw)).toEqual({ filter: "all", query: "" });
  }
});
```
- The list: `<section aria-label={chip label}>` holding a `ul.row-list` of `Row` with `link={link(row.spotId)}`, `compact`, and `end={homeFactEnd(row.fact, tz)}`.
- `apps/web/src/lib/facts.ts` `homeFactEnd` returns:
  - conflict: `<Pill tone="red" icon={TriangleAlert}>{t("home.fact.conflict")}</Pill>`;
  - failed: `<Pill tone="red" icon={CircleAlert}>{t("home.fact.failed")}</Pill>`;
  - unreviewed: muted text `t("home.fact.unreviewed", { name })`;
  - hours_unconfirmed: muted text `t("home.fact.hours", { term })`;
  - progress: tabular muted `t("home.fact.progress", { done, total })`;
  - draft: `<Pill>{t("home.fact.draft")}</Pill>`;
  - checked: `shortDate(at, tz)`;
  - never_checked: muted `t("home.stale.never")`.
- Banners above the list: unreadable writes (`plural(... "home.unreadable_one", "home.unreadable")`), and pending at open (the existing `usePendingAfterOpen`, unchanged). Show the offline first-run lede and the first-run empty state as today, under the title.
- Empty lists: `home.empty.search` when the query is non-empty, else per filter: `home.empty.attention`, `home.drafts.empty`, `home.empty.due`, and for "all" the first-run copy.
- The action bar: `<SyncStatus variant="bar" />`, then the existing New spot link styled as `btn btn--primary` with a `Plus` icon (keep its accessible name "New spot"; e2e clicks `getByRole("link", { name: "New spot" })`), then an IconButton `common.actions` (`Ellipsis`) that opens a `Sheet` titled `t("common.actions")`. The sheet holds:
  - a row "Changes on this phone" (`t("sync.sheet.title")`, a `History` icon) that opens the sync sheet;
  - an Admin row for admins (`Shield`);
  - `<ThemeSwitch />`.

Run: `cd apps/web && bunx vitest run test/home.test.tsx`
Expected: PASS.

- [ ] **Step 6: Update the e2e selectors and add Home to the layout check**

In `e2e/shell.e2e.ts`, `e2e/spots.e2e.ts` and `e2e/finish.e2e.ts`, replace the regions "Needs attention" and "Oldest checks":
- "Needs attention" becomes: click the chip `getByRole("button", { name: /^Needs you/ })`, then `getByRole("region", { name: "Needs you" })`.
- "Oldest checks" (published spots with dates) becomes the default region `getByRole("region", { name: "All" })`. Rows are list items whose end shows the short date (`/[A-Z][a-z]{2} \d{1,2}/`), and `Last checked` no longer appears.
- Replace the old test "at 360 px nothing scrolls sideways and the postmark stays on screen" with the same check on the sync status button (`getByRole("button", { name: "Offline" })` inside the action bar).

Add `"/survey"` to `ROUTES` in `e2e/layout.e2e.ts`. In the layout test, draft one spot with a long name first through `e2e/api.ts` (`draftSpot(token, "The Very Long Named Graduate Reading Room on the Second Floor East")`) so truncation is exercised.

Extend `e2e/nav.e2e.ts` with the Back-to-Home case:

```ts
test("back from a spot returns Home to the same filter and scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await signIn(page);
  const token = await tokenOf(page);
  for (let i = 0; i < 12; i++) await draftSpot(token, `Scroll draft ${String(i).padStart(2, "0")}`);
  await page.reload();
  await page.getByRole("button", { name: /^Drafts/ }).click();
  const list = page.getByRole("region", { name: "Drafts" });
  await expect(list.getByRole("link").nth(11)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY(page)).toBe(400);
  await page.waitForTimeout(250);
  await list.getByRole("link", { name: /Scroll draft 10/ }).click();
  await expect(page.getByRole("heading", { name: "Scroll draft 10", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: /^Drafts/ })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Math.abs((await scrollY(page)) - 400)).toBeLessThanOrEqual(2);
});
```

Run: `bun run --filter '@perch/web' e2e`
Expected: all pass.

- [ ] **Step 7: Procedure V and commit**

Procedure V on `/survey` (light screenshots; dark is covered by the layout e2e). Check against `dir-d.png`, left phone: the Keep going card without an icon, the search, the chips with counts, compact rows with facts on the right, and the action bar. At 1440 px it should be one centered 680 px column with a floating action bar.

Run: `bun run typecheck && bun run lint && bun test packages/ui-logic --timeout 60000 && bun run --filter '@perch/web' test`
Expected: PASS.

One commit: removing `DraftRow.requiredDone` in ui-logic breaks the old `Home.tsx`, so the two halves only compile together.

```bash
git add packages/ui-logic/src/survey packages/ui-logic/test/home.test.ts packages/ui-logic/test/view.test.ts apps/web/src apps/web/test/home.test.tsx apps/web/e2e docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts packages/ui-logic/test/copy.test.ts
git commit -m "feat(web): seawolf home with keep going, search and filters"
```

---

### Task 4: Cover thumbnails (contract, server, Home)

**Files:**
- Modify: `packages/core/src/survey/spot.ts`, `apps/server/src/spots/load.ts`, `apps/server/test/spots.test.ts`
- Modify: `apps/web/src/app/serverCache.ts`, `apps/web/test/serverCache.test.ts`, `apps/web/test/harness.tsx`
- Modify: `packages/ui-logic/src/survey/view.ts`, `packages/ui-logic/src/survey/home.ts`, `packages/ui-logic/test/home.test.ts`, `packages/ui-logic/test/view.test.ts`
- Create: `apps/web/src/hooks/useNearViewport.ts`, `apps/web/src/ui/CoverThumb.tsx`
- Modify: `apps/web/src/screens/Home.tsx`, `apps/web/test/home.test.tsx`

**Interfaces:**
- Produces: `SpotSummary.cover_photo_id: string | null` (input optional, default null); `Row.coverPhotoId: string | null` in ui-logic (attention, stale and draft rows); `HomeRow.coverPhotoId: string | null`; `useNearViewport<T extends Element>(): { ref: RefCallback<T>; near: boolean }`; `CoverThumb(props: { photoId: string; size: "row" | "card" })`.

- [ ] **Step 1: Write the failing server test**

In `apps/server/test/spots.test.ts`, add a test using the file's existing helpers for creating a spot, uploading a photo, approving it, setting the cover, and listing:

```ts
test("the survey list carries an approved cover's id, and nothing else", async () => {
  // spot A: approved photo set as cover -> cover_photo_id is that photo
  // spot B: unapproved photo set as cover -> null
  // spot C: approved photo, not the cover -> null
  // spot D in another campus's building (if the fixture has one; else skip this case) -> not listed
  const list = SpotList.parse(body(await get("/survey/spots")));
  const byId = new Map(list.spots.map((s) => [s.id, s.cover_photo_id]));
  expect(byId.get(a.id)).toBe(coverA.id);
  expect(byId.get(b.id)).toBeNull();
  expect(byId.get(c.id)).toBeNull();
});
```

Write the setup with the same calls the file already uses for photos (`photo.upload`, `approvePhoto`, `setCover`, or their routes). Run: `bun test apps/server/test/spots.test.ts --timeout 60000`. Expected: FAIL (`cover_photo_id` undefined, and `SpotList.parse` does not know it).

- [ ] **Step 2: Contract and server**

In `packages/core/src/survey/spot.ts`, add to `SpotSummary`:

```ts
  /** The approved cover photo, for list thumbnails; null when none. Defaulted so lists stored by older app versions still parse. */
  cover_photo_id: z.uuid().nullable().default(null),
```

In `apps/server/src/spots/load.ts` `listSurveySpots`, add a campus-scoped query next to the hours query:

```ts
  const covers = await db
    .select({ spot_id: spot_photo.spot_id, id: spot_photo.id })
    .from(spot_photo)
    .innerJoin(spot, eq(spot.id, spot_photo.spot_id))
    .innerJoin(building, eq(building.id, spot.building_id))
    .where(
      and(
        eq(building.campus_id, campusId),
        eq(spot_photo.is_cover, true),
        isNotNull(spot_photo.approved_at),
        isNotNull(spot_photo.blob_sha256),
      ),
    );
  const coverOf = new Map(covers.map((c) => [c.spot_id, c.id]));
```

and `cover_photo_id: coverOf.get(s.id) ?? null` in each row (import `and` and `isNotNull` from `drizzle-orm`, and `spot_photo` from the schema if they are not imported yet). `spot_photo_one_cover` guarantees at most one cover per spot.

The core change makes `cover_photo_id` part of the `SpotSummary` output type, so every place that builds one must set it in this same commit:
- `summaryOf` in `apps/web/src/app/serverCache.ts`: `cover_photo_id: spot.photos.find((p) => p.is_cover && p.approved)?.id ?? null`;
- `summary()` in `apps/web/test/harness.tsx`: the same expression;
- the local `summary()` helper in `packages/ui-logic/test/view.test.ts`: `cover_photo_id: null` in its defaults.

Run: `bun run typecheck && bun run lint && bun test apps/server/test/spots.test.ts packages/core packages/ui-logic --timeout 60000 && bun run --filter '@perch/web' test`
Expected: PASS. Commit with only these files modified:

```bash
git add packages/core/src/survey/spot.ts apps/server/src/spots/load.ts apps/server/test/spots.test.ts apps/web/src/app/serverCache.ts apps/web/test/harness.tsx packages/ui-logic/test/view.test.ts
git commit -m "feat(server): list each survey spot's approved cover"
```

- [ ] **Step 3: Write the failing client cache tests**

In `apps/web/test/serverCache.test.ts`:

```ts
test("a list persisted before covers existed still restores, with no covers", () => {
  const legacy = { term: null, spots: [{ ...summary(spot), cover_photo_id: undefined }] };
  delete (legacy.spots[0] as Record<string, unknown>).cover_photo_id;
  const restored = sanitizePersisted(envelope([[["survey", "spots"], legacy]]));
  const data = restored.clientState.queries[0]?.state.data as SpotList;
  expect(data.spots[0]?.cover_photo_id).toBeNull();
});

test("the list row of a server spot carries its approved cover only", () => {
  const withCover = { ...spot, photos: [photoOf({ is_cover: true, approved: true })] };
  expect(summaryOf(withCover, undefined, "Melville Library").cover_photo_id).toBe(withCover.photos[0]?.id);
  const unapproved = { ...spot, photos: [photoOf({ is_cover: true, approved: false })] };
  expect(summaryOf(unapproved, undefined, "Melville Library").cover_photo_id).toBeNull();
});
```

Write `envelope` and `photoOf` as small local helpers if the file has none (`envelope` builds `{ timestamp, buster, clientState: { mutations: [], queries: [{ queryKey, state: { data } }] } }`; `photoOf` returns a valid `SurveyPhoto`). Update `harness.tsx` `summary()` to return `cover_photo_id: spot.photos.find((p) => p.is_cover && p.approved)?.id ?? null`.

Run: `cd apps/web && bunx vitest run test/serverCache.test.ts`
Expected: FAIL.

- [ ] **Step 4: Client cache**

`summaryOf` already sets the cover (Step 2), so its test passes; the legacy-list test fails until `sanitizePersisted` keeps parsed data:

```ts
  const kept = parsed.data.clientState.queries.flatMap((q) => {
    const entry = KEY_SCHEMAS.find((e) => e.match(q.queryKey));
    const data = entry?.schema.safeParse(q.state.data);
    // Keep the parsed value, so defaults added since it was stored are filled in.
    return data?.success === true ? [{ ...q, state: { ...q.state, data: data.data } }] : [];
  });
```

Run: `cd apps/web && bunx vitest run test/serverCache.test.ts && cd ../.. && bun run typecheck && bun run lint`
Expected: PASS.

```bash
git add apps/web/src/app/serverCache.ts apps/web/test/serverCache.test.ts
git commit -m "fix(web): fill new defaults when restoring the cached list"
```

- [ ] **Step 5: Covers through the Home model**

In ui-logic, `type Row = { spotId: string; name: string; coverPhotoId: string | null }`. In `surveyHome`, server rows use `s.cover_photo_id` and local drafts use `null`. `HomeRow` gains `coverPhotoId`, copied by `row()` in `homeList`. Update the test builders in `home.test.ts` and `view.test.ts` (`coverPhotoId: null` where rows are built, plus one row with an id asserted through `homeList`). Run: `bun test packages/ui-logic --timeout 60000`. Expected: PASS.

- [ ] **Step 6: CoverThumb, lazy and offline safe**

`apps/web/src/hooks/useNearViewport.ts`: an IntersectionObserver with `rootMargin: "200px"`. `near` latches true once it is seen. Without `IntersectionObserver`, `near` is true.

`apps/web/src/ui/CoverThumb.tsx`:

```tsx
import { usePhotoUrl } from "../hooks/usePhotoUrl.ts";
import { useNearViewport } from "../hooks/useNearViewport.ts";

function Loaded(props: { photoId: string; size: "row" | "card" }) {
  const { url } = usePhotoUrl({ photoId: props.photoId });
  // Nothing while loading, offline, or missing: the row reads as text only.
  if (url === null) return null;
  return <img className={`thumb thumb--${props.size}`} src={url} alt="" />;
}

/** A spot's approved cover, fetched only once the row is near the screen. Decorative: the name is the label. */
export function CoverThumb(props: { photoId: string; size: "row" | "card" }) {
  const { ref, near } = useNearViewport<HTMLSpanElement>();
  return (
    <span ref={ref} className="thumb-slot">
      {near ? <Loaded photoId={props.photoId} size={props.size} /> : null}
    </span>
  );
}
```

CSS: the slot is a zero-width box the observer can see, and its negative margin cancels the row's 12 px gap until an image arrives: `.thumb-slot { display: block; flex: none; width: 0; height: 40px; margin-inline-end: -12px } .thumb-slot:has(img) { width: auto; height: auto; margin-inline-end: 0 }`. (`display: contents` would leave nothing to observe.) `.thumb { flex: none; object-fit: cover; border-radius: var(--radius-s); background: var(--color-mist) }`. `.thumb--row { width: 40px; height: 40px }`. `.thumb--card { width: 56px; height: 56px; border-radius: var(--radius-m) }`. Fade the image in with `@starting-style { .thumb { opacity: 0 } }` and an opacity transition at `--duration-base`.

Home: rows pass `lead={row.coverPhotoId === null ? undefined : <CoverThumb photoId={row.coverPhotoId} size="row" />}`. The Keep going card renders `<CoverThumb size="card" />` on the left only when the draft has `coverPhotoId`.

Add to `apps/web/test/home.test.tsx`:

```tsx
test("a spot with a cover shows its thumbnail once loaded; without one, text only", async () => {
  // harness: spot A summary with cover_photo_id = photo id whose bytes the TestServer serves; spot B without
  await waitFor(() => expect(screen.getByRole("link", { name: /Spot A/ }).querySelector("img.thumb")).not.toBeNull());
  expect(screen.getByRole("link", { name: /Spot B/ }).querySelector("img, .thumb")).toBeNull();
});

test("offline, a cover row is text only", async () => {
  server.offline = true;
  // render; wait for the list from the persisted cache
  expect(document.querySelector("img.thumb")).toBeNull();
});
```

Make the `TestServer` answer `GET /survey/photos/:id/image` with a few JPEG bytes if it does not already. jsdom has no `URL.createObjectURL`; stub it in the test with `vi.stubGlobal`.

Run: `cd apps/web && bunx vitest run test/home.test.tsx`
Expected: PASS.

- [ ] **Step 7: Procedure V, full tests, commits**

Procedure V on `/survey`. The e2e seed may have no covers; visually confirm through a quick manual cover in the e2e flow, or accept text-only rows and say so in the report.

Run: `bun run typecheck && bun run lint && bun test packages apps/server --timeout 60000 && bun run --filter '@perch/web' test`
Expected: PASS.

```bash
git add packages/ui-logic/src/survey packages/ui-logic/test apps/web/src/hooks/useNearViewport.ts apps/web/src/ui/CoverThumb.tsx apps/web/src/screens/Home.tsx apps/web/src/ui/styles.css apps/web/test/home.test.tsx
git commit -m "feat(web): cover thumbnails on home rows and keep going"
```

---

### Task 5: Controls (segmented fix, stepper, choices, tags, fields)

**Files:**
- Modify: `apps/web/src/ui/Segmented.tsx`, `apps/web/src/ui/Stepper.tsx`, `apps/web/src/ui/Choices.tsx`, `apps/web/src/ui/Check.tsx`, `apps/web/src/ui/Field.tsx`, `apps/web/src/ui/styles.css`
- Test: `apps/web/test/components.test.tsx`

**Interfaces:**
- Produces: every control accepts an optional `icon?: LucideIcon`, which is rendered in the label (16 px). `Segmented` keeps its props. `Check` gains `variant?: "tag" | "row"` (default `"row"`). A new `TagGroup(props: { label: string; icon?: LucideIcon; helper?: string; children: ReactNode })` is a fieldset for tag `Check`s.

- [ ] **Step 1: Write the failing segmented tests**

Add to `apps/web/test/components.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

function Harness(props: { initial: "a" | "b" | null; onCommit: (v: "a" | "b") => void }) {
  const [v, setV] = useState(props.initial);
  return (
    <Segmented
      label="Pick"
      options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
      value={v}
      onChange={(x) => {
        props.onCommit(x);
        setV(x);
      }}
    />
  );
}

test("segmented shows the choice on pointerdown and commits once on pointerup", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  const b = screen.getByRole("radio", { name: "B" });
  const label = b.closest("label");
  if (label === null) throw new Error("no label");
  fireEvent.pointerDown(label, { isPrimary: true, button: 0, pointerId: 1 });
  expect((b as HTMLInputElement).checked).toBe(true);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(label, { isPrimary: true, button: 0, pointerId: 1 });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith("b");
  fireEvent.click(b);
  expect(commit).toHaveBeenCalledTimes(1);
});

test("a cancelled press (a scroll) puts the choice back and commits nothing, even when empty", () => {
  for (const initial of ["a", null] as const) {
    const commit = vi.fn();
    const { unmount } = render(<Harness initial={initial} onCommit={commit} />);
    const b = screen.getByRole("radio", { name: "B" });
    const label = b.closest("label");
    if (label === null) throw new Error("no label");
    fireEvent.pointerDown(label, { isPrimary: true, button: 0, pointerId: 2 });
    expect((b as HTMLInputElement).checked).toBe(true);
    fireEvent.pointerCancel(window, { pointerId: 2 });
    expect((b as HTMLInputElement).checked).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    unmount();
  }
});

test("keyboard and assistive tech still choose through the native radio", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  expect(commit).toHaveBeenCalledWith("b");
});
```

If jsdom drops `isPrimary` or `button` from `fireEvent.pointerDown`, add a `PointerEvent` polyfill at the top of the test file: `class PE extends MouseEvent { isPrimary: boolean; pointerId: number; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.isPrimary = i.isPrimary ?? false; this.pointerId = i.pointerId ?? 0; } }` with `vi.stubGlobal("PointerEvent", PE)`.

Run: `cd apps/web && bunx vitest run test/components.test.tsx`
Expected: FAIL (the radio is not checked after pointerdown).

- [ ] **Step 2: Implement the segmented fix**

In `apps/web/src/ui/Segmented.tsx`, inside the component:

```tsx
  // Shown on pointerdown so the control feels instant (it used to wait for the
  // click at pointerup); committed on pointerup over the same option. A
  // pointercancel (a scroll that began here) or a release elsewhere drops it.
  const [pending, setPending] = useState<V | null>(null);
  useEffect(() => {
    if (pending === null) return;
    const drop = () => setPending(null);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    return () => {
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    };
  }, [pending]);
  const shown = pending ?? value;
  const index = options.findIndex((o) => o.value === shown);
```

Each option:

```tsx
          <label
            key={o.value}
            className="segmented__option"
            onPointerDown={(e) => {
              if (e.isPrimary && e.button === 0) setPending(o.value);
            }}
            onPointerUp={() => {
              if (pending === o.value && value !== o.value) onChange(o.value);
            }}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={shown === o.value}
              onChange={() => {
                setPending(null);
                if (value !== o.value) onChange(o.value);
              }}
            />
            <span>{o.label}</span>
          </label>
```

For `layout === "row"`, render `<span className="segmented__thumb" aria-hidden="true" />` first in `.segmented__options` and set `style={{ "--n": options.length, "--i": Math.max(0, index) } as CSSProperties}` on it. Add `data-empty` when `index < 0` (the thumb is hidden).

CSS, rewriting the old segmented block, from the mock's `.seg`:
- The track: `.segmented__options { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: var(--color-mist); border-radius: var(--radius-m); padding: 4px; isolation: isolate; touch-action: manipulation }`.
- `.segmented__thumb { position: absolute; z-index: -1; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n, 1)); transform: translateX(calc(var(--i, 0) * 100%)); border-radius: 9px; background: var(--color-paper); box-shadow: 0 1px 2px color-mix(in oklab, var(--color-ink) 12%, transparent); transition: transform 180ms var(--easing-standard) }`, plus `[data-empty] > .segmented__thumb { opacity: 0 }`.
- Options: `span` min-height 44 (the hit area meets 44 inside the 4 px track padding because the label is 44 tall), 600 at 14 px, muted; checked is ink; hover is ink; `:active` scales `var(--press-control)`.
- Focus: `input:focus-visible + span { outline: 2px solid var(--color-red); outline-offset: -2px; border-radius: 9px }`.
- The list layout (long options): rows of 48 px with a 20 px radio circle drawn by `::before` (ink ring; checked is an ink fill with a paper center), a hairline between rows, and no thumb.

Run: `cd apps/web && bunx vitest run test/components.test.tsx && cd ../.. && bun run typecheck && bun run lint && bun run --filter '@perch/web' test`
Expected: PASS. Commit now, with only these three files modified:

```bash
git add apps/web/src/ui/Segmented.tsx apps/web/test/components.test.tsx apps/web/src/ui/styles.css
git commit -m "fix(web): show a segmented choice on pointerdown"
```

- [ ] **Step 3: Restyle the other controls**

- `Field.tsx` and `TextField`: the label row is `.field__label` (icon at 16, then the 14 px 600 label, then "Optional" muted). The input is `min-height: 46px`, 16 px text, a paper background, `border: 1px solid var(--color-edge)`, radius 12; on focus the border is red with no outline offset jump. The helper is 13 px muted; the error is red with a `CircleAlert` icon. `.field` padding is 16 px top and bottom with a hairline below (the mock's `.field`).
- `Stepper.tsx`: the mock's `.stepper` (mist, radius 12, 4 px padding). Minus and plus are 40 px keys with `::before { inset: -2px }` for 44, using Lucide `Minus` and `Plus`. The value input is Newsreader 22 tabular, 64 px wide. Keep keypad entry, min, max, step and suffix behavior exactly as today.
- `Check.tsx` `variant="tag"`: a native checkbox visually hidden inside a `label.tag` (36 px drawn, pill, hairline; checked is the ink fill with paper text, and a Lucide `Check` icon replaces any leading icon when checked). Extend the hit area to 44 with `::before { inset: -4px 0 }`. `variant="row"`: a 48 px row with the label left and a 44 px switch-like box on the right (a mist track with an ink knob when checked); 200 ms knob slide.
- `TagGroup`: a fieldset whose legend is styled like `.field__label`, with `.tags` (flex wrap, 8 px gap) inside.
- `Choices.tsx` (`YesNo`, `TriState`, `OptionalChoice`): built on `Segmented`. Pass through `icon`. No other change.

Add component tests:

```tsx
test("tag checks are native checkboxes with a 44 px hit area class", () => {
  render(<Check variant="tag" label="Carrels" checked={false} onChange={() => {}} />);
  const box = screen.getByRole("checkbox", { name: "Carrels" });
  expect(box.closest("label")?.className).toContain("tag");
});
```

Delete the component tests that assert the old segmented markup only (the ink-blue checked span) if any exist. Keep the postmark and stamp tests until Task 12.

- [ ] **Step 4: Verify on the admin role switch, then commit**

Procedure V on `/survey/admin` and `/survey/spots/<id>/seating`. In a Playwright probe (not committed), measure pointerdown to checked on the admin role switch: the radio must be checked before pointerup. Report the numbers next to the measured 155 ms delay from the spec.

Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test && bun run --filter '@perch/web' e2e`
Expected: PASS. If e2e radio clicks changed behavior, they should not have: a Playwright `click` sends pointerdown, pointerup and click on the same option.

```bash
git add apps/web/src/ui apps/web/test/components.test.tsx
git commit -m "feat(web): seawolf fields, steppers, tags and switches"
```

---

### Task 6: Spot overview

**Files:**
- Create: `apps/web/test/facts.test.ts`
- Modify: `apps/web/src/lib/facts.ts`, `apps/web/src/screens/Overview.tsx`, `apps/web/src/screens/spot.css`, `apps/web/src/routes/survey.spots.$id.index.tsx`, `apps/web/test/spot.test.tsx`, `apps/web/e2e/spots.e2e.ts`, `apps/web/e2e/finish.e2e.ts`, `apps/web/e2e/layout.e2e.ts`, `docs/design/surveyor-copy.md`, `packages/ui-logic/src/copy/copy.gen.ts`, `packages/ui-logic/test/copy.test.ts`

**Interfaces:**
- Consumes: `stepProgress`, `nextAfter`, `sectionStatuses`, `publishReadiness`, `reviewAction`, `SECTION_ICON`, `Screen`, `Row`, `Pill`, `StepBar`, `Sheet`, `ConfirmSheet`.
- Produces: `sectionFact(view: SpotView, section: OverviewSection, term: TermRef | null): string | null`; `sectionEnd(status: SectionStatus, fact: string | null): ReactNode`.

- [ ] **Step 1: Copy**

Add to the redesign table:

```md
| spot.progress.next | {done} of {total} · Next: {section} | 40 | under the step bar |
| spot.progress.complete | {done} of {total} done | 20 | |
| spot.next | Next: {section} | 30 | action bar, ink |
| spot.meta.floor | Floor {floor} | 16 | |
| spot.publish.blocked.reason | Can't publish yet: {count} missing | 36 | described-by of the disabled Publish |
| spot.actions.next_missing | Open next missing: {section} | 44 | Actions sheet |
| spot.actions.add_photo | Add a photo | 14 | Actions sheet |
| spot.fact.seats | {count} seats | 12 | |
| spot.fact.outlets | {percent}% near outlets | 22 | |
| spot.fact.hours | {term} hours | 22 | |
| spot.fact.blocks | {count} of {total} blocks | 20 | busyness |
| spot.fact.photos_one | 1 photo | 10 | |
| spot.fact.photos | {count} photos | 12 | |
```

Change the text of `spot.group.extras` to `Extras` (max 10). Add `floor: "2"` to `SAMPLE`. Run `bun run copy:gen` and the copy test.

- [ ] **Step 2: Write the failing fact tests**

`apps/web/test/facts.test.ts` (use `surveySpotFixture` and `buildSpotView` as `spot.test.tsx` does):

```ts
test("section facts come from the editors' own labels", () => {
  const v = viewOf({ floor: "2", eligibility: "all_students", seat_count: 112, outlet_coverage_pct: 0.4, noise_policy: "quiet", food_policy: "covered_drinks" });
  expect(sectionFact(v, "identity", TERM)).toBe("Floor 2");
  expect(sectionFact(v, "access", TERM)).toBe("Any student");
  expect(sectionFact(v, "seating", TERM)).toBe("112 seats");
  expect(sectionFact(v, "power", TERM)).toBe("40% near outlets");
  expect(sectionFact(v, "environment", TERM)).toBe("Quiet");
  expect(sectionFact(v, "use_fit", TERM)).toBe("Covered drinks");
  expect(sectionFact(v, "late_night", TERM)).toBeNull();
});

test("the row end: sync trouble beats missing, missing beats the fact", () => {
  // render sectionEnd for: conflict -> red "Two versions"; failed -> red "Didn't save";
  // syncing -> muted "Syncing"; missing -> red "Missing"; partial -> "Partly done"; done -> fact; done without fact -> "Done"
});
```

Write the second test out fully with `render(<>{sectionEnd(status, fact)}</>)` and `screen.getByText`. Note that `outlet_coverage_pct` is a 0 to 1 fraction (sections.ts `z.number().min(0).max(1)`); the fact shows `Math.round(pct * 100)`.

Run: `cd apps/web && bunx vitest run test/facts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement facts**

In `apps/web/src/lib/facts.ts`:

```ts
export function sectionFact(view: SpotView, section: OverviewSection, term: TermRef | null): string | null {
  const s = view.spot;
  switch (section) {
    case "identity":
      return s.floor === "" ? null : t("spot.meta.floor", { floor: s.floor });
    case "access":
      return s.eligibility === null ? null : COPY[ELIGIBILITY_COPY[s.eligibility]];
    case "seating":
      return s.seat_count === null ? null : t("spot.fact.seats", { count: String(s.seat_count) });
    case "power":
      return s.outlet_coverage_pct === null
        ? null
        : t("spot.fact.outlets", { percent: String(Math.round(s.outlet_coverage_pct * 100)) });
    case "environment":
      return s.noise_policy === null ? null : COPY[NOISE_COPY[s.noise_policy]];
    case "use_fit":
      return s.food_policy === null ? null : COPY[FOOD_COPY[s.food_policy]];
    case "hours":
      return s.hours.length === 0 || term === null ? null : t("spot.fact.hours", { term: term.name });
    case "estimates":
      return s.estimates.length === 0
        ? null
        : t("spot.fact.blocks", { count: String(s.estimates.length), total: String(ESTIMATE_BLOCKS) });
    case "photos": {
      const n = s.photos.length + view.pendingPhotos.length;
      return n === 0 ? null : plural(n, "spot.fact.photos_one", "spot.fact.photos");
    }
    default:
      return null;
  }
}
```

Match the placeholder value types to what `t()` accepts (check `t`'s signature; pass numbers if it takes them). `ESTIMATE_BLOCKS` is the number of day-type and block cells the busyness grid edits (look up the constant `EstimatesEditor` uses; if there is none, export one from `src/lib/estimates.ts`). Check the name of the food copy map in `src/lib/fields.ts`.

`sectionEnd(status, fact)`:
- sync conflict: `<Pill tone="red" icon={TriangleAlert}>{t("spot.section.conflict")}</Pill>`;
- failed: `<Pill tone="red" icon={CircleAlert}>{t("spot.section.failed")}</Pill>`;
- syncing: muted `t("spot.section.syncing")`;
- saved_on_phone: muted `t("spot.section.on_phone")`;
- otherwise fill missing: `<Pill tone="red">{t("spot.section.missing")}</Pill>`;
- partial: muted `t("spot.section.partial")`;
- done: muted `fact ?? t("spot.section.done")` in a `.truncate` span with `max-width: 50%`.

Run: `cd apps/web && bunx vitest run test/facts.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing overview tests**

In `apps/web/test/spot.test.tsx`, adapt the existing tests to the new markup (they assert behavior: publish queues, review, unpublish confirm, conflict and failed sheets, blocked links). Add:

```tsx
test("a blocked draft: Publish stays focusable, says why, and lists every blocker", async () => {
  // spot missing seat_count and with no verification at all
  const publish = screen.getByRole("button", { name: "Publish" });
  expect(publish.getAttribute("aria-disabled")).toBe("true");
  const reason = document.getElementById(publish.getAttribute("aria-describedby") ?? "");
  expect(reason?.textContent).toMatch(/Can't publish yet: 2 missing/);
  await user.click(publish);
  const sheet = screen.getByRole("dialog", { name: "Can't publish yet" });
  expect(within(sheet).getByRole("link", { name: /seat count/i })).toBeTruthy();
  expect(within(sheet).getByText(/check/i)).toBeTruthy(); // last_verified has no section, still named
});

test("the next button opens the first missing section", async () => {
  await user.click(screen.getByRole("link", { name: "Next: Seating" }));
  // router location is /survey/spots/<id>/seating
});

test("every spot shows when it was last checked", () => {
  expect(screen.getByText(/Checked [A-Z][a-z]{2} \d{1,2}|Never checked/)).toBeTruthy();
});

test("rows show the fact, or a red Missing", () => {
  expect(within(screen.getByRole("link", { name: /Seating/ })).getByText("Missing")).toBeTruthy();
});
```

Use the existing `fieldLabel` text for the field names. Run the file. Expected: FAIL.

- [ ] **Step 5: Rebuild the overview**

`Overview.tsx`, following spec section 5:

- `Screen` with `title={spot.official_name}`, `back={{ to: "/survey" }}`, `trailing={<SyncStatus variant="icon" />}`.
- `meta`:
  - `<Meta>` holding a Draft or Published pill (`spot.status.*`);
  - `Publish queued` and `Review queued` pills when queued;
  - `Reviewed by {name}` (mist) or `Unreviewed` (mist, `Eye` icon) as today's rules decide;
  - then `{building} · Floor {floor}` from the list's `building_name` (`useSpotList`) or the campus building name;
  - then `t("spot.section.verified", { date })` for the oldest `spot.verified` date, or `t("home.stale.never")`, with a `CalendarCheck` icon.
- Under it: `<StepBar steps label>` with a 12 px margin above, then a 13 px muted line: `progress.next === null ? t("spot.progress.complete", ...) : t("spot.progress.next", { ..., section: sectionName(next) })`.
- Banners for conflict and failed, as today, restyled: mist background, radius 12, an icon, and the existing quiet Open button with its accessible name.
- `review === "own"`: the lede stays.
- Groups: `GroupHeading` with the group title; `ul.row-list` of `Row` per status: `lead={<Icon icon={SECTION_ICON[s.section]} className={s.fill === "missing" ? "icon--red" : "icon--muted"} />}`, `title={sectionName(s.section)}`, `end={sectionEnd(s, sectionFact(view, s.section, term))}`, and `link` to the section. Remove `postmarkFor` and `Stamps`.
- The action bar (by readiness and review, spec 5.7). `Next: {section}` is a `Link` styled `btn btn--ink` with `flex: 1` and a trailing `ArrowRight`. Publish blocked: `<Button variant="primary" aria-disabled="true" aria-describedby={reasonId} onClick={() => setBlockers(true)}>`, with `<p id={reasonId} className="visually-hidden">` holding `t("spot.publish.blocked.reason", { count })`. Then the Actions IconButton.
- The blockers sheet: `Sheet` titled `t("spot.publish.blocked.title")`, a list of `t("spot.publish.blocked.item", { field: fieldLabel(field) })`, each a link to its section when it has one (keep the class `.blockers` on the list so the e2e locator keeps working).
- The Actions sheet: `act` rows (48 px, an icon, the label):
  - Open next missing (when `progress.next !== null`);
  - Add a photo (a link to `photos`);
  - Looks right (when `review === "button"` and it is not already in the bar);
  - Unpublish (admins, published, not local only; `danger`, disabled offline with `error.network_admin`) opening the existing ConfirmSheet.

Delete the `.pinned` and `.stamp-row` usages from this screen and update `spot.css`: delete the postcard rules that now have no users, and keep the rest until Task 12.

Run: `cd apps/web && bunx vitest run test/spot.test.tsx test/facts.test.ts`
Expected: PASS.

- [ ] **Step 6: e2e selectors and layout**

Update `e2e/spots.e2e.ts` and `e2e/finish.e2e.ts`:
- `getByText("Can't publish yet")`: click `getByRole("button", { name: "Publish" })` first, then expect the dialog.
- `.blockers a`: unchanged inside the dialog.
- `.pinned` and `.stamp-row` locators: use `getByRole("contentinfo")` (the ActionBar `footer`) and the pills by text (`getByText("Published", { exact: true })`).

Add `/survey/spots/<seeded published id>` and a long-named draft overview to `ROUTES`; resolve the ids in the test through `e2e/api.ts` before the loop. Run the full e2e suite. Expected: PASS.

- [ ] **Step 7: Procedure V and commit**

Procedure V on a draft overview and a published overview (dark is covered by the layout e2e). Compare with `dir-d.png`, middle phone.

Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test`
Expected: PASS.

```bash
git add apps/web/src apps/web/test/facts.test.ts apps/web/test/spot.test.tsx apps/web/e2e docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts packages/ui-logic/test/copy.test.ts
git commit -m "feat(web): seawolf spot overview with step bar and actions"
```

---

### Task 7: Section editor shell, Save and next, and the simple editors

**Files:**
- Modify: `apps/web/src/screens/editors/EditorShell.tsx`, `apps/web/src/screens/editors/simple.tsx`, `apps/web/src/screens/editors/IdentityEditor.tsx`, `apps/web/src/routes/survey.spots.$id.$section.tsx`, `apps/web/test/spot.test.tsx` (or the editor test file that covers `EditorShell` today; find it with `grep -l "Checked, nothing changed\|editor.verify" apps/web/test`), `apps/web/e2e/spots.e2e.ts`, `apps/web/e2e/finish.e2e.ts`, `apps/web/e2e/layout.e2e.ts`, `docs/design/surveyor-copy.md`, `packages/ui-logic/src/copy/copy.gen.ts`

**Interfaces:**
- Consumes: `stepProgress(view, section)`, `nextAfter(view, section)`, `SECTION_ICON`, the Task 5 controls with `icon`.
- Produces: no new exports. `EditorShell` keeps its props.

- [ ] **Step 1: Copy**

Add:

```md
| editor.progress.after | {done} of {total} · After this: {section} | 46 | under the step bar |
| editor.progress | {done} of {total} | 10 | when nothing is left after this one |
| editor.save_next | Save and next | 16 | primary when a next section exists |
```

Change the text of `editor.verify` to `Nothing changed` (max 18). Run `bun run copy:gen`.

- [ ] **Step 2: Write the failing editor tests**

In the existing editor test file:

```tsx
test("save and next goes to the next unfinished required section", async () => {
  // spot missing seat_count and noise_policy; open seating; change seats; click
  await user.click(screen.getByRole("button", { name: "Save and next" }));
  // router location ends with /environment
});

test("with nothing left after this one, the button is Save and returns to the overview", async () => {
  // spot missing only seat_count; open seating
  expect(screen.queryByRole("button", { name: "Save and next" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save" }));
  // router location is the overview
});

test("an optional section saves back to the overview", async () => {
  // open late_night on a spot with missing required sections
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});

test("Nothing changed still checks and returns to the overview", async () => {
  await user.click(screen.getByRole("button", { name: "Nothing changed" }));
  // a spot.verify write is queued; location is the overview
});

test("the editor shows progress and when this section was last checked", () => {
  expect(screen.getByRole("img", { name: /of 6 done/ })).toBeTruthy();
  expect(screen.getByText(/After this: Noise and feel|of 6$/)).toBeTruthy();
  expect(screen.getByText(/Checked [A-Z][a-z]{2} \d{1,2}|Checked today|Never checked/)).toBeTruthy();
});
```

Use the deck's section names (`sectionName`) in the expected strings. Run. Expected: FAIL.

- [ ] **Step 3: Implement**

`EditorShell`:
- `const progress = stepProgress(view, section)` and `const after = nextAfter(view, section)`.
- `Screen` with `title={sectionName(section)}`, `back` to the overview, `trailing={<SyncStatus variant="icon" />}`. Then `meta`: the spot name (15 muted), a `StepBar` with 16 px margin above, then `after === null ? t("editor.progress", ...) : t("editor.progress.after", { ..., section: sectionName(after) })`, then, for attribute groups, `CalendarCheck` with `t("spot.section.verified_today")`, `t("spot.section.verified", { date })` or `t("home.stale.never")`.
- `saveNow` keeps every check (validate, confirm on clearing a published spot's required field, toasts). After a successful save it navigates to `after === null ? overview : { to: "/survey/spots/$id/$section", params: { id: view.spot.id, section: after } }`, with `leaving.current = true` as today. `verifyNow` still goes to the overview.
- The action bar is `stacked`: the primary Button `after === null ? t("editor.save") : t("editor.save_next")` with a trailing `ArrowRight` when there is a next; then the quiet Button `t("editor.verify")` (disabled while dirty) or the blocked reason in 13 px muted.

`simple.tsx` and `IdentityEditor.tsx`: pass `icon` to every field. Mapping (Lucide):

| Editor | Field | Icon |
|---|---|---|
| identity | name | `Type` |
| identity | common name | `Tag` |
| identity | floor | `Layers` |
| identity | directions | `Signpost` |
| identity | location | `LocateFixed` |
| identity | outdoor | `Trees` |
| identity | seasonal | `Snowflake` |
| access | eligibility | `Users` |
| access | entry | `KeyRound` |
| access | reservable | `CalendarClock` |
| seating | seats | `Armchair` |
| seating | seat types | `LayoutGrid` (`TagGroup` of tag `Check`s) |
| seating | tables | `Table` (`TagGroup`) |
| seating | effective capacity | `Users` |
| seating | spread out | `Expand` |
| power | outlets | `Plug` |
| power | usb | `Usb` |
| power | wifi | `Wifi` |
| power | cell | `Signal` |
| environment | noise | `Volume2` |
| environment | natural light | `Sun` |
| environment | lighting | `Lamp` |
| environment | temperature | `Thermometer` |
| environment | consistent | `ThermometerSun` |
| environment | view | `AppWindow` |
| use_fit | calls | `Phone` |
| use_fit | group work | `Users` |
| use_fit | whiteboard | `Presentation` |
| use_fit | food | `Utensils` |
| amenities | each amenity stepper | `Coffee` |
| accessibility | step free | `Accessibility` |
| accessibility | elevator | `ArrowUpDown` |
| accessibility | seating | `Armchair` |
| late_night | past midnight | `Moon` |
| late_night | staffed | `UserCheck` |
| late_night | lit route | `Lightbulb` |

Swap in the nearest existing Lucide icon when a name does not exist in the installed version. In the seating editor, seat types and tables become `TagGroup` plus `Check variant="tag"` (same state logic, same accessible names).

Run the editor tests. Expected: PASS.

- [ ] **Step 4: e2e selectors and layout**

In `e2e/spots.e2e.ts` and `e2e/finish.e2e.ts`, replace `getByRole("button", { name: "Save", exact: true })`. When the flow then expects the overview, use `/^Save( and next)?$/` and, after a "Save and next", navigate back with the Back link or assert the next editor, whichever the test needs; keep each test's intent. `Checked, nothing changed`, if used, becomes `Nothing changed`. Add `/survey/spots/<draft id>/seating` and `/survey/spots/<draft id>/identity` to `ROUTES`. Run the full e2e suite. Expected: PASS.

- [ ] **Step 5: Procedure V and commit**

Procedure V on `/survey/spots/<id>/seating`, `identity`, `access` and `late_night`. Compare with `d3.png`.

Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test`
Expected: PASS.

```bash
git add apps/web/src apps/web/test apps/web/e2e docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "feat(web): seawolf section editors with save and next"
```

---

### Task 8: Hours, Busyness and Photos editors

**Files:**
- Modify: `apps/web/src/screens/editors/HoursEditor.tsx`, `apps/web/src/screens/editors/EstimatesEditor.tsx`, `apps/web/src/screens/editors/PhotosEditor.tsx`, `apps/web/src/ui/PhotoImage.tsx`, `apps/web/src/screens/spot.css`, the related tests in `apps/web/test/`, `apps/web/e2e/layout.e2e.ts`

**Interfaces:**
- Consumes: EditorShell from Task 7, the controls from Task 5.

- [ ] **Step 1: Write the failing tests for any changed markup**

Keep every behavior test. These must still hold and should be re-run first to confirm the baseline:
- the Hours editor exposes `group` per day named "Mon" and so on, `checkbox` "Closed", and the button "Copy Monday to weekdays";
- the Photos editor has "Choose from library", "Use as cover", the "Cover" text, and the test id `photo-library`;
- the Busyness grid has time blocks as rows (decision 19).

Add one test per editor for the new structure:

```tsx
test("hours: each day is a row with its own group and a closed switch", () => {
  const mon = screen.getByRole("group", { name: "Mon" });
  expect(within(mon).getByRole("checkbox", { name: "Closed" })).toBeTruthy();
});

test("busyness: a day type is a segmented control over the block rows", () => {
  expect(screen.getByRole("radiogroup", { name: /day/i }) ?? screen.getByRole("group", { name: /day/i })).toBeTruthy();
});

test("photos: the cover carries a pill, the others offer Use as cover", () => {
  expect(screen.getByText("Cover", { exact: true }).className).toContain("pill");
});
```

Adapt the busyness assertion to the control the editor uses today: if it has no day-type switch, assert the block row labels instead and skip the switch.

- [ ] **Step 2: Restyle**

- Hours: one row per day (`Mon` to `Sun` in 15 px 600, then open and close times as two 46 px time inputs with the edge outline, then a `Check variant="row"` "Closed"). Any further blocks for a day are listed under it with the existing behavior. "Copy Monday to weekdays" is a quiet button with a `Copy` icon. 16 px between days, hairlines.
- Busyness: keep the rows-by-time-block grid. Each row: the block label left and a `Segmented` of fullness buckets right (or below at 375 px if four options do not fit in 200 px; use `layout="row"` and let the row wrap to a column). The day type is a Segmented at the top if the editor has one.
- Photos: a 2-column grid (3 at 768 px and wider) of 4:3 tiles, radius 12. The cover tile has `<Pill icon={Star}>Cover</Pill>` over the image (bottom left, 8 px). The other tiles get a quiet "Use as cover" button below. Pending uploads show a muted "On this phone" pill. Failed uploads show a red pill and Retry. The upload actions ("Take a photo", "Choose from library") go in the stacked action bar instead of Save, as quiet and primary buttons with `Camera` and `Images` icons; keep their accessible names and the test id. `PhotoImage` empty state: a mist box with an `ImageOff` icon and `photos.unavailable`.

- [ ] **Step 3: Tests, layout, Procedure V, commit**

Add the three editor routes to `ROUTES`. Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test && bun run --filter '@perch/web' e2e`. Expected: PASS. Procedure V on `hours`, `estimates` and `photos` for a draft.

```bash
git add apps/web/src apps/web/test apps/web/e2e/layout.e2e.ts
git commit -m "feat(web): seawolf hours, busyness and photos editors"
```

---

### Task 9: Sync, conflict and failed sheets, toasts and the update prompt

**Files:**
- Modify: `apps/web/src/screens/SyncSheet.tsx`, `apps/web/src/screens/WriteSheets.tsx`, `apps/web/src/screens/UpdatePrompt.tsx`, `apps/web/src/ui/Toast.tsx`, `apps/web/src/ui/styles.css`, `apps/web/test/toasts.test.tsx`, `apps/web/test/survey.test.tsx` (whichever covers the sheets; `grep -l "SyncSheet\|ConflictSheet\|FailedSheet" apps/web/test`)

- [ ] **Step 1: Confirm the behavior tests**

Run the sheet and toast tests before changing anything. Every assertion stays. Add:

```tsx
test("the sync sheet lists each waiting change as a row with an icon and its spot", () => {
  // one pending section write, one failed
  const sheet = screen.getByRole("dialog", { name: "Changes on this phone" });
  expect(within(sheet).getAllByRole("listitem").length).toBe(2);
  expect(within(sheet).getByText(/Didn't save:/)).toBeTruthy();
});

test("conflict: mine and theirs are two labelled blocks with both actions", () => {
  const sheet = screen.getByRole("dialog");
  expect(within(sheet).getByRole("region", { name: /yours|mine/i })).toBeTruthy();
  expect(within(sheet).getByRole("region", { name: /theirs|server/i })).toBeTruthy();
});
```

Use the deck's existing conflict copy for the region names (`grep "^| conflict\." docs/design/surveyor-copy.md`).

- [ ] **Step 2: Restyle**

- SyncSheet: a status line at the top (icon plus the long status). Then `ul.row-list` of rows:
  - pending: `Clock` muted;
  - syncing: `RefreshCw`;
  - failed: `CircleAlert` red;
  - conflict: `TriangleAlert` red;
  - unreadable: `FileWarning` red.

  Each row's title is the `sync.what.*` text and its end is the "Open spot" link (quiet, 44 px). The help notes are muted 13 px. The "Discard" actions are the `danger` variant.
- Conflict sheet: two blocks (`section` with `aria-labelledby`), each with a mist background, radius 12, the 13 px muted heading, and field rows (label muted, value ink). Actions stacked at the bottom: keep mine (primary) and keep theirs (ink). Keep the existing names and behavior.
- Failed sheet: the reason in a red-tinted box with a `CircleAlert` icon, then Retry (primary) and Discard (danger).
- Toast: as built in Task 2, and verify that the queued and done copy behavior is unchanged.
- UpdatePrompt: a card fixed above the action bar (ink background, paper text, radius 12), "Update ready" text and a `Reload` button styled quiet on ink (paper at 12% over ink, ink-on-ink rules adjusted for contrast: use `color-mix(in oklab, var(--color-paper) 14%, var(--color-ink))` background with paper text; verify 4.5:1 with the contrast helper in a unit test if it is a new pair).

- [ ] **Step 3: Tests, Procedure V, commit**

Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test && bun run --filter '@perch/web' e2e`. Expected: PASS. Procedure V: open the sync sheet on `/survey`, then capture a conflict and a failed sheet through the e2e helpers or by hand. Wait until `.sheet[open]` has finished its transition (`await page.waitForFunction(() => getAnimations ... )`, or capture with `animations: "disabled"`).

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): seawolf sync, conflict and failed sheets"
```

---

### Task 10: Admin (badge fix, role switch, publish and photos)

**Files:**
- Modify: `apps/web/src/screens/Admin.tsx`, `apps/web/src/screens/admin.css`, `apps/web/test/admin.test.tsx`, `apps/web/e2e/finish.e2e.ts`, `apps/web/e2e/layout.e2e.ts`, `docs/design/surveyor-copy.md`, `packages/ui-logic/src/copy/copy.gen.ts`

**Interfaces:**
- Consumes: `Screen`, `Row`, `Pill`, `Sheet`, `IconButton`, `Segmented`.

- [ ] **Step 1: Copy**

Add `| admin.surveyor.actions | Actions for {name} | 34 | icon button on a surveyor row |`. Run `bun run copy:gen`.

- [ ] **Step 2: Write the failing admin tests**

```tsx
test("a surveyor row shows the name and role, with actions behind one button", async () => {
  // admin.surveyors = [{ display_name: "Riley Okafor-Lindqvist", role: "admin", active: true }]
  const row = screen.getByText("Riley Okafor-Lindqvist").closest("li");
  if (row === null) throw new Error("no row");
  expect(within(row).getByText("Admin").className).toContain("pill");
  await user.click(within(row).getByRole("button", { name: "Actions for Riley Okafor-Lindqvist" }));
  const sheet = screen.getByRole("dialog", { name: "Riley Okafor-Lindqvist" });
  expect(within(sheet).getByRole("button", { name: "New sign-in link" })).toBeTruthy();
  expect(within(sheet).getByRole("button", { name: "Remove access" })).toBeTruthy();
});
```

Keep the existing admin tests (invite with role, copy link toast, relogin link cleared on revoke, publish now, approve and reject). Update their selectors to open the row sheet first. Run. Expected: FAIL.

- [ ] **Step 3: Rebuild Admin**

- `Screen` with `title={t("admin.title")}` (check the id), back to Home, trailing `SyncStatus`.
- Invite group: `GroupHeading`, then `Segmented` (role, `UserCog` icon), then the primary Create button, then the created link in a mist box (mono 13 px, `user-select: all`, `overflow-wrap: anywhere`) with a quiet Copy button (`Copy` icon).
- Publish group: two stat figures side by side (Newsreader 22 tabular: the last published date and "Changes waiting" or nothing; check the deck for existing ids and reuse them), then the warnings list (rows with a `TriangleAlert` icon in red), then Publish now (primary unless another red button is visible; ink otherwise).
- Photos group: a 2-column grid of 4:3 tiles with the spot name and uploader below (13 px muted), and Approve (ink) and Reject (danger) under each.
- Surveyors group: a `ul.row-list` of `Row` with `title={display_name}`, `sub={null}`, `end={<>{role === "admin" ? <Pill icon={Shield}>Admin</Pill> : null}{!active ? <Pill tone="red">Inactive</Pill> : null}<IconButton icon={Ellipsis} label={t("admin.surveyor.actions", { name })} onClick={...} /></>}`. Pills are `flex: none`; the title is `.truncate`, so the name ellipses and the badge never does (fixes the measured clip). The row sheet is titled with the name and holds the relogin and revoke actions (the same handlers, busy guards and online gating), and then the relogin `CreatedLink` shows inside the sheet.
- Offline: the `error.network_admin` banner at the top as today.

Delete the `.entry*` and `.created-link*` rules that no longer have users.

- [ ] **Step 4: Tests, layout, Procedure V, commit**

Add `/survey/admin` to `ROUTES`. In that test, create a surveyor with a long display name first (through `e2e/api.ts` `surveyorInvite` and its accept flow, or a helper that accepts an invite with `display_name`). Run: `bun run typecheck && bun run lint && bun run --filter '@perch/web' test && bun run --filter '@perch/web' e2e`. Expected: PASS, and the layout check reports no clipped `Admin` pill at 375. Procedure V on `/survey/admin`.

```bash
git add apps/web/src apps/web/test/admin.test.tsx apps/web/e2e docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "fix(web): keep the admin badge whole on the admin screen"
```

---

### Task 11: Invite, new spot, signed out and not found

**Files:**
- Modify: `apps/web/src/screens/Invite.tsx`, `apps/web/src/screens/NewSpot.tsx`, `apps/web/src/screens/BuildingPicker.tsx`, `apps/web/src/screens/LocationButton.tsx`, `apps/web/src/screens/SignedOut.tsx`, `apps/web/src/routes/survey.spots.$id.index.tsx` and `survey.spots.$id.$section.tsx` (loading and not-found states), `apps/web/test/invite.test.tsx`, `apps/web/test/survey.test.tsx`, `apps/web/test/signout.test.tsx`, `apps/web/e2e/layout.e2e.ts`

- [ ] **Step 1: Confirm the behavior tests**

Run the invite, new spot and signed-out tests; they must keep passing with selector updates only. The e2e flows use `searchbox "Building"`, the button "Melville Library", textboxes "Name", "Floor" and "How to get there", the button "Create spot", the button "Sign in", and the text "On an iPhone?"; keep all those accessible names.

- [ ] **Step 2: Restyle**

- Invite: `Screen` without back; title per mode (the existing `invite.*` copy); the name `TextField` (`User` icon); the error as a red-tinted banner; the iPhone note as a mist card with a `Smartphone` icon; Join or Sign in as the primary in the action bar. Never accept on load (unchanged).
- New spot: `Screen` titled `t("new.title")` with back to Home; the building picker as `Search` (keep `type="search"` and the name "Building") and compact `Row`s of buildings with `Building2` icons, the selected one with an ink `Check` at the end; then the fields with icons (as in the Task 7 table); `LocationButton` as a ghost button with `LocateFixed` and its status text muted. Create spot is the primary in the action bar.
- Signed out: `Screen` without back, title `t("auth.expired.title")`, body text, and no action unless one exists today.
- Not found and loading (spot and section routes): `Screen` with back to Home, title `t("app.name")`, the lede text as today.

- [ ] **Step 3: Tests, layout, Procedure V, commit**

Add `/survey/spots/new` to `ROUTES`. Add an invite route check too: a fresh invite URL, no sign-in, at the three widths, in a separate test in `layout.e2e.ts`. Run the full web unit and e2e suites. Procedure V on `/survey/spots/new` and on an invite URL (from the state file, before it is used).

```bash
git add apps/web/src apps/web/test apps/web/e2e/layout.e2e.ts
git commit -m "feat(web): seawolf invite, new spot and signed out screens"
```

---

### Task 12: Remove the postcard world and verify everything

**Files:**
- Delete: `apps/web/src/ui/legacy.css`, `apps/web/src/ui/Postmark.tsx`, `apps/web/src/ui/SyncPostmark.tsx`, `apps/web/src/ui/StampChip.tsx`, `apps/web/src/ui/RuledRow.tsx`, `apps/web/src/ui/HeaderBand.tsx`, `apps/web/src/screens/SurveyHeader.tsx` (if no users remain)
- Modify: `apps/web/src/ui/Screen.tsx` (delete `LegacyScreen`), `apps/web/src/ui/Button.tsx` (drop the `secondary` alias), `apps/web/src/ui/styles.css`, `apps/web/src/screens/spot.css`, `apps/web/src/screens/admin.css`, `apps/web/src/main.tsx`, `apps/web/src/lib/format.ts` (drop `postmarkState` if unused), `apps/web/test/components.test.tsx`, `docs/design/surveyor-copy.md` (drop ids nothing uses), `packages/ui-logic/src/copy/copy.gen.ts`

- [ ] **Step 1: Write the failing guard test**

Add to `apps/web/test/theme.test.ts`:

```ts
test("no postcard artifacts remain in the web source", () => {
  const files = [...cssFiles(SRC), ...tsxFiles(SRC)];
  const hits = files.filter((f) =>
    /postmark|stamp|ruled|airmail|band__|legacy\.css|--color-(shell|accent|surface|background|text\b|textMuted|border\b|borderStrong|success|warning|danger)/i.test(
      readFileSync(f, "utf8"),
    ),
  );
  expect(hits).toEqual([]);
});
```

with `tsxFiles` as the `.ts` and `.tsx` twin of `cssFiles`. Run. Expected: FAIL, listing every remaining file.

- [ ] **Step 2: Delete and clean**

Delete the components and `legacy.css`, and remove its import from `main.tsx`. Replace every remaining old variable with its Seawolf name (the mapping in Task 1 Step 4). Delete the dead CSS blocks (`.band*`, `.syncmark*`, `.postmark*`, `.stamp*`, `.ruled*`, `.pinned*`, `.entry*` if unused, `.group-heading` small-caps rules, `sheet-in`, `toast-in`). In `components.test.tsx`, delete the postmark and stamp tests and the syncmark width test; keep and adapt any that test behavior still present (the header short forms now apply to `SyncStatus variant="bar"`: assert its short text fits, using the same strings). Remove copy ids that no `t()` call uses anymore (search each id in `apps/web/src`), keeping the deck and `copy.gen.ts` in sync with `bun run copy:gen`. Then:

Run: `grep -rniE "postmark|stamp|ruled|airmail|band__" apps/web/src`
Expected: no output.

- [ ] **Step 3: Full verification**

Run, in order, and record the counts:

```bash
bun run typecheck && bun run lint
bun test --timeout 60000
bun run --filter '@perch/web' test
bun run --filter '@perch/web' e2e
bun run smoke:node
```

Expected: all PASS. Playwright: the 13 existing tests (some adapted) plus theme (2), nav (1) and layout (2): 18.

Procedure V on every route: `/survey`, `/survey/spots/new`, `/survey/admin`, a draft overview, a published overview, and the `identity`, `seating`, `hours`, `estimates` and `photos` editors. Every line must be PASS. Dark mode is covered by `e2e/layout.e2e.ts`; also review a set of dark screenshots taken with a throwaway snippet as described in Procedure V.

Lighthouse, per `CLAUDE.md`, on a production build in its own directory: accessibility 100, and record the performance number.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src apps/web/test docs/design/surveyor-copy.md packages/ui-logic/src/copy/copy.gen.ts
git commit -m "refactor(web): remove the postcard components and tokens"
```

Check `git status` before `git add -A`: it must not pick up `apps/web/scripts/verify-ui.ts`, `audit-shots.ts`, `CLAUDE.md` or `.claude/*`. Those paths are outside the `add` arguments above, so they are safe.

---

## After this plan: resume plan D part 3

Do not duplicate these here. They run from `docs/superpowers/plans/2026-10-04-surveyor-2a-web-3-finish.md`, with these amendments:

1. **Task 16 step 4 (recapture for the finish review).** Use valid captures this time: wait for `.sheet[open]` to finish its transition, capture with `animations: "disabled"`, include 768 and 1440 widths, and capture light and dark. The finish reviewer now reviews against the Seawolf contract (`apps/web/.impeccable/surfaces/apps-web.md` version 2). The bounce-easing detector ignore is no longer needed (no stamp easing).
2. **Task 17 (decision 19 and the stack notes).** Its verbatim decision text is outdated. Before appending it, delete from it: "Labels are 13 px full caps; the dark shell is `#2b2e35` with a rule; `radius.control` is 4." and "The stamp easing's overshoot is a recorded detector ignore (contract signature)." Add: "Visual system: decision 20." In `stack.md`, add that fonts are self-hosted from `@fontsource-variable` and that `src/ui/tokens.css` is generated by `bun run tokens:gen`.
3. **Task 18 (DESIGN.md).** Run `impeccable:impeccable-documenter` on the built Seawolf screens. After that, `DESIGN.md` and `tokens.ts` change together.

## Done criteria

Spec section 11, items 1 to 13, all checked, with the evidence (commands and counts) in the final task report.
