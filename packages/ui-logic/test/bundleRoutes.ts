import { makeBundleFixture } from "../../core/test/fixtures/bundle-v1.ts";

export const BASE = "https://cdn.example/data/sbu";
export const HASH_A = "a1b2c3d4e5f60718";
export const HASH_B = "b1b2c3d4e5f60718";

export const pointerJson = (schema_version = 1, hash = HASH_A): string =>
  JSON.stringify({
    schema_version,
    hash,
    url: `bundle.${hash}.json`,
    generated_at: "2026-10-13T18:00:00.000Z",
  });

export const okText = (text: string): { status: number; text: string } => ({ status: 200, text });

/** Routes for a pointer at `hash` and the fixture bundle behind it. */
export function routesFor(hash: string): Map<string, { status: number; text: string }> {
  return new Map([
    [`${BASE}/bundle-latest.json`, okText(pointerJson(1, hash))],
    [`${BASE}/bundle.${hash}.json`, okText(JSON.stringify(makeBundleFixture()))],
  ]);
}
