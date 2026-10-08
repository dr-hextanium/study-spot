import { tokens } from "@study-spot/ui-logic";
import { draftSpot, tokenOf } from "./api.ts";
import { expect, pinClock, signIn, test } from "./fixtures.ts";

/** "#151313" as the computed-style form "rgb(21, 19, 19)". */
function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
}

test("an invite link signs this phone in and lands on the spot list", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  await page.getByRole("button", { name: /^Needs you/ }).click();
  await expect(page.getByRole("region", { name: "Needs you" })).toBeVisible();
  await page.getByRole("button", { name: /^All \d/ }).click();
  // The server seeds published spots, so the list has a row with its check date on the right.
  const all = page.getByRole("region", { name: "All" });
  const dated = all.getByRole("listitem").filter({ hasText: /[A-Z][a-z]{2} \d{1,2}/ });
  await expect(dated.first()).toBeVisible();
});

test("at 360 px nothing scrolls sideways and the sync status stays on screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  // The chips' 44 px hit areas must not make the row scroll vertically.
  const chips = await page.locator(".chips").evaluate((e) => e.scrollHeight - e.clientHeight);
  expect(chips).toBe(0);
  const mark = await page
    .locator(".actionbar")
    .getByRole("button", { name: "Offline" })
    .boundingBox();
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

test("dark mode and reduced motion paint the shell in dark paper", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("perch.theme", "dark"));
  await pinClock(page);
  await signIn(page);
  // Home is on the Seawolf shell: no ink band. Dark paper behind, a paper action bar, light ink on top.
  await expect(page.locator(".actionbar")).toBeVisible();
  await expect(page.locator(".large-title")).toBeVisible();
  const bar = await page.locator(".actionbar").evaluate((e) => getComputedStyle(e).backgroundColor);
  const ink = await page.locator(".large-title").evaluate((e) => getComputedStyle(e).color);
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(body).toBe(rgb(tokens.color.dark.paper));
  expect(bar).toBe(body);
  expect(ink).toBe(rgb(tokens.color.dark.ink));
  const transition = await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.className = "btn btn--primary";
    document.body.append(probe);
    const duration = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return duration;
  });
  // Reduced motion keeps color and opacity fades, at 80 ms (decision 20).
  expect(transition).toBe("0.08s");
  await context.close();
});

test("the blocked overview's action bar stays small, and its sheet lists every blocker as a 44 px link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page);
  const spot = await draftSpot(await tokenOf(page), `Blocked ${Date.now()}`);
  await page.goto(`/survey/spots/${spot.id}`);
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  const bar = page.getByRole("contentinfo");
  const barBox = await bar.boundingBox();
  expect(barBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(667 * 0.3);
  // Publish is not disabled (it stays focusable and says why) but it does not publish.
  const publish = bar.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toHaveAttribute("aria-disabled", "true");
  await expect(publish).toHaveAccessibleDescription(/Can't publish yet: \d+ missing/);
  // aria-disabled is not "enabled" to Playwright's click, so press it the way a keyboard does.
  await publish.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Can't publish yet" });
  await expect(sheet).toBeVisible();
  const links = sheet.getByRole("link");
  expect(await links.count()).toBeGreaterThan(4);
  // Every blocker is still reachable: scroll to the last one, then it is a 44 px tap target.
  const last = links.last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  expect(lastBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const sheetBox = await sheet.boundingBox();
  expect(lastBox?.y ?? 0).toBeGreaterThanOrEqual(sheetBox?.y ?? 0);
  expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
    (sheetBox?.y ?? 0) + (sheetBox?.height ?? 0),
  );
});
