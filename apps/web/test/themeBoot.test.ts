import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokens } from "@perch/ui-logic";
import { afterEach, expect, test, vi } from "vitest";
import { applyThemePref, storeThemePref, watchSystemTheme } from "../src/ui/themePref.ts";

const html = readFileSync(join(import.meta.dirname, "../index.html"), "utf8");
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
    applyThemePref(
      stored === "dark" || stored === "system" ? stored : "light",
      document,
      systemDark,
    );
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

test("the OS listener moves theme-color in system mode without any component mounted", () => {
  let fire: () => void = () => undefined;
  const mq = {
    matches: false,
    addEventListener: (_: string, l: () => void) => {
      fire = l;
    },
    removeEventListener: () => undefined,
  };
  page(false);
  vi.stubGlobal("matchMedia", () => mq);
  localStorage.setItem("perch.theme", "system");
  const stop = watchSystemTheme();
  mq.matches = true;
  fire();
  expect(meta("theme-color")?.toUpperCase()).toBe(tokens.color.dark.paper.toUpperCase());
  localStorage.setItem("perch.theme", "light");
  mq.matches = false;
  fire();
  expect(meta("theme-color")?.toUpperCase()).toBe(tokens.color.dark.paper.toUpperCase());
  stop();
});
