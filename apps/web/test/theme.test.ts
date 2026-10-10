import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tokens } from "@perch/ui-logic";
import { expect, test } from "vitest";
import { themeCss } from "../src/ui/theme.ts";

const UI = join(import.meta.dirname, "../src/ui");
const SRC = join(import.meta.dirname, "../src");

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
    e.isDirectory()
      ? cssFiles(join(dir, e.name))
      : e.name.endsWith(".css")
        ? [join(dir, e.name)]
        : [],
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : /\.tsx?$/.test(e.name) && e.name !== "routeTree.gen.ts"
        ? [join(dir, e.name)]
        : [],
  );
}

test("no postcard artifacts remain in the web source", () => {
  const files = [...cssFiles(SRC), ...sourceFiles(SRC)];
  const hits = files.filter((f) =>
    /postmark|\bstamp|ruled|airmail|band__|legacy\.css|--color-(shell|accent|surface|background|text\b|textMuted|border\b|borderStrong|success|warning|danger)/i.test(
      readFileSync(f, "utf8"),
    ),
  );
  expect(hits).toEqual([]);
});

test("every var() without a fallback is defined in some stylesheet", () => {
  const files = cssFiles(SRC);
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const defined = new Set([...all.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // A var() with a fallback may be set inline by a component (style={{ "--i": 2 }}).
  const used = new Set([...all.matchAll(/var\((--[A-Za-z0-9-]+)\s*\)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => v !== undefined && !defined.has(v));
  expect(missing).toEqual([]);
});

test("Chivo Mono is self-hosted in latin and latin-ext only, and sets the stepper value", () => {
  const fonts = readFileSync(join(UI, "fonts.css"), "utf8");
  const chivo = [...fonts.matchAll(/url\("(@fontsource-variable\/chivo-mono\/[^"]+)"\)/g)].map(
    (m) => m[1],
  );
  expect(chivo.sort()).toEqual([
    "@fontsource-variable/chivo-mono/files/chivo-mono-latin-ext-wght-normal.woff2",
    "@fontsource-variable/chivo-mono/files/chivo-mono-latin-wght-normal.woff2",
  ]);
  const styles = readFileSync(join(UI, "styles.css"), "utf8");
  const stepper = /\.stepper__input\.input \{([^}]*)\}/.exec(styles)?.[1] ?? "";
  expect(stepper).toContain("font-family: var(--font-mono);");
  expect(stepper).toContain("font-variant-numeric: tabular-nums;");
});
