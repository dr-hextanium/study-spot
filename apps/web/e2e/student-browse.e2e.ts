import { API_ORIGIN } from "../playwright.config.ts";
import { expect, test } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

test("browse lists the seed spots by walk, and locked ones stay hidden until asked for", async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(API_ORIGIN)) apiCalls.push(r.url());
  });
  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "Browse", level: 1 })).toBeVisible();
  await expect(page.getByText(/not live\.$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Central Reading Room/ })).toBeVisible();
  await expect(
    page.getByText(/typical|estimate|No busyness data|Usually|No data yet/).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Kelly Quad RCC/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("checkbox", { name: "Show spots I can't use" }).check();
  await page.getByRole("button", { name: "Done" }).click();
  const kelly = page.getByRole("link", { name: /Kelly Quad RCC/ });
  await expect(kelly).toBeVisible();
  await expect(kelly).toContainText("Residents of Kelly Quad only");

  await page.getByRole("link", { name: /Central Reading Room/ }).click();
  await expect(page).toHaveURL(/\/spot\/central-reading-room/);
  expect(apiCalls).toEqual([]);
});

test("browse is clean at every width in both themes", async ({ page }) => {
  await page.goto("/browse");
  await expect(page.getByRole("link", { name: /Central Reading Room/ })).toBeVisible();
  await expectRoutesClean(page, ["/browse"]);
});
