import type { Page } from "@playwright/test";
import { API_ORIGIN } from "../playwright.config.ts";
import { expect, test } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

// WebGL in headless Chromium needs the software renderer (top level: it forces a new worker).
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

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

test.describe("map", () => {
  // Tests never reach the real tile server: a bare style with one attributed source.
  const STYLE = {
    version: 8,
    sources: {
      osm: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        attribution: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    // A source's attribution shows only while a layer uses it.
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#ECE8E6" } },
      { id: "area", type: "fill", source: "osm", paint: { "fill-color": "#FBFAF9" } },
    ],
  };

  async function stubTiles(page: Page): Promise<string[]> {
    const tileCalls: string[] = [];
    await page.route("https://tiles.openfreemap.org/**", (route) => {
      tileCalls.push(route.request().url());
      return route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(STYLE),
      });
    });
    return tileCalls;
  }

  test("the map loads on demand, pins match the rows, and attribution shows", async ({ page }) => {
    const tileCalls = await stubTiles(page);
    const chunkCalls: string[] = [];
    page.on("request", (r) => {
      if (/MapView-/.test(r.url())) chunkCalls.push(r.url());
    });
    await page.goto("/browse");
    await expect(page.getByRole("link", { name: /Central Reading Room/ })).toBeVisible();
    const rows = await page.locator("main a.row").count();
    expect(rows).toBeGreaterThan(0);
    // The list never pays for the map.
    expect(chunkCalls).toEqual([]);
    expect(tileCalls).toEqual([]);

    await page.getByRole("radio", { name: "Map" }).check();
    await expect(page.locator("button.pin")).toHaveCount(rows);
    expect(chunkCalls.length).toBeGreaterThan(0);
    await expect(page.getByText("OpenStreetMap")).toBeVisible();
    await expect(page.getByText("Typical busyness, not live")).toBeVisible();

    const pin = page.locator("button.pin").first();
    // Mark this exact button: a tap must keep it (no rebuilt markers) and keep the view.
    await pin.evaluate((el) => {
      el.dataset.probe = "kept";
    });
    const before = await pin.boundingBox();
    await pin.click();
    const kept = page.locator('button.pin[data-probe="kept"]');
    await expect(kept).toHaveAttribute("aria-pressed", "true");
    expect(await kept.boundingBox()).toEqual(before);
    // From the keyboard, choosing another pin keeps focus on that pin.
    const second = page.locator("button.pin").nth(1);
    await second.evaluate((el) => {
      el.dataset.probe = "keyed";
    });
    await second.focus();
    await page.keyboard.press("Enter");
    const keyed = page.locator('button.pin[data-probe="keyed"]');
    await expect(keyed).toHaveAttribute("aria-pressed", "true");
    await expect(keyed).toBeFocused();
    expect(await kept.boundingBox()).toEqual(before);
    const open = page.getByRole("link", { name: "Open spot" });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute("href", /\/spot\//);
  });

  test("offline, Map says it needs a connection and the list still works", async ({
    page,
    context,
  }) => {
    await stubTiles(page);
    await page.goto("/browse");
    await expect(page.getByRole("link", { name: /Central Reading Room/ })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("radio", { name: "Map" }).check();
    await expect(
      page.getByText("The map needs a connection. The list works offline."),
    ).toBeVisible();
    await page.getByRole("radio", { name: "List" }).check();
    await expect(page.getByRole("link", { name: /Central Reading Room/ })).toBeVisible();
    await context.setOffline(false);
  });

  test("the map view is clean at every width in both themes", async ({ page }) => {
    await stubTiles(page);
    await page.goto("/browse");
    await page.getByRole("radio", { name: "Map" }).check();
    await expect(page.locator("button.pin").first()).toBeVisible();
    await expectRoutesClean(page, ["/browse"]);
  });
});
