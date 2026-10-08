import { expect, test } from "./fixtures.ts";

const bg = () => getComputedStyle(document.body).backgroundColor;

test("a stored dark theme paints dark before the app script runs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("perch.theme", "dark"));
  let release = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(/\/assets\/index-[^/]*\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/survey", { waitUntil: "commit" });
  await expect.poll(() => page.evaluate(bg)).toBe("rgb(21, 19, 19)");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  release();
});

test("with nothing stored, a dark OS still gets the light default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/survey");
  await expect.poll(() => page.evaluate(bg)).toBe("rgb(251, 250, 249)");
});
