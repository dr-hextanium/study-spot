import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBundle } from "@study-spot/core";
import { completeSpot, getSpot, tokenOf } from "./api.ts";
import { expect, serverState, signIn, test } from "./fixtures.ts";
import { bigJpeg } from "./photo.ts";

test("acceptance 2: after Publish now the data site's bundle has the spot and its approved cover", async ({
  page,
}) => {
  await signIn(page);
  const token = await tokenOf(page);
  const spot = await completeSpot(token, `Bundle Check ${Date.now()}`, { publish: true });
  await page.goto(`/survey/spots/${spot.id}/photos`);
  await page.getByTestId("photo-library").setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: await bigJpeg(page, 2000, 1500),
  });
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use as cover" }).click();
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });

  await page.goto("/survey/admin");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Up to date")).toBeVisible({ timeout: 60_000 });

  const dir = serverState().publishDir;
  const pointer = JSON.parse(readFileSync(join(dir, "bundle-latest.json"), "utf8")) as {
    url: string;
  };
  const parsed = parseBundle(JSON.parse(readFileSync(join(dir, pointer.url), "utf8")));
  if (!parsed.ok) throw new Error(parsed.detail);
  const published = parsed.bundle.spots.find((s) => s.id === spot.id);
  expect(published?.official_name).toBe(spot.official_name);
  const cover = (await getSpot(token, spot.id)).photos.find((p) => p.is_cover);
  expect(cover?.url).toMatch(/^http:\/\/data\.localhost:8788\/photos\/[0-9a-f]{64}\.jpg$/);
  expect(JSON.stringify(published)).toContain(cover?.url ?? "missing");
});

test("an admin invites a surveyor, issues a sign-in link that skips the name, and removes access", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.locator(".created-link__url").first().innerText();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const newbie = await phone.newPage();
  await newbie.goto(new URL(link).pathname);
  await newbie.getByRole("textbox", { name: "Your name" }).fill("Jordan Rivera");
  await newbie.getByRole("button", { name: "Join" }).click();
  await expect(newbie.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();

  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: "Jordan Rivera" });
  await row.getByRole("button", { name: "New sign-in link" }).click();
  const relogin = new URL(await page.locator(".created-link__url").last().innerText());
  expect(relogin.search).toBe("?relogin=1");
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const lostPhone = await second.newPage();
  await lostPhone.goto(`${relogin.pathname}${relogin.search}`);
  await expect(lostPhone.getByRole("textbox")).toHaveCount(0);
  await lostPhone.getByRole("button", { name: "Sign in" }).click();
  await expect(lostPhone.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();

  await row.getByRole("button", { name: "Remove access" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByText("Jordan Rivera removed")).toBeVisible();
  await newbie.reload();
  await expect(newbie.getByText("Sign in again")).toBeVisible();
  await phone.close();
  await second.close();
});

test("the app opens offline from the service worker with the cached list and spot", async ({
  page,
}) => {
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Offline Open ${Date.now()}`, {
    publish: true,
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto(`/survey/spots/${spot.id}`);
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  // The persister writes on a throttle: go offline only once the stored snapshot holds the list and this spot's own query.
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ name, id }) =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open("study-spot");
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const db = open.result;
                const all = db.transaction("kv").objectStore("kv").getAll();
                all.onerror = () => {
                  db.close();
                  resolve(false);
                };
                all.onsuccess = () => {
                  db.close();
                  resolve(
                    all.result.some((v) => {
                      if (typeof v !== "string") return false;
                      try {
                        const queries: { queryKey: unknown[] }[] =
                          JSON.parse(v).clientState.queries;
                        return (
                          v.includes(name) &&
                          queries.some((q) => q.queryKey.join("/") === `survey/spot/${id}`)
                        );
                      } catch {
                        return false;
                      }
                    }),
                  );
                };
              };
            }),
          { name: spot.official_name, id: spot.id },
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.context().setOffline(true);
  await page.goto("/survey");
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
  const stale = page.getByRole("region", { name: "Oldest checks" });
  await expect(stale.getByText(spot.official_name)).toBeVisible();
  await stale.getByText(spot.official_name).click();
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  await page.context().setOffline(false);
});

test("a tab closed mid-send leaves its change to the other tab, which sends it", async ({
  page,
  context,
}) => {
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Two Tabs ${Date.now()}`);
  const second = await context.newPage();
  await second.goto("/survey");
  await expect(second.getByRole("button", { name: "All synced" })).toBeVisible();

  // The first tab's request never answers, then the tab is closed.
  await page.route("**/survey/spots/*/seating", () => {});
  await page.goto(`/survey/spots/${spot.id}/seating`);
  await page.getByRole("textbox", { name: "Seats" }).fill("77");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Syncing 1" })).toBeVisible();
  await page.close();

  // No reload: the second tab's recheck timer (15 s) finds the dead tab's write.
  await expect(second.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 45_000 });
  expect((await getSpot(await tokenOf(second), spot.id)).seat_count).toBe(77);
});
