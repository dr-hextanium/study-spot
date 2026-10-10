import { t } from "@perch/ui-logic";
import { act, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderRoute, testApp } from "./harness.tsx";

async function open(path: string) {
  const view = renderRoute(testApp({ me: null }), path);
  await act(async () => {
    await view.router.load();
  });
  return view;
}

test("/ is the student Home with the tab bar", async () => {
  await open("/");
  expect(
    await screen.findByRole("heading", { level: 1, name: t("student.home.title") }),
  ).toBeTruthy();
  const nav = screen.getByRole("navigation", { name: t("student.nav.label") });
  const home = within(nav).getByRole("link", { name: t("student.nav.home") });
  expect(within(nav).getByRole("link", { name: t("student.nav.browse") })).toBeTruthy();
  expect(within(nav).getByRole("link", { name: t("student.nav.me") })).toBeTruthy();
  expect(home.getAttribute("aria-current")).toBe("page");
});

test("/browse marks Browse as the current tab", async () => {
  await open("/browse");
  const nav = await screen.findByRole("navigation", { name: t("student.nav.label") });
  expect(
    within(nav)
      .getByRole("link", { name: t("student.nav.browse") })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    within(nav)
      .getByRole("link", { name: t("student.nav.home") })
      .getAttribute("aria-current"),
  ).toBeNull();
});

test("/me renders its title", async () => {
  await open("/me");
  expect(
    await screen.findByRole("heading", { level: 1, name: t("student.me.title") }),
  ).toBeTruthy();
});

test("/survey has no tab bar and still shows the signed-out screen", async () => {
  await open("/survey");
  expect(await screen.findByRole("heading", { name: t("auth.expired.title") })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: t("student.nav.label") })).toBeNull();
});

test("an unknown address leads back to Home", async () => {
  await open("/nope");
  const home = await screen.findByRole("link", { name: t("student.notfound.back") });
  expect(home.getAttribute("href")).toBe("/");
});

test("an unknown survey address leads back to the spots, without the tab bar", async () => {
  await open("/survey/nope");
  const back = await screen.findByRole("link", { name: t("nav.back_to_spots") });
  expect(back.getAttribute("href")).toBe("/survey");
  expect(screen.queryByRole("navigation", { name: t("student.nav.label") })).toBeNull();
});

test("the spot route renders and parses via=pick", async () => {
  const view = await open("/spot/quiet-carrels?via=pick");
  expect(await screen.findByRole("navigation", { name: t("student.nav.label") })).toBeTruthy();
  expect(view.router.state.location.search).toEqual({ via: "pick" });
});
