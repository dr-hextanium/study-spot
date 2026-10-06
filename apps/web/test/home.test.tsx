import { t } from "@study-spot/ui-logic";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity, POWER } from "../../../packages/ui-logic/test/builders.ts";
import { keys } from "../src/app/keys.ts";
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
  expect(screen.getByText(t("home.attention.empty"))).toBeTruthy();
});

test("a teammate's unreviewed spot needs attention and lists by oldest check", async () => {
  renderRoute(testApp({ spots: [PUBLISHED] }), "/survey");
  const attention = await screen.findByRole("region", { name: t("home.attention.title") });
  expect(
    within(attention).getByText(t("home.attention.unreviewed", { name: "Jordan" })),
  ).toBeTruthy();
  const stale = screen.getByRole("region", { name: t("home.stale.title") });
  expect(within(stale).getByText(t("home.stale.row", { date: "Sep 1" }))).toBeTruthy();
});

test("a draft made offline shows under Drafts with its required-part count", async () => {
  const app = testApp();
  app.network.set(false);
  renderRoute(app, "/survey");
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Basement Carrels" }));
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: local, payload: POWER }, null);
  const drafts = await screen.findByRole("region", { name: t("home.drafts.title") });
  expect(await within(drafts).findByText("Basement Carrels")).toBeTruthy();
  expect(within(drafts).getByText(t("home.drafts.row", { count: 2 }))).toBeTruthy();
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
  const attention = await screen.findByRole("region", { name: t("home.attention.title") });
  expect(await within(attention).findByText(t("home.unreadable_one"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("sync.short.unreadable", { count: 1 }) }));
  const sheet = await screen.findByRole("dialog", { name: t("sync.sheet.title") });
  fireEvent.click(await within(sheet).findByRole("button", { name: t("common.discard") }));
  fireEvent.click(await screen.findByRole("button", { name: t("failed.discard") }));
  await waitFor(() => expect(app.deps.outbox.getSnapshot().unreadable).toBe(0));
  expect(await app.cache.get("outbox:w:broken")).toBeNull();
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
  expect(within(main).getByText(t("home.attention.title"))).toBeTruthy();
});

test("a draft's required-part count appears when its detail reaches the cache later", async () => {
  const DRAFT = surveySpotFixture({
    id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a02",
    slug: "quiet-nook",
    official_name: "Quiet Nook",
    status: "draft",
  });
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, "/survey");
  const drafts = await screen.findByRole("region", { name: t("home.drafts.title") });
  expect(await within(drafts).findByText("Quiet Nook")).toBeTruthy();
  expect(within(drafts).queryByText(/required parts done/)).toBeNull();
  await act(async () => {
    app.deps.queryClient.setQueryData(keys.spot(DRAFT.id), DRAFT);
  });
  expect(await within(drafts).findByText(/of 7 required parts done/)).toBeTruthy();
});
