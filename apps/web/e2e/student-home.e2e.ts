import type { BrowserContext } from "@playwright/test";
import { API_ORIGIN, DATA_ORIGIN } from "../playwright.config.ts";
import { expect, pinClock, test, waitForServiceWorker } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

/**
 * Every request to the API origin, from the page or its service worker (the context sees
 * both). Student Home must make none.
 */
function apiRequests(context: BrowserContext): string[] {
  const calls: string[] = [];
  context.on("request", (r) => {
    if (r.url().startsWith(API_ORIGIN)) calls.push(r.url());
  });
  return calls;
}

test("quick pick from the seed bundle, offline after one visit, no API traffic", async ({
  page,
  context,
}) => {
  const apiCalls = apiRequests(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find a spot", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(page.getByText(/typical|estimate|No busyness data/).first()).toBeVisible();
  await expect(page.getByText("Spots updated today")).toBeVisible();
  await expect(page.getByText(/\blive\b/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(page.getByText("Surprise pick")).toBeVisible();
  await page.getByRole("button", { name: "Something else" }).click();
  expect(apiCalls).toEqual([]);

  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(page.getByText("Offline. Using spots saved on this phone.")).toBeVisible();
  await context.setOffline(false);
  await expectRoutesClean(page, ["/"]);
  expect(apiCalls).toEqual([]);
});

test("first open offline with nothing cached says so", async ({ browser }) => {
  // A fresh context has no cached bundle; block only the data site before the first load.
  const context = await browser.newContext();
  const page = await context.newPage();
  await pinClock(page);
  await page.route(`${DATA_ORIGIN}/**`, (r) => r.abort());
  await page.goto("/");
  await expect(
    page.getByText("Can't load spots offline yet. Open once with signal."),
  ).toBeVisible();
  await context.close();
});

test("on a 375 by 667 phone the pick's name and busyness show without scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const busy = page.locator(".pick-card__busy");
  // Fresh storage: the access note and the data age line are both on screen.
  await expect(page.getByText("In campus housing or a grad student? Set your access.")).toHaveCount(
    1,
  );
  const aboveTabBar = async () => {
    await expect(busy).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    const box = await page.evaluate(() => {
      const name = document.querySelector(".pick-card__name")?.getBoundingClientRect();
      const line = document.querySelector(".pick-card__busy")?.getBoundingClientRect();
      const bar = document.querySelector(".tabbar")?.getBoundingClientRect();
      return { name: name?.top ?? -1, busy: line?.bottom ?? -1, bar: bar?.top ?? -1 };
    });
    expect(box.name).toBeGreaterThan(0);
    expect(box.bar).toBeGreaterThan(0);
    expect(box.busy).toBeLessThanOrEqual(box.bar);
  };
  await aboveTabBar();
  // A group preset adds People, and the card still starts above the fold.
  await page
    .getByRole("group", { name: "What for" })
    .getByRole("button", { name: "Group" })
    .click();
  await expect(page.getByRole("group", { name: "People" })).toBeVisible();
  await aboveTabBar();
});
