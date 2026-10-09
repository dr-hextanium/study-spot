import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/**
 * Renders the PNG app icons from public/icons/icon.svg (a Newsreader P outlined
 * for Perch) with headless Chromium. Run after changing the SVG: `node apps/web/e2e/render-icons.ts`. The PNGs are committed.
 */
const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, "utf8");
const targets = [
  { file: "icon-192.png", size: 192, inset: 0 },
  { file: "icon-512.png", size: 512, inset: 0 },
  { file: "apple-touch-icon.png", size: 180, inset: 0 },
  // Maskable: the mark sits inside the 80% safe zone on the same paper ground.
  { file: "icon-512-maskable.png", size: 512, inset: 0.1 },
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const pad = Math.round(t.size * t.inset);
  await page.setContent(
    `<body style="margin:0;background:#FBFAF9"><div style="padding:${pad}px">${svg.replace(
      "<svg ",
      `<svg width="${t.size - pad * 2}" height="${t.size - pad * 2}" style="display:block" `,
    )}</div></body>`,
  );
  writeFileSync(`${dir}${t.file}`, await page.screenshot({ type: "png" }));
}
await browser.close();
writeFileSync(
  `${dir}PROVENANCE.txt`,
  "icon.svg: Newsreader P (SIL OFL 1.1) outlined for Perch, Seawolf palette; no third-party artwork.\n" +
    "PNG icons: rendered from icon.svg by apps/web/e2e/render-icons.ts (headless Chromium).\n",
);
console.log(`rendered ${targets.length} icons into ${dir}`);
