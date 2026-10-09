import { t } from "@study-spot/ui-logic";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { SEATING } from "../../../packages/ui-logic/test/builders.ts";
import { ME, renderRoute, testApp } from "./harness.tsx";

const ADMIN = { ...ME, role: "admin" as const };
const RILEY = {
  id: "5f0c7d1e-1c2b-4a3d-9e8f-7a6b5c4d3e2f",
  display_name: "Riley",
  role: "surveyor" as const,
  active: true,
};

async function openActions(name: string) {
  const list = await screen.findByRole("region", { name: t("admin.surveyors.title") });
  fireEvent.click(
    await within(list).findByRole("button", { name: t("admin.surveyor.actions", { name }) }),
  );
  return screen.findByRole("dialog", { name });
}

test("only admins reach the admin screen, and home links to it for them", async () => {
  const view = renderRoute(testApp(), "/survey/admin");
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(screen.queryByRole("link", { name: t("home.admin") })).toBeNull();

  renderRoute(testApp({ me: ADMIN }), "/survey");
  expect(await screen.findByRole("link", { name: t("home.admin") })).toBeTruthy();
});

test("an admin creates an invite link and copies it", async () => {
  const app = testApp({ me: ADMIN });
  renderRoute(app, "/survey/admin");
  fireEvent.click(await screen.findByRole("radio", { name: t("admin.invite.role.admin") }));
  fireEvent.click(screen.getByRole("button", { name: t("admin.invite.create") }));
  expect(await screen.findByText(t("admin.invite.created"))).toBeTruthy();
  expect(app.server.admin.invites).toEqual([{ role: "admin" }]);
  fireEvent.click(screen.getByRole("button", { name: t("admin.invite.copy") }));
  expect(await screen.findByText(t("admin.invite.copied"))).toBeTruthy();
});

test("a new sign-in link keeps the surveyor's role, and removing access asks first", async () => {
  const app = testApp({ me: ADMIN });
  app.server.admin.surveyors.push({ ...ADMIN }, { ...RILEY });
  renderRoute(app, "/survey/admin");
  const sheet = await openActions("Riley");
  fireEvent.click(within(sheet).getByRole("button", { name: t("admin.invite.relogin") }));
  expect(
    await screen.findByText(t("admin.invite.relogin.created", { name: "Riley" })),
  ).toBeTruthy();
  expect(app.server.admin.invites).toEqual([{ role: "surveyor", surveyor_id: RILEY.id }]);
  fireEvent.click(within(sheet).getByRole("button", { name: t("admin.revoke") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("admin.revoke.confirm.title", { name: "Riley" }),
  });
  fireEvent.click(within(confirm).getByRole("button", { name: t("admin.revoke.confirm.action") }));
  expect(await screen.findByText(t("admin.revoke.done", { name: "Riley" }))).toBeTruthy();
  expect(app.server.admin.surveyors.find((s) => s.id === RILEY.id)?.active).toBe(false);
});

test("a surveyor row shows the name and role, with actions behind one button", async () => {
  const app = testApp({ me: ADMIN });
  const name = "Riley Okafor-Lindqvist";
  app.server.admin.surveyors.push({ ...ADMIN }, { ...RILEY, display_name: name, role: "admin" });
  renderRoute(app, "/survey/admin");
  const label = await screen.findByText(name);
  const row = label.closest("li");
  if (row === null) throw new Error("no row");
  expect(within(row).getByText(t("admin.surveyors.admin_badge")).className).toContain("pill");
  expect(within(row).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(within(row).getByRole("button", { name: t("admin.surveyor.actions", { name }) }));
  const sheet = await screen.findByRole("dialog", { name });
  expect(within(sheet).getByRole("button", { name: t("admin.invite.relogin") })).toBeTruthy();
  expect(within(sheet).getByRole("button", { name: t("admin.revoke") })).toBeTruthy();
});

test("publish status reads the server's warnings in the deck's words, and Publish now runs it", async () => {
  const sac = surveySpotFixture({ slug: "sac-lounge", official_name: "SAC Lounge" });
  const app = testApp({ me: ADMIN, spots: [sac] });
  app.server.admin.warnings.push("skipped sac-lounge: missing directions");
  renderRoute(app, "/survey/admin");
  expect(await screen.findByText(t("admin.publish.never"))).toBeTruthy();
  expect(await screen.findByText("SAC Lounge: missing How to get there")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("admin.publish.now") }));
  expect(await screen.findByText(t("admin.publish.clean"))).toBeTruthy();
});

