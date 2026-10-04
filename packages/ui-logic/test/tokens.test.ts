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
