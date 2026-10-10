import type { Page } from "@playwright/test";
import { API_ORIGIN } from "../playwright.config.ts";
import { expect, test } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

/** Waits until the service worker controls the page (reloading once if it only just installed). */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  await expect
    .poll(controlled, { timeout: 5_000 })
    .toBe(true)
    .catch(async () => {
      await page.reload();
      await expect.poll(controlled, { timeout: 10_000 }).toBe(true);
    });
}

test("a spot page from a pick: honest labels, offline after one visit, no API traffic", async ({
  page,
  context,
}) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(API_ORIGIN)) apiCalls.push(r.url());
  });
  // Home arrives in its own phase; the spot page is opened the way a pick card links to it.
  await page.goto("/spot/central-reading-room?via=pick");
  await expect(page).toHaveURL(/\/spot\/[a-z0-9-]+\?via=pick$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Checked [A-Z][a-z]{2} \d+/).first()).toBeVisible();
  await expect(page.getByText(/not live\.$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(page.getByText(/Spot data CC BY-SA 4\.0/)).toBeVisible();

  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/not live\.$/)).toBeVisible();
  await context.setOffline(false);

  await expectRoutesClean(page, ["/spot/central-reading-room"]);
  expect(apiCalls).toEqual([]);
});
