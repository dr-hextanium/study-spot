import type { Browser, Page } from "@playwright/test";
import { completeSpot, draftSpot, surveyorInvite, tokenOf } from "./api.ts";
import { expect, signIn, test } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

// One test per group of routes, each inside the default timeout: three widths, two themes, axe each.

const LONG_DRAFT = "The Very Long Named Graduate Reading Room on the Second Floor East";

/** A long-named draft: every blocker, a Missing pill per row, truncation on Home. */
async function longDraft(page: Page) {
  return draftSpot(await tokenOf(page), LONG_DRAFT);
}

async function publishedSpot(page: Page) {
  return completeSpot(await tokenOf(page), `Layout Published ${Date.now()}`, { publish: true });
}

/** An admin with a long name, so the Admin pill is tested against a squeezed name. */
async function joinLongNamedAdmin(page: Page, browser: Browser) {
  const joiner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const p = await joiner.newPage();
    await p.goto(await surveyorInvite(await tokenOf(page), "admin"));
    await p
      .getByRole("textbox", { name: "Your name" })
      .fill("Alexandria Bartholomew Montgomery-Featherstonehaugh");
    await p.getByRole("button", { name: "Join" }).click();
    await expect(p.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();
  } finally {
    await joiner.close();
  }
}

test("home, light and dark: clean with a long-named spot", async ({ page }) => {
  await signIn(page);
  await longDraft(page);
  await publishedSpot(page);
  await expectRoutesClean(page, ["/survey"]);
});

test("admin: clean, and the admin badge keeps its whole text on one line", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await joinLongNamedAdmin(page, browser);
  await expectRoutesClean(page, ["/survey/admin"]);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/survey/admin");
    const badge = page.locator(".pill", { hasText: "Admin" }).first();
    await expect(badge).toBeVisible();
    const box = await badge.evaluate((el) => ({
      clipped: el.scrollWidth > el.clientWidth,
      height: el.getBoundingClientRect().height,
      width: el.getBoundingClientRect().width,
    }));
    expect(box.clipped, `badge clipped @${width}`).toBe(false);
    expect(box.width, `badge width @${width}`).toBeGreaterThanOrEqual(48);
    // One 24 px line, not a wrapped badge.
    expect(box.height, `badge height @${width}`).toBe(24);
    // No hairline between the role switch and Create invite link.
    const rule = await page
      .locator('section[aria-labelledby="admin-invite"] > .field')
      .evaluate((el) => getComputedStyle(el).borderBottomWidth);
    expect(rule, `role switch hairline @${width}`).toBe("0px");
  }
});

test("overviews: a long-named draft and a published spot, clean", async ({ page }) => {
  await signIn(page);
  const long = await longDraft(page);
  const published = await publishedSpot(page);
  await expectRoutesClean(page, [`/survey/spots/${long.id}`, `/survey/spots/${published.id}`]);
});

test("editors of a draft with gaps: clean", async ({ page }) => {
  await signIn(page);
  const long = await longDraft(page);
  await expectRoutesClean(
    page,
    ["seating", "identity", "hours"].map((s) => `/survey/spots/${long.id}/${s}`),
  );
});

test("editors of a published spot: clean", async ({ page }) => {
  await signIn(page);
  const published = await publishedSpot(page);
  await expectRoutesClean(
    page,
    ["access", "late_night", "hours", "estimates", "photos"].map(
      (s) => `/survey/spots/${published.id}/${s}`,
    ),
  );
});
