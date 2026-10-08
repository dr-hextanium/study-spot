import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";

/**
 * Visual verification loop for the surveyor PWA against a running dev server.
 * Signs in with an invite from the preview server's state file, then for each
 * route and width: console errors, horizontal overflow, a screenshot, and axe.
 * Usage: node scripts/verify-ui.ts <stateFile> [route ...]
 */
const WEB = process.env.VERIFY_WEB ?? "http://localhost:5299";
const OUT = join(import.meta.dirname, "../../../.claude/tmp/screenshots");
const WIDTHS = [375, 768, 1440] as const;

const [stateFile, ...args] = process.argv.slice(2);
if (stateFile === undefined) throw new Error("usage: verify-ui.ts <stateFile> [route ...]");
const state: unknown = JSON.parse(readFileSync(stateFile, "utf8"));
const invites =
  typeof state === "object" && state !== null && "invites" in state && Array.isArray(state.invites)
    ? state.invites.filter((u): u is string => typeof u === "string")
    : [];
const used = Number(process.env.VERIFY_INVITE ?? "1");
const invite = invites[used];
if (invite === undefined) throw new Error(`no invite at index ${used}`);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: WEB });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
    errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

await page.goto(invite);
await page.getByRole("button", { name: /^(Join|Sign in)$/ }).click();
await page.waitForURL("**/survey");
await page.waitForLoadState("networkidle");

async function firstSpot(p: Page): Promise<string | null> {
  const href = await p.locator('a[href^="/survey/spots/"]').first().getAttribute("href");
  return href;
}
const routes = args.length > 0 ? args : ["/survey", "/survey/spots/new", "/survey/admin"];
if (args.length === 0) {
  const spot = await firstSpot(page);
  if (spot !== null) routes.push(spot, `${spot}/seating`);
}

let failed = false;
for (const route of routes) {
  for (const width of WIDTHS) {
    errors.length = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const name = `${route.replaceAll("/", "_").replace(/^_/, "") || "root"}@${width}.png`;
    await page.screenshot({ path: join(OUT, name), animations: "disabled" });
    const axe = await new AxeBuilder({ page }).analyze();
    const issues = axe.violations.map(
      (v) => `${v.id} (${v.impact ?? "?"}) at ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`,
    );
    const ok = errors.length === 0 && overflow <= 0 && issues.length === 0;
    if (!ok) failed = true;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${route} @${width}: console ${errors.length}, overflow ${overflow}px, axe ${issues.length}${issues.length > 0 ? ` [${issues.join(", ")}]` : ""}${errors.length > 0 ? ` console: ${errors.join(" | ")}` : ""}`,
    );
  }
}
await browser.close();
console.log(`screenshots: ${OUT}`);
process.exitCode = failed ? 1 : 0;
