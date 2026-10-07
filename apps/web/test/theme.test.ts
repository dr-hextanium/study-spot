import { tokens } from "@study-spot/ui-logic";
import { expect, test } from "vitest";
import { installTheme, themeCss } from "../src/ui/theme.ts";

test("survey light is the default and dark follows the system", () => {
  const css = themeCss(tokens);
  expect(css).toContain(`--color-background: ${tokens.color.survey.light.background};`);
  expect(css).toContain("@media (prefers-color-scheme: dark)");
  expect(css).toContain(`--color-shell: ${tokens.color.survey.dark.shell};`);
  expect(css).toContain("--radius-control: 4px;");
  expect(css).toContain("--duration-stamp: 160ms;");
  expect(css).not.toContain(tokens.color.student.light.accent);
});

test("the token stylesheet is installed once", () => {
  installTheme(tokens);
  installTheme(tokens);
  expect(document.querySelectorAll("style#perch-tokens")).toHaveLength(1);
});
