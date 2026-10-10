import { t } from "@study-spot/ui-logic";
import { act, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { ME, renderRoute, testApp } from "./harness.tsx";

/** A gate a test opens by hand. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** The loading state is a skeleton: busy, announced politely in deck words, and never data. */
function expectSkeleton() {
  const busy = document.querySelector('[aria-busy="true"]');
  expect(busy).not.toBeNull();
  expect(busy?.querySelector(".skel")).not.toBeNull();
  // The mist blocks are not read out.
  expect(busy?.querySelector('.skel:not([aria-hidden="true"] .skel)')).toBeNull();
  // The polite status is beside the busy region, so the busy region does not hold it back.
  const status = screen.getAllByRole("status").find((el) => el.textContent === t("common.loading"));
  expect(status).toBeTruthy();
  expect(status?.closest('[aria-busy="true"]')).toBeNull();
}

test("an overview not on this phone yet shows its skeleton, then the spot", async () => {
  const spot = surveySpotFixture();
  const app = testApp({ spots: [spot] });
  const g = gate();
  app.server.admin.spotGate = g.promise;
  renderRoute(app, `/survey/spots/${spot.id}`);
  await waitFor(() => expectSkeleton());
  expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  // No stand-in screen with another title or a bare "Loading" line.
  expect(screen.queryByText(t("nav.back_to_spots"))).toBeNull();
  act(() => g.open());
  expect(await screen.findByRole("heading", { level: 1, name: spot.official_name })).toBeTruthy();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});

test("a section editor not on this phone yet keeps its real title over a skeleton", async () => {
  const spot = surveySpotFixture();
  const app = testApp({ spots: [spot] });
  const g = gate();
  app.server.admin.spotGate = g.promise;
  renderRoute(app, `/survey/spots/${spot.id}/seating`);
  await waitFor(() => expectSkeleton());
  expect(screen.getByRole("heading", { level: 1, name: t("section.seating.name") })).toBeTruthy();
  act(() => g.open());
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
});

test("home before its first list shows skeleton rows", async () => {
  const app = testApp({ spots: [surveySpotFixture()] });
  const g = gate();
  app.server.admin.listGate = g.promise;
  renderRoute(app, "/survey");
  expect(await screen.findByRole("heading", { level: 1, name: t("home.title") })).toBeTruthy();
  await waitFor(() => expectSkeleton());
  act(() => g.open());
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  expect(document.querySelector(".row")).not.toBeNull();
});

test("home offline with no list: the offline line, no skeleton", async () => {
  const app = testApp({ spots: [surveySpotFixture()] });
  app.network.set(false);
  app.server.offline = true;
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("home.offline_first"))).toBeTruthy();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});

test("admin: surveyors load behind skeleton rows", async () => {
  const app = testApp({ me: { ...ME, role: "admin" } });
  const g = gate();
  app.server.admin.surveyorsGate = g.promise;
  renderRoute(app, "/survey/admin");
  expect(await screen.findByRole("heading", { level: 1, name: t("admin.title") })).toBeTruthy();
  await waitFor(() => expectSkeleton());
  act(() => g.open());
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
});

test("focus on the screen stays put when the overview skeleton gives way to the spot", async () => {
  const spot = surveySpotFixture();
  const app = testApp({ spots: [spot] });
  const g = gate();
  app.server.admin.spotGate = g.promise;
  renderRoute(app, `/survey/spots/${spot.id}`);
  await waitFor(() => expectSkeleton());
  const main = document.querySelector("main");
  expect(main).not.toBeNull();
  act(() => main?.focus());
  act(() => g.open());
  expect(await screen.findByRole("heading", { level: 1, name: spot.official_name })).toBeTruthy();
  expect(document.querySelector("main")).toBe(main);
  expect(document.activeElement).toBe(main);
});

test("admin says Loading once, for the whole screen, while any section loads", async () => {
  const app = testApp({ me: { ...ME, role: "admin" } });
  const g = gate();
  app.server.admin.surveyorsGate = g.promise;
  renderRoute(app, "/survey/admin");
  await waitFor(() => {
    const said = screen
      .getAllByRole("status")
      .filter((el) => el.textContent === t("common.loading"));
    expect(said).toHaveLength(1);
    expect(said[0]?.closest("section")).toBeNull();
  });
  act(() => g.open());
  await waitFor(() =>
    expect(
      screen.queryAllByRole("status").filter((el) => el.textContent === t("common.loading")),
    ).toHaveLength(0),
  );
});

test("focus on the screen stays on main when the editor skeleton gives way to the editor", async () => {
  const spot = surveySpotFixture();
  const app = testApp({ spots: [spot] });
  const g = gate();
  app.server.admin.spotGate = g.promise;
  renderRoute(app, `/survey/spots/${spot.id}/seating`);
  await waitFor(() => expectSkeleton());
  act(() => document.querySelector("main")?.focus());
  expect(document.activeElement?.tagName).toBe("MAIN");
  act(() => g.open());
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  expect(document.activeElement).toBe(document.querySelector("main"));
});
