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

/** Each bootstrap invite works once, so tests take the next unused one. */
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

/** Pins the phone's clock to the server's start time; it then ticks normally. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: new Date(serverState().now) });
    await use(page);
  },
});
export { expect };
