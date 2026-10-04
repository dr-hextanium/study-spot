# Surveyor 2a: Design Track Implementation Plan

> **For agentic workers:** This plan is interactive. Run it in the main session (superpowers:executing-plans), not through subagents: Intent and Impeccable ask the project owner to choose between directions, and those choices are theirs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the surveyor journey, the surveyor copy deck, `DESIGN.md` (postcard world with survey and student modes), and typed design tokens in `packages/ui-logic`, so plan D can build surveyor screens without placeholder styling.

**Architecture:** Intent designs the flow and words (`journey`, `articulate`), Impeccable establishes the visual world and records it in `DESIGN.md` (new-work, then document), and the tokens are transcribed once into TypeScript in `packages/ui-logic` with a schema test. CSS variable emission is a pure function so the web app and a future Expo app share one source.

**Tech Stack:** Intent plugin skills (`intent:journey`, `intent:articulate`), Impeccable plugin (`/impeccable shape`, new-work, `document`), TypeScript, Zod, Bun test.

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (section 8; S3), `docs/superpowers/specs/2026-10-03-perch-v0-design.md` (section 7a postcards), `PRODUCT.md`.

## Global Constraints

- Time box: 3 working days for the whole track (target done by 2026-10-07).
- Visual world: postcards (front photo, stamp = noise policy, postmark = last verified date, address = location, message = directions). One system, two modes: survey mode (dense, high contrast, sunlight-legible, minimal ornament) and student mode (postcard surfaces, stamps, postmarks).
- Survey screens are Operate mode: speed, scanability, one-handed use, large tap targets (at least 44 by 44 CSS px), readable in direct sunlight.
- No university logos, seals, or marks. No em-dashes in any copy or doc. Voice: dry, student-made, short, literal, no hype.
- UX honesty: never show a forecast as live; every spot shows a last-verified date.
- Accessibility: WCAG 2.2 AA contrast for text in both modes; focus visible; reduced motion respected.
- Tokens live once in `packages/ui-logic/src/tokens.ts`, no DOM APIs (package compiles without DOM types).
- Commits: Conventional Commits, subject 72 chars or fewer, no attribution, every commit passes `bun run typecheck && bun run lint && bun test`.

## Review Focus

1. Direct sunlight on a phone at full brightness: survey mode text and status chips stay legible (contrast checked against the actual token values, not eyeballed). Test: contrast assertions in Task 4.
2. A surveyor with gloves or one thumb: every interactive control in the component list has a 44 px minimum target. Test: token `size.tapTarget` asserted >= 44 in Task 4; DESIGN.md states the rule.
3. Copy that has to fit: section names, sync states, and publish blockers on a 360 px wide screen. Task 2 records a max length for each string and Task 4 has no stake; plan D renders them.
4. Dark mode at 2am in a library: both modes define dark tokens with the same contrast bar. Test: contrast assertions cover dark tokens in Task 4.
5. A missing or renamed token used by apps/web would silently fall back to browser defaults. Test: Task 4 asserts the CSS emitter outputs every token key, and the token object is validated by a Zod schema.

---

## File Structure

```
docs/design/surveyor-journey.md     Intent journey output: flows, states, edge points
docs/design/surveyor-copy.md        Intent articulate output: every surveyor string, with max length
DESIGN.md                           Impeccable visual system: world, tokens, modes, components
.impeccable/                        Impeccable sidecar files it writes (committed if Impeccable says so)
packages/ui-logic/src/tokens.ts     Typed tokens transcribed from DESIGN.md + Zod schema + toCssVariables()
packages/ui-logic/src/contrast.ts   WCAG contrast ratio helper (pure)
packages/ui-logic/test/tokens.test.ts
packages/ui-logic/src/index.ts      re-exports tokens and contrast
```

---

### Task 1: Surveyor journey (Intent)

**Files:**
- Create: `docs/design/surveyor-journey.md`

**Interfaces:**
- Produces: the screen list, state list, and edge points plan D builds. Screen names must match the spec's routes: `/invite/$token`, `/survey`, `/survey/spots/new`, `/survey/spots/$id`, `/survey/spots/$id/$section`, `/survey/admin`.

- [ ] **Step 1: Load context**

