import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Layout problems on the current page: sideways overflow, hit areas under
 * 44 x 44 px (a control's absolutely positioned ::before counts as its hit
 * area), and clipped text outside deliberate one-line `.truncate` ellipses.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth)
      out.push(`overflow ${doc.scrollWidth - doc.clientWidth}px`);
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const skip = (el: Element) =>
      el.closest(".visually-hidden, [inert], dialog:not([open]), [aria-hidden='true']") !== null;
    const targets = document.querySelectorAll<HTMLElement>(
      'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, label:has(> input)',
    );
    for (const el of targets) {
      if (!shown(el) || skip(el)) continue;
      if (el.matches("input") && el.closest("label") !== null) continue;
      if (el.matches("p a, li > span a")) continue; // inline text links are exempt (WCAG 2.5.8)
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      const b = getComputedStyle(el, "::before");
      if (b.content !== "none" && b.position === "absolute") {
        const grow = (v: string) => Math.max(0, -Number.parseFloat(v) || 0);
        w += grow(b.left) + grow(b.right);
        h += grow(b.top) + grow(b.bottom);
      }
      if (w < 43.5 || h < 43.5)
        out.push(`target ${Math.round(w)}x${Math.round(h)} ${describe(el)}`);
    }
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (!shown(el) || skip(el)) continue;
      const s = getComputedStyle(el);
      if (s.overflowX === "visible" || s.overflowX === "auto" || s.overflowX === "scroll") continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (el.classList.contains("truncate") && el.clientWidth >= 64) continue;
      // A text input holding a long value scrolls it by design; that is not clipped copy.
      if (el instanceof HTMLInputElement) continue;
      out.push(`clipped ${describe(el)}`);
    }
    return out;
  });
}

export const WIDTHS = [375, 768, 1440] as const;

/** Loads each route at three widths in both themes; asserts no layout problems and no axe violations. */
export async function expectRoutesClean(page: Page, routes: readonly string[]): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    // The boot script reads this on every load, so each goto below paints in this theme.
    await page.evaluate((t) => localStorage.setItem("perch.theme", t), theme);
    for (const route of routes) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const where = `${route} @${width} ${theme}`;
        expect(await layoutProblems(page), where).toEqual([]);
        const axe = await new AxeBuilder({ page }).analyze();
        expect(
          axe.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`,
          ),
          where,
        ).toEqual([]);
      }
    }
  }
}
