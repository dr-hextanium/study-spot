import { t } from "@perch/ui-logic";
import { expect, signIn, test } from "./fixtures.ts";
import { expectRoutesClean } from "./layout.ts";

test("a student phone has no Surveyor tools row", async ({ page }) => {
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: t("student.me.title"), level: 1 })).toBeVisible();
  await expect(page.getByText(t("student.me.surveyor"))).toHaveCount(0);
});

test("a surveyor phone shows Surveyor tools and it opens /survey", async ({ page }) => {
  await signIn(page);
  await page.goto("/me");
  await page.getByRole("link", { name: t("student.me.surveyor") }).click();
  await expect(page).toHaveURL(/\/survey$/);
  await expect(page.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();
});

test("the dark theme chosen on Me survives a reload", async ({ page }) => {
  await page.goto("/me");
  await page.getByRole("radio", { name: t("theme.dark") }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Me is clean at three widths in both themes", async ({ page }) => {
  await page.goto("/me");
  await expectRoutesClean(page, ["/me"]);
});
