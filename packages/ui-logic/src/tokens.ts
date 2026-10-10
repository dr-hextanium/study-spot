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
 * Seawolf (decision 20): four colors and oklab mixes of them. DESIGN.md records
 * these values as built; change both together. Status is icon plus red, never another hue. Scrims and shadows are
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
    mono: '"Chivo Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
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
  /**
   * The 4 px scale, plus named roles: the page gutter, the space above a group
   * heading and below it, the padding of a field in an editor, and of a sheet.
   */
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    gutter: 24,
    group: 32,
    heading: 8,
    field: 20,
    sheet: 20,
  },
  radius: { s: 8, m: 12, l: 20, sheet: 22, pill: 999 },
  size: {
    tapTarget: 44,
    bar: 52,
    /** Reserved under the content for the pinned action bar, not its drawn height. */
    actionBar: 92,
    updateCard: 72,
    row: 56,
    rowCompact: 48,
    control: 46,
    thumb: 40,
    tag: 36,
    choice: 48,
    column: 680,
  },
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
  for (const [name, value] of Object.entries(t.lineHeight))
    vars[`--lineHeight-${name}`] = String(value);
  for (const [name, value] of Object.entries(t.space)) vars[`--space-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.size)) vars[`--size-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.duration)) vars[`--duration-${name}`] = `${value}ms`;
  for (const [name, value] of Object.entries(t.easing)) vars[`--easing-${name}`] = value;
  for (const [name, value] of Object.entries(t.press)) vars[`--press-${name}`] = String(value);
  return vars;
}
