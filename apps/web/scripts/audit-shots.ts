import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, chromium, type Page } from "@playwright/test";
import { call, completeSpot, draftSpot, tokenOf } from "../e2e/api.ts";
import { bigJpeg } from "../e2e/photo.ts";

/**
 * Audit sweep: signed in, each screen at each viewport and color scheme.
 * Usage: node scripts/audit-shots.ts <stateFile> <outDir>
 * Not committed: a helper for the Task 16 audit.
 */
const WEB = process.env.VERIFY_WEB ?? "http://localhost:4173";
const [stateFile, out] = process.argv.slice(2);
if (stateFile === undefined || out === undefined) throw new Error("usage");
const state: { invites: string[] } = JSON.parse(readFileSync(stateFile, "utf8"));
let next = Number(process.env.AUDIT_INVITE ?? "5");
mkdirSync(out, { recursive: true });

async function signIn(page: Page) {
  const invite = state.invites[next++];
  if (invite === undefined) throw new Error("out of invites");
  await page.goto(invite);
  await page.getByRole("button", { name: /^(Join|Sign in)$/ }).click();
  await page.waitForURL("**/survey");
  await page.waitForLoadState("networkidle");
}

const report: string[] = [];
async function check(page: Page, label: string) {
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const axe = await new AxeBuilder({ page }).analyze();
  const small = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary',
      ),
    ];
    return els
      .map((el) => {
        const target = el.matches('input[type="radio"], input[type="checkbox"]')
          ? (el.closest("label") ?? el)
          : el;
        const r = target.getBoundingClientRect();
        const cs = getComputedStyle(target);
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden") return null;
        if (r.width >= 44 && r.height >= 44) return null;
        return `${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}] ${Math.round(r.width)}x${Math.round(r.height)}`;
      })
      .filter((s): s is string => s !== null);
  });
  const issues = axe.violations.map(
    (v) =>
      `${v.id}(${v.impact ?? "?"}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 4)
        .join("; ")}`,
  );
  report.push(
    `${label} | overflow ${overflow} | axe ${issues.length > 0 ? issues.join(" || ") : "ok"} | <44: ${small.length > 0 ? small.join(", ") : "none"}`,
  );
}
async function shot(page: Page, name: string, tag: string) {
  await page.screenshot({ path: join(out as string, `${tag}-${name}.png`) });
  await check(page, `${tag} ${name}`);
}

async function seed(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: WEB });
  const page = await ctx.newPage();
  await signIn(page);
  const token = await tokenOf(page);
  const blocked = await draftSpot(token, "Audit Blocked");
  const ready = await completeSpot(token, "Audit Ready");
  const pub = await completeSpot(token, "Audit Published", { publish: true });
  const conflict = await completeSpot(token, "Audit Conflict", { publish: true });
  // A pending photo, with bytes.
  const jpeg = await bigJpeg(page, 1200, 900);
  for (const spot of [ready, pub]) {
    const form = new FormData();
    form.set("spot_id", spot.id);
    form.set("client_write_id", randomUUID());
    form.set("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "a.jpg");
    const res = await fetch("http://127.0.0.1:8787/survey/photos", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`photo ${res.status} ${await res.text()}`);
  }
  await ctx.close();
  return { token, blocked, ready, pub, conflict };
}

const browser = await chromium.launch();
const data = await seed(browser);
const viewports = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
] as const;
for (const vp of viewports) {
  for (const scheme of ["light", "dark"] as const) {
    const tag = `${vp.width}-${scheme}`;
    const ctx = await browser.newContext({ baseURL: WEB, viewport: vp, colorScheme: scheme });
    const page = await ctx.newPage();
    await signIn(page);
    await page.waitForTimeout(1500);
    await shot(page, "home", tag);
    await page.goto("/survey/spots/new");
    await page.waitForLoadState("networkidle");
    await shot(page, "new", tag);
    const spots: [string, string][] = [
      ["blocked", data.blocked.id],
      ["ready", data.ready.id],
      ["published", data.pub.id],
    ];
    for (const [n, id] of spots) {
      await page.goto(`/survey/spots/${id}`);
      await page.waitForLoadState("networkidle");
      await shot(page, `overview-${n}`, tag);
    }
    for (const section of ["access", "hours", "estimates", "photos", "seating"]) {
      await page.goto(`/survey/spots/${data.ready.id}/${section}`);
      await page.waitForLoadState("networkidle");
      await shot(page, section, tag);
    }
    // Sync sheet
    await page.goto("/survey");
    await page.waitForLoadState("networkidle");
    await page.locator(".band button").last().click();
    await shot(page, "sync-sheet", tag);
    // Conflict
    await page.goto(`/survey/spots/${data.conflict.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /^Seating / }).click();
    await ctx.setOffline(true);
    await page.getByRole("textbox", { name: "Seats" }).fill("11");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const fresh = await call(data.token, "GET", `/survey/spots/${data.conflict.id}`);
    const version = (fresh as { version: number }).version;
    await call(data.token, "PUT", `/survey/spots/${data.conflict.id}/seating`, {
      client_write_id: randomUUID(),
      base_version: version,
      data: {
        seat_count: 20 + (next % 50),
        seat_types: [],
        table_configs: [],
        effective_capacity: null,
        max_group_size: null,
        spread_out_room: null,
      },
    });
    await ctx.setOffline(false);
    const open = page.getByRole("button", { name: "Open the conflict", exact: true });
    await open.waitFor({ timeout: 60000 }).catch(() => undefined);
    await shot(page, "overview-conflict", tag);
    if (await open.isVisible()) {
      await open.click();
      await shot(page, "conflict-sheet", tag);
    }
    await page.goto("/survey/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await shot(page, "admin", tag);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(out, "report.txt"), `${report.join("\n")}\n`);
console.log(report.join("\n"));
