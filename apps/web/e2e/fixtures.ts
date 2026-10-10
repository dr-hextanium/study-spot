import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";
import { z } from "zod";
import { E2E_STATE } from "../playwright.config.ts";

const State = z.object({
  publishDir: z.string(),
  invites: z.array(z.url()),
  now: z.iso.datetime(),
});
export type ServerState = z.infer<typeof State>;

export function serverState(): ServerState {
  return State.parse(JSON.parse(readFileSync(E2E_STATE, "utf8")));
}

/**
 * Each bootstrap invite works once, so tests take the next unused one. The
 * counter is a plain file read and written without a lock: it is only safe
 * because playwright.config.ts runs with workers: 1.
 */
export function nextInvite(): string {
  const state = serverState();
  const counter = `${E2E_STATE}.used`;
  const used = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
  const url = state.invites[used];
  if (url === undefined) throw new Error("out of e2e invites; raise E2E_INVITES");
  writeFileSync(counter, String(used + 1));
  return url;
}

/** Opens an admin invite and signs this page in. Returns the surveyor's name. */
export async function signIn(page: Page): Promise<string> {
  const url = new URL(nextInvite());
  await page.goto(`${url.pathname}${url.search}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();
  return url.pathname;
}

/** Pins a page's clock to the server's start time (E2E_NOW); it then ticks normally. */
export async function pinClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(serverState().now) });
}

/**
 * Waits until the service worker controls this page, so a reload offline is served from
 * its cache. The first load can finish before the worker claims it: reload once then.
 */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  await expect
    .poll(controlled, { timeout: 5_000 })
    .toBe(true)
    .catch(async () => {
      await page.reload();
      await expect.poll(controlled, { timeout: 10_000 }).toBe(true);
    });
}

/**
 * Overrides `page` so each test's browser clock starts at the server's E2E_NOW.
 * Pages from `browser.newContext()` do not go through this fixture: call
 * `pinClock` on them.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await pinClock(page);
    await use(page);
  },
});
export { expect };
