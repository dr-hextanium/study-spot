import AxeBuilder from "@axe-core/playwright";
import { completeSpot, draftSpot, tokenOf } from "./api.ts";
import { expect, signIn, test } from "./fixtures.ts";
import { layoutProblems, WIDTHS } from "./layout.ts";

/** Converted routes; each redesign task adds its own. */
const ROUTES: string[] = ["/survey"];

test("converted screens, light and dark: no overflow, no clipped text, 44 px hit areas, axe clean", async ({
  page,
}) => {
  await signIn(page);
  // A long name so truncation is exercised on Home.
  const token = await tokenOf(page);
  const long = await draftSpot(
    token,
    "The Very Long Named Graduate Reading Room on the Second Floor East",
  );
  const published = await completeSpot(token, `Layout Published ${Date.now()}`, { publish: true });
  // Overviews: a long-named draft (every blocker, a Missing pill per row) and a published spot.
  // Editors: a draft with gaps (Save and next, step bar, tag groups) and a published spot.
  const routes = [
    ...ROUTES,
    `/survey/spots/${long.id}`,
    `/survey/spots/${published.id}`,
    `/survey/spots/${long.id}/seating`,
    // A short name here: a text input holding a long value scrolls by design, which is not clipping.
    `/survey/spots/${published.id}/identity`,
    `/survey/spots/${published.id}/access`,
    `/survey/spots/${published.id}/late_night`,
  ];
  for (const theme of ["light", "dark"] as const) {
    // The boot script reads this on every load, so each goto below paints in this theme.
    await page.evaluate((t) => localStorage.setItem("perch.theme", t), theme);
    for (const route of routes) {
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
