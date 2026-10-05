import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCopyDeck, renderCopyModule } from "./copyDeck.ts";

const deck = fileURLToPath(new URL("../../../docs/design/surveyor-copy.md", import.meta.url));
const out = fileURLToPath(new URL("../src/copy/copy.gen.ts", import.meta.url));
const rows = parseCopyDeck(readFileSync(deck, "utf8"));
writeFileSync(out, renderCopyModule(rows));
console.log(`wrote ${rows.length} strings to ${out}`);
