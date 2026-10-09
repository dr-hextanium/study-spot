import { expect, nextInvite, signIn, test } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

test("new spot: light and dark, three widths, clean", async ({ page }) => {
  await signIn(page);
  await expectRoutesClean(page, ["/survey/spots/new"]);
});

test("invite, a fresh link without signing in: light and dark, three widths, clean", async ({
  page,
}) => {
  // Opening a link never accepts it, so the same link can be loaded in every pass.
  const url = new URL(nextInvite());
  await page.goto(`${url.pathname}${url.search}`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expectRoutesClean(page, [`${url.pathname}${url.search}`, `/invite/${"a".repeat(8)}`]);
});

test("signed out and not found: light and dark, three widths, clean", async ({ page }) => {
  await page.goto("/survey");
  await expect(page.getByRole("heading", { name: "Sign in again", level: 1 })).toBeVisible();
  await expectRoutesClean(page, ["/survey", "/survey/spots/new", "/nope"]);
  await page.goto("/nope");
  await page.getByRole("link", { name: "Back to spots" }).click();
  await expect(page).toHaveURL(/\/survey$/);
});
