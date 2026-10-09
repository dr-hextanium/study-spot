import { draftSpot, tokenOf } from "./api.ts";
import { expect, signIn, test } from "./fixtures.ts";

const scrollY = (page: import("@playwright/test").Page) => page.evaluate(() => window.scrollY);

/**
 * Scrolls and resolves once the document's scroll event has run. The router records which
 * element scrolled from a capture listener on the document, and a listener without capture
 * on the same target runs after it, so the router has seen the scroll when this resolves.
 * (Its saved positions only reach sessionStorage on pagehide, so there is nothing to poll.)
 */
const scrollAndSettle = (page: import("@playwright/test").Page, y: number) =>
  page.evaluate(
    (top) =>
      new Promise<void>((resolve) => {
        document.addEventListener("scroll", () => resolve(), { once: true });
        window.scrollTo(0, top);
      }),
    y,
  );

test("back from an editor returns the overview to where it was; editors open at the top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await signIn(page);
  const spot = await draftSpot(await tokenOf(page), "Scroll check");
  await page.goto(`/survey/spots/${spot.id}`);
  await expect(page.getByRole("heading", { name: "Scroll check", level: 1 })).toBeVisible();
  await scrollAndSettle(page, 300);
  await expect.poll(() => scrollY(page)).toBe(300);
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
  await scrollAndSettle(page, 400);
  await expect.poll(() => scrollY(page)).toBe(400);
  // The row can sit under the pinned action bar at this scroll; a pointer click would
  // scroll it into view first and change the position under test, so click by script.
  await list
    .getByRole("link", { name: /Scroll draft 10/ })
    .evaluate((a) => (a as HTMLAnchorElement).click());
  await expect(page.getByRole("heading", { name: "Scroll draft 10", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: /^Drafts/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => Math.abs((await scrollY(page)) - 400)).toBeLessThanOrEqual(2);
});

test("a path change cross-fades as a typed route transition; a spot not here yet shows its skeleton", async ({
  page,
}) => {
  // Record each view transition the router starts, and its types.
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: string[][] };
    w.__vt = [];
    const start = document.startViewTransition?.bind(document);
    if (start === undefined) return;
    document.startViewTransition = ((
      arg: ViewTransitionUpdateCallback | StartViewTransitionOptions,
    ) => {
      w.__vt.push(typeof arg === "function" ? [] : [...(arg.types ?? [])]);
      return start(arg);
    }) as typeof document.startViewTransition;
  });
  await signIn(page);
  const spot = await draftSpot(await tokenOf(page), "Transition check");
  await page.reload();
  // Hold the spot's own read so the overview has to wait for it.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/survey/spots/${spot.id}`, async (route) => {
    await held;
    await route.continue();
  });
  await page
    .locator("ul.row-list")
    .getByRole("link", { name: /Transition check/ })
    .click();
  await expect(page.locator('main [aria-busy="true"]')).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Loading" })).toHaveCount(1);
  release();
  await expect(page.getByRole("heading", { name: "Transition check", level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const vt = await page.evaluate(() => (window as unknown as { __vt: string[][] }).__vt);
  expect(vt).toContainEqual(["route"]);
});

/** The top of the first match inside main, in page coordinates. */
const topOf = (page: import("@playwright/test").Page, selector: string) =>
  page
    .locator(`main ${selector}`)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

test("skeletons sit where the real screen lands: overview rows and editor fields at 375", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page);
  const token = await tokenOf(page);
  const spot = await draftSpot(token, "Skeleton fit");
  await page.reload();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/survey/spots/${spot.id}`, async (route) => {
    await held;
    await route.continue();
  });
  await page
    .locator("ul.row-list")
    .getByRole("link", { name: /Skeleton fit/ })
    .click();
  await expect(page.locator('main [aria-busy="true"]')).toBeVisible();
  const skelRow = await topOf(page, ".row");
  release();
  await expect(page.getByRole("heading", { name: "Skeleton fit", level: 1 })).toBeVisible();
  expect(Math.abs((await topOf(page, ".row")) - skelRow)).toBeLessThanOrEqual(2);

  const other = await draftSpot(token, "Skeleton fit editor");
  let releaseEditor: () => void = () => undefined;
  const heldEditor = new Promise<void>((resolve) => {
    releaseEditor = resolve;
  });
  await page.route(`**/survey/spots/${other.id}`, async (route) => {
    await heldEditor;
    await route.continue();
  });
  await page.goto(`/survey/spots/${other.id}/seating`);
  await expect(page.locator('main [aria-busy="true"]')).toBeVisible();
  const skelField = await topOf(page, ".field");
  releaseEditor();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  expect(Math.abs((await topOf(page, ".field")) - skelField)).toBeLessThanOrEqual(2);
});
