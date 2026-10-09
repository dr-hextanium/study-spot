import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { API_ORIGIN } from "../playwright.config.ts";
import { call, completeSpot, draftSpot, getSpot, surveyorInvite, tokenOf } from "./api.ts";
import { expect, pinClock, signIn, test } from "./fixtures.ts";
import { layoutProblems } from "./layout.ts";
import { bigJpeg, GPS_MARK, jpegMarkers, withExif } from "./photo.ts";

async function saveSection(page: Page): Promise<void> {
  const before = page.url();
  await page.getByRole("button", { name: /^Save( and next)?$/ }).click();
  await expect(page).not.toHaveURL(before);
  // Save and next lands on the next editor; these flows want the overview, so step back to it.
  if (/\/survey\/spots\/[^/]+\/[a-z_]+$/.test(page.url())) {
    await page.getByRole("link", { name: "Back" }).click();
  }
  await expect(page).toHaveURL(/\/survey\/spots\/[^/]+$/);
}

/**
 * An open sheet at phone, tablet and laptop widths: no layout problems, axe clean.
 * Set SHEET_SHOTS to a folder to keep a screenshot of each (animations off).
 */
async function checkSheet(page: Page, label: string): Promise<void> {
  const shots = process.env.SHEET_SHOTS;
  const back = page.viewportSize();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".sheet[open]").waitFor();
    expect(await layoutProblems(page), `${label} @${width}`).toEqual([]);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.map((v) => v.id),
      `${label} @${width}`,
    ).toEqual([]);
    if (shots !== undefined)
      await page.screenshot({ path: `${shots}/${label}-${width}.png`, animations: "disabled" });
  }
  if (back !== null) await page.setViewportSize(back);
}

async function openSection(page: Page, name: string): Promise<void> {
  // Row names start with the section, then its state ("Access Missing Never checked").
  await page.getByRole("link", { name: new RegExp(`^${name} `) }).click();
}

test("acceptance 1: a spot made offline with every required field and a photo syncs and publishes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.getByRole("link", { name: "New spot" }).click();
  await expect(page.getByRole("searchbox", { name: "Building" })).toBeVisible();
  await page.context().setOffline(true);

  const name = `Offline Corner ${Date.now()}`;
  await page.getByRole("searchbox", { name: "Building" }).fill("melv");
  await page.getByRole("button", { name: "Melville Library" }).click();
  await page.getByRole("textbox", { name: "Floor" }).fill("2");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "How to get there" }).fill("Main doors, stairs to 2.");
  await page.getByRole("button", { name: "Create spot" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();

  await openSection(page, "Access");
  await page.getByRole("radio", { name: "Any student" }).check();
  await saveSection(page);
  await openSection(page, "Seating");
  await page.getByRole("textbox", { name: "Seats" }).fill("40");
  await saveSection(page);
  await openSection(page, "Power and signal");
  await page.getByRole("textbox", { name: "Seats near an outlet" }).fill("60");
  await saveSection(page);
  await openSection(page, "Noise and feel");
  await page.getByRole("radio", { name: "Quiet", exact: true }).check();
  await saveSection(page);
  await openSection(page, "House rules");
  await page.getByRole("radio", { name: "Covered drinks" }).check();
  await page.getByRole("group", { name: "Group work" }).getByRole("radio", { name: "No" }).check();
  await saveSection(page);
  await openSection(page, "Hours");
  await page.getByRole("button", { name: /^Mon,/ }).click();
  await page
    .getByRole("group", { name: "Mon" })
    .getByRole("radio", { name: "Hours", exact: true })
    .check();
  await page.getByRole("button", { name: "Copy Monday to weekdays" }).click();
  await saveSection(page);

  // Choose is gated by the postcard checklist, so go through it as a surveyor does.
  await openSection(page, "Photos");
  const photo = withExif(await bigJpeg(page));
  await page.getByRole("button", { name: "Choose from library" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Got it" }).click();
  await (await chooser).setFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByText("Not synced yet", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Publish queued. It goes live after this phone syncs." }),
  ).toBeVisible();
  await expect(page.getByText("Publish queued", { exact: true })).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".meta").getByText("Published", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  const token = await tokenOf(page);
  const server = await getSpot(token, id);
  expect(server.status).toBe("published");
  expect(server.missing).toEqual([]);
  expect(server.hours.filter((h) => !h.is_exam)).toHaveLength(5);
  expect(server.photos).toHaveLength(1);

  // The stored photo: a JPEG at most 1600 px on its longest side and 1.5 MB, with no EXIF.
  const photoId = server.photos[0]?.id ?? "";
  const res = await fetch(`${API_ORIGIN}/survey/photos/${photoId}/image`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.ok).toBe(true);
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(bytes.length).toBeLessThanOrEqual(1_500_000);
  // No APP1 segment (EXIF, XMP) anywhere in the marker walk, not just no "Exif" string.
  expect(jpegMarkers(bytes)).not.toContain(0xe1);
  expect(bytes.includes(Buffer.from(GPS_MARK, "binary"))).toBe(false);
  const size = await page.evaluate(async (b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: "image/jpeg" }));
    return [bitmap.width, bitmap.height];
  }, bytes.toString("base64"));
  expect(size).toEqual([1600, 1200]);
});

