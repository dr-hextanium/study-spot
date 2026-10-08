import AxeBuilder from "@axe-core/playwright";
import { expect, signIn, test } from "./fixtures.ts";
import { layoutProblems, WIDTHS } from "./layout.ts";

/** Converted routes; each redesign task adds its own. */
const ROUTES: string[] = [];

test("converted screens, light and dark: no overflow, no clipped text, 44 px hit areas, axe clean", async ({
  page,
}) => {
  await signIn(page);
  for (const theme of ["light", "dark"] as const) {
    // The boot script reads this on every load, so each goto below paints in this theme.
    await page.evaluate((t) => localStorage.setItem("perch.theme", t), theme);
    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const where = `${route} @${width} ${theme}`;
        expect(await layoutProblems(page), where).toEqual([]);
        const axe = await new AxeBuilder({ page }).analyze();
        expect(
          axe.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`,
          ),
          where,
        ).toEqual([]);
      }
    }
  }
});