test("never published and nothing dirty: no Up to date, the spots waiting instead", async () => {
  const live = surveySpotFixture({ status: "published", version: 3 });
  const draft = surveySpotFixture({ id: "6f1d1a2e-6c55-4b5b-8b0e-0d7f4f5c1a09", status: "draft" });
  const app = testApp({ me: ADMIN, spots: [live, draft] });
  app.server.admin.neverDirty = true;
  renderRoute(app, "/survey/admin");
  expect(await screen.findByText(t("admin.publish.never"))).toBeTruthy();
  expect(await screen.findByText(t("admin.publish.first"))).toBeTruthy();
  expect(screen.queryByText(t("admin.publish.clean"))).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("admin.publish.now") }));
  expect(await screen.findByText(t("admin.publish.clean"))).toBeTruthy();
  expect(screen.queryByText(t("admin.publish.first"))).toBeNull();
});

test("offline, admin actions are disabled with the reason", async () => {
  const app = testApp({ me: ADMIN });
  app.network.set(false);
  renderRoute(app, "/survey/admin");
  expect(await screen.findByText(t("error.network_admin"))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("admin.invite.create") })).toHaveProperty(
    "disabled",
    true,
  );
});

test("approving or rejecting a photo adopts the spot, so a queued write is not a conflict", async () => {
  const spot = surveySpotFixture({ status: "published", version: 3 });
  const photo = {
    id: "8c1f0a52-7a0e-4f55-9b8e-2f1d3c4b5a69",
    spot_id: spot.id,
    url: null,
    taken_at: "2026-10-12T18:00:00.000Z",
    is_cover: false,
    uploaded_by: null,
    approved: false,
    approved_at: null,
    spot_name: spot.official_name,
    uploaded_by_name: "Riley",
  };
  const app = testApp({ me: ADMIN, spots: [spot] });
  app.server.admin.photos.push(photo, { ...photo, id: "9d2f1b63-8b1f-4066-8c9f-3a2e4d5c6b7a" });
  await app.deps.started;
  app.deps.outbox.stop();
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  renderRoute(app, "/survey/admin");
  const approve = await screen.findAllByRole("button", { name: t("admin.photos.approve") });
  fireEvent.click(approve[0] as HTMLElement);
  expect(await screen.findByText(t("photos.approve.done"))).toBeTruthy();
  await waitFor(() => expect(app.server.inner.spot(spot.id).version).toBe(4));
  const reject = await screen.findByRole("button", { name: t("admin.photos.reject") });
  fireEvent.click(reject);
  const confirm = await screen.findByRole("dialog", { name: t("admin.photos.reject") });
  fireEvent.click(within(confirm).getByRole("button", { name: t("admin.photos.reject") }));
  await waitFor(() => expect(app.server.inner.spot(spot.id).version).toBe(5));
  await act(async () => {
    app.deps.outbox.resume();
    await app.deps.outbox.idle();
  });
  await waitFor(() => expect(app.deps.outbox.getSnapshot().records).toEqual([]));
  expect(app.server.inner.spot(spot.id).version).toBe(6);
});

test("a double tap on Approve approves the photo once", async () => {
  const spot = surveySpotFixture({ status: "published", version: 3 });
  const app = testApp({ me: ADMIN, spots: [spot] });
  app.server.admin.photos.push({
    id: "8c1f0a52-7a0e-4f55-9b8e-2f1d3c4b5a69",
    spot_id: spot.id,
    url: null,
    taken_at: "2026-10-12T18:00:00.000Z",
    is_cover: false,
    uploaded_by: null,
    approved: false,
    approved_at: null,
    spot_name: spot.official_name,
    uploaded_by_name: "Riley",
  });
  let open: () => void = () => undefined;
  app.server.admin.reviewGate = new Promise<void>((r) => {
    open = r;
  });
  renderRoute(app, "/survey/admin");
  const approve = await screen.findByRole("button", { name: t("admin.photos.approve") });
  fireEvent.click(approve);
  fireEvent.click(approve);
  open();
  expect(await screen.findByText(t("photos.approve.done"))).toBeTruthy();
  expect(app.server.admin.reviews).toBe(1);
  expect(screen.queryByText(t("error.generic"))).toBeNull();
});

function withShare(app: ReturnType<typeof testApp>, result: "copied" | "shared" | "failed") {
  const share = vi.fn(async () => result);
  Object.assign(app.deps, { share: { share } });
  return share;
}

test("Copy link says copied only when it was copied", async () => {
  const app = testApp({ me: ADMIN });
  const share = withShare(app, "shared");
  renderRoute(app, "/survey/admin");
  fireEvent.click(await screen.findByRole("button", { name: t("admin.invite.create") }));
  fireEvent.click(await screen.findByRole("button", { name: t("admin.invite.copy") }));
  // The share call has answered and its continuation has run: only then is "no toast" meaningful.
  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  await act(async () => {
    await share.mock.results[0]?.value;
  });
  expect(screen.queryByText(t("admin.invite.copied"))).toBeNull();
  expect(screen.queryByText(t("admin.invite.copy_failed"))).toBeNull();
});

