import { writeFileSync } from "node:fs";
import { tokens } from "@perch/ui-logic";
import { themeCss } from "../src/ui/theme.ts";

/** Writes apps/web/src/ui/tokens.css. A Vitest test fails when it is out of date. */
writeFileSync(new URL("../src/ui/tokens.css", import.meta.url), themeCss(tokens));
