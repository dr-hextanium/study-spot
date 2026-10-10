import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const statements = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../drizzle/${name}`, import.meta.url)), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

test("0006 swaps the spot_photo foreign key without queueing live queries behind it", () => {
  const s = statements("0006_spot_photo_restrict.sql");
  // A lock it cannot get within 5 s fails the migration instead of blocking every query.
  expect(s[0]).toBe("SET lock_timeout = '5s';");
  expect(s.at(-1)).toBe("RESET lock_timeout;");
  const add = s.find((x) => x.includes("ADD CONSTRAINT"));
  expect(add).toContain("ON DELETE restrict");
  expect(add).toContain("NOT VALID");
  expect(s.some((x) => x.includes('VALIDATE CONSTRAINT "spot_photo_spot_id_spot_id_fk"'))).toBe(
    true,
  );
});
