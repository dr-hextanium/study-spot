import { expect, test } from "vitest";
import browse from "../src/screens/student/browse.css?raw";
import spotPage from "../src/screens/student/spotPage.css?raw";

/**
 * Student screen styles size things with the tokens. The px left are the shared
 * stylesheet's conventions: 1px hairlines, the 2px focus ring and its offset, and the
 * estimate bars' 2px stripe pattern.
 */
const ALLOWED = [
  /border(-top|-bottom)?: 1px (solid|dashed) var\(--color-[a-z]+\);/,
  /outline: 2px solid var\(--color-red\);/,
  /outline-offset: 2px;/,
  /repeating-linear-gradient\(135deg, var\(--bar\) 0 2px, transparent 2px 5px\)/,
];

for (const [name, css] of [
  ["browse.css", browse],
  ["spotPage.css", spotPage],
] as const) {
  test(`${name} uses tokens, not raw px`, () => {
    const raw = css
      .split("\n")
      .filter((line) => /\d+px/.test(line) && !line.trim().startsWith("/*"))
      .filter((line) => !ALLOWED.some((re) => re.test(line)));
    expect(raw).toEqual([]);
  });
}