test("acceptance 4: a conflicting edit from two phones resolves both ways", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Two Phones ${Date.now()}`);
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phoneB = await other.newPage();
  await pinClock(phoneB);
  await signIn(phoneB);
  for (const p of [page, phoneB]) await p.goto(`/survey/spots/${spot.id}`);
  await expect(phoneB.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();

  // In-app navigation, as on a phone: an offline reload is covered in finish.e2e.ts.
  const edit = async (p: Page, seats: string) => {
    await openSection(p, "Seating");
    await p.getByRole("textbox", { name: "Seats" }).fill(seats);
    await saveSection(p);
  };

  // Keep mine: phone B's offline edit wins over phone A's.
  await other.setOffline(true);
  await edit(phoneB, "11");
  await edit(page, "22");
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  // The sync sheet lists the waiting edit while phone B is offline.
  await phoneB.getByRole("button", { name: /Offline|waiting/ }).click();
  await expect(phoneB.getByRole("dialog", { name: "Changes on this phone" })).toBeVisible();
  await checkSheet(phoneB, "sync");
  await phoneB.getByRole("button", { name: "Close" }).click();
  await other.setOffline(false);
  await expect(
    phoneB.getByText("Someone else changed this spot. Pick which version to keep.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });
  await phoneB.getByRole("button", { name: "Open the conflict", exact: true }).click();
  await expect(
    phoneB.getByRole("region", { name: "Yours" }).getByText("11", { exact: true }),
  ).toBeVisible();
  await expect(
    phoneB.getByRole("region", { name: "On the server" }).getByText("22", { exact: true }),
  ).toBeVisible();
  await checkSheet(phoneB, "conflict");
  await phoneB.getByRole("button", { name: "Keep mine" }).click();
  await expect(phoneB.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await getSpot(await tokenOf(page), spot.id)).seat_count).toBe(11);

  // Keep theirs: phone A's edit stays and B's is dropped. A first loads B's kept version.
  await page.reload();
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  await other.setOffline(true);
  await edit(phoneB, "33");
  await edit(page, "44");
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  await other.setOffline(false);
  await phoneB
    .getByRole("button", { name: "Open the conflict", exact: true })
    .click({ timeout: 60_000 });
  await phoneB.getByRole("button", { name: "Keep theirs" }).click();
  await expect(phoneB.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await getSpot(await tokenOf(page), spot.id)).seat_count).toBe(44);
  await other.close();
});

test("acceptance 3: a second surveyor can mark a spot reviewed; the one who edited it cannot", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const admin = await tokenOf(page);
  const join = async (name: string) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await context.newPage();
    await pinClock(p);
    await p.goto(await surveyorInvite(admin));
    await p.getByRole("textbox", { name: "Your name" }).fill(name);
    await p.getByRole("button", { name: "Join" }).click();
    await expect(p.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();
    return { context, page: p };
  };
  const editor = await join("Riley Editor");
  const reviewer = await join("Sam Reviewer");
  const spot = await completeSpot(await tokenOf(editor.page), `Review Rule ${Date.now()}`, {
    publish: true,
  });

  await editor.page.goto(`/survey/spots/${spot.id}`);
  await expect(
    editor.page.getByText("You edited this last, so someone else reviews it.", { exact: true }),
  ).toBeVisible();
  await expect(editor.page.getByRole("button", { name: "Looks right" })).toBeHidden();

  await reviewer.page.goto(`/survey/spots/${spot.id}`);
  await reviewer.page.getByRole("button", { name: "Looks right" }).click();
  await expect(reviewer.page.getByRole("button", { name: "Marked reviewed" })).toBeVisible();
  await expect.poll(async () => (await getSpot(admin, spot.id)).review_state).toBe("reviewed");
  // The server enforces it too: the last editor's own review call is refused.
  const latest = await getSpot(admin, spot.id);
  await expect(
    call(await tokenOf(editor.page), "POST", `/survey/spots/${spot.id}/review`, {
      client_write_id: randomUUID(),
      base_version: latest.version,
    }),
  ).rejects.toThrow(/403/);
  await editor.context.close();
  await reviewer.context.close();
});

test("a 60-character spot name at 360 px wraps in the large title and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  const name = `Graduate Reading Room North Wing Lower Level ${Date.now()}`.padEnd(60, "x");
  const spot = await draftSpot(await tokenOf(page), name);
  await page.goto(`/survey/spots/${spot.id}`);
  const title = page.getByRole("heading", { name, level: 1 });
  await expect(title).toBeVisible();
  const [overflow, clipped] = await title.evaluate((el) => [
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    el.scrollWidth > el.clientWidth,
  ]);
  expect(overflow).toBe(0);
  // The large title wraps, so the whole name stays readable instead of clipping (spec 5).
  expect(clipped).toBe(false);
  await expect(page.getByRole("button", { name: "All synced" })).toBeInViewport();
  // Blockers are 44 px links that stay inside the screen.
  // aria-disabled is not "enabled" to Playwright's click, so press it the way a keyboard does.
  await page.getByRole("button", { name: "Publish", exact: true }).focus();
  await page.keyboard.press("Enter");
  const blockers = page.locator(".blockers a");
  await expect(blockers.first()).toBeVisible();
  for (const box of await blockers.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { height: r.height, right: r.right, left: r.left };
    }),
  )) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(360);
  }
});

test("the guided walk checks each section in turn and ends on the overview with a toast", async ({
  page,
}) => {
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Walk ${Date.now()}`);
  await page.goto(`/survey/spots/${spot.id}`);
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("link", { name: /Check each section/ }).click();
  await expect(page).toHaveURL(/\/identity\?walk=1$/);
  for (const section of ["access", "seating", "power", "environment", "use_fit"]) {
    await page.getByRole("button", { name: "Nothing changed" }).click();
    await expect(page).toHaveURL(new RegExp(`/${section}\\?walk=1$`));
  }
  // Six quick checks queue six writes. Let them reach the server first: a last check that is
  // still queued after the settle wait honestly says "saved on this phone" instead.
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Nothing changed" }).click();
  await expect(page).toHaveURL(new RegExp(`/survey/spots/${spot.id}$`));
  await expect(page.getByText("Checked 6 sections", { exact: true })).toBeVisible();
});
