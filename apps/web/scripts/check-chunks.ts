/**
 * Guards the map's cost: MapLibre must sit in its own lazy chunk, out of the entry
 * chunk and out of the service worker's precache.
 *
 * Usage: node scripts/check-chunks.ts <build dir>   (default: dist)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist";
const fail = (message: string): never => {
  console.error(`check-chunks: ${message}`);
  process.exit(1);
};

const assets = join(dir, "assets");
if (!existsSync(assets)) fail(`${assets} does not exist; build first`);
const jsFiles = readdirSync(assets).filter((f) => f.endsWith(".js"));
const holders = jsFiles.filter((f) => readFileSync(join(assets, f), "utf8").includes("maplibregl"));
if (holders.length === 0) fail("no chunk contains maplibregl; did the map get dropped?");

const html = readFileSync(join(dir, "index.html"), "utf8");
const entries = [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const inEntry = holders.filter((f) => entries.includes(f));
if (inEntry.length > 0) fail(`maplibregl is in the entry chunk: ${inEntry.join(", ")}`);

const sw = readFileSync(join(dir, "sw.js"), "utf8");
const lazyCss = readdirSync(assets).filter((f) => f.endsWith(".css") && /^MapView-/.test(f));
const precached = [...holders, ...lazyCss].filter((f) => sw.includes(f));
if (precached.length > 0) fail(`the service worker precaches the map: ${precached.join(", ")}`);

// The build's own warning limit is raised for the map chunk, so the entry gets its own cap.
const ENTRY_MAX_KB = 900;
for (const f of entries) {
  if (f !== undefined && statSync(join(assets, f)).size / 1000 > ENTRY_MAX_KB) {
    fail(`entry chunk ${f} is over ${ENTRY_MAX_KB} kB`);
  }
}

const kb = (f: string): string => `${(statSync(join(assets, f)).size / 1024).toFixed(0)} kB`;
const entrySizes = entries.map((f) => `${f} ${kb(f ?? "")}`);
console.log(`check-chunks: OK. Map chunk: ${holders.map((f) => `${f} ${kb(f)}`).join(", ")}.`);
console.log(`Entry: ${entrySizes.join(", ")}. Map CSS: ${lazyCss.join(", ") || "none"}.`);
