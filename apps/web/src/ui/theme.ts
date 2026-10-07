import { type Tokens, toCssVariables } from "@study-spot/ui-logic";

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/**
 * Survey mode CSS variables from the token source: light by default, dark when
 * the system asks for it. The only place colors enter the stylesheet.
 */
export function themeCss(t: Tokens): string {
  const light = toCssVariables(t, "survey", "light");
  const dark = toCssVariables(t, "survey", "dark");
  return [
    block(":root", { ...light, "color-scheme": "light dark" }),
    `@media (prefers-color-scheme: dark) {\n${block(":root", dark)}\n}`,
  ].join("\n");
}

/** Adds the token stylesheet once, before the app renders. */
export function installTheme(t: Tokens, doc: Document = document): void {
  const id = "perch-tokens";
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = themeCss(t);
  doc.head.prepend(style);
}
