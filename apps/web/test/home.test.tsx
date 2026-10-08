import { t } from "@study-spot/ui-logic";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity, POWER } from "../../../packages/ui-logic/test/builders.ts";
import { keys } from "../src/app/keys.ts";
import { readHomeState } from "../src/lib/homeState.ts";
import { ME, renderRoute, TOKEN, testApp } from "./harness.tsx";

const PUBLISHED = surveySpotFixture({
  id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a01",
  slug: "sac-lounge",
  official_name: "SAC Lounge",
  status: "published",
  review_state: "unreviewed",
  last_edited_by: "2c1e5b7a-0c2d-4f5e-9a1b-3c4d5e6f7a8b",
  last_edited_by_name: "Jordan",
  verified: { identity: "2026-09-01T15:00:00.000Z" },
});

test("first run with nothing on the server explains what a spot is", async () => {
  renderRoute(testApp(), "/survey");
  expect(await screen.findByText(t("home.empty.title"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Needs you/ }));
  expect(screen.getByText(t("home.empty.attention"))).toBeTruthy();
});

test("a teammate's unreviewed spot needs attention and lists by oldest check", async () => {
  renderRoute(testApp({ spots: [PUBLISHED, STALE] }), "/survey");
  fireEvent.click(await screen.findByRole("button", { name: /^Needs you/ }));
  const attention = screen.getByRole("region", { name: t("home.filter.attention") });
  expect(within(attention).getByText(t("home.fact.unreviewed", { name: "Jordan" }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^All \d/ }));
  const all = screen.getByRole("region", { name: t("home.filter.all") });
  expect(within(all).getByText("Jan 2")).toBeTruthy();
});

test("a draft made offline shows under Drafts with its step count", async () => {
  const app = testApp();
  app.network.set(false);
  renderRoute(app, "/survey");
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Basement Carrels" }));
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: local, payload: POWER }, null);
  fireEvent.click(await screen.findByRole("button", { name: /^Drafts/ }));
  const drafts = screen.getByRole("region", { name: t("home.filter.drafts") });
  expect(await within(drafts).findByText("Basement Carrels")).toBeTruthy();
  expect(within(drafts).getByText(t("home.fact.progress", { done: 2, total: 6 }))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("sync.short.offline") })).toBeTruthy();
});

test("the sync sheet lists changes on the phone and warns about other phones", async () => {
  const app = testApp();
  app.network.set(false);
  renderRoute(app, "/survey");
  await app.deps.started;
  await app.deps.outbox.createSpot(identity({ official_name: "Basement Carrels" }));
  fireEvent.click(await screen.findByRole("button", { name: t("sync.short.offline") }));
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  expect(within(sheet).getByText(t("sync.offline"))).toBeTruthy();
  expect(
    within(sheet).getByText(
      t("sync.sheet.item_pending", { what: t("sync.what.create", { name: "Basement Carrels" }) }),
    ),
  ).toBeTruthy();
  expect(within(sheet).getByText(t("sync.sheet.local_only"))).toBeTruthy();
  expect(within(sheet).getByText(t("sync.sheet.other_phone_warning"))).toBeTruthy();
});

test("an unreadable stored change is counted, listed, and can be discarded", async () => {
  const app = testApp();
  await app.cache.set("outbox:w:broken", "{not json");
  renderRoute(app, "/survey");
  const banner = await screen.findByRole("status");
  expect(within(banner).getByText(t("home.unreadable_one"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("sync.short.unreadable", { count: 1 }) }));
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  fireEvent.click(await within(sheet).findByRole("button", { name: t("common.discard") }));
  fireEvent.click(await screen.findByRole("button", { name: t("failed.discard") }));
  await waitFor(() => expect(app.deps.outbox.getSnapshot().unreadable).toBe(0));
  expect(await app.cache.get("outbox:w:broken")).toBeNull();
});

