import { expect, test } from "bun:test";
import { readThemePref, resolveScheme, THEME_PREF } from "../src/index.ts";

test("a stored pref is read through the schema; anything else is light", () => {
  expect(THEME_PREF).toEqual(["light", "dark", "system"]);
  expect(readThemePref("dark")).toBe("dark");
  expect(readThemePref("system")).toBe("system");
  for (const raw of [null, undefined, "", "Dark", "blue", 1])
    expect(readThemePref(raw)).toBe("light");
});

test("system follows the OS; light and dark ignore it", () => {
  expect(resolveScheme("system", true)).toBe("dark");
  expect(resolveScheme("system", false)).toBe("light");
  expect(resolveScheme("light", true)).toBe("light");
  expect(resolveScheme("dark", false)).toBe("dark");
});
