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

test("the update prompt and the failed reason box are readable in both schemes", () => {
  for (const { p } of schemes) {
    // Update card: paper text on ink, and the Reload button (paper 14% over ink).
    expect(contrastRatio(p.paper, p.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.paper, mixOklab(p.paper, p.ink, 14))).toBeGreaterThanOrEqual(4.5);
    // Failed sheet reason: ink text on the red tint.
    expect(contrastRatio(p.ink, mix(p, "redTint"))).toBeGreaterThanOrEqual(4.5);
  }
});

test("the mono face is self-hosted Chivo Mono, falling back to the system mono stack", () => {
  expect(tokens.font.mono.startsWith('"Chivo Mono Variable", ')).toBe(true);
  expect(tokens.font.mono).toContain("ui-monospace");
});