test("the sync sheet never says everything is on the server while unreadable writes exist", async () => {
  const app = testApp();
  await app.cache.set("outbox:w:broken", "{not json");
  vi.spyOn(app.deps.outbox, "unreadableKeys").mockRejectedValue(new Error("idb down"));
  renderRoute(app, "/survey");
  fireEvent.click(
    await screen.findByRole("button", { name: t("sync.short.unreadable", { count: 1 }) }),
  );
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  expect(within(sheet).queryByText(t("sync.sheet.empty"))).toBeNull();
});

test("a 401 on the list shows Sign in again and keeps queued changes", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  await app.deps.outbox.createSpot(identity());
  app.server.unauthorized = true;
  app.network.set(true);
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("auth.expired.title"))).toBeTruthy();
  expect(app.deps.outbox.getSnapshot().records).toHaveLength(1);
});

test("with no session on this phone, survey screens ask to sign in again", async () => {
  renderRoute(testApp({ me: null }), "/survey");
  expect(await screen.findByText(t("auth.expired.body"))).toBeTruthy();
});

test("first run offline with nothing cached says the list needs a connection", async () => {
  const app = testApp();
  app.server.offline = true;
  app.network.set(false);
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("home.offline_first"))).toBeTruthy();
  expect(screen.queryByText(t("home.empty.title"))).toBeNull();
});

test("after joining, focus lands on the home screen's main area", async () => {
  const app = testApp({ me: null });
  const original = app.server.send.bind(app.server);
  vi.spyOn(app.server, "send").mockImplementation(async (req) =>
    req.url.endsWith("/auth/accept")
      ? { status: 200, text: JSON.stringify({ token: TOKEN, surveyor: ME }) }
      : original(req),
  );
  const view = renderRoute(app, `/invite/${"b".repeat(43)}`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("invite.name.label") }), {
    target: { value: "Ana" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  await screen.findByRole("heading", { name: t("home.title") });
  await waitFor(() => expect(document.activeElement?.tagName).toBe("MAIN"));
  const main = document.activeElement as HTMLElement;
  expect(within(main).getByRole("searchbox", { name: t("home.search.label") })).toBeTruthy();
});

test("a draft's step count appears when its detail reaches the cache later", async () => {
  const DRAFT = surveySpotFixture({
    id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a02",
    slug: "quiet-nook",
    official_name: "Quiet Nook",
    status: "draft",
  });
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, "/survey");
  fireEvent.click(await screen.findByRole("button", { name: /^Drafts/ }));
  const drafts = screen.getByRole("region", { name: t("home.filter.drafts") });
  expect(await within(drafts).findByText("Quiet Nook")).toBeTruthy();
  expect(within(drafts).queryByText(/^\d\/6$/)).toBeNull();
  expect(within(drafts).getByText(t("home.fact.draft"))).toBeTruthy();
  await act(async () => {
    app.deps.queryClient.setQueryData(keys.spot(DRAFT.id), DRAFT);
  });
  expect(await within(drafts).findByText(/^\d\/6$/)).toBeTruthy();
});

test("the unsynced-changes banner goes away once the queue syncs", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  await app.deps.outbox.createSpot(identity());
  renderRoute(app, "/survey");
  const text = t("sync.leave_warning_one");
  expect(await screen.findByText(text)).toBeTruthy();
  app.network.set(true);
  await act(async () => {
    await app.deps.outbox.syncNow();
  });
  await waitFor(() => expect(screen.queryByText(text)).toBeNull());
});

test("the unsynced-changes banner does not wait for the first sync pass to end", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  await app.deps.outbox.createSpot(identity());
  // A pass that never ends (a slow first send): the banner follows the loaded queue, not `started`.
  app.deps = { ...app.deps, started: new Promise<void>(() => {}) };
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("sync.leave_warning_one"))).toBeTruthy();
});