Read `PRODUCT.md`, `docs/context/design-tooling.md`, spec sections 3, 7, and 8 of `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md`.

- [ ] **Step 2: Run Intent journey**

Invoke the `intent:journey` skill with this brief:

> Surveyor flow for Perch, a campus study-spot directory. Users: 3 to 5 student surveyors walking campus with a phone, often one-handed, in hallways and basements with no signal. Job: create and verify study spots (identity, access, hours, seating, power, environment, use fit, amenities, accessibility, late night, busyness estimates, photos), publish them, and review each other's work. Routes are fixed: /invite/$token, /survey, /survey/spots/new, /survey/spots/$id, /survey/spots/$id/$section, /survey/admin. Writes are saved on the phone first and synced later. Cover: first-time invite acceptance, the walk-up-to-a-new-spot flow, re-verifying an existing spot ("Verified, nothing changed"), offline and sync states, a conflict between two surveyors, publish blocked by missing fields, sign-in expired, admin inviting someone and publishing. Target: create or edit a spot in under 5 minutes.

Answer the skill's questions from the spec; ask the project owner only for decisions the spec does not settle.

- [ ] **Step 3: Write the output**

Save the journey to `docs/design/surveyor-journey.md` with these sections: Users and situation; Happy path (numbered steps with screen and route); Screen inventory (one entry per route: purpose, primary action, secondary actions, states); State matrix (empty, loading, offline, syncing, failed, conflict, blocked, success for each screen where it applies); Edge points and recovery; Time budget check (step timings that sum to under 5 minutes for a new spot).

- [ ] **Step 4: Check and commit**

Run: `grep -n "—" docs/design/surveyor-journey.md` and expect no output.

```bash
git add docs/design/surveyor-journey.md
git commit -m "docs(design): add surveyor journey"
```

---

### Task 2: Surveyor copy deck (Intent)

**Files:**
- Create: `docs/design/surveyor-copy.md`

**Interfaces:**
- Consumes: `docs/design/surveyor-journey.md`.
- Produces: every user-facing string plan D uses, keyed by a stable id (`survey.home.title`, `sync.pending`, ...) with a max length. Plan D moves these into `packages/ui-logic` as a typed copy module.

- [ ] **Step 1: Run Intent articulate**

Invoke the `intent:articulate` skill with the journey file as input and this brief:

> Write all surveyor-facing copy for Perch. Voice: dry, student-made, short, literal, no hype, no exclamation marks, never em-dashes (use commas or colons). It must read on a 360 px phone. Cover: screen titles, section names and one-line section descriptions for the 11 spot sections, field labels and helper text for every v0-required field (directions, eligibility, seat count, outlet coverage, noise policy, food policy, group work, hours), the hours editor, the estimates grid (empty, some, filling, nearly full, full), photo capture and the postcard-shot checklist, sync states (all synced, N waiting, offline, syncing, failed), conflict view, publish blockers ("Can't publish yet: ..."), review states, invite acceptance (including the iOS "open this inside the installed app" note), sign-in expired, admin (invite created, link copied, revoke confirm, publish status, publish warnings), empty states, and generic errors.

- [ ] **Step 2: Write the output**

Save to `docs/design/surveyor-copy.md` as a table per screen with columns: `id`, `text`, `max chars`, `notes`. Ids use dot paths, lowercase, no spaces. Parameterized strings use `{name}` placeholders (for example `sync.pending` = `{count} waiting to sync`).

- [ ] **Step 3: Check and commit**

Run: `grep -n "—" docs/design/surveyor-copy.md` and expect no output. Run: `grep -c "!" docs/design/surveyor-copy.md` and confirm any matches are not exclamation marks in copy.

```bash
git add docs/design/surveyor-copy.md
git commit -m "docs(design): add surveyor copy deck"
```

---

### Task 3: Visual world and DESIGN.md (Impeccable)

**Files:**
- Create: `DESIGN.md` (and any `.impeccable/` sidecar the skill writes)

**Interfaces:**
- Produces: `DESIGN.md` containing, at minimum: the postcard world description; color tokens for survey and student modes in light and dark; type scale and font choice (fonts must be free to self-host, loaded from Google Fonts or bundled); spacing scale; radius; elevation; motion durations and easings with a reduced-motion rule; the tap target minimum; component specs for button, field, segmented control, stepper, sheet, list row, status chip, toast; and postcard elements (stamp, postmark, address block) for student mode.

