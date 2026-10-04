import { expect, test } from "bun:test";
import { contrastRatio, Tokens, toCssVariables, tokens } from "../src/index.ts";

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

    test(`${mode} ${scheme}: control outlines meet WCAG 1.4.11`, () => {
      const c = tokens.color[mode][scheme];
      expect(contrastRatio(c.borderStrong, c.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.borderStrong, c.surface)).toBeGreaterThanOrEqual(3);
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

const palettes = (["survey", "student"] as const).flatMap((mode) =>
  (["light", "dark"] as const).map((scheme) => ({ mode, scheme, c: tokens.color[mode][scheme] })),
);

test("every palette defines the same color roles", () => {
  const keys = palettes.map(({ c }) => Object.keys(c).sort().join(","));
  expect(new Set(keys).size).toBe(1);
});

test("shell, onShell, and focusOnShell are required roles", () => {
  const first = palettes[0];
  if (!first) throw new Error("no palettes");
  for (const role of ["shell", "onShell", "focusOnShell"] as const) {
    const copy = structuredClone(tokens);
    delete (copy.color.survey.light as Record<string, string>)[role];
    expect(Tokens.safeParse(copy).success).toBe(false);
  }
});

test("size.header is required", () => {
  const copy = structuredClone(tokens) as { size: Record<string, number> };
  delete copy.size.header;
  expect(Tokens.safeParse(copy).success).toBe(false);
});

for (const { mode, scheme, c } of palettes) {
  test(`${mode} ${scheme}: header band content and focus are legible on the shell`, () => {
    expect(contrastRatio(c.onShell, c.shell)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.focusOnShell, c.shell)).toBeGreaterThanOrEqual(3);
  });

  test(`${mode} ${scheme}: focus ring is visible on background and surface`, () => {
    expect(contrastRatio(c.focus, c.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c.focus, c.surface)).toBeGreaterThanOrEqual(3);
  });

  test(`${mode} ${scheme}: status colors work as text and as filled chips`, () => {
    for (const [status, on] of [
      ["success", "onSuccess"],
      ["warning", "onWarning"],
      ["danger", "onDanger"],
    ] as const) {
      expect(contrastRatio(c[status], c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[status], c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[on], c[status])).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test("survey light stamp red meets the 7:1 sunlight bar", () => {
  const c = tokens.color.survey.light;
  expect(contrastRatio(c.danger, c.background)).toBeGreaterThanOrEqual(7);
});