const OTHER_EDITOR = "2c1e5b7a-0c2d-4f5e-9a1b-3c4d5e6f7a8b";
const CONFLICT_DRAFT = surveySpotFixture({
  id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a03",
  slug: "union-lobby",
  official_name: "Union Lobby Tables",
  status: "draft",
  seat_count: null,
  missing: ["seat_count"],
});
const STALE = surveySpotFixture({
  id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a04",
  slug: "old-lounge",
  official_name: "Melville Old Lounge",
  status: "published",
  review_state: "reviewed",
  last_edited_by: OTHER_EDITOR,
  verified: { identity: "2026-01-02T15:00:00.000Z" },
});
const FRESH = surveySpotFixture({
  id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a05",
  slug: "fresh-room",
  official_name: "Fresh Room",
  status: "published",
  review_state: "reviewed",
  last_edited_by: OTHER_EDITOR,
  verified: { identity: new Date().toISOString() },
});

test("filter chips switch the list and show counts", async () => {
  renderRoute(testApp({ spots: [PUBLISHED, CONFLICT_DRAFT, STALE, FRESH] }), "/survey");
  const all = await screen.findByRole("button", { name: /^All 4$/ });
  expect(all.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /^Drafts 1$/ }));
  const drafts = screen.getByRole("region", { name: t("home.filter.drafts") });
  expect(within(drafts).getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^Drafts 1$/ }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Due/ }));
  const due = screen.getByRole("region", { name: t("home.filter.due") });
  expect(within(due).queryByText("Fresh Room")).toBeNull();
});

test("search narrows the rows and the counts", async () => {
  renderRoute(testApp({ spots: [PUBLISHED, STALE, FRESH] }), "/survey");
  const box = await screen.findByRole("searchbox", { name: t("home.search.label") });
  fireEvent.change(box, { target: { value: "melv" } });
  const all = screen.getByRole("region", { name: t("home.filter.all") });
  expect(within(all).getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^All 1$/ })).toBeTruthy();
  fireEvent.change(box, { target: { value: "zzz" } });
  expect(screen.getByText(t("home.empty.search"))).toBeTruthy();
});

test("filter and search come back after leaving Home", async () => {
  const app = testApp({ spots: [PUBLISHED, STALE] });
  const first = renderRoute(app, "/survey");
  fireEvent.click(await screen.findByRole("button", { name: /^Due/ }));
  fireEvent.change(screen.getByRole("searchbox", { name: t("home.search.label") }), {
    target: { value: "old" },
  });
  first.unmount();
  renderRoute(app, "/survey");
  const due = await screen.findByRole("button", { name: /^Due/ });
  expect(due.getAttribute("aria-pressed")).toBe("true");
  expect(
    (screen.getByRole("searchbox", { name: t("home.search.label") }) as HTMLInputElement).value,
  ).toBe("old");
});

test("keep going names the draft and what is next", async () => {
  const app = testApp({ spots: [CONFLICT_DRAFT] });
  renderRoute(app, "/survey");
  await app.deps.started;
  await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: CONFLICT_DRAFT.id, payload: POWER },
    CONFLICT_DRAFT.version,
  );
  await act(async () => {
    app.deps.queryClient.setQueryData(keys.spot(CONFLICT_DRAFT.id), CONFLICT_DRAFT);
  });
  expect(await screen.findByRole("link", { name: /Keep going.*Union Lobby Tables/ })).toBeTruthy();
  expect(screen.getByText(/Next: Seating · \d left/)).toBeTruthy();
});

test("home state reads only a known filter and a short query", () => {
  expect(readHomeState(JSON.stringify({ filter: "due", query: "melv" }))).toEqual({
    filter: "due",
    query: "melv",
  });
  for (const raw of [
    null,
    "",
    "{",
    JSON.stringify({ filter: "nope", query: "" }),
    JSON.stringify({ filter: "all", query: 3 }),
  ]) {
    expect(readHomeState(raw)).toEqual({ filter: "all", query: "" });
  }
});