- [ ] **Step 1: Run Impeccable**

Run `/impeccable shape surveyor mode` with the brief below, then follow Impeccable's new-work flow to choose the visual world with the project owner and write `DESIGN.md`. The owner chooses the direction; do not choose for them.

> Establish Perch's visual system now, before any UI exists. World: postcards (see PRODUCT.md and section 7a of the v0 spec). One system, two modes. Survey mode is the first surface: an Operate tool for surveyors on phones, dense, high contrast, sunlight-legible, one-handed, minimal ornament, 44 px minimum targets. Student mode (built later) uses postcard surfaces, stamps for noise policy, postmarks for last-verified dates. Inputs: docs/design/surveyor-journey.md and docs/design/surveyor-copy.md. Must support light and dark in both modes at WCAG 2.2 AA. No university marks. Output DESIGN.md with explicit token values.

- [ ] **Step 2: Confirm DESIGN.md has explicit values**

Open `DESIGN.md` and confirm every token category in the Interfaces list has concrete values (hex or OKLCH colors, px or rem sizes, ms durations). If Impeccable left any as prose, ask it to record the values.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md .impeccable
git commit -m "docs(design): establish postcard visual system"
```

---

### Task 4: Typed tokens in ui-logic

**Files:**
- Create: `packages/ui-logic/src/contrast.ts`, `packages/ui-logic/src/tokens.ts`
- Modify: `packages/ui-logic/src/index.ts`
- Test: `packages/ui-logic/test/tokens.test.ts`

**Interfaces:**
- Consumes: token values from `DESIGN.md` (Task 3).
- Produces:
  - `contrastRatio(foreground: string, background: string): number` for `#rrggbb` hex colors.
  - `Tokens` Zod schema and `type Tokens`, `tokens: Tokens`, `toCssVariables(tokens: Tokens, mode: "survey" | "student", scheme: "light" | "dark"): Record<string, string>` returning CSS custom properties named `--color-<name>`, `--space-<name>`, `--radius-<name>`, `--font-<name>`, `--size-<name>`, `--duration-<name>`.

- [ ] **Step 1: Write the failing tests**

`packages/ui-logic/test/tokens.test.ts`:

```ts
import { expect, test } from "bun:test";
import { Tokens, contrastRatio, toCssVariables, tokens } from "../src/index.ts";

test("contrast ratio matches known WCAG values", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
});

test("tokens match the schema", () => {
  expect(Tokens.safeParse(tokens).success).toBe(true);
});

test("tap target is at least 44px", () => {
  expect(tokens.size.tapTarget).toBeGreaterThanOrEqual(44);
});

for (const mode of ["survey", "student"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${mode} ${scheme}: text meets WCAG AA`, () => {
      const c = tokens.color[mode][scheme];
      expect(contrastRatio(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.textMuted, c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
    });

    test(`${mode} ${scheme}: css variables cover every color token`, () => {
      const vars = toCssVariables(tokens, mode, scheme);
      for (const name of Object.keys(tokens.color[mode][scheme])) {
        expect(vars[`--color-${name}`]).toBeDefined();
      }
      expect(vars["--size-tapTarget"]).toBe(`${tokens.size.tapTarget}px`);
    });
  }
}

test("survey mode text is high contrast for sunlight", () => {
  const c = tokens.color.survey.light;
  expect(contrastRatio(c.text, c.background)).toBeGreaterThanOrEqual(7);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ui-logic/test/tokens.test.ts`
Expected: FAIL, `contrastRatio` and `tokens` are not exported.

- [ ] **Step 3: Implement `contrast.ts`**

```ts
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`expected #rrggbb, got ${hex}`);
  const [, r = "00", g = "00", b = "00"] = match;
  return (
    0.2126 * channel(Number.parseInt(r, 16)) +
    0.7152 * channel(Number.parseInt(g, 16)) +
    0.0722 * channel(Number.parseInt(b, 16))
  );
}