test("a failed copy tells the admin to copy by hand", async () => {
  const app = testApp({ me: ADMIN });
  withShare(app, "failed");
  renderRoute(app, "/survey/admin");
  fireEvent.click(await screen.findByRole("button", { name: t("admin.invite.create") }));
  fireEvent.click(await screen.findByRole("button", { name: t("admin.invite.copy") }));
  expect(await screen.findByText(t("admin.invite.copy_failed"))).toBeTruthy();
  expect(screen.queryByText(t("admin.invite.copied"))).toBeNull();
});

test("a failed Publish now shows an error", async () => {
  const app = testApp({ me: ADMIN });
  app.server.admin.publishFails = true;
  renderRoute(app, "/survey/admin");
  fireEvent.click(await screen.findByRole("button", { name: t("admin.publish.now") }));
  expect(await screen.findByText(t("error.generic"))).toBeTruthy();
});

test("a double tap on Create link issues one invite", async () => {
  const app = testApp({ me: ADMIN });
  let open: () => void = () => undefined;
  app.server.admin.inviteGate = new Promise<void>((r) => {
    open = r;
  });
  renderRoute(app, "/survey/admin");
  const create = await screen.findByRole("button", { name: t("admin.invite.create") });
  fireEvent.click(create);
  fireEvent.click(create);
  open();
  expect(await screen.findByText(t("admin.invite.created"))).toBeTruthy();
  expect(app.server.admin.invites).toHaveLength(1);
});

test("a double tap on New sign-in link issues one invite", async () => {
  const app = testApp({ me: ADMIN });
  app.server.admin.surveyors.push({ ...ADMIN }, { ...RILEY });
  let open: () => void = () => undefined;
  app.server.admin.inviteGate = new Promise<void>((r) => {
    open = r;
  });
  renderRoute(app, "/survey/admin");
  const sheet = await openActions("Riley");
  const link = within(sheet).getByRole("button", { name: t("admin.invite.relogin") });
  fireEvent.click(link);
  fireEvent.click(link);
  open();
  expect(
    await screen.findByText(t("admin.invite.relogin.created", { name: "Riley" })),
  ).toBeTruthy();
  expect(app.server.admin.invites).toHaveLength(1);
});

test("removing access clears that surveyor's shown sign-in link", async () => {
  const app = testApp({ me: ADMIN });
  app.server.admin.surveyors.push({ ...ADMIN }, { ...RILEY });
  renderRoute(app, "/survey/admin");
  const sheet = await openActions("Riley");
  fireEvent.click(within(sheet).getByRole("button", { name: t("admin.invite.relogin") }));
  const note = t("admin.invite.relogin.created", { name: "Riley" });
  expect(await screen.findByText(note)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: t("admin.revoke") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("admin.revoke.confirm.title", { name: "Riley" }),
  });
  fireEvent.click(within(confirm).getByRole("button", { name: t("admin.revoke.confirm.action") }));
  expect(await screen.findByText(t("admin.revoke.done", { name: "Riley" }))).toBeTruthy();
  expect(screen.queryByText(note)).toBeNull();
});

test("the invite section names itself once: the segmented label is for screen readers only", async () => {
  renderRoute(testApp({ me: ADMIN }), "/survey/admin");
  const group = await screen.findByRole("group", { name: t("admin.invite.title") });
  const legend = group.querySelector("legend");
  expect(legend?.className).toContain("visually-hidden");
  const heading = screen.getByRole("heading", { name: t("admin.invite.title") });
  expect(heading.className).not.toContain("visually-hidden");
});

test("a pending photo whose image did not load says so instead of showing an empty box", async () => {
  const spot = surveySpotFixture({ status: "published", version: 3 });
  const app = testApp({ me: ADMIN, spots: [spot] });
  app.server.admin.photos.push({
    id: "8c1f0a52-7a0e-4f55-9b8e-2f1d3c4b5a69",
    spot_id: spot.id,
    url: null,
    taken_at: "2026-10-12T18:00:00.000Z",
    is_cover: false,
    uploaded_by: null,
    approved: false,
    approved_at: null,
    spot_name: spot.official_name,
    uploaded_by_name: "Riley",
  });
  vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
  try {
    renderRoute(app, "/survey/admin");
    expect(await screen.findByText(t("photos.unavailable"))).toBeTruthy();
    expect(t("photos.unavailable")).toBe("Image unavailable");
  } finally {
    vi.unstubAllGlobals();
  }
});
