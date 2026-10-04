import { z } from "zod";

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);

const Palette = z
  .object({
    background: Hex,
    surface: Hex,
    text: Hex,
    textMuted: Hex,
    border: Hex,
    borderStrong: Hex,
    accent: Hex,
    onAccent: Hex,
    success: Hex,
    warning: Hex,
    danger: Hex,
    focus: Hex,
    onSuccess: Hex,
    onWarning: Hex,
    onDanger: Hex,
    shell: Hex,
    onShell: Hex,
    focusOnShell: Hex,
    airmail: Hex,
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
  size: z
    .object({
      tapTarget: z.number().min(44),
      header: z.number().positive(),
      line: z.number().positive(),
    })
    .catchall(z.number().positive()),
  duration: z.record(z.string(), z.number().nonnegative()),
  easing: z.record(z.string(), z.string().min(1)),
});
export type Tokens = z.infer<typeof Tokens>;

/**
 * The Divided Back: Perch's postcard world. Source of truth for tokens until
 * DESIGN.md is written from the built screens; change both together after that.
 * accent is ballpoint blue (entered values), danger is stamp red, shell is the
 * printed header band. border is a decorative ruled line; borderStrong outlines
 * controls (3:1 minimum). Content on the shell uses onShell and focusOnShell only;
 * status colors never sit on the shell. Student palettes are provisional until
 * student mode is designed (build step 5).
 */
export const tokens: Tokens = {
  color: {
    survey: {
      light: {
        background: "#ffffff",
        surface: "#f4f3ee",
        text: "#16181d",
        textMuted: "#4a4d55",
        border: "#c9c6bb",
        borderStrong: "#7d7a70",
        accent: "#1f3fbf",
        onAccent: "#ffffff",
        success: "#1d6b3a",
        warning: "#8a5a00",
        danger: "#a01c25",
        focus: "#1f3fbf",
        airmail: "#1f3fbf",
        shell: "#16181d",
        onShell: "#ffffff",
        onSuccess: "#ffffff",
        onWarning: "#ffffff",
        onDanger: "#ffffff",
        focusOnShell: "#9fb2ff",
      },
      dark: {
        background: "#121316",
        surface: "#1b1d22",
        text: "#f2f1ec",
        textMuted: "#b7b5ad",
        border: "#3a3c42",
        borderStrong: "#7a7d86",
        accent: "#9fb2ff",
        onAccent: "#0b0f2a",
        success: "#6fd39a",
        warning: "#f0c060",
        danger: "#ff8a8f",
        focus: "#9fb2ff",
        airmail: "#9fb2ff",
        shell: "#000000",
        onShell: "#f2f1ec",
        onSuccess: "#0b0d10",
        onWarning: "#0b0d10",
        onDanger: "#0b0d10",
        focusOnShell: "#b8c6ff",
      },
    },
    student: {
      light: {
        background: "#ffffff",
        surface: "#eef1f7",
        text: "#16181d",
        textMuted: "#4a4d55",
        border: "#c9cfdc",
        borderStrong: "#737a8c",
        accent: "#b3202a",
        onAccent: "#ffffff",
        success: "#1d6b3a",
        warning: "#8a5a00",
        danger: "#a01c25",
        focus: "#1f3fbf",
        airmail: "#1f3fbf",
        shell: "#16181d",
        onShell: "#ffffff",
        onSuccess: "#ffffff",
        onWarning: "#ffffff",
        onDanger: "#ffffff",
        focusOnShell: "#9fb2ff",
      },
      dark: {
        background: "#121316",
        surface: "#1a1e27",
        text: "#f2f1ec",
        textMuted: "#b7b5ad",
        border: "#3a4050",
        borderStrong: "#7a8296",
        accent: "#ff8a8f",
        onAccent: "#2a0709",
        success: "#6fd39a",
        warning: "#f0c060",
        danger: "#ff8a8f",
        focus: "#9fb2ff",
        airmail: "#9fb2ff",
        shell: "#000000",
        onShell: "#f2f1ec",
        onSuccess: "#0b0d10",
        onWarning: "#0b0d10",
        onDanger: "#0b0d10",
        focusOnShell: "#b8c6ff",
      },
    },
  },
  font: {
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    display: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  fontSize: { label: 13, small: 14, body: 16, title: 20, heading: 24, display: 32 },
  lineHeight: { tight: 1.15, body: 1.45 },
  space: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, line: 44 },
  radius: { none: 0, card: 4, control: 6, pill: 999 },
  size: { tapTarget: 44, line: 44, header: 48, postmark: 36, rule: 1 },
  duration: { fast: 120, stamp: 160, base: 200, slow: 320 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    stamp: "cubic-bezier(0.3, 1.4, 0.5, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
};

export function toCssVariables(
  t: Tokens,
  mode: "survey" | "student",
  scheme: "light" | "dark",
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(t.color[mode][scheme]))
    vars[`--color-${name}`] = value;
  for (const [name, value] of Object.entries(t.font)) vars[`--font-${name}`] = value;
  for (const [name, value] of Object.entries(t.fontSize)) vars[`--fontSize-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.lineHeight))
    vars[`--lineHeight-${name}`] = String(value);
  for (const [name, value] of Object.entries(t.space)) vars[`--space-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.size)) vars[`--size-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(t.duration)) vars[`--duration-${name}`] = `${value}ms`;
  for (const [name, value] of Object.entries(t.easing)) vars[`--easing-${name}`] = value;
  return vars;
}