/** WCAG 2 contrast ratio between two #rrggbb colors, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Implement `tokens.ts`**

Transcribe values from `DESIGN.md`. The schema below is fixed; the values come from `DESIGN.md`. Colors must be `#rrggbb` (convert OKLCH from `DESIGN.md` to hex and keep the OKLCH value in a comment). If `DESIGN.md` defines more color roles than the required ones, add them to every mode and scheme object; the schema allows extra string keys.

```ts
import { z } from "zod";

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);

const Palette = z
  .object({
    background: Hex,
    surface: Hex,
    text: Hex,
    textMuted: Hex,
    border: Hex,
    accent: Hex,
    onAccent: Hex,
    success: Hex,
    warning: Hex,
    danger: Hex,
    focus: Hex,
  })
  .catchall(Hex);

const Scheme = z.object({ light: Palette, dark: Palette });

export const Tokens = z.object({
  color: z.object({ survey: Scheme, student: Scheme }),
  font: z.object({ body: z.string().min(1), display: z.string().min(1), mono: z.string().min(1) }),
  fontSize: z.record(z.string(), z.number().positive()),
  lineHeight: z.record(z.string(), z.number().positive()),
  space: z.record(z.string(), z.number().nonnegative()),
  radius: z.record(z.string(), z.number().nonnegative()),
  size: z.object({ tapTarget: z.number().min(44) }).catchall(z.number().positive()),
  duration: z.record(z.string(), z.number().nonnegative()),
  easing: z.record(z.string(), z.string().min(1)),
});
export type Tokens = z.infer<typeof Tokens>;

/** Values transcribed from DESIGN.md. Change DESIGN.md first, then this file. */
export const tokens: Tokens = {
  // Fill every field from DESIGN.md. Example shape for one palette:
  // color: { survey: { light: { background: "#ffffff", ... }, dark: { ... } }, student: { ... } },
  ...({} as Tokens),
};

export function toCssVariables(
  t: Tokens,
  mode: "survey" | "student",
  scheme: "light" | "dark",
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(t.color[mode][scheme])) vars[`--color-${name}`] = value;
  for (const [name, value] of Object.entries(t.font)) vars[`--font-${name}`] = value;
  for (const [name, value] of Object.entries(t.fontSize)) vars[`--fontSize-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.lineHeight)) vars[`--lineHeight-${name}`] = String(value);
  for (const [name, value] of Object.entries(t.space)) vars[`--space-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.size)) vars[`--size-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.duration)) vars[`--duration-${name}`] = `${value}ms`;
  for (const [name, value] of Object.entries(t.easing)) vars[`--easing-${name}`] = value;
  return vars;
}
```

The `...({} as Tokens)` line exists only so this plan text typechecks before transcription; the implementer must replace it with the full literal object from `DESIGN.md` and remove the cast. The task is not done while the cast remains (the schema test fails on an empty object).

- [ ] **Step 5: Export and run tests**

Add to `packages/ui-logic/src/index.ts`:

```ts
export * from "./contrast.ts";
export * from "./tokens.ts";
```

Run: `bun test packages/ui-logic && bun run typecheck && bun run lint`
Expected: PASS. If a contrast assertion fails, the token values do not meet the bar: go back to `DESIGN.md`, adjust the color with the project owner, update both files, rerun.

- [ ] **Step 6: Confirm no placeholder cast remains**

Run: `grep -n "as Tokens" packages/ui-logic/src/tokens.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-logic/src/contrast.ts packages/ui-logic/src/tokens.ts packages/ui-logic/src/index.ts packages/ui-logic/test/tokens.test.ts
git commit -m "feat(ui-logic): add design tokens and contrast checks"
```

---

### Task 5: Hand off to plan D

**Files:**
- Modify: `docs/superpowers/plans/2026-10-04-surveyor-2a-index.md`

- [ ] **Step 1: Mark the design track done in the index**

Under "Execution order", append: `Design track complete: DESIGN.md, docs/design/surveyor-journey.md, docs/design/surveyor-copy.md, packages/ui-logic/src/tokens.ts. Plan D can be written.`

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-10-04-surveyor-2a-index.md
git commit -m "docs: mark surveyor design track complete"
```

Then write plan D (`docs/superpowers/plans/2026-10-04-surveyor-2a-web.md`) with superpowers:writing-plans, using the journey, copy deck, `DESIGN.md`, tokens, and plan B's client logic as inputs.
