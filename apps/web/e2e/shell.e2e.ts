import { expect, pinClock, signIn, test } from "./fixtures.ts";

test("an invite link signs this phone in and lands on the spot list", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
  // The server seeds published spots, so the oldest-checks list has a row with its date.
  const oldest = page.getByRole("region", { name: "Oldest checks" });
  const rows = oldest.getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText(/Last checked [A-Z][a-z]{2} \d{1,2}/);
});

test("at 360 px nothing scrolls sideways and the postmark stays on screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const mark = await page.getByRole("button", { name: "Offline" }).boundingBox();
  expect(mark).not.toBeNull();
  expect(mark?.x).toBeGreaterThanOrEqual(0);
  expect((mark?.x ?? 0) + (mark?.width ?? 0)).toBeLessThanOrEqual(360);
  await page.context().setOffline(false);
});

test("an iPhone browser tab shows the open-in-the-app note", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await pinClock(page);
  await page.goto(`/invite/${"c".repeat(43)}`);
  await expect(page.getByText("On an iPhone?")).toBeVisible();
  await context.close();
});

test("dark mode and reduced motion keep the header band apart from the page", async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await pinClock(page);
  await signIn(page);
  const [band, body] = await page.evaluate(() => [
    getComputedStyle(document.querySelector(".band") ?? document.body).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ]);
  expect(band).not.toBe(body);
  const transition = await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.className = "btn btn--primary";
    document.body.append(probe);
    const duration = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return duration;
  });
  expect(transition).toBe("0s");
  await context.close();
});
