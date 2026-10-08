import { draftSpot, tokenOf } from "./api.ts";
import { expect, signIn, test } from "./fixtures.ts";

const scrollY = (page: import("@playwright/test").Page) => page.evaluate(() => window.scrollY);

test("back from an editor returns the overview to where it was; editors open at the top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await signIn(page);
  const spot = await draftSpot(await tokenOf(page), "Scroll check");
  await page.goto(`/survey/spots/${spot.id}`);
  await expect(page.getByRole("heading", { name: "Scroll check", level: 1 })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => scrollY(page)).toBe(300);
  // Let the router record the position (it saves on scroll, throttled).
  await page.waitForTimeout(250);
  // The last row sits under the pinned action at this height, so click it by script.
  await page
    .locator(`a[href="/survey/spots/${spot.id}/late_night"]`)
    .evaluate((a) => (a as HTMLAnchorElement).click());
  await expect(page).toHaveURL(new RegExp(`/survey/spots/${spot.id}/late_night$`));
  await expect.poll(() => scrollY(page)).toBe(0);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(new RegExp(`/survey/spots/${spot.id}$`));
  await expect.poll(async () => Math.abs((await scrollY(page)) - 300)).toBeLessThanOrEqual(2);
});

test("back from a spot returns Home to the same filter and scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await signIn(page);
  const token = await tokenOf(page);
  for (let i = 0; i < 12; i++) await draftSpot(token, `Scroll draft ${String(i).padStart(2, "0")}`);
  await page.reload();
  await page.getByRole("button", { name: /^Drafts/ }).click();
  const list = page.getByRole("region", { name: "Drafts" });
  await expect(list.getByRole("link").nth(11)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY(page)).toBe(400);
  await page.waitForTimeout(250);
  await list.getByRole("link", { name: /Scroll draft 10/ }).click();
  await expect(page.getByRole("heading", { name: "Scroll draft 10", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: /^Drafts/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => Math.abs((await scrollY(page)) - 400)).toBeLessThanOrEqual(2);
});
