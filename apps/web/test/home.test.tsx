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

test("the list is headed by the active filter", async () => {
  renderRoute(testApp({ spots: [PUBLISHED, STALE] }), "/survey");
  const heading = await screen.findByRole("heading", { level: 2, name: t("home.group.all") });
  expect(heading.className).toContain("group-heading");
  for (const filter of ["attention", "drafts", "due"] as const) {
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${t(`home.filter.${filter}`)}`) }),
    );
    expect(screen.getByRole("heading", { level: 2, name: t(`home.group.${filter}`) })).toBeTruthy();
  }
});

test("a teammate's unreviewed spot needs attention and lists by oldest check", async () => {
  renderRoute(testApp({ spots: [PUBLISHED, STALE] }), "/survey");
  fireEvent.click(await screen.findByRole("button", { name: /^Needs you/ }));
  const attention = screen.getByRole("region", { name: t("home.group.attention") });
  expect(within(attention).getByText(t("home.fact.unreviewed", { name: "Jordan" }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^All \d/ }));
  const all = screen.getByRole("region", { name: t("home.group.all") });
  expect(within(all).getByText("Jan 2")).toBeTruthy();
  // The published spot with an attention fact still shows when it was checked.
  expect(within(all).getByText(t("home.checked", { date: "Sep 1" }))).toBeTruthy();
});

test("a draft made offline shows under Drafts with its step count", async () => {
  const app = testApp();
  app.network.set(false);
  renderRoute(app, "/survey");
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Basement Carrels" }));
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: local, payload: POWER }, null);
  fireEvent.click(await screen.findByRole("button", { name: /^Drafts/ }));
  const drafts = screen.getByRole("region", { name: t("home.group.drafts") });
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
  expect(await screen.findByRole("heading", { name: t("auth.expired.title") })).toBeTruthy();
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
  const drafts = screen.getByRole("region", { name: t("home.group.drafts") });
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
const LOBBY_DRAFT = surveySpotFixture({
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
  renderRoute(testApp({ spots: [PUBLISHED, LOBBY_DRAFT, STALE, FRESH] }), "/survey");
  const all = await screen.findByRole("button", { name: /^All 4$/ });
  expect(all.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /^Drafts 1$/ }));
  const drafts = screen.getByRole("region", { name: t("home.group.drafts") });
  expect(within(drafts).getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^Drafts 1$/ }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Due 1$/ }));
  const due = screen.getByRole("region", { name: t("home.group.due") });
  expect(within(due).getByText("Melville Old Lounge")).toBeTruthy();
  expect(within(due).queryByText("Fresh Room")).toBeNull();
});

test("search narrows the rows and the counts", async () => {
  renderRoute(testApp({ spots: [PUBLISHED, STALE, FRESH] }), "/survey");
  const box = await screen.findByRole("searchbox", { name: t("home.search.label") });
  fireEvent.change(box, { target: { value: "melv" } });
  const all = screen.getByRole("region", { name: t("home.group.all") });
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
  const app = testApp({ spots: [LOBBY_DRAFT] });
  renderRoute(app, "/survey");
  await app.deps.started;
  await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: LOBBY_DRAFT.id, payload: POWER },
    LOBBY_DRAFT.version,
  );
  await act(async () => {
    app.deps.queryClient.setQueryData(keys.spot(LOBBY_DRAFT.id), LOBBY_DRAFT);
  });
  expect(await screen.findByRole("link", { name: /Keep going.*Union Lobby Tables/ })).toBeTruthy();
  expect(screen.getByText("Next: Seating · 1 left")).toBeTruthy();
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

const COVER_ID = "5b0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a21";
const withCover = (over: { approved: boolean }) =>
  surveySpotFixture({
    id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a02",
    slug: "covered",
    official_name: "Covered Lounge",
    status: "published",
    verified: { identity: "2026-09-01T15:00:00.000Z" },
    photos: [
      {
        id: COVER_ID,
        spot_id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a02",
        url: null,
        taken_at: "2026-09-01T15:00:00.000Z",
        is_cover: true,
        uploaded_by: null,
        approved: over.approved,
        approved_at: over.approved ? "2026-09-02T15:00:00.000Z" : null,
      },
    ],
  });

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest("a");
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
}

test("a spot with an approved cover shows its thumbnail once loaded; without one, text only", async () => {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requested.push(url);
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 });
  });
  // jsdom has no object URLs; put these on for this test only.
  const had = { create: "createObjectURL" in URL, revoke: "revokeObjectURL" in URL };
  URL.createObjectURL = () => "blob:cover";
  URL.revokeObjectURL = () => {};
  try {
    renderRoute(testApp({ spots: [withCover({ approved: true }), PUBLISHED] }), "/survey");
    await screen.findByText("Covered Lounge");
    await waitFor(() => expect(rowOf("Covered Lounge").querySelector("img.thumb")).not.toBeNull());
    expect(rowOf("SAC Lounge").querySelector("img")).toBeNull();
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(`/survey/photos/${COVER_ID}/image`);
    // A filter change unmounts and remounts the row: the bytes come from the cache.
    fireEvent.click(screen.getByRole("button", { name: /^Drafts \d/ }));
    await waitFor(() => expect(screen.queryByText("Covered Lounge")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /^All \d/ }));
    await waitFor(() => expect(rowOf("Covered Lounge").querySelector("img.thumb")).not.toBeNull());
    expect(requested).toHaveLength(1);
  } finally {
    if (!had.create) Reflect.deleteProperty(URL, "createObjectURL");
    if (!had.revoke) Reflect.deleteProperty(URL, "revokeObjectURL");
    vi.unstubAllGlobals();
  }
});

test("a row's cover query starting does not update Home while a thumbnail renders", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 }),
  );
  try {
    renderRoute(testApp({ spots: [withCover({ approved: true })] }), "/survey");
    await screen.findByText("Covered Lounge");
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
  } finally {
    errors.mockRestore();
    vi.unstubAllGlobals();
  }
});

test("a cover that is not approved is never asked for", async () => {
  const fetchSpy = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchSpy);
  try {
    renderRoute(testApp({ spots: [withCover({ approved: false })] }), "/survey");
    await screen.findByText("Covered Lounge");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelector("img.thumb")).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("while a cover loads, offline, or missing, the row is text only with no error", async () => {
  for (const answer of [
    () => new Promise<Response>(() => {}),
    () => Promise.reject(new Error("network down")),
    () => Promise.resolve(new Response(null, { status: 404 })),
  ]) {
    vi.stubGlobal("fetch", answer);
    try {
      const { unmount } = renderRoute(
        testApp({ spots: [withCover({ approved: true })] }),
        "/survey",
      );
      await screen.findByText("Covered Lounge");
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.querySelector("img")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(rowOf("Covered Lounge").textContent).not.toMatch(/unavailable|error/i);
      unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  }
});

test("the sync sheet lists each waiting change as a row with its spot link", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  await app.deps.outbox.createSpot(identity());
  renderRoute(app, "/survey");
  fireEvent.click(await screen.findByRole("button", { name: t("sync.short.offline") }));
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  const rows = within(sheet).getAllByRole("listitem");
  expect(rows).toHaveLength(1);
  expect(within(rows[0] as HTMLElement).getByRole("link", { name: /Open spot/ })).toBeTruthy();
});
